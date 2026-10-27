// The $500-a-month plan scaled to a friend's amounts and, if they choose one, their own mix. Pure ES
// module: no DOM, no fetch and no imports, so the app and its tests load the same file.
//
// Money is worked in integer cents. Each order date has its own amount (the usual monthly amount unless
// the friend set one for that month) and is worked out in one of two modes:
// - plan mode (the month follows the plan's mix): the base plan's orders for that month's money, each
//   scaled to the month's amount and rounded half up to whole dollars; the month's VWRA order takes what
//   is left, cents included, and must keep at least $1. An order under its minimum rolls into the VWRA
//   order of the month whose money pays for it.
// - own mode (the month follows the friend's own mix): every holding with a share above 0 is bought on
//   that month's order date from that month's money, rounded down to whole dollars so the month never
//   overspends; VWRA takes the rest (it may be $0). See scaleOwnMonth.
// Either way every month totals exactly its amount and the year exactly the sum of the months. Plan text
// that quotes money is rebuilt from the plan's own templates (base.templates).

export const BASE_MONTHLY_USD = 500; // the amount friends/data/base-plan.json is written for
export const MIN_MONTHLY_USD = 25;
export const MAX_MONTHLY_USD = 10000;
/** Smallest order per order style, in dollars: SwissBorg's smallest exchange is €5 (coins), the plan's
 *  own practice run buys $5 of a US stock (fractional), whole-share funds have none when the plan is
 *  built (a fund order that buys 0 shares at the day's price is a runtime matter, the leftover rule). */
export const DEFAULT_MIN_ORDER_USD = Object.freeze({ usd_amount: 6, fractional_usd: 5, whole_usd: 0 });
/** In plan mode a month's VWRA order keeps at least this many cents: it takes the cents, every carry and
 *  every rolled order, and it is the only order in some months. */
export const VWRA_FLOOR_CENTS = 100;
/** A share in a friend's mix is an integer number of tenths of a percent of a steady year, 0 to this. */
export const MIX_TENTHS_MAX = 1000;

