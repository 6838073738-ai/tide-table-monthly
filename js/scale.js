// The $500-a-month plan scaled to a friend's monthly amount. Pure ES module: no DOM, no fetch and no
// imports, so the app and its tests load the same file.
//
// Money is worked in integer cents. Every order except a funding month's VWRA order becomes whole
// dollars (the base amount scaled, rounded half up); that month's VWRA order takes what is left, cents
// included, so every funding month totals exactly the monthly amount and the year exactly twelve times
// it (rule r10 applied when the plan is built). An order that would be under its minimum rolls into
// the VWRA order of the month whose money pays for it before the plan starts. Plan text that quotes
// money is rebuilt from the plan's own templates (base.templates).

export const BASE_MONTHLY_USD = 500; // the amount friends/data/base-plan.json is written for
export const MIN_MONTHLY_USD = 25;
export const MAX_MONTHLY_USD = 10000;
/** Smallest order per order style, in dollars: SwissBorg's smallest exchange is €5 (coins), the plan's
 *  own practice run buys $5 of a US stock (fractional), whole-share funds have none when the plan is
 *  built (a fund order that buys 0 shares at the day's price is a runtime matter, the leftover rule). */
export const DEFAULT_MIN_ORDER_USD = Object.freeze({ usd_amount: 6, fractional_usd: 5, whole_usd: 0 });

const TOKEN = /\{([$฿])([A-Za-z0-9:]+)\}/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- integer money ----------

const toCents = (x) => Math.round(x * 100);
/** n / d rounded half away from zero, for integers (d > 0). */
const divRound = (n, d) => Math.sign(n) * Math.floor((2 * Math.abs(n) + d) / (2 * d));

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

