// Shared state and helpers for the friends' app views: the scaled plan, the clock, the plan's maths
// (logic-core.js), the save path, dialogs and small DOM builders. Views live in js/views/; main.js
// owns the router and the page chrome and fills in `hooks`.
//
// Every number comes from the scaled plan or logic-core.js. The only actions shown are the plan's own
// written rules; prices are information only.
//
// A friend's amounts and mix can differ by month (months.js). Every change to them goes through one path,
// commitPlanChange, which refuses any change that would alter a month the friend's records fix.

import * as ui from "./ui.js?v=2.1.0";
import * as L from "./logic-core.js?v=2.1.0";
import { fmtMoney, fmtBaht, beforeJoin } from "./scale.js?v=2.1.0";
import { store, hasLogged, withDefaults } from "./store.js?v=2.1.0";
import { prices } from "./prices.js?v=2.1.0";
import * as M from "./months.js?v=2.1.0";

export const { h, clear, icon, pill, toast } = ui;
export { ui, L, store, prices, M };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const svg = (tag, props = {}, ...kids) => h(tag, { ...props, svg: true }, ...kids);

/** Module-local app state; the friend's records live in store. */
export const app = {
  base: null, // data/base-plan.json
  plan: null, // the base plan scaled to the friend's amounts and mix (scale.js, through months.js)
  planKey: "",
  planError: null,
  planInputs: true, // false when app.plan had to be worked out from the dollars alone (an amount as typed did not give them)
  instMap: {},
  active: null,
  cleanup: {},
  after: {},
  entering: false,
  renderingId: null,
  nowOffset: 0,
  deskDate: null,
  justFilled: null,
  todayTimer: null,
  lastDay: null,
  draft: null, // the setup form while it is being filled in
  ui: { allocMode: "group" },
  // The open data (2.0): the state of data/index.json as datafiles.loadIndex resolved it ({status: "ok" |
  // "missing" | "failed", ...}), or null before it is known; and the upcoming listings (tt-upcoming/1) or null.
  data: null,
  upcoming: null,
};

/** main.js fills these in (the router and the chrome). */
export const hooks = {
  invalidate: () => {},
  renderView: () => {},
  renderFresh: () => {},
  go: (id) => { location.hash = "#/" + id; },
  /** Where a new friend goes after the setup: Fields when the open data has a list, else Today. */
  firstRoute: () => "today",
};

/** True when the open data loaded and has a list of companies (capability universe). */
export const universeOn = () => !!(app.data && app.data.status === "ok" && app.data.index && app.data.index.capabilities
  && app.data.index.capabilities.universe === true);
/** The friend's saved fields record (plan.fields), or null. */
export const savedFields = () => {
  const p = store.get().plan;
  return p && p.fields && typeof p.fields === "object" ? p.fields : null;
};
/** True when the friend has fields saved for some month (plan.fields from a month, or a month's own pin). */
export function hasFieldMonths(planRec = store.get().plan) {
  if (!planRec || typeof planRec !== "object") return false;
  if (planRec.fields && planRec.fields.from) return true;
  return Object.values(planRec.months || {}).some((e) => e && typeof e === "object" && e.fields);
}

// ---------------------------------------------------------------- clock

/** Optional ?now=2026-11-10T16:30 (Bangkok) shifts the app clock, to look at the desk on a plan date. */
export function initNow() {
  try {
    const p = new URLSearchParams(location.search).get("now");
    if (!p) return;
    const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(p) ? p : p.length <= 10 ? p + "T09:00:00+07:00" : p + "+07:00";
    const t = Date.parse(iso);
    if (Number.isFinite(t)) app.nowOffset = t - Date.now();
  } catch { /* ignore */ }
}
export const now = () => Date.now() + app.nowOffset;
export const today = () => L.bkkDate(now());

// ---------------------------------------------------------------- state helpers

export const S = () => store.get();
export const settings = () => store.get().settings;
export const ost = (id) => store.get().orders[id] || {};

