// The growth tracker's maths (Tide Table 2.2; docs/tt2/ADDENDUM-2026-10-27c.md sections B and E). One pure ES module
// that both apps import: no page, no network and no clock (the host passes today). The contract for the views is
// docs/tt2/build/growth-api.md; the tests are tests/growth.test.mjs.
//
// "On time, never sold": every order of the plan whose order date has come counts as placed on that date for exactly
// its planned amount, and never sold. Its units are the planned amount over the price paid for that order:
// fractional units, no fees, no taxes, no dividends paid out (accumulating funds keep their dividends in their price).
// Money put in is the sum of those amounts. Value now is units times the price now. Growth is value now less the money
// put in of the orders that have a price, also as a percent of that money. A fall reads as plainly as a rise: the
// sign and the words "up" and "down", nothing else. The table runs A to Z by full name and is never ordered by growth.
//
// Money is counted in whole minor units (cents or satang) of the plan's own money, `base`: "USD" for the friends' app,
// "THB" for the owner's app. Each row's value is rounded once, half away from zero, and the figures are the sums of
// the rows, so the table always adds up. The other currency is each figure turned at the app's one rate and rounded
// the same way; its growth is the difference of the two turned figures. An order's own rate (`rate`, baht per US
// dollar, for example the rate of the transfer that paid it) turns that order's amount; values always use the app's.
//
// Prices: a price paid comes from the host per order (`buyPrice`); with none given and a daily series for the
// instrument, it is the first close on or after the order date. The price now of an instrument is the newest dated
// price known for it: the host's latest price, the series' last close, or a price paid; on the same date the latest
// price comes first, then the close, then a price paid. An order is valued at its cost until its price paid's date.

import { tickerName, fullNameOf } from "./names.js?v=2.2.0";

/** Every sentence and label of the tracker, by id. "{…}" marks a value the host fills; money and dates come formatted
 *  by the host (for dates, ui.js dateWords: "Tue 10 Nov 2026"). */
export const GROWTH_TEXT = Object.freeze({
  start_on: "The tracker starts on {date}, the plan's first order date.",
  start_unset: "The tracker starts on the plan's first order date. No order has a date yet.",
  counts_all: "Growth counts all {m} orders so far, and each has a price.",
  counts_all_one: "Growth counts the 1 order so far, and it has a price.",
  counts_some: "Growth counts the {n} of {m} orders that have a price.",
  counts_some_one: "Growth counts the 1 of {m} orders that has a price.",
  counts_none: "None of the {m} orders so far has a price yet, so there is no value or growth figure yet.",
  counts_none_one: "The 1 order so far has no price yet, so there is no value or growth figure yet.",
  unpriced: "{k} orders have no price yet. They count in money put in, not in value or growth.",
  unpriced_one: "1 order has no price yet. It counts in money put in, not in value or growth.",
  typed_hint: "Typing their prices on Today includes them.",
  typed_hint_one: "Typing its price on Today includes it.",
  basis: "Counted as if each order was placed on its order date for its planned amount and never sold: fractional "
    + "units, no fees, no taxes and no dividends paid out. Accumulating funds keep their dividends in their price.",
  no_price: "no price yet",
  dir_up: "up",
  dir_down: "down",
  dir_none: "no change",
  head_name: "Name",
  head_units: "Units",
  head_paid: "Price paid",
  head_now: "Price now",
  head_put: "Money put in",
  head_value: "Value now",
  head_growth: "Growth",
  line_put: "Money put in",
  line_value: "Value",
  reason_no_price: "no price yet",
  reason_history: "no price for that day in the price history",
  reason_bad_price: "the price given is not a number above 0",
  reason_no_rate: "no exchange rate at hand",
  paid_close_on_or_after: "first close on or after the order date",
  paid_first_day_close: "close of its first trading day",
  paid_typed: "the price you typed",
  paid_fill: "your fill price",
  paid_day: "that day's price",
});

/** Why an order has no price: none given, the source's history had no price that day, a price that is not a number
 *  above 0, or no exchange rate to turn its money. */
