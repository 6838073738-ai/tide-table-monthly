// A friend's months: what each order date's amount, mix and fields resolve to, which months the friend's
// records fix, and the changes a friend can make (an amount from a month on, one month's amount, a mix from
// a month on, fields from a month on). Pure ES module: no DOM and no storage, and it imports scale.js and
// split.js only, so the app and its tests load the same file.
//
// Words used here:
// - a month is an order date id (m01..m12); "December" is the money for the 8 Dec orders;
// - a joined month is one whose order date is on or after the day the friend started (scale.beforeJoin);
// - a month is fixed when an order its money pays for is filled or skipped, or a transfer for it is sent
//   or has arrived; every other joined month is open, and can change;
// - an own amount is one the friend set for that month only (own: true); a pin keeps a month's present
//   amount, mix or fields before a later change (an entry without own);
// - a month follows the example plan when its mix is the plan's ({}), the friend's own mix otherwise (see
//   scale.js), or the friend's fields and split when it is a field month (see split.js).
//
// A plan record (state.plan) is { monthlyUsd, input, lockedAt, joinedAt, months: { mNN: { usd?, input?,
// own?, mix?, fields? } }, mix: { id: tenths of a percent }, mixFrom, fields? } (store.js cleans it).
// plan.fields is { from, chosen, split, lists, names } (spec 8.5); it is left out when there are no field
// months, and its from is null when only pinned months have fields (it then keeps their names). An upcoming
// listing's name entry carries w (split.js); setFirstTrade saves its first trading day without changing a
// month that has records or an order marked placed. In 2.1 a plan record may also hold plan.lock, the locked 10%
// (lock.js): adoptLock writes it from the first month the friend has not started, setLockFirstTrade saves its first
// trading day the same careful way, and lockMutator says which of them a state needs.

import {
  beforeJoin, fundingMonthOf, ownIdMonth, ownOrderId, ownTransferId, planShares, PlanFitError,
  isMonthlyUsdInRange, fmtMoney, MIN_MONTHLY_USD, MAX_MONTHLY_USD, MIX_TENTHS_MAX, VWRA_FLOOR_CENTS,
} from "./scale.js?v=2.1.0";
import {
  resolveMonths, specOf, composePlan, COMPANY_ID, fieldOrder, fieldsProblem, explainFieldsProblem, nameSnapshot,
  isDay, waitingSnapshot,
} from "./split.js?v=2.1.0";
import { readLock, LOCK_KEY, entryFirstTrade, entrySnapshot } from "./lock.js?v=2.1.0";

export { resolveMonths, specOf };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
const toCents = (x) => Math.round(x * 100);
const round2 = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
const byId = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

// ---------------------------------------------------------------- refusals

/**
 * Why a change to the friend's months was refused. `code`:
 * - "unknown": not one of the plan's months; "pre_join": a month before the friend joined;
 * - "fixed": a month whose records fix it (`records` lists them); "no_plan": there is no amount yet;
 * - "changed" (FixedMonthError): the change would alter a month that has records.
 * The message is a plain sentence the app can show as it is.
 */
export class MonthChangeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MonthChangeError";
    this.code = code;
    Object.assign(this, details);
  }
}

/** A change that would alter an order or a transfer of a fixed month (checkFixedUnchanged, tidy). */
export class FixedMonthError extends MonthChangeError {
  constructor(details = {}) {
    super("changed", "That change would alter a month that has records, so it was not saved.", details);
    this.name = "FixedMonthError";
  }
}

// ---------------------------------------------------------------- what the base says (cached per base)

const memo = new WeakMap();
/** The base plan's month ids and dates, each order's funding month, each transfer's month, the fund that
 *  takes the rest of each month (VWRA) and the instrument ids. Order dates and ids are the same at every
 *  amount, so a scaled plan's own-mode ids are worked out from their pattern (scale.ownOrderId). */
function facts(base) {
  let f = memo.get(base);
  if (!f) {
    f = {
      dateIds: base.orderDates.map((d) => d.id),
      dateOf: Object.fromEntries(base.orderDates.map((d) => [d.id, d.date])),
      fm: fundingMonthOf(base),
      forDate: Object.fromEntries(base.funding.transfers.map((t) => [t.id, t.forDate])),
      restId: (base.orders.find((o) => o.carryTarget) || {}).instrument || null,
      instIds: new Set((base.instruments || []).map((i) => i.id)),
    };
    memo.set(base, f);
  }
  return f;
}

/** The month whose money pays for an order id: the base plan's funding month (p05 and p06, January's
 *  ether and solana, belong to November), or the month of an own-mode or field-month id ("m03-BTC" and
 *  "m03-s37996" are m03). Null for an id that is neither. */
function orderMonth(F, id) {
  if (Object.prototype.hasOwnProperty.call(F.fm, id)) return F.fm[id];
  const d = ownIdMonth(id);
  if (!d || !F.dateOf[d]) return null;
  const inst = id.slice(d.length + 1);
  return id === ownOrderId(d, inst) && (F.instIds.has(inst) || COMPANY_ID.test(inst)) ? d : null;
}
/** The month a transfer id pays for: a base transfer's forDate, or the month of an own-mode SwissBorg
 *  transfer ("S-m03" is m03). Null for any other id. */
function transferMonth(F, id) {
  if (Object.prototype.hasOwnProperty.call(F.forDate, id)) return F.forDate[id];
  const d = ownIdMonth(id);
  return d && F.dateOf[d] && id === ownTransferId(d) ? d : null;
}

/** The month whose money pays for an order (a base id or an own-mode id), or null. */
export const monthOfOrder = (base, id) => orderMonth(facts(base), id);
/** The month a transfer pays for (a base id or an own-mode "S-mNN"), or null. */
export const monthOfTransfer = (base, id) => transferMonth(facts(base), id);