// A friend who starts after the plan has begun (plan.joinedAt): the months whose order date came before
// that day are "before you joined". Their orders count as closed (nothing to buy), their transfers as
// $0 (nothing to send), and they raise no alerts; the maths below runs on the plan without them.
const NO_JOIN = { joinedAt: null, dateIds: [], orderIds: new Set(), transferIds: new Set(), firstDateId: null };
let preMemo = { key: undefined, val: NO_JOIN };
/** scale.beforeJoin for a state's join date (the base plan's dates, which every amount shares). */
export function pre(s = store.get()) {
  const j = (s && s.plan && s.plan.joinedAt) || null;
  if (!app.base || !j) return NO_JOIN;
  if (preMemo.key !== j) preMemo = { key: j, val: beforeJoin(app.base, j) };
  return preMemo.val;
}
export const isPreOrder = (id) => pre().orderIds.has(id);
export const isPreTransfer = (id) => pre().transferIds.has(id);
export const isPreDate = (dateId) => pre().dateIds.includes(dateId);
/** Filled, skipped, or from before the friend joined: nothing left to do for it. */
export const isDone = (id) => ["filled", "skipped"].includes(ost(id).status) || isPreOrder(id);
export const instById = (id) => app.instMap[id];
/** The ticker to show for an instrument: a field company's own ticker (its id is a company id), else its id. */
export const tickerOf = (i) => (i && i.group === "fields" ? i.symbol || "" : (i && i.id) || "");
/** True for a company a friend's fields buy (not one of the $500 plan's own holdings). */
export const isFieldInst = (i) => !!i && i.group === "fields";
export const rule = (id) => app.plan.rules.find((r) => r.id === id);
export const accountLabel = (id) => (app.plan.accounts.find((a) => a.id === id) || {}).label || id;

// ---------------------------------------------------------------- the friend's months (months.js)

/** What decides the scaled plan: the usual amount and how it was typed, the month entries, the mix and the
 *  join date. main.js scales the plan again whenever this text changes. "" with no plan record. */
export const planKeyOf = (p) => (p ? JSON.stringify([p.monthlyUsd, p.input, p.months || {}, p.mix || {}, p.joinedAt || null, p.fields || null]) : "");

let fixedMemo = { s: null, base: null, all: null, joined: null };
function fixedFor(s) {
  if (fixedMemo.s !== s || fixedMemo.base !== app.base) {
    const all = app.base && s.plan ? M.fixedMonths(app.base, s) : new Map();
    const preIds = app.base && s.plan ? beforeJoin(app.base, s.plan.joinedAt).dateIds : [];
    fixedMemo = { s, base: app.base, all, joined: new Map([...all].filter(([d]) => !preIds.includes(d))) };
  }
  return fixedMemo;
}
/**
 * The joined months the friend's records fix: Map(dateId -> [{kind, id, status}]), in date order (see
 * months.fixedMonths). A month before the friend joined is left out, even when a record pins it (January's
 * coins are paid by November's money), so counts like "3 of 12 months fixed" are over the joined months.
 * Read it only; it is shared until the state changes.
 */
export const fixed = () => fixedFor(S()).joined;
/** The joined months that can still change, in date order (ids). */
export const openMonthIds = () => (app.base && S().plan ? M.openMonths(app.base, S()) : []);
/** The joined months, in date order (ids). */
export const joinedMonthIds = () => (app.base ? app.base.orderDates.map((d) => d.id).filter((d) => !pre().dateIds.includes(d)) : []);
/** True when every joined month is fixed by the friend's records: no amount or mix can change any more.
 *  (Before version 2 this meant "any record at all"; plan.lockedAt is still kept, for display only.) */
export const locked = () => !!(S().plan && app.base) && joinedMonthIds().length > 0 && openMonthIds().length === 0;

let monthsMemo = { p: null, base: null, rows: [] };
/** Every order date as the friend's plan record resolves it, in date order (months.resolveMonths):
 *  { dateId, date, usd, input, own, pinned, mix, mixPinned, preJoin, mode }. */
export function resolvedMonths() {
  const p = S().plan;
  if (!p || !app.base) return [];
  if (monthsMemo.p !== p || monthsMemo.base !== app.base) monthsMemo = { p, base: app.base, rows: M.resolveMonths(app.base, p) };
  return monthsMemo.rows;
}
/** One order date as resolved (see resolvedMonths), or null. */
export const monthOf = (dateId) => resolvedMonths().find((r) => r.dateId === dateId) || null;
/** "$500 a month", or "$300 to $500 a month" when the joined months differ ("" with no amount yet). */
export const amountWords = () => (app.base && S().plan ? M.amountWords(app.base, S().plan) : "");
/** True when the friend has a mix of their own in force (plan.mix), from plan.mixFrom on. */
export const mixIsOwn = () => !!(S().plan && S().plan.mix && Object.keys(S().plan.mix).length);
/** True when some month the friend has joined is a field month. Those months buy the friend's own companies and
 *  VWRA, so the example plan's written reasons, targets and closing-price checks do not describe them. */
export const fieldMonthsOn = () => resolvedMonths().some((r) => !r.preJoin && r.mode === "fields");
/** The friend's split as saved (plan.fields), else the last joined field month's, or null: { chosen, split, lists }. */
export function fieldsSpecNow() {
  const f = savedFields();
  if (f && f.from && Array.isArray(f.chosen) && f.chosen.length && Number.isInteger(f.split)) return f;
  const rows = resolvedMonths().filter((r) => !r.preJoin && r.mode === "fields" && r.fields);
  return rows.length ? rows[rows.length - 1].fields : null;
}

