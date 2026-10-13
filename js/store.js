// The friend's own records, kept in this browser (localStorage key "ttm:state:v1"). The store has four
// calls (get, subscribe, update, save) and no server: a save is a synchronous write, and another
// tab's change arrives as a "storage" event. Nothing here touches the network.

export const PLAN_ID = "monthly-2026-27";
export const STATE_KEY = "ttm:state:v1";
export const THEME_KEY = "ttm:theme";
export const MAX_IMPORT_BYTES = 512 * 1024;
/** The deepest nesting a saved state has is 5 (state › thesis › id › checks › check); a file nested
 *  deeper than this is refused rather than kept. */
export const MAX_DEPTH = 8;

const THEMES = ["auto", "dark", "light"];
const ORDER_STATUS = ["pending", "placed", "filled", "skipped"];
const TRANSFER_STATUS = ["todo", "sent", "arrived"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,24}$/; // order, transfer, instrument and checklist ids

export const DEFAULT_STATE = () => ({
  v: 1,
  planId: PLAN_ID,
  createdAt: null,
  profile: {},
  plan: null, // { monthlyUsd, input: {currency, amount, rate, rateSource, rateDate, usd}, lockedAt, joinedAt }
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

/** The plan record as saved, or null when it is missing or malformed (the friend then sees the setup again). */
function cleanPlan(p) {
  if (!isObj(p) || num(p.monthlyUsd) == null || p.monthlyUsd <= 0) return null;
  const i = isObj(p.input) ? p.input : {};
  const currency = i.currency === "THB" ? "THB" : "USD";
  return {
    monthlyUsd: p.monthlyUsd,
    input: {
      currency,
      amount: num(i.amount) ?? p.monthlyUsd,
      rate: num(i.rate),
      rateSource: str(i.rateSource, 80),
      rateDate: isDate(i.rateDate) ? i.rateDate : null,
      usd: num(i.usd) ?? p.monthlyUsd,
    },
    lockedAt: stamp(p.lockedAt),
    joinedAt: isDate(p.joinedAt) ? p.joinedAt : null, // the Bangkok date the friend started (see scale.beforeJoin)
  };
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
 * can neither carry other data along nor make the state too deep to copy.
 */
export function withDefaults(s) {
  const d = DEFAULT_STATE();
  const src = isObj(s) ? s : {};
  const out = d;
  out.createdAt = stamp(src.createdAt);
  const name = isObj(src.profile) ? str(src.profile.name, 40) : null;
  out.profile = isObj(src.profile) && src.profile.name != null ? { name: name || "" } : {};
  out.plan = cleanPlan(src.plan);
  const st = isObj(src.settings) ? src.settings : {};
  out.settings = {
    theme: THEMES.includes(st.theme) ? st.theme : "auto",
    ceilingOverrides: Object.fromEntries(Object.entries(cleanMap(st.ceilingOverrides, num)).filter(([, v]) => v > 0)),
    closes: cleanMap(st.closes, (v) => (isObj(v) && isDate(v.date) && num(v.close) != null && v.close > 0 ? { date: v.date, close: v.close } : null)),
    showThb: typeof st.showThb === "boolean" ? st.showThb : true,
    lastExportAt: stamp(st.lastExportAt),
  };
  out.orders = cleanMap(src.orders, (o) => fields(o, ORDER_FIELDS));
  out.funding = cleanMap(src.funding, (f) => fields(f, TRANSFER_FIELDS));
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

function emit() {
  for (const fn of subs) { try { fn(state); } catch (e) { console.error(e); } }
}

function readStorage() {
  try { return localStorage.getItem(STATE_KEY); } catch { return undefined; } // undefined: storage blocked
}

export const store = {
  get: () => state,
  /** fn(state) after every change; returns an unsubscribe function. */
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  /** Read the saved state (or start empty). A file saved by another version of the plan is kept aside, never overwritten. */
  load() {
    const raw = readStorage();
    store.available = raw !== undefined;
    let doc = null;
    if (raw) {
      try { doc = JSON.parse(raw); } catch { doc = null; }
      if (!isObj(doc) || (doc.planId && doc.planId !== PLAN_ID)) {
        try { localStorage.setItem(STATE_KEY + ":unread", raw); } catch { /* keep going */ }
        doc = null;
      }
    }
    state = withDefaults(doc);
    emit();
    return state;
  },
  /** Change the state with a function on a copy, then save at once. False (and saveError) when the change
   *  could not be made; the state is then left as it was. */
  update(mutator) {
    let next;
    try {
      const draft = structuredClone(state);
      mutator(draft);
      next = withDefaults(draft);
    } catch (e) {
      store.saveError = e;
      emit();
      return false;
    }
    state = next;
    store.save();
    emit();
    return !store.saveError;
  },
  /** Replace the whole state (import, start over). */
  replace(next) {
    state = withDefaults(next);
    store.save();
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
};

// Another tab of this app saved: take its copy (this tab has no pending edits; every edit saves at once).
window.addEventListener("storage", (e) => {
  if (e.key !== STATE_KEY || e.newValue == null) return;
  try {
    const doc = JSON.parse(e.newValue);
    if (isObj(doc) && doc.planId === PLAN_ID) { state = withDefaults(doc); emit(); }
  } catch { /* ignore a half-written value */ }
});

// ---------- import ----------

/**
 * Problems with an imported file, as plain sentences (an empty list means it can be imported).
 * plan: the plan scaled to the file's own amount (or null when the file's amount cannot be scaled),
 * so order and transfer ids are checked against what is bought at that amount.
 */
export function validateImport(doc, plan) {
  const errs = [];
  if (!isObj(doc)) return ["The file is not a Tide Table · Monthly export (it is not a JSON object)."];
  if (depthOf(doc, MAX_DEPTH) > MAX_DEPTH) return ["The file is nested more deeply than a Tide Table · Monthly copy ever is, so it was not loaded."];
  if (doc.planId !== PLAN_ID) return [`The file is not a Tide Table · Monthly export (its plan id is ${doc.planId == null ? "missing" : `"${String(doc.planId).slice(0, 40)}"`}).`];
  if (doc.v != null && doc.v !== 1) errs.push(`The file was written by a newer version (v${String(doc.v).slice(0, 8)}).`);
  if (!isObj(doc.plan) || num(doc.plan.monthlyUsd) == null) errs.push("The file has no monthly amount.");
  else if (!plan) errs.push("The monthly amount in the file cannot be used (it must be $25 to $10,000).");
  for (const k of ["profile", "settings", "orders", "funding", "prices", "prep", "thesis"]) if (doc[k] != null && !isObj(doc[k])) errs.push(`"${k}" must be an object.`);
  if (doc.journal != null && !Array.isArray(doc.journal)) errs.push('"journal" must be a list.');
  const obj = (v) => (isObj(v) ? v : {});
  const okDate = (v) => v == null || v === "" || isDate(v);
  const okStamp = (v) => v == null || v === "" || isStamp(v);
  const okNum = (v) => v == null || num(v) != null;
  if (plan) {
    const orderIds = new Set(plan.orders.map((o) => o.id));
    const rolled = new Set(((plan.scale && plan.scale.rolled) || []).map((r) => r.id));
    for (const [id, o] of Object.entries(obj(doc.orders))) {
      // An order not bought at the file's amount can keep a to-do or placed entry from before the amount
      // changed (dropped on import); a fill or a skip would lock the amount, so it cannot be there.
      if (rolled.has(id)) { if (isObj(o) && (o.status === "filled" || o.status === "skipped")) errs.push(`Order ${id} is not bought at this amount, yet the file has it ${o.status}.`); continue; }
      if (!orderIds.has(id)) { errs.push(`Unknown order id "${id.slice(0, 20)}".`); continue; }
      if (!isObj(o)) { errs.push(`Order ${id} is not an object.`); continue; }
      if (o.status != null && !ORDER_STATUS.includes(o.status)) errs.push(`Order ${id} has an unknown status.`);
      if (!okDate(o.filledAt)) errs.push(`Order ${id} has a bad fill date.`);
      for (const k of ["qty", "price", "fees", "costUsd"]) if (!okNum(o[k])) errs.push(`Order ${id}: ${k} must be a number.`);
      if (o.redirect != null && !["VWRA", "cash"].includes(o.redirect)) errs.push(`Order ${id} has an unknown skip choice.`);
      if (o.note != null && typeof o.note !== "string") errs.push(`Order ${id}: the note must be text.`);
    }
    const transferIds = new Set(plan.funding.transfers.map((t) => t.id));
    for (const [id, f] of Object.entries(obj(doc.funding))) {
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

/** The file's records without entries for orders its amount does not buy (see validateImport). */
export function withoutUnbought(doc, plan) {
  if (!isObj(doc) || !plan || !isObj(doc.orders)) return doc;
  const bought = new Set(plan.orders.map((o) => o.id));
  return { ...doc, orders: Object.fromEntries(Object.entries(doc.orders).filter(([id]) => bought.has(id))) };
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
