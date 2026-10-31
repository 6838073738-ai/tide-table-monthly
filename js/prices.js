// Prices for the friends' app. Crypto (bitcoin, ether, solana) comes from CoinGecko every two minutes
// while the page is visible, and only for a plan that buys coins in a month the friend has joined (spec
// 8.9: a friend whose months buy no coins, such as one with only field months, never asks CoinGecko); the US
// dollar to Thai baht rate comes from Frankfurter once a day. Stocks and London funds have no live source:
// the friend types the price their broker's app shows (kept in the store, see core.js priceInfo). Every
// request URL is fixed apart from the plan's own coin ids, so nothing the friend typed (amounts, holdings)
// ever leaves the browser. ?prices=off turns the network off (offline QA); the plan's own rate is then used.
//
// Tide Table 2.2 (docs/tt2/ADDENDUM-2026-10-27c.md D.1, D.4): the growth tracker values a coin order at the coin's US
// dollar price on its order date, from CoinGecko's history route (/coins/{id}/history?date=YYYY-MM-DD: a snapshot at
// 00:00 UTC that day, served from 00:35 UTC; keyless use is rate-limited per IP, and every request counts, errors
// included; checked in CoinGecko's API docs on 28 Oct 2026). The page asks for every coin of the plan on every order
// date of the plan that has come, the same days for every friend whose months buy a coin (tracker.js), and only once
// that day's price is served. It asks once per coin and date, one request at a time, at most five a minute, only
// while the page is visible, and waits longer after a 429, a server error or no network; each answer (a price, or none
// for that day) is kept in this browser (HISTORY_CACHE), so it is never asked again. Keyless use reaches back 365
// days: an older day is refused (HTTP 401, error_code 10012; checked on 29 Oct 2026, when 365 days back answered and
// 366 did not). Such a day is never asked: it reads as a day with no price, and a day CoinGecko refuses (400, 401 or
// 404) is kept as one, so the days after it are still asked (review finding M3). The URL holds only the coin's fixed
// id and the date: nothing the friend typed.

const CG_URL = "https://api.coingecko.com/api/v3/simple/price";
const FX_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=THB";
export const CRYPTO_EVERY_S = 120;
const MAX_WAIT_S = 1800;
const TIMEOUT_MS = 15000;
const CRYPTO_CACHE = "ttm:prices:crypto";
const FX_CACHE = "ttm:fx";
// 2.2: a coin's price on a day, from CoinGecko's history route.
const CG_HISTORY = "https://api.coingecko.com/api/v3/coins/";
export const HISTORY_CACHE = "ttm:prices:history";
/** How the history requests are paced: one every gapMs (at most five a minute), a 429, a server error or no network
 *  waits backoffMs, doubling up to MAX_WAIT_S, and a day's price is asked for only from readyMs after 00:00 UTC that day
 *  (it is served from 00:35 UTC) and only while it is at most windowDays (UTC days) before today, as keyless use is
 *  served. Tests may shorten the waits. */
export const HISTORY = { gapMs: 12000, backoffMs: 60000, readyMs: 40 * 60000, windowDays: 365 };
/** CoinGecko refuses that day itself (an old day: 401 with error_code 10012; a bad or unknown one: 400, 404): kept as a
 *  day with no price, like an answer without one. */
const REFUSED = new Set([400, 401, 404]);
const DAY_MS = 86400000;
/** At most this many coin days are kept in the cache (three coins on twelve order dates is 36). */
const HISTORY_MAX = 240;
/** A day that answered with no price is asked once more, 12 h later, while it is within two days of that day (a
 *  snapshot may be filled late); after that, never. */
const MISS_RETRY_MS = 12 * 3600000;
const MISS_FINAL_MS = 2 * 86400000;
const COIN_ID = /^[a-z0-9-]{1,40}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const SOURCES = {
  crypto: { text: "Crypto prices by CoinGecko", href: "https://www.coingecko.com/" },
  // Frankfurter rebases the ECB's euro reference rates to give dollars to baht. The ECB's terms ask that a
  // modified figure says so, and this label sits next to every rate the app shows (footer, Settings, amounts).
  fx: { text: "Exchange rate: calculated from European Central Bank euro reference rates, via Frankfurter", href: "https://frankfurter.dev/" },
};