/** One plain sentence for why a change was refused (months.explainFit): a PlanFitError, a MonthChangeError,
 *  a FixedMonthError or anything else. opts.context "amount" words a VWRA shortfall for an amount screen. */
export const explain = (e, opts) => M.explainFit(e, app.plan || app.base, opts);

/** True when the plan buys the instrument on some date (it has an order), at the friend's amounts and mix. */
export const isBoughtInst = (id) => !!app.plan && app.plan.orders.some((o) => o.instrument === id);

/**
 * The example plan's holdings a getting-ready item is about, or null for an item about something else: the
 * thesis checks (every holding with a written reason) and the 27 Nov closing prices (every holding whose
 * ceiling is set by that day's close).
 */
function prepHoldings(item) {
  if (/^Thesis checks\b/.test(item.text)) return (app.plan.thesis || []).map((t) => t.instrument);
  if (/\bclosing prices\b/.test(item.text)) return (app.plan.instruments || []).filter((i) => i.ceiling && i.ceiling.type === "close_plus").map((i) => i.id);
  return null;
}

/**
 * Why a getting-ready item does not apply to this friend's plan, or null when it does. An item about getting
 * an account ready ("SwissBorg ready: ...") is not needed when the plan sends no money to that account and
 * buys nothing there (a mix with no coins). An item about some of the example plan's holdings (the thesis
 * checks, the 27 Nov closing prices) is not needed when the plan buys none of them: a friend whose fields buy
 * their own companies instead. Such an item is shown muted and left out of the counts.
 */
export function prepNotNeeded(id) {
  if (!app.plan) return null;
  const item = (app.plan.prep || []).find((p) => p.id === id);
  if (!item || typeof item.text !== "string") return null;
  for (const a of app.plan.accounts || []) {
    if (!a.label || !item.text.startsWith(a.label + " ")) continue;
    const used = app.plan.orders.some((o) => o.account === a.id) || app.plan.funding.transfers.some((t) => t.to === a.id);
    if (used) return null;
    const held = app.base ? app.base.orders.filter((o) => o.account === a.id).map((o) => (app.base.instruments.find((i) => i.id === o.instrument) || {}).group) : [];
    return held.length && held.every((g) => g === "crypto") ? "Not needed: there are no coins in your plan." : `Not needed: your plan sends nothing to ${a.label}.`;
  }
  const named = prepHoldings(item);
  if (named && named.length && !named.some((x) => isBoughtInst(x))) return "Not needed: your plan buys none of these.";
  return null;
}

let viewMemo = { plan: null, key: null, view: null };
/** app.plan without the months before the friend joined: what the money maths and progress count. */
export function joinedPlan() {
  const p = pre();
  if (!p.dateIds.length) return app.plan;
  if (viewMemo.plan !== app.plan || viewMemo.key !== p.joinedAt) {
    viewMemo = { plan: app.plan, key: p.joinedAt, view: {
      ...app.plan,
      orders: app.plan.orders.filter((o) => !p.orderIds.has(o.id)),
      funding: { ...app.plan.funding, transfers: app.plan.funding.transfers.filter((t) => !p.transferIds.has(t.id)) },
    } };
  }
  return viewMemo.view;
}

export const schedule = () => L.buildSchedule(app.plan, {});
/** The dollar-baht rate for baht figures: live (Frankfurter) when known, else the plan's. */
export const fxInfo = () => prices.fxRate(app.plan.meta.planFx);
/** Every transfer, with what was sent; one from before the friend joined is $0 and marked preJoin. */
export function funding() {
  const f = L.computeMonthlyFunding(app.plan, fxInfo().rate, S().funding);
  const p = pre();
  if (!p.transferIds.size) return f;
  const transfers = f.transfers.map((t) => (p.transferIds.has(t.id) ? { ...t, usd: 0, thb: 0, preJoin: true } : t));
  return { ...f, transfers, totalUsd: L.round2(transfers.reduce((a, t) => a + (t.usd || 0), 0)), totalThb: transfers.reduce((a, t) => a + (t.thb || 0), 0) };
}
export const carry = () => ({ monthly: true, ...L.computeMonthlyCarry(joinedPlan(), S().orders, S().funding) });
/** Orders done out of the orders that count for this friend. */
export const progressNow = () => L.progress(joinedPlan(), S().orders);
/** The plan's money over the months that count for this friend (the whole year unless they started late). */
export const joinedBudgetUsd = () => L.round2(joinedPlan().funding.transfers.reduce((a, t) => a + (t.usd || 0), 0));

// ---------------------------------------------------------------- prices

/** "2 h ago" for an ISO time or epoch ms. */
export function ago(at) {
  const ms = typeof at === "number" ? at : Date.parse(at);
  return Number.isFinite(ms) ? ui.relTime(ms / 1000, Date.now()) : "—";
}