/** "March": the month name of an order date, from any plan that has the order dates (the base or a scaled one). */
export function monthWord(plan, dateId) {
  const d = plan && Array.isArray(plan.orderDates) ? plan.orderDates.find((x) => x.id === dateId) : null;
  return d ? MONTH_NAMES[Number(d.date.slice(5, 7)) - 1] : String(dateId || "").slice(0, 24);
}

// ---------------------------------------------------------------- what each month resolves to
//
// resolveMonths (each order date: its amount, mix, fields and mode) and specOf (scale.js's arguments) live
// in split.js, which works the year out; they are exported from here as before.

/**
 * The plan for a plan record: split.composePlan, which is scalePlan(base, ...specOf) when no month follows
 * the friend's fields, and adds each field month's orders when some do. With inputs false, the amounts as
 * typed (the standing one and each month's) are left out, so only the dollars count. Throws scalePlan's
 * PlanFitError for amounts or a mix that do not fit, and split.js's "mix_and_fields" and "fields".
 */
export function scaleFor(base, planRec, { inputs = true } = {}) {
  if (!isObj(planRec)) throw new MonthChangeError("no_plan", "There is no monthly amount yet.");
  return composePlan(base, planRec, null, { inputs });
}

/**
 * The plan for a record, as the app shows it: { plan, error, inputs }. It tries with every amount as typed,
 * then (only when one of those does not give its dollars, a hand-edited file) with the dollars alone.
 * plan is null when neither works; error is then why (a PlanFitError, or an Error for a malformed base).
 */
export function planOrNull(base, planRec) {
  if (!isObj(planRec)) return { plan: null, error: null, inputs: false };
  try {
    return { plan: scaleFor(base, planRec), error: null, inputs: true };
  } catch (e1) {
    if (!(e1 instanceof PlanFitError) || e1.code !== "input") return { plan: null, error: e1, inputs: false };
  }
  try {
    return { plan: scaleFor(base, planRec, { inputs: false }), error: null, inputs: false };
  } catch (e2) {
    return { plan: null, error: e2, inputs: false };
  }
}

// ---------------------------------------------------------------- fixed and open months

/**
 * The months the friend's records fix: Map(dateId -> [{ kind: "order"|"transfer", id, status }]), in date
 * order. An order that is filled or skipped fixes the month whose money pays for it (a fill or a skip of
 * p01, p02, p05 or p06 fixes November); a transfer that is sent or has arrived fixes the month it is for.
 * Placed, to-do and pending entries fix nothing, and neither do entries from before the friend joined.
 * Own-mode ids ("m03-BTC", "S-m03") fix their own month. ignoreTransfer: a transfer id to leave out (the
 * one being recorded again).
 */
export function fixedMonths(base, state, { ignoreTransfer = null } = {}) {
  const F = facts(base);
  const s = isObj(state) ? state : {};
  const pre = beforeJoin(base, isObj(s.plan) ? s.plan.joinedAt : null);
  const found = new Map();
  const add = (d, why) => { if (!found.has(d)) found.set(d, []); found.get(d).push(why); };
  for (const [id, o] of Object.entries(isObj(s.orders) ? s.orders : {})) {
    if (!isObj(o) || (o.status !== "filled" && o.status !== "skipped")) continue;
    const d = orderMonth(F, id);
    if (!d || pre.orderIds.has(id) || (!Object.prototype.hasOwnProperty.call(F.fm, id) && pre.dateIds.includes(d))) continue;
    add(d, { kind: "order", id, status: o.status });
  }
  for (const [id, t] of Object.entries(isObj(s.funding) ? s.funding : {})) {
    if (!isObj(t) || (t.status !== "sent" && t.status !== "arrived") || id === ignoreTransfer) continue;
    const d = transferMonth(F, id);
    if (!d || pre.transferIds.has(id) || (!Object.prototype.hasOwnProperty.call(F.forDate, id) && pre.dateIds.includes(d))) continue;
    add(d, { kind: "transfer", id, status: t.status });
  }
  return new Map(F.dateIds.filter((d) => found.has(d)).map((d) => [d, found.get(d)]));
}

/** The joined months the records do not fix, in date order (ids). */
export function openMonths(base, state, opts = {}) {
  const s = isObj(state) ? state : {};
  const pre = beforeJoin(base, isObj(s.plan) ? s.plan.joinedAt : null);
  const fixed = fixedMonths(base, s, opts);
  return facts(base).dateIds.filter((d) => !pre.dateIds.includes(d) && !fixed.has(d));
}

/** The month a change starts from by default: the first open month whose order date is today or later
 *  (today: a Bangkok date, "YYYY-MM-DD"), else the first open month; null when none is open. */
export function defaultFrom(base, state, today) {
  const F = facts(base);
  const open = openMonths(base, state);
  return open.find((d) => typeof today === "string" && F.dateOf[d] >= today) || open[0] || null;
}

// ---------------------------------------------------------------- amounts in words

/** "$500 a month", or "$300 to $500 a month" when the joined months differ ("" with no plan record). */
export function amountWords(base, planRec) {
  if (!isObj(planRec)) return "";
  const rows = resolveMonths(base, planRec);
  const joined = rows.filter((r) => !r.preJoin);
  const list = (joined.length ? joined.map((r) => r.usd) : [planRec.monthlyUsd]).map(toCents);
  const lo = Math.min(...list), hi = Math.max(...list);
  return lo === hi ? `${fmtMoney(lo / 100)} a month` : `${fmtMoney(lo / 100)} to ${fmtMoney(hi / 100)} a month`;
}

