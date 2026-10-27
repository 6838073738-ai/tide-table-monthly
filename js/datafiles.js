// The data loader shared by both apps (spec 8.8, 4.12, Appendix B.1). It reads one set of fact files from a base
// the host page passes in, checks each file's schema, licence and shape, and memoises every file for the page
// load. It holds no path of either app: the host calls configure({base}) first. Pure ES module: nothing runs at
// import, and every network call goes through the fetch the host gives (or the browser's own).

import { isFieldId } from "./fields-catalog.js?v=2.0.0";

/** File names a set may hold (spec 4.13); anything else is never asked for. */
export const NAME_RE = /^(index|fields|search|risk|field-[a-z]{3,16}|co-[0-9a-f]{2})\.json$/;
/** A company id of either set (s, j, l in both; y only in the personal set). */
export const COMPANY_ID_RE = /^[sjly][0-9A-Z]{1,19}$/;
/** Each file kind's schema name and the one major this app reads (Appendix B.1). */
export const SCHEMAS = Object.freeze({
  index: ["tt-index", 2], fields: ["tt-fields", 2], field: ["tt-field", 2], companies: ["tt-companies", 2],
  search: ["tt-search", 2], risk: ["tt-risk", 1],
});
/** The capabilities a set can switch on; all are false until an index has loaded. */
export const CAPABILITY_KEYS = Object.freeze(["universe", "profits", "fx", "news", "prices", "risk"]);
/** Facts older than this many days get the stale banner (spec 4.11, 4.13). */
export const STALE_DAYS = 3;
/** Columns every field file has (Appendix B.1); the personal set adds the price columns. */
export const FIELD_COLS = Object.freeze(["id", "name", "place", "ticker", "venue", "label", "addable", "profitThb",
  "profitFy", "profitPerYear", "margin", "salesThb", "dr", "otc"]);
export const PRICE_COLS = Object.freeze(["chg1y", "chg5y", "swings", "deepest", "sizeThb"]);
export const SEARCH_COLS = Object.freeze(["id", "name", "tickers", "fields", "place", "label", "left"]);

const DAY_MS = 86400000;

/** A refusal with a kind the pages can tell apart: missing, network, bad, schema or licence. */
export class DataError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "DataError";
    this.kind = kind;
  }
}

const cfg = {
  base: null,
  version: "0.0.0",
  licences: ["open"],
  fetch: null,
  now: () => Date.now(),
  flagHeaders: null,
};
const memo = new Map();
const done = new Map();
let indexState = null;

/**
 * Set where the files come from and what this app accepts. Call it once, before any load.
 *   base        "<folder>/" the files sit in (each host passes its own); required
 *   version     this app's version, checked against index.app.minVersion
 *   licences    the licences this app may read; the friends' app passes ["open"] only (the default)
 *   fetch       a fetch function (tests pass their own); default the browser's
 *   now         () => epoch ms, for the stale check (tests pin it)
 *   flagHeaders {stale, offline}: names of reply headers a host's server may set on the index reply
 * Changing the base or the licences forgets every file loaded so far.
 */
export function configure(opts = {}) {
  const next = { ...cfg };
  if (opts.base !== undefined) {
    if (typeof opts.base !== "string" || !opts.base) throw new TypeError("configure: base must be a non-empty string");
    next.base = opts.base.endsWith("/") ? opts.base : opts.base + "/";
  }
  if (opts.version !== undefined) next.version = String(opts.version);
  if (opts.licences !== undefined) {
    if (!Array.isArray(opts.licences) || !opts.licences.every((l) => l === "open" || l === "personal")) {
      throw new TypeError("configure: licences must be a list of \"open\" and \"personal\"");
    }
    next.licences = [...opts.licences];
  }
  if (opts.fetch !== undefined) next.fetch = opts.fetch;
  if (opts.now !== undefined) next.now = opts.now;
  if (opts.flagHeaders !== undefined) next.flagHeaders = opts.flagHeaders;
  const changed = next.base !== cfg.base || next.licences.join() !== cfg.licences.join() || next.fetch !== cfg.fetch;
  Object.assign(cfg, next);
  if (changed) reset();
}

/** Forget every file loaded so far (a host that wants to ask again, and the tests). */
export function reset() {
  memo.clear();
  done.clear();
  indexState = null;
}

// ---------------------------------------------------------------- fetching

function fetcher() {
  if (cfg.fetch) return cfg.fetch;
  if (typeof fetch === "function") return fetch;
  throw new DataError("network", "no fetch available");
}

async function getJson(name, { allowMissing = false } = {}) {
  if (!NAME_RE.test(name)) throw new DataError("bad", `not a data file name: ${name}`);
  if (!cfg.base) throw new DataError("bad", "datafiles.configure({base}) was not called");
  let res;
  try {
    res = await fetcher()(cfg.base + name, { cache: "no-cache" });
  } catch (e) {
    throw new DataError("network", `${name}: ${e && e.message ? e.message : "could not be fetched"}`);
  }
  if (res.status === 404) {
    if (allowMissing) return { json: null, res };
    throw new DataError("missing", `${name}: not found`);
  }
  if (!res.ok) throw new DataError("network", `${name}: HTTP ${res.status}`);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new DataError("bad", `${name}: not valid JSON`);
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new DataError("bad", `${name}: not a JSON object`);
  return { json, res };
}