/**
 * The price the app uses for an instrument, and where it came from:
 * coins: kind "live" (CoinGecko) or "last" (the last good answer); stocks and funds: kind "entry"
 * (typed from the friend's app) or "fill" (the price of their latest fill); "none" otherwise.
 */
export function priceInfo(i) {
  if (i.coingeckoId) {
    const q = prices.data.crypto[i.id];
    if (q && Number.isFinite(q.price)) return { price: q.price, kind: q.stale ? "last" : "live", at: q.at, changePct: q.changePct };
    return { price: null, kind: "none" };
  }
  const e = S().prices[i.id];
  if (e && Number.isFinite(e.price) && e.price > 0) return { price: e.price, kind: e.src === "fill" ? "fill" : "entry", at: e.at };
  return { price: null, kind: "none" };
}
export const priceOf = (i) => priceInfo(i).price;
/** Words for where a price came from: "live · CoinGecko", "your entry, 2 h ago", … */
export function priceSource(p) {
  switch (p.kind) {
    case "live": return `live · CoinGecko · ${ago(p.at)}`;
    case "last": return `last price we got, ${ago(p.at)}`;
    case "entry": return `your entry, ${ago(p.at)}`;
    case "fill": return `your fill price, ${ago(p.at)}`;
    default: return "no price yet";
  }
}
/** {symbol: {price}} for logic.computeHoldings. */
export function quotesForHoldings() {
  const out = {};
  for (const i of app.plan.instruments) { const p = priceOf(i); if (p != null) out[i.symbol] = { price: p }; }
  return out;
}

export function ceilingOf(i) { return L.resolveCeiling(i, settings().closes || {}, settings().ceilingOverrides || {}); }
export function orderCeiling(o) { return o.ceiling === "instrument" ? ceilingOf(instById(o.instrument)) : { kind: "none", value: null }; }

// ---------------------------------------------------------------- formatting

/** Plan money: "$1,234", or "$137.50" when there are cents. */
export const fM = fmtMoney;
/** Baht as the friend typed them: "฿5,000", or "฿5,000.50" when there are satang. */
export const fB = fmtBaht;
export const fUsd = L.fmtUsd, fThb = L.fmtThb, fPct = L.fmtPct, fInt = L.fmtInt, fNum = L.fmtNum, fPrice = L.fmtPrice;
export const long = (d) => ui.fmtDateLong(d);
export const short = (d) => ui.fmtDateShort(d);
export function inDays(n) {
  if (!Number.isFinite(n)) return "";
  return n === 0 ? "today" : n === 1 ? "tomorrow" : n === -1 ? "yesterday" : n > 0 ? `in ${n} days` : `${-n} days ago`;
}
export function parseNum(v) {
  if (v == null) return NaN;
  const s = String(v).replace(/[,\s฿$]/g, "");
  return s === "" ? NaN : Number(s);
}
export function bkkTime(ms) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
}
export const timeLabel = (o) => (o.time === "any" ? "Any time" : o.time);
export function fmtQty(i, q) {
  if (!Number.isFinite(q)) return "—";
  if (i.group === "crypto") return fNum(q, 6);
  return q % 1 ? fNum(q, 2) : fInt(q);
}
/** A worked-out coin amount to put in a field: at most 8 decimals (one satoshi), no float noise. */
export const coinQty = (q) => (Number.isFinite(q) ? Number(q.toFixed(8)) : q);
/** "1 share", "0.42 shares", "0.001523 BTC". */
export function qtyWords(i, q) {
  if (!Number.isFinite(q)) return "—";
  if (i.group === "crypto") return `${fNum(q, 6)} ${i.id}`;
  return `${q % 1 ? fNum(q, 2) : fInt(q)} share${q === 1 ? "" : "s"}`;
}
/** "November 2026"; "Nov" when short; "November" with noYear. */
export function monthName(iso, shortForm = false, noYear = false) {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00Z");
  if (noYear) return d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return d.toLocaleString("en-GB", shortForm ? { month: "short", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" });
}
/** "10 November 2026", for prose. */
export function dateWords(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d) : "—";
}
/** "Tue 10 Nov". */
export function dayShort(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d) : "—";
}
const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
export const countWord = (n) => COUNT_WORDS[n] || String(n);
export const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- plan helpers

/** A transfer's "How". "Same as November." is spelled out for a friend whose November came before they joined. */
export function howOf(t) {
  const how = (t && t.how) || "";
  if (!/^Same as November\./.test(how)) return how;
  const nov = app.plan.funding.transfers.find((x) => x.to === t.to && x.how && !/^Same as/.test(x.how));
  return nov && isPreTransfer(nov.id) ? how.replace(/^Same as November\./, nov.how) : how;
}
/**
 * The plan's notes for an order date. For a friend whose SwissBorg money (November) came before they joined,
 * a note about money waiting in the wallet is replaced by one saying the wallet holds nothing for the coins.
 */