const subs = new Set();
const data = {
  crypto: {}, // { BTC: {price, changePct, at, stale} }
  cryptoStatus: "idle", // idle | loading | ok | error | off
  cryptoAt: null, // ms of the last good answer (this visit or cached)
  cryptoError: null,
  fx: null, // { rate, date, fetchedAt } from Frankfurter (or its cache)
  fxStatus: "idle", // idle | loading | ok | cached | error | off
  off: false,
  // 2.2: the coin history requests: status idle | loading | ok | error | off; v counts the answers (the figures are
  // worked out again when it changes, and main.js draws the pages again once waiting is back at 0); waiting: requests
  // still to make.
  history: { status: "idle", v: 0, error: null, waiting: 0 },
};
let coins = {}; // coingeckoId -> instrument id
let timer = null;
let failures = 0;
let started = false;
let inflight = false;

/** The coins to ask about, coingeckoId -> instrument id: every coin of the plan as soon as it buys any coin on some
 *  date (an order whose id is not in skip, the months before the friend joined), so the request is the same three
 *  coins as everyone's and says nothing about the friend's amounts (spec 8.9); none when it buys no coin. */
function coinMap(plan, skip) {
  const all = (plan.instruments || []).filter((i) => i.coingeckoId);
  const ids = new Set(all.map((i) => i.id));
  const buys = (plan.orders || []).some((o) => ids.has(o.instrument) && !(skip && skip.has(o.id)));
  return buys ? Object.fromEntries(all.map((i) => [i.coingeckoId, i.id])) : {};
}
/** True while the plan buys coins, so their prices are asked for (and the top bar and footer name CoinGecko). */
export const watchesCoins = () => Object.keys(coins).length > 0;

function emit() {
  for (const fn of subs) { try { fn(data); } catch (e) { console.error(e); } }
}

const readCache = (key) => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
const writeCache = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked: memory only */ } };
const bkkDay = (ms) => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);

async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } });
    if (!res.ok) { const e = new Error(res.status === 429 ? "Too many requests: waiting longer before the next try" : `HTTP ${res.status}`); e.status = res.status; throw e; }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function applyCrypto(json, at, stale) {
  let n = 0;
  for (const [cg, id] of Object.entries(coins)) {
    const q = json && json[cg];
    const price = q && Number(q.usd);
    if (!(price > 0) || !Number.isFinite(price)) continue;
    const chg = q && Number(q.usd_24h_change);
    data.crypto[id] = { price, changePct: Number.isFinite(chg) ? chg : null, at, stale };
    n++;
  }
  return n;
}

function schedule(seconds) {
  clearTimeout(timer);
  timer = null;
  if (data.off || document.hidden) return;
  timer = setTimeout(refreshCrypto, seconds * 1000);
}

/** Fetch the coin prices now (the timer calls this; QA and the freshness chip may too). */
export async function refreshCrypto() {
  if (data.off || !Object.keys(coins).length || inflight) return;
  clearTimeout(timer);
  timer = null;
  inflight = true;
  data.cryptoStatus = data.cryptoAt ? data.cryptoStatus : "loading";
  try {
    const ids = Object.keys(coins).sort().join(",");
    const json = await getJson(`${CG_URL}?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`);
    const at = Date.now();
    if (!applyCrypto(json, at, false)) throw new Error("The answer had no prices");
    data.cryptoAt = at;
    data.cryptoStatus = "ok";
    data.cryptoError = null;
    failures = 0;
    writeCache(CRYPTO_CACHE, { at, json });
    schedule(CRYPTO_EVERY_S);
  } catch (e) {
    failures++;
    data.cryptoStatus = "error";
    data.cryptoError = String((e && e.message) || e);
    for (const q of Object.values(data.crypto)) q.stale = true;
    // Back off exponentially (CoinGecko's free tier asks for it on 429 and errors).
    schedule(Math.min(MAX_WAIT_S, CRYPTO_EVERY_S * 2 ** failures));
  } finally {
    inflight = false;
  }
  emit();
}

