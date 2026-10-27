// The friend's own records, kept in this browser (localStorage key "ttm:state:v2"). The store has four
// calls (get, subscribe, update, save) and no server: a save is a synchronous write, and another
// tab's change arrives as a "storage" event. Nothing here touches the network.
//
// Version 2 adds a friend's own amount for any month and their own mix (plan.months, plan.mix,
// plan.mixFrom), and, in 2.0, their fields and split (plan.fields, and months[d].fields for a month pinned
// to its own fields; spec 8.5). The version 1 state ("ttm:state:v1") is read once, migrated, and then kept
// untouched as a backup; it is never written again. A tab of an older version that is still open may save
// to it, so the store keeps the version 1 text it migrated (SEEN_KEY) and tells the app when it changes.
//
// Cleaning never changes a month that has records: its fields are kept exactly (written as a pin first
// when they come from plan.fields), and a damaged copy of them sets the whole saved text aside instead
// (UNREAD_KEY), so nothing is thrown away.
//
// Tide Table 2.1 keeps the state at version 2: the locked 10% (lock.js) is one more optional key of the plan
// record, plan.lock ({ k, from, f, s } and the listing's snapshot once it trades; lock.readLock cleans it). A state
// without it (1.x, 2.0, or a new plan) loads exactly as before, and months.adoptLock adds it from the first month
// the friend has not started, through the usual plan change, so the months before it keep what they had.

import { isMonthlyUsdInRange, MIX_TENTHS_MAX } from "./scale.js?v=2.1.0";
import { explainFit, monthWord, monthOfOrder } from "./months.js?v=2.1.0";
import { readLock } from "./lock.js?v=2.1.0";
import {
  FIELD_IDS, FIELD_ID, COMPANY_ID, SPLIT_MAX, MAX_FIELD_COMPANIES, MAX_COMPANIES, fieldOrder, nameSnapshot, isAddableVenue,
} from "./split.js?v=2.1.0";

export const PLAN_ID = "monthly-2026-27";
export const STATE_VERSION = 2;
export const STATE_KEY = "ttm:state:v2";
/** The version 1 state: read to migrate it, never written. */
export const LEGACY_KEY = "ttm:state:v1";
/** {h, touched}: the hash of the version 1 text last migrated or seen (textHash), and whether this version
 *  has saved anything since. Kept apart from the state, so it never travels in an export. */
export const SEEN_KEY = "ttm:state:v2:v1seen";
/** Where an unreadable state, or one from another plan, is set aside (never overwritten by a save). */
export const UNREAD_KEY = "ttm:state:v2:unread";
export const LEGACY_UNREAD_KEY = "ttm:state:v1:unread";
export const THEME_KEY = "ttm:theme";
/** settings.still (Still pictures), mirrored here for the first paint as THEME_KEY is. */
export const STILL_KEY = "ttm:still";
export const MAX_IMPORT_BYTES = 512 * 1024;
/** The deepest nesting a saved state has is 7 (state › plan › months › m03 › fields › lists › cars); a file
 *  nested deeper than this is refused rather than kept. */
export const MAX_DEPTH = 8;
/** At most this many month entries are kept (the plan has 12 order dates). */
export const MAX_MONTH_KEYS = 24;

const THEMES = ["auto", "dark", "light"];
const ORDER_STATUS = ["pending", "placed", "filled", "skipped"];
const TRANSFER_STATUS = ["todo", "sent", "arrived"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,24}$/; // order, transfer, instrument and checklist ids
const DATE_ID = /^m\d\d$/; // an order date id, m01..m12
const REST_ID = "VWRA"; // the fund that takes the rest of each month: it has no share of its own in a mix

export const DEFAULT_STATE = () => ({
  v: STATE_VERSION,
  planId: PLAN_ID,
  createdAt: null,
  profile: {},
  // { monthlyUsd, input: {currency, amount, rate, rateSource, rateDate, usd}, lockedAt, joinedAt,
  //   months: { mNN: {usd?, input?, own?, mix?, fields?} }, mix: { instrumentId: tenths of a percent }, mixFrom,
  //   lock?: { k, from, f, s, id?, n?, l?, t?, v? }, fields?: { from, chosen, split, lists, names } }
  //   (lock is left out until months.adoptLock adds it; fields is left out when no month follows any)
  plan: null,
  // settings.still (Still pictures) is kept only when true.
  settings: { theme: "auto", ceilingOverrides: {}, closes: {}, showThb: true, lastExportAt: null },
  orders: {},
  funding: {},
  prices: {}, // prices typed from the friend's own broker app: { [instrumentId]: {price, at, src} }
  prep: {},
  thesis: {},
  journal: [],
});

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
const isDate = (v) => typeof v === "string" && ISO_DATE.test(v) && Number.isFinite(Date.parse(v));
const isStamp = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
const stamp = (v) => (isStamp(v) ? v.slice(0, 40) : null);

/** How deeply objects and arrays nest in a JSON value, counted without recursion (so a hostile file
 *  cannot overflow the stack); stops counting once past `limit`. */
export function depthOf(value, limit = Infinity) {
  let max = 0;
  const stack = [[value, 1]];
  while (stack.length) {
    const [x, d] = stack.pop();
    if (!x || typeof x !== "object") continue;
    if (d > max) { max = d; if (max > limit) return max; }
    for (const c of Array.isArray(x) ? x : Object.values(x)) if (c && typeof c === "object") stack.push([c, d + 1]);
  }
  return max;
}

/** An amount as the friend typed it ({currency, amount, rate, rateSource, rateDate, usd}), for `usd` dollars. */
function cleanInput(i, usd) {
  return {
    currency: i.currency === "THB" ? "THB" : "USD",
    amount: num(i.amount) ?? usd,
    rate: num(i.rate),
    rateSource: str(i.rateSource, 80),
    rateDate: isDate(i.rateDate) ? i.rateDate : null,
    usd: num(i.usd) ?? usd,
  };
}