export const REASONS = Object.freeze(["no_price", "history", "bad_price", "no_rate"]);
/** Labels a price paid may carry (`label`); the words are GROWTH_TEXT["paid_" + label]. */
export const PAID_LABELS = Object.freeze(["close_on_or_after", "first_day_close", "typed", "fill", "day"]);

// ---------------------------------------------------------------- small helpers

const CUR = /^[A-Z]{3}$/;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const posNum = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const curOf = (v) => { const c = typeof v === "string" ? v.trim().toUpperCase() : ""; return CUR.test(c) ? c : null; };

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** True for a real calendar day written YYYY-MM-DD (read by character codes: a daily series checks every point). */
function isDay(s) {
  if (typeof s !== "string" || s.length !== 10 || s.charCodeAt(4) !== 45 || s.charCodeAt(7) !== 45) return false;
  let y = 0, m = 0, d = 0;
  for (let i = 0; i < 10; i += 1) {
    if (i === 4 || i === 7) continue;
    const c = s.charCodeAt(i) - 48;
    if (c < 0 || c > 9) return false;
    if (i < 4) y = y * 10 + c; else if (i < 7) m = m * 10 + c; else d = d * 10 + c;
  }
  if (m < 1 || m > 12 || d < 1) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return d <= (m === 2 && leap ? 29 : MONTH_DAYS[m - 1]);
}

/** x to a whole number, half away from zero, after clearing float noise (as if read to 12 significant digits);
 *  never -0. Only a value next to a half pays for the slow path: elsewhere the noise cannot change the result. */
function halfAway(x) {
  let a = Math.abs(x);
  const f = a - Math.floor(a);
  if (Math.abs(f - 0.5) <= a * 1e-11 + 1e-9) a = Math.abs(Number(x.toPrecision(12)));
  const r = Math.floor(a + 0.5);
  return r === 0 ? 0 : x < 0 ? -r : r;
}

/** One collator for A to Z (letters only, case and accents aside), made on first use. */
let collator = null;
const byName = (a, b) => (collator || (collator = new Intl.Collator("en", { sensitivity: "base" }))).compare(a, b);

/** A lookup over what the host gives: a function (key, item), a Map, an array of objects with `id`, or an object. */
function reader(src) {
  if (typeof src === "function") return src;
  if (src instanceof Map) return (k) => src.get(k);
  if (Array.isArray(src)) {
    const m = new Map();
    for (const x of src) if (isObj(x) && x.id != null && !m.has(String(x.id))) m.set(String(x.id), x);
    return (k) => m.get(k);
  }
  if (isObj(src)) return (k) => (has(src, k) ? src[k] : undefined);
  return () => undefined;
}

/** The app's rate: { info: {thbPerUsd, date, source} | null, per: units of each currency per US dollar }. */
function ratesOf(fx) {
  const per = { USD: 1 };
  if (!isObj(fx)) return { info: null, per };
  if (isObj(fx.perUsd)) {
    for (const [k, v] of Object.entries(fx.perUsd)) {
      const c = curOf(k);
      if (c && c !== "USD" && c !== "THB" && posNum(v)) per[c] = v;
    }
  }
  if (!posNum(fx.thbPerUsd)) return { info: null, per };
  per.THB = fx.thbPerUsd;
  return { info: { thbPerUsd: fx.thbPerUsd, date: isDay(fx.date) ? fx.date : null, source: text(fx.source) }, per };
}

/** x from one currency to another through the US dollar; `ownThb` (baht per dollar) replaces the app's baht rate.
 *  Null when a rate is missing. */
function convert(x, from, to, per, ownThb = null) {
  if (from === to) return x;
  const a = from === "THB" && ownThb ? ownThb : per[from];
  const b = to === "THB" && ownThb ? ownThb : per[to];
  return a && b ? (x / a) * b : null;
}