/** The joined months as runs of the same amount, in date order: [{ from, to, usd, own }]. A run breaks
 *  where the amount changes or where months set on their own start or end. */
export function amountRuns(base, planRec) {
  const runs = [];
  for (const r of resolveMonths(base, planRec)) {
    if (r.preJoin) continue;
    const last = runs[runs.length - 1];
    if (last && toCents(last.usd) === toCents(r.usd) && last.own === r.own) last.to = r.dateId;
    else runs.push({ from: r.dateId, to: r.dateId, usd: r.usd, own: r.own });
  }
  return runs;
}

// ---------------------------------------------------------------- the mix as typed

/** Each instrument's share of the plan's steady year as shown, in tenths of a percent, rounded half up:
 *  { VWRA: 692, XDEW: 83, NVDA: 17, BTC: 21, ... }. */
export function shownShareTenths(base) {
  const B = planShares(base);
  const Yc = Object.values(B).reduce((a, x) => a + x, 0);
  return Object.fromEntries(Object.entries(B).map(([id, c]) => [id, Math.floor((2 * MIX_TENTHS_MAX * c + Yc) / (2 * Yc))]));
}

/**
 * A mix as the friend typed it (tenths of a percent), ready to store: VWRA (it takes the rest) and empty
 * fields are dropped, and so is a share typed as the plan's shown share (1.7 for Nvidia means "the plan's
 * share", which is kept exact). Anything else is kept for scale.js to check. Keys in the plan's order.
 */
export function normalizeMix(base, mix) {
  const F = facts(base);
  const shown = shownShareTenths(base);
  const out = {};
  if (!isObj(mix)) return out;
  const order = new Set([...(base.instruments || []).map((i) => i.id), ...Object.keys(mix)]);
  for (const id of order) {
    if (!has(mix, id) || id === F.restId) continue;
    const v = mix[id];
    if (v == null || v === "") continue;
    if (has(shown, id) && v === shown[id]) continue;
    out[id] = v;
  }
  return out;
}

// ---------------------------------------------------------------- changes (on a draft state)

/** Throws unless dateId is an open month of the draft (see fixedMonths for ignoreTransfer). */
function checkOpen(base, d, dateId, what, ignoreTransfer) {
  if (!isObj(d) || !isObj(d.plan)) throw new MonthChangeError("no_plan", "There is no monthly amount yet.");
  const F = facts(base);
  if (!F.dateOf[dateId]) throw new MonthChangeError("unknown", "That is not one of the plan's months.", { dateId });
  const pre = beforeJoin(base, d.plan.joinedAt);
  if (pre.dateIds.includes(dateId)) throw new MonthChangeError("pre_join", "That month is before you joined, so nothing is bought in it.", { dateId });
  const fixed = fixedMonths(base, d, { ignoreTransfer });
  const stays = what === "fields" ? "its fields stay as they are" : `its ${what} stays as it is`;
  if (fixed.has(dateId)) throw new MonthChangeError("fixed", `That month has records, so ${stays}.`, { dateId, records: fixed.get(dateId) });
  return { F, pre, fixed };
}

/** An amount as typed for `usd` dollars: the given record with usd set, or US dollars. */
function inputFor(input, usd) {
  return { currency: "USD", amount: usd, rate: null, rateSource: null, rateDate: null, ...(isObj(input) ? input : {}), usd };
}
const monthsOf = (p) => (isObj(p.months) ? p.months : (p.months = {}));
/** Keep a month's present amount: the usual amount and how it was typed. */
function pinAmount(e, p) {
  e.usd = p.monthlyUsd;
  if (isObj(p.input)) e.input = structuredClone(p.input);
}

/**
 * A new usual amount from month `fromId` on (an open month). Earlier months, and months the records fix,
 * keep their present amounts (pinned when they had none of their own). Later open months take the new
 * amount, except months set on their own that are listed in keepOwn; their mixes are kept. A month before
 * the friend joined that a record fixes (January's coins, paid by November) is pinned too. `input` is the
 * amount as typed (US dollars when missing). Changes `d` (a draft state) and returns it; throws a
 * MonthChangeError when fromId is not open.
 */
export function setAmountFrom(d, base, { fromId, usd, input = null, keepOwn = [], ignoreTransfer = null } = {}) {
  const { F, pre, fixed } = checkOpen(base, d, fromId, "amount", ignoreTransfer);
  const p = d.plan;
  const months = monthsOf(p);
  const from = F.dateIds.indexOf(fromId);
  const keep = new Set(Array.isArray(keepOwn) ? keepOwn : []);
  F.dateIds.forEach((x, k) => {
    const e = isObj(months[x]) ? months[x] : {};
    if (pre.dateIds.includes(x)) {
      if (fixed.has(x) && e.usd == null) pinAmount(e, p);
    } else if (k < from || fixed.has(x)) {
      if (e.usd == null) pinAmount(e, p);
    } else if (!(e.own === true && e.usd != null && keep.has(x))) {
      delete e.usd; delete e.input; delete e.own;
    }
    if (Object.keys(e).length) months[x] = e;
    else delete months[x];
  });
  p.monthlyUsd = round2(usd);
  p.input = inputFor(input, p.monthlyUsd);
  return d;
}

/**
 * One open month's own amount (usd), or back to the usual amount (usd null). Its mix is kept. Changes `d`
 * and returns it; throws a MonthChangeError when the month is not open.
 */