function monthlyCents(x) {
  if (!isMonthlyUsdInRange(x)) throw new RangeError(`The monthly amount must be a number from ${fmtMoney(MIN_MONTHLY_USD)} to ${fmtMoney(MAX_MONTHLY_USD)}.`);
  return toCents(x);
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

/** The funding month (an order date id) whose money pays for each order: an account with a transfer
 *  for that date pays it then; an account with a single transfer (SwissBorg) pays all its orders then. */
function fundingMonths(plan) {
  const transfers = plan.funding.transfers;
  const of = {};
  for (const o of plan.orders) {
    const own = transfers.filter((t) => t.to === o.account);
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
  const fm = fundingMonths(base);
  for (const d of base.orderDates) {
    const targets = base.orders.filter((o) => o.dateId === d.id && o.carryTarget);
    if (targets.length !== 1 || fm[targets[0].id] !== d.id) throw new Error(`scalePlan: ${d.id} needs exactly one carryTarget order paid that month.`);
    const sum = base.orders.filter((o) => fm[o.id] === d.id).reduce((a, o) => a + toCents(o.usd), 0);
    if (sum !== Bc) throw new Error(`scalePlan: the money for ${d.id} adds up to ${fmtMoney(sum / 100)}, not ${fmtMoney(Bc / 100)}.`);
  }
  for (const t of base.funding.transfers) {
    const sum = base.orders.filter((o) => o.account === t.to && fm[o.id] === t.forDate).reduce((a, o) => a + toCents(o.usd), 0);
    if (sum !== toCents(t.usd)) throw new Error(`scalePlan: transfer ${t.id} is not the sum of the orders it pays.`);
  }
  return { Bc, fm };
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

/**
 * The numbers only: `base` scaled to `monthlyUsd` dollars a month, with orders under their minimum
 * rolled into VWRA (removed from orders, listed in `rolled`). Text is left as it was; scalePlan is
 * this plus the templates. opts.minOrderUsd overrides DEFAULT_MIN_ORDER_USD per order style.
 * Returns { plan, rolled, minOrderUsd }. Pure: `base` is never changed.
 */
export function scaleAmounts(base, monthlyUsd, opts = {}) {
  const { Bc, fm } = checkBase(base);
  const Mc = monthlyCents(monthlyUsd);
  const minOrderUsd = minimums(opts && opts.minOrderUsd);
  const plan = structuredClone(base);

  const target = Object.fromEntries(plan.orderDates.map((d) => [d.id, plan.orders.find((o) => o.dateId === d.id && o.carryTarget)]));
  const cents = {};
  const rolled = [];
  for (const o of plan.orders) {
    if (o.carryTarget) continue;
    const scaled = Mc * toCents(o.usd); // the exact amount is scaled / Bc cents
    const dollars = divRound(scaled, 100 * Bc);
    const min = minOrderUsd[style(o)];
    if (dollars <= 0 || dollars < min) {
      rolled.push({ id: o.id, instrument: o.instrument, account: o.account, dateId: o.dateId, fundDateId: fm[o.id], into: target[fm[o.id]].id, usd: dollars, exactUsd: divRound(scaled, Bc) / 100, minUsd: min, style: style(o), reason: "below_min" });
    } else cents[o.id] = dollars * 100;
  }
  for (const d of plan.orderDates) {
    const others = plan.orders.filter((o) => fm[o.id] === d.id && o !== target[d.id] && cents[o.id] != null).reduce((a, o) => a + cents[o.id], 0);
    cents[target[d.id].id] = Mc - others;
    if (Mc - others <= 0) throw new Error(`scalePlan: nothing is left for ${target[d.id].id} at ${fmtMoney(Mc / 100)} a month.`);
  }

  plan.orders = plan.orders.filter((o) => cents[o.id] != null).map((o) => ({ ...o, usd: cents[o.id] / 100 }));
  const sum = (os) => os.reduce((a, o) => a + cents[o.id], 0);
  for (const d of plan.orderDates) d.ibkrTotalUsd = sum(plan.orders.filter((o) => o.dateId === d.id && o.account === "IBKR")) / 100;
  plan.funding.transfers = plan.funding.transfers
    .map((t) => ({ ...t, usd: sum(plan.orders.filter((o) => o.account === t.to && fm[o.id] === t.forDate)) / 100 }))
    .filter((t) => t.usd > 0);
  const yearC = plan.orderDates.length * Mc;
  for (const i of plan.instruments) {
    i.targetUsd = sum(plan.orders.filter((o) => o.instrument === i.id)) / 100;
    i.sharePct = Math.round((i.targetUsd / (yearC / 100)) * 1000) / 10;
  }
  plan.funding.monthlyUsd = Mc / 100;
  Object.assign(plan.meta, {
    budgetUsd: yearC / 100,
    monthlyUsd: Mc / 100,
    investUsd: yearC / 100,
    stockMoneyUsd: sum(plan.orders.filter((o) => o.account === "IBKR")) / 100,
    orderCount: plan.orders.length,
  });
  return { plan, rolled, minOrderUsd };
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

// ---------- templates ----------

const kept = (plan) => new Set(plan.orders.map((o) => o.id));
const rolledIds = (plan) => new Set(((plan.scale && plan.scale.rolled) || []).map((r) => r.id));

function chooseText(plan, tpl, where) {
  if (typeof tpl === "string") return tpl;
  if (!Array.isArray(tpl)) throw new Error(`Template ${where} must be a string or a list of versions.`);
  const have = kept(plan), gone = rolledIds(plan);
  for (const v of tpl) {
    const ok = (v.if || []).every((c) => {
      const id = c.startsWith("!") ? c.slice(1) : c;
      if (!have.has(id) && !gone.has(id)) throw new Error(`Template ${where} names an unknown order "${id}".`);
      return c.startsWith("!") ? !have.has(id) : have.has(id);
    });
    if (ok) {
      if (typeof v.text !== "string") throw new Error(`Template ${where} has a version without text.`);
      return v.text;
    }
  }
  throw new Error(`Template ${where} has no version for the orders bought at this amount.`);
}

function tokenValue(plan, sign, ref, where) {
  if (sign === "฿") {
    if (ref === "fx" && Number.isFinite(plan.meta.planFx)) return "฿" + plan.meta.planFx.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    throw new Error(`Template ${where}: unknown token {฿${ref}}.`);
  }
  let usd;
  if (ref === "month") usd = plan.funding.monthlyUsd;
  else if (ref === "year") usd = plan.meta.budgetUsd;
  else if (ref === "coins") usd = plan.orders.filter((o) => o.cryptoWait).reduce((a, o) => a + toCents(o.usd), 0) / 100;
  else if (ref.startsWith("ibkr:")) usd = (plan.orderDates.find((d) => d.id === ref.slice(5)) || {}).ibkrTotalUsd;
  else {
    const o = plan.orders.find((x) => x.id === ref) || plan.funding.transfers.find((x) => x.id === ref);
    if (o) usd = o.usd;
    else if (rolledIds(plan).has(ref)) throw new Error(`Template ${where} quotes ${ref}, which is not bought at this amount.`);
  }
  if (typeof usd !== "number" || !Number.isFinite(usd)) throw new Error(`Template ${where}: unknown token {$${ref}}.`);
  return fmtMoney(usd);
}

/** One template (a string, or a list of {if, text} versions) rendered against a plan. */
export function renderTemplate(plan, tpl, where = "") {
  const out = chooseText(plan, tpl, where).replace(TOKEN, (_, sign, ref) => tokenValue(plan, sign, ref, where));
  if (/\{[$฿]/.test(out)) throw new Error(`Template ${where} has a malformed token.`);
  return out;
}

/** { path: rendered text } for every template whose path is in the plan. A path into an order that
 *  rolled into VWRA is skipped (the order is gone); any other missing path is an error. */
export function renderTemplates(plan, templates = plan.templates || {}) {
  const gone = rolledIds(plan);
  const out = {};
  for (const [path, tpl] of Object.entries(templates)) {
    const at = locate(plan, path);
    if (!at.found) {
      if (at.missingId && gone.has(at.missingId)) continue;
      throw new Error(`Template path ${path} is not in the plan.`);
    }
    if (typeof at.parent[at.key] !== "string") throw new Error(`Template path ${path} is not text.`);
    out[path] = renderTemplate(plan, tpl, path);
  }
  return out;
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
 * The base plan (friends/data/base-plan.json) at `monthlyUsd` dollars a month ($25 to $10,000; cents
 * allowed). Pure: `base` is never changed. Throws a RangeError for an amount out of range or an input
 * record that does not match it, and an Error for a base that is not a monthly plan.
 * opts.minOrderUsd: per-style minimums (DEFAULT_MIN_ORDER_USD); opts.input: the amount as the friend
 * entered it, {currency: "USD"|"THB", amount, rate, rateSource, rateDate}. Baht input sets meta.planFx
 * and the USD/THB fx row's plan rate to the rate used, so baht shown later match what was typed.
 * Adds plan.scale = {monthlyUsd, factor, rolled, minOrderUsd, input?}; base.templates are rendered again.
 */
export function scalePlan(base, monthlyUsd, opts = {}) {
  if (!base || typeof base !== "object" || !base.templates || typeof base.templates !== "object") throw new Error("scalePlan: the base plan has no templates.");
  const { plan, rolled, minOrderUsd } = scaleAmounts(base, monthlyUsd, opts);
  const Mc = toCents(plan.funding.monthlyUsd);
  const input = inputRecord(opts && opts.input, Mc);

  // Only an order whose text the templates can do without may roll (its id appears in an "if").
  const rollable = new Set();
  for (const tpl of Object.values(base.templates)) if (Array.isArray(tpl)) for (const v of tpl) for (const c of v.if || []) rollable.add(c.replace(/^!/, ""));
  const stuck = rolled.filter((r) => !rollable.has(r.id));
  if (stuck.length) throw new Error(`scalePlan: at ${fmtMoney(Mc / 100)} a month ${stuck.map((r) => r.id).join(", ")} would be under the minimum, and the plan's text has no version without ${stuck.length > 1 ? "them" : "it"}.`);

  plan.scale = { monthlyUsd: Mc / 100, factor: Mc / toCents(base.funding.monthlyUsd), rolled, minOrderUsd };
  if (input) {
    plan.scale.input = input;
    if (input.currency === "THB") {
      plan.meta.planFx = input.rate;
      for (const f of plan.fx || []) if (f.id === "USDTHB") f.plan = input.rate;
    }
  }
  for (const [path, text] of Object.entries(renderTemplates(plan, plan.templates))) {
    const at = locate(plan, path);
    at.parent[at.key] = text;
  }
  return plan;
}