export function dateNotesFor(dateId) {
  const notes = (app.plan.dateNotes || {})[dateId] || [];
  const s01 = app.plan.funding.transfers.find((t) => t.to === "SwissBorg");
  if (!s01 || !isPreTransfer(s01.id) || isPreDate(dateId)) return notes;
  const coins = app.plan.orders.filter((o) => o.cryptoWait && o.dateId === dateId).map((o) => instById(o.instrument).name.toLowerCase());
  const out = notes.filter((n) => !/SwissBorg wallet/i.test(n));
  if (coins.length && out.length !== notes.length) out.unshift(`Your SwissBorg wallet holds nothing for ${coins.join(" and ")}: the money for them went to SwissBorg in November, before you joined.`);
  return out;
}

/** The VWRA rule for a whole-share fund order that buys nothing, and for leftovers: the plan's leftover rule. */
export const leftoverText = () => (app.plan.differenceRules.find((r) => r.id === "leftover") || {}).text || "";
/** SwissBorg's smallest exchange, in dollars (scale.js: €5, rounded up to $6). */
export const coinMinUsd = () => (app.plan.scale && app.plan.scale.minOrderUsd && app.plan.scale.minOrderUsd.usd_amount) || 6;

/** The desk's default date: today's order date if it has open orders, else the next open date, else the oldest overdue one. */
export function autoDeskDate(sch = schedule()) {
  const td = today();
  const open = sch.dates.filter((d) => sch.orders.some((o) => o.dateId === d.id && !isDone(o.id)));
  return open.find((d) => d.effective === td) || open.find((d) => d.effective >= td) || open[0] || null;
}
export const dateOfId = (dateId) => (schedule().dates.find((d) => d.id === dateId) || {}).effective;
export const ordersOn = (dateId) => schedule().orders.filter((o) => o.dateId === dateId).sort((a, b) => a.at - b.at);

/**
 * What to buy, in words, after the plan's rules for differences (VWRA carry, wallet coins). A filled order
 * says what it cost, a skipped one the money that moved on, and one from before the friend joined that it
 * is not bought.
 */
export function orderWhat(o, cr) {
  const i = instById(o.instrument);
  const s = ost(o.id);
  const name = o.wholeShares ? i.id : i.name;
  if (isPreOrder(o.id)) return `${name}: not bought, before you joined`;
  if (s.status === "filled" && Number.isFinite(s.costUsd)) return `${fUsd(s.costUsd, 2)} of ${name} bought (plan ${fM(o.usd)})`;
  if (s.status === "skipped") return `${fUsd(skippedUsd(o, cr), 2)} of ${name}, skipped`;
  if (cr && !isDone(o.id) && o.carryTarget && cr.byOrder[o.id] && cr.byOrder[o.id].usd !== o.usd) return `${fUsd(cr.byOrder[o.id].usd, 2)} of ${i.id} in whole shares (plan ${fM(o.usd)}, adjusted)`;
  if (cr && !isDone(o.id) && o.cryptoWait && cr.coinUsd && Number.isFinite(cr.coinUsd[o.id]) && cr.coinUsd[o.id] !== o.usd) return `${fUsd(cr.coinUsd[o.id], 2)} of ${i.name} (plan ${fM(o.usd)}, what the wallet holds)`;
  return o.fractional ? `${fM(o.usd)} of ${i.name}, fractional` : o.wholeShares ? `${fM(o.usd)} of ${i.id} in whole shares` : `${fM(o.usd)} of ${i.name}`;
}
/** The money a skipped order held, after the rules for differences: what moved on (or stayed as cash). */
export function skippedUsd(o, cr = carry()) {
  if (o.carryTarget && cr.byOrder[o.id]) return cr.byOrder[o.id].usd;
  if (o.cryptoWait && cr.coinUsd && Number.isFinite(cr.coinUsd[o.id])) return cr.coinUsd[o.id];
  return o.usd;
}
/** The change the plan's rules for differences make to an open order (VWRA carry, wallet coins). */
export function adjustFor(o, cr) {
  if (isDone(o.id)) return 0; // logged: later changes move on to the next VWRA order, not into this one
  if (o.carryTarget && cr.byOrder[o.id]) return L.round2(cr.byOrder[o.id].usd - o.usd);
  if (o.cryptoWait && cr.coinUsd && Number.isFinite(cr.coinUsd[o.id])) return L.round2(cr.coinUsd[o.id] - o.usd);
  return 0;
}
/** The VWRA (carryTarget) order a leftover from `o` joins: the same day's if `o` is not one, else a later one still open. */
export function nextCarryTarget(o) {
  return schedule().orders
    .filter((x) => x.carryTarget && x.id !== o.id && !isDone(x.id) && (x.date > o.date || (x.date === o.date && !o.carryTarget)))
    .sort((a, b) => a.at - b.at)[0] || null;
}
/** The plan's "How to place" row for an instrument (matched on its order style, then its group). */
export function howTo(i) {
  const rows = app.plan.orderHowTo || [];
  return rows.find((r) => (r.styles || []).includes(i.orderStyle)) || rows.find((r) => (r.groups || []).includes(i.group)) || null;
}
/** The rolled-order record (plan.scale.rolled) for an instrument whose orders are not bought at this amount. */
export const rolledFor = (instId) => ((app.plan.scale && app.plan.scale.rolled) || []).filter((r) => r.instrument === instId);