/** A price as the host gives it ({price, date, source, label, currency} or {missing}), cleaned; or {missing}. */
function readPrice(p, defCur) {
  if (p === undefined || p === null) return { missing: "no_price" };
  if (!isObj(p)) return { missing: "bad_price" };
  if (!has(p, "price") && typeof p.missing === "string") return { missing: REASONS.includes(p.missing) ? p.missing : "no_price" };
  if (!posNum(p.price)) return { missing: "bad_price" };
  return { price: p.price, date: isDay(p.date) ? p.date : null, source: text(p.source), label: text(p.label),
    currency: curOf(p.currency) || defCur };
}

/** A daily series ([[day, close]], [{date, close}] or {points, currency, source}): sorted by day, one close a day,
 *  bad points left out; null when nothing is left. */
function readSeries(s, defCur) {
  let pts = s, currency = defCur, source = null;
  if (isObj(s)) { pts = s.points; currency = curOf(s.currency) || defCur; source = text(s.source); }
  if (!Array.isArray(pts)) return null;
  let points = [], sorted = true;
  for (const p of pts) {
    let d = null, v = null;
    if (Array.isArray(p)) { d = p[0]; v = p[1]; }
    else if (isObj(p)) { d = p.date; v = has(p, "close") ? p.close : p.price; }
    if (!posNum(v) || !isDay(d)) continue;
    if (points.length && d <= points[points.length - 1].date) sorted = false;
    points.push({ date: d, price: v });
  }
  if (!points.length) return null;
  if (!sorted) {   // out of order or a day twice: the last close given for a day stands
    const byDay = new Map();
    for (const p of points) byDay.set(p.date, p.price);
    points = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, price]) => ({ date, price }));
  }
  return { points, currency, source };
}

/** The first close on or after a day (binary search), or null. */
function firstOnOrAfter(points, day) {
  let lo = 0, hi = points.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (points[mid].date < day) lo = mid + 1; else hi = mid; }
  return lo < points.length ? points[lo] : null;
}

/** Sign of a growth in minor units: "up", "down" or "none". */
const dirOf = (g) => (g > 0 ? "up" : g < 0 ? "down" : "none");

/** A percent of `p` to one decimal, half away from zero, from whole minor units (no float drift); null without p. */
function pctOf(g, p) {
  if (!(p > 0)) return null;
  const t = Math.sign(g) * Math.floor((2 * Math.abs(g) * 1000 + p) / (2 * p));
  return t === 0 ? 0 : t / 10;
}

/** The newer of two price candidates: by day (no day is oldest), then latest > series > paid, then the later one. */
function newer(a, b) {
  const da = a.date || "", db = b.date || "";
  if (da !== db) return da > db;
  return a.rank >= b.rank;
}

// ---------------------------------------------------------------- the tracker

/**
 * The growth of a plan's orders, "on time, never sold".
 *
 * input:
 * - orders: [{ id, date: "YYYY-MM-DD" | null, instrument, amount, currency: "USD" | "THB" | …, rate? }]: every order
 *   of the plan, with its planned amount in its own currency; a date of null is an order that waits for an event;
 * - instruments: per instrument id { ticker | symbol, name, longName, kind | group | venue, quoteCurrency }
 *   (an array of objects with `id`, an object, a Map or a function id -> instrument);
 * - buyPrice: per order id { price, date, source, label?, currency? } | { missing: reason } | null (or a function
 *   (id, order) -> that);
 * - latestPrice: per instrument id { price, date, source, label?, currency? } | null (or a function (id, instrument));
 * - series: per instrument id the daily closes ([[day, close]] or { points, currency, source }), optional;
 * - fx: { thbPerUsd, date, source, perUsd? } the app's rate; perUsd gives other currencies per US dollar;
 * - base: "USD" (the friends' app) or "THB" (the owner's app);
 * - today: "YYYY-MM-DD" (the host's clock);
 * - start: optional day; orders before it are left out (counted in counts.before).
 *
 * Returns { status, start, today, base, other, fx, counts, put, putPriced, value, growth, pct, ratio, direction,
 * rows, unpriced, points, daily } as growth-api.md describes. Throws a TypeError for a bad `today` or `base`.
 */