const TOKEN = /\{([$฿#%])([A-Za-z0-9:-]+)\}/g; // the plan text's tokens (see the templates section)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_ID = /^m\d\d$/;
const OWN_ORDER_ID = /^(m\d\d)-([A-Za-z0-9]{1,20})$/; // own mode: "<dateId>-<instrumentId>", e.g. m03-BTC
const OWN_TRANSFER_ID = /^S-(m\d\d)$/; // own mode: that month's SwissBorg transfer, e.g. S-m03
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

// ---------- integer money ----------

const toCents = (x) => Math.round(x * 100);
/** n / d rounded half away from zero, for integers (d > 0). */
const divRound = (n, d) => Math.sign(n) * Math.floor((2 * Math.abs(n) + d) / (2 * d));
/** n / d rounded down, for integers n >= 0 and d > 0, without a floating-point division. */
const divFloor = (n, d) => (n - (n % d)) / d;
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function rateCents(rate) {
  const c = typeof rate === "number" && Number.isFinite(rate) ? Math.round(rate * 100) : NaN;
  if (!(c >= 1)) throw new RangeError("The exchange rate must be a positive number of baht per dollar.");
  return c;
}

/** Baht -> dollars at `rate` baht per dollar, both to two decimals, the result rounded half up to the cent
 *  (฿5,000 at 33 -> 151.52). Integer maths, so the same input always gives the same cents. */
export function thbToUsd(thb, rate) {
  if (typeof thb !== "number" || !Number.isFinite(thb)) throw new RangeError("The baht amount must be a number.");
  return divRound(toCents(thb) * 100, rateCents(rate)) / 100;
}

/** Dollars -> baht at `rate` baht per dollar, rounded half up to the satang. */
export function usdToThb(usd, rate) {
  if (typeof usd !== "number" || !Number.isFinite(usd)) throw new RangeError("The dollar amount must be a number.");
  return divRound(toCents(usd) * rateCents(rate), 100) / 100;
}

/** "$1,234" or "$137.50": cents only when the value has cents; "—" for anything that is not a number. */
export function fmtMoney(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  const c = Math.round(Math.abs(x) * 100);
  const dp = c % 100 ? 2 : 0;
  return (x < 0 && c ? "−$" : "$") + (c / 100).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** "฿5,000" or "฿5,000.50": an amount of baht as typed, with satang only when it has them. */
export function fmtBaht(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  const c = Math.round(Math.abs(x) * 100);
  const dp = c % 100 ? 2 : 0;
  return (x < 0 && c ? "−฿" : "฿") + (c / 100).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** True when x is a monthly amount scalePlan accepts ($25 to $10,000, counted to the cent). */
export function isMonthlyUsdInRange(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return false;
  const c = toCents(x);
  return c >= MIN_MONTHLY_USD * 100 && c <= MAX_MONTHLY_USD * 100;
}

// ---------- refusals ----------

/**
 * Why no plan can be built for these amounts, this mix or this input. A RangeError, so code that caught
 * a RangeError for a bad amount still does. `code` and its details:
 * - "month_range" {dateId}: a month's amount (dateId null: the usual amount) is not $25 to $10,000;
 * - "mix_value" {id, dateId}: a share names VWRA or an unknown holding, or is not an integer 0 to 1000;
 * - "mix_total" {dateId}: the shares of a mix (dateId null: the standing one) add up to more than 100%;
 * - "vwra_none" {months: [{dateId, othersCents, amountCents, instruments}]}: in plan mode, a month's
 *   other orders leave VWRA less than $1 (every such month is listed);
 * - "input" {dateId}: the amount as typed (dateId null: the usual amount's) does not give its dollars;
 * - "text" {}: an order would roll that the plan's text cannot do without.
 * The message is a plain sentence.
 */
export class PlanFitError extends RangeError {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PlanFitError";
    this.code = code;
    Object.assign(this, details);
  }
}

// ---------- paths (/key/key/..., an array item by index or by its "id") ----------

function step(node, key) {
  if (Array.isArray(node)) {
    if (/^\d+$/.test(key)) return { ok: Number(key) < node.length, key: Number(key) };
    const k = node.findIndex((x) => x && typeof x === "object" && x.id === key);
    return { ok: k >= 0, key: k, missingId: k < 0 ? key : null };
  }
  if (node && typeof node === "object") return { ok: Object.prototype.hasOwnProperty.call(node, key), key };
  return { ok: false, key };
}

function locate(obj, path) {
  if (typeof path !== "string" || !path.startsWith("/")) throw new Error(`Bad plan path "${path}".`);
  const keys = path.slice(1).split("/");
  let node = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const s = step(node, keys[i]);
    if (!s.ok) return { found: false, missingId: s.missingId };
    node = node[s.key];
  }
  const s = step(node, keys[keys.length - 1]);
  return s.ok ? { found: true, parent: node, key: s.key } : { found: false, missingId: s.missingId };
}

/** The value at a plan path ("/orders/p05/note", "/dateNotes/m01/0"), or undefined. */
export function getPath(obj, path) {
  const at = locate(obj, path);
  return at.found ? at.parent[at.key] : undefined;
}

// ---------- the base plan ----------

const style = (o) => (o.fractional ? "fractional_usd" : o.wholeShares ? "whole_usd" : "usd_amount");

/** The id of an own-mode order: "<dateId>-<instrumentId>", e.g. "m03-BTC". */
export const ownOrderId = (dateId, instrumentId) => `${dateId}-${instrumentId}`;
/** The id of an own-mode month's SwissBorg transfer: "S-<dateId>", e.g. "S-m03". */
export const ownTransferId = (dateId) => `S-${dateId}`;
/** The order date id an own-mode order or transfer id belongs to ("m03-BTC" and "S-m03" give "m03"),
 *  or null for any other id (the base plan's p01..p28, S01, W01..W12). */
export function ownIdMonth(id) {
  if (typeof id !== "string") return null;
  const m = OWN_ORDER_ID.exec(id) || OWN_TRANSFER_ID.exec(id);
  return m ? m[1] : null;
}

/**
 * The funding month (an order date id) whose money pays for each order: { orderId: dateId }. For the
 * base plan an account with a transfer for that date pays it then, and an account with a single transfer
 * (SwissBorg) pays all its orders then: p05 and p06 (ether and solana on 12 Jan) belong to m01, because
 * S01 goes with November's money. A scaled plan works too: an own-mode order is paid by its own month,
 * and own-mode transfers (S-mNN) are left out of the base rule.
 */
export function fundingMonthOf(plan) {
  const byAccount = new Map();
  for (const t of plan.funding.transfers) {
    if (OWN_TRANSFER_ID.test(t.id)) continue;
    if (!byAccount.has(t.to)) byAccount.set(t.to, []);
    byAccount.get(t.to).push(t);
  }
  const of = {};
  for (const o of plan.orders) {
    if (OWN_ORDER_ID.test(o.id)) { of[o.id] = o.dateId; continue; }
    const own = byAccount.get(o.account) || [];
    if (own.some((t) => t.forDate === o.dateId)) of[o.id] = o.dateId;
    else if (own.length === 1) of[o.id] = own[0].forDate;
    else throw new Error(`scalePlan: no transfer pays for order ${o.id}.`);
  }
  return of;
}

/** Throws unless `base` is a monthly plan whose every funding month adds up to its monthly amount,
 *  with one carryTarget (VWRA) order per date and each transfer paying exactly its orders. */
function checkBase(base) {
  if (!base || typeof base !== "object" || !base.funding || base.funding.mode !== "monthly") throw new Error("scalePlan: not a monthly plan (funding.mode is not \"monthly\").");
  const Bc = toCents(base.funding.monthlyUsd);
  if (!(Bc > 0) || !Array.isArray(base.orders) || !Array.isArray(base.orderDates) || !Array.isArray(base.funding.transfers)) throw new Error("scalePlan: the base plan is incomplete.");
  const fm = fundingMonthOf(base);
  const pair = (account, dateId) => `${account}\u0000${dateId}`;
  const targetsOf = {}, monthC = {}, pairC = {};
  for (const o of base.orders) {
    if (o.carryTarget) (targetsOf[o.dateId] || (targetsOf[o.dateId] = [])).push(o);
    monthC[fm[o.id]] = (monthC[fm[o.id]] || 0) + toCents(o.usd);
    pairC[pair(o.account, fm[o.id])] = (pairC[pair(o.account, fm[o.id])] || 0) + toCents(o.usd);
  }
  for (const d of base.orderDates) {
    const targets = targetsOf[d.id] || [];
    if (targets.length !== 1 || fm[targets[0].id] !== d.id) throw new Error(`scalePlan: ${d.id} needs exactly one carryTarget order paid that month.`);
    const sum = monthC[d.id] || 0;
    if (sum !== Bc) throw new Error(`scalePlan: the money for ${d.id} adds up to ${fmtMoney(sum / 100)}, not ${fmtMoney(Bc / 100)}.`);
  }
  for (const t of base.funding.transfers) {
    const sum = pairC[pair(t.to, t.forDate)] || 0;
    if (sum !== toCents(t.usd)) throw new Error(`scalePlan: transfer ${t.id} is not the sum of the orders it pays.`);
  }
  // What the per-month amounts and own mode rely on: order dates m01..m99 that every order uses, one
  // transfer per account and month, and ids that can never be mistaken for own-mode ids.
  const dateIds = new Set(base.orderDates.map((d) => d.id));
  for (const d of base.orderDates) if (!DATE_ID.test(d.id) || !ISO_DATE.test(d.date)) throw new Error(`scalePlan: order date ${d.id} needs an id m01..m99 and a date.`);
  for (const o of base.orders) {
    if (!dateIds.has(o.dateId)) throw new Error(`scalePlan: order ${o.id} is not on one of the plan's order dates.`);
    if (ownIdMonth(o.id)) throw new Error(`scalePlan: order id ${o.id} looks like an own-mode id.`);
  }
  const pairs = new Set();
  for (const t of base.funding.transfers) {
    if (ownIdMonth(t.id)) throw new Error(`scalePlan: transfer id ${t.id} looks like an own-mode id.`);
    if (pairs.has(pair(t.to, t.forDate))) throw new Error(`scalePlan: two transfers to ${t.to} pay for ${t.forDate}.`);
    pairs.add(pair(t.to, t.forDate));
  }
  return { Bc, fm };
}

/** What the scaling needs to know about the base: the month (Bc) and example year (Yc) in cents, the
 *  cents one tenth of a percent buys (U), each order's funding month and transfer, each month's VWRA
 *  order, the fund that takes the rest (restId), each instrument's yearly cents (B) and the holdings a
 *  mix can name. */
function baseFacts(base) {
  const { Bc, fm } = checkBase(base);
  const Yc = base.orderDates.length * Bc;
  if (!Number.isSafeInteger(Yc) || Yc % MIX_TENTHS_MAX !== 0) throw new Error("scalePlan: the example year is not a whole number of cents per tenth of a percent.");
  const target = {}, B = {}, payer = {};
  const transferOf = new Map(base.funding.transfers.map((t) => [`${t.to}\u0000${t.forDate}`, t.id]));
  for (const o of base.orders) {
    if (o.carryTarget) target[o.dateId] = o;
    B[o.instrument] = (B[o.instrument] || 0) + toCents(o.usd);
    payer[o.id] = transferOf.get(`${o.account}\u0000${fm[o.id]}`);
  }
  const restIds = new Set(Object.values(target).map((o) => o.instrument));
  if (restIds.size !== 1) throw new Error("scalePlan: every month's carryTarget order must be the same fund.");
  const restId = [...restIds][0];
  const holdings = (base.instruments || []).map((i) => i.id).filter((id) => id !== restId && B[id] > 0);
  return { Bc, Yc, U: Yc / MIX_TENTHS_MAX, fm, target, restId, B, holdings, payer };
}

function minimums(given) {
  const out = { ...DEFAULT_MIN_ORDER_USD };
  for (const [k, v] of Object.entries(given || {})) {
    if (!(k in out)) throw new RangeError(`Unknown order style "${k}" in minOrderUsd.`);
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new RangeError(`minOrderUsd.${k} must be a number of dollars, 0 or more.`);
    out[k] = v;
  }
  return out;
}

/** The plan's exact share of each instrument, as cents of the $500 example year: { VWRA: 415000, ... }. */
export function planShares(base) {
  const F = baseFacts(base);
  return Object.fromEntries((base.instruments || []).filter((i) => F.B[i.id] > 0).map((i) => [i.id, F.B[i.id]]));
}

// ---------- the friend's months and mix ----------

const monthWord = (base, dateId) => {
  const d = base.orderDates.find((x) => x.id === dateId);
  return d ? MONTH_NAMES[Number(d.date.slice(5, 7)) - 1] : String(dateId);
};
const instName = (base, id) => ((base.instruments || []).find((i) => i.id === id) || {}).name || String(id).slice(0, 24);

/** opts.months checked for shape: { dateId: {usd?, input?, mix?} } with base order date ids only. */
function monthEntries(base, months) {
  if (months == null) return {};
  if (typeof months !== "object" || Array.isArray(months)) throw new RangeError("The month amounts must be an object keyed by order date.");
  const ids = new Set(base.orderDates.map((d) => d.id));
  for (const [k, v] of Object.entries(months)) {
    if (!ids.has(k)) throw new RangeError(`"${String(k).slice(0, 24)}" is not one of the plan's order dates.`);
    if (v != null && (typeof v !== "object" || Array.isArray(v))) throw new RangeError(`The entry for ${k} must be an object.`);
  }
  return months;
}

/** Each month's cents: its own amount, else the usual one. Check 1 (month_range). */
function monthCents(base, monthlyUsd, months) {
  const A = {};
  for (const d of base.orderDates) {
    const e = months[d.id];
    const x = e && e.usd != null ? e.usd : monthlyUsd;
    if (!isMonthlyUsdInRange(x)) throw new PlanFitError("month_range", `The amount for ${monthWord(base, d.id)} must be from ${fmtMoney(MIN_MONTHLY_USD)} to ${fmtMoney(MAX_MONTHLY_USD)}.`, { dateId: d.id });
    A[d.id] = toCents(x);
  }
  if (!isMonthlyUsdInRange(monthlyUsd)) throw new PlanFitError("month_range", `The monthly amount must be a number from ${fmtMoney(MIN_MONTHLY_USD)} to ${fmtMoney(MAX_MONTHLY_USD)}.`, { dateId: null });
  return A;
}

/** A mix checked share by share (check 2, mix_value); null and undefined are the plan's mix, {}. */
function checkMixValues(F, base, mix, dateId) {
  if (mix == null) return {};
  if (typeof mix !== "object" || Array.isArray(mix)) throw new PlanFitError("mix_value", "The mix must be a set of shares, one per holding.", { id: null, dateId });
  for (const [id, q] of Object.entries(mix)) {
    if (!F.holdings.includes(id)) {
      throw new PlanFitError("mix_value", id === F.restId
        ? `${id} takes the rest of each month, so it has no share of its own.`
        : `The mix can only name the plan's funds, stocks and coins, and "${String(id).slice(0, 24)}" is not one of them.`, { id, dateId });
    }
    if (!Number.isInteger(q) || q < 0 || q > MIX_TENTHS_MAX) throw new PlanFitError("mix_value", `${instName(base, id)}: type a percentage from 0 to 100, with at most one decimal, for example 2.5.`, { id, dateId });
  }
  return mix;
}

/** Example-year cents each holding gets under `mix`: a typed share's tenths, else the plan's own share. */
const mixWeight = (F, mix, id) => (has(mix, id) ? mix[id] * F.U : F.B[id]);

/** Check 3 (mix_total): the holdings other than VWRA may take all of a steady year, never more. */
function checkMixTotal(F, base, mix, dateId) {
  const total = F.holdings.reduce((a, id) => a + mixWeight(F, mix, id), 0);
  if (total > F.Yc) throw new PlanFitError("mix_total", dateId ? `In ${monthWord(base, dateId)}, your shares add up to more than 100%.` : "Your shares add up to more than 100%.", { dateId });
}

/**
 * The group targets for the Holdings split and the maintenance line: { index, growth } as percentages
 * to one decimal (the groups with a rebalance target in the base). The plan's own targets when `mix` is
 * empty; otherwise each holding's example-year cents under the mix, VWRA taking the rest, the first group
 * rounded and the last taking what is left of 100.0. Both are null when the mix leaves no fund or stock
 * money at all. Throws a PlanFitError for a mix that is not valid.
 */
export function groupTargets(base, mix = {}) {
  const F = baseFacts(base);
  const m = checkMixValues(F, base, mix, null);
  checkMixTotal(F, base, m, null);
  return groupTargetsOf(F, base, m);
}

function groupTargetsOf(F, base, mix) {
  const groups = (base.groups || []).filter((g) => g.rebalanceTargetPct != null);
  if (!Object.keys(mix).length) return Object.fromEntries(groups.map((g) => [g.id, g.rebalanceTargetPct]));
  const w = {};
  let rest = F.Yc;
  for (const id of F.holdings) { w[id] = mixWeight(F, mix, id); rest -= w[id]; }
  w[F.restId] = rest;
  const tot = Object.fromEntries(groups.map((g) => [g.id, (base.instruments || []).filter((i) => i.group === g.id).reduce((a, i) => a + (w[i.id] || 0), 0)]));
  const all = groups.reduce((a, g) => a + tot[g.id], 0);
  if (!all) return Object.fromEntries(groups.map((g) => [g.id, null]));
  const out = {};
  let left = 1000;
  groups.forEach((g, k) => {
    const tenths = k === groups.length - 1 ? left : Math.round((1000 * tot[g.id]) / all);
    out[g.id] = tenths / 10;
    left -= tenths;
  });
  return out;
}

// ---------- own mode: a month that follows the friend's own mix ----------

/** What own mode needs from the base, worked out once per call: a model order per instrument (its
 *  first base order: account, kind, style, ceiling, thesis check), the clock of each venue, and which
 *  account gets a transfer of its own in each own-mode month (SwissBorg, which the base pays once). */
function ownFacts(base, F) {
  const inst = Object.fromEntries((base.instruments || []).map((i) => [i.id, i]));
  const model = {};
  for (const o of base.orders) if (!model[o.instrument]) model[o.instrument] = o;
  const ids = [F.restId, ...F.holdings];
  for (const id of ids) if (!/^[A-Za-z0-9]{1,20}$/.test(id) || !inst[id] || !model[id]) throw new Error(`scalePlan: ${String(id).slice(0, 24)} cannot be bought with an own mix.`);
  const transfers = base.funding.transfers;
  const perMonth = new Set([...new Set(transfers.map((t) => t.to))].filter((a) => base.orderDates.every((d) => transfers.some((t) => t.to === a && t.forDate === d.id))));
  const others = [...new Set(ids.map((id) => model[id].account))].filter((a) => !perMonth.has(a));
  if (others.length > 1) throw new Error("scalePlan: an own mix can give only one account a transfer of its own each month.");
  const ownTo = others.length ? others[0] : null;
  const ownModel = ownTo ? transfers.find((t) => t.to === ownTo) : null;
  if (ownTo && !ownModel) throw new Error(`scalePlan: ${ownTo} has no transfer to copy for an own mix.`);
  // A venue keeps the clock of its latest base order on or before the date, else of its first one (US
  // orders are at 22:30 Bangkok time before US daylight saving and 21:30 after it).
  const dateOf = Object.fromEntries(base.orderDates.map((d) => [d.id, d.date]));
  const clocks = {};
  for (const o of base.orders) {
    const v = (inst[o.instrument] && inst[o.instrument].venue) || o.instrument;
    (clocks[v] || (clocks[v] = [])).push([dateOf[o.dateId], o.time]);
  }
  for (const list of Object.values(clocks)) list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const venueOf = (id) => inst[id].venue || id;
  const timeOf = (id, date) => {
    const list = clocks[venueOf(id)];
    let t = list[0][1];
    for (const [d, time] of list) if (d <= date) t = time;
    return t;
  };
  const rank = Object.fromEntries((base.instruments || []).map((i, k) => [i.id, k]));
  return { inst, model, ids, perMonth, ownTo, ownModel, dateOf, timeOf, rank };
}

/** One own-mode order: the instrument's model order on another date, with an own-mode id, the venue's
 *  clock that day and its amount. Text that belongs to the plan's own order (note, then) and the
 *  January-coins flag (cryptoWait) are not copied: this order is paid by its own month. */
const NOT_COPIED = new Set(["note", "then", "cryptoWait"]);
function ownOrder(O, id, dateId, cents) {
  const o = {};
  for (const [k, v] of Object.entries(O.model[id])) if (!NOT_COPIED.has(k)) o[k] = v; // the model's key order
  return Object.assign(o, { id: ownOrderId(dateId, id), dateId, time: O.timeOf(id, O.dateOf[dateId]), usd: cents / 100 });
}

function ownMonth(F, O, dateId, Ac, mix, minOrderUsd) {
  const into = ownOrderId(dateId, F.restId);
  const cents = {};
  const rolled = [];
  let spent = 0;
  for (const id of F.holdings) {
    const typed = has(mix, id);
    if (typed && mix[id] === 0) continue; // not in the mix: no order, and not a roll
    // The month's cents times the share: typed tenths of a percent, or the plan's exact yearly share.
    const num = Ac * (typed ? mix[id] : F.B[id]);
    const den = typed ? MIX_TENTHS_MAX : F.Yc;
    if (!Number.isSafeInteger(num)) throw new Error(`scalePlan: ${id} in ${dateId} is too large to work out exactly.`);
    const dollars = divFloor(num, 100 * den);
    const m = O.model[id], st = style(m), min = minOrderUsd[st];
    if (dollars <= 0 || dollars < min) {
      rolled.push({ id: ownOrderId(dateId, id), instrument: id, account: m.account, dateId, fundDateId: dateId, into, usd: dollars, exactUsd: divRound(num, den) / 100, minUsd: min, style: st, reason: "below_min" });
    } else {
      cents[id] = dollars * 100;
      spent += dollars * 100;
    }
  }
  cents[F.restId] = Ac - spent;
  if (cents[F.restId] < 0) throw new Error(`scalePlan: ${dateId} spends more than its amount.`);
  const date = O.dateOf[dateId];
  const clock = (id) => { const t = O.timeOf(id, date); return t === "any" ? "" : t; };
  const order = O.ids.filter((id) => cents[id] != null)
    .sort((a, b) => (clock(a) < clock(b) ? -1 : clock(a) > clock(b) ? 1 : O.rank[a] - O.rank[b]));
  return { orders: order.map((id) => ownOrder(O, id, dateId, cents[id])), rolled };
}

/** "Bitcoin and ether on 12 Jan": what an own-mode month's SwissBorg transfer pays for. */
function coinsPays(O, coins, date) {
  const names = coins.map((o) => String(O.inst[o.instrument].name || o.instrument).toLowerCase());
  const list = names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} on ${Number(date.slice(8, 10))} ${MONTH_SHORT[Number(date.slice(5, 7)) - 1]}`;
}

/**
 * Own mode for one month: the orders when the friend's own mix is in force on order date `dateId` and
 * `monthUsd` is that month's amount. Every holding whose share is above 0 is bought that day from that
 * month's money: a typed share is `mix[id]` tenths of a percent of the month, a holding left out of `mix`
 * keeps the plan's exact yearly share. Each order is rounded down to whole dollars, and one under its
 * style's minimum is not bought (rolled, reason "below_min"); a 0% holding has no order at all. VWRA
 * takes what is left, cents included: $0 or more, and its order is always there. Order ids are
 * "<dateId>-<instrumentId>". Returns { orders, rolled }; scaleAmounts adds the transfers.
 */
export function scaleOwnMonth(base, dateId, monthUsd, mix = {}, opts = {}) {
  const F = baseFacts(base);
  if (!base.orderDates.some((d) => d.id === dateId)) throw new RangeError(`"${String(dateId).slice(0, 24)}" is not one of the plan's order dates.`);
  if (!isMonthlyUsdInRange(monthUsd)) throw new PlanFitError("month_range", `The amount for ${monthWord(base, dateId)} must be from ${fmtMoney(MIN_MONTHLY_USD)} to ${fmtMoney(MAX_MONTHLY_USD)}.`, { dateId });
  const minOrderUsd = minimums(opts && opts.minOrderUsd);
  const m = checkMixValues(F, base, mix, dateId);
  checkMixTotal(F, base, m, dateId);
  return ownMonth(F, ownFacts(base, F), dateId, toCents(monthUsd), m, minOrderUsd);
}

// ---------- scaling ----------

/**
 * The numbers only: `base` at the friend's amounts and mix, with orders under their minimum rolled into
 * VWRA (removed from orders, listed in `rolled`). Text is left as it was; scalePlan is this plus the
 * templates. Pure: `base` is never changed.
 * - monthlyUsd: the usual amount, for every month without one of its own ($25 to $10,000);
 * - opts.months: { dateId: { usd?, mix? } }, a month's own amount and its own (pinned) mix;
 * - opts.mix: the standing mix, { instrumentId: tenths of a percent }, for every month without its own;
 * - opts.minOrderUsd: per-style minimums (DEFAULT_MIN_ORDER_USD).
 * A month whose mix is empty is in plan mode, any other month in own mode (see the top of the file).
 * Checks, in this order: month_range, mix_value, mix_total, vwra_none (PlanFitError); a malformed base
 * or a product too large to be exact is a plain Error.
 * Returns { plan, rolled, minOrderUsd, months: { dateId: dollars }, droppedTransfers: [base transfer
 * ids with nothing to pay], ownMonths: [dateIds in own mode], replaced: [base order ids whose month is
 * in own mode] }. With no months and no mix, plan and rolled are exactly those of the one-amount engine.
 */
export function scaleAmounts(base, monthlyUsd, opts = {}) {
  const F = baseFacts(base);
  const o = opts || {};
  const months = monthEntries(base, o.months);
  const A = monthCents(base, monthlyUsd, months);
  const Mc = toCents(monthlyUsd);
  const minOrderUsd = minimums(o.minOrderUsd);
  const mix = checkMixValues(F, base, o.mix, null);
  const W = {};
  for (const d of base.orderDates) {
    const e = months[d.id];
    W[d.id] = e && e.mix != null ? checkMixValues(F, base, e.mix, d.id) : mix;
  }
  checkMixTotal(F, base, mix, null);
  for (const d of base.orderDates) if (W[d.id] !== mix) checkMixTotal(F, base, W[d.id], d.id);
  const ownMonths = base.orderDates.filter((d) => Object.keys(W[d.id]).length > 0).map((d) => d.id);
  const own = new Set(ownMonths);

  const plan = structuredClone(base);
  const cents = {};
  const rolled = [];
  // Plan mode: each base order scaled to its funding month's amount.
  for (const x of plan.orders) {
    const f = F.fm[x.id];
    if (x.carryTarget || own.has(f)) continue;
    const scaled = A[f] * toCents(x.usd); // the exact amount is scaled / Bc cents
    if (!Number.isSafeInteger(scaled)) throw new Error(`scalePlan: ${x.id} is too large to work out exactly.`);
    const dollars = divRound(scaled, 100 * F.Bc);
    const min = minOrderUsd[style(x)];
    if (dollars <= 0 || dollars < min) {
      rolled.push({ id: x.id, instrument: x.instrument, account: x.account, dateId: x.dateId, fundDateId: f, into: F.target[f].id, usd: dollars, exactUsd: divRound(scaled, F.Bc) / 100, minUsd: min, style: style(x), reason: "below_min" });
    } else cents[x.id] = dollars * 100;
  }
  const full = [];
  for (const d of plan.orderDates) {
    if (own.has(d.id)) continue;
    const tid = F.target[d.id].id;
    const others = plan.orders.filter((x) => F.fm[x.id] === d.id && x.id !== tid && cents[x.id] != null);
    const spent = others.reduce((a, x) => a + cents[x.id], 0);
    cents[tid] = A[d.id] - spent;
    if (A[d.id] - spent < VWRA_FLOOR_CENTS) full.push({ dateId: d.id, othersCents: spent, amountCents: A[d.id], instruments: others.map((x) => x.instrument) });
  }
  if (full.length) {
    const f0 = full[0], m0 = monthWord(base, f0.dateId);
    throw new PlanFitError("vwra_none", `In ${m0}, the other orders would take ${fmtMoney(f0.othersCents / 100)} of ${m0}'s ${fmtMoney(f0.amountCents / 100)}. VWRA needs at least ${fmtMoney(VWRA_FLOOR_CENTS / 100)} of every month.`, { months: full });
  }

  let orders = plan.orders.filter((x) => cents[x.id] != null).map((x) => ({ ...x, usd: cents[x.id] / 100 }));
  const payer = { ...F.payer };
  let O = null;
  if (ownMonths.length) {
    // Own mode: each own month's orders replace the base orders its money paid for.
    O = ownFacts(base, F);
    const blocks = {};
    for (const d of ownMonths) {
      const r = ownMonth(F, O, d, A[d], W[d], minOrderUsd);
      blocks[d] = r.orders;
      rolled.push(...r.rolled);
      // An account with a transfer every month (Interactive Brokers) is paid by that month's one; the
      // other (SwissBorg) gets a transfer of its own for the month, S-mNN.
      for (const x of r.orders) {
        cents[x.id] = toCents(x.usd);
        if (O.perMonth.has(x.account)) payer[x.id] = plan.funding.transfers.find((t) => t.to === x.account && t.forDate === d).id;
        else if (x.account === O.ownTo) payer[x.id] = ownTransferId(d);
        else throw new Error(`scalePlan: no transfer can pay for ${x.id}.`);
      }
    }
    orders = plan.orderDates.flatMap((d) => [...orders.filter((x) => x.dateId === d.id), ...(blocks[d.id] || [])]);
  }
  plan.orders = orders;

  const sum = (os) => os.reduce((a, x) => a + cents[x.id], 0);
  for (const d of plan.orderDates) d.ibkrTotalUsd = sum(plan.orders.filter((x) => x.dateId === d.id && x.account === "IBKR")) / 100;
  const paid = {};
  for (const x of plan.orders) paid[payer[x.id]] = (paid[payer[x.id]] || 0) + cents[x.id];
  const transfers = [];
  const droppedTransfers = [];
  const done = new Set();
  const ownTransfer = (d) => {
    if (done.has(d)) return;
    done.add(d);
    const id = ownTransferId(d);
    if (!(paid[id] > 0)) return;
    const month = base.funding.transfers.find((t) => O.perMonth.has(t.to) && t.forDate === d) || O.ownModel;
    const coins = plan.orders.filter((x) => payer[x.id] === id);
    transfers.push({ ...structuredClone(O.ownModel), id, usd: paid[id] / 100, send: month.send, arriveBy: month.arriveBy, forDate: d, pays: coinsPays(O, coins, O.dateOf[d]) });
  };
  for (const t of plan.funding.transfers) {
    if (own.has(t.forDate)) ownTransfer(t.forDate);
    const usd = (paid[t.id] || 0) / 100;
    if (usd > 0) transfers.push({ ...t, usd });
    else droppedTransfers.push(t.id);
  }
  for (const d of ownMonths) ownTransfer(d);
  plan.funding.transfers = transfers;

  const yearC = plan.orderDates.reduce((a, d) => a + A[d.id], 0);
  for (const i of plan.instruments) {
    i.targetUsd = sum(plan.orders.filter((x) => x.instrument === i.id)) / 100;
    i.sharePct = Math.round((i.targetUsd / (yearC / 100)) * 1000) / 10;
  }
  if (Object.keys(mix).length) {
    const g = groupTargetsOf(F, base, mix);
    for (const grp of plan.groups || []) if (has(g, grp.id)) grp.rebalanceTargetPct = g[grp.id];
  }
  plan.funding.monthlyUsd = Mc / 100;
  Object.assign(plan.meta, {
    budgetUsd: yearC / 100,
    monthlyUsd: Mc / 100,
    investUsd: yearC / 100,
    stockMoneyUsd: sum(plan.orders.filter((x) => x.account === "IBKR")) / 100,
    orderCount: plan.orders.length,
  });
  return {
    plan, rolled, minOrderUsd,
    months: Object.fromEntries(plan.orderDates.map((d) => [d.id, A[d.id] / 100])),
    droppedTransfers,
    ownMonths,
    replaced: base.orders.filter((x) => own.has(F.fm[x.id])).map((x) => x.id),
  };
}

// ---------- the friend's amount as entered ----------

/** {currency, amount, rate, rateSource, rateDate, usd} for plan.scale.input; throws a RangeError when
 *  the entry is malformed or does not give `Mc` cents (baht are converted with thbToUsd). */
function inputRecord(input, Mc) {
  if (input == null) return null;
  if (typeof input !== "object") throw new RangeError("The input record must be an object.");
  const { currency, amount } = input;
  if (currency !== "USD" && currency !== "THB") throw new RangeError("The input currency must be USD or THB.");
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) throw new RangeError("The input amount must be a number.");
  const rate = input.rate == null && currency === "USD" ? null : rateCents(input.rate) / 100;
  const usdC = currency === "THB" ? toCents(thbToUsd(amount, rate)) : toCents(amount);
  if (usdC !== Mc) throw new RangeError(`The ${currency} amount entered gives ${fmtMoney(usdC / 100)}, not ${fmtMoney(Mc / 100)}.`);
  const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : null);
  const rateDate = typeof input.rateDate === "string" && ISO_DATE.test(input.rateDate) ? input.rateDate : null;
  return { currency, amount, rate, rateSource: text(input.rateSource, 80), rateDate, usd: Mc / 100 };
}