/** A mix as saved: { instrumentId: tenths of a percent }, each an integer from 0 to 1000. VWRA (it takes
 *  the rest), keys that are not ids and any other value are dropped. {} is the plan's mix. */
export function cleanMix(m) {
  const out = {};
  if (!isObj(m)) return out;
  for (const [k, v] of Object.entries(m)) if (ID.test(k) && k !== REST_ID && Number.isInteger(v) && v >= 0 && v <= MIX_TENTHS_MAX) out[k] = v;
  return out;
}

/**
 * The month entries as saved: { mNN: {usd?, input?, own?, mix?} }, at most MAX_MONTH_KEYS of them. usd is a
 * number above 0, to the cent (scale.js checks its range); input (how it was typed) and own (set for that
 * month only) are kept only with a usd; mix is cleanMix, and {} is kept (it pins the plan's mix). An entry
 * with neither a usd nor a mix is dropped.
 */
export function cleanMonths(m) {
  const out = {};
  if (!isObj(m)) return out;
  let n = 0;
  for (const [k, e] of Object.entries(m)) {
    if (n >= MAX_MONTH_KEYS) break;
    if (!DATE_ID.test(k) || !isObj(e)) continue;
    const c = {};
    const usd = num(e.usd) == null ? null : Math.round(e.usd * 100) / 100;
    if (usd != null && usd > 0) {
      c.usd = usd;
      if (isObj(e.input)) c.input = cleanInput(e.input, usd);
      if (e.own === true) c.own = true;
    }
    if (isObj(e.mix)) c.mix = cleanMix(e.mix);
    if (c.usd == null && !c.mix) continue;
    out[k] = c;
    n++;
  }
  return out;
}

// ---------- the friend's fields (spec 8.5) ----------

/**
 * Why a state cannot be cleaned: a month with records has fields that are damaged (wrong types, an id that
 * is not a company id, a company with no saved name, or both a mix and fields). Only a damaged copy can do
 * this. store.load then sets the whole saved text aside (UNREAD_KEY) and starts empty, as for any text it
 * cannot read; store.update and store.replace refuse the change.
 */
export class DamagedStateError extends Error {
  constructor(dateId = null) {
    super("Your saved records could not be read, so nothing was changed.");
    this.name = "DamagedStateError";
    this.dateId = dateId;
  }
}

/** A change that lists a company with no saved name (plan.fields.names): store.update refuses it. */
export class NamesMissingError extends Error {
  constructor(ids = []) {
    super("A company on your list has no name saved, so nothing was changed.");
    this.name = "NamesMissingError";
    this.ids = ids;
  }
}

const hasName = (names, id) => isObj(names) && isObj(names[id]) && typeof names[id].n === "string" && names[id].n !== "";

/**
 * The months whose money the records fix, worked out from the ids alone (the store has no base plan): an
 * order "mNN-…" that is filled or skipped (own mode and field months), and a transfer that is sent or has
 * arrived: W01..W12 (each month's Interactive Brokers money, for m01..m12), S-mNN, and S01 (November's
 * SwissBorg money, m01). Base orders (p01..p28) are not counted: they are never bought in a field month,
 * so they never hold a field month's records. A Set of month ids.
 */
export function monthsWithRecords(s) {
  const out = new Set();
  const src = isObj(s) ? s : {};
  for (const [id, o] of Object.entries(isObj(src.orders) ? src.orders : {})) {
    if (!isObj(o) || (o.status !== "filled" && o.status !== "skipped")) continue;
    const m = /^(m\d\d)-/.exec(id);
    if (m) out.add(m[1]);
  }
  for (const [id, t] of Object.entries(isObj(src.funding) ? src.funding : {})) {
    if (!isObj(t) || (t.status !== "sent" && t.status !== "arrived")) continue;
    let m;
    if ((m = /^W(\d\d)$/.exec(id))) out.add(`m${m[1]}`);
    else if ((m = /^S-(m\d\d)$/.exec(id))) out.add(m[1]);
    else if (id === "S01") out.add("m01");
  }
  return out;
}

/** The company ids a field spec's chosen fields list (any spec, any shape). */
function specIds(f) {
  const out = [];
  if (!isObj(f) || !Array.isArray(f.chosen) || !isObj(f.lists)) return out;
  for (const x of f.chosen) if (Array.isArray(f.lists[x])) for (const id of f.lists[x]) out.push(id);
  return out;
}

/** The company ids a plan record lists (plan.fields and every month's fields) that have no saved name, in
 *  id order. A state that has one cannot recompose that month's orders, so store.update refuses it. */
export function missingNames(plan) {
  if (!isObj(plan)) return [];
  const names = isObj(plan.fields) && isObj(plan.fields.names) ? plan.fields.names : {};
  const ids = new Set(specIds(plan.fields));
  for (const e of Object.values(isObj(plan.months) ? plan.months : {})) if (isObj(e)) for (const id of specIds(e.fields)) ids.add(id);
  return [...ids].filter((id) => !hasName(names, id)).sort();
}

/** A month with records keeps its fields exactly: { chosen, split, lists } (the chosen fields' lists, as
 *  saved), or null when they are damaged. Field and company ids need only their shape: one the catalogue or
 *  the data no longer knows is kept. */