export function growth(input = {}) {
  const { orders, instruments, buyPrice, latestPrice, series, fx, base = "USD", today, start = null } = isObj(input) ? input : {};
  if (!isDay(today)) throw new TypeError("growth: today must be a real day written YYYY-MM-DD");
  if (base !== "USD" && base !== "THB") throw new TypeError('growth: base must be "USD" or "THB"');
  const other = base === "USD" ? "THB" : "USD";
  const { info, per } = ratesOf(fx);
  const instOf = reader(instruments), buyOf = reader(buyPrice), nowOf = reader(latestPrice), seriesOf = reader(series);

  /** Money of whole base minor units, with the other currency turned at the app's rate. */
  const otherMinor = (m) => { const v = convert(m, base, other, per); return v == null ? null : halfAway(v); };
  const money = (m) => {
    const o = otherMinor(m);
    return base === "USD" ? { minor: m, usd: m / 100, thb: o == null ? null : o / 100 }
      : { minor: m, usd: o == null ? null : o / 100, thb: m / 100 };
  };
  const gain = (v, p) => {
    const ov = otherMinor(v), op = otherMinor(p);
    const o = ov == null || op == null ? null : (ov - op) / 100;
    return base === "USD" ? { minor: v - p, usd: (v - p) / 100, thb: o } : { minor: v - p, usd: o, thb: (v - p) / 100 };
  };

  // 1. The orders: dated ones in scope, undated ones waiting for their event.
  const list = [];
  let waiting = 0;
  (Array.isArray(orders) ? orders : []).forEach((o, i) => {
    if (!isObj(o) || !posNum(o.amount) || o.instrument == null || o.instrument === "") return;
    if (!isDay(o.date)) { waiting += 1; return; }
    list.push({ id: o.id != null ? String(o.id) : `#${i + 1}`, date: o.date, instrument: String(o.instrument),
      amount: o.amount, currency: curOf(o.currency) || base, rate: posNum(o.rate) ? o.rate : null, i, src: o });
  });
  const cut = isDay(start) ? start : null;
  const inScope = cut ? list.filter((o) => o.date >= cut) : list;
  let first = null;
  for (const o of inScope) if (!first || o.date < first) first = o.date;
  const due = inScope.filter((o) => o.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i));
  const counts = { orders: 0, priced: 0, unpriced: 0, waiting, later: inScope.length - due.length,
    before: list.length - inScope.length, noRate: 0 };
  const shell = (status) => ({ status, start: first, today, base, other, fx: info, counts, put: null, putPriced: null,
    value: null, growth: null, pct: null, ratio: null, direction: null, rows: [], unpriced: [], points: [], daily: [] });
  if (!first) return shell("no_orders");
  if (today < first) return shell("before_start");

  // 2. Each instrument with an order that has come: its names, its currency, its daily series.
  const insts = new Map();
  const entry = (id) => {
    let e = insts.get(id);
    if (!e) {
      const raw = instOf(id);
      const inst = isObj(raw) ? raw : null;
      const cur = (inst && (curOf(inst.quoteCurrency) || curOf(inst.currency))) || "USD";
      e = { id, inst, cur, series: readSeries(seriesOf(id, inst), cur), recs: [], latest: null, now: null, nowBase: null };
      insts.set(id, e);
    }
    return e;
  };

  // 3. Each order: its money put in, its price paid and its units.
  const recs = due.map((o) => {
    const e = entry(o.instrument);
    const putBase = convert(o.amount, o.currency, base, per, o.rate);
    const r = { o, e, putMinor: putBase == null ? null : halfAway(putBase * 100), paid: null, units: 0, reason: null };
    if (r.putMinor == null) { counts.noRate += 1; r.reason = "no_rate"; }
    else {
      const raw = buyOf(o.id, o.src);
      let paid = readPrice(raw, e.cur);
      if ((raw === undefined || raw === null) && e.series) {
        if (e.series.points[0].date > o.date) paid = { missing: "history" };   // a history that does not reach back to it: never a later close
        else {
          const p = firstOnOrAfter(e.series.points, o.date);
          if (p) paid = { price: p.price, date: p.date, source: e.series.source, label: "close_on_or_after", currency: e.series.currency };
        }
      }
      if (paid.missing) r.reason = paid.missing;
      else {
        const amt = convert(o.amount, o.currency, paid.currency, per, o.rate);
        if (amt == null) r.reason = "no_rate";
        else { r.paid = paid; r.units = amt / paid.price; }
      }
    }
    e.recs.push(r);
    return r;
  });

  // 4. Each instrument's price now: the newest dated price known for it.
  for (const e of insts.values()) {
    let best = null;
    const offer = (c) => { if (!best || newer(c, best)) best = c; };
    const lp = readPrice(nowOf(e.id, e.inst), e.cur);
    e.latest = lp.missing ? null : lp;
    if (e.latest) offer({ ...lp, from: "latest", rank: 3 });
    if (e.series) {
      const last = e.series.points[e.series.points.length - 1];
      offer({ price: last.price, date: last.date, source: e.series.source, label: null, currency: e.series.currency, from: "series", rank: 2 });
    }
    for (const r of e.recs) if (r.paid) offer({ ...r.paid, from: "paid", rank: 1 });
    e.now = best;
    e.nowBase = best ? convert(best.price, best.currency, base, per) : null;
    if (e.nowBase == null) for (const r of e.recs) if (r.paid) { r.paid = null; r.units = 0; r.reason = "no_rate"; }
  }

  const unpriced = [];
  for (const r of recs) {
    counts.orders += 1;
    if (r.paid) counts.priced += 1;
    else { counts.unpriced += 1; unpriced.push({ order: r.o.id, instrument: r.o.instrument, date: r.o.date, reason: r.reason }); }
  }

  // 5. The table, A to Z by full name.
  const rows = [...insts.values()].map((e) => {
    const names = tickerName(e.inst ? { ...e.inst, id: undefined } : {});
    let put = 0, putPriced = 0, units = 0, priced = 0;
    const buys = [], missing = [];
    for (const r of e.recs) {
      if (r.putMinor != null) put += r.putMinor;
      if (r.paid) {
        priced += 1;
        putPriced += r.putMinor;
        units += r.units;
        buys.push({ order: r.o.id, date: r.o.date, amount: money(r.putMinor), currency: r.o.currency, price: r.paid.price,
          priceDate: r.paid.date, priceCurrency: r.paid.currency, source: r.paid.source, label: r.paid.label, units: r.units });
      } else missing.push({ order: r.o.id, date: r.o.date, reason: r.reason });
    }
    const valueMinor = priced ? halfAway(units * e.nowBase * 100) : null;
    const now = e.now;
    return {
      instrument: e.id, ticker: names.ticker, name: names.name, text: names.text || e.id, sr: names.sr || e.id,
      sortName: (e.inst && fullNameOf(e.inst)) || names.ticker || e.id,
      orders: e.recs.length, priced, units, buys, missing,
      latest: now ? { price: now.price, date: now.date, source: now.source, label: now.label, currency: now.currency, from: now.from } : null,
      put: money(put), putPriced: money(putPriced),
      value: priced ? money(valueMinor) : null,
      growth: priced ? gain(valueMinor, putPriced) : null,
      pct: priced ? pctOf(valueMinor - putPriced, putPriced) : null,
      ratio: priced && putPriced > 0 ? (valueMinor - putPriced) / putPriced : null,
      direction: priced ? dirOf(valueMinor - putPriced) : null,
      _value: valueMinor, _put: put, _putPriced: putPriced,
    };
  });
  rows.sort((a, b) => byName(a.sortName, b.sortName) || byName(a.ticker || "", b.ticker || "")
    || (a.instrument < b.instrument ? -1 : a.instrument > b.instrument ? 1 : 0));

  // 6. The figures: the sums of the rows.
  let put = 0, putPriced = 0, value = 0;
  for (const x of rows) { put += x._put; putPriced += x._putPriced; if (x._value != null) value += x._value; }
  for (const x of rows) { delete x._value; delete x._put; delete x._putPriced; }
  const anyPriced = counts.priced > 0;

  // 7. Points: money put in against value at each order date, then now; daily where a series is given.
  const evaluate = valuer(due, recs, insts, per, base);
  const orderDays = [...new Set(due.map((o) => o.date))];
  const pointOf = (day, kind, v) => ({ date: day, kind, put: money(v.put), putPriced: money(v.putPriced), value: v.value == null ? null : money(v.value) });
  const points = evaluate(orderDays).map((v, k) => pointOf(orderDays[k], "order", v));
  const nowPoint = { date: today, kind: "now", put: money(put), putPriced: money(putPriced), value: anyPriced ? money(value) : null };
  if (orderDays[orderDays.length - 1] === today) points[points.length - 1] = nowPoint;
  else points.push(nowPoint);
  let daily = [];
  if ([...insts.values()].some((e) => e.series)) {
    const days = new Set(orderDays);
    for (const e of insts.values()) if (e.series) for (const p of e.series.points) if (p.date >= first && p.date <= today) days.add(p.date);
    const sorted = [...days].sort();
    daily = evaluate(sorted).map((v, k) => pointOf(sorted[k], "day", v));
  }

  return {
    status: "running", start: first, today, base, other, fx: info, counts,
    put: money(put), putPriced: money(putPriced),
    value: anyPriced ? money(value) : null,
    growth: anyPriced ? gain(value, putPriced) : null,
    pct: anyPriced ? pctOf(value - putPriced, putPriced) : null,
    ratio: anyPriced && putPriced > 0 ? (value - putPriced) / putPriced : null,
    direction: anyPriced ? dirOf(value - putPriced) : null,
    rows, unpriced, points, daily,
  };
}

