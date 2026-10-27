// The locked 10% (Tide Table 2.1; docs/tt2/ADDENDUM-2026-10-27b.md section B and docs/tt2/build/lock-api.md):
// every friend's plan holds Anthropic at 10% of each month's amount. The other 90% follows the friend's plan exactly
// as before: every amount the written plan, an own mix or the friend's split gives is worked out from 90% of the
// month, with the same rounding rules, and VWRA still takes what is left. While Anthropic does not trade, its 10%
// goes to VWRA that month; from the first month whose order date is after its first trading day, the 10% is an order
// at Interactive Brokers in US dollars, on the exchange and ticker the upcoming list gives.
//
// Pure ES module: no DOM and no storage, and it imports scale.js only (split.js composes the year with it, months.js
// changes the record, store.js cleans it). The one network call, loadCuratedUpcoming, reads the copy of the upcoming
// list the site bundles; the live list comes from the host (views/fields.js upcomingDoc).
//
// Words used here:
// - the lock record (plan.lock, saved with the friend's plan): { k, from, f, s } and, once a first trading day is
//   saved, the listing's snapshot { id, n, l, t, v } (company id, short name, registry name, ticker, exchange).
//   k is the list key; from the first month the lock applies to (months before it keep what they had); f the first
//   trading day as the data showed it; s the first month its order may count in (later than the first month after
//   f when months in between had started). A plan record without a lock record is worked out as in 2.0.
// - a lock month: a joined month from lock.from on. Its state is "waiting" (no first trading day saved, or the order
//   date is on or before it), "started" (the order date is after it, but the month comes before lock.s) or
//   "trades". In every lock month the plan's orders are worked out at 90%; only in a "trades" month does the 10%
//   become an order.
//
// Money is worked in integer cents. In a lock month of A cents:
// - the plan's orders: scale.js on a copy of the base plan whose orders are 90% of the $500 plan's (VWRA takes the
//   other 10%), at the month's full amount, so each order is the plan's share of exactly 90% of A, rounded as
//   scale.js rounds it (half up to whole dollars in the plan's mode; down to whole dollars in an own mix); the
//   month's amount, how it was typed, its transfers and its checks stay the full month's;
// - an own mix: each share is of 90% of A, rounded down to whole dollars, under its style's minimum not bought;
// - field mode: the split's part is floor(9 * A * s / 10^4) cents (spec 8.3 with 90% of A), then as before;
// - the 10%: tenth = A / 10 rounded half up to the cent (what the words say); the order, once it trades, is
//   floor(A / 1000) whole dollars (10% rounded down, as every company order is), not bought under $5;
// - VWRA = A - every other order: it keeps its own share, the rounding and, unless an order takes it, the 10%.

import {
  scaleAmounts, fundingMonthOf, planShares, ownOrderId, ownTransferId, ownIdMonth, fmtMoney, PlanFitError,
  DEFAULT_MIN_ORDER_USD, MIX_TENTHS_MAX,
} from "./scale.js?v=2.1.0";

// ---------------------------------------------------------------- what is locked

/** The list key of the locked listing (pipeline/lists/upcoming.json) and its name in sentences. */
export const LOCK_KEY = "anthropic";
export const LOCK_NAME = "Anthropic";
/** Its share of every month, in tenths of a percent. */
export const LOCK_TENTHS = 100;
/** The group its instrument is in once it is bought (no rebalance target: the plan's written targets stay). */
export const LOCK_GROUP = Object.freeze({ id: "lock", label: "Locked at 10% of each month", rebalanceTargetPct: null });
/** The exchanges its order can use: the four of a friend's orders (split.js ADDABLE_VENUES; a test keeps them equal). */
export const LOCK_VENUES = Object.freeze(["NYSE", "NASDAQ", "NYSE American", "Cboe"]);
/** The smallest order, in cents: the plan's fractional US minimum ($5; split.js MIN_ORDER_CENTS). */
export const LOCK_MIN_CENTS = DEFAULT_MIN_ORDER_USD.fractional_usd * 100;
/** The snapshot caps: short name, registry name, ticker, exchange (the data schema's caps). */
export const LOCK_CAPS = Object.freeze({ n: 40, l: 120, t: 12, v: 16 });
/** The bundled copy of the upcoming list (same tt-upcoming/1 shape as the live data/upcoming.json). */
export const CURATED_PATH = "data/upcoming-curated.json";
export const UPCOMING_SCHEMA = "tt-upcoming/1";