export const STATUS_PILL = {
  pending: ["To do", "neutral", "□"],
  placed: ["Placed", "amber", "◐"],
  filled: ["Filled", "kelp", "✓"],
  skipped: ["Skipped", "muted", "↷"],
};
export function statusPill(status, extra = "") {
  const [t, k, g] = STATUS_PILL[status] || STATUS_PILL.pending;
  return pill(t + extra, k, g);
}
export function ceilPill(st) {
  switch (st) {
    case "under": return pill("Under ceiling", "kelp", "✓");
    case "over": return pill("Over ceiling", "coral", "▲");
    case "pending": return pill("Set on 27 Nov", "amber", "◷");
    case "nocap": return pill("No ceiling", "neutral", "–");
    default: return pill("No price yet", "muted", "?");
  }
}
export function fmtCeil(c, i) {
  if (!c || c.kind === "none") return "None";
  if (c.value == null) return c.kind === "pending" ? `27 Nov close + ${c.pct}%` : "None";
  return fPrice(c.value, i.quoteCurrency);
}

// ---------------------------------------------------------------- DOM builders

export function card(cls, ...kids) { return h(`section.card.rise${cls}`, ...kids); }
export function cardHead(title, sub, extra, tag = "h2") {
  return h("header.card-head", h("div.card-head-text", h(`${tag}.card-title`, title), sub ? h("p.card-sub", sub) : null), extra || null);
}
export function viewHead(id, eyebrow, title, lede, extra) {
  return h("header.vhead.rise",
    h("div.vhead-text", eyebrow ? h("p.eyebrow", eyebrow) : null, h("h1.vtitle", { id: "h-" + id, tabindex: "-1" }, title), lede ? h("p.lede", lede) : null),
    extra || null);
}
export function empty(title, text, glyph = "info") {
  return h("div.empty", h("div.empty-ico", icon(glyph)), h("p.empty-title", title), text ? h("p.empty-text", text) : null);
}
export function errorState(title, err) {
  return h("div.empty.is-error", { role: "alert" }, h("div.empty-ico", icon("alert")), h("p.empty-title", title), h("p.empty-text", String((err && err.message) || err || "")));
}
export function ruleQuote(r, label = "Plan rule") {
  if (!r) return null;
  return h("blockquote.rule-quote", h("span.rq-label", label), r.if ? h("span.rq-if", r.if + ". ") : null, h("span.rq-then", r.then));
}
const openKeys = new Set();
export function disclosure(key, summary, content, { open = false, cls = "" } = {}) {
  const isOpen = openKeys.has(key) || (open && !openKeys.has("!" + key));
  const d = h(`details.disc${cls}`, { "data-key": key, open: isOpen }, h("summary", { "data-fk": "sum-" + key }, summary), h("div.disc-body", content));
  d.addEventListener("toggle", () => {
    if (d.open) { openKeys.add(key); openKeys.delete("!" + key); } else { openKeys.delete(key); openKeys.add("!" + key); }
  });
  return d;
}
export function chipGroup(label, options, value, onPick, fkPrefix) {
  return h("div.chips", { role: "group", "aria-label": label },
    options.map(([v, t]) => h("button.chip", { type: "button", "aria-pressed": String(v === value), "data-fk": `${fkPrefix}-${v}`, on: { click: () => onPick(v) } }, t)));
}
export function field(label, input, hint, cls = "") {
  return h(`label.field${cls}`, h("span.field-label", label), input, hint ? h("span.field-hint", hint) : null);
}
export function onCleanup(fn) { (app.cleanup[app.renderingId] ||= []).push(fn); }
export function afterRender(fn) { (app.after[app.renderingId] ||= []).push(fn); }
/** A link to a data source, opened in a new tab without a referrer. */
export function sourceLink(src) {
  return h("a.src-link", { href: src.href, target: "_blank", rel: "noopener noreferrer" }, src.text);
}

// ---------------------------------------------------------------- saving

export const saveUi = { state: "idle", at: 0 };