/** The dollar-baht rate: today's cached one, else a fresh one from Frankfurter. */
export async function loadFx(force = false) {
  const cached = readCache(FX_CACHE);
  if (cached && Number.isFinite(cached.rate)) data.fx = cached;
  if (data.off) { data.fxStatus = "off"; data.fx = null; emit(); return; }
  if (!force && cached && bkkDay(cached.fetchedAt || 0) === bkkDay(Date.now())) { data.fxStatus = "ok"; emit(); return; }
  data.fxStatus = data.fx ? "cached" : "loading";
  emit();
  try {
    const json = await getJson(FX_URL);
    const rate = Number(json && json.rates && json.rates.THB);
    const date = json && typeof json.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : null;
    if (!(rate > 10 && rate < 100) || !date) throw new Error("The answer had no usable rate");
    data.fx = { rate, date, fetchedAt: Date.now() };
    data.fxStatus = "ok";
    writeCache(FX_CACHE, data.fx);
  } catch (e) {
    data.fxStatus = data.fx ? "cached" : "error";
  }
  emit();
}

// ---------------------------------------------------------------- 2.2: a coin's price on a day

let hist = null; // "coin|YYYY-MM-DD" -> { usd, at } | { miss: true, at }, read from HISTORY_CACHE on first use
// "coin|YYYY-MM-DD" of days too old for keyless use, by this page's clock: never asked, and not kept (worked out again
// on each visit, so a clock put right asks again)
const outside = new Set();
const queue = []; // [{ coin, date }] still to ask, oldest day first
let histTimer = null;
let histBusy = false;
let histFailures = 0;

const histKey = (coin, date) => `${coin}|${date}`;
const pageHidden = () => typeof document !== "undefined" && !!document.hidden;

function histMap() {
  if (hist) return hist;
  hist = new Map();
  const c = readCache(HISTORY_CACHE);
  const days = c && typeof c === "object" && c.days && typeof c.days === "object" ? c.days : {};
  for (const [k, v] of Object.entries(days)) {
    const [coin, date] = k.split("|");
    if (!COIN_ID.test(coin || "") || !ISO_DAY.test(date || "") || !v || typeof v !== "object" || !Number.isFinite(v.at)) continue;
    if (v.miss === true) hist.set(k, { miss: true, at: v.at });
    else if (Number.isFinite(v.usd) && v.usd > 0) hist.set(k, { usd: v.usd, at: v.at });
  }
  return hist;
}

function saveHist() {
  const m = histMap();
  // the newest days are kept when there are too many (the key holds the day)
  const keys = [...m.keys()].sort((a, b) => (a.split("|")[1] < b.split("|")[1] ? 1 : -1)).slice(0, HISTORY_MAX);
  writeCache(HISTORY_CACHE, { v: 1, days: Object.fromEntries(keys.map((k) => [k, m.get(k)])) });
}

/** True when a miss may be asked once more (see MISS_RETRY_MS); the answer's time is this browser's clock. */
function missRetry(e, date) {
  const day0 = Date.parse(date + "T00:00:00Z");
  return e.at - day0 < MISS_FINAL_MS && Date.now() - e.at >= MISS_RETRY_MS;
}

/** True for a day keyless use no longer serves at nowMs: more than HISTORY.windowDays UTC days before nowMs's UTC day
 *  (on 29 Oct 2026, 29 Oct 2025 answered and 28 Oct 2025 was refused). */
function tooOld(date, nowMs) {
  const day0 = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(day0) && day0 < Math.floor(nowMs / DAY_MS) * DAY_MS - HISTORY.windowDays * DAY_MS;
}