function exactSpec(f) {
  if (!isObj(f) || !Array.isArray(f.chosen) || !f.chosen.length || !isObj(f.lists)) return null;
  if (f.chosen.some((x) => typeof x !== "string" || !FIELD_ID.test(x)) || new Set(f.chosen).size !== f.chosen.length) return null;
  if (!Number.isInteger(f.split) || f.split < 0 || f.split > SPLIT_MAX) return null;
  const lists = {};
  for (const x of f.chosen) {
    const L = f.lists[x];
    if (!Array.isArray(L) || !L.length || L.some((id) => typeof id !== "string" || !COMPANY_ID.test(id)) || new Set(L).size !== L.length) return null;
    lists[x] = [...L];
  }
  return { chosen: [...f.chosen], split: f.split, lists };
}

/** Fields of an open month (or plan.fields), cleaned: unknown field ids, duplicates, lists of fields not
 *  chosen, ids that are not company ids and companies with no saved name are dropped, each list keeps at most
 *  20 and all lists 60; a field left with no company is taken out. Chosen fields in catalogue order, lists
 *  in id order. Null when no field is left or the split is not 0 to 1000. */
function cleanSpec(f, names) {
  if (!isObj(f) || !Array.isArray(f.chosen) || !Number.isInteger(f.split) || f.split < 0 || f.split > SPLIT_MAX) return null;
  const lists = isObj(f.lists) ? f.lists : {};
  const chosen = [], out = {};
  let room = MAX_COMPANIES;
  for (const x of fieldOrder(f.chosen.filter((id) => typeof id === "string" && FIELD_IDS.includes(id)))) {
    const L = Array.isArray(lists[x]) ? lists[x] : [];
    const ids = [...new Set(L.filter((id) => typeof id === "string" && COMPANY_ID.test(id) && hasName(names, id)))].sort()
      .slice(0, Math.min(MAX_FIELD_COMPANIES, room));
    if (!ids.length) continue;
    chosen.push(x);
    out[x] = ids;
    room -= ids.length;
  }
  return chosen.length ? { chosen, split: f.split, lists: out } : null;
}

/**
 * plan.fields as saved (spec 8.5), with the month pins written into `months` (the cleaned month entries):
 * 1. A month with records keeps its fields exactly. A pin of its own stays; a month that follows plan.fields
 *    (from plan.fields.from on, with no mix pin) is pinned with plan.fields' spec before anything is cleaned.
 *    Damaged fields there, or a company with no saved name, throw a DamagedStateError.
 * 2. Only then are plan.fields and the pins of months without records cleaned (cleanSpec). A month without
 *    records that has both a mix and fields keeps its fields.
 * Returns { from, chosen, split, lists, names } while plan.fields has a field left; { from: null, chosen: [],
 * split: null, lists: {}, names } while only pinned months have fields (it keeps their names); else null.
 * names keeps exactly the companies the pins and plan.fields list, with the snapshot caps.
 */
function cleanFieldsInto(p, months, records) {
  const rawF = isObj(p.fields) ? p.fields : null;
  const rawMonths = isObj(p.months) ? p.months : {};
  const rawNames = rawF && isObj(rawF.names) ? rawF.names : {};
  const from = rawF && typeof rawF.from === "string" && DATE_ID.test(rawF.from) ? rawF.from : null;
  const pins = new Map(); // month -> its fields, kept or cleaned
  const kept = new Set();
  for (const k of [...records].filter((x) => DATE_ID.test(x)).sort()) {
    const e = isObj(rawMonths[k]) ? rawMonths[k] : null;
    let raw;
    if (e && e.fields != null) {
      if (e.mix != null) throw new DamagedStateError(k);
      raw = e.fields;
    } else if (from && k >= from && !(e && e.mix != null)) raw = rawF;
    else continue;
    const spec = exactSpec(raw);
    if (!spec || specIds(spec).some((id) => !hasName(rawNames, id))) throw new DamagedStateError(k);
    pins.set(k, spec);
    kept.add(k);
  }
  for (const [k, e] of Object.entries(rawMonths)) {
    if (kept.has(k) || !DATE_ID.test(k) || !isObj(e) || e.fields == null) continue;
    const spec = cleanSpec(e.fields, rawNames);
    if (spec) pins.set(k, spec);
  }
  for (const k of [...pins.keys()].sort()) {
    // At most MAX_MONTH_KEYS month entries are kept, as cleanMonths does; a month with records always is.
    if (!months[k] && !kept.has(k) && Object.keys(months).length >= MAX_MONTH_KEYS) { pins.delete(k); continue; }
    const m = months[k] || (months[k] = {});
    if (!kept.has(k)) delete m.mix;
    m.fields = pins.get(k);
  }
  const standing = from ? cleanSpec(rawF, rawNames) : null;
  const need = new Set([...pins.values()].flatMap(specIds));
  if (standing) for (const id of specIds(standing)) need.add(id);
  const names = {};
  for (const id of [...need].sort()) names[id] = nameSnapshot(rawNames[id]);
  if (standing) return { from, chosen: standing.chosen, split: standing.split, lists: standing.lists, names };
  if (pins.size) return { from: null, chosen: [], split: null, lists: {}, names };
  return null;
}

/** The plan record as saved, or null when it is missing or malformed (the friend then sees the setup again).
 *  A version 1 record gains months {}, mix {} and mixFrom null: the same plan. plan.fields is kept only while
 *  a month follows fields (cleanFieldsInto). `records`: the months with records (monthsWithRecords), whose
 *  fields are never cleaned; without it, every month's fields are cleaned. Throws a DamagedStateError when a
 *  month with records has damaged fields. */
