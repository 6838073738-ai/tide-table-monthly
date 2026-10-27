// A friend's year, month by month, and field mode: how a month's money becomes orders when the friend has
// chosen fields and set their split (spec 8.3 and 8.4). Pure ES module: no DOM, no storage and no fetch, and
// it imports scale.js only, so the app and its tests load the same file. months.js builds on it.
//
// Words used here:
// - a field spec is { chosen: [field ids], split, lists: { fieldId: [company ids] } }: the fields the friend
//   chose, their split in tenths of a percent (0 to 1000: the share of the month that goes to the fields)
//   and the companies they ticked in each field;
// - a field month is an order date that follows a field spec: plan.fields from plan.fields.from on, or a
//   month pinned with months[d].fields (see resolveMonths);
// - the names snapshot (plan.fields.names) is { companyId: { n: name, t: ticker, v: venue } }, saved when
//   the friend adds a company, so orders never need the data files;
// - an upcoming listing (the 27 Oct 2026 addendum; docs/tt2/build/upcoming-api.md section 6) is a company whose
//   snapshot also has w: { k: its list key, f: its first trading day or null, s: the first month it may count
//   in, or null }. It is waiting in every month whose order date is not after f (and before s): its field's part
//   then goes in equal parts to the field's other ticked companies that trade, or to VWRA when none does.
//
// Money is worked in integer cents. In a field month (A cents, split s):
//   P = floor(A * s / 1000)         the fields' part
//   P_f = floor(P / |F|)            each chosen field's part
//   raw = floor(P_f / |L_f|)        each ticked company's part of that field
//   a company's order is its raw parts (one per field it is ticked in) rounded down to whole dollars;
//   under $5 it is not bought (rolled, reason "below_min"); VWRA takes everything else, $0 or more.
// With s = 0 nothing goes to the fields: VWRA takes the month and no company is rolled.
//
// The year is worked out by scale.js. A field month is first an own-mode month with every holding at 0%
// (so its base orders give way, VWRA holds the month and its SwissBorg money is dropped), then its VWRA
// order is lowered and the company orders are added. The plan's text is rendered last, so its words about
// a field month name the companies.
//
// The locked 10% (Tide Table 2.1; lock.js, docs/tt2/build/lock-api.md): a plan record with a lock record
// (plan.lock) is worked out with every lock month's orders at 90% of the month, field months included (the
// split's part is floor(9 * A * s / 10^4)), and the 10% goes to VWRA or, once the listing trades, to its own
// order. A plan record without one is worked out exactly as in 2.0.

import {
  scalePlan, scaleAmounts, renderTemplates, beforeJoin, planShares, ownOrderId, ownIdMonth, fmtMoney,
  PlanFitError, DEFAULT_MIN_ORDER_USD, MIX_TENTHS_MAX,
} from "./scale.js?v=2.1.0";
import {
  readLock, lockState, ninetyYear, addLockOrders, rebuildTransfers, retotal, checkRollable, lockTemplates, LOCK_NAME,
} from "./lock.js?v=2.1.0";

/** The 14 field ids in catalogue order (spec 6.1: the 11 big fields A to Z by plain name, then the
 *  close-ups). app/js/fields-catalog.js holds the catalogue itself; a test keeps the two the same. */
export const FIELD_IDS = Object.freeze(["financials", "energy", "staples", "health", "realestate", "industrials",
  "materials", "communication", "utilities", "discretionary", "technology", "cars", "retail", "telecom"]);
/** What a field id looks like (spec 6.1), known or not. */
export const FIELD_ID = /^[a-z]{3,16}$/;
/** A company id (spec 4.3): s + SEC CIK, j + JPX code, l + LEI. */
export const COMPANY_ID = /^[sjl][0-9A-Z]{1,19}$/;
/** The split is tenths of a percent of the month, 0 to this. */
export const SPLIT_MAX = MIX_TENTHS_MAX;
/** At most this many companies on one field's list, and on all of them together. */
export const MAX_FIELD_COMPANIES = 20;
export const MAX_COMPANIES = 60;
/** The smallest company order, in cents: the plan's fractional US minimum ($5). */
export const MIN_ORDER_CENTS = DEFAULT_MIN_ORDER_USD.fractional_usd * 100;
/** The venues of a main listing whose company can go on a friend's list (spec 8.3, `addable`). */
export const ADDABLE_VENUES = Object.freeze(["NYSE", "NASDAQ", "NYSE American", "Cboe"]);
/** The longest name, ticker and venue a names snapshot keeps (the data schema's caps). */
export const NAME_CAPS = Object.freeze({ n: 120, t: 12, v: 16 });
/** The group the companies of field months are in (plan.groups gains it when one is bought). */
export const FIELDS_GROUP = Object.freeze({ id: "fields", label: "Your fields", rebalanceTargetPct: null });

const MONTH_ID = /^m\d\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LISTING_KEY = /^[a-z0-9-]{1,40}$/;
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const has = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const toCents = (x) => Math.round(x * 100);
/** n / d rounded down, for integers n >= 0 and d > 0, without a floating-point division. */
const divFloor = (n, d) => (n - (n % d)) / d;
const RANK = new Map(FIELD_IDS.map((id, k) => [id, k]));

/** Field ids in catalogue order: the known ones first, then any other (kept from a month with records)
 *  in code-unit order. Duplicates are left out. */