/**
 * A coin's US dollar price on a day, from the history answers kept in this browser: { price, date } (the 00:00 UTC
 * snapshot of that day), { missing: "history" } when CoinGecko had no price for it (or refused that day, or keyless use
 * no longer reaches it), or null when it has not been answered yet.
 */
export function historyPrice(coin, date) {
  const k = histKey(coin, date);
  const e = histMap().get(k);
  if (!e) return outside.has(k) ? { missing: "history" } : null;
  if (e.miss) return { missing: "history" };
  return { price: e.usd, date };
}

/**
 * Ask CoinGecko's history for these coin days ([{ coin, date }]) once each, in the background. Only the plan's own
 * coins (the ones start() watches) are asked for, only days whose price is served by nowMs (the app's clock), and
 * never a day already answered (a day with no price is asked once more, see missRetry). A day keyless use no longer
 * reaches (tooOld) is not asked: from now on it reads as a day with no price (historyPrice). Returns how many were
 * added.
 */
export function askHistory(pairs, nowMs = Date.now()) {
  if (data.off || !Array.isArray(pairs)) return 0;
  const m = histMap();
  let added = 0;
  for (const p of pairs) {
    if (!p || !COIN_ID.test(String(p.coin)) || !coins[p.coin] || !ISO_DAY.test(String(p.date))) continue;
    if (Date.parse(p.date + "T00:00:00Z") + HISTORY.readyMs > nowMs) continue;
    const k = histKey(p.coin, p.date);
    const e = m.get(k);
    if (e && (!e.miss || !missRetry(e, p.date))) continue;
    // a request for it would only be refused, and every request counts against the rate limit
    if (tooOld(p.date, nowMs)) { outside.add(k); continue; }
    if (queue.some((q) => q.coin === p.coin && q.date === p.date)) continue;
    queue.push({ coin: p.coin, date: p.date });
    added++;
  }
  if (added) {
    queue.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.coin < b.coin ? -1 : 1));
    data.history.waiting = queue.length;
    if (data.history.status !== "error") data.history.status = "loading";
    // no emit here: the pages call this while they draw, and each answer emits (pumpHistory)
    if (!histTimer && !histBusy) pumpHistory();
  }
  return added;
}

function scheduleHistory(ms) {
  clearTimeout(histTimer);
  histTimer = setTimeout(() => { histTimer = null; pumpHistory(); }, ms);
}

/** One request, then the next after HISTORY.gapMs (longer after a refusal); paused while the page is hidden. */
async function pumpHistory() {
  if (histBusy || data.off) return;
  if (!queue.length) { if (data.history.status === "loading") { data.history.status = "ok"; emit(); } return; }
  if (pageHidden()) return; // onVisibility starts it again
  histBusy = true;
  const q = queue[0];
  let wait = HISTORY.gapMs;
  try {
    const json = await getJson(`${CG_HISTORY}${encodeURIComponent(q.coin)}/history?date=${q.date}&localization=false`);
    const usd = Number(json && json.market_data && json.market_data.current_price && json.market_data.current_price.usd);
    histMap().set(histKey(q.coin, q.date), Number.isFinite(usd) && usd > 0 ? { usd, at: Date.now() } : { miss: true, at: Date.now() });
    saveHist();
    queue.shift();
    histFailures = 0;
    data.history.error = null;
    data.history.status = queue.length ? "loading" : "ok";
  } catch (e) {
    if (e && REFUSED.has(e.status)) {
      // CoinGecko refuses this day itself (keyless use reaches back 365 days; error_code 10012): it is kept as a day
      // with no price, never asked again, and the next day is asked as usual. Retrying it would hold every later day
      // back for as long as the page is open (review finding M3).
      histMap().set(histKey(q.coin, q.date), { miss: true, at: Date.now() });
      saveHist();
      queue.shift();
      histFailures = 0;
      data.history.error = null;
      data.history.status = queue.length ? "loading" : "ok";
    } else {
      // a 429, a server error or no network: the day stays first in the queue, and the next try waits longer
      histFailures++;
      data.history.status = "error";
      data.history.error = String((e && e.message) || e);
      wait = Math.min(MAX_WAIT_S * 1000, HISTORY.backoffMs * 2 ** (histFailures - 1));
    }
  } finally {
    histBusy = false;
  }
  data.history.v++;
  data.history.waiting = queue.length;
  emit();
  if (queue.length) scheduleHistory(wait);
}

