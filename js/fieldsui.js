// The Fields page, a field's page and a company's page, shared by both apps (spec 7, 8.2, 9.9; brief 4.8). Built
// only from the storybook atoms of book.js and the layout classes of book.css; fed by datafiles.js.
//
// The host page passes in every label, action and note that differs between the apps, through
// configure({actions, labels, notes}). This module holds only the copy both apps share (spec Appendix C, "both"),
// and words that come from the data itself.
//
// Upcoming listings (the 27 Oct 2026 addendum; docs/tt2/build/upcoming-api.md section 7) come from the data set's
// upcoming.json: each sits in its field's list A to Z among the others, with the chips "Not listed yet" and
// "Outside the profit list", its reported timing as an estimate with its date, and both sides of its facts.
//
// Nothing runs at import: no DOM, no storage, no network. The pure helpers (routes, orders, filters, letters,
// counts, words) are exported for the tests; the page builders return an element at once and fill it when the
// fact files have loaded (root.ready is a promise, and root gets data-ready="true" when it is filled).

import * as book from "./book.js?v=2.0.0";
import * as ui from "./ui.js?v=2.0.0";
import * as data from "./datafiles.js?v=2.0.0";
import {
  SECTORS, CLOSEUPS, INSIDE, fieldById, fieldName, alsoWords, isFieldId, matchFields, foldText, joinAnd,
} from "./fields-catalog.js?v=2.0.0";

// ---------------------------------------------------------------- configuration

const conf = {
  actions: { field: null, company: null, open: null },
  labels: { fieldsTitle: "Fields" },
  notes: {},
  prefs: { orderKey: "tt:list-order" },
  upcoming: null,
};

/**
 * What differs between the apps. Every key is optional; what is left out is not shown.
 *
 * actions.field    the field toggle, or null for none:
 *                  { tile: {off, on}, page: {off, on, hintOff, hintOn}, isOn(fieldId), onChange(fieldId, on, el) }
 *                  page words may be strings with "{name}" or functions (name) => string. onChange may return
 *                  false to refuse (the toggle goes back).
 * actions.company  the action on a company row and page, or null for none. Either a function
 *                  (info, {fieldId}) => Element | null, or
 *                  { off, on, hintOff, hintOn, isOn(id, info), onChange(info, on, el), canAdd(info), notAddable,
 *                    perField }
 *                  where canAdd defaults to info.addable and notAddable is the line shown instead (Content or
 *                  (info) => Content); a company that cannot be added but is on the list already (isOn) keeps the
 *                  on words, so it can be taken off, and then shows notAddable as its hint and cannot go back on
 *                  (companyActionKind "keep"). info = {id, name, ticker, venue, place, fields, label, addable, otc, fieldId}:
 *                  fieldId is the field whose list the action is in (a row: its field; a company page: one of its
 *                  fields, or null). perField: true shows a company page's action once for each of its fields.
 * actions.open     (fieldId, companyId | null) => void: a company row opened or closed (the host may update the
 *                  route).
 * labels.fieldsTitle  the Fields page title (default "Fields"); labels.fieldsLede an extra line under it.
 * notes.coverage   the coverage line: a string with {n} {date} {a} {b} {c} {notSorted}, or a function of those.
 * notes.sorting    the sorting note.          notes.notSorted  the not-sorted line ({n}).
 * notes.notCovered {TH: …, JP: …}: the line for each place with no cleared source.
 * notes.drs        the Thai DRs note under the place chips.   notes.drsLine  a company's DR line ({list}).
 * notes.stale      the stale banner ({date} {days}).   notes.newer  the newer-app banner.
 * notes.delisted   a company whose listing ended ({name} {date}).
 * prefs.orderKey   the browser storage key that remembers the reader's list order (default "tt:list-order").
 * upcoming         () => Promise<tt-upcoming doc | null>: the upcoming listings. By default datafiles.loadUpcoming()
 *                  when datafiles.js has it; null draws no upcoming row.
 */
export function configure({ actions, labels, notes, prefs, upcoming } = {}) {
  if (actions) Object.assign(conf.actions, actions);
  if (labels) Object.assign(conf.labels, labels);
  if (notes) Object.assign(conf.notes, notes);
  if (prefs) Object.assign(conf.prefs, prefs);
  if (upcoming !== undefined) { conf.upcoming = typeof upcoming === "function" ? upcoming : null; upcomingMemo = null; }
}

/** What configure() has set (the tests read it). */
export function configured() {
  return { actions: { ...conf.actions }, labels: { ...conf.labels }, notes: { ...conf.notes }, prefs: { ...conf.prefs }, upcoming: conf.upcoming };
}

// ---------------------------------------------------------------- the copy both apps share (spec Appendix C)

export const COPY = Object.freeze({
  whatField: "A field is a group of companies in the same line of business. Each company here made a profit in each "
    + "year Tide Table checked: 5 fiscal years, or 4 fiscal years and the latest 12 months. Each row says which.",
  caveat: "Only companies with a profit in every year checked are here. Companies that made a loss are left out, so "
    + "this list looks better than all companies did.",
  naExplainer: "No open source gives this company's yearly profits, so Tide Table cannot check them. It is listed so "
    + "you can find it, and it counts as neither passing nor failing the profit check.",
  notReady: "Facts are not ready yet. Your amounts, orders and records work without them.",
  failed: "Facts did not load. Your plan and records still work.",
  loading: "Opening the facts.",
  allFields: "All fields",
  bigFields: "The 11 big fields",
  closeups: "Close-ups",
  closeupsNote: "Cars, Retail and Telecom have pages of their own. Their companies also sit in the big fields above.",
  find: "Find a company or a field",
  findHint: "Type a name, a ticker or a field.",
  where: "Where the companies are",
  years: "Years checked",
  order: "Order",
  more: "Show 25 more",
  fromStart: "Show from the start",
  noMatch: "No company here matches what you chose.",
  noSearch: "No company or field matches what you typed.",
  sources: "Where these facts come from",
  news: "In the news",
  filings: "Reports filed",
  noCompany: "Tide Table has no facts for this company now.",
  emptyField: "There are no companies in this field yet.",
  notSortedOne: "This company is not sorted into a field. Search finds it.",
  inFields: "In these fields:",
});

/** The label filter's words (Appendix C); "not available" shows only when the set has that label. */
export const LABEL_WORDS = Object.freeze({ all: "all", y5: "5", y4ttm: "4 and the latest 12 months", na: "not available" });

/** Places in the brief's order; DR is the personal set's Thai DRs. */
export const PLACES = Object.freeze([
  { id: "all", label: "Everywhere" }, { id: "US", label: "United States" }, { id: "TH", label: "Thailand" },
  { id: "DR", label: "Thai DRs" }, { id: "EU", label: "Europe" }, { id: "JP", label: "Japan" },
  { id: "OTHER", label: "Other places" },
]);
const PLACE_WORDS = Object.fromEntries(PLACES.map((p) => [p.id, p.label]));

/** "United States" for "US"; "Other places" for anything unknown. */
export function placeWords(code) {
  return PLACE_WORDS[code] && code !== "all" ? PLACE_WORDS[code] : PLACE_WORDS.OTHER;
}

/** Fill "{key}" placeholders. A function template is called with vars. Values may be nodes: the result is then a
 *  list of strings and nodes (Content); with only strings it is one string. */
export function fill(template, vars = {}) {
  if (template == null || template === false) return null;
  if (typeof template === "function") return template(vars);
  if (typeof template !== "string") return template;
  const parts = [];
  let last = 0;
  template.replace(/\{(\w+)\}/g, (m, k, at) => {
    parts.push(template.slice(last, at));
    parts.push(Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m);
    last = at + m.length;
    return m;
  });
  parts.push(template.slice(last));
  const flat = [];
  for (const p of parts) {
    if (p === "" || p == null) continue;
    const plain = typeof p === "string" || typeof p === "number";
    if (plain && flat.length && typeof flat[flat.length - 1] === "string") flat[flat.length - 1] += String(p);
    else flat.push(plain ? String(p) : p);
  }
  return flat.length === 1 && typeof flat[0] === "string" ? flat[0] : flat.length ? flat : "";
}

// ---------------------------------------------------------------- words for numbers and dates

const MINUS = "−";
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BKK_MS = 7 * 3600000;

/** "Tue 27 Oct 2026" for "2026-10-27" (no comma); "—" for anything else. */
export function dayWords(iso) {
  if (typeof ui.dateWords === "function") return ui.dateWords(String(iso).slice(0, 10));
  const m = typeof iso === "string" && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isFinite(t.getTime()) ? `${DAY3[t.getUTCDay()]} ${t.getUTCDate()} ${MON3[t.getUTCMonth()]} ${t.getUTCFullYear()}` : "—";
}

/** "Sep 2021" for "2021-09" or a day in it. */
export function monthWords(key) {
  if (typeof ui.monthWords === "function") return ui.monthWords(key);
  const m = typeof key === "string" && /^(\d{4})-(\d{2})/.exec(key);
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${MON3[+m[2] - 1]} ${m[1]}` : "—";
}

/** A fiscal year by its end: "2025" for a December year, else "the year to Jan 2026". */
export function fyWords(end) {
  if (typeof end !== "string" || !/^\d{4}-\d{2}/.test(end)) return "—";
  return end.slice(5, 7) === "12" ? end.slice(0, 4) : `the year to ${monthWords(end)}`;
}

/** The Bangkok date ("YYYY-MM-DD") and time ("06:17") of an ISO instant. */
export function bangkokParts(isoInstant) {
  const t = Date.parse(isoInstant);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + BKK_MS);
  const p = (n) => String(n).padStart(2, "0");
  return { date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`, time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
}

/** 1234567 -> "1,234,567". */
export function intWords(n) {
  if (!Number.isFinite(n)) return "—";
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (n < 0 ? MINUS : "") + s;
}

/** Baht in words (brief 4.9): "฿32.2 trillion", "฿1.2 billion", "฿190 billion"; below a billion "฿850,000,000". */
export function sizeWords(thb) {
  if (!Number.isFinite(thb)) return "—";
  if (typeof ui.bahtSize === "function") return ui.bahtSize(thb);
  const a = Math.abs(thb), s = thb < 0 ? MINUS : "";
  if (a >= 1e12) return `${s}฿${(a / 1e12).toFixed(1)} trillion`;
  if (a >= 1e9) return `${s}฿${a < 1e11 ? (a / 1e9).toFixed(1) : (a / 1e9).toFixed(0)} billion`;
  return `${s}฿${intWords(a)}`;
}

/** A fraction as a percent: whole from 10% up, one decimal below, a true minus, "+" when signed. */
export function pctWords(x, signed = false) {
  if (!Number.isFinite(x)) return "—";
  const a = Math.abs(x * 100);
  const s = a >= 9.95 ? a.toFixed(0) : a.toFixed(1);
  if (s === "0" || s === "0.0") return "0%";
  return (signed ? (x > 0 ? "+" : MINUS) : x < 0 ? MINUS : "") + s + "%";
}