/** The order rows' "why" lines, by id ({name}: the locked listing's name, {min}: the smallest order). */
export const LOCK_WHY = Object.freeze({
  lock_waiting: "{name} has not started trading yet, so this month its 10% goes to VWRA.",
  lock_before: "{name} had not started trading by this month's order date, so its 10% went to VWRA.",
  lock_started: "This month had started before Tide Table saw {name} trading, so its 10% stays with VWRA.",
  lock_under_min: "{name}'s 10% of this month is under {min}, so it goes to VWRA.",
  lock_order: "10% of the month, locked in this plan.",
});

/** Fixed lines the views show with the locked listing (addendum B.6). */
export const LOCK_COPY = Object.freeze({
  asWritten: "Part of this plan as written. It is an illustration, not personal advice.",
  ninety: "Its share of the other 90% of the month.",
  share: "10% of each month",
  noData: `Tide Table has no list of upcoming listings at hand, so it counts ${LOCK_NAME} as not trading yet.`,
});

/** Two sourced facts for the order row once it trades (docs/tt2/research/anthropic-ipo.md): facts, not steps. */
export const LOCK_FACTS = Object.freeze([
  Object.freeze({
    id: "limit_orders",
    text: "Interactive Brokers' page on new listings, archived on 26 Sep 2022, encouraged clients to use limit orders: "
      + "an order that sets the highest price paid. That page is retired now.",
    sources: Object.freeze([Object.freeze({
      label: "Interactive Brokers, \"IPO Considerations\" (archived copy)", date: "2022-09-26",
      url: "https://web.archive.org/web/20220926073205/https://ibkr.info/node/1897",
    })]),
  }),
  Object.freeze({
    id: "dollar_orders",
    text: "No Interactive Brokers document found by 27 Oct 2026 says whether dollar-amount (fractional) orders work on a "
      + "new stock's first day.",
    sources: Object.freeze([Object.freeze({
      label: "Interactive Brokers, list of shares open to fractional orders", date: "2026-10-27",
      url: "https://www.interactivebrokers.com/download/fracshare_stk.csv",
    })]),
  }),
]);

// ---------------------------------------------------------------- small helpers

const MONTH_ID = /^m\d\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const COMPANY_ID = /^[sjl][0-9A-Z]{1,19}$/;
const TICKER = /^[A-Z0-9.-]{1,12}$/;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
const toCents = (x) => Math.round(x * 100);
/** n / d rounded down, for integers n >= 0 and d > 0, without a floating-point division. */
const divFloor = (n, d) => (n - (n % d)) / d;
/** n / d rounded half away from zero, for integers (d > 0). */
const divRound = (n, d) => Math.sign(n) * Math.floor((2 * Math.abs(n) + d) / (2 * d));
const cap = (s, max) => { const cs = Array.from(s); return cs.length > max ? cs.slice(0, max - 1).join("") + "…" : s; };
const style = (o) => (o.fractional ? "fractional_usd" : o.wholeShares ? "whole_usd" : "usd_amount");