export function setMonthAmount(d, base, { dateId, usd, input = null, ignoreTransfer = null } = {}) {
  checkOpen(base, d, dateId, "amount", ignoreTransfer);
  const months = monthsOf(d.plan);
  const e = isObj(months[dateId]) ? months[dateId] : {};
  if (usd == null) {
    delete e.usd; delete e.input; delete e.own;
  } else {
    e.usd = round2(usd);
    e.input = inputFor(input, e.usd);
    e.own = true;
  }
  if (Object.keys(e).length) months[dateId] = e;
  else delete months[dateId];
  return d;
}

/**
 * A new standing mix from month `fromId` on (an open month): `mix` as typed, in tenths of a percent
 * (normalizeMix). Earlier months, and months the records fix, keep their present mix (pinned as a copy when
 * they had none of their own; {} pins the plan's mix). Later open months follow the new mix. mix {} goes
 * back to the plan's mix. Months before the friend joined are left alone, and so are field months: they
 * follow the friend's fields, whatever the mix (a mix pin would take a month out of its fields). Changes
 * `d` and returns it; throws a MonthChangeError when fromId is not open.
 */
export function setMixFrom(d, base, { fromId, mix, ignoreTransfer = null } = {}) {
  const { F, pre, fixed } = checkOpen(base, d, fromId, "mix", ignoreTransfer);
  const p = d.plan;
  const m = normalizeMix(base, mix);
  const standing = isObj(p.mix) ? p.mix : {};
  const months = monthsOf(p);
  const rows = resolveMonths(base, p);
  const from = F.dateIds.indexOf(fromId);
  F.dateIds.forEach((x, k) => {
    if (pre.dateIds.includes(x)) return;
    const e = isObj(months[x]) ? months[x] : {};
    if (k < from || fixed.has(x)) { if (!isObj(e.mix) && rows[k].mode !== "fields") e.mix = structuredClone(standing); }
    else delete e.mix;
    if (Object.keys(e).length) months[x] = e;
    else delete months[x];
  });
  p.mix = m;
  p.mixFrom = Object.keys(m).length ? fromId : null;
  return d;
}

/** A field spec's money part, as a pin keeps it: { chosen, split, lists } with the chosen fields' lists. */
function specPart(f) {
  const lists = isObj(f.lists) ? f.lists : {};
  return structuredClone({ chosen: f.chosen, split: f.split, lists: Object.fromEntries(f.chosen.filter((x) => Array.isArray(lists[x])).map((x) => [x, lists[x]])) });
}

/**
 * The friend's fields from month `fromId` on (an open month), as Save my split sends them (spec 8.4):
 * `fields` = { chosen, split, lists, names } (names: { companyId: { n, t, v } } for the companies added; the
 * ones already saved are kept, and a saved waiting record w is never replaced: see the names below), or null
 * for no fields from that month on.
 * - Every earlier month that is in field mode, fixed or not, keeps its present spec: it is pinned with it
 *   (months[x].fields) when it has no pin of its own, and plan.fields keeps the names it needs.
 * - A month the records fix keeps whatever it follows now: a field month is pinned as above, and any other
 *   month is pinned with its present mix (a copy, {} for the example plan's), so the new fields pass it by.
 * - Later open months follow the new fields: their field pins and mix pins are removed, except for the
 *   months listed in `keep`, which keep any pin they have.
 * - Months before the friend joined are left alone.
 * plan.fields becomes { from: fromId, chosen (catalogue order), split, lists (id order), names }, or, with
 * fields null, { from: null, chosen: [], split: null, lists: {}, names } while pinned months need their names,
 * else it is removed. Changes `d` and returns it; throws a MonthChangeError when fromId is not open ("fixed",
 * "pre_join", ...) or the fields cannot be saved ("fields", with fieldsProblem's problem).
 */
export function setFieldsFrom(d, base, { fromId, fields, keep = [], ignoreTransfer = null } = {}) {
  const { F, pre, fixed } = checkOpen(base, d, fromId, "fields", ignoreTransfer);
  const p = d.plan;
  const oldNames = isObj(p.fields) && isObj(p.fields.names) ? p.fields.names : {};
  const newNames = isObj(fields) && isObj(fields.names) ? fields.names : {};
  let spec = null;
  if (fields != null) {
    const problem = fieldsProblem(fields, { names: { ...oldNames, ...newNames } });
    if (problem) throw new MonthChangeError("fields", explainFieldsProblem(problem), { problem });
    const chosen = fieldOrder(fields.chosen);
    spec = { chosen, split: fields.split, lists: Object.fromEntries(chosen.map((f) => [f, [...new Set(fields.lists[f])].sort()])) };
  }
  const rows = resolveMonths(base, p);
  const months = monthsOf(p);
  const from = F.dateIds.indexOf(fromId);
  const keepSet = new Set(Array.isArray(keep) ? keep : []);
  const standing = isObj(p.mix) ? p.mix : {};
  rows.forEach((r, k) => {
    const x = r.dateId;
    if (pre.dateIds.includes(x)) return;
    const e = isObj(months[x]) ? months[x] : {};
    if (k < from || fixed.has(x)) {
      if (r.mode === "fields") { if (!isObj(e.fields)) e.fields = specPart(r.fields); }
      else if (k >= from && spec && !isObj(e.mix)) e.mix = structuredClone(standing); // fixed, after the start
    } else if (!keepSet.has(x)) {
      delete e.fields;
      if (spec) delete e.mix;
    }
    if (Object.keys(e).length) months[x] = e;
    else delete months[x];
  });
  // The names every pinned month and the new fields need, and only those.
  const need = new Set();
  const addIds = (f) => { for (const x of f.chosen) for (const id of (isObj(f.lists) && Array.isArray(f.lists[x]) ? f.lists[x] : [])) need.add(id); };
  for (const e of Object.values(months)) if (isObj(e) && isObj(e.fields) && Array.isArray(e.fields.chosen)) addIds(e.fields);
  if (spec) addIds(spec);
  // A company already saved with a waiting record keeps that record as saved, whatever the new snapshot says:
  // only setFirstTrade sets its first trading day and first month (upcoming-api.md 6), so taking it off and
  // ticking it again (a fresh snapshot has w.s null, or no w once it is an ordinary row) changes no month
  // that has records. Its name, ticker and venue still come from the new snapshot.
  const names = {};
  for (const id of [...need].sort()) {
    const saved = oldNames[id];
    const src = Object.prototype.hasOwnProperty.call(newNames, id) ? newNames[id] : saved;
    if (!isObj(src)) continue;
    const snap = nameSnapshot(src);
    const w = isObj(saved) ? waitingSnapshot(saved.w) : null;
    if (w) snap.w = w;
    names[id] = snap;
  }
  if (spec) p.fields = { from: fromId, chosen: spec.chosen, split: spec.split, lists: spec.lists, names };
  else if (need.size) p.fields = { from: null, chosen: [], split: null, lists: {}, names };
  else delete p.fields;
  return d;
}