/**
 * The value at a list of days in ascending order: [{ put, putPriced, value }] in whole base minor units (value null
 * before any order with a price). An order counts from its order date: at its cost until its price paid's date,
 * then units times the newest price on or before that day (the same order of sources as the price now).
 */
function valuer(due, recs, insts, per, base) {
  const factor = (cur) => convert(1, cur, base, per);
  const plan = [];
  for (const e of insts.values()) {
    const priced = e.recs.filter((r) => r.paid);   // already by order date
    if (!priced.length) continue;
    // The series' closes (sorted, one a day), merged with the few dated prices paid and the latest price.
    let prices = [];
    const fs = e.series ? factor(e.series.currency) : null;
    if (fs != null) prices = e.series.points.map((p) => ({ date: p.date, base: p.price * fs, rank: 2 }));
    const extra = new Map();
    const add = (date, price, cur, rank) => {
      const f = date ? factor(cur) : null;
      if (f == null) return;
      const was = extra.get(date);
      if (!was || rank >= was.rank) extra.set(date, { date, base: price * f, rank });
    };
    for (const r of priced) add(r.paid.date, r.paid.price, r.paid.currency, 1);
    if (e.latest) add(e.latest.date, e.latest.price, e.latest.currency, 3);
    if (extra.size) prices = mergeDays(prices, [...extra.values()].sort((a, b) => (a.date < b.date ? -1 : 1)));
    const market = priced.map((r) => ({ r, day: r.paid.date && r.paid.date > r.o.date ? r.paid.date : r.o.date }))
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    plan.push({ prices, enter: priced, market });
  }
  return (days) => {
    const st = plan.map(() => ({ ie: 0, im: 0, ip: 0, pending: 0, cost: 0, units: 0, price: null, any: false }));
    const out = [];
    let k = 0, put = 0, putPriced = 0;
    for (const d of days) {
      while (k < due.length && due[k].date <= d) {
        const r = recs[k];
        if (r.putMinor != null) { put += r.putMinor; if (r.paid) putPriced += r.putMinor; }
        k += 1;
      }
      let value = 0, any = false;
      for (let j = 0; j < plan.length; j++) {
        const p = plan[j], s = st[j];
        while (s.ie < p.enter.length && p.enter[s.ie].o.date <= d) { s.pending += p.enter[s.ie].putMinor; s.any = true; s.ie += 1; }
        while (s.im < p.market.length && p.market[s.im].day <= d) {
          const r = p.market[s.im].r;
          s.pending -= r.putMinor; s.cost += r.putMinor; s.units += r.units; s.im += 1;
        }
        while (s.ip < p.prices.length && p.prices[s.ip].date <= d) { s.price = p.prices[s.ip].base; s.ip += 1; }
        if (!s.any) continue;
        any = true;
        value += halfAway(s.price == null ? s.pending + s.cost : s.units * s.price * 100 + s.pending);
      }
      out.push({ put, putPriced, value: any ? value : null });
    }
    return out;
  };
}

