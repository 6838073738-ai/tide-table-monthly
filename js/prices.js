// Prices for the friends' app. Crypto (bitcoin, ether, solana) comes from CoinGecko every two minutes
// while the page is visible; the US dollar to Thai baht rate comes from Frankfurter once a day. Stocks
// and London funds have no live source: the friend types the price their broker's app shows (kept in
// the store, see core.js priceInfo). Every request URL is fixed apart from the plan's own coin ids, so
// nothing the friend typed (amounts, holdings) ever leaves the browser. ?prices=off turns the network
// off (offline QA); the plan's own rate is then used.

const CG_URL = "https://api.coingecko.com/api/v3/simple/price";
const FX_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=THB";
export const CRYPTO_EVERY_S = 120;
const MAX_WAIT_S = 1800;
const TIMEOUT_MS = 15000;
const CRYPTO_CACHE = "ttm:prices:crypto";
const FX_CACHE = "ttm:fx";

export const SOURCES = {
  crypto: { text: "Crypto prices by CoinGecko", href: "https://www.coingecko.com/" },
  fx: { text: "Exchange rate: Frankfurter (European Central Bank)", href: "https://frankfurter.dev/" },
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
};
let coins = {}; // coingeckoId -> instrument id
let timer = null;
let failures = 0;
let started = false;

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
  if (data.off || !Object.keys(coins).length) return;
  clearTimeout(timer);
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

function onVisibility() {
  if (data.off) return;
  if (document.hidden) { clearTimeout(timer); timer = null; return; }
  const fxDay = data.fx && data.fx.fetchedAt ? bkkDay(data.fx.fetchedAt) : null;
  if (fxDay !== bkkDay(Date.now()) && data.fxStatus !== "loading") loadFx();
  if (!started) return;
  const due = !data.cryptoAt || Date.now() - data.cryptoAt >= CRYPTO_EVERY_S * 1000;
  if (due && failures === 0) refreshCrypto(); else if (!timer) schedule(due ? 5 : CRYPTO_EVERY_S - (Date.now() - data.cryptoAt) / 1000);
}

let inited = false;
/** Read ?prices=off and the cached rate, and fetch today's rate (the setup screen needs it). */
export function init() {
  if (inited) return;
  inited = true;
  try { data.off = new URLSearchParams(location.search).get("prices") === "off"; } catch { data.off = false; }
  if (data.off) { data.cryptoStatus = "off"; data.fxStatus = "off"; emit(); return; }
  loadFx();
  document.addEventListener("visibilitychange", onVisibility);
}

/** Start polling for the plan's coins (once a plan is chosen). Safe to call again (same coins). */
export function start(plan) {
  init();
  coins = Object.fromEntries((plan.instruments || []).filter((i) => i.coingeckoId).map((i) => [i.coingeckoId, i.id]));
  if (started || data.off) return;
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
  refreshCrypto,
  loadFx,
  fxRate,
  SOURCES,
};