export function cleanPlan(p, records = null) {
  if (!isObj(p) || num(p.monthlyUsd) == null || p.monthlyUsd <= 0) return null;
  const mix = cleanMix(p.mix);
  const out = {
    monthlyUsd: p.monthlyUsd,
    input: cleanInput(isObj(p.input) ? p.input : {}, p.monthlyUsd),
    lockedAt: stamp(p.lockedAt),
    joinedAt: isDate(p.joinedAt) ? p.joinedAt : null, // the Bangkok date the friend started (see scale.beforeJoin)
    months: cleanMonths(p.months),
    mix,
    // The "Starting with" month of the standing mix (display only: earlier months keep their mix as pins).
    mixFrom: Object.keys(mix).length && typeof p.mixFrom === "string" && DATE_ID.test(p.mixFrom) ? p.mixFrom : null,
  };
  // The locked 10% (lock.js): kept only as a readable record; a missing or unreadable one is left out.
  const lock = readLock(p.lock);
  if (lock) out.lock = lock;
  const fields = cleanFieldsInto(p, out.months, records instanceof Set ? records : new Set(Array.isArray(records) ? records : []));
  if (fields) out.fields = fields;
  return out;
}

/** A map of records keyed by id, each rebuilt by `fn` (null drops it); keys that are not ids are dropped. */
function cleanMap(m, fn) {
  const out = {};
  if (!isObj(m)) return out;
  for (const [k, v] of Object.entries(m)) {
    if (!ID.test(k)) continue;
    const c = fn(v);
    if (c != null) out[k] = c;
  }
  return out;
}
/** Only the fields a record of this kind has, each with its type; a field the record lacks stays absent. */
function fields(src, spec) {
  if (!isObj(src)) return null;
  const out = {};
  for (const [k, fix] of Object.entries(spec)) if (k in src) out[k] = fix(src[k]);
  return out;
}
const ORDER_FIELDS = {
  status: (v) => (ORDER_STATUS.includes(v) ? v : "pending"),
  qty: num, price: num, fees: num, costUsd: num,
  filledAt: (v) => (isDate(v) ? v : null),
  note: (v) => str(v, 200) ?? "",
  redirect: (v) => (v === "VWRA" || v === "cash" ? v : null),
};
const TRANSFER_FIELDS = {
  status: (v) => (TRANSFER_STATUS.includes(v) ? v : "todo"),
  sentUsd: num, sentThb: num,
  sentAt: (v) => (isDate(v) ? v : null),
  arrivedAt: (v) => (isDate(v) ? v : null),
};
const PRICE_FIELDS = { price: num, at: stamp, src: (v) => (v === "fill" ? "fill" : "entry") };
function cleanThesis(t) {
  if (!isObj(t)) return null;
  const out = {};
  if ("sellIf" in t) out.sellIf = str(t.sellIf, 300) ?? "";
  out.checks = (Array.isArray(t.checks) ? t.checks : []).filter(isObj).slice(0, 200)
    .map((c) => ({ date: isDate(c.date) ? c.date : null, pass: c.pass === true, note: str(c.note, 200) ?? "" }));
  return out;
}

/**
 * The state rebuilt from the fields the app knows, each with its type restored. Anything else (an unknown
 * key at any level, a value nested where a number belongs) is dropped, so a hand edit or an imported file
 * can neither carry other data along nor make the state too deep to copy. This is also the migration: a
 * version 1 state comes out as version 2 (v 2; plan.months {}, plan.mix {}, plan.mixFrom null, no
 * plan.fields) with every record as it was. A month with records keeps its fields exactly (cleanPlan);
 * when they are damaged it throws a DamagedStateError and nothing is cleaned.
 */
export function withDefaults(s) {
  const d = DEFAULT_STATE();
  const src = isObj(s) ? s : {};
  const out = d;
  out.createdAt = stamp(src.createdAt);
  const name = isObj(src.profile) ? str(src.profile.name, 40) : null;
  out.profile = isObj(src.profile) && src.profile.name != null ? { name: name || "" } : {};
  out.orders = cleanMap(src.orders, (o) => fields(o, ORDER_FIELDS));
  out.funding = cleanMap(src.funding, (f) => fields(f, TRANSFER_FIELDS));
  out.plan = cleanPlan(src.plan, monthsWithRecords(out));
  const st = isObj(src.settings) ? src.settings : {};
  out.settings = {
    theme: THEMES.includes(st.theme) ? st.theme : "auto",
    ceilingOverrides: Object.fromEntries(Object.entries(cleanMap(st.ceilingOverrides, num)).filter(([, v]) => v > 0)),
    closes: cleanMap(st.closes, (v) => (isObj(v) && isDate(v.date) && num(v.close) != null && v.close > 0 ? { date: v.date, close: v.close } : null)),
    showThb: typeof st.showThb === "boolean" ? st.showThb : true,
    lastExportAt: stamp(st.lastExportAt),
  };
  if (st.still === true) out.settings.still = true; // Still pictures (spec 8.5); off when left out
  out.prices = cleanMap(src.prices, (p) => fields(p, PRICE_FIELDS));
  out.prep = cleanMap(src.prep, (v) => (typeof v === "boolean" ? v : null));
  out.thesis = cleanMap(src.thesis, cleanThesis);
  out.journal = (Array.isArray(src.journal) ? src.journal : []).filter((j) => isObj(j) && typeof j.text === "string").slice(0, 2000)
    .map((j) => ({ at: stamp(j.at), text: j.text.slice(0, 2000) }));
  return out;
}

// ---------- the store ----------

const subs = new Set();
let state = DEFAULT_STATE();
/** SEEN_KEY as last read or written: {h, touched}, or null. */
let seen = null;

function emit() {
  for (const fn of subs) { try { fn(state); } catch (e) { console.error(e); } }
}