/** inputRecord, with its refusal as a PlanFitError "input" that names the month (null: the usual amount). */
function checkedInput(base, input, Mc, dateId) {
  try {
    return inputRecord(input, Mc);
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    const msg = dateId ? `For ${monthWord(base, dateId)}, ${e.message.charAt(0).toLowerCase()}${e.message.slice(1)}` : e.message;
    throw new PlanFitError("input", msg, { dateId });
  }
}

// ---------- templates ----------
//
// base.templates (friends/plan-templates.json) maps a plan path to its text: a string, or a list of
// versions [{if: [...], text}] whose first match is used. A condition names an id and holds when the plan
// has it ("!" before it: when it does not):
// - an order of the base plan ("p05"): bought; not bought when it rolled into VWRA (plan.scale.rolled) or
//   when its month follows the friend's own mix (plan.scale.replaced);
// - a transfer of the base plan ("S01", "W03"): in the plan; not when it has nothing to pay
//   (plan.scale.droppedTransfers);
// - an own-mode order or transfer ("m03-BTC", "S-m03", where "m*" is any month): in the plan;
// - a group's target ("%g:index"): the group has one.
// "text": null removes the nearest array item on the path (scalePlan does that after every path is
// rendered). Tokens: {$...} dollars, {฿fx} the plan's baht per dollar, {%g:...} a group's target, and
// {#...} the orders of a date, which only this file renders: tools/build_friends.py renders the version
// the base plan picks, and that version never uses one.