/**
 * Change the friend's records and save them in this browser at once. plan.lockedAt is kept as before (set
 * from the first fill, skip or transfer, cleared if every one of them is undone; entries from before the
 * friend joined never set it); it is for display only.
 *
 * Amounts and the mix change through commitPlanChange. A mutator that changes the plan record anyway (the
 * amount, the month entries, the mix or the join date) is checked here too: if it would alter an order or a
 * transfer of a month the records fix, nothing is saved and a toast says why. The mutator may then run twice,
 * so, as everywhere, it must change only the draft it is given. Returns true when the change was saved.
 * opts.auto: a change the app makes on its own (the locked 10%), passed to store.update (see there).
 */
export function commit(mutator, { planChecked = false, auto = false } = {}) {
  if (!planChecked) {
    const refused = planGuard(mutator);
    if (refused) {
      toast(explain(refused), "alert", 6000);
      return false;
    }
  }
  store.update((d) => {
    mutator(d);
    if (d.plan) {
      const logged = hasLogged(d, pre(d));
      if (logged && !d.plan.lockedAt) d.plan.lockedAt = new Date().toISOString();
      else if (!logged && d.plan.lockedAt) d.plan.lockedAt = null;
    }
  }, { auto });
  saveUi.state = store.saveError ? "error" : "saved";
  saveUi.at = Date.now();
  hooks.renderFresh();
  const se = store.saveError;
  if (se && (se.name === "NamesMissingError" || se.name === "DamagedStateError")) toast(se.message, "alert", 6000);
  else if (se) toast("Not saved: this browser refused to store it. Download a copy from Settings before you close the page.", "alert", 6000);
  else askToKeep();
  return !store.saveError;
}

/** The mutator applied to a copy of the state, then cleaned as the store saves it (withDefaults), in place. */
function applyClean(d, mutator) {
  mutator(d);
  const c = withDefaults(d);
  for (const k of Object.keys(d)) delete d[k];
  return Object.assign(d, c);
}

/**
 * For commit: null when the mutator leaves the plan record as it is, or leaves every fixed month's orders
 * and transfers as they are; otherwise the refusal (a FixedMonthError). A mutator that throws is left to
 * store.update, which reports it as today.
 */
function planGuard(mutator) {
  const cur = S();
  if (!app.base || !cur.plan) return null;
  let draft;
  try { draft = applyClean(structuredClone(cur), mutator); } catch { return null; }
  if (planKeyOf(draft.plan) === planKeyOf(cur.plan)) return null;
  const fixedNow = M.fixedMonths(app.base, cur);
  if (!fixedNow.size) return null;
  const before = M.planOrNull(app.base, cur.plan).plan;
  if (!before) return null; // the saved amounts could not be worked out: there is nothing to keep
  const after = draft.plan ? M.planOrNull(app.base, draft.plan).plan : null;
  if (!after) return new M.FixedMonthError();
  try {
    M.checkFixedUnchanged(app.base, before, after, fixedNow);
    M.tidy(structuredClone(draft), after);
  } catch (e) {
    return e;
  }
  return null;
}

/**
 * The one way to change the friend's amounts or mix (setup when changing, the month dialog, the transfer
 * dialog's "Size ...", the mix editor, "Back to the plan's mix"). mutator(draft) makes the change on a copy,
 * normally with months.setAmountFrom, setMonthAmount or setMixFrom; it must be deterministic, because it runs
 * once on the copy and once more to save. The copy is cleaned as the store saves it, its plan is worked out,
 * and the change is refused if it would alter an order or a transfer of a month the records fix. Records the
 * new plan has no place for (a to-do or placed entry of an order it no longer buys) are dropped (months.tidy).
 *
 * Returns the new plan. Throws, and saves nothing, on a refusal: a PlanFitError (the amounts or mix do not
 * work out), a MonthChangeError (the month is fixed or before the friend joined) or a FixedMonthError. The
 * caller shows explain(e), in the field's error line or as a toast.
 * opts.ignoreTransfer: a transfer being recorded again in the same change (it does not fix its own month).
 * opts.auto: a change the app makes on its own (the locked 10%), passed to commit.
 */
export function commitPlanChange(mutator, { ignoreTransfer = null, auto = false } = {}) {
  if (!app.base || !S().plan) throw new M.MonthChangeError("no_plan", "There is no monthly amount yet.");
  const change = (d) => applyClean(d, mutator);
  const r = M.planChange(app.base, S(), change, { ignoreTransfer });
  // Every amount as typed must give its dollars (a baht amount converted to the cent): scaleFor throws a
  // PlanFitError "input" otherwise. Only a plan that already needed the dollars alone (a hand-edited file,
  // app.planInputs false) is let through as planChange worked it out.
  if (app.planInputs !== false) M.scaleFor(app.base, r.state.plan);
  commit((d) => { change(d); M.tidy(d, r.plan); }, { planChecked: true, auto });
  // A browser that refuses to store it still has the change in this tab, and commit has said so.
  if (planKeyOf(S().plan) !== planKeyOf(r.state.plan)) throw new M.MonthChangeError("not_saved", "The change could not be made, so nothing was changed.");
  return r.plan;
}