/**
 * One promise per name for the page load; the resolved value is also kept for peek(). A file that could not be
 * fetched (a network failure) is forgotten, so the next ask tries again; any other refusal stays for the page load.
 */
function once(name, make) {
  if (!memo.has(name)) {
    const p = make().then((v) => {
      if (memo.get(name) === p) done.set(name, v);
      if (v && v.status === "failed" && v.problem && v.problem.kind === "network" && memo.get(name) === p) memo.delete(name);
      return v;
    });
    p.catch((e) => { if (e && e.kind === "network" && memo.get(name) === p) memo.delete(name); });
    memo.set(name, p);
  }
  return memo.get(name);
}

/** A file already loaded on this page, or undefined (lets a page redraw without waiting). */
export function peek(name) {
  return done.get(name);
}

// ---------------------------------------------------------------- checks

function schemaMajor(file, kind) {
  const [want, major] = SCHEMAS[kind];
  const m = typeof file.schema === "string" ? /^([a-z-]+)\/(\d+)$/.exec(file.schema) : null;
  if (!m || m[1] !== want) throw new DataError("schema", `expected ${want}, found ${String(file.schema)}`);
  if (Number(m[2]) !== major) throw new DataError("schema", `${want} major ${m[2]} is not ${major}`);
}

function checkLicence(file, name) {
  if (!cfg.licences.includes(file.licence)) {
    throw new DataError("licence", `${name}: licence ${String(file.licence)} is not read by this app`);
  }
  const idx = indexState && indexState.index;
  if (idx && file.licence !== idx.licence) {
    throw new DataError("licence", `${name}: licence ${file.licence} differs from the index's ${idx.licence}`);
  }
}