/** Two day-sorted price lists as one; on the same day the higher rank stands (latest > series > paid). */
function mergeDays(a, b) {
  const out = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i].date < b[j].date)) out.push(a[i++]);
    else if (i >= a.length || b[j].date < a[i].date) out.push(b[j++]);
    else { out.push(b[j].rank >= a[i].rank ? b[j] : a[i]); i += 1; j += 1; }
  }
  return out;
}

// ---------------------------------------------------------------- words

/** The text of an id with its values filled in ({n}, {m}, {k}, {date}); "" for an unknown id. */
export function growthText(id, vars = {}) {
  const t = has(GROWTH_TEXT, id) ? GROWTH_TEXT[id] : null;
  if (typeof t !== "string") return "";
  return t.replace(/\{(\w+)\}/g, (all, k) => (isObj(vars) && has(vars, k) ? String(vars[k]) : all));
}
const said = (id, vars) => ({ id, text: growthText(id, vars) });

/** "Growth counts the 9 of 12 orders that have a price." and its other forms, as { id, text }; null unless running. */
export function countWords(r) {
  if (!r || r.status !== "running") return null;
  const m = r.counts.orders, n = r.counts.priced;
  if (n === m) return m === 1 ? said("counts_all_one") : said("counts_all", { m });
  if (n === 0) return m === 1 ? said("counts_none_one") : said("counts_none", { m });
  return n === 1 ? said("counts_some_one", { m }) : said("counts_some", { n, m });
}