/** A real calendar date written YYYY-MM-DD. */
function isDay(v) {
  if (typeof v !== "string" || !DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** The 10% of a month of A cents, to the cent (half up). */
export const tenthCents = (A) => divRound(A, 10);
/** The order the 10% becomes once it trades, in whole dollars (10% of A rounded down). */
export const lockOrderDollars = (A) => divFloor(A, 1000);

// ---------------------------------------------------------------- the record

/** The listing's snapshot as saved: { id, n, l, t, v }, or null when it cannot carry an order (no company id, no
 *  name, or an exchange that is not one of LOCK_VENUES). Over-long names are cut (with "…"), never dropped. */
function snapshotOf(r) {
  if (!isObj(r) || typeof r.id !== "string" || !COMPANY_ID.test(r.id)) return null;
  if (typeof r.n !== "string" || !r.n.trim() || !LOCK_VENUES.includes(r.v)) return null;
  const n = cap(r.n, LOCK_CAPS.n);
  return {
    id: r.id, n, l: typeof r.l === "string" && r.l.trim() ? cap(r.l, LOCK_CAPS.l) : n,
    t: typeof r.t === "string" && TICKER.test(r.t) ? r.t : null, v: r.v,
  };
}

/**
 * A lock record ready to use and to save: { k, from, f, s } plus { id, n, l, t, v } once a first trading day is
 * saved, or null when there is none (the plan is then worked out as in 2.0). A first trading day that is not a date,
 * a first month that is not a month id, or a snapshot that cannot carry an order leave it waiting (f and s null, no
 * snapshot), so the 10% never becomes an order by mistake. Key order is fixed, so cleaning twice changes nothing.
 */
export function readLock(rec) {
  if (!isObj(rec) || rec.k !== LOCK_KEY || typeof rec.from !== "string" || !MONTH_ID.test(rec.from)) return null;
  const out = { k: LOCK_KEY, from: rec.from, f: null, s: null };
  const snap = snapshotOf(rec);
  if (isDay(rec.f) && snap && (rec.s == null || (typeof rec.s === "string" && MONTH_ID.test(rec.s)))) {
    out.f = rec.f;
    out.s = rec.s == null ? null : rec.s;
    Object.assign(out, snap);
  }
  return out;
}

/**
 * The state of month dateId (order date `date`) under a lock record: null when it is not a lock month (before
 * lock.from), else "waiting", "started" or "trades" (see the top of the file). Month ids compare as text (m01 to
 * m99), so a from or s past the plan's last month means no month. The caller leaves out months before the friend
 * joined.
 */
export function lockState(lock, dateId, date) {
  const L = readLock(lock);
  if (!L || typeof dateId !== "string" || !MONTH_ID.test(dateId) || dateId < L.from) return null;
  if (!L.f || !(typeof date === "string" && date > L.f)) return "waiting";
  if (L.s != null && dateId < L.s) return "started";
  return "trades";
}

// ---------------------------------------------------------------- the base plan at 90%

const ninetyMemo = new WeakMap();
/**
 * A copy of the base plan whose orders are 90% of the $500 plan's: every order but each month's VWRA order is 90% of
 * its amount (the base's amounts are whole dollars, so this is exact cents), VWRA takes the rest of each month's
 * $500, and each transfer pays exactly its orders. scale.js on it, at a month's full amount, gives every other order
 * the amount scale.js gives at 90% of that amount (exactly scalePlan(base, 0.9 * A) when that is whole cents).
 */
export function ninetyBase(base) {
  let b = ninetyMemo.get(base);
  if (b) return b;
  const fm = fundingMonthOf(base);
  const Bc = toCents(base.funding.monthlyUsd);
  const orders = base.orders.map((o) => ({ ...o }));
  const spent = {};
  for (const o of orders) {
    if (o.carryTarget) continue;
    const c = toCents(o.usd);
    if ((c * 9) % 10 !== 0) throw new Error(`lock: order ${o.id} of the base plan is not a whole number of dimes.`);
    o.usd = (c * 9) / 10 / 100;
    spent[fm[o.id]] = (spent[fm[o.id]] || 0) + (c * 9) / 10;
  }
  for (const o of orders) if (o.carryTarget) o.usd = (Bc - (spent[fm[o.id]] || 0)) / 100;
  const paid = {};
  for (const o of orders) { const k = `${o.account}\u0000${fm[o.id]}`; paid[k] = (paid[k] || 0) + toCents(o.usd); }
  const transfers = base.funding.transfers.map((t) => ({ ...t, usd: (paid[`${t.to}\u0000${t.forDate}`] || 0) / 100 }));
  b = { ...base, orders, funding: { ...base.funding, transfers } };
  ninetyMemo.set(base, b);
  return b;
}

const factsMemo = new WeakMap();
/** What the 90% year needs from the base, once per base: each base order's funding month and transfer, the
 *  accounts with a transfer every month, the other account (SwissBorg) and its model transfer, the fund that takes
 *  the rest, the holdings a mix can name with their yearly cents, each instrument's model order and the dates. */
function factsOf(base) {
  let F = factsMemo.get(base);
  if (F) return F;
  const fm = fundingMonthOf(base);
  const transferOf = new Map(base.funding.transfers.map((t) => [`${t.to}\u0000${t.forDate}`, t.id]));
  const payer = Object.fromEntries(base.orders.map((o) => [o.id, transferOf.get(`${o.account}\u0000${fm[o.id]}`)]));
  const restId = (base.orders.find((o) => o.carryTarget) || {}).instrument;
  const B = planShares(base);
  const Yc = Object.values(B).reduce((a, x) => a + x, 0);
  const holdings = (base.instruments || []).map((i) => i.id).filter((id) => id !== restId && B[id] > 0);
  const model = {};
  for (const o of base.orders) if (!model[o.instrument]) model[o.instrument] = o;
  const transfers = base.funding.transfers;
  const perMonth = new Set([...new Set(transfers.map((t) => t.to))].filter((a) => base.orderDates.every((d) => transfers.some((t) => t.to === a && t.forDate === d.id))));
  const others = [...new Set([restId, ...holdings].map((id) => model[id].account))].filter((a) => !perMonth.has(a));
  const ownTo = others.length ? others[0] : null;
  const ownModel = ownTo ? transfers.find((t) => t.to === ownTo) || null : null;
  const dateOf = Object.fromEntries(base.orderDates.map((d) => [d.id, d.date]));
  const inst = Object.fromEntries((base.instruments || []).map((i) => [i.id, i]));
  F = { fm, payer, restId, B, Yc, holdings, model, perMonth, ownTo, ownModel, dateOf, inst };
  factsMemo.set(base, F);
  return F;
}

/** An own-mix month of a lock month worked out at 90%: every holding of the mix at its share of 90% of the month,
 *  rounded down to whole dollars, not bought under its style's minimum (rolled, reason "below_min"), and VWRA the
 *  rest. Changes plan.orders and returns the new list of rolls. */
function ninetyOwnMonth(base, plan, rolled, d, Ac, mix, minOrderUsd) {
  const F = factsOf(base);
  const into = ownOrderId(d, F.restId);
  const rolls = [];
  for (const id of F.holdings) {
    const typed = has(mix, id);
    if (typed && mix[id] === 0) continue;
    const num = 9 * Ac * (typed ? mix[id] : F.B[id]);
    const den = 10 * (typed ? MIX_TENTHS_MAX : F.Yc);
    if (!Number.isSafeInteger(num)) throw new Error(`lock: ${id} in ${d} is too large to work out exactly.`);
    const dollars = divFloor(num, 100 * den);
    const m = F.model[id], st = style(m), min = minOrderUsd[st];
    const oid = ownOrderId(d, id);
    const k = plan.orders.findIndex((o) => o.id === oid);
    if (dollars <= 0 || dollars < min) {
      if (k >= 0) plan.orders.splice(k, 1);
      rolls.push({ id: oid, instrument: id, account: m.account, dateId: d, fundDateId: d, into, usd: dollars, exactUsd: divRound(num, den) / 100, minUsd: min, style: st, reason: "below_min" });
    } else {
      if (k < 0) throw new Error(`lock: ${oid} is bought at 90% but not at the month's amount.`);
      plan.orders[k].usd = dollars;
    }
  }
  const v = plan.orders.find((o) => o.id === into);
  if (!v) throw new Error(`lock: ${d} has no ${F.restId} order.`);
  const others = plan.orders.filter((o) => ownIdMonth(o.id) === d && o.id !== into).reduce((a, o) => a + toCents(o.usd), 0);
  if (Ac - others < 0) throw new Error(`lock: ${d} spends more than its amount.`);
  v.usd = (Ac - others) / 100;
  return [...rolled.filter((r) => !(r.fundDateId === d && ownIdMonth(r.id) === d)), ...rolls];
}

/**
 * The year's numbers with the lock months at 90% (no text yet): scaleAmounts at the friend's amounts, and, for the
 * orders whose money comes from a lock month (lockSet: month ids), the same on ninetyBase, with an own mix's shares
 * taken of 90% too. Returns { plan, rolled, months } (months: each order date's dollars, the full amounts). With no
 * lock month it is scaleAmounts' result as it is.
 */
export function ninetyYear(base, monthlyUsd, args, lockSet) {
  const n100 = scaleAmounts(base, monthlyUsd, args);
  if (!lockSet || !lockSet.size) return { plan: n100.plan, rolled: n100.rolled, months: n100.months };
  const n90 = scaleAmounts(ninetyBase(base), monthlyUsd, args);
  const F = factsOf(base);
  const monthOf = (id) => (has(F.fm, id) ? F.fm[id] : ownIdMonth(id));
  const inLock = (id) => lockSet.has(monthOf(id));
  const at90 = new Map(n90.plan.orders.map((o) => [o.id, o]));
  const ids100 = new Set(n100.plan.orders.map((o) => o.id));
  for (const o of n90.plan.orders) if (inLock(o.id) && !ids100.has(o.id)) throw new Error(`lock: ${o.id} is bought at 90% but not at the month's amount.`);
  const plan = n100.plan;
  plan.orders = plan.orders.flatMap((o) => (!inLock(o.id) ? [o] : at90.has(o.id) ? [at90.get(o.id)] : []));
  let rolled = [...n100.rolled.filter((r) => !lockSet.has(r.fundDateId)), ...n90.rolled.filter((r) => lockSet.has(r.fundDateId))];
  const o = args || {};
  const months = isObj(o.months) ? o.months : {};
  for (const d of n100.ownMonths) {
    if (!lockSet.has(d)) continue;
    const e = months[d];
    const mix = e && e.mix != null ? e.mix : o.mix || {};
    rolled = ninetyOwnMonth(base, plan, rolled, d, toCents(n100.months[d]), mix, n100.minOrderUsd);
  }
  return { plan, rolled, months: n100.months };
}

// ---------------------------------------------------------------- transfers and totals, as scale.js works them out

/** "Bitcoin and ether on 12 Jan": what an own-mix month's SwissBorg transfer pays for (scale.js's words). */
function coinsPays(F, coins, date) {
  const names = coins.map((o) => String((F.inst[o.instrument] || {}).name || o.instrument).toLowerCase());
  const list = names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} on ${Number(date.slice(8, 10))} ${MONTH_SHORT[Number(date.slice(5, 7)) - 1]}`;
}

/**
 * Every transfer worked out again from the plan's orders, as scale.js does: each base transfer pays the base orders
 * of its account and funding month and the own-mode orders of its account and month (Interactive Brokers); an own
 * month's SwissBorg orders get a transfer of their own (S-mNN). A transfer with nothing to pay is dropped. ownMonths:
 * the months scale.js worked out in own mode (field months included). Returns { transfers, dropped }.
 */
export function rebuildTransfers(base, plan, ownMonths = []) {
  const F = factsOf(base);
  const own = new Set(ownMonths);
  const payerOf = (o) => {
    if (has(F.payer, o.id)) return F.payer[o.id];
    const d = ownIdMonth(o.id);
    if (d && F.perMonth.has(o.account)) {
      const t = base.funding.transfers.find((x) => x.to === o.account && x.forDate === d);
      if (t) return t.id;
    }
    if (d && o.account === F.ownTo) return ownTransferId(d);
    throw new Error(`lock: no transfer can pay for ${o.id}.`);
  };
  const payer = new Map();
  const paid = {};
  for (const o of plan.orders) { const p = payerOf(o); payer.set(o, p); paid[p] = (paid[p] || 0) + toCents(o.usd); }
  const transfers = [], dropped = [], done = new Set();
  const ownTransfer = (d) => {
    if (done.has(d)) return;
    done.add(d);
    const id = ownTransferId(d);
    if (!(paid[id] > 0) || !F.ownModel) return;
    const month = base.funding.transfers.find((t) => F.perMonth.has(t.to) && t.forDate === d) || F.ownModel;
    const coins = plan.orders.filter((o) => payer.get(o) === id);
    transfers.push({ ...structuredClone(F.ownModel), id, usd: paid[id] / 100, send: month.send, arriveBy: month.arriveBy, forDate: d, pays: coinsPays(F, coins, F.dateOf[d]) });
  };
  for (const t of base.funding.transfers) {
    if (own.has(t.forDate)) ownTransfer(t.forDate);
    const c = paid[t.id] || 0;
    if (c > 0) transfers.push({ ...structuredClone(t), usd: c / 100 });
    else dropped.push(t.id);
  }
  for (const d of ownMonths) ownTransfer(d);
  return { transfers, dropped };
}

/** The totals scale.js keeps, worked out again from the orders: each date's Interactive Brokers total, each
 *  instrument's yearly dollars and share, the stock money and the order count. months: each date's dollars. */
export function retotal(plan, months) {
  const sum = (os) => os.reduce((a, x) => a + toCents(x.usd), 0);
  const yearC = plan.orderDates.reduce((a, d) => a + toCents(months[d.id]), 0);
  for (const d of plan.orderDates) d.ibkrTotalUsd = sum(plan.orders.filter((x) => x.dateId === d.id && x.account === "IBKR")) / 100;
  for (const i of plan.instruments) {
    i.targetUsd = sum(plan.orders.filter((x) => x.instrument === i.id)) / 100;
    i.sharePct = Math.round((i.targetUsd / (yearC / 100)) * 1000) / 10;
  }
  plan.meta.stockMoneyUsd = sum(plan.orders.filter((x) => x.account === "IBKR")) / 100;
  plan.meta.orderCount = plan.orders.length;
}

// ---------------------------------------------------------------- the 10% in each lock month

/**
 * The 10% of each lock month, on a numbers-only plan whose lock months are at 90% (ninetyYear, then split.js's
 * field months): in a "trades" month an order "<dateId>-<listing id>" (Interactive Brokers, US dollars, the US
 * venue's clock that day, fractional) of floor(A / 1000) dollars, taken from the month's VWRA order; under $5 it is
 * not bought (scale.rolled, reason "below_min") and stays with VWRA, as in every other lock month.
 *
 * The views never let a friend tick the listing in a field (2.1), but a state saved before that, or an imported or
 * hand-made one, may still list it, so a field month can already hold its order "<dateId>-<listing id>" or, when its part is under $5, a roll with that id. The listing then
 * gets one decision that month, never an order and a roll with the same id: its field part (whole dollars) and the
 * 10%'s dollars make one order when together they are $5 or more (merged: true), else one roll of both. When a field
 * roll joins the order, its whole dollars leave VWRA too, and its cents stay with VWRA as rounding
 * (plan.scale.fields[d]: rolled, rolledCents and rounding say so, so the VWRA "why" line still adds up).
 *
 * Adds plan.scale.lock (lock-api.md 3) and, once the 10% is bought or rolled, the listing's instrument (group
 * LOCK_GROUP). Returns the months that have the order.
 * ctx: { lock (readLock), states: { dateId: state }, months: { dateId: dollars }, usTime(date) }.
 */
export function addLockOrders(plan, { lock, states, months, usTime }) {
  const L = readLock(lock);
  if (!L) throw new Error("lock: no lock record.");
  const sc = plan.scale;
  const name = L.n || LOCK_NAME;
  const out = {
    key: L.k, name, tenths: LOCK_TENTHS, from: L.from, first: L.f, start: L.s,
    id: L.id || null, ticker: L.t || null, exchange: L.v || null, longName: L.l || null, months: {},
  };
  const orderMonths = [];
  let named = false;
  for (const dd of plan.orderDates) {
    const d = dd.id;
    const state = states && states[d];
    if (!state) continue;
    const A = toCents(months[d]);
    const v = plan.orders.find((o) => o.carryTarget && o.dateId === d);
    if (!v) throw new Error(`lock: ${d} has no order that takes the rest.`);
    // Not trading: "lock_waiting" while no first trading day is saved; once one is, a month whose order date is on or
    // before it says so in the past tense ("lock_before"); "lock_started" for a month the friend had started.
    const why = state === "started" ? "lock_started" : L.f ? "lock_before" : "lock_waiting";
    const rec = { state, cents: tenthCents(A), to: "VWRA", order: null, orderCents: 0, restCents: 0, into: v.id, why };
    if (state === "trades") {
      const dollars = lockOrderDollars(A);
      const oid = ownOrderId(d, L.id);
      named = true;
      const f = sc.fields && sc.fields[d] ? sc.fields[d] : null;
      const same = plan.orders.find((o) => o.id === oid); // the listing ticked in a field, bought this month
      const k = sc.rolled.findIndex((r) => r.id === oid); // … or ticked, and its part under $5
      const roll = k >= 0 ? sc.rolled[k] : null;
      if (same && roll) throw new Error(`lock: ${oid} is both bought and not bought.`);
      const fieldDollars = same ? toCents(same.usd) / 100 : roll ? roll.usd : 0;
      if ((dollars + fieldDollars) * 100 < LOCK_MIN_CENTS) {
        // Not bought: one roll for the listing this month (its field part's, when there is one, with the 10% added).
        if (roll) {
          roll.usd += dollars;
          roll.exactUsd = (toCents(roll.exactUsd) + rec.cents) / 100;
          rec.merged = true;
        } else {
          sc.rolled.push({ id: oid, instrument: L.id, account: v.account, dateId: d, fundDateId: d, into: v.id, usd: dollars, exactUsd: rec.cents / 100, minUsd: LOCK_MIN_CENTS / 100, style: "fractional_usd", reason: "below_min" });
        }
        rec.why = "lock_under_min";
      } else {
        const fromRoll = roll ? roll.usd : 0; // the field part's whole dollars, when it was not bought on its own
        const left = toCents(v.usd) - (dollars + fromRoll) * 100;
        if (left < 0) throw new Error(`lock: ${d} leaves VWRA less than $0.`);
        v.usd = left / 100;
        if (same) {
          same.usd = (toCents(same.usd) + dollars * 100) / 100;
          same.lock = L.k;
          rec.merged = true;
        } else {
          let at = -1;
          plan.orders.forEach((o, j) => { if (o.dateId === d) at = j; });
          plan.orders.splice(at + 1, 0, { id: oid, dateId: d, instrument: L.id, account: v.account, time: usTime(dd.date), kind: "usd", usd: dollars + fromRoll, ceiling: null, fractional: true, lock: L.k });
        }
        if (roll) {
          // The field part joins the order: it is no longer a roll, and its cents stay with VWRA as rounding.
          const rc = toCents(roll.exactUsd);
          sc.rolled.splice(k, 1);
          if (f) {
            f.rolled = f.rolled.filter((id) => id !== oid);
            f.rolledCents -= rc;
            f.rounding += rc - fromRoll * 100;
          }
          rec.merged = true;
        }
        if (f) f.vwra -= (dollars + fromRoll) * 100;
        Object.assign(rec, { to: "order", order: oid, orderCents: dollars * 100, restCents: rec.cents - dollars * 100, why: "lock_order" });
        orderMonths.push(d);
      }
    }
    out.months[d] = rec;
  }
  if (named) {
    const have = plan.instruments.find((i) => i.id === L.id);
    if (have) have.lock = L.k;
    else {
      plan.instruments.push({
        id: L.id, name, longName: L.l || name, symbol: L.t || L.id, account: "IBKR", venue: "US", quoteCurrency: "USD",
        group: LOCK_GROUP.id, targetUsd: 0, sharePct: 0, ceiling: null, orderStyle: "fractional_usd", region: "us",
        exchange: L.v, lock: L.k,
      });
      if (!(plan.groups || []).some((g) => g.id === LOCK_GROUP.id)) (plan.groups || (plan.groups = [])).push({ ...LOCK_GROUP });
    }
  }
  sc.lock = out;
  return orderMonths;
}

/** Throws scalePlan's PlanFitError "text" when a base order the plan's text cannot do without would not be bought
 *  at 90% (only an order whose id appears in a template's "if" may roll; scale.js checks the same at 100%). */
export function checkRollable(base, plan) {
  const rollable = new Set();
  for (const tpl of Object.values(base.templates || {})) if (Array.isArray(tpl)) for (const v of tpl) for (const c of v.if || []) rollable.add(c.replace(/^!/, ""));
  const stuck = (plan.scale.rolled || []).filter((x) => !ownIdMonth(x.id) && !rollable.has(x.id));
  if (stuck.length) {
    throw new PlanFitError("text", `scalePlan: at ${fmtMoney(plan.scale.monthlyUsd)} a month ${stuck.map((x) => x.id).join(", ")} would be under the minimum, and the plan's text has no version without ${stuck.length > 1 ? "them" : "it"}.`);
  }
}