/** "Three orders": a count of orders, as a word. */
const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty"];
/** A holding in a list of orders: funds by ticker, stocks by name, coins by their lower-case name, these
 *  by their own words. */
const LIST_WORDS = Object.freeze({ QNTM: "the quantum fund" });
/** A holding in a date's title, where it is not its list word. */
const TITLE_WORDS = Object.freeze({ XDEW: "equal-weight S&P 500", EIMI: "emerging markets", QNTM: "quantum fund" });
const OWN_REF = /^(?:(m(?:\*|\d\d))-([A-Za-z0-9]{1,20})|S-(m(?:\*|\d\d)))$/; // m03-BTC, m*-BTC, S-m03, S-m*
const GROUP_REF = /^%g:([A-Za-z0-9_-]{1,24})$/;
const SWISS = "SwissBorg";
const IBKR = "IBKR";

/** What the conditions and tokens of one plan read, worked out once per rendering. */
function textFacts(plan) {
  const s = plan.scale || {};
  const orders = new Set(plan.orders.map((o) => o.id));
  const transfers = new Set(plan.funding.transfers.map((t) => t.id));
  const ownInsts = new Set();
  for (const id of orders) { const m = OWN_ORDER_ID.exec(id); if (m) ownInsts.add(m[2]); }
  const byId = new Map(); // an order or transfer by its id (orders first, as {$...} looks them up)
  for (const t of plan.funding.transfers) byId.set(t.id, t);
  for (const o of plan.orders) byId.set(o.id, o);
  const onDate = new Map(plan.orderDates.map((d) => [d.id, []])); // each date's orders, in plan order
  for (const o of plan.orders) if (onDate.has(o.dateId)) onDate.get(o.dateId).push(o);
  return {
    orders, transfers, byId, onDate,
    gone: new Set([...(s.rolled || []).map((r) => r.id), ...(s.replaced || [])]),
    dropped: new Set(s.droppedTransfers || []),
    dates: new Map(plan.orderDates.map((d) => [d.id, d])),
    insts: new Set((plan.instruments || []).map((i) => i.id)),
    ownInsts, // the instruments some own-mode order buys ("m*-BTC")
    ownTransfer: [...transfers].some((id) => OWN_TRANSFER_ID.test(id)), // "S-m*"
  };
}