export function fieldOrder(ids) {
  const list = [...new Set(Array.isArray(ids) ? ids : [])];
  return list.sort((a, b) => {
    const ra = RANK.has(a) ? RANK.get(a) : Infinity, rb = RANK.has(b) ? RANK.get(b) : Infinity;
    return ra !== rb ? ra - rb : byCode(a, b);
  });
}

/** True when a company can go on a friend's list: its saved venue (names[id].v) is one of ADDABLE_VENUES. */
export const isAddableVenue = (v) => ADDABLE_VENUES.includes(v);

/** A real calendar date written YYYY-MM-DD. */
export function isDay(v) {
  if (typeof v !== "string" || !DAY.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// ---------------------------------------------------------------- names

/** A text cut to `max` characters (code points), ending in "…" when it was longer. Never empty for a
 *  non-empty text. */
export function capText(s, max) {
  if (typeof s !== "string") return null;
  const cs = Array.from(s);
  return cs.length > max ? cs.slice(0, max - 1).join("") + "…" : s;
}

/**
 * An upcoming listing's waiting record, ready to save: { k, f, s }. k is its list key ("" when unreadable), f its
 * first trading day or null, s the first month it may count in or null. A record that is not readable keeps the
 * row waiting (f null), so it never gets money by mistake. Null when w is not an object.
 */
export function waitingSnapshot(w) {
  if (!isObj(w)) return null;
  const k = typeof w.k === "string" && LISTING_KEY.test(w.k) ? w.k : "";
  const sOk = w.s == null || (typeof w.s === "string" && MONTH_ID.test(w.s));
  const f = isDay(w.f) && sOk ? w.f : null;
  return { k, f, s: f && w.s != null ? w.s : null };
}

/** The names snapshot of a company, ready to save: { n, t, v } with the caps applied (an over-long value is
 *  cut, never dropped), plus w for an upcoming listing (waitingSnapshot). `company` is { name, ticker, venue }
 *  (a data row or a listing) or { n, t, v }, either with an optional w. */
export function nameSnapshot(company) {
  const c = isObj(company) ? company : {};
  const n = c.n !== undefined ? c.n : c.name;
  const t = c.t !== undefined ? c.t : c.ticker;
  const v = c.v !== undefined ? c.v : c.venue;
  const out = { n: capText(typeof n === "string" ? n : "", NAME_CAPS.n), t: typeof t === "string" ? capText(t, NAME_CAPS.t) : null, v: typeof v === "string" ? capText(v, NAME_CAPS.v) : null };
  const w = waitingSnapshot(c.w);
  if (w) out.w = w;
  return out;
}

// ---------------------------------------------------------------- upcoming listings: who trades in a month

/**
 * True when a company with waiting record w (a names snapshot's w) does not trade in month dateId, whose order
 * date is `date`: its first trading day is unknown or not before the order date, or the month comes before w.s
 * (an s that is not one of dateIds means after every month). False for a company with no w.
 */
export function isWaiting(w, date, dateId, dateIds) {
  if (!isObj(w)) return false;
  const r = waitingSnapshot(w);
  if (!r.f || !(typeof date === "string" && date > r.f)) return true;
  if (r.s == null) return false;
  const ks = dateIds.indexOf(r.s);
  return ks < 0 || dateIds.indexOf(dateId) < ks;
}

/** The ids of a names snapshot that are waiting in month dateId of the base plan (a Set). */
export function waitingIn(names, base, dateId) {
  const out = new Set();
  const dateIds = base.orderDates.map((d) => d.id);
  const d = base.orderDates.find((x) => x.id === dateId);
  for (const [id, e] of Object.entries(isObj(names) ? names : {})) {
    if (isObj(e) && isObj(e.w) && isWaiting(e.w, d ? d.date : null, dateId, dateIds)) out.add(id);
  }
  return out;
}

/** The catalogue composePlan names companies from: { companyId: { name, ticker, venue } }, built from a
 *  names snapshot. A company with no saved name is named by its id. */
export function catalogFrom(names) {
  const out = {};
  for (const [id, e] of Object.entries(isObj(names) ? names : {})) {
    if (!isObj(e)) continue;
    out[id] = { name: typeof e.n === "string" && e.n ? e.n : id, ticker: typeof e.t === "string" ? e.t : null, venue: typeof e.v === "string" ? e.v : null };
  }
  return out;
}

// ---------------------------------------------------------------- a field spec

/**
 * Every problem with a field spec, in the order a friend would fix them: [{ code, field?, id? }], [] when it
 * can be saved and bought. Codes:
 * - "shape": not a spec at all (wrong types); "split_unset": no split yet; "bad_split": not 0 to 1000;
 * - "no_field": no field chosen; "unknown_field" {field}: not one of the 14 (only with known: true);
 * - "empty_list" {field}: a chosen field with no company; "field_cap" {field}: more than 20 on one list, or
 *   a company on it twice;
 * - "total_cap": more than 60 on all lists; "bad_id" {id}: not a company id;
 * - with names: "no_name" {id}: no saved name; "not_addable" {id}: its venue is not one of ADDABLE_VENUES.
 * A list for a field that is not chosen is ignored (it is never bought).
 */
export function fieldsProblems(spec, { names = null, known = true } = {}) {
  const out = [];
  if (!isObj(spec) || !Array.isArray(spec.chosen) || (spec.lists != null && !isObj(spec.lists))
    || spec.chosen.some((f) => typeof f !== "string" || !FIELD_ID.test(f)) || new Set(spec.chosen).size !== spec.chosen.length) {
    return [{ code: "shape" }];
  }
  if (spec.split == null) out.push({ code: "split_unset" });
  else if (!Number.isInteger(spec.split) || spec.split < 0 || spec.split > SPLIT_MAX) out.push({ code: "bad_split" });
  if (!spec.chosen.length) out.push({ code: "no_field" });
  const lists = isObj(spec.lists) ? spec.lists : {};
  let total = 0;
  for (const f of fieldOrder(spec.chosen)) {
    if (known && !RANK.has(f)) out.push({ code: "unknown_field", field: f });
    const L = lists[f];
    if (L != null && !Array.isArray(L)) return [{ code: "shape" }];
    if (!L || !L.length) { out.push({ code: "empty_list", field: f }); continue; }
    if (L.some((id) => typeof id !== "string")) return [{ code: "shape" }];
    if (L.length > MAX_FIELD_COMPANIES || new Set(L).size !== L.length) out.push({ code: "field_cap", field: f });
    total += L.length;
    for (const id of L) {
      if (!COMPANY_ID.test(id)) { out.push({ code: "bad_id", id }); continue; }
      if (names == null) continue;
      const e = isObj(names) ? names[id] : null;
      if (!isObj(e) || typeof e.n !== "string" || !e.n) out.push({ code: "no_name", id });
      else if (!isAddableVenue(e.v)) out.push({ code: "not_addable", id });
    }
  }
  if (total > MAX_COMPANIES) out.push({ code: "total_cap" });
  return out;
}

/** The first problem of fieldsProblems, or null when the spec can be saved. */
export function fieldsProblem(spec, opts = {}) {
  return fieldsProblems(spec, opts)[0] || null;
}

/**
 * One plain sentence for a problem of fieldsProblems (for the Save my split dock and its refusals).
 * fieldName(id) gives a field's plain name; an unknown field is "this field".
 */
export function explainFieldsProblem(p, fieldName = () => "this field") {
  if (!p) return "";
  const name = (id) => (typeof fieldName === "function" && fieldName(id)) || "this field";
  switch (p.code) {
    case "split_unset": return "Choose your split first.";
    case "bad_split": return "Your split must be from 0% to 100%.";
    case "no_field": return "Choose a field to mix it in.";
    case "unknown_field": return "Your fields must be among Tide Table's 14 fields.";
    case "empty_list": { const f = name(p.field); return `Your list in ${f} is empty. Add a company to ${f}, or take ${f} out of your fields.`; }
    case "field_cap": return `Your list in ${name(p.field)} can hold up to ${MAX_FIELD_COMPANIES} companies, each once.`;
    case "total_cap": return `Your lists can hold up to ${MAX_COMPANIES} companies in all.`;
    case "not_addable": return "Tide Table places these orders in US dollars at Interactive Brokers on US exchanges, so you can read about this company here but not add it to a list.";
    default: return "Tide Table cannot read one of the companies on your list.";
  }
}

/** The field spec as composePlan reads it: chosen in catalogue order, each list in id order without
 *  duplicates, only the chosen fields' lists. The caps are for saving, not for working a month out (a month
 *  with records keeps the spec it was bought with). Throws a PlanFitError "fields" when it cannot be bought. */
function readySpec(spec, dateId) {
  const ps = fieldsProblems(spec, { known: false }).filter((x) => x.code !== "field_cap" && x.code !== "total_cap");
  if (ps.length) throw new PlanFitError("fields", "The fields for this month cannot be used.", { dateId, problem: ps[0] });
  const F = fieldOrder(spec.chosen);
  const L = Object.fromEntries(F.map((f) => [f, [...new Set(spec.lists[f])].sort(byCode)]));
  return { s: spec.split, F, L };
}

// ---------------------------------------------------------------- one field month

/**
 * How one field month's money becomes orders (spec 8.3): A is the month's amount in cents, spec a field
 * spec, waiting the companies that do not trade that month (ids, a Set or an array; upcoming-api.md 6).
 * Returns, all in cents:
 * { s, F, L, A, P, P_f, buys: [{ company, cents, parts: [{ field, n }] }], rolled: [{ company, cents, usd }],
 *   vwra, rounding, rolledCents }, plus, only when a company on the lists is waiting, W (those ids, id order),
 *   waitingCents (the parts of fields with no company trading, which VWRA takes) and waitingFields (those fields)
 * - buys: the companies bought, in the order of F and then of each list (a company ticked in two fields is
 *   one order of both parts); each is whole dollars and at least $5;
 * - rolled: the companies not bought because their part is under $5 (cents: their exact part; usd: whole
 *   dollars); with s = 0 there are none;
 * - vwra = A - the buys (0 or more): what VWRA takes; it is (A - P) + rounding + rolledCents.
 * With ninety (a lock month, lock.js), the fields' part is of 90% of the month: P = floor(9 * A * s / 10^4), so
 * VWRA also keeps the other 10%; the result then has ninety: true.
 * Throws a PlanFitError "fields" for a spec that cannot be bought (no field, an empty list, a bad split).
 */
export function splitMonth(A, spec, { dateId = null, waiting = null, ninety = false } = {}) {
  if (!Number.isSafeInteger(A) || A < 0) throw new RangeError("splitMonth: the month's amount must be a whole number of cents.");
  const { s, F, L } = readySpec(spec, dateId);
  if (!Number.isSafeInteger((ninety ? 9 : 1) * A * s)) throw new Error("splitMonth: the month is too large to work out exactly.");
  const wait = waiting instanceof Set ? waiting : new Set(Array.isArray(waiting) ? waiting : []);
  const P = ninety ? divFloor(9 * A * s, 10 * SPLIT_MAX) : divFloor(A * s, SPLIT_MAX);
  const P_f = divFloor(P, F.length);
  const raw = new Map(); // company -> { cents, parts }, in the order of F and then of each list
  const W = new Set(), waitingFields = [];
  let waitingCents = 0;
  for (const f of F) {
    const live = L[f].filter((c) => !wait.has(c));
    for (const c of L[f]) if (wait.has(c)) W.add(c);
    if (!live.length) { waitingFields.push(f); waitingCents += P_f; continue; }
    const part = divFloor(P_f, live.length);
    for (const c of live) {
      const r = raw.get(c) || { cents: 0, parts: [] };
      r.cents += part;
      r.parts.push({ field: f, n: live.length });
      raw.set(c, r);
    }
  }
  const buys = [], rolled = [];
  let spent = 0, rolledCents = 0;
  if (s > 0) {
    for (const [company, r] of raw) {
      const dollars = divFloor(r.cents, 100);
      if (dollars * 100 < MIN_ORDER_CENTS) {
        rolled.push({ company, cents: r.cents, usd: dollars });
        rolledCents += r.cents;
      } else {
        buys.push({ company, cents: dollars * 100, parts: r.parts });
        spent += dollars * 100;
      }
    }
  }
  const out = { s, F, L, A, P, P_f, buys, rolled, vwra: A - spent, rounding: P - spent - rolledCents - waitingCents, rolledCents };
  if (W.size) Object.assign(out, { W: [...W].sort(byCode), waitingCents, waitingFields });
  if (ninety) out.ninety = true;
  return out;
}

// ---------------------------------------------------------------- what each month resolves to

/** The standing field spec of a plan record: { from, spec } when plan.fields names a month to start from
 *  and at least one field, else null. */
function standingFields(p) {
  const f = isObj(p.fields) ? p.fields : null;
  if (!f || typeof f.from !== "string" || !MONTH_ID.test(f.from) || !Array.isArray(f.chosen) || !f.chosen.length) return null;
  return { from: f.from, spec: { chosen: f.chosen, split: f.split, lists: isObj(f.lists) ? f.lists : {} } };
}

/**
 * Each order date of the plan, in date order, as the friend's plan record resolves it:
 * { dateId, date, usd, input, own, pinned, mix, mixPinned, preJoin, mode, fields, fieldsPinned }.
 * - usd and input: the month's own amount (or pin) and how it was typed, else the usual amount's;
 * - own: set by the friend for that month only; pinned: kept by the app before a later change;
 * - mix: the month's own (pinned) mix, else the standing one ({} in a field month);
 * - fields: the field spec the month follows, or null; fieldsPinned: it is the month's own pin;
 * - mode: "fields" in a field month, else "own" when the mix is not {}, else "example" (the $500 plan's mix);
 * - preJoin: before the friend joined. Such a month always follows the example plan, so nothing is bought
 *   in it. Its amount is the usual one unless it was pinned because a record fixes it (a fill or skip of
 *   January's ether or solana, which November's money pays for).
 * A month follows plan.fields from plan.fields.from on, unless a pin says otherwise: months[d].fields pins
 * its own spec, and months[d].mix keeps it out of the fields. A month with both is refused when its plan
 * is worked out (mix_and_fields).
 */
export function resolveMonths(base, planRec) {
  const p = isObj(planRec) ? planRec : {};
  const pre = beforeJoin(base, p.joinedAt);
  const months = isObj(p.months) ? p.months : {};
  const standing = isObj(p.mix) ? p.mix : {};
  const sf = standingFields(p);
  const fromK = sf ? base.orderDates.findIndex((d) => d.id === sf.from) : -1;
  return base.orderDates.map((d, k) => {
    const preJoin = pre.dateIds.includes(d.id);
    const e = isObj(months[d.id]) ? months[d.id] : {};
    const hasUsd = e.usd != null;
    const own = !preJoin && hasUsd && e.own === true;
    const pinF = !preJoin && isObj(e.fields);
    const pinM = isObj(e.mix);
    const fields = preJoin ? null : pinF ? e.fields : !pinM && fromK >= 0 && k >= fromK ? sf.spec : null;
    const mix = preJoin ? {} : pinM ? e.mix : fields ? {} : standing;
    return {
      dateId: d.id,
      date: d.date,
      usd: hasUsd ? e.usd : p.monthlyUsd,
      input: hasUsd ? e.input || null : p.input || null,
      own,
      pinned: hasUsd && !own,
      mix,
      mixPinned: !preJoin && pinM,
      preJoin,
      mode: fields ? "fields" : Object.keys(mix).length ? "own" : "example",
      fields,
      fieldsPinned: pinF,
    };
  });
}

/**
 * The arguments scale.js takes for a plan record: { monthlyUsd, input, months: { dateId: { usd?, input?,
 * mix? } }, mix }. Only what differs from the usual amount and the standing mix is written; a month before
 * the friend joined is written as { mix: {} } when the standing mix is the friend's own, so it stays on the
 * example plan's mix. With no month entries and no mix, months and mix are {} (the one-amount plan exactly).
 * Field months are not in it: fieldMonthsOf says which they are.
 */
export function specOf(base, planRec) {
  const p = isObj(planRec) ? planRec : {};
  const standing = isObj(p.mix) ? { ...p.mix } : {};
  const months = {};
  for (const r of resolveMonths(base, p)) {
    const e = {};
    if (r.own || r.pinned) {
      e.usd = r.usd;
      if (r.input) e.input = r.input;
    }
    if (r.preJoin ? Object.keys(standing).length > 0 : r.mixPinned) e.mix = { ...r.mix };
    if (Object.keys(e).length) months[r.dateId] = e;
  }
  return { monthlyUsd: p.monthlyUsd, input: p.input || null, months, mix: standing };
}

/** The field months of a plan record: { dateId: field spec }, in date order. */
export function fieldMonthsOf(base, planRec) {
  const out = {};
  for (const r of resolveMonths(base, planRec)) if (r.mode === "fields") out[r.dateId] = r.fields;
  return out;
}

/** An input record as scalePlan reads it (its usd is worked out again there). */
const inputArg = (i) => ({ currency: i.currency, amount: i.amount, rate: i.rate, rateSource: i.rateSource, rateDate: i.rateDate });

/** scalePlan's arguments for a plan record: { monthlyUsd, opts }. With inputs false, the amounts as typed
 *  (the standing one and each month's) are left out, so only the dollars count. */
export function scaleArgs(base, planRec, { inputs = true } = {}) {
  const s = specOf(base, planRec);
  const months = {};
  for (const [d, e] of Object.entries(s.months)) {
    const x = {};
    if (e.usd != null) x.usd = e.usd;
    if (inputs && e.input) x.input = inputArg(e.input);
    if (e.mix) x.mix = e.mix;
    months[d] = x;
  }
  const opts = { months, mix: s.mix };
  if (inputs && s.input) opts.input = inputArg(s.input);
  return { monthlyUsd: s.monthlyUsd, opts };
}

// ---------------------------------------------------------------- the year

const memo = new WeakMap();
/** What field months need from the base, once per base: the fund that takes the rest (VWRA), the mix that
 *  sets every other holding to 0%, the order dates and the US venue's clock on a date. */
function baseOf(base) {
  let b = memo.get(base);
  if (b) return b;
  const restId = (base.orders.find((o) => o.carryTarget) || {}).instrument;
  if (!restId) throw new Error("composePlan: the base plan has no order that takes the rest.");
  const zero = Object.fromEntries(Object.keys(planShares(base)).filter((id) => id !== restId).map((id) => [id, 0]));
  const dateOf = Object.fromEntries(base.orderDates.map((d) => [d.id, d.date]));
  const venueOf = Object.fromEntries((base.instruments || []).map((i) => [i.id, i.venue || i.id]));
  // The US venue keeps the clock of its latest base order on or before the date, else of its first one,
  // as scale.js does for own-mode orders (22:30 Bangkok time before US daylight saving, 21:30 after it).
  const us = base.orders.filter((o) => (venueOf[o.instrument] || o.instrument) === "US").map((o) => [dateOf[o.dateId], o.time]);
  us.sort((a, b) => byCode(a[0], b[0]));
  if (!us.length) throw new Error("composePlan: the base plan has no US order to take the clock from.");
  const usTime = (date) => { let t = us[0][1]; for (const [d, time] of us) if (d <= date) t = time; return t; };
  b = { restId, zero, dateOf, usTime };
  memo.set(base, b);
  return b;
}

// The plan text, as scale.js applies it: each template's text written into its path, then the array items
// whose text is null removed, highest index first. (scale.js keeps these helpers private; they are the
// same steps, and a test checks the year comes out byte for byte as scalePlan's.)
function step(node, key) {
  if (Array.isArray(node)) {
    if (/^\d+$/.test(key)) return { ok: Number(key) < node.length, key: Number(key) };
    const k = node.findIndex((x) => x && typeof x === "object" && x.id === key);
    return { ok: k >= 0, key: k };
  }
  if (node && typeof node === "object") return { ok: Object.prototype.hasOwnProperty.call(node, key), key };
  return { ok: false, key };
}
function locate(obj, path) {
  const keys = path.slice(1).split("/");
  let node = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const s = step(node, keys[i]);
    if (!s.ok) return null;
    node = node[s.key];
  }
  const s = step(node, keys[keys.length - 1]);
  return s.ok ? { parent: node, key: s.key } : null;
}
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
function applyTexts(plan, templates = plan.templates) {
  const rendered = renderTemplates(plan, templates);
  const drops = new Map();
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

/** The field months' orders, rolls, instruments and explanations, added to a numbers-only plan. ninety: the
 *  lock months (a Set), whose split is of 90% of the month (splitMonth). */
function addFields(base, plan, fieldMonths, catalog, waiting, ninety = null) {
  const B = baseOf(base);
  const sc = plan.scale;
  const fieldIds = plan.orderDates.map((d) => d.id).filter((d) => has(fieldMonths, d));
  const companies = new Set();
  sc.fields = {};
  for (const d of fieldIds) {
    const A = toCents(sc.months[d]);
    const n9 = !!(ninety && ninety.has(d));
    const r = splitMonth(A, fieldMonths[d], { dateId: d, waiting: isObj(waiting) ? waiting[d] : null, ninety: n9 });
    const vwraId = ownOrderId(d, B.restId);
    const k = plan.orders.findIndex((o) => o.id === vwraId);
    if (k < 0) throw new Error(`composePlan: ${d} has no ${B.restId} order.`);
    const v = plan.orders[k];
    v.usd = r.vwra / 100;
    const time = B.usTime(B.dateOf[d]);
    const buys = r.buys.map((b) => ({ id: ownOrderId(d, b.company), dateId: d, instrument: b.company, account: v.account, time, kind: "usd", usd: b.cents / 100, ceiling: null, fractional: true }));
    plan.orders.splice(k + 1, 0, ...buys);
    for (const x of r.rolled) {
      sc.rolled.push({ id: ownOrderId(d, x.company), instrument: x.company, account: v.account, dateId: d, fundDateId: d, into: vwraId, usd: x.usd, exactUsd: x.cents / 100, minUsd: MIN_ORDER_CENTS / 100, style: "fractional_usd", reason: "below_min" });
    }
    for (const f of r.F) for (const c of r.L[f]) companies.add(c);
    sc.fields[d] = { s: r.s, F: r.F, L: r.L, A: r.A, P: r.P, P_f: r.P_f, vwra: r.vwra, rounding: r.rounding, rolled: r.rolled.map((x) => ownOrderId(d, x.company)), rolledCents: r.rolledCents };
    if (r.W) Object.assign(sc.fields[d], { W: r.W, waitingCents: r.waitingCents, waitingFields: r.waitingFields });
    if (n9) sc.fields[d].ninety = true;
    // The month's Interactive Brokers transfer still pays exactly its amount: VWRA and the companies.
    const paid = plan.orders.filter((o) => ownIdMonth(o.id) === d && o.account === v.account).reduce((a, o) => a + toCents(o.usd), 0);
    const t = plan.funding.transfers.filter((x) => x.forDate === d);
    if (paid !== A || t.length !== 1 || toCents(t[0].usd) !== A || t[0].to !== v.account) throw new Error(`composePlan: ${d} does not add up to its amount.`);
  }
  // The companies as instruments (in id order), so every view can name them and log their fills.
  const yearC = plan.orderDates.reduce((a, d) => a + toCents(sc.months[d.id]), 0);
  const cat = isObj(catalog) ? catalog : {};
  for (const c of [...companies].sort(byCode)) {
    const e = isObj(cat[c]) ? cat[c] : {};
    const name = typeof e.name === "string" && e.name ? e.name : c;
    plan.instruments.push({
      id: c, name, longName: name, symbol: typeof e.ticker === "string" && e.ticker ? e.ticker : c, account: "IBKR", venue: "US",
      quoteCurrency: "USD", group: FIELDS_GROUP.id, targetUsd: 0, sharePct: 0, ceiling: null, orderStyle: "fractional_usd", region: "us",
      exchange: typeof e.venue === "string" ? e.venue : null,
    });
  }
  if (companies.size && !(plan.groups || []).some((g) => g.id === FIELDS_GROUP.id)) (plan.groups || (plan.groups = [])).push({ ...FIELDS_GROUP });
  // Totals, as scale.js works them out.
  const sum = (os) => os.reduce((a, x) => a + toCents(x.usd), 0);
  for (const d of plan.orderDates) d.ibkrTotalUsd = sum(plan.orders.filter((x) => x.dateId === d.id && x.account === "IBKR")) / 100;
  for (const i of plan.instruments) {
    i.targetUsd = sum(plan.orders.filter((x) => x.instrument === i.id)) / 100;
    i.sharePct = Math.round((i.targetUsd / (yearC / 100)) * 1000) / 10;
  }
  plan.meta.stockMoneyUsd = sum(plan.orders.filter((x) => x.account === "IBKR")) / 100;
  plan.meta.orderCount = plan.orders.length;
  sc.fieldMonths = fieldIds;
  const own = (sc.ownMonths || []).filter((d) => !fieldIds.includes(d));
  if (own.length) sc.ownMonths = own;
  else delete sc.ownMonths;
}

/**
 * The year with field months: scalePlan's arguments (monthlyUsd and opts, as scalePlan takes them) and
 * fieldMonths { dateId: field spec } (each a joined month the friend's fields pay for), with catalog
 * { companyId: { name, ticker, venue } } to name the companies. Returns the same plan shape as scalePlan,
 * plus, with field months:
 * - orders "<dateId>-<companyId>" (Interactive Brokers, fractional, the US venue's clock that day) after the
 *   month's VWRA order "<dateId>-VWRA", which takes the rest ($0 or more, as in own mode);
 * - the month's Interactive Brokers transfer (its base id) for the whole amount, and no SwissBorg transfer;
 * - plan.scale.rolled with the companies not bought; plan.scale.fieldMonths (date order); plan.scale.fields
 *   { dateId: { s, F, L, A, P, P_f, vwra, rounding, rolled: [order ids], rolledCents } } (cents) for the
 *   order rows' "why" (orderWhy); plan.scale.ownMonths without the field months; plan.scale.replaced with the
 *   base orders the field months do not buy;
 * - an instrument per company on a list (group "fields") and that group in plan.groups.
 * With fieldMonths {} it is scalePlan's plan byte for byte. waiting { dateId: [company ids] } names the
 * companies that do not trade in a month (upcoming listings, splitMonth). Throws what scalePlan throws, a
 * PlanFitError "mix_and_fields" for a field month that also has a mix, and a PlanFitError "fields" for a
 * field spec that cannot be bought.
 *
 * lock (lock.js): { lock: a lock record (readLock), states: { dateId: "waiting" | "started" | "trades" } } for the
 * lock months (joined months from lock.from on). Their orders are worked out at 90% of the month (ninetyYear; field
 * months with splitMonth's ninety), the 10% stays with VWRA or becomes its own order (addLockOrders), the transfers
 * and totals are worked out again from the orders, and the text is rendered last (lockTemplates). The checks are
 * scalePlan's at the friend's amounts, plus the text check at 90%. plan.scale.lock says what the 10% did each month.
 */
export function composeYear(base, monthlyUsd, opts = {}, fieldMonths = {}, catalog = {}, waiting = {}, lock = null) {
  const o = opts || {};
  const fm = isObj(fieldMonths) ? fieldMonths : {};
  const ids = Object.keys(fm);
  let args = o;
  if (ids.length) {
    const B = baseOf(base);
    const dates = new Set(base.orderDates.map((d) => d.id));
    const months = isObj(o.months) ? { ...o.months } : {};
    for (const d of ids) {
      if (!dates.has(d)) throw new RangeError(`"${String(d).slice(0, 24)}" is not one of the plan's order dates.`);
      const e = isObj(months[d]) ? months[d] : {};
      if (e.mix != null) throw new PlanFitError("mix_and_fields", "A month cannot have both a mix and fields.", { dateId: d });
      months[d] = { ...e, mix: B.zero };
    }
    args = { ...o, months };
  }
  const ref = scalePlan(base, monthlyUsd, args); // every check scale.js makes, and the plan's scale record
  const lk = lock && isObj(lock.states) && readLock(lock.lock) ? lock : null;
  const lockSet = lk ? new Set(Object.keys(lk.states).filter((d) => lk.states[d])) : null;
  let plan, year = null;
  if (lk) {
    year = ninetyYear(base, monthlyUsd, args, lockSet);
    plan = year.plan;
    plan.scale = structuredClone(ref.scale);
    plan.scale.rolled = year.rolled;
  } else {
    ({ plan } = scaleAmounts(base, monthlyUsd, args));
    plan.scale = structuredClone(ref.scale);
  }
  const input = plan.scale.input;
  if (input && input.currency === "THB") {
    plan.meta.planFx = input.rate;
    for (const f of plan.fx || []) if (f.id === "USDTHB") f.plan = input.rate;
  }
  if (ids.length) addFields(base, plan, fm, catalog, waiting, lockSet);
  if (!lk) {
    applyTexts(plan);
    return plan;
  }
  const B = baseOf(base);
  const orderMonths = addLockOrders(plan, { lock: lk.lock, states: lk.states, months: year.months, usTime: B.usTime });
  const tr = rebuildTransfers(base, plan, ref.scale.ownMonths || []);
  plan.funding.transfers = tr.transfers;
  if (tr.dropped.length) plan.scale.droppedTransfers = tr.dropped;
  else delete plan.scale.droppedTransfers;
  retotal(plan, year.months);
  checkRollable(base, plan);
  applyTexts(plan, lockTemplates(base, plan, orderMonths));
  return plan;
}

/** The lock months of a plan record and their states ({ lock, states }), or null when it has no lock record:
 *  every joined month from lock.from on (lock.lockState). */
export function lockMonthsOf(base, planRec) {
  const lock = readLock(isObj(planRec) ? planRec.lock : null);
  if (!lock) return null;
  const states = {};
  for (const r of resolveMonths(base, planRec)) {
    if (r.preJoin) continue;
    const st = lockState(lock, r.dateId, r.date);
    if (st) states[r.dateId] = st;
  }
  return { lock, states };
}

/**
 * The plan for a friend's plan record (spec 8.4): scalePlan for the year, then each field month's orders and
 * Interactive Brokers transfer as spec 8.3 says. `catalog` names the companies; by default it is built from
 * planRec.fields.names (the snapshot), so orders never need the data files. The snapshot's waiting records
 * say which upcoming listings do not trade in a month (waitingIn). With no field months the result is
 * scalePlan(base, ...scaleArgs) exactly. With inputs false, the amounts as typed are left out. Throws what
 * composeYear throws. A plan record with a lock record (plan.lock, lock.js) has its lock months worked out with
 * the locked 10% (composeYear's lock); without one, the plan is the 2.0 plan exactly.
 */
export function composePlan(base, planRec, catalog = null, { inputs = true } = {}) {
  const { monthlyUsd, opts } = scaleArgs(base, planRec, { inputs });
  const fm = fieldMonthsOf(base, planRec);
  const lock = lockMonthsOf(base, planRec);
  if (!Object.keys(fm).length) return lock ? composeYear(base, monthlyUsd, opts, {}, {}, {}, lock) : scalePlan(base, monthlyUsd, opts);
  const names = isObj(planRec) && isObj(planRec.fields) ? planRec.fields.names : null;
  const cat = catalog || catalogFrom(names);
  const waiting = {};
  for (const [d, spec] of Object.entries(fm)) {
    const wait = waitingIn(names, base, d);
    const listed = new Set(Object.values(isObj(spec.lists) ? spec.lists : {}).flat());
    const ids = [...wait].filter((id) => listed.has(id)).sort(byCode);
    if (ids.length) waiting[d] = ids;
  }
  return composeYear(base, monthlyUsd, opts, fm, cat, waiting, lock);
}

// ---------------------------------------------------------------- the order rows' "why" (G5)

const PART_WORDS = ["", "All of", "Half of", "A third of", "A quarter of"];
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const joinAnd = (ws) => (ws.length < 3 ? ws.join(" and ") : `${ws.slice(0, -1).join(", ")} and ${ws[ws.length - 1]}`);
const pctOf = (tenths) => `${Number.isInteger(tenths / 10) ? tenths / 10 : (tenths / 10).toFixed(1)}%`;

/**
 * Why a field month's order has its amount, in plain words, or null for an order of any other month.
 * fieldName(id) gives a field's plain name; an unknown field is "this field". For example:
 * - a company: "All of Cars", "Half of Retail", "A third of Technology", "A quarter of Energy", "1 of 5 equal
 *   parts of Technology"; ticked in two fields: "Half of Cars and a third of Spending and leisure";
 * - VWRA: "60% of the month, plus $3.40 left from rounding, plus $8 from 2 orders under $5", and, while an
 *   upcoming listing is all a field holds that trades, "plus $40 from Technology, where no company you ticked
 *   is trading yet". In a lock month (lock.js) the split is of the other 90%: "60% of the month's other 90%, …,
 *   plus $50, the 10% for Anthropic this month" (or "plus $0.30 left from Anthropic's 10%" once it is an order).
 * A company counts only the companies of its field that trade that month; a waiting one has no order (null).
 */
export function orderWhy(plan, orderId, fieldName = () => "this field") {
  const d = ownIdMonth(orderId);
  const f = d && plan && plan.scale && plan.scale.fields ? plan.scale.fields[d] : null;
  if (!f) return null;
  const name = (id) => (typeof fieldName === "function" && fieldName(id)) || "this field";
  const id = orderId.slice(d.length + 1);
  const rest = (plan.orders.find((o) => o.id === orderId && o.carryTarget) || null);
  if (rest) {
    const parts = [];
    if (f.s < SPLIT_MAX) parts.push(f.ninety ? `${pctOf(SPLIT_MAX - f.s)} of the month's other 90%` : `${pctOf(SPLIT_MAX - f.s)} of the month`);
    if (f.rounding > 0) parts.push(`${fmtMoney(f.rounding / 100)} left from rounding`);
    const k = f.rolled.length;
    if (k) parts.push(`${fmtMoney(f.rolledCents / 100)} from ${k} order${k === 1 ? "" : "s"} under ${fmtMoney(MIN_ORDER_CENTS / 100)}`);
    if (f.waitingCents > 0) parts.push(`${fmtMoney(f.waitingCents / 100)} from ${joinAnd(f.waitingFields.map(name))}, where no company you ticked is trading yet`);
    const lk = plan.scale.lock && isObj(plan.scale.lock.months) ? plan.scale.lock.months[d] : null;
    const who = (plan.scale.lock && plan.scale.lock.name) || LOCK_NAME;
    if (lk && lk.to === "VWRA" && lk.cents > 0) parts.push(`${fmtMoney(lk.cents / 100)}, the 10% for ${who} this month`);
    else if (lk && lk.to === "order" && lk.restCents > 0) parts.push(`${fmtMoney(lk.restCents / 100)} left from ${who}'s 10%`);
    return parts.length ? parts.join(", plus ") : `Nothing is left for ${id} this month.`;
  }
  const W = Array.isArray(f.W) ? f.W : [];
  if (W.includes(id)) return null;
  const parts = f.F.filter((x) => (f.L[x] || []).includes(id)).map((x) => {
    const n = f.L[x].filter((c) => !W.includes(c)).length;
    return n < PART_WORDS.length ? `${PART_WORDS[n]} ${name(x)}` : `1 of ${n} equal parts of ${name(x)}`;
  });
  if (!parts.length) return null;
  return parts.map((p, k) => (k ? lower(p) : p)).join(" and ");
}

/**
 * For the month dialog: "At $25, 4 of your 6 orders would be under $5 and join the all-world fund." when
 * some of a field month's company orders are under $5, else "".
 */
export function underMinWords(plan, dateId) {
  const f = plan && plan.scale && plan.scale.fields ? plan.scale.fields[dateId] : null;
  if (!f || !f.rolled.length) return "";
  const W = Array.isArray(f.W) ? f.W : [];
  const n = new Set(f.F.flatMap((x) => f.L[x] || []).filter((c) => !W.includes(c))).size;
  const at = `At ${fmtMoney(f.A / 100)}, `;
  const min = fmtMoney(MIN_ORDER_CENTS / 100);
  if (n === 1) return `${at}your order would be under ${min} and join the all-world fund.`;
  return `${at}${f.rolled.length} of your ${n} orders would be under ${min} and join the all-world fund.`;
}

/**
 * Why an upcoming listing on the friend's list gets no money in a field month (upcoming-api.md 6), one
 * sentence for each field it is ticked in: "Anthropic, PBC is not trading yet, so its part of Technology goes
 * to the other companies you ticked there this month." or "… so the part for Technology goes to VWRA this
 * month." Null when it trades that month, when the month is not a field month, or when nothing goes to the
 * fields that month (split 0).
 */
export function waitingWhy(plan, dateId, companyId, fieldName = () => "this field") {
  const f = plan && plan.scale && plan.scale.fields ? plan.scale.fields[dateId] : null;
  if (!f || !Array.isArray(f.W) || !f.W.includes(companyId) || f.s === 0) return null;
  const name = (id) => (typeof fieldName === "function" && fieldName(id)) || "this field";
  const inst = (plan.instruments || []).find((i) => i.id === companyId);
  const who = inst && inst.name ? inst.name : companyId;
  const rest = (plan.orders.find((o) => o.carryTarget && o.dateId === dateId) || {}).instrument || "VWRA";
  const lines = f.F.filter((x) => (f.L[x] || []).includes(companyId)).map((x) => ((f.waitingFields || []).includes(x)
    ? `${who} is not trading yet, so the part for ${name(x)} goes to ${rest} this month.`
    : `${who} is not trading yet, so its part of ${name(x)} goes to the other companies you ticked there this month.`));
  return lines.length ? lines.join(" ") : null;
}