/** "Facts rebuilt on Tue 27 Oct 2026 at 06:17 Bangkok time." */
export function freshnessWords(asOf) {
  const p = bangkokParts(asOf);
  return p ? `Facts rebuilt on ${dayWords(p.date)} at ${p.time} Bangkok time.` : null;
}

/** "Not in the list since Sat 7 Nov 2026: its yearly reports no longer show a profit in each year Tide Table checks." */
export function leftWords(date) {
  return `Not in the list since ${dayWords(date)}: its yearly reports no longer show a profit in each year Tide Table checks.`;
}

function plural(n, one, many) {
  return `${intWords(n)} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------- upcoming listings (upcoming-api.md 7 and 9)

/** The venues of a listing a friend's order can use (spec 8.3). */
const US_VENUES = Object.freeze(["NYSE", "NASDAQ", "NYSE American", "Cboe"]);
export const UPCOMING_SCHEMA = "tt-upcoming/1";
export const UPCOMING_COPY = Object.freeze({
  notListed: "Not listed yet",
  outside: "Outside the profit list",
  noTiming: "No first trading day is announced, and Tide Table has no reported timing for it.",
  timingSources: "Where the timing comes from",
  edgar: "Its filings on the SEC site",
});

/** A tt-upcoming/1 document with a list of entries. */
export const isUpcomingDoc = (d) => !!d && typeof d === "object" && d.schema === UPCOMING_SCHEMA && Array.isArray(d.entries);

/** Its two factual chips: "Not listed yet" while it does not trade, and "Outside the profit list". */
export function upcomingChips(entry) {
  const out = [];
  if (!entry || entry.status !== "listed") out.push({ id: "not_listed", text: UPCOMING_COPY.notListed });
  out.push({ id: "outside", text: UPCOMING_COPY.outside });
  return out;
}

/** "News reports point to about Thu 19 Nov 2026 for its first trading day, between … and …. This is an estimate
 *  as of …, not an announced date." (reported timing, never a prediction), or the no-timing line. */
export function upcomingTimingWords(entry) {
  const e = entry && entry.estimate;
  if (!e || !e.mostLikely) return UPCOMING_COPY.noTiming;
  return `News reports point to about ${dayWords(e.mostLikely)} for its first trading day, between ${dayWords(e.earliest)} `
    + `and ${dayWords(e.latest)}. This is an estimate as of ${dayWords(e.asOf)}, not an announced date.`;
}

/** Where it stands, in one or two plain sentences, from its status and dates. */
export function upcomingStatusWords(entry) {
  const e = entry || {};
  const d = e.dates || {};
  switch (e.status) {
    case "filed_public": return `It filed its public S-1 with the US SEC on ${dayWords(d.publicS1)}. Its shares do not trade yet.`;
    case "priced": return `Its final prospectus (424B4) is on the SEC site since ${dayWords(d.priced)}. SEC's list does not show its ticker yet.`;
    case "listed": return `It trades as ${e.ticker || "—"} on ${e.exchange || "—"} since ${dayWords(d.firstTrade)}.`;
    case "withdrawn": return `It withdrew its filing with the US SEC on ${dayWords(d.withdrawn)}.`;
    default: return "It has no public S-1 with the US SEC yet. Its shares do not trade yet.";
  }
}

/** Whether the reported timing still says something: only while it waits (expected, filed_public or priced).
 *  Once it trades or its filing is withdrawn, the estimate is history and its status says where it stands. */
export function upcomingTimingShown(entry) {
  return !entry || (entry.status !== "listed" && entry.status !== "withdrawn");
}

/** The note under its row: the reported timing while it waits, then its status ("It trades as ANT on NASDAQ
 *  since Thu 19 Nov 2026.", "It withdrew its filing …"). */
export function upcomingNoteWords(entry) {
  return upcomingTimingShown(entry) ? upcomingTimingWords(entry) : upcomingStatusWords(entry);
}

/** "Checked on the SEC site on Tue 27 Oct 2026." or "Checked by hand on …" (Bangkok date); "" when never. */
export function upcomingCheckedWords(entry) {
  const p = entry && entry.checkedAt ? bangkokParts(entry.checkedAt) : null;
  if (!p) return "";
  return entry.checkedBy === "sec" ? `Checked on the SEC site on ${dayWords(p.date)}.` : `Checked by hand on ${dayWords(p.date)}.`;
}

/** The entries as list rows (the field file's row keys, A to Z by name): those of one field, or every entry with
 *  fieldId null. A row can go on a friend's list when its exchange is a US one and it is not withdrawn. */
export function upcomingRows(doc, fieldId = null) {
  if (!isUpcomingDoc(doc)) return [];
  const rows = doc.entries.filter((e) => e && typeof e === "object" && typeof e.id === "string" && typeof e.name === "string"
    && (fieldId == null || (Array.isArray(e.fields) && e.fields.includes(fieldId))))
    .map((e) => ({
      id: e.id, name: e.name, place: e.place || "US", ticker: e.ticker ?? null, tickers: e.ticker ? [e.ticker] : [],
      venue: e.exchange ?? null, label: null, addable: US_VENUES.includes(e.exchange) && e.status !== "withdrawn",
      otc: false, dr: false, fields: Array.isArray(e.fields) ? [...e.fields] : [], left: null,
      profitThb: null, profitFy: null, profitPerYear: null, margin: null, salesThb: null, upcoming: e,
    }));
  const key = (r) => foldText(r.name);
  return rows.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** items (A to Z from the data) with rows put in their A to Z places; the data's own order is kept. */
export function mergeRows(items, rows) {
  if (!rows || !rows.length) return items;
  const key = (r) => foldText(r.name);
  const out = [...items];
  for (const r of rows) {
    if (out.some((x) => x.id === r.id)) continue; // already in the data's list: shown once
    const at = out.findIndex((x) => key(x) > key(r));
    out.splice(at < 0 ? out.length : at, 0, r);
  }
  return out;
}

/** The first trading day an entry shows, read only from a listed entry on a US exchange (the list sets it only
 *  then: upcoming-api.md 4); null otherwise. So a date typed in ahead of the listing never makes a friend's
 *  ticked row count in a month before it trades. */
export function upcomingFirstTrade(entry) {
  const e = entry || {};
  if (e.status !== "listed" || !US_VENUES.includes(e.exchange)) return null;
  return e.dates && typeof e.dates.firstTrade === "string" ? e.dates.firstTrade : null;
}

/** What the host's company action is told about an upcoming listing: companyInfo's keys plus upcoming {key,
 *  status, firstTrade} and w {k, f, s: null}, the friends' waiting record (split.js nameSnapshot keeps it). Both
 *  first trading days are upcomingFirstTrade's: null until the entry is listed on a US exchange. */
export function upcomingInfo(entry, fieldId = null) {
  const e = entry || {};
  const first = upcomingFirstTrade(e);
  return {
    id: e.id, name: e.name, place: e.place || "US", ticker: e.ticker ?? null, venue: e.exchange ?? null,
    fields: Array.isArray(e.fields) ? [...e.fields] : [], label: null,
    addable: US_VENUES.includes(e.exchange) && e.status !== "withdrawn", otc: false, fieldId,
    upcoming: { key: e.key, status: e.status, firstTrade: first }, w: { k: e.key, f: first, s: null },
  };
}

let upcomingMemo = null;
/** The upcoming listings, once per page load (a failed load is tried again next time); null when there are none. */
function loadUpcomingDoc() {
  if (upcomingMemo) return upcomingMemo;
  const fn = typeof conf.upcoming === "function" ? conf.upcoming
    : typeof data.loadUpcoming === "function" ? () => data.loadUpcoming() : null;
  if (!fn) return Promise.resolve(null);
  const p = Promise.resolve().then(fn).then((d) => (isUpcomingDoc(d) ? d : null), (e) => { warnOnce("upcoming.json did not load", e); return null; });
  upcomingMemo = p.then((d) => { if (!d) upcomingMemo = null; return d; });
  return upcomingMemo;
}

// ---------------------------------------------------------------- routes (spec 8.2)

export const ID_RE_OPEN = /^[sjl][0-9A-Z]{1,19}$/;
export const ID_RE_ALL = /^[sjly][0-9A-Z]{1,19}$/;

/**
 * Read "#/seg1[/seg2[/seg3]]". seg1 must be one of the host's routes; "field" takes a field id and may take a
 * company id; "company" takes a company id; any other route may take segments that are each a route, field or
 * company id. Anything else goes to the fallback. personal: true also accepts the personal set's y ids.
 * Returns {ok, route, field, company, rest, hash} (hash is the canonical route).
 */
export function parseRoute(hash, { routes = ["today", "fields", "field", "company"], fallback = "today", personal = false } = {}) {
  const idRe = personal ? ID_RE_ALL : ID_RE_OPEN;
  const out = (route, field = null, company = null, rest = []) => {
    const segs = [route, ...(route === "field" ? [field, company] : route === "company" ? [company] : rest)].filter((x) => x != null);
    return { ok: true, route, field, company, rest, hash: `#/${segs.join("/")}` };
  };
  const bad = { ok: false, route: fallback, field: null, company: null, rest: [], hash: `#/${fallback}` };
  let raw = String(hash ?? "").replace(/^#/, "").replace(/^\//, "").replace(/\/$/, "");
  try { raw = decodeURIComponent(raw); } catch { return bad; }
  if (!raw) return bad;
  const segs = raw.split("/");
  if (segs.length > 3 || segs.some((s) => !s)) return bad;
  const [r, a, b] = segs;
  if (!routes.includes(r)) return bad;
  if (r === "field") {
    if (!isFieldId(a)) return bad;
    if (b !== undefined && !idRe.test(b)) return bad;
    return out("field", a, b ?? null);
  }
  if (r === "company") {
    if (a === undefined || b !== undefined || !idRe.test(a)) return bad;
    return out("company", null, a);
  }
  for (const s of [a, b]) {
    if (s !== undefined && !routes.includes(s) && !isFieldId(s) && !idRe.test(s)) return bad;
  }
  return out(r, null, null, [a, b].filter((x) => x !== undefined));
}

export const fieldsHref = () => "#/fields";
export const fieldHref = (id) => `#/field/${id}`;
/** A company inside its field's page, or on its own page when no field is given. */
export const companyHref = (id, fieldId = null) => (fieldId ? `#/field/${fieldId}/${id}` : `#/company/${id}`);

// ---------------------------------------------------------------- list orders (spec 7.6: plain facts, the reader's choice)

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Every order the menu can offer. key(item) gives a number (null sorts last either way); text is the menu's words. */
export const ORDERS = Object.freeze([
  { id: "name_az", text: "Name, A to Z" },
  { id: "name_za", text: "Name, Z to A" },
  { id: "place", text: "Place, A to Z" },
  { id: "profit_desc", text: "Profit in the latest year, biggest first", key: (r) => num(r.profitThb), dir: -1 },
  { id: "profit_asc", text: "Profit in the latest year, smallest first", key: (r) => num(r.profitThb), dir: 1 },
  { id: "growth_desc", text: "Profit change a year, biggest first", key: (r) => num(r.profitPerYear), dir: -1 },
  { id: "growth_asc", text: "Profit change a year, smallest first", key: (r) => num(r.profitPerYear), dir: 1 },
  { id: "margin_desc", text: "Kept out of each ฿100 of sales, biggest first", key: (r) => num(r.margin), dir: -1 },
  { id: "margin_asc", text: "Kept out of each ฿100 of sales, smallest first", key: (r) => num(r.margin), dir: 1 },
  { id: "sales_desc", text: "Sales in the latest year, biggest first", key: (r) => num(r.salesThb), dir: -1 },
  { id: "sales_asc", text: "Sales in the latest year, smallest first", key: (r) => num(r.salesThb), dir: 1 },
  { id: "chg1y_desc", text: "Share price change over 1 year, biggest first", key: (r) => num(r.chg1y), dir: -1, prices: true },
  { id: "chg1y_asc", text: "Share price change over 1 year, smallest first", key: (r) => num(r.chg1y), dir: 1, prices: true },
  { id: "chg5y_desc", text: "Share price change over 5 years, biggest first", key: (r) => num(r.chg5y), dir: -1, prices: true },
  { id: "chg5y_asc", text: "Share price change over 5 years, smallest first", key: (r) => num(r.chg5y), dir: 1, prices: true },
  { id: "swings_desc", text: "Swings, biggest first", key: (r) => num(r.swings), dir: -1, prices: true },
  { id: "swings_asc", text: "Swings, smallest first", key: (r) => num(r.swings), dir: 1, prices: true },
  // a fall is a negative number: "biggest first" puts the deepest fall first
  { id: "deepest_desc", text: "Deepest fall in 5 years, biggest first", key: (r) => (num(r.deepest) === null ? null : -r.deepest), dir: -1, prices: true },
  { id: "deepest_asc", text: "Deepest fall in 5 years, smallest first", key: (r) => (num(r.deepest) === null ? null : -r.deepest), dir: 1, prices: true },
  { id: "size_desc", text: "Size, biggest first", key: (r) => num(r.sizeThb), dir: -1, prices: true },
  { id: "size_asc", text: "Size, smallest first", key: (r) => num(r.sizeThb), dir: 1, prices: true },
]);
const ORDER_BY_ID = new Map(ORDERS.map((o) => [o.id, o]));
export const DEFAULT_ORDER = "name_az";

/** The menu's options for a set: [{value, text}], "Name, A to Z" first; the price orders only with prices. */
export function orderOptions(prices) {
  return ORDERS.filter((o) => prices || !o.prices).map((o) => ({ value: o.id, text: o.text }));
}

/** An order id this set can use, else the default. */
export function validOrder(id, prices) {
  const o = ORDER_BY_ID.get(id);
  return o && (prices || !o.prices) ? o.id : DEFAULT_ORDER;
}

/** "Showing …, A to Z by name." or "…, in the order you chose: profit in the latest year, biggest first." */
export function orderWords(id) {
  if (id === DEFAULT_ORDER) return "A to Z by name";
  const o = ORDER_BY_ID.get(id) || ORDER_BY_ID.get(DEFAULT_ORDER);
  return `in the order you chose: ${o.text.slice(0, 1).toLowerCase()}${o.text.slice(1)}`;
}

/**
 * A new array in the order asked for. items come A to Z by name from the data (spec Appendix B.1), so name_az keeps
 * them as they are and name_za reverses them; every other order is stable, so ties stay A to Z, and companies with
 * no value for the fact go last in both directions.
 */
export function sortItems(items, id) {
  const list = [...items];
  if (id === "name_za") return list.reverse();
  if (id === "place") {
    return list.map((r, i) => [placeWords(r.place), i, r])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1])).map((x) => x[2]);
  }
  const o = ORDER_BY_ID.get(id);
  if (!o || !o.key) return list;
  const keyed = list.map((r, i) => [o.key(r), i, r]);
  keyed.sort((a, b) => {
    if (a[0] === null && b[0] === null) return a[1] - b[1];
    if (a[0] === null) return 1;
    if (b[0] === null) return -1;
    return a[0] === b[0] ? a[1] - b[1] : (a[0] - b[0]) * o.dir;
  });
  return keyed.map((x) => x[2]);
}

