// Shared state and helpers for the friends' app views: the scaled plan, the clock, the plan's maths
// (logic-core.js), the save path, dialogs and small DOM builders. Views live in js/views/; main.js
// owns the router and the page chrome and fills in `hooks`.
//
// Every number comes from the scaled plan or logic-core.js. The only actions shown are the plan's own
// written rules; prices are information only.

import * as ui from "./ui.js";
import * as L from "./logic-core.js";
import { fmtMoney, fmtBaht, beforeJoin } from "./scale.js";
import { store, hasLogged } from "./store.js";
import { prices } from "./prices.js";

export const { h, clear, icon, pill, toast } = ui;
export { ui, L, store, prices };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const svg = (tag, props = {}, ...kids) => h(tag, { ...props, svg: true }, ...kids);

/** Module-local app state; the friend's records live in store. */
export const app = {
  base: null, // data/base-plan.json
  plan: null, // the base plan scaled to the friend's amount (scale.js)
  planKey: "",
  planError: null,
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
};

/** main.js fills these in (the router and the chrome). */
export const hooks = {
  invalidate: () => {},
  renderView: () => {},
  renderFresh: () => {},
  go: (id) => { location.hash = "#/" + id; },
};

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
export const rule = (id) => app.plan.rules.find((r) => r.id === id);
export const accountLabel = (id) => (app.plan.accounts.find((a) => a.id === id) || {}).label || id;
export const locked = () => !!(S().plan && hasLogged(S(), pre()));

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
  pending: ["To do", "neutral", "○"],
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
 * Change the friend's records and save them in this browser at once. The amount locks (plan.lockedAt)
 * from the first fill, skip or transfer, and unlocks if every one of them is undone. Entries from before
 * the friend joined never lock it.
 */
export function commit(mutator) {
  store.update((d) => {
    mutator(d);
    if (d.plan) {
      const logged = hasLogged(d, pre(d));
      if (logged && !d.plan.lockedAt) d.plan.lockedAt = new Date().toISOString();
      else if (!logged && d.plan.lockedAt) d.plan.lockedAt = null;
    }
  });
  saveUi.state = store.saveError ? "error" : "saved";
  saveUi.at = Date.now();
  hooks.renderFresh();
  if (store.saveError) toast("Not saved: this browser refused to store it. Download a copy from Settings before you close the page.", "alert", 6000);
  else askToKeep();
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