// Browsers may clear a site's storage on their own (Safari after about a week without a visit). Once there
// is something to keep, ask this one to keep it (Chromium decides by itself; Safari and Firefox may ask
// the friend). A refusal changes nothing: the "Keep a copy" card on Today is the real safeguard.
let keepAsked = false;
function askToKeep() {
  if (keepAsked || !S().plan) return;
  keepAsked = true;
  try {
    const sm = navigator.storage;
    if (sm && sm.persist && sm.persisted) sm.persisted().then((p) => (p ? true : sm.persist())).catch(() => {});
  } catch { /* not offered here */ }
}

// ---------------------------------------------------------------- dialogs

let dlgSeq = 0;
export function modal({ title, body, actions, cls = "", onSubmit, lede }) {
  const id = "dlg-t-" + ++dlgSeq;
  const opener = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-fk");
  const dlg = h(`dialog.modal${cls}`, { "aria-labelledby": id });
  const form = h("form.modal-card", { method: "dialog", novalidate: true },
    h("header.modal-head",
      h("div", h("h2.modal-title", { id }, title), lede ? h("p.modal-lede", lede) : null),
      h("button.icon-btn", { type: "button", "aria-label": "Close", on: { click: () => close() } }, "×")),
    h("div.modal-body", body),
    h("footer.modal-actions", actions || []));
  form.addEventListener("submit", (e) => {
    if (!onSubmit) return;
    e.preventDefault();
    if (onSubmit(e) !== false) close();
  });
  dlg.append(form);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  let returnFocus = true;
  dlg.addEventListener("close", () => {
    dlg.remove();
    if (opener && returnFocus) setTimeout(() => { const t = document.querySelector(`[data-fk="${CSS.escape(opener)}"]`); if (t) t.focus({ preventScroll: true }); }, 60);
  });
  document.body.append(dlg);
  dlg.showModal();
  const first = dlg.querySelector("input:not([type=hidden]):not([disabled]):not([type=radio]), textarea, select");
  if (first) first.focus();
  function close(v) { if (dlg.open) dlg.close(v); }
  /** Leave focus where the next step puts it (a new view's heading) instead of on the opening button. */
  function keepFocus() { returnFocus = false; }
  return { dlg, form, close, keepFocus };
}

export function confirmDialog({ title, text, ok = "Confirm", danger = false, extra }) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal({
      title, cls: ".is-confirm",
      body: [h("p", text), extra || null],
      actions: [
        h("button.btn.btn-ghost", { type: "button", on: { click: () => { answered = true; resolve(false); m.close(); } } }, "Cancel"),
        h(`button.btn${danger ? ".btn-danger" : ".btn-primary"}`, { type: "submit" }, ok),
      ],
      onSubmit: () => { answered = true; resolve(true); },
    });
    m.dlg.addEventListener("close", () => { if (!answered) resolve(false); });
  });
}

export function downloadFile(name, text, type = "application/json") {
  const blob = new Blob([text], { type: type + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = h("a", { download: name, style: { display: "none" } });
  a.setAttribute("href", url); // blob: URLs bypass safeUrl on purpose (the friend's own data only)
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

/** The friend's records as a pretty-printed JSON download; the copy's time is kept (settings.lastExportAt). */
export function exportState() {
  if (S().plan) store.update((d) => { d.settings.lastExportAt = new Date(now()).toISOString(); });
  downloadFile(`tide-table-monthly-${today()}.json`, JSON.stringify(S(), null, 2) + "\n");
  toast("Your records were downloaded as a file", "success");
}

/**
 * Whether Today asks for a copy: once there are records, when the last copy (or the start, if there is
 * none) is more than 14 days old, or an order date has come since it. {due, last, reason}.
 */
export function copyDue(st = S()) {
  if (!st.plan || !app.plan) return { due: false };
  const has = Object.values(st.orders).some((o) => o.status && o.status !== "pending")
    || Object.values(st.funding).some((f) => f.status && f.status !== "todo")
    || Object.values(st.prep).some(Boolean) || st.journal.length > 0;
  const last = st.settings.lastExportAt ? L.bkkDate(Date.parse(st.settings.lastExportAt)) : null;
  const since = last || (st.createdAt ? L.bkkDate(Date.parse(st.createdAt)) : null);
  if (!has || !since) return { due: false, last };
  const td = today();
  const orderDay = schedule().dates.filter((d) => d.effective > since && d.effective <= td && !isPreDate(d.id)).map((d) => d.effective).pop();
  const old = L.daysBetween(since, td) > 14;
  return { due: !!(orderDay || old), last, orderDay: orderDay || null, old };
}