// ---------------------------------------------------------------- filters, counts and letters

/** Keep the rows of one place ("DR": the Thai DRs), one label, and whose name or ticker holds every word typed. */
export function filterItems(items, { place = "all", label = "all", query = "" } = {}) {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  return items.filter((r) => {
    if (place === "DR" ? !r.dr : place !== "all" && r.place !== place) return false;
    if (label !== "all" && r.label !== label) return false;
    if (!words.length) return true;
    const name = foldText(r.name);
    const tickers = (Array.isArray(r.tickers) ? r.tickers : [r.ticker]).filter(Boolean).map((t) => String(t).toLowerCase());
    return words.every((w) => name.includes(w) || tickers.some((t) => t.startsWith(w)));
  });
}

/** Counts by place (and Thai DRs) and by label: {all, US, EU, JP, TH, OTHER, DR} and {all, y5, y4ttm, na}. */
export function countItems(items) {
  const place = { all: items.length, US: 0, TH: 0, DR: 0, EU: 0, JP: 0, OTHER: 0 };
  const label = { all: items.length, y5: 0, y4ttm: 0, na: 0 };
  for (const r of items) {
    place[r.place in place && r.place !== "all" && r.place !== "DR" ? r.place : "OTHER"]++;
    if (r.dr) place.DR++;
    if (r.label in label && r.label !== "all") label[r.label]++;
  }
  return { place, label };
}

/** The letter a name files under: its first letter, accents dropped, upper case; "#" for a digit or a sign. */
export function letterOf(name) {
  const c = foldText(String(name ?? "").trim().slice(0, 4)).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(c) ? c : "#";
}

const LETTER = new WeakMap();
function letterOfItem(r) {
  if (!r || typeof r !== "object") return letterOf(r);
  let l = LETTER.get(r);
  if (l === undefined) { l = letterOf(r.name); LETTER.set(r, l); }
  return l;
}

/** Only the letters that occur, in A to Z order ("#" first). */
export function lettersOf(items) {
  const set = new Set(items.map(letterOfItem));
  return [...set].sort((a, b) => (a === "#" ? -1 : b === "#" ? 1 : a < b ? -1 : a > b ? 1 : 0));
}

/** Where the first company of a letter sits in an A to Z list, or -1. */
export function firstOfLetter(items, letter) {
  return items.findIndex((r) => letterOfItem(r) === letter);
}

/** The place chips for a set of counts: Everywhere first; a place shows when it has companies or a note. */
export function placeChips(counts, { notCovered = [] } = {}) {
  return PLACES.filter((p) => p.id === "all" || (counts[p.id] || 0) > 0 || notCovered.includes(p.id))
    .map((p) => ({ id: p.id, label: p.label, count: counts[p.id] || 0 }));
}

/**
 * The label filter's chips; "not available" only when the set has that label. With counts and hideEmpty, a label
 * no company in the list has is left out ("all" always stays).
 */
export function labelChips(labels = ["y5", "y4ttm"], counts = null, { hideEmpty = false } = {}) {
  return ["all", "y5", "y4ttm", "na"].filter((k) => k === "all" || labels.includes(k))
    .filter((k) => k === "all" || !hideEmpty || !counts || (counts[k] || 0) > 0)
    .map((k) => ({ id: k, label: LABEL_WORDS[k], ...(counts ? { count: counts[k] || 0 } : {}) }));
}

/** The line over a list: "Showing 25 of 603, A to Z by name." with "from the letter T" after a jump. */
export function showingWords({ shown, total, order = DEFAULT_ORDER, from = null }) {
  if (!total) return COPY.noMatch;
  const fromWords = from ? `, from the letter ${from}` : "";
  return `Showing ${intWords(shown)} of ${intWords(total)}${fromWords}, ${orderWords(order)}.`;
}

// ---------------------------------------------------------------- what a row, a tile and a page say

const FACT_OF_ORDER = {
  growth: { label: "Profit change a year", value: (r) => (num(r.profitPerYear) === null ? null : `${pctWords(r.profitPerYear, true)} a year`) },
  sales: { label: "Sales", value: (r) => (num(r.salesThb) === null ? null : `${sizeWords(r.salesThb)} in ${fyWords(r.profitFy)}`),
    wide: (r) => (num(r.salesThb) === null ? null : twoLines(sizeWords(r.salesThb), `in ${fyWords(r.profitFy)}`)) },
  chg1y: { label: "Share price, 1 year", value: (r) => (num(r.chg1y) === null ? null : pctWords(r.chg1y, true)) },
  chg5y: { label: "Share price, 5 years", value: (r) => (num(r.chg5y) === null ? null : pctWords(r.chg5y, true)) },
  swings: { label: "Swings", value: (r) => (num(r.swings) === null ? null : `about ${pctWords(r.swings)} a year`),
    wide: (r) => (num(r.swings) === null ? null : `${pctWords(r.swings)} a year`) },
  deepest: { label: "Deepest fall, 5 years", value: (r) => (num(r.deepest) === null ? null : pctWords(r.deepest, true)) },
  size: { label: "Size", value: (r) => (num(r.sizeThb) === null ? null : sizeWords(r.sizeThb)) },
};

/** A short value on two lines for a narrow column of the wide list (the words stay the same). */
function twoLines(a, b) {
  return typeof document === "undefined" ? `${a} ${b}` : [a, ui.h("br"), b];
}

/** The fact labels a list shows for an order: profit and kept always, plus the fact the reader ordered by. */
export function factColumns(order) {
  const extra = FACT_OF_ORDER[String(order).replace(/_(desc|asc)$/, "")];
  return ["Profit", "Kept", ...(extra ? [extra.label] : [])];
}

/**
 * A row's plain facts with their dates in the words (spec 7.6), in factColumns' order. value is the phone's line
 * ("Profit ฿1.2 billion in 2025"); wide, when given, is the shorter form for a column of the wide list, whose
 * heading already says what the column is.
 */