function unknownRef(where, ref) {
  return new Error(`Template ${where} names an unknown order "${String(ref).slice(0, 24)}".`);
}

/** One condition of a version (see the top of this section). */
function holds(plan, F, c, where) {
  if (typeof c !== "string" || !c) throw new Error(`Template ${where} has a condition that is not an id.`);
  const not = c.startsWith("!");
  const ref = not ? c.slice(1) : c;
  let present;
  if (F.orders.has(ref) || F.transfers.has(ref)) present = true;
  else if (F.gone.has(ref) || F.dropped.has(ref)) present = false;
  else if (OWN_REF.test(ref)) {
    const [, month, inst, sMonth] = OWN_REF.exec(ref);
    const m = month || sMonth;
    if (m !== "m*" && !F.dates.has(m)) throw unknownRef(where, ref);
    if (inst && !F.insts.has(inst)) throw unknownRef(where, ref);
    if (m !== "m*") present = false; // an own id the plan does not have
    else present = inst ? F.ownInsts.has(inst) : F.ownTransfer;
  } else if (GROUP_REF.test(ref)) {
    const g = (plan.groups || []).find((x) => x.id === GROUP_REF.exec(ref)[1]);
    if (!g) throw unknownRef(where, ref);
    present = g.rebalanceTargetPct != null;
  } else throw unknownRef(where, ref);
  return not ? !present : present;
}