/**
 * An upcoming listing's first trading day, once the data shows it (upcoming-api.md 6): names[id].w.f becomes
 * `first` (YYYY-MM-DD) and w.s the first month whose order date is after it and that comes after every month
 * whose fields list the company and that has records or an order marked placed, so no month with records
 * changes, and no order the friend has marked placed changes either (the app saves this without asking). A
 * month id past the plan's last month means it counts in no month. Saving the same day again changes
 * nothing. Changes `d` (a draft state) and returns it; throws a MonthChangeError "no_plan", "first" (not a
 * date), "not_waiting" (the company has no waiting record) or "first_set" (another day is already saved).
 */
export function setFirstTrade(d, base, { id, first } = {}) {
  if (!isObj(d) || !isObj(d.plan)) throw new MonthChangeError("no_plan", "There is no monthly amount yet.");
  if (!isDay(first)) throw new MonthChangeError("first", "That is not a date Tide Table can read.");
  const names = isObj(d.plan.fields) && isObj(d.plan.fields.names) ? d.plan.fields.names : {};
  const e = names[id];
  if (!isObj(e) || !isObj(e.w)) throw new MonthChangeError("not_waiting", "That company is not waiting for its first trading day.", { id });
  const w = waitingSnapshot(e.w);
  if (w.f != null) {
    if (w.f === first) return d;
    throw new MonthChangeError("first_set", "Its first trading day is already saved.", { id });
  }
  const F = facts(base);
  const fixed = fixedMonths(base, d);
  // A month the friend has started placing stays as they see it. Its fields hold only VWRA and companies,
  // and a company that starts trading changes VWRA or its field's other companies, so any placed order of
  // such a month counts (placedChanged then finds nothing to warn about).
  const placed = new Set();
  for (const [oid, o] of Object.entries(isObj(d.orders) ? d.orders : {})) {
    const m = isObj(o) && o.status === "placed" ? orderMonth(F, oid) : null;
    if (m) placed.add(m);
  }
  const rows = resolveMonths(base, d.plan);
  let k0 = F.dateIds.findIndex((x) => F.dateOf[x] > first);
  if (k0 < 0) k0 = F.dateIds.length;
  let ks = k0;
  const lists = (spec) => (isObj(spec) && Array.isArray(spec.chosen) && isObj(spec.lists)
    ? spec.chosen.flatMap((x) => (Array.isArray(spec.lists[x]) ? spec.lists[x] : [])) : []);
  rows.forEach((r, k) => {
    const started = fixed.has(r.dateId) || placed.has(r.dateId);
    if (k >= k0 && started && r.fields && lists(r.fields).includes(id)) ks = Math.max(ks, k + 1);
  });
  const past = `m${String(Math.min(99, F.dateIds.length + 1)).padStart(2, "0")}`;
  e.w = { k: w.k, f: first, s: ks < F.dateIds.length ? F.dateIds[ks] : past };
  return d;
}

// ---------------------------------------------------------------- the locked 10% (lock.js, docs/tt2/build/lock-api.md)

/**
 * What decides the scaled plan, as text: core.planKeyOf's parts and the lock record (plan.lock). The app works the
 * plan out again whenever this changes; "" with no plan record.
 */
export const planKey = (p) => (p ? JSON.stringify([p.monthlyUsd, p.input, p.months || {}, p.mix || {}, p.joinedAt || null, p.fields || null, p.lock || null]) : "");

/** True when the state has a plan record without a (readable) lock record: adoptLock still has to run on it. */
export const needsLock = (state) => isObj(state) && isObj(state.plan) && !readLock(state.plan.lock);

/**
 * The months a change of the lock must leave as they are: fixed by records, with an order marked placed, or whose
 * order date is before `today` (a Bangkok date; left out when missing). With sendDays, also a month one of whose
 * transfers has its send day before `today` (the base plan's transfers for that month; an own month's SwissBorg
 * transfer S-mNN goes on the same day as the month's W transfer): the friend may have sent that money as the plan
 * stood then, without recording it. A Set of month ids.
 */
function startedMonths(base, state, today, { sendDays = false } = {}) {
  const F = facts(base);
  const out = new Set(fixedMonths(base, state).keys());
  for (const [oid, o] of Object.entries(isObj(state.orders) ? state.orders : {})) {
    const m = isObj(o) && o.status === "placed" ? orderMonth(F, oid) : null;
    if (m) out.add(m);
  }
  if (typeof today === "string" && isDay(today)) {
    for (const d of F.dateIds) if (F.dateOf[d] < today) out.add(d);
    if (sendDays) for (const t of base.funding.transfers) if (F.dateOf[t.forDate] && isDay(t.send) && t.send < today) out.add(t.forDate);
  }
  return out;
}
/** The id that means "after the plan's last month" (m13 for a 12-month plan). */
const pastId = (F) => `m${String(Math.min(99, F.dateIds.length + 1)).padStart(2, "0")}`;