export function rowFacts(r, order = DEFAULT_ORDER) {
  const facts = [];
  if (num(r.profitThb) !== null) {
    facts.push({ label: "Profit", value: `${sizeWords(r.profitThb)} in ${fyWords(r.profitFy)}`,
      wide: twoLines(sizeWords(r.profitThb), `in ${fyWords(r.profitFy)}`) });
  } else facts.push({ label: "Profit", value: "—" });
  if (num(r.margin) !== null) {
    const kept = `฿${(r.margin * 100).toFixed(1)}`;
    facts.push({ label: "Kept", value: `${kept} of each ฿100 of sales`, wide: `${kept} of ฿100` });
  } else facts.push({ label: "Kept", value: "—" });
  const extra = FACT_OF_ORDER[String(order).replace(/_(desc|asc)$/, "")];
  if (extra) {
    const v = extra.value(r);
    const w = extra.wide ? extra.wide(r) : null;
    facts.push(w ? { label: extra.label, value: v ?? "—", wide: w } : { label: extra.label, value: v ?? "—" });
  }
  return facts;
}

/** The venue as a reader sees it: "over the counter" for OTC; nothing for a European filer with no ticker. */
export function venueWords(venue, ticker) {
  if (!venue || (venue === "EU" && !ticker)) return null;
  return venue === "OTC" ? "over the counter" : venue;
}

/** What the host's company action is told about a company. */
export function companyInfo(src, fieldId = null) {
  const main = Array.isArray(src.listings) ? src.listings.find((l) => l && l.main) || src.listings[0] : null;
  return {
    id: src.id, name: src.name, place: src.place,
    ticker: main ? main.ticker ?? null : src.ticker ?? null,
    venue: main ? main.venue ?? null : src.venue ?? null,
    fields: Array.isArray(src.fields) ? [...src.fields] : fieldId ? [fieldId] : [],
    label: src.label ?? (src.rule ? src.rule.label : null),
    addable: src.addable === true, otc: main ? main.otc === true : src.otc === true, fieldId,
  };
}

/** A data Line as the book spread takes it: {text, source: {short, items}} (book-api 6.11). */
export function lineView(line) {
  const srcs = Array.isArray(line.sources) ? line.sources : [];
  const first = srcs[0];
  let short = "Source";
  if (first) {
    const dw = first.date ? dayWords(first.date) : null;
    const plain = first.date ? `${Number(first.date.slice(8, 10))} ${MON3[Number(first.date.slice(5, 7)) - 1]} ${first.date.slice(0, 4)}` : null;
    short = dw && dw !== "—" && !(plain && first.label.includes(plain)) ? `${first.label}, ${dw}` : first.label;
    if (srcs.length > 1) short += ` and ${srcs.length - 1} more`;
  }
  return {
    text: line.text,
    source: { short, items: srcs.map((s) => ({ label: s.label, date: s.date ? dayWords(s.date) : "", url: s.url || null })) },
  };
}

/** The spread's two sides: the card lines, or with all: true every line, split by side. */
export function spreadOf(lines, { all = false } = {}) {
  if (!lines) return { well: [], wrong: [] };
  const src = all ? { well: (lines.all || []).filter((l) => l.side === "well"), wrong: (lines.all || []).filter((l) => l.side === "wrong") }
    : { well: lines.well || [], wrong: lines.wrong || [] };
  return { well: src.well.map(lineView), wrong: src.wrong.map(lineView) };
}

const NEEDS_PRICES = "Needs share prices";
const NOT_IN_REPORTS = "Not in the yearly reports Tide Table reads";

/**
 * The numbers table of a company (C01 to C18, spec 7.5): [{label, value, date, source}]. A fact a set cannot have
 * says why it is empty.
 */
export function numbersRows(rec) {
  const n = rec.numbers || {};
  const priceCur = rec.fxEffect && rec.fxEffect.currency ? rec.fxEffect.currency : rec.place === "TH" ? "THB" : null;
  const reportCur = rec.profit && rec.profit.unit ? rec.profit.unit : priceCur;
  const sym = (c) => ({ USD: "$", THB: "฿", JPY: "¥", EUR: "€", GBP: "£" }[c] || (c ? `${c} ` : ""));
  const amount = (x, c) => (c ? `${sym(c)}${Math.abs(x) >= 1000 ? intWords(x) : x.toFixed(2)}` : x.toFixed(2));
  const rows = [
    ["C01", "Latest price", (v) => amount(v, priceCur)],
    ["C02", "Price change, 1 month", (v) => pctWords(v, true)],
    ["C03", "Price change, 1 year", (v) => pctWords(v, true)],
    ["C04", "Price change, 5 years", (v) => pctWords(v, true)],
    ["C05", "Price change, 5 years, with dividends added back", (v) => pctWords(v, true)],
    ["C06", "Below its highest price of the past 52 weeks", (v) => (v < 0 ? `${pctWords(-v)} below` : "At its highest")],
    ["C07", "Swings, counted in baht month by month", (v) => `about ${pctWords(v)} a year`],
    ["C08", "Deepest fall in 5 years, in baht", (v) => pctWords(v, true)],
    ["C09", "Highest 12-month change, in baht", (v) => pctWords(v, true)],
    ["C10", "Exchange-rate effect over 5 years", (v) => pctWords(v, true)],
    ["C11", "Fiscal years in a row with a profit", (v) => plural(v, "fiscal year", "fiscal years")],
    ["C12", "Profit change a year", (v) => `${pctWords(v, true)} a year`],
    ["C13", "Sales change a year", (v) => `${pctWords(v, true)} a year`],
    ["C14", "Kept as profit out of each 100 of sales", (v) => `${sym(reportCur)}${(v * 100).toFixed(1)} of each ${sym(reportCur)}100`],
    ["C15", "Price compared with profit", (v) => `${v < 10 ? v.toFixed(1) : v.toFixed(0)} times its profit in the last 12 months`],
    ["C16", "Dividends in the last 12 months", (v) => (v > 0 ? `${amount(v, priceCur)} a share` : "None in the 12 months")],
    ["C17", "Size", (v) => sizeWords(v)],
    ["C18", "Where it trades", (v) => (rec.country ? `${v}, ${rec.country}` : String(v))],
  ];
  return rows.map(([id, label, fmt]) => {
    const x = n[id];
    if (!x || typeof x !== "object") return { id, label, value: NOT_IN_REPORTS, date: "", source: "" };
    if (x.missing) return { id, label, value: x.missing === "prices" ? NEEDS_PRICES : NOT_IN_REPORTS, date: "", source: "" };
    let value;
    try { value = typeof x.value === "number" && !Number.isFinite(x.value) ? "—" : fmt(x.value); } catch { value = String(x.value); }
    const date = typeof x.date === "string" ? (x.date.length === 7 ? monthWords(x.date) : dayWords(x.date)) : "";
    return { id, label, value, date, source: x.source || "" };
  });
}

/** The numbers table of a field (F09 to F12): middle margin, total sales, the 10 largest's share, coverage. */
export function fieldNumbersRows(f, idx) {
  const n = (f && f.numbers) || {};
  const date = idx && idx.dataDate ? dayWords(idx.dataDate) : "";
  const src = "The yearly reports of these companies";
  return [
    { label: "Kept out of each ฿100 of sales, middle company", value: num(n.medianMargin) === null ? NOT_IN_REPORTS
      : `฿${(n.medianMargin * 100).toFixed(1)}${num(n.marginN) !== null ? ` (of ${plural(n.marginN, "company", "companies")})` : ""}`, date, source: src },
    { label: "Sales of all these companies in their latest year", value: num(n.totalSalesThb) === null ? NOT_IN_REPORTS : sizeWords(n.totalSalesThb), date, source: src },
    { label: "Share of their size held by the 10 largest", value: num(n.sizeTop10Share) === null ? NEEDS_PRICES : pctWords(n.sizeTop10Share), date, source: "" },
    { label: "Fewest companies with a price in any month", value: num(n.fewestMembers) === null ? NEEDS_PRICES : intWords(n.fewestMembers), date, source: "" },
  ];
}

/** The coverage counts (spec 5.4) the host's coverage line is filled with. */
export function coverageVars(idx) {
  const c = (idx && idx.coverage) || {};
  const bl = c.byLabel || {};
  const p = idx ? bangkokParts(idx.asOf) : null;
  return {
    n: intWords(c.companies || 0), date: p ? dayWords(p.date) : "—", a: intWords(bl.y5 || 0), b: intWords(bl.y4ttm || 0),
    c: intWords(bl.na || 0), notSorted: intWords(c.passedNotSorted || 0),
    hasC: (bl.na || 0) > 0, hasNotSorted: (c.passedNotSorted || 0) > 0,
  };
}

/** "42 with 5 fiscal years checked, 1 with 4 and the latest 12 months, 1 with no open profit history." */
export function labelSplitWords(byLabel = {}) {
  const parts = [];
  if (byLabel.y5) parts.push(`${intWords(byLabel.y5)} with 5 fiscal years checked`);
  if (byLabel.y4ttm) parts.push(`${intWords(byLabel.y4ttm)} with 4 fiscal years and the latest 12 months checked`);
  if (byLabel.na) parts.push(`${intWords(byLabel.na)} with no open profit history`);
  return parts.length ? `${parts.join(", ")}.` : null;
}

/** A tile's short line on the years checked: "All checked over 5 fiscal years." or the counts of each label. */
export function tileLabelWords(byLabel = {}, n = 0) {
  const a = byLabel.y5 || 0, b = byLabel.y4ttm || 0, c = byLabel.na || 0;
  if (!n) return null;
  const all = n === 1 ? "Checked" : "All checked";
  if (a === n) return `${all} over 5 fiscal years.`;
  if (b === n) return `${all} over 4 fiscal years and the latest 12 months.`;
  if (c === n) return n === 1 ? "No open profit history." : "None with an open profit history.";
  const parts = [];
  if (a) parts.push(`${intWords(a)} checked over 5 fiscal years`);
  if (b) parts.push(`${intWords(b)} over 4 and the latest 12 months`);
  if (c) parts.push(`${intWords(c)} with no open profit history`);
  return `${parts.join(", ")}.`;
}

/** "United States 40, Europe 3, Japan 1." (places with companies only, the brief's order). */
export function placeSplitWords(byPlace = {}, drs = 0) {
  const parts = [];
  for (const p of PLACES) {
    if (p.id === "all") continue;
    const n = p.id === "DR" ? drs : byPlace[p.id] || 0;
    if (n > 0) parts.push(`${p.id === "OTHER" ? "other places" : p.label} ${intWords(n)}`);
  }
  return parts.length ? `${parts.join(", ")}.` : null;
}