/** The text of the first version whose conditions all hold: a string, or null to remove the item. */
function chooseText(plan, tpl, where, F) {
  if (typeof tpl === "string") return tpl;
  if (!Array.isArray(tpl)) throw new Error(`Template ${where} must be a string or a list of versions.`);
  for (const v of tpl) {
    if (!v || typeof v !== "object" || (v.if != null && !Array.isArray(v.if))) throw new Error(`Template ${where} has a version that is not {if, text}.`);
    if ((v.if || []).every((c) => holds(plan, F, c, where))) {
      if (v.text === null) return null;
      if (typeof v.text !== "string") throw new Error(`Template ${where} has a version without text.`);
      return v.text;
    }
  }
  throw new Error(`Template ${where} has no version for the orders bought at this amount.`);
}

/** fmtMoney, remembered: its number formatting is most of a plan's rendering time, and the same amounts
 *  come back on every date and every rendering. */
const MONEY_TEXT = new Map();
function money(usd) {
  let s = MONEY_TEXT.get(usd);
  if (s === undefined) {
    if (MONEY_TEXT.size >= 4096) MONEY_TEXT.clear();
    s = fmtMoney(usd);
    MONEY_TEXT.set(usd, s);
  }
  return s;
}

const joinWords = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const countWords = (n) => `${COUNT_WORDS[n] || String(n)} order${n === 1 ? "" : "s"}`;
const instOf = (plan, id) => (plan.instruments || []).find((i) => i.id === id) || { id, name: id };