/** localStorage, never throwing: undefined when storage is blocked. */
function read(key) {
  try { return localStorage.getItem(key); } catch { return undefined; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function remove(key) {
  try { localStorage.removeItem(key); } catch { /* blocked: nothing to remove */ }
}

/** The state document in a saved text, or null when it is unreadable or belongs to another plan. */
function readable(raw) {
  let doc = null;
  try { doc = JSON.parse(raw); } catch { return null; }
  return isObj(doc) && (!doc.planId || doc.planId === PLAN_ID) ? doc : null;
}

/** withDefaults(doc), or null when a month with records has damaged fields (DamagedStateError). */
function cleaned(doc) {
  try { return withDefaults(doc); } catch (e) { if (e instanceof DamagedStateError) return null; throw e; }
}

/** "<length>:<FNV-1a 32-bit hash>" of a text, over its UTF-16 code units, in 8 lower-case hex digits. */
export function textHash(s) {
  const text = String(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${text.length}:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function readSeen() {
  const raw = read(SEEN_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return isObj(v) && (typeof v.h === "string" || v.h === null) ? { h: v.h, touched: v.touched === true } : null;
  } catch { return null; }
}
function writeSeen(v) {
  seen = v;
  write(SEEN_KEY, JSON.stringify(v));
}

/** Version 1 text -> the state, saved as version 2 at once; SEEN_KEY remembers it, untouched. False when
 *  the text cannot be read (it is set aside, and nothing else changes). */
function migrate(raw1) {
  const doc = readable(raw1);
  const next = doc ? cleaned(doc) : null;
  if (!next) { write(LEGACY_UNREAD_KEY, raw1); return false; }
  state = next;
  store.save();
  writeSeen({ h: textHash(raw1), touched: false });
  return true;
}

/**
 * The version 1 text has changed since it was migrated (an older copy of the app, open in another tab,
 * saved to it), or it is checked for the first time beside a version 2 state:
 * - no SEEN_KEY: remember this text as seen (touched), and say nothing;
 * - the same text as before: nothing to do;
 * - a new text while nothing was saved here since the update: migrate it again (nothing is lost);
 * - a new text after this version saved something: keep it in store.olderCopy for the app to offer.
 * A new text that cannot be read, or that belongs to another plan, is set aside as at load and never
 * offered (it could not be used).
 */
function checkLegacy(raw1) {
  const h = textHash(raw1);
  const s = readSeen();
  if (!s) { writeSeen({ h, touched: true }); return false; }
  seen = s;
  if (s.h === h) return false;
  if (!s.touched) {
    if (!migrate(raw1)) writeSeen({ h, touched: false });
    return true;
  }
  if (!readable(raw1)) {
    write(LEGACY_UNREAD_KEY, raw1);
    writeSeen({ h, touched: true });
    return false;
  }
  store.olderCopy = raw1;
  return true;
}

/** After this version's first successful save: SEEN_KEY says so (written only when the flag flips). */
function markTouched() {
  if (seen && seen.touched) return;
  const s = readSeen();
  if (s && s.touched) { seen = s; return; }
  const raw1 = read(LEGACY_KEY);
  writeSeen({ h: s ? s.h : raw1 ? textHash(raw1) : null, touched: true });
}

export const store = {
  get: () => state,
  /** fn(state) after every change; returns an unsubscribe function. */
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  /**
   * Read the saved state (or start empty). The version 2 state when there is one; otherwise the version 1
   * state, migrated and saved as version 2 (version 1 itself is never written). A state that cannot be read,
   * or that belongs to another plan, is set aside and never overwritten; an unreadable version 2 state does
   * not fall back to version 1, which would quietly bring back older records.
   */
  load() {
    const raw2 = read(STATE_KEY);
    store.available = raw2 !== undefined;
    store.olderCopy = null;
    store.unread = false;
    seen = null;
    state = withDefaults(null);
    if (raw2) {
      const doc = readable(raw2);
      const next = doc ? cleaned(doc) : null;
      if (next) {
        state = next;
        const raw1 = read(LEGACY_KEY);
        if (raw1) checkLegacy(raw1);
      } else {
        // Unreadable, another plan's, or a month with records whose fields are damaged: set aside whole.
        write(UNREAD_KEY, raw2);
        store.unread = true;
      }
    } else if (raw2 !== undefined) {
      const raw1 = read(LEGACY_KEY);
      if (raw1) migrate(raw1);
    }
    emit();
    return state;
  },
  /** Change the state with a function on a copy, then save at once. False (and saveError) when the change
   *  could not be made; the state is then left as it was. A change that lists a company with no saved name
   *  is refused (NamesMissingError), and so is one that damages a month with records (DamagedStateError).
   *  opts.auto: a change the app makes on its own, not the friend (the locked 10% added on load, its first
   *  trading day saved): it is saved the same way, but it does not count as this version having saved
   *  something, so an older tab's later version 1 save is still migrated again without asking (checkLegacy). */
  update(mutator, { auto = false } = {}) {
    let next;
    try {
      const draft = structuredClone(state);
      mutator(draft);
      const missing = missingNames(draft.plan);
      if (missing.length) throw new NamesMissingError(missing);
      next = withDefaults(draft);
    } catch (e) {
      store.saveError = e;
      emit();
      return false;
    }
    state = next;
    if (store.save() && !auto) markTouched();
    emit();
    return !store.saveError;
  },
  /** Replace the whole state (import, the older tab's records, start over). False (and saveError, the state
   *  left as it was) when a month with records in it has damaged fields. */
  replace(next) {
    let s;
    try {
      s = withDefaults(next);
    } catch (e) {
      store.saveError = e;
      emit();
      return false;
    }
    state = s;
    if (store.save()) markTouched();
    emit();
    return !store.saveError;
  },
  /** Start over: remove the saved state of both versions, SEEN_KEY and both set-aside copies, then save
   *  `next` (a fresh state) as version 2. */
  startOver(next = DEFAULT_STATE()) {
    for (const k of [STATE_KEY, LEGACY_KEY, SEEN_KEY, UNREAD_KEY, LEGACY_UNREAD_KEY]) remove(k);
    seen = null;
    store.olderCopy = null;
    store.replace(next);
  },
  /** The friend chose between this tab's records and the older tab's (store.olderCopy): remember that
   *  copy as seen, so it is not offered again. "Use the older tab's records" replaces the state first. */
  dismissOlder() {
    const raw = store.olderCopy;
    store.olderCopy = null;
    writeSeen({ h: raw != null ? textHash(raw) : seen ? seen.h : null, touched: true });
    emit();
  },
  /** Write the state to localStorage; false (and saveError) when the browser refuses. */
  save() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
      store.saveError = null;
      store.lastSaved = Date.now();
      store.available = true;
      return true;
    } catch (e) {
      store.saveError = e;
      return false;
    }
  },
  get unsaved() { return store.saveError ? 1 : 0; },
  lastSaved: null,
  saveError: null,
  available: true,
  /** True when load found a saved state it could not use and set it aside (UNREAD_KEY): the app offers
   *  "Load a copy you saved". */
  unread: false,
  /** The version 1 text an older tab saved after this version saved something (see checkLegacy), or null. */
  olderCopy: null,
};

// Another tab of this app saved: take its copy (this tab has no pending edits; every edit saves at once).
// An older copy of the app saves to version 1: migrate it while there is no version 2 state yet, else check it.
window.addEventListener("storage", (e) => {
  if (e.newValue == null) return;
  if (e.key === STATE_KEY) {
    try {
      const doc = JSON.parse(e.newValue);
      if (isObj(doc) && doc.planId === PLAN_ID) { state = withDefaults(doc); emit(); }
    } catch { /* ignore a half-written value */ }
  } else if (e.key === LEGACY_KEY) {
    const raw2 = read(STATE_KEY);
    if (raw2 === undefined) return;
    if (raw2 ? checkLegacy(e.newValue) : migrate(e.newValue)) emit();
  }
});

// ---------- import ----------

/** The problems with a file's plan record (month amounts, the mix): plain sentences, and whether any of
 *  them stops the plan being built. ref: the base or any scaled plan (for month names and holdings), or null. */
function planRecordProblems(p, ref) {
  const errs = [];
  let bad = false;
  const dates = ref && Array.isArray(ref.orderDates) ? ref.orderDates : null;
  const isMonth = (k) => typeof k === "string" && (dates ? dates.some((d) => d.id === k) : DATE_ID.test(k));
  const monthName = (k) => monthWord(ref, k);
  const rest = ref && Array.isArray(ref.orders) ? (ref.orders.find((o) => o.carryTarget) || {}).instrument || REST_ID : REST_ID;
  const holdings = ref && Array.isArray(ref.instruments) ? new Set(ref.instruments.map((i) => i.id).filter((id) => id !== rest)) : null;
  const checkMix = (m) => {
    if (!isObj(m)) { errs.push("The file's mix cannot be read."); bad = true; return; }
    for (const [id, q] of Object.entries(m)) {
      if (id === rest || id === REST_ID || (holdings ? !holdings.has(id) : !ID.test(id))) {
        errs.push("The file's mix can only name the plan's funds, stocks and coins, not VWRA."); bad = true;
      } else if (!Number.isInteger(q) || q < 0 || q > MIX_TENTHS_MAX) {
        errs.push("Each share in the file's mix must be from 0% to 100%, with at most one decimal."); bad = true;
      }
    }
  };
  if (!isMonthlyUsdInRange(p.monthlyUsd)) { errs.push("The monthly amount in the file cannot be used (it must be $25 to $10,000)."); bad = true; }
  if (p.months != null && !isObj(p.months)) { errs.push("Month amounts in the file must be for the plan's months."); bad = true; }
  const fieldErr = (s) => { errs.push(s); bad = true; };
  const names = isObj(p.fields) && isObj(p.fields.names) ? p.fields.names : null;
  for (const [k, e] of Object.entries(isObj(p.months) ? p.months : {})) {
    if (!isMonth(k)) { errs.push("Month amounts in the file must be for the plan's months."); bad = true; continue; }
    if (!isObj(e)) { errs.push(`The entry for ${monthName(k)} in the file cannot be read.`); bad = true; continue; }
    if (e.usd != null && !isMonthlyUsdInRange(e.usd)) { errs.push(`The amount for ${monthName(k)} in the file must be from $25 to $10,000.`); bad = true; }
    if (e.mix != null) checkMix(e.mix);
    if (e.fields != null) {
      if (e.mix != null) fieldErr("A month in the file cannot have both a mix and fields.");
      checkFields(e.fields, names, fieldErr);
    }
  }
  if (p.mix != null) checkMix(p.mix);
  if (p.mixFrom != null && !isMonth(p.mixFrom)) errs.push("The month the file's mix starts from must be one of the plan's months.");
  // The locked 10% (lock.js): a file that has a lock record must have a readable one, or its months with records
  // could change once it is added again.
  if (p.lock != null && !readLock(p.lock)) { errs.push("The file's record of the locked 10% cannot be read."); bad = true; }
  if (p.fields != null) {
    const f = p.fields;
    if (!isObj(f)) fieldErr("The file's fields cannot be read.");
    else {
      const none = (!Array.isArray(f.chosen) || !f.chosen.length) && (f.lists == null || (isObj(f.lists) && !Object.keys(f.lists).length));
      if (f.from == null ? !none : !isMonth(f.from)) fieldErr("The month the file's fields start from must be one of the plan's months.");
      if (f.from != null) checkFields(f, names, fieldErr);
      if (f.names != null && (!isObj(f.names) || Object.entries(f.names).some(([id, n]) => !COMPANY_ID.test(id) || !isObj(n) || typeof n.n !== "string" || !n.n
        || (n.t != null && typeof n.t !== "string") || (n.v != null && typeof n.v !== "string")))) fieldErr("The file names a company id Tide Table cannot read.");
    }
  }
  return { errs, bad };
}

/** The problems with one field spec of a file (plan.fields, or a month's fields), as plain sentences. */
function checkFields(f, names, err) {
  if (!isObj(f)) { err("The file's fields cannot be read."); return; }
  const chosen = Array.isArray(f.chosen) ? f.chosen : null;
  if (!chosen || !chosen.length || chosen.some((x) => typeof x !== "string" || !FIELD_IDS.includes(x)) || new Set(chosen).size !== chosen.length) {
    err("The file's fields must be among Tide Table's 14 fields.");
  }
  if (f.lists != null && !isObj(f.lists)) { err("Each field in the file needs 1 to 20 companies."); return; }
  const lists = isObj(f.lists) ? f.lists : {};
  if (Object.keys(lists).some((x) => !FIELD_IDS.includes(x))) err("The file's fields must be among Tide Table's 14 fields.");
  let total = 0;
  for (const x of chosen || []) {
    const L = lists[x];
    if (!Array.isArray(L) || !L.length || L.length > MAX_FIELD_COMPANIES || new Set(L).size !== L.length) { err("Each field in the file needs 1 to 20 companies."); continue; }
    total += L.length;
    for (const id of L) {
      if (typeof id !== "string" || !COMPANY_ID.test(id) || !hasName(names, id)) err("The file names a company id Tide Table cannot read.");
      else if (!isAddableVenue(names[id].v)) err("The file lists a company Tide Table cannot place orders for.");
    }
  }
  if (total > MAX_COMPANIES) err(`The file lists more than ${MAX_COMPANIES} companies.`);
  if (!Number.isInteger(f.split) || f.split < 0 || f.split > SPLIT_MAX) err("The file's split must be from 0% to 100%.");
}

/**
 * Problems with an imported file, as plain sentences (an empty list means it can be imported). The file
 * may be version 1 (it is migrated by withDefaults when it is loaded) or version 2.
 * plan: the plan the file's own amounts and mix give (months.planOrNull of cleanPlan(doc.plan)), or null
 * when they cannot be worked out; order and transfer ids are checked against it.
 * opts.base: the base plan (for month names and holdings when plan is null); opts.error: why plan is null
 * (planOrNull's error), worded with months.explainFit.
 */
export function validateImport(doc, plan, { base = null, error = null } = {}) {
  const errs = [];
  if (!isObj(doc)) return ["The file is not a Tide Table · Monthly export (it is not a JSON object)."];
  if (depthOf(doc, MAX_DEPTH) > MAX_DEPTH) return ["The file is nested more deeply than a Tide Table · Monthly copy ever is, so it was not loaded."];
  if (doc.planId !== PLAN_ID) return [`The file is not a Tide Table · Monthly export (its plan id is ${doc.planId == null ? "missing" : `"${String(doc.planId).slice(0, 40)}"`}).`];
  if (doc.v != null && doc.v !== 1 && doc.v !== STATE_VERSION) errs.push(`The file was written by a newer version (v${String(doc.v).slice(0, 8)}).`);
  if (!isObj(doc.plan) || num(doc.plan.monthlyUsd) == null) errs.push("The file has no monthly amount.");
  else {
    const ref = base || plan;
    const r = planRecordProblems(doc.plan, ref);
    errs.push(...r.errs);
    if (!plan && !r.bad) errs.push(error ? `The amounts or the mix in the file cannot be used: ${explainFit(error, ref)}` : "The amounts or the mix in the file cannot be used.");
  }
  for (const k of ["profile", "settings", "orders", "funding", "prices", "prep", "thesis"]) if (doc[k] != null && !isObj(doc[k])) errs.push(`"${k}" must be an object.`);
  if (doc.journal != null && !Array.isArray(doc.journal)) errs.push('"journal" must be a list.');
  const obj = (v) => (isObj(v) ? v : {});
  const okDate = (v) => v == null || v === "" || isDate(v);
  const okStamp = (v) => v == null || v === "" || isStamp(v);
  const okNum = (v) => v == null || num(v) != null;
  if (plan) {
    const sc = plan.scale || {};
    const orderIds = new Set(plan.orders.map((o) => o.id));
    const rolled = new Set((sc.rolled || []).map((r) => r.id));
    const replaced = new Set(sc.replaced || []);
    const fieldMonths = new Set(sc.fieldMonths || []);
    const why = (id) => (base && fieldMonths.has(monthOfOrder(base, id)) ? "the file's fields" : "the file's mix");
    for (const [id, o] of Object.entries(obj(doc.orders))) {
      // An order not bought at the file's amounts (or in a month on the file's own mix or fields) can keep a
      // to-do or placed entry from before a change (dropped on import); a fill or a skip fixes its month, so
      // it cannot be there.
      if (!orderIds.has(id) && (rolled.has(id) || replaced.has(id))) {
        if (isObj(o) && (o.status === "filled" || o.status === "skipped")) {
          errs.push(rolled.has(id) ? `Order ${id} is not bought at this amount, yet the file has it ${o.status}.` : `Order ${id} is not bought with ${why(id)}, yet the file has it ${o.status}.`);
        }
        continue;
      }
      if (!orderIds.has(id)) { errs.push(`Unknown order id "${id.slice(0, 20)}".`); continue; }
      if (!isObj(o)) { errs.push(`Order ${id} is not an object.`); continue; }
      if (o.status != null && !ORDER_STATUS.includes(o.status)) errs.push(`Order ${id} has an unknown status.`);
      if (!okDate(o.filledAt)) errs.push(`Order ${id} has a bad fill date.`);
      for (const k of ["qty", "price", "fees", "costUsd"]) if (!okNum(o[k])) errs.push(`Order ${id}: ${k} must be a number.`);
      if (o.redirect != null && !["VWRA", "cash"].includes(o.redirect)) errs.push(`Order ${id} has an unknown skip choice.`);
      if (o.note != null && typeof o.note !== "string") errs.push(`Order ${id}: the note must be text.`);
    }
    const transferIds = new Set(plan.funding.transfers.map((t) => t.id));
    const dropped = new Set(sc.droppedTransfers || []);
    for (const [id, f] of Object.entries(obj(doc.funding))) {
      // A transfer the file's plan does not need (nothing to pay) can keep only a to-do entry.
      if (!transferIds.has(id) && dropped.has(id)) {
        if (isObj(f) && (f.status === "sent" || f.status === "arrived")) {
          const t = base && base.funding && Array.isArray(base.funding.transfers) ? base.funding.transfers.find((x) => x.id === id) : null;
          const why = t && t.to === "SwissBorg" && !plan.orders.some((o) => o.account === t.to) ? " (no coins are bought)" : "";
          errs.push(`Transfer ${id} is not in this plan${why}, yet the file has it ${f.status}.`);
        }
        continue;
      }
      if (!transferIds.has(id)) { errs.push(`Unknown transfer id "${id.slice(0, 20)}".`); continue; }
      if (!isObj(f)) { errs.push(`Transfer ${id} is not an object.`); continue; }
      if (f.status != null && !TRANSFER_STATUS.includes(f.status)) errs.push(`Transfer ${id} has an unknown status.`);
      for (const k of ["sentAt", "arrivedAt"]) if (!okDate(f[k])) errs.push(`Transfer ${id} has a bad ${k} date.`);
      for (const k of ["sentUsd", "sentThb"]) if (!okNum(f[k])) errs.push(`Transfer ${id}: ${k} must be a number.`);
    }
    const instIds = new Set(plan.instruments.map((i) => i.id));
    for (const [id, p] of Object.entries(obj(doc.prices))) {
      if (!instIds.has(id)) errs.push(`Unknown instrument "${id.slice(0, 20)}" in prices.`);
      else if (!isObj(p) || num(p.price) == null || !okStamp(p.at)) errs.push(`The price for ${id} must be a number with a time.`);
    }
    for (const [id, t] of Object.entries(obj(doc.thesis))) {
      if (!instIds.has(id)) { errs.push(`Unknown instrument "${id.slice(0, 20)}" in thesis notes.`); continue; }
      for (const c of (isObj(t) && Array.isArray(t.checks) ? t.checks : [])) if (!isObj(c) || !isDate(c.date)) errs.push(`A ${id} thesis check has a bad date.`);
    }
    const prepIds = new Set((plan.prep || []).map((p) => p.id));
    for (const [id, v] of Object.entries(obj(doc.prep))) if (!prepIds.has(id) || typeof v !== "boolean") errs.push(`Unknown checklist item "${id.slice(0, 20)}".`);
  }
  if (isObj(doc.plan) && !okDate(doc.plan.joinedAt)) errs.push("The date you started must be a date.");
  const s = obj(doc.settings);
  if (s.theme != null && !THEMES.includes(s.theme)) errs.push("The theme must be auto, dark or light.");
  if (!okStamp(s.lastExportAt)) errs.push("The date of the last copy must be a date.");
  for (const [id, v] of Object.entries(obj(s.ceilingOverrides))) if (num(v) == null) errs.push(`Ceiling ${id.slice(0, 20)} must be a number.`);
  for (const [id, v] of Object.entries(obj(s.closes))) if (!isObj(v) || !isDate(v.date) || num(v.close) == null) errs.push(`The close for ${id.slice(0, 20)} must be a date and a number.`);
  for (const j of Array.isArray(doc.journal) ? doc.journal : []) if (!isObj(j) || !isStamp(j.at) || typeof j.text !== "string") errs.push("A journal entry has a bad date or text.");
  return [...new Set(errs)].slice(0, 8);
}

/** The file's records without entries for orders its plan does not buy, and without the to-do entries of
 *  transfers its plan does not need (see validateImport). */
export function withoutUnbought(doc, plan) {
  if (!isObj(doc) || !plan) return doc;
  let out = doc;
  if (isObj(doc.orders)) {
    const bought = new Set(plan.orders.map((o) => o.id));
    out = { ...out, orders: Object.fromEntries(Object.entries(doc.orders).filter(([id]) => bought.has(id))) };
  }
  const dropped = new Set((plan.scale && plan.scale.droppedTransfers) || []);
  if (dropped.size && isObj(doc.funding)) {
    const logged = (f) => isObj(f) && (f.status === "sent" || f.status === "arrived");
    out = { ...out, funding: Object.fromEntries(Object.entries(doc.funding).filter(([id, f]) => !dropped.has(id) || logged(f))) };
  }
  return out;
}

/**
 * True when the plan has records that depend on its amount: a fill, a skip or a transfer. `ignore`
 * ({orderIds, transferIds}, scale.beforeJoin) leaves out entries from before the friend joined.
 */
export function hasLogged(s, ignore = null) {
  const skip = (set, id) => !!(set && set.has(id));
  return Object.entries(s.orders || {}).some(([id, o]) => o && (o.status === "filled" || o.status === "skipped") && !skip(ignore && ignore.orderIds, id))
    || Object.entries(s.funding || {}).some(([id, f]) => f && (f.status === "sent" || f.status === "arrived") && !skip(ignore && ignore.transferIds, id));
}