function isObj(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

/** Compare "2.0.0"-style versions: negative when a < b. Missing parts count as 0; junk counts as 0. */
export function compareVersions(a, b) {
  const pa = String(a ?? "").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b ?? "").split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

const BKK_MS = 7 * 3600000; // Bangkok is UTC+7 all year

function bkkDayNumber(ms) {
  return Math.floor((ms + BKK_MS) / DAY_MS);
}

/**
 * How old a set's asOf is: {days, stale}. days counts Bangkok calendar days between the build and now (a set built
 * on Fri 23 Oct is 4 days old on Tue 27 Oct); stale is true when more than STALE_DAYS x 24 hours have passed.
 */
export function ageOf(asOf, nowMs) {
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return { days: null, stale: false };
  return { days: Math.max(0, bkkDayNumber(nowMs) - bkkDayNumber(t)), stale: nowMs - t > STALE_DAYS * DAY_MS };
}

function readFlag(res, header) {
  if (!header || !res || !res.headers || typeof res.headers.get !== "function") return false;
  const v = String(res.headers.get(header) || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

// ---------------------------------------------------------------- the index

/**
 * Load index.json once. Never rejects; resolves to the state the pages need:
 *   {status: "ok", index, asOf, days, stale, newer, flags: {stale, offline}}
 *   {status: "missing"}            no index in this set yet (facts not ready; the capabilities stay off)
 *   {status: "failed", problem}    it could not be read, or this app cannot read it (schema, licence)
 * newer: index.app.minVersion is above this app's version (the page says a newer app is out and keeps showing
 * what it can read).
 */
export function loadIndex() {
  return once("index.json", async () => {
    try {
      const { json, res } = await getJson("index.json", { allowMissing: true });
      if (json === null) return (indexState = { status: "missing" });
      schemaMajor(json, "index");
      if (!cfg.licences.includes(json.licence)) {
        throw new DataError("licence", `index.json: licence ${String(json.licence)} is not read by this app`);
      }
      if (!isObj(json.capabilities) || !isObj(json.files) || !isObj(json.coverage)) {
        throw new DataError("bad", "index.json: capabilities, files or coverage missing");
      }
      const age = ageOf(json.asOf, cfg.now());
      const flags = { stale: readFlag(res, cfg.flagHeaders && cfg.flagHeaders.stale),
                      offline: readFlag(res, cfg.flagHeaders && cfg.flagHeaders.offline) };
      const minV = isObj(json.app) ? json.app.minVersion : null;
      return (indexState = {
        status: "ok", index: json, asOf: json.asOf, days: age.days, stale: age.stale || flags.stale,
        newer: !!minV && compareVersions(cfg.version, minV) < 0, flags,
      });
    } catch (e) {
      return (indexState = { status: "failed", problem: e instanceof DataError ? e : new DataError("bad", String(e)) });
    }
  });
}

/** The index state once loadIndex() has settled, else null. */
export function currentIndex() {
  return indexState;
}

/** {universe, profits, fx, news, prices, risk}: all false until an index has loaded, or when it is missing. */
export function capabilities() {
  const caps = indexState && indexState.status === "ok" ? indexState.index.capabilities : null;
  return Object.fromEntries(CAPABILITY_KEYS.map((k) => [k, !!(caps && caps[k] === true)]));
}

async function needIndex() {
  const st = await loadIndex();
  if (st.status === "ok") return st.index;
  if (st.status === "missing") throw new DataError("missing", "the facts are not ready yet");
  throw st.problem;
}

// ---------------------------------------------------------------- the other files

/** fields.json: per field counts, lines, numbers and headlines, in catalogue order. */
export function loadFields() {
  return once("fields.json", async () => {
    const idx = await needIndex();
    const { json } = await getJson(idx.files.fields || "fields.json");
    schemaMajor(json, "fields");
    checkLicence(json, "fields.json");
    if (!Array.isArray(json.fields)) throw new DataError("bad", "fields.json: no fields list");
    const byId = {};
    for (const f of json.fields) if (isObj(f) && isFieldId(f.id)) byId[f.id] = f;
    return { ...json, byId };
  });
}

/**
 * One field's rows, A to Z by name as the file holds them. Resolves to the file plus items (each row as an object
 * keyed by the file's columns) and prices (true when the price columns are there). A field the index does not
 * list has no companies and resolves to an empty field without a fetch.
 */
export function loadField(id) {
  if (!isFieldId(id)) return Promise.reject(new DataError("bad", `not a field id: ${String(id)}`));
  return once(`field-${id}.json`, async () => {
    const idx = await needIndex();
    const entry = idx.files.field && idx.files.field[id];
    if (!entry) return { field: id, cols: [...FIELD_COLS], rows: [], items: [], prices: false, empty: true };
    const name = `field-${id}.json`;
    const { json } = await getJson(name);
    schemaMajor(json, "field");
    checkLicence(json, name);
    if (json.field !== id) throw new DataError("bad", `${name}: holds field ${String(json.field)}`);
    if (!Array.isArray(json.cols) || !FIELD_COLS.every((c) => json.cols.includes(c)) || !Array.isArray(json.rows)) {
      throw new DataError("bad", `${name}: columns or rows missing`);
    }
    const items = json.rows.map((r) => rowObject(json.cols, r));
    return { ...json, items, prices: PRICE_COLS.every((c) => json.cols.includes(c)) };
  });
}

/** A row array as an object keyed by its file's columns. */
export function rowObject(cols, row) {
  const o = {};
  cols.forEach((c, i) => { o[c] = Array.isArray(row) && i < row.length ? row[i] : null; });
  return o;
}

/** One shard of company records ("co-<xx>.json"). A shard with no companies is not written: it resolves empty. */
export function loadShard(xx) {
  if (typeof xx !== "string" || !/^[0-9a-f]{2}$/.test(xx)) return Promise.reject(new DataError("bad", `not a shard: ${String(xx)}`));
  const name = `co-${xx}.json`;
  return once(name, async () => {
    await needIndex();
    const { json } = await getJson(name, { allowMissing: true });
    if (json === null) return { shard: xx, companies: {}, empty: true };
    schemaMajor(json, "companies");
    checkLicence(json, name);
    if (json.shard !== xx || !isObj(json.companies)) throw new DataError("bad", `${name}: not shard ${xx}`);
    return json;
  });
}

/** One company's record from its shard, or null when the set has no such company. */
export async function loadCompany(id) {
  if (typeof id !== "string" || !COMPANY_ID_RE.test(id)) throw new DataError("bad", `not a company id: ${String(id)}`);
  const shard = await loadShard(shardOf(id));
  const rec = shard.companies[id];
  return isObj(rec) ? rec : null;
}

/** search.json: every listed company (and those that left in the last 400 days), A to Z, as items. */
export function loadSearch() {
  return once("search.json", async () => {
    const idx = await needIndex();
    const { json } = await getJson(idx.files.search || "search.json");
    schemaMajor(json, "search");
    checkLicence(json, "search.json");
    if (!Array.isArray(json.cols) || !SEARCH_COLS.every((c) => json.cols.includes(c)) || !Array.isArray(json.rows)) {
      throw new DataError("bad", "search.json: columns or rows missing");
    }
    return { ...json, items: json.rows.map((r) => rowObject(json.cols, r)) };
  });
}

/** risk.json (the personal set only): null when the set has no risk capability or no risk file. */
export function loadRisk() {
  return once("risk.json", async () => {
    const idx = await needIndex();
    if (!(idx.capabilities && idx.capabilities.risk === true) || !idx.files.risk) return null;
    const { json } = await getJson(idx.files.risk);
    schemaMajor(json, "risk");
    checkLicence(json, "risk.json");
    if (!isObj(json.vwra) || !isObj(json.fields)) throw new DataError("bad", "risk.json: vwra or fields missing");
    return json;
  });
}

// ---------------------------------------------------------------- shards

/** FNV-1a 32 over the UTF-16 code units of a string (as the friends' store hashes text), as an unsigned number. */
export function fnv1a32(s) {
  const text = String(s);
  let x = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    x ^= text.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x >>> 0;
}

/** The shard a company id lives in: its FNV-1a 32 mod 256 as 2 lower-case hex digits (spec 4.12). */
export function shardOf(id) {
  return (fnv1a32(id) % 256).toString(16).padStart(2, "0");
}