/**
 * The first month the lock applies to (addendum B.5): the first joined month that comes after every month the
 * friend has started (fixed by records, an order marked placed, or an order date before today). With
 * opts.sendDays, a month whose transfer's send day is before today counts as started too (startedMonths): use it
 * when the lock is added to a plan the friend has been following without it, because adding the lock to November
 * changes the amounts of its two transfers (S01 and W01), which may have gone already. A month id past the plan's
 * last month when none is left.
 */
export function lockFromFor(base, state, today = null, { sendDays = false } = {}) {
  const F = facts(base);
  const s = isObj(state) ? state : {};
  const pre = beforeJoin(base, isObj(s.plan) ? s.plan.joinedAt : null);
  let k = pre.firstDateId ? F.dateIds.indexOf(pre.firstDateId) : F.dateIds.length;
  const started = startedMonths(base, s, today, { sendDays });
  F.dateIds.forEach((d, i) => { if (started.has(d)) k = Math.max(k, i + 1); });
  return k < F.dateIds.length ? F.dateIds[k] : pastId(F);
}

/**
 * The lock in a plan record that has none yet: plan.lock = { k, from, f: null, s: null }, from lockFromFor, so
 * every month the friend has started keeps what it had. sendDays (lockFromFor): true for a plan the friend has been
 * following without the lock (lockMutator passes it); false, the default, for a plan made just now (setup), whose
 * money has not been sent under any other plan. A plan record that already has one is left as it is. Changes `d` (a
 * draft state) and returns it; throws a MonthChangeError "no_plan" without a plan record.
 */
export function adoptLock(d, base, { today = null, sendDays = false } = {}) {
  if (!isObj(d) || !isObj(d.plan)) throw new MonthChangeError("no_plan", "There is no monthly amount yet.");
  if (readLock(d.plan.lock)) return d;
  d.plan.lock = { k: LOCK_KEY, from: lockFromFor(base, d, today, { sendDays }), f: null, s: null };
  return d;
}

/**
 * The locked listing's first trading day, once the data shows it (entry: the upcoming list's entry, listed on a US
 * exchange): lock.f becomes that day, lock.s the first month whose order date is after it and that comes after every
 * lock month the friend has started (startedMonths), and the snapshot { id, n, l, t, v } comes from the entry, so no
 * month with records and no order marked placed changes. Saving the same day again changes nothing. Changes `d` and
 * returns it; throws a MonthChangeError "no_plan", "no_lock" (adoptLock has not run), "first" (the entry shows no
 * first trading day) or "first_set" (another day is already saved).
 */
export function setLockFirstTrade(d, base, { entry = null, today = null } = {}) {
  if (!isObj(d) || !isObj(d.plan)) throw new MonthChangeError("no_plan", "There is no monthly amount yet.");
  const lock = readLock(d.plan.lock);
  if (!lock) throw new MonthChangeError("no_lock", "This plan has no locked 10% yet.");
  const first = entryFirstTrade(entry);
  const snap = first ? entrySnapshot(entry) : null;
  if (!first || !snap) throw new MonthChangeError("first", "That is not a date Tide Table can read.");
  if (lock.f != null) {
    if (lock.f === first) return d;
    throw new MonthChangeError("first_set", "Its first trading day is already saved.");
  }
  const F = facts(base);
  const started = startedMonths(base, d, today);
  let k0 = F.dateIds.findIndex((x) => F.dateOf[x] > first);
  if (k0 < 0) k0 = F.dateIds.length;
  let ks = k0;
  F.dateIds.forEach((x, i) => { if (i >= k0 && x >= lock.from && started.has(x)) ks = Math.max(ks, i + 1); });
  d.plan.lock = { k: lock.k, from: lock.from, f: first, s: ks < F.dateIds.length ? F.dateIds[ks] : pastId(F), ...snap };
  return d;
}

/**
 * The one change the lock needs now, as a deterministic mutator for core.commitPlanChange, or null when there is
 * nothing to do: adoptLock when the plan record has no lock record (a 2.0 state, an import, another tab's save: a
 * plan the friend has followed without the lock, so a month whose transfer's send day is before today keeps what it
 * had, adoptLock's sendDays), and setLockFirstTrade when `entry` shows a first trading day that is not saved yet.
 * today: the Bangkok date the change is made on.
 */
export function lockMutator(base, state, { today = null, entry = null } = {}) {
  if (!isObj(state) || !isObj(state.plan)) return null;
  const lock = readLock(state.plan.lock);
  const first = entryFirstTrade(entry) && entrySnapshot(entry) ? entryFirstTrade(entry) : null;
  const adopt = !lock;
  const trade = !!first && (adopt || lock.f == null);
  if (!adopt && !trade) return null;
  return (d) => {
    if (adopt) adoptLock(d, base, { today, sendDays: true });
    if (trade) setLockFirstTrade(d, base, { entry, today });
    return d;
  };
}

// ---------------------------------------------------------------- after a change

/**
 * Drop the records the new plan has no place for: a to-do, pending or placed entry for an order it does not
 * buy, and a to-do entry for a transfer it does not have (a dropped S01, say). A fill, skip, sent or arrived
 * entry for an order or transfer of the plan's months that the new plan lacks can only come from a change to
 * a fixed month, so it throws a FixedMonthError and nothing is dropped. Two exceptions: such an entry from
 * before the friend joined counts for nothing and is dropped, and one for an id that belongs to no month of
 * the plan (a hand edit) is left as it is. Changes `d` and returns it.
 */