/** What each tile says (no performance number, ever: spec 12.1.3). */
export function tileModels(fieldsFile, idx, { place = "all" } = {}) {
  const byId = (fieldsFile && fieldsFile.byId) || {};
  const tog = conf.actions.field;
  return [...SECTORS, ...CLOSEUPS].map((f) => {
    const e = byId[f.id];
    const listed = idx && idx.files && idx.files.field && idx.files.field[f.id];
    const total = e ? e.n : listed ? listed.n : 0;
    const n = place === "all" ? total : place === "DR" ? (e ? e.drs || 0 : 0) : e && e.byPlace ? e.byPlace[place] || 0 : 0;
    const where = place === "all" ? "" : ` in ${placeWords(place)}`;
    const insideWords = f.kind === "close-up" ? `${INSIDE[f.id]}. ${alsoWords(f.id)}.` : INSIDE[f.id];
    return {
      id: f.id, name: f.name, inside: insideWords, count: `${plural(n, "company", "companies")}${where}`,
      detail: place === "all" && e ? tileLabelWords(e.byLabel, e.n) : null, href: fieldHref(f.id),
      chosen: !!(tog && typeof tog.isOn === "function" && tog.isOn(f.id)),
      toggle: tog && tog.tile ? { off: tog.tile.off, on: tog.tile.on, name: f.name } : null,
    };
  });
}

/** The words of the field page's toggle for a field name. */
export function fieldToggleWords(name) {
  const p = (conf.actions.field && conf.actions.field.page) || {};
  const w = (t) => (t == null ? null : typeof t === "function" ? t(name) : fill(t, { name }));
  return { off: w(p.off), on: w(p.on), hintOff: w(p.hintOff), hintOn: w(p.hintOn) };
}

// ---------------------------------------------------------------- remembered order (per viewer)

function readOrder() {
  try { return globalThis.localStorage ? globalThis.localStorage.getItem(conf.prefs.orderKey) : null; } catch { return null; }
}
function writeOrder(id) {
  try { if (globalThis.localStorage) globalThis.localStorage.setItem(conf.prefs.orderKey, id); } catch { /* storage blocked */ }
}

// ---------------------------------------------------------------- building with the atoms

const warned = new Set();
function warnOnce(what, e) {
  if (warned.has(what)) return;
  warned.add(what);
  console.warn(`fieldsui: ${what}`, e || "");
}