/** How many orders have no price yet, as { id, text }; null when every order has one (or not running). */
export function unpricedWords(r) {
  if (!r || r.status !== "running" || !r.counts.unpriced) return null;
  const k = r.counts.unpriced;
  return k === 1 ? said("unpriced_one") : said("unpriced", { k });
}

/** The friends' app's hint that typing a price on Today includes those orders, as { id, text }; null as above. */
export function typedHintWords(r) {
  if (!r || r.status !== "running" || !r.counts.unpriced) return null;
  return r.counts.unpriced === 1 ? said("typed_hint_one") : said("typed_hint");
}

/** Before the start, the one sentence with the date (dateWords formats it); null once the tracker runs. */
export function startWords(r, dateWords = (d) => d) {
  if (!r) return null;
  if (r.status === "before_start") return said("start_on", { date: dateWords(r.start) });
  if (r.status === "no_orders") return said("start_unset");
  return null;
}

/** "up", "down" or "no change" for a growth (a Money object or minor units); "" for none. */
export function directionWord(g) {
  const m = isObj(g) ? g.minor : g;
  if (typeof m !== "number" || !Number.isFinite(m)) return "";
  return growthText(m > 0 ? "dir_up" : m < 0 ? "dir_down" : "dir_none");
}

/** Words for why an order has no price (REASONS); an unknown reason reads as "no price yet". */
export function reasonWords(reason) {
  return growthText(`reason_${REASONS.includes(reason) ? reason : "no_price"}`);
}

/** Words for a price paid's label (PAID_LABELS); "" for none. */
export function paidLabelWords(label) {
  return PAID_LABELS.includes(label) ? growthText(`paid_${label}`) : "";
}

/** Units for the eye: at least 4 significant digits and 6 decimals, at most 10 decimals. The maths keeps them whole. */
export function unitsShown(u) {
  if (typeof u !== "number" || !Number.isFinite(u) || u === 0) return 0;
  const lead = Math.floor(Math.log10(Math.abs(u)));
  const v = Number(u.toFixed(Math.min(10, Math.max(6, 3 - lead))));
  return v === 0 ? 0 : v;
}