export function tidy(d, plan) {
  const orders = new Set(plan.orders.map((o) => o.id));
  const transfers = new Set(plan.funding.transfers.map((t) => t.id));
  const sc = plan.scale || {};
  const preDates = new Set(beforeJoin(plan, isObj(d.plan) ? d.plan.joinedAt : null).dateIds);
  const rolledDate = new Map((sc.rolled || []).map((r) => [r.id, r.dateId]));
  const replaced = new Set(sc.replaced || []);
  const dropped = new Set(sc.droppedTransfers || []);
  const ownOrder = (id) => { const m = ownIdMonth(id); return m && id !== ownTransferId(m) ? m : null; };
  const ownTransfer = (id) => { const m = ownIdMonth(id); return m && id === ownTransferId(m) ? m : null; };
  const dropOrders = [], dropTransfers = [], stuck = [];
  for (const [id, o] of Object.entries(isObj(d.orders) ? d.orders : {})) {
    if (orders.has(id)) continue;
    const logged = isObj(o) && (o.status === "filled" || o.status === "skipped");
    const month = rolledDate.has(id) ? rolledDate.get(id) : replaced.has(id) ? "" : ownOrder(id);
    if (!logged || (month && preDates.has(month))) dropOrders.push(id);
    else if (month != null) stuck.push(id);
  }
  for (const [id, t] of Object.entries(isObj(d.funding) ? d.funding : {})) {
    if (transfers.has(id)) continue;
    const logged = isObj(t) && (t.status === "sent" || t.status === "arrived");
    const month = dropped.has(id) ? "" : ownTransfer(id);
    if (!logged || (month && preDates.has(month))) dropTransfers.push(id);
    else if (month != null) stuck.push(id);
  }
  if (stuck.length) throw new FixedMonthError({ ids: stuck });
  for (const id of dropOrders) delete d.orders[id];
  for (const id of dropTransfers) delete d.funding[id];
  return d;
}

/**
 * Throws a FixedMonthError unless every fixed month (a Map from fixedMonths, a Set or a list of ids) has
 * the same orders (ids and cents, for the orders its money pays for), the same transfers (ids and cents)
 * and, in a field month, the same fields (split, chosen fields and lists) in `afterPlan` as in
 * `beforePlan`. With no plan before (it could not be built), there is nothing to keep.
 */
export function checkFixedUnchanged(base, beforePlan, afterPlan, fixed) {
  if (!beforePlan) return;
  const F = facts(base);
  const ids = fixed instanceof Map || fixed instanceof Set ? [...fixed.keys()] : Array.isArray(fixed) ? fixed : Object.keys(fixed || {});
  const fieldsOf = (plan, f) => { const x = plan.scale && plan.scale.fields ? plan.scale.fields[f] : null; return x ? (x.W ? [x.s, x.F, x.L, x.W] : [x.s, x.F, x.L]) : null; };
  const sig = (plan, f) => JSON.stringify([
    plan.orders.filter((o) => orderMonth(F, o.id) === f).map((o) => [o.id, toCents(o.usd)]).sort(byId),
    plan.funding.transfers.filter((t) => t.forDate === f).map((t) => [t.id, toCents(t.usd)]).sort(byId),
    fieldsOf(plan, f),
  ]);
  for (const f of ids) if (sig(beforePlan, f) !== sig(afterPlan, f)) throw new FixedMonthError({ dateId: f });
}

/**
 * A plan change worked out on a copy, without saving anything: the months fixed now, the plan before
 * (planOrNull), mutator(draft), the plan after (planOrNull; its error is thrown), the fixed months checked,
 * and the records the new plan has no place for dropped (tidy). Returns { state, plan, fixed }: the changed
 * copy and its plan. Throws a PlanFitError, a MonthChangeError or a FixedMonthError. core.commitPlanChange
 * saves the same deterministic mutator afterwards.
 */
export function planChange(base, state, mutator, { ignoreTransfer = null } = {}) {
  const fixed = fixedMonths(base, state, { ignoreTransfer });
  const before = planOrNull(base, state.plan).plan;
  const draft = structuredClone(state);
  mutator(draft);
  const r = planOrNull(base, draft.plan);
  if (!r.plan) throw r.error || new MonthChangeError("no_plan", "There is no monthly amount yet.");
  checkFixedUnchanged(base, before, r.plan, fixed);
  tidy(draft, r.plan);
  return { state: draft, plan: r.plan, fixed };
}

/** The orders marked placed whose amount a change would alter, or that it would no longer buy (ids). */
export function placedChanged(state, beforePlan, afterPlan) {
  if (!beforePlan || !afterPlan) return [];
  const was = new Map(beforePlan.orders.map((o) => [o.id, toCents(o.usd)]));
  const now = new Map(afterPlan.orders.map((o) => [o.id, toCents(o.usd)]));
  return Object.entries(isObj(state) && isObj(state.orders) ? state.orders : {})
    .filter(([id, o]) => isObj(o) && o.status === "placed" && was.has(id) && now.get(id) !== was.get(id))
    .map(([id]) => id);
}

// ---------------------------------------------------------------- the transfer dialog (ask 2)

/**
 * Whether recording transfer `transferId` at `usd` dollars can also size its month to that amount:
 * { ok, reason, dateId, plan, error? }. reason is null when ok, else:
 * - "unknown": the transfer is not in the plan; "pre_join": its month is before the friend joined;
 * - "two_transfers": the month's money goes in more than one transfer (November with coins, or a month of
 *   an own mix with coins), so one transfer's amount does not say what the month is;
 * - "records": another record fixes the month (re-recording the same transfer is allowed);
 * - "range": usd is not $25 to $10,000; "fit": the month cannot be worked out at usd.
 * plan is the plan with the month sized to usd (when ok). opts.plan: the present plan, when known.
 */