/**
 * The plan's templates for a plan whose lock months in orderMonths have the 10% as an order: there the date's summary
 * and its Interactive Brokers transfer's "pays" use only the versions that count and name the date's orders ({#...}
 * tokens), so the words name the order too. A date with coins of the plan's own on it keeps a version that names
 * them ("{#countAll:m01}: {#coins:m01} on SwissBorg, then … at Interactive Brokers for …" when none does). Every other
 * template is the plan's own.
 */
export function lockTemplates(base, plan, orderMonths) {
  const templates = plan.templates || {};
  if (!orderMonths || !orderMonths.length) return templates;
  const out = { ...templates };
  const counts = (v) => isObj(v) && typeof v.text === "string" && v.text.includes("{#");
  for (const d of orderMonths) {
    const coins = plan.orders.some((o) => o.dateId === d && o.account === "SwissBorg" && !ownIdMonth(o.id));
    const sumPath = `/orderDates/${d}/summary`;
    if (Array.isArray(templates[sumPath])) {
      let vs = templates[sumPath].filter(counts);
      if (coins) {
        vs = vs.filter((v) => /\{#[cC]oins:/.test(v.text));
        vs.push({ if: [], text: `{#countAll:${d}}: {#coins:${d}} on SwissBorg, then {#names:${d}} at Interactive Brokers for {$ibkr:${d}}.` });
      }
      if (vs.length) out[sumPath] = vs;
    }
    const w = base.funding.transfers.find((t) => t.to === "IBKR" && t.forDate === d);
    const paysPath = w ? `/funding/transfers/${w.id}/pays` : null;
    if (paysPath && Array.isArray(templates[paysPath])) {
      const vs = templates[paysPath].filter(counts);
      if (vs.length) out[paysPath] = vs;
    }
  }
  return out;
}

// ---------------------------------------------------------------- for the views

/** plan.scale.lock (lock-api.md 3), or null for a plan without the lock. */
export const lockOf = (plan) => (plan && plan.scale && isObj(plan.scale.lock) ? plan.scale.lock : null);
/** The lock record of one month ({ state, cents, to, order, orderCents, restCents, into, why }), or null. */
export function lockMonth(plan, dateId) {
  const L = lockOf(plan);
  return L && isObj(L.months) && isObj(L.months[dateId]) ? L.months[dateId] : null;
}
/** True for the order the 10% became (its own, or a field company's order that took it). */
export const isLockOrder = (o) => !!o && o.lock === LOCK_KEY;
/** True for the locked listing's instrument. */
export const isLockInst = (i) => !!i && i.lock === LOCK_KEY;

/** A "why" line's text by id, with the listing's name. */
export function lockWhyText(id, name = LOCK_NAME) {
  const t = LOCK_WHY[id];
  return typeof t === "string" ? t.replace(/\{name\}/g, name || LOCK_NAME).replace(/\{min\}/g, fmtMoney(LOCK_MIN_CENTS / 100)) : null;
}

/**
 * The lock's "why" line for an order row: { id, text } for the order the 10% became ("lock_order") and for the
 * VWRA order that took the 10% this month ("lock_waiting", "lock_before", "lock_started", "lock_under_min"); null
 * for any other order and for a plan without the lock.
 */
export function lockWhy(plan, orderId) {
  const L = lockOf(plan);
  if (!L) return null;
  const o = (plan.orders || []).find((x) => x.id === orderId);
  if (!o) return null;
  const m = lockMonth(plan, o.dateId);
  if (!m) return null;
  if (m.to === "order" && (o.id === m.order || isLockOrder(o))) return { id: "lock_order", text: lockWhyText("lock_order", L.name) };
  if (m.to === "VWRA" && o.id === m.into) return { id: m.why, text: lockWhyText(m.why, L.name) };
  return null;
}

// ---------------------------------------------------------------- the upcoming list

/** A tt-upcoming/1 document with a list of entries (fieldsui.isUpcomingDoc; a test keeps them the same). */
export const isUpcomingDoc = (d) => !!d && typeof d === "object" && d.schema === UPCOMING_SCHEMA && Array.isArray(d.entries);

/** The locked listing's entry in a document (by its key), or null. */
export function lockEntry(doc, key = LOCK_KEY) {
  if (!isUpcomingDoc(doc)) return null;
  return doc.entries.find((e) => isObj(e) && e.key === key && typeof e.id === "string") || null;
}

/** The entry to use: the live list's when it has the listing (data/upcoming.json), else the bundled copy's
 *  (data/upcoming-curated.json). { entry, source: "live" | "curated" | null }. */
export function pickLockEntry(live, curated, key = LOCK_KEY) {
  const a = lockEntry(live, key);
  if (a) return { entry: a, source: "live" };
  const b = lockEntry(curated, key);
  return b ? { entry: b, source: "curated" } : { entry: null, source: null };
}

/** The first trading day an entry shows: dates.firstTrade of a listed entry on one of LOCK_VENUES, else null
 *  (fieldsui.upcomingFirstTrade; a test keeps them the same). */
export function entryFirstTrade(entry) {
  const e = isObj(entry) ? entry : {};
  if (e.status !== "listed" || !LOCK_VENUES.includes(e.exchange)) return null;
  return e.dates && isDay(e.dates.firstTrade) ? e.dates.firstTrade : null;
}

/** The snapshot an order needs from a listed entry: { id, n, l, t, v } (short name, registry name, ticker,
 *  exchange, as the entry gives them), or null when it cannot carry an order. */
export function entrySnapshot(entry) {
  const e = isObj(entry) ? entry : {};
  return snapshotOf({ id: e.id, n: typeof e.short === "string" && e.short ? e.short : e.name, l: e.name, t: e.ticker, v: e.exchange });
}

/** The bundled copy of the upcoming list, or null when it is missing or not a tt-upcoming/1 document with the open
 *  licence. opts.fetch (the browser's by default) and opts.search (the version query of this module's URL). */
export async function loadCuratedUpcoming({ fetch: get = globalThis.fetch, search = null } = {}) {
  if (typeof get !== "function") return null;
  const q = search != null ? search : (() => { try { return new URL(import.meta.url).search; } catch { return ""; } })();
  try {
    const res = await get(CURATED_PATH + q, { cache: "no-cache" });
    if (!res || !res.ok) return null;
    const doc = await res.json();
    return isUpcomingDoc(doc) && doc.licence === "open" ? doc : null;
  } catch {
    return null;
  }
}

let curatedMemo = null;
/**
 * The locked listing's entry for this page load: { entry, source }. live is the host's loader of data/upcoming.json
 * (views/fields.js upcomingDoc, or null when the site has no data); the bundled copy is read once (a failure is
 * tried again next time). Never throws.
 */
export async function loadLockEntry({ live = null, fetch: get = globalThis.fetch } = {}) {
  let liveDoc = null;
  try { liveDoc = typeof live === "function" ? await live() : live || null; } catch { liveDoc = null; }
  if (lockEntry(liveDoc)) return pickLockEntry(liveDoc, null);
  if (!curatedMemo) curatedMemo = loadCuratedUpcoming({ fetch: get }).then((d) => { if (!d) curatedMemo = null; return d; });
  return pickLockEntry(liveDoc, await curatedMemo);
}