/** Call a book.js builder; a missing or failing one gives a plain element in its place (never a throw). */
function B(name, ...args) {
  const fn = book[name];
  if (typeof fn === "function") {
    try { return fn(...args); } catch (e) { warnOnce(`book.${name} failed`, e); }
  } else warnOnce(`book.${name} is missing`);
  const p = args.find((a) => a && typeof a === "object" && !(typeof Node !== "undefined" && a instanceof Node) && !Array.isArray(a)) || {};
  const words = typeof args[0] === "string" ? args[0] : p.title ?? p.label ?? p.summary ?? p.content ?? p.name ?? null;
  return ui.h("div", { "data-bk": name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`) }, words, p.children ?? null);
}

const h = (...a) => ui.h(...a);
const mask = (text) => h("span", { "data-mask": "" }, text);
const announce = (msg) => { try { if (typeof ui.announce === "function") ui.announce(msg); } catch { /* no live region */ } };

let uid = 0;
const nextId = (p) => `fu-${p}-${++uid}`;

function section(...children) {
  return h("div.bk-section", children);
}

function readyRoot(tag, attrs) {
  const root = h(tag, attrs);
  let resolve;
  root.ready = new Promise((r) => { resolve = r; });
  root.dataset.ready = "false";
  return { root, done: () => { root.dataset.ready = "true"; resolve(root); } };
}

/** The banners a page shows for the index state: not ready, did not load, stale, a newer app. */
export function statusBanners(st) {
  const out = [];
  if (!st) return out;
  if (st.status === "missing") out.push(B("banner", { state: "info", content: COPY.notReady }));
  else if (st.status === "failed") out.push(B("banner", { state: "problem", content: COPY.failed }));
  else {
    if (st.stale && conf.notes.stale) {
      const p = bangkokParts(st.asOf);
      out.push(B("banner", { state: "wait", content: fill(conf.notes.stale, { date: p ? dayWords(p.date) : "—", days: intWords(st.days ?? 0) }) }));
    }
    if (st.newer && conf.notes.newer) out.push(B("banner", { state: "info", content: conf.notes.newer }));
  }
  return out;
}

function sourcesSection(idx) {
  const items = ((idx && idx.sources) || []).filter((s) => s && s.name).map((s) => ({ text: s.name, meta: s.usedFor || "", url: s.url || null }));
  if (!items.length) return null;
  return section(B("sectionHead", { title: COPY.sources, level: 2 }), B("linkList", { items, label: COPY.sources }));
}

function attributionOf(items) {
  if (!items.length) return null;
  const parts = [];
  if (items.some((x) => x.via === "gdelt")) parts.push("Headlines found through the GDELT Project (https://www.gdeltproject.org/).");
  const pubs = [...new Set(items.map((x) => x.publisher).filter(Boolean))];
  if (pubs.length) parts.push(`Publishers: ${joinAnd(pubs)}.`);
  return parts.join(" ");
}

/** "In the news" (spec 7.4): third-party headlines, newest first, outside both sides. */
function newsSection(list, checkedAt, noteContent, level = 2) {
  const items = (Array.isArray(list) ? list : []).filter((x) => x && x.title && x.url);
  const checked = checkedAt ? bangkokParts(checkedAt) : null;
  const to = checked ? dayWords(checked.date) : "—";
  return section(
    B("sectionHead", { title: COPY.news, level }),
    B("headlineList", {
      items: items.map((x) => ({ title: x.title, publisher: x.publisher || "", date: dayWords(x.date), url: x.url })),
      note: noteContent,
      none: `No headlines found in the sources Tide Table reads in the 30 days to ${to}.`,
      attribution: attributionOf(items),
    }),
    checked ? B("note", `Headlines checked on ${dayWords(checked.date)}.`) : null,
  );
}

/** Whether the host's company action can add this company (its canAdd, else the data's addable). */
function canAddCompany(info) {
  const a = conf.actions.company;
  return !!a && typeof a === "object" && (typeof a.canAdd === "function" ? !!a.canAdd(info) : info.addable);
}

/** Whether the company is on the reader's list in info.fieldId, as the host's isOn says. */
function isOnList(info) {
  const a = conf.actions.company;
  return !!a && typeof a === "object" && typeof a.isOn === "function" && !!a.isOn(info.id, info);
}

/**
 * What the host's company action draws for one company (exported for the tests): null with no action; "host" when
 * the host builds its own; "add" (the off and on words) when the host can add it; "keep" when it cannot be added but
 * is on the reader's list there already (its main listing moved over the counter, or an upcoming listing withdrew
 * its filing): it stays on the list by the reader's choice (spec 8.8), so the on words stay and it can be taken off
 * where it is shown, and once off it cannot go back on; "note" otherwise (the host's not-addable line).
 */
export function companyActionKind(info) {
  const a = conf.actions.company;
  if (!a) return null;
  if (typeof a === "function") return "host";
  if (canAddCompany(info)) return "add";
  return isOnList(info) ? "keep" : "note";
}

/**
 * The host's action for one company in one field (info.fieldId; null on a company page with perField off). isOn and
 * onChange get the info, so a host whose lists are per field knows which list is meant.
 */
function companyAction(info, { fieldWords = false } = {}) {
  const a = conf.actions.company;
  const kind = companyActionKind(info);
  if (!kind) return null;
  if (kind === "host") {
    try { return a(info, { fieldId: info.fieldId }) || null; } catch (e) { warnOnce("actions.company failed", e); return null; }
  }
  const w = (t) => (typeof t === "function" ? t(info) : t ?? null);
  if (kind === "note") {
    const t = w(a.notAddable);
    return t ? B("note", t) : null;
  }
  const keep = kind === "keep";
  return B("toggleWords", {
    pressed: keep || isOnList(info),
    // kept on a list it can no longer join: once it is taken off, the not-addable line says why it cannot go back
    off: w(a.off), on: w(a.on), hintOff: keep ? w(a.notAddable) : w(a.hintOff), hintOn: w(a.hintOn), iconOff: "plus",
    // the accessible name says which company, and on a company page which field's list
    name: fieldWords && info.fieldId ? `${info.name}, ${fieldName(info.fieldId)}` : info.name,
    onChange: (on, el) => {
      if (keep && on) return false;
      const r = typeof a.onChange === "function" ? a.onChange(info, on, el) : undefined;
      if (keep && r !== false && el && el.bk && typeof el.bk.setDisabled === "function") el.bk.setDisabled(true);
      return r;
    },
  });
}

/**
 * The fields of a company's own page that get an action each (exported for the tests), or null for one action: with
 * a host whose lists are per field (actions.company.perField) and a company in more than one field, every field when
 * the host can add it, else only the fields whose list it is on already (so it can be taken off there).
 */
export function pageActionFields(info, fields) {
  const a = conf.actions.company;
  if (!a || typeof a !== "object" || !a.perField || !Array.isArray(fields) || fields.length < 2) return null;
  const shown = canAddCompany(info) ? fields : fields.filter((fid) => isOnList({ ...info, fieldId: fid }));
  return shown.length ? [...shown] : null;
}

/**
 * The action on a company's own page: one action for each field pageActionFields gives, each under that field's
 * name; otherwise one action, for its only field if it has one (the not-addable line when it cannot be added).
 */
function companyPageAction(info, fields) {
  const a = conf.actions.company;
  if (!a) return null;
  const per = pageActionFields(info, fields);
  if (per) {
    return h("div.bk-stack", per.map((fid) => h("div.bk-stack", { "data-fu": "field-action", "data-field": fid },
      B("note", `In ${fieldName(fid)}:`), companyAction({ ...info, fieldId: fid }, { fieldWords: true }))));
  }
  return companyAction({ ...info, fieldId: fields.length === 1 ? fields[0] : null });
}

function fieldToggle(f) {
  const a = conf.actions.field;
  if (!a) return null;
  const w = fieldToggleWords(f.name);
  if (!w.off || !w.on) return null;
  return B("toggleWords", {
    main: true, id: `fu-toggle-${f.id}`, pressed: typeof a.isOn === "function" ? !!a.isOn(f.id) : false, off: w.off, on: w.on,
    hintOff: w.hintOff, hintOn: w.hintOn,
    onChange: (on, el) => (typeof a.onChange === "function" ? a.onChange(f.id, on, el) : undefined),
  });
}

// ---------------------------------------------------------------- the Fields page

let fieldsPlace = "all";

/**
 * The Fields page (brief 4.8.2): the title and what a field is, the coverage and freshness lines, the list caveat,
 * search, the place chips, the 11 big fields A to Z, then the close-ups, then the sources. The host adds its dock.
 */
export function fieldsPage({ headingId } = {}) {
  const { root, done } = readyRoot("div.bk-stack", { "data-fu": "fields" });
  root.append(B("openingHead", {
    title: conf.labels.fieldsTitle || "Fields", scale: "page", level: 1, id: headingId,
    lines: [COPY.whatField, conf.labels.fieldsLede || null].filter(Boolean),
  }));
  const body = h("div.bk-stack", B("note", COPY.loading));
  root.append(body);
  (async () => {
    const st = await data.loadIndex();
    ui.clear(body);
    body.append(...statusBanners(st));
    if (st.status !== "ok") return;
    const idx = st.index;
    let fieldsFile = null;
    try { fieldsFile = await data.loadFields(); } catch (e) { warnOnce("fields.json did not load", e); body.append(B("banner", { state: "problem", content: COPY.failed })); }
    body.append(coverageBlock(idx));
    const tilesWrap = h("div.bk-stack");
    const drawTiles = () => {
      ui.clear(tilesWrap);
      const models = tileModels(fieldsFile, idx, { place: fieldsPlace });
      const tile = (m) => B("fieldTile", { ...m, onToggle: (on, el) => {
        const a = conf.actions.field;
        return a && typeof a.onChange === "function" ? a.onChange(m.id, on, el) : undefined;
      } });
      tilesWrap.append(
        section(B("sectionHead", { title: COPY.bigFields, level: 2 }), h("ul.bk-tiles", models.slice(0, SECTORS.length).map(tile))),
        section(B("sectionHead", { title: COPY.closeups, level: 2, intro: COPY.closeupsNote }), h("ul.bk-tiles", models.slice(SECTORS.length).map(tile))),
      );
    };
    body.append(searchBlock(idx, () => drawTiles()), tilesWrap, sourcesSection(idx) || "");
    drawTiles();
  })().catch((e) => { warnOnce("the Fields page did not draw", e); ui.clear(body); body.append(B("banner", { state: "problem", content: COPY.failed })); })
    .finally(done);
  return root;
}

function coverageBlock(idx) {
  const v = coverageVars(idx);
  const lines = [];
  if (conf.notes.coverage) lines.push(fill(conf.notes.coverage, v));
  const fresh = freshnessWords(idx.asOf);
  if (fresh) lines.push(fresh);
  lines.push(COPY.caveat);
  if (conf.notes.sorting) lines.push(conf.notes.sorting);
  if (v.hasNotSorted && conf.notes.notSorted) lines.push(fill(conf.notes.notSorted, { n: v.notSorted }));
  for (const place of (idx.coverage && idx.coverage.notCovered) || []) {
    const t = conf.notes.notCovered && conf.notes.notCovered[place];
    if (t) lines.push(t);
  }
  return h("div.bk-stack.bk-measure", lines.filter(Boolean).map((l) => B("note", l)));
}

function searchBlock(idx, onPlace) {
  const c = idx.coverage || {};
  const counts = { all: c.companies || 0, ...(c.byPlace || {}), DR: c.drs || 0 };
  const labels = (idx.rule && idx.rule.labels) || ["y5", "y4ttm"];
  const state = { query: "", place: fieldsPlace, label: "all", shown: 25 };
  const results = h("div.bk-stack", { "data-fu": "search-results" });
  const status = B("note", "", { id: nextId("search") });
  let timer = null;
  const run = async () => {
    ui.clear(results);
    const q = state.query.trim();
    if (q.length < 2) { status.textContent = ""; return; }
    const fieldsHit = matchFields(q);
    let found = [];
    try {
      const s = await data.loadSearch();
      found = filterItems(s.items, { place: state.place, label: state.label, query: q });
    } catch (e) {
      warnOnce("search.json did not load", e);
      results.append(B("banner", { state: "problem", content: COPY.failed }));
    }
    found = mergeRows(found, filterItems(upcomingRows(await loadUpcomingDoc(), null), { place: state.place, label: state.label, query: q }));
    if (fieldsHit.length) {
      results.append(h("ul.bk-list", fieldsHit.map((f) => h("li", h("a", { href: fieldHref(f.id) }, f.name), f.kind === "sector" && f.also !== f.name ? ` (also called ${f.also})` : ""))));
    }
    const shown = found.slice(0, state.shown);
    if (shown.length) results.append(h("ul.bk-list", shown.map(searchRow)));
    if (found.length > state.shown) {
      results.append(B("quietButton", { label: COPY.more, onClick: () => { state.shown += 25; run(); } }));
    }
    const words = !fieldsHit.length && !found.length ? COPY.noSearch
      : `${plural(found.length, "company matches", "companies match")}${fieldsHit.length ? `, and ${plural(fieldsHit.length, "field", "fields")}` : ""}.`;
    status.textContent = words;
    announce(words);
  };
  const box = B("searchBox", {
    id: nextId("find"), label: COPY.find, placeholder: "Name, ticker or field", hint: COPY.findHint,
    onInput: (v) => { state.query = String(v || ""); state.shown = 25; clearTimeout(timer); timer = setTimeout(run, 200); },
    onSubmit: (v) => { state.query = String(v || ""); state.shown = 25; clearTimeout(timer); run(); },
  });
  const chips = B("chipGroup", {
    id: nextId("where"), label: COPY.where, chips: placeChips(counts, { notCovered: c.notCovered || [] }), selected: state.place, single: true,
    note: (c.drs || 0) > 0 && conf.notes.drs ? conf.notes.drs : null,
    onChange: (sel) => { state.place = sel; fieldsPlace = sel; state.shown = 25; onPlace(sel); if (state.query.trim().length >= 2) run(); },
  });
  const years = B("chipGroup", {
    id: nextId("years"), label: COPY.years, chips: labelChips(labels, idx.coverage && idx.coverage.byLabel ? { all: c.companies, ...c.byLabel } : null),
    selected: "all", single: true,
    onChange: (sel) => { state.label = sel; state.shown = 25; if (state.query.trim().length >= 2) run(); },
  });
  return section(h("div.bk-stack", box, chips, years, status, results));
}

function upcomingChipEls(entry) {
  return upcomingChips(entry).map((c) => B("labelChip", c.id, { text: c.text }));
}

function searchRow(r) {
  if (r.upcoming) {
    const fields = (r.fields || []).filter(isFieldId);
    const parts = [];
    [r.ticker ? mask(r.ticker) : null, placeWords(r.place), fields.length ? joinAnd(fields.map(fieldName)) : null]
      .filter(Boolean).forEach((m, i) => { if (i) parts.push(" · "); parts.push(m); });
    return h("li.bk-stack", { "data-id": r.id, "data-upcoming": r.upcoming.key },
      h("a", { href: companyHref(r.id) }, mask(r.name)), h("p.bk-soft", parts), h("div.bk-cluster", upcomingChipEls(r.upcoming)));
  }
  const fields = (r.fields || []).filter(isFieldId);
  const meta = [r.tickers && r.tickers[0] ? mask(r.tickers[0]) : null, placeWords(r.place),
    fields.length ? joinAnd(fields.map(fieldName)) : "not sorted into a field"].filter(Boolean);
  const parts = [];
  meta.forEach((m, i) => { if (i) parts.push(" · "); parts.push(m); });
  return h("li.bk-stack", { "data-id": r.id },
    h("a", { href: companyHref(r.id) }, mask(r.name)),
    h("p.bk-soft", parts),
    B("labelChip", r.label, {}),
    r.left ? B("note", leftWords(r.left)) : null);
}

// ---------------------------------------------------------------- a field's page

/**
 * A field's page (brief 4.8.3, spec 8.2): the title with its counts, the toggle, the book spread and All facts, the
 * headlines, and the company list. company: a company id to open in place (route #/field/<id>/<companyId>).
 */
export function fieldPage(fieldId, { company = null, headingId } = {}) {
  const f = fieldById(fieldId);
  const { root, done } = readyRoot("div.bk-stack", { "data-fu": "field", "data-field": fieldId, "data-fact-surface": "" });
  if (!f) {
    root.append(B("crumb", { href: fieldsHref(), label: COPY.allFields }), B("banner", { state: "problem", content: COPY.failed }));
    done();
    return root;
  }
  const head = h("div");
  const drawHead = (e) => B("openingHead", {
    title: f.name, scale: "page", level: 1, id: headingId, lines: fieldHeadLines(f, e), after: fieldToggle(f),
    vignette: B("vignette", f.id, {}),
  });
  // built at once when the files are already loaded on this page, so a redraw keeps the heading the host focused
  const known = data.peek("fields.json");
  const knownEntry = known && known.byId ? known.byId[f.id] || null : undefined;
  head.append(drawHead(knownEntry));
  const body = h("div.bk-stack", B("note", COPY.loading));
  root.append(B("crumb", { href: fieldsHref(), label: COPY.allFields }), head, body);
  (async () => {
    const st = await data.loadIndex();
    ui.clear(body);
    body.append(...statusBanners(st));
    if (st.status !== "ok") return;
    const idx = st.index;
    let fieldsFile = null;
    try { fieldsFile = await data.loadFields(); } catch (e) { warnOnce("fields.json did not load", e); }
    const e = fieldsFile && fieldsFile.byId[f.id];
    if (knownEntry === undefined && fieldsFile) swapKeepingFocus(head, drawHead(e || null));
    if (!fieldsFile) body.append(B("banner", { state: "problem", content: COPY.failed }));
    else if (!e) body.append(B("note", COPY.emptyField));
    else {
      const masks = [f.name, f.kind === "sector" ? f.also : null].filter(Boolean);
      const card = spreadOf(e.lines);
      const every = spreadOf(e.lines, { all: true });
      body.append(section(
        B("sectionHead", { title: `${f.name}, from both sides`, level: 2 }),
        card.well.length && card.wrong.length ? B("bookSpread", { well: card.well, wrong: card.wrong, masks }) : B("note", COPY.emptyField),
        B("fold", {
          summary: `All facts about ${f.name}`,
          children: [
            every.well.length && every.wrong.length ? B("bookSpread", { well: every.well, wrong: every.wrong, masks, fixedLine: false, level: 4 }) : null,
            B("factTable", { caption: `Numbers for ${f.name}`, rows: fieldNumbersRows(e, idx) }),
          ].filter(Boolean),
        }),
      ));
      body.append(newsSection(e.headlines, e.headlinesCheckedAt,
        [`Headlines from the last 30 days that name a company in ${f.name} or the ${f.name} industry, newest first. `,
          "Tide Table does not sort them into either side."]));
    }
    const list = companyList(f.id, { open: company });
    body.append(list);
    await list.ready;
    const fresh = freshnessWords(idx.asOf);
    body.append(sourcesSection(idx) || "", fresh ? B("note", fresh) : "");
  })().catch((err) => { warnOnce("a field page did not draw", err); ui.clear(body); body.append(B("banner", { state: "problem", content: COPY.failed })); })
    .finally(done);
  return root;
}

/** The lines under a field's title: its counts by label (undefined: not loaded yet), its other name, its places. */
export function fieldHeadLines(f, e) {
  const lines = [];
  if (e !== undefined) {
    const n = e ? e.n : 0;
    const split = e ? labelSplitWords(e.byLabel) : null;
    lines.push(n && split ? `${plural(n, "company", "companies")}: ${split}` : `${plural(n, "company", "companies")}.`);
  }
  lines.push(alsoWords(f.id));
  if (e) lines.push(placeSplitWords(e.byPlace, e.drs));
  return lines.filter(Boolean);
}

/** Put a new block in place of the old one; whatever had focus inside gets it back by its id. */
function swapKeepingFocus(container, next) {
  const doc = container.ownerDocument;
  const active = doc ? doc.activeElement : null;
  const focusId = active && container.contains(active) ? active.id : null;
  ui.clear(container);
  container.append(next);
  if (focusId) {
    const el = container.querySelector(`[id="${focusId}"]`);
    if (el && typeof el.focus === "function") {
      if (!el.hasAttribute("tabindex") && /^H[1-6]$/.test(el.tagName)) el.setAttribute("tabindex", "-1");
      el.focus();
    }
  }
}

// ---------------------------------------------------------------- a field's company list

const listStates = new Map();
const PAGE = 25;

/**
 * The company list of a field (spec 7.6), for a field page or the owner's builder: search in the field, the Order
 * menu (A to Z first), the place and years chips, "Showing 25 of N …", rows that open in place, a letter strip in
 * A to Z order, and "Show 25 more". open: a company id to open at once. title: false leaves out the heading.
 */
export function companyList(fieldId, { open = null, title = true } = {}) {
  const f = fieldById(fieldId);
  const { root, done } = readyRoot("div.bk-section", { "data-fu": "company-list", "data-field": fieldId });
  const body = h("div.bk-stack", B("note", COPY.loading));
  root.append(body);
  (async () => {
    const st = await data.loadIndex();
    if (st.status !== "ok") { ui.clear(body); body.append(...statusBanners(st)); return; }
    let file;
    try { file = await data.loadField(fieldId); } catch (e) {
      warnOnce(`field-${fieldId}.json did not load`, e);
      ui.clear(body); body.append(B("banner", { state: "problem", content: COPY.failed }));
      return;
    }
    const rows = upcomingRows(await loadUpcomingDoc(), fieldId);
    if (rows.length) file = { ...file, items: mergeRows(file.items || [], rows) };
    ui.clear(body);
    drawList(body, f, file, st.index, open, title);
  })().catch((e) => { warnOnce("a company list did not draw", e); ui.clear(body); body.append(B("banner", { state: "problem", content: COPY.failed })); })
    .finally(done);
  return root;
}

function drawList(body, f, file, idx, openId, withTitle) {
  const prices = !!file.prices && !!(idx.capabilities && idx.capabilities.prices);
  const st = listStates.get(f.id) || { place: fieldsPlace, label: "all", query: "", start: 0, count: PAGE };
  st.order = validOrder(readOrder() || DEFAULT_ORDER, prices);
  listStates.set(f.id, st);
  const items = file.items;
  const counts = countItems(items);
  const labels = (idx.rule && idx.rule.labels) || ["y5", "y4ttm"];
  if (!counts.place[st.place] && st.place !== "all") st.place = "all";
  if (st.label !== "all" && !counts.label[st.label]) st.label = "all";

  if (withTitle) body.append(B("sectionHead", { title: `The ${plural(items.length, "company", "companies")}`, level: 2 }));
  if (!items.length) { body.append(B("note", COPY.emptyField)); return; }

  const line = B("note", "");
  const head = h("div");
  const ul = h("ul.bk-co-list");
  const after = h("div.bk-cluster");
  let view = [];
  let jumpLetter = null;
  let announceTimer = null;
  const standalone = h("div");

  const letters = B("letterStrip", { letters: lettersOf(items), onJump: (letter) => jump(letter) });

  const action = (r) => companyAction(companyInfo({ ...r, fields: undefined }, f.id));
  const row = (r) => (r.upcoming ? upcomingRow(r, f.id, { open: r.id === openId, facts: rowFacts(r, st.order) }) : B("companyRow", {
    id: r.id, name: r.name, place: placeWords(r.place), ticker: r.ticker ?? null,
    venue: venueWords(r.venue, r.ticker), label: r.label, facts: rowFacts(r, st.order), action: action(r),
    open: r.id === openId, more: () => companyDetail(r.id, { fieldId: f.id, compact: true }),
    onToggle: (isOpen) => { if (typeof conf.actions.open === "function") conf.actions.open(f.id, isOpen ? r.id : null); },
  }));

  let viewLetters = "";
  const recompute = () => {
    view = sortItems(filterItems(items, st), st.order);
    // the strip shows only the letters of what is listed; rebuilt only when that changes
    const ls = st.order === DEFAULT_ORDER ? lettersOf(view) : [];
    if (ls.join() !== viewLetters && letters && letters.bk && typeof letters.bk.setLetters === "function") letters.bk.setLetters(ls);
    viewLetters = ls.join();
  };
  const drawHead = () => { ui.clear(head); head.append(B("companyListHead", { columns: ["Company", ...factColumns(st.order), ""] })); };
  // rows go in two chunks a task apart, so a slow phone never holds one long task for a whole page of rows.
  // appendRows returns the first row it added (it is in the list at once). flushRows puts in the rows still waiting,
  // so "Show 25 more" pressed before they are in adds its rows after them, never in their place.
  let drawToken = 0;
  let flushRows = null;
  const appendRows = (list, then) => {
    const token = ++drawToken;
    const CHUNK = 12;
    const first = list.slice(0, CHUNK).map(row);
    ul.append(...first);
    let i = CHUNK;
    let finished = false;
    const finish = () => { if (finished) return; finished = true; if (token === drawToken) flushRows = null; if (then) then(); };
    const rest = () => {
      if (token !== drawToken || finished) return;
      if (i >= list.length) { finish(); return; }
      ul.append(...list.slice(i, i + CHUNK).map(row));
      i += CHUNK;
      setTimeout(rest, 0);
    };
    if (list.length > CHUNK) {
      flushRows = () => {
        if (token !== drawToken || finished) return;
        if (i < list.length) ul.append(...list.slice(i).map(row));
        i = list.length;
        finish();
      };
      setTimeout(rest, 0);
    } else { flushRows = null; finish(); }
    return first[0] || null;
  };
  const sayLine = () => {
    line.textContent = showingWords({ shown: Math.min(st.count, Math.max(0, view.length - st.start)), total: view.length, order: st.order,
      from: st.start > 0 ? jumpLetter : null });
  };
  // the line is a plain note, not a live region: after a change the reader asked for, it is said once the list has
  // settled (one timer, so quick presses say only the last count)
  const sayLater = () => { clearTimeout(announceTimer); announceTimer = setTimeout(() => announce(line.textContent), 500); };
  // a row's name button (the first button in it); false when there is none to take focus
  const focusIn = (el) => {
    const b = el && typeof el.querySelector === "function" ? el.querySelector(".bk-co-name") || el.querySelector("button") : null;
    if (!b || typeof b.focus !== "function") return false;
    b.focus();
    return true;
  };
  const drawRows = ({ say = false, then = null } = {}) => {
    ui.clear(ul); ui.clear(after);
    appendRows(view.slice(st.start, st.start + st.count), then);
    sayLine();
    if (st.start + st.count < view.length) {
      const more = B("quietButton", { label: COPY.more, onClick: () => {
        if (flushRows) flushRows();
        const add = view.slice(st.start + st.count, st.start + st.count + PAGE);
        st.count += PAGE;
        const firstNew = add.length ? appendRows(add) : null;
        sayLine();
        // focus moves to the first row just added, as a letter jump does: a screen reader meets the new rows, and
        // focus is not lost when the last press takes this button away
        const moved = focusIn(firstNew);
        if (st.start + st.count >= view.length) {
          more.remove();
          if (!moved) focusIn(after);
        }
        sayLater();
      } });
      after.append(more);
    }
    if (st.start > 0) after.append(B("textButton", { label: COPY.fromStart, onClick: () => { st.start = 0; st.count = PAGE; jumpLetter = null; drawRows({ say: true }); } }));
    if (letters && letters.bk && typeof letters.bk.show === "function") letters.bk.show(st.order === DEFAULT_ORDER && view.length > PAGE);
    if (say) sayLater();
  };
  const jump = (letter) => {
    const i = firstOfLetter(view, letter);
    if (i < 0) return;
    st.start = i; st.count = PAGE; jumpLetter = letter;
    drawRows({ say: true });
    focusIn(ul);
  };

  recompute();
  if (openId && items.some((r) => r.id === openId) && !view.some((r) => r.id === openId)) {
    Object.assign(st, { place: "all", label: "all", query: "", start: 0, count: PAGE });
    recompute();
  }
  if (openId) {
    const i = view.findIndex((r) => r.id === openId);
    if (i >= 0 && (i < st.start || i >= st.start + st.count)) {
      st.start = Math.floor(i / PAGE) * PAGE; st.count = PAGE;
      jumpLetter = st.start ? letterOf(view[st.start].name) : null;
    }
    if (i < 0) standalone.append(companyDetail(openId, { fieldId: f.id, standalone: true }));
  }

  let qTimer = null;
  const controls = h("div.bk-stack",
    h("div.bk-cluster",
      B("searchBox", { id: nextId("cq"), label: `Find a company in ${f.name}`, placeholder: "Name or ticker", value: st.query,
        onInput: (v) => { clearTimeout(qTimer); qTimer = setTimeout(() => { st.query = String(v || ""); st.start = 0; st.count = PAGE; jumpLetter = null; recompute(); drawRows({ say: true }); }, 150); } }),
      B("orderMenu", { id: nextId("order"), label: COPY.order, options: orderOptions(prices), value: st.order,
        onChange: (v) => { st.order = validOrder(v, prices); writeOrder(st.order); st.start = 0; st.count = PAGE; jumpLetter = null; recompute(); drawHead(); drawRows({ say: true }); } })),
    B("chipGroup", { id: nextId("cwhere"), label: COPY.where, chips: placeChips(counts.place), selected: st.place, single: true,
      onChange: (sel) => { st.place = sel; st.start = 0; st.count = PAGE; jumpLetter = null; recompute(); drawRows({ say: true }); } }),
    B("chipGroup", { id: nextId("cyears"), label: COPY.years, chips: labelChips(labels, counts.label, { hideEmpty: true }), selected: st.label, single: true,
      onChange: (sel) => { st.label = sel; st.start = 0; st.count = PAGE; jumpLetter = null; recompute(); drawRows({ say: true }); } }),
  );

  drawHead();
  body.append(standalone, controls, line, letters, head, ul, after);
  drawRows({ then: () => {
    if (!openId) return;
    const el = ul.querySelector(`[data-id="${openId}"]`);
    if (el && typeof el.scrollIntoView === "function") { try { el.scrollIntoView({ block: "start" }); } catch { /* old browsers */ } }
  } });
}

/** An upcoming listing's row: a companyRow whose label chip is replaced by its chips, with upcomingNoteWords as its
 *  note (the reported timing while it waits, its status once listed or withdrawn); opening it shows upcomingDetail.
 *  Never pinned, never highlighted (addendum D). */
function upcomingRow(r, fieldId, { open = false, facts = [] } = {}) {
  const e = r.upcoming;
  const el = B("companyRow", {
    id: r.id, name: r.name, place: placeWords(r.place), ticker: r.ticker ?? null, venue: venueWords(r.venue, r.ticker),
    label: "na", facts, action: companyAction(upcomingInfo(e, fieldId)), note: upcomingNoteWords(e), open,
    more: () => upcomingDetail(e, { compact: true }),
    onToggle: (isOpen) => { if (typeof conf.actions.open === "function") conf.actions.open(fieldId, isOpen ? r.id : null); },
  });
  if (el && el.dataset) el.dataset.upcoming = e.key;
  const chip = el && typeof el.querySelector === "function" ? el.querySelector(".bk-label-chip") : null;
  if (chip) chip.replaceWith(...upcomingChipEls(e));
  return el;
}

/** An upcoming listing's facts: where it stands, the reported timing, both sides, where the timing comes from, the
 *  reports filed and when it was last checked. A fact surface, like a company's. */
export function upcomingDetail(entry, { compact = false } = {}) {
  const e = entry || {};
  const level = compact ? 4 : 3;
  const headLevel = compact ? 3 : 2;
  const masks = [e.name, e.short].filter(Boolean);
  const root = h("div.bk-stack", { "data-fu": "upcoming-detail", "data-id": String(e.id ?? ""), "data-fact-surface": "" });
  // in a list row the note already says what upcomingNoteWords says (the timing while it waits, its status after);
  // on its own page the timing comes after the status line, only while it waits
  const timing = upcomingTimingShown(e);
  if (!compact || timing) root.append(B("note", upcomingStatusWords(e), { tone: "ink" }));
  if (!compact && timing) root.append(B("note", upcomingTimingWords(e)));
  const card = spreadOf(e.facts);
  if (card.well.length && card.wrong.length) root.append(B("bookSpread", { well: card.well, wrong: card.wrong, masks, level, compact }));
  const est = timing && e.estimate && Array.isArray(e.estimate.sources) ? e.estimate.sources : [];
  if (est.length) {
    root.append(section(B("sectionHead", { title: UPCOMING_COPY.timingSources, level: headLevel }),
      B("linkList", { label: UPCOMING_COPY.timingSources, items: est.filter((x) => x && x.url).map((x) => ({ text: x.label, meta: dayWords(x.date), url: x.url })) })));
  }
  const filings = (Array.isArray(e.filings) ? e.filings : []).filter((x) => x && x.form && x.url).slice(0, 5);
  const items = filings.map((x) => ({ text: `${x.form} filed with the SEC`, meta: dayWords(x.date), url: x.url }));
  if (e.links && e.links.edgar) items.push({ text: UPCOMING_COPY.edgar, meta: "", url: e.links.edgar });
  if (items.length) root.append(section(B("sectionHead", { title: COPY.filings, level: headLevel }), B("linkList", { label: COPY.filings, items })));
  const checked = upcomingCheckedWords(e);
  if (checked) root.append(B("note", checked));
  return root;
}

/** An upcoming listing on its own page (#/company/<id>): its name, place, chips and action, its fields, its facts. */
function drawUpcomingPage(body, e, headingId, root) {
  const info = upcomingInfo(e);
  const fields = (e.fields || []).filter(isFieldId);
  body.append(B("openingHead", {
    title: mask(e.name), scale: "page", level: 1, id: headingId, lines: [placeWords(e.place || "US")],
    after: h("div.bk-stack", h("div.bk-cluster", upcomingChipEls(e)), companyPageAction(info, fields)),
  }));
  focusIfIdle(root, headingId);
  if (fields.length) {
    const links = [];
    fields.forEach((id, i) => { if (i) links.push(", "); links.push(h("a", { href: companyHref(e.id, id) }, fieldName(id))); });
    body.append(B("note", [`${COPY.inFields} `, ...links, "."]));
  }
  body.append(upcomingDetail(e));
}

// ---------------------------------------------------------------- a company's facts

/**
 * One company's facts: its own spread (or the na explainer), All facts with the numbers table, the left and
 * listing lines, headlines and the reports filed. Used inside an opened row (compact) and on the company page.
 * standalone: adds a heading with the name (a company opened in a field's route that is no longer in its list).
 */
export function companyDetail(companyId, { fieldId = null, compact = false, standalone = false, record = null } = {}) {
  const { root, done } = readyRoot("div.bk-stack", { "data-fu": "company-detail", "data-id": companyId, "data-fact-surface": "" });
  const body = h("div.bk-stack", B("note", COPY.loading));
  root.append(body);
  (async () => {
    const rec = record || await data.loadCompany(companyId);
    ui.clear(body);
    if (!rec) { body.append(B("note", COPY.noCompany)); return; }
    drawDetail(body, { id: companyId, ...rec }, { fieldId, compact, standalone });
  })().catch((e) => { warnOnce("a company's facts did not load", e); ui.clear(body); body.append(B("banner", { state: "problem", content: COPY.failed })); })
    .finally(done);
  return root;
}

function drawDetail(body, rec, { fieldId, compact, standalone }) {
  const level = compact ? 4 : 3; // the spread's side headings
  const headLevel = compact ? 3 : 2; // section headings (sectionHead draws h2 or h3)
  const masks = [rec.name];
  if (standalone) {
    body.append(B("sectionHead", { title: mask(rec.name), level: 3 }), B("labelChip", rec.rule ? rec.rule.label : "y5", {}));
    const act = companyAction(companyInfo(rec, fieldId));
    if (act) body.append(act);
  }
  if (rec.left) body.append(B("note", leftWords(rec.left), { tone: "ink" }));
  if (rec.delisted && conf.notes.delisted) body.append(B("note", fill(conf.notes.delisted, { name: mask(rec.name), date: dayWords(rec.delisted) }), { tone: "ink" }));
  const na = rec.rule && rec.rule.label === "na";
  if (na || !rec.lines) {
    body.append(B("note", COPY.naExplainer, { tone: "ink" }));
  } else {
    const card = spreadOf(rec.lines);
    const every = spreadOf(rec.lines, { all: true });
    body.append(B("bookSpread", { well: card.well, wrong: card.wrong, masks, level, compact }));
    body.append(B("fold", {
      summary: ["All facts about ", mask(rec.name)],
      children: [
        B("bookSpread", { well: every.well, wrong: every.wrong, masks, fixedLine: false, level: 4, compact: true }),
        B("factTable", { caption: "Every fact, with its date and source", rows: numbersRows(rec) }),
      ],
    }));
  }
  const listings = (rec.listings || []).filter((l) => l && l.ticker);
  if (listings.length) {
    const parts = ["Trades as "];
    listings.forEach((l, i) => {
      if (i) parts.push(i === listings.length - 1 ? " and " : ", ");
      parts.push(mask(l.ticker), ` (${venueWords(l.venue, l.ticker) || l.venue})`);
    });
    parts.push(".");
    body.append(B("note", parts));
  }
  if (Array.isArray(rec.drs) && rec.drs.length && conf.notes.drsLine) {
    body.append(B("note", fill(conf.notes.drsLine, { list: rec.drs.map((d) => d.dr).filter(Boolean).join(", ") })));
  }
  body.append(newsSection(rec.headlines, rec.headlinesCheckedAt,
    ["Headlines from the last 30 days that name ", mask(rec.name), ", newest first. Tide Table does not sort them into either side."], headLevel));
  const filings = (rec.filings || []).filter((x) => x && x.form && x.url).slice(0, 3);
  if (filings.length) {
    body.append(section(B("sectionHead", { title: COPY.filings, level: headLevel }),
      B("linkList", { label: COPY.filings, items: filings.map((x) => ({ text: `${x.form} filed with the SEC`, meta: dayWords(x.date), url: x.url })) })));
  }
}

// ---------------------------------------------------------------- a company's own page

/** The heading arrives after the facts load: give it the focus the host's route could not, unless the reader has
 *  already moved on. */
function focusIfIdle(root, id) {
  const doc = root.ownerDocument;
  if (!id || !doc || !root.isConnected) return;
  const active = doc.activeElement;
  if (active && active !== doc.body && active !== root && !root.contains(active)) return;
  if (active && active !== root && root.contains(active) && active.id !== id) return;
  const el = root.querySelector(`[id="${id}"]`);
  if (!el || typeof el.focus !== "function") return;
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  try { el.focus({ preventScroll: true }); } catch { el.focus(); }
}

/** A company on its own (from search, route #/company/<id>): title, place, label, action, its fields, its facts. */
export function companyPage(companyId, { headingId } = {}) {
  const { root, done } = readyRoot("div.bk-stack", { "data-fu": "company", "data-id": companyId, "data-fact-surface": "" });
  const body = h("div.bk-stack", B("note", COPY.loading));
  root.append(B("crumb", { href: fieldsHref(), label: COPY.allFields }), body);
  (async () => {
    const st = await data.loadIndex();
    ui.clear(body);
    body.append(...statusBanners(st));
    if (st.status !== "ok") return;
    const up = await loadUpcomingDoc();
    const entry = up ? up.entries.find((x) => x && x.id === companyId) : null;
    if (entry) { drawUpcomingPage(body, entry, headingId, root); return; }
    const rec = await data.loadCompany(companyId);
    if (!rec) { body.append(B("note", COPY.noCompany)); return; }
    const info = companyInfo({ id: companyId, ...rec });
    const fields = (rec.fields || []).filter(isFieldId);
    const place = rec.country || placeWords(rec.place);
    body.append(B("openingHead", {
      title: mask(rec.name), scale: "page", level: 1, id: headingId,
      lines: [place, fields.length ? null : COPY.notSortedOne].filter(Boolean),
      after: h("div.bk-stack", B("labelChip", rec.rule ? rec.rule.label : "y5", {}), companyPageAction(info, fields)),
    }));
    focusIfIdle(root, headingId);
    if (fields.length) {
      const links = [];
      fields.forEach((id, i) => { if (i) links.push(", "); links.push(h("a", { href: companyHref(companyId, id) }, fieldName(id))); });
      body.append(B("note", [`${COPY.inFields} `, ...links, "."]));
    }
    body.append(companyDetail(companyId, { record: rec }));
  })().catch((e) => { warnOnce("a company page did not draw", e); ui.clear(body); body.append(B("banner", { state: "problem", content: COPY.failed })); })
    .finally(done);
  return root;
}