export function sizeCheck(base, state, { transferId, usd, plan = null } = {}) {
  const s = isObj(state) ? state : {};
  const no = (reason, dateId = null, extra = {}) => ({ ok: false, reason, dateId, plan: null, ...extra });
  const cur = plan || planOrNull(base, s.plan).plan;
  if (!cur || !isObj(s.plan)) return no("fit");
  const t = cur.funding.transfers.find((x) => x.id === transferId);
  if (!t) return no("unknown");
  const f = t.forDate;
  if (beforeJoin(base, s.plan.joinedAt).dateIds.includes(f)) return no("pre_join", f);
  if (cur.funding.transfers.filter((x) => x.forDate === f).length > 1) return no("two_transfers", f);
  if (fixedMonths(base, s, { ignoreTransfer: t.id }).has(f)) return no("records", f);
  if (!isMonthlyUsdInRange(usd)) return no("range", f);
  const draft = structuredClone(s);
  try {
    setMonthAmount(draft, base, { dateId: f, usd, input: { currency: "USD", amount: round2(usd) }, ignoreTransfer: t.id });
  } catch (e) {
    return no("records", f, { error: e });
  }
  const r = planOrNull(base, draft.plan);
  if (!r.plan) return no(r.error instanceof PlanFitError && r.error.code === "month_range" ? "range" : "fit", f, { error: r.error });
  // The month's money must still go in this one transfer, and all of it.
  const mine = r.plan.funding.transfers.filter((x) => x.forDate === f);
  if (mine.length !== 1 || mine[0].id !== t.id || toCents(mine[0].usd) !== toCents(usd)) return no("two_transfers", f);
  return { ok: true, reason: null, dateId: f, plan: r.plan };
}

// ---------------------------------------------------------------- refusals in plain words

/** How a holding is named in a sentence: funds by ticker, stocks by name, coins by their name in lower case. */
function holdingWord(plan, id, start = false) {
  const i = plan && Array.isArray(plan.instruments) ? plan.instruments.find((x) => x.id === id) : null;
  const o = plan && Array.isArray(plan.orders) ? plan.orders.find((x) => x.instrument === id) : null;
  let w = String(id || "").slice(0, 24);
  if (i && o && !o.wholeShares) w = o.fractional ? String(i.name) : String(i.name).toLowerCase();
  return start ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}
const listWords = (ws) => (ws.length < 3 ? ws.join(" and ") : `${ws.slice(0, -1).join(", ")} and ${ws[ws.length - 1]}`);

/**
 * One plain sentence for why a change or a file cannot be used. err: a PlanFitError (scale.js), a
 * MonthChangeError or FixedMonthError (this file), or any other error. plan: the base or any scaled plan
 * (for month and holding names). context "amount" words a VWRA shortfall for an amount screen.
 */
export function explainFit(err, plan = null, { context = "mix" } = {}) {
  if (!err) return "";
  if (err instanceof MonthChangeError) return err.message;
  if (!(err instanceof PlanFitError)) return "Tide Table could not work this out, so nothing was changed.";
  const range = `from ${fmtMoney(MIN_MONTHLY_USD)} to ${fmtMoney(MAX_MONTHLY_USD)}`;
  switch (err.code) {
    case "month_range":
      return err.dateId ? `The amount for ${monthWord(plan, err.dateId)} must be ${range}.` : `The monthly amount must be ${range}.`;
    case "mix_value": {
      const rest = plan && Array.isArray(plan.orders) ? (plan.orders.find((o) => o.carryTarget) || {}).instrument : null;
      const known = plan && Array.isArray(plan.instruments) && plan.instruments.some((i) => i.id === err.id);
      if (err.id != null && err.id === rest) return `${err.id} takes the rest of each month, so it has no share of its own.`;
      if (err.id == null || !known) return "The mix can only name the plan's funds, stocks and coins.";
      return `${holdingWord(plan, err.id, true)}: type a percentage from 0 to 100, with at most one decimal, for example 2.5.`;
    }
    case "mix_total":
      // The addendum's one mix-total refusal, for the standing mix and a month's own (pinned) mix alike.
      return "Your shares add up to more than 100%.";
    case "vwra_none": {
      const m = (Array.isArray(err.months) && err.months[0]) || {};
      const month = monthWord(plan, m.dateId);
      const floor = fmtMoney(VWRA_FLOOR_CENTS / 100);
      if (context === "amount") return `At ${fmtMoney((m.amountCents || 0) / 100)}, your mix leaves less than ${floor} for VWRA in ${month}. Choose a larger amount, or change your mix first.`;
      const names = (m.instruments || []).map((id) => holdingWord(plan, id));
      const lower = names.length > 1 ? "Lower one of them to use this mix." : "Lower it to use this mix.";
      return `In ${month}, ${listWords(names)} would take ${fmtMoney((m.othersCents || 0) / 100)} of ${month}'s ${fmtMoney((m.amountCents || 0) / 100)}. VWRA needs at least ${floor} of every month. ${lower}`;
    }
    case "input":
      return err.message;
    case "text":
      return "The plan's text has no version for this change, so it cannot be used.";
    case "mix_and_fields":
      return "A month cannot have both a mix and fields.";
    case "fields":
      return err.problem ? explainFieldsProblem(err.problem) : "The fields for this month cannot be used.";
    default:
      return err.message;
  }
}