function onVisibility() {
  if (data.off) return;
  if (!document.hidden && queue.length && !histTimer && !histBusy) pumpHistory();
  if (document.hidden) { clearTimeout(timer); timer = null; return; }
  const fxDay = data.fx && data.fx.fetchedAt ? bkkDay(data.fx.fetchedAt) : null;
  if (fxDay !== bkkDay(Date.now()) && data.fxStatus !== "loading") loadFx();
  if (!started || !watchesCoins()) return;
  const due = !data.cryptoAt || Date.now() - data.cryptoAt >= CRYPTO_EVERY_S * 1000;
  if (due && failures === 0) refreshCrypto(); else if (!timer) schedule(due ? 5 : CRYPTO_EVERY_S - (Date.now() - data.cryptoAt) / 1000);
}

let inited = false;
/** Read ?prices=off and the cached rate, and fetch today's rate (the setup screen needs it). */
export function init() {
  if (inited) return;
  inited = true;
  try { data.off = new URLSearchParams(location.search).get("prices") === "off"; } catch { data.off = false; }
  if (data.off) { data.cryptoStatus = "off"; data.fxStatus = "off"; data.history.status = "off"; emit(); return; }
  loadFx();
  document.addEventListener("visibilitychange", onVisibility);
}

/**
 * Start polling for the coins the plan buys (once a plan is chosen); skip is the set of order ids from before the
 * friend joined. Safe to call again whenever the plan changes: with no coins to buy, nothing is asked for (and
 * a pending ask is dropped); coins that come back are asked for at once.
 */
export function start(plan, skip = null) {
  init();
  coins = coinMap(plan, skip);
  if (data.off) return;
  if (!watchesCoins()) { clearTimeout(timer); timer = null; return; }
  if (started) {
    // Already polling: ask now only for a coin with no price yet, or when polling had stopped; after a failure the
    // back-off stands (CoinGecko's free tier asks for it).
    if (document.hidden || inflight) return;
    if (failures > 0) { if (!timer) schedule(Math.min(MAX_WAIT_S, CRYPTO_EVERY_S * 2 ** failures)); return; }
    if (!timer || Object.values(coins).some((id) => !data.crypto[id])) refreshCrypto();
    return;
  }
  started = true;
  const cached = readCache(CRYPTO_CACHE);
  if (cached && Number.isFinite(cached.at) && applyCrypto(cached.json, cached.at, true)) {
    data.cryptoAt = cached.at;
    const fresh = Date.now() - cached.at < CRYPTO_EVERY_S * 1000;
    if (fresh) for (const q of Object.values(data.crypto)) q.stale = false;
    data.cryptoStatus = fresh ? "ok" : "loading";
    emit();
    if (fresh) schedule(CRYPTO_EVERY_S - (Date.now() - cached.at) / 1000); else refreshCrypto();
  } else refreshCrypto();
}

/**
 * The rate to use for baht figures: the live Frankfurter rate when there is one, else planFx.
 * Returns {rate, source: "live" | "cached" | "plan", date}.
 */
export function fxRate(planFx) {
  const f = data.fx;
  if (f && Number.isFinite(f.rate)) return { rate: f.rate, source: data.fxStatus === "ok" ? "live" : "cached", date: f.date };
  return { rate: planFx, source: "plan", date: null };
}

export const prices = {
  data,
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  init,
  start,
  watchesCoins,
  refreshCrypto,
  loadFx,
  fxRate,
  SOURCES,
  // 2.2: a coin's price on a day (the growth tracker)
  historyPrice,
  askHistory,
};