/** A holding as a list names it (LIST_WORDS, else by its order's style). */
function listWord(plan, o) {
  if (has(LIST_WORDS, o.instrument)) return LIST_WORDS[o.instrument];
  const st = style(o);
  if (st === "whole_usd") return o.instrument;
  const name = String(instOf(plan, o.instrument).name || o.instrument);
  return st === "usd_amount" ? name.toLowerCase() : name;
}

/** A holding as a date's title names it (TITLE_WORDS, else as a list would). */
function titleWord(plan, id) {
  if (has(TITLE_WORDS, id)) return TITLE_WORDS[id];
  const i = instOf(plan, id);
  if (i.orderStyle === "whole_usd") return id;
  const name = String(i.name || id);
  return i.orderStyle === "usd_amount" ? name.toLowerCase() : name;
}

/** {#name:mNN}: the orders on one date, in words (see plan-templates.json's "about"). */
function dateToken(plan, F, ref, where) {
  const k = ref.indexOf(":");
  const name = ref.slice(0, k), dateId = ref.slice(k + 1);
  if (k < 1 || !F.dates.has(dateId)) throw new Error(`Template ${where}: unknown date in {#${ref}}.`);
  const os = F.onDate.get(dateId);
  const ibkr = os.filter((o) => o.account === IBKR);
  const coins = os.filter((o) => o.account === SWISS && !ownIdMonth(o.id));
  const mixCoins = os.filter((o) => o.account === SWISS && ownIdMonth(o.id));
  const need = (xs) => {
    if (!xs.length) throw new Error(`Template ${where}: {#${ref}} has no orders to name.`);
    return xs;
  };
  const words = (xs) => joinWords(need(xs).map((o) => listWord(plan, o)));
  switch (name) {
    case "count": return countWords(need(ibkr).length);
    case "countAll": return countWords(need(os).length);
    case "list": return joinWords(need(ibkr).map((o) => (o.usd > 0 ? `${listWord(plan, o)} ${money(o.usd)}` : `${listWord(plan, o)} for any leftover`)));
    case "names": return words(ibkr);
    case "Names": return capital(words(ibkr));
    case "coins": return words(coins);
    case "Coins": return capital(words(coins));
    case "mixCoins": return words(mixCoins);
    case "MixCoins": return capital(words(mixCoins));
    case "title": {
      // The date's holdings other than the one that takes the rest; "coins" stands in for the plan's own
      // coin orders on the date when none of them rolled.
      const ids = [...new Set(os.filter((o) => !o.carryTarget).map((o) => o.instrument))];
      const rolledCoins = ((plan.scale && plan.scale.rolled) || []).filter((r) => r.dateId === dateId && r.account === SWISS && !ownIdMonth(r.id));
      let parts = ids.map((id) => titleWord(plan, id));
      if (coins.length > 1 && !rolledCoins.length) {
        const c = new Set(coins.map((o) => o.instrument));
        parts = ["coins", ...ids.filter((id) => !c.has(id)).map((id) => titleWord(plan, id))];
      }
      if (!parts.length) return (os.find((o) => o.carryTarget) || { instrument: "VWRA" }).instrument;
      return parts.length === 2 ? parts.join(" + ") : parts.join(", ");
    }
    default: throw new Error(`Template ${where}: unknown token {#${ref}}.`);
  }
}

/** {$month}: "$500", or "$300 to $500" when the months' amounts differ. */
function monthText(plan, where) {
  const m = plan.scale && plan.scale.months && typeof plan.scale.months === "object" ? Object.values(plan.scale.months) : [];
  const c = m.filter((x) => typeof x === "number" && Number.isFinite(x)).map(toCents);
  if (!c.length) {
    const usd = plan.funding.monthlyUsd;
    if (typeof usd !== "number" || !Number.isFinite(usd)) throw new Error(`Template ${where}: unknown token {$month}.`);
    return money(usd);
  }
  const lo = Math.min(...c), hi = Math.max(...c);
  return lo === hi ? money(lo / 100) : `${money(lo / 100)} to ${money(hi / 100)}`;
}

function tokenValue(plan, F, sign, ref, where) {
  if (sign === "฿") {
    if (ref === "fx" && Number.isFinite(plan.meta.planFx)) return "฿" + plan.meta.planFx.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    throw new Error(`Template ${where}: unknown token {฿${ref}}.`);
  }
  if (sign === "#") return dateToken(plan, F, ref, where);
  if (sign === "%") {
    const g = ref.startsWith("g:") ? (plan.groups || []).find((x) => x.id === ref.slice(2)) : null;
    if (!g) throw new Error(`Template ${where}: unknown token {%${ref}}.`);
    const pct = g.rebalanceTargetPct;
    if (typeof pct !== "number" || !Number.isFinite(pct)) throw new Error(`Template ${where}: {%${ref}} has no target.`);
    return `${pct.toFixed(1)}%`;
  }
  if (ref === "month") return monthText(plan, where);
  let usd;
  if (ref === "year") usd = plan.meta.budgetUsd;
  else if (ref === "coins") usd = plan.orders.filter((o) => o.cryptoWait).reduce((a, o) => a + toCents(o.usd), 0) / 100;
  else if (ref.startsWith("ibkr:")) usd = (F.dates.get(ref.slice(5)) || {}).ibkrTotalUsd;
  else {
    const o = F.byId.get(ref);
    if (o) usd = o.usd;
    else if (F.gone.has(ref) || F.dropped.has(ref)) throw new Error(`Template ${where} quotes ${ref}, which is not bought at this amount.`);
  }
  if (typeof usd !== "number" || !Number.isFinite(usd)) throw new Error(`Template ${where}: unknown token {$${ref}}.`);
  return money(usd);
}

function render(plan, tpl, where, F) {
  const text = chooseText(plan, tpl, where, F);
  if (text === null) return null;
  const out = text.replace(TOKEN, (_, sign, ref) => tokenValue(plan, F, sign, ref, where));
  if (/\{[$฿#%]/.test(out)) throw new Error(`Template ${where} has a malformed token.`);
  return out;
}

/** One template (a string, or a list of {if, text} versions) rendered against a plan: the text, or null
 *  when the version that holds removes its item ("text": null). */
export function renderTemplate(plan, tpl, where = "") {
  return render(plan, tpl, where, textFacts(plan));
}

/** { path: rendered text, or null to remove its item } for every template whose path is in the plan. A
 *  path into an order that is not bought (rolled into VWRA, or replaced by the friend's own mix) or into a
 *  transfer with nothing to pay is skipped; any other missing path is an error. */
export function renderTemplates(plan, templates = plan.templates || {}) {
  const F = textFacts(plan);
  const out = {};
  for (const [path, tpl] of Object.entries(templates)) {
    const at = locate(plan, path);
    if (!at.found) {
      if (at.missingId && (F.gone.has(at.missingId) || F.dropped.has(at.missingId))) continue;
      throw new Error(`Template path ${path} is not in the plan.`);
    }
    if (typeof at.parent[at.key] !== "string") throw new Error(`Template path ${path} is not text.`);
    out[path] = render(plan, tpl, path, F);
  }
  return out;
}

/** The array item nearest the end of a path ({arr, index}): what "text": null removes. */
function arrayItemOf(plan, path) {
  let node = plan, item = null;
  for (const key of path.slice(1).split("/")) {
    const s = step(node, key);
    if (!s.ok) break;
    if (Array.isArray(node)) item = { arr: node, index: s.key };
    node = node[s.key];
  }
  if (!item) throw new Error(`Template ${path}: "text": null needs an array item on its path to remove.`);
  return item;
}

/** Writes renderTemplates' text into the plan, then removes the items of the paths whose text is null:
 *  after every path is written, highest index first, so each path still meant the item it named. */
function applyTemplates(plan, rendered) {
  const drops = new Map(); // array -> its indexes to remove
  for (const [path, text] of Object.entries(rendered)) {
    if (text === null) {
      const { arr, index } = arrayItemOf(plan, path);
      if (!drops.has(arr)) drops.set(arr, new Set());
      drops.get(arr).add(index);
      continue;
    }
    const at = locate(plan, path);
    at.parent[at.key] = text;
  }
  for (const [arr, indexes] of drops) for (const i of [...indexes].sort((a, b) => b - a)) arr.splice(i, 1);
}

// ---------- scalePlan ----------

// ---------- a friend who starts after the plan has begun ----------

/**
 * What a friend who started on `joinedAt` (a Bangkok date, "YYYY-MM-DD") takes no part in: the months
 * whose order date is before that day. Their orders are not bought and their transfers are not sent. A
 * month whose order date is still ahead counts, even when its money was due earlier: the plan's late-money
 * rule (r9) covers that. Orders paid from an earlier month's money (the January coins, from November's
 * SwissBorg transfer) stay in the plan; the wallet that pays for them is simply empty. Order dates, ids
 * and transfer dates are the same at every amount, so `plan` may be the base plan or a scaled one.
 * Returns {joinedAt, dateIds, orderIds: Set, transferIds: Set, firstDateId}: dateIds is empty (and
 * joinedAt null) when the date is missing or malformed; firstDateId is the first month that counts, or
 * null when none is left.
 */
export function beforeJoin(plan, joinedAt) {
  const ok = typeof joinedAt === "string" && ISO_DATE.test(joinedAt);
  const dates = ok ? plan.orderDates.filter((d) => d.date < joinedAt).map((d) => d.id) : [];
  const set = new Set(dates);
  const first = plan.orderDates.find((d) => !set.has(d.id));
  return {
    joinedAt: ok ? joinedAt : null,
    dateIds: dates,
    orderIds: new Set(plan.orders.filter((o) => set.has(o.dateId)).map((o) => o.id)),
    transferIds: new Set(plan.funding.transfers.filter((t) => set.has(t.forDate)).map((t) => t.id)),
    firstDateId: first ? first.id : null,
  };
}

/**
 * The base plan (friends/data/base-plan.json) at the friend's amounts and mix. Pure: `base` is never
 * changed. monthlyUsd is the usual amount ($25 to $10,000; cents allowed). opts:
 * - minOrderUsd, months, mix: as scaleAmounts (months[d] may also carry the month's own `input`);
 * - input: the usual amount as the friend entered it, {currency: "USD"|"THB", amount, rate, rateSource,
 *   rateDate}. Baht input sets meta.planFx and the USD/THB fx row's plan rate to the rate used, so baht
 *   shown later match what was typed. A month's own input is checked against that month's amount only.
 * Throws a PlanFitError (a RangeError) for amounts, a mix or an input that do not fit (scaleAmounts'
 * checks, then "input", then "text"), and an Error for a base that is not a monthly plan.
 * Adds plan.scale = {monthlyUsd, factor, rolled, minOrderUsd, input?}, plus, only when used: months
 * (every month's dollars, when opts.months or opts.mix is not empty), mix (the standing mix),
 * droppedTransfers, ownMonths and replaced (see scaleAmounts). base.templates are rendered again.
 */
export function scalePlan(base, monthlyUsd, opts = {}) {
  if (!base || typeof base !== "object" || !base.templates || typeof base.templates !== "object") throw new Error("scalePlan: the base plan has no templates.");
  const o = opts || {};
  const r = scaleAmounts(base, monthlyUsd, o);
  const { plan, rolled, minOrderUsd } = r;
  const Mc = toCents(plan.funding.monthlyUsd);
  const input = checkedInput(base, o.input, Mc, null);
  const months = o.months || {};
  for (const d of plan.orderDates) {
    const e = months[d.id];
    if (e && e.input != null) checkedInput(base, e.input, toCents(r.months[d.id]), d.id);
  }

  // Only an order whose text the templates can do without may roll (its id appears in an "if"). Own-mode
  // orders are not in the plan's text, so this guards the plan's own orders.
  const rollable = new Set();
  for (const tpl of Object.values(base.templates)) if (Array.isArray(tpl)) for (const v of tpl) for (const c of v.if || []) rollable.add(c.replace(/^!/, ""));
  const stuck = rolled.filter((x) => !ownIdMonth(x.id) && !rollable.has(x.id));
  if (stuck.length) throw new PlanFitError("text", `scalePlan: at ${fmtMoney(Mc / 100)} a month ${stuck.map((x) => x.id).join(", ")} would be under the minimum, and the plan's text has no version without ${stuck.length > 1 ? "them" : "it"}.`);

  plan.scale = { monthlyUsd: Mc / 100, factor: Mc / toCents(base.funding.monthlyUsd), rolled, minOrderUsd };
  if (input) plan.scale.input = input;
  const mix = o.mix || {};
  if (Object.keys(months).length || Object.keys(mix).length) plan.scale.months = r.months;
  if (Object.keys(mix).length) plan.scale.mix = { ...mix };
  if (r.droppedTransfers.length) plan.scale.droppedTransfers = r.droppedTransfers;
  if (r.ownMonths.length) { plan.scale.ownMonths = r.ownMonths; plan.scale.replaced = r.replaced; }
  if (input && input.currency === "THB") {
    plan.meta.planFx = input.rate;
    for (const f of plan.fx || []) if (f.id === "USDTHB") f.plan = input.rate;
  }
  applyTemplates(plan, renderTemplates(plan, plan.templates));
  return plan;
}
