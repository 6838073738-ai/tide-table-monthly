// Growth (Tide Table 2.2; docs/tt2/ADDENDUM-2026-10-27c.md B and D; docs/tt2/build/growth-api.md): "on time, never
// sold". Every order of the months the friend follows counts on its order date for its planned dollars and is never
// sold; its units are those dollars over the price paid for it. The page shows the figures (money put in, value now,
// growth in dollars and as a percent, with baht beside them at the app's rate), the one line on how it is counted, how
// many orders have a price, a chart of money put in against value at each order date, and every holding A to Z by full
// name with its units, prices paid with their dates, price now with its date and source, value and growth.
//
// Facts only: no benchmark, no ranking by growth, no colour that judges. A fall reads as plainly as a rise ("up" and
// "down" carry the sign; every line and figure uses the same neutral ink). The maths is ../growth.js (a shared module);
// its inputs come from ../tracker.js. Coin prices: CoinGecko, live for the price now and its daily
// history for an order date (prices.js askHistory); stock and fund prices: the ones the friend types on Today or logs
// with a fill. Nothing the friend typed leaves the browser.
//
// Today's short card (growthCard) uses the same figures, worked out once per drawing (growthNow).

import {
  app, h, ui, S, prices, now, today, pre, hooks, instById, fUsd, fThb, fNum, fPrice, viewHead, settings, sourceLink,
  fxInfo, isFieldInst,
} from "../core.js?v=2.2.0";
import * as G from "../growth.js?v=2.2.0";
import * as book from "../book.js?v=2.2.0";
import { trackerInput, typeableUnpriced, coinsWaiting } from "../tracker.js?v=2.2.0";
import { nameEl } from "./naming.js?v=2.2.0";

/** The page's own words (2.2; plain, describing, never judging). The tracker's sentences are growth.js GROWTH_TEXT. */
export const COPY = Object.freeze({
  title: "Growth",
  eyebrow: "On time, never sold",
  lede: "What the orders of your plan so far are worth today, counted as if each was placed on its order date for its planned amount and never sold. A fall shows as plainly as a rise.",
  figures: "The figures",
  valueFor: (put) => `For the orders that have a price: ${put} put in.`,
  chart: "Money put in and value, at each order date",
  chartOne: "The chart starts once there are two dates to show: an order date and a later day.",
  chartFigures: "The chart's figures",
  chartPart: (priced, all) => `The chart counts the orders that have a price: ${priced} of the ${all} put in, against their value.`,
  pricedHead: "Of it, orders with a price",
  chartSay: (n, first, last, put, value) => `At ${n} dates from ${first} to ${last}. On ${last}: money put in ${put}, value ${value}.`,
  dateHead: "Date",
  now: "now",
  table: "Each fund, stock and coin, A to Z by full name",
  paidDates: (n) => `Prices paid on ${n} order dates`,
  typeOnToday: "Type prices on Today's order desk",
  coinWait: "Coin prices for an order date come from CoinGecko's daily history (the price at 00:00 UTC that day). Tide Table asks for them while this page is open, once for each coin and date, and keeps them in this browser.",
  coinDown: "CoinGecko's daily history is not answering right now, so Tide Table asks again later.",
  coinsOff: "Live prices are off for this page, so coin prices for an order date are not asked for.",
  sources: "Sources",
  coinSource: ": live coin prices, and for an order date the coin's price at 00:00 UTC that day from its daily history.",
  coinYear: "CoinGecko's free daily history reaches back 365 days: an order date older than that has a coin price here only if this browser kept it.",
  typedSource: "Stock and fund prices are the ones you type on Today or log with a fill, each with its date.",
  rateLive: (rate, date) => `Baht at ฿${rate} a dollar${date ? ` on ${date}` : ""}: `,
  ratePlan: (rate) => `Baht at the plan's own ฿${rate} a dollar (the live rate is not available right now).`,
  privacy: "Nothing you type leaves this browser: a request for a coin's price names only the coin and the date.",
  allBefore: "You started after this plan's last order date, so no order of the plan counts here.",
  cardTitle: "Growth so far",
  cardLink: "Open the Growth page",
});

// ---------------------------------------------------------------- the figures, once per drawing

let memo = { key: null, out: null };

/**
 * The tracker's result for the friend's plan now: { r (growth() result), asks, start, allBefore }, or null without a
 * plan. Worked out once while the plan, the records, the coin prices, the history answers, the rate and the day stay
 * the same (growth-api.md 3: once per render, never per row).
 */
export function growthNow() {
  if (!app.plan) return null;
  const st = S();
  const fx = fxInfo();
  const td = today();
  const key = [app.plan, st, prices.data.cryptoAt, prices.data.history.v, fx.rate, fx.date, td, pre().joinedAt];
  if (memo.key && memo.key.every((x, k) => x === key[k])) return memo.out;
  const skip = new Set(pre().dateIds);
  // A live coin price is dated by the app's clock, as the page's day is (?now= moves both; in use they are the same).
  const live = {};
  for (const [id, q] of Object.entries(prices.data.crypto || {})) if (q && Number.isFinite(q.at)) live[id] = { ...q, at: q.at + (app.nowOffset || 0) };
  const ti = trackerInput({
    plan: app.plan, state: st, live, history: prices.historyPrice, today: td,
    fx: { rate: fx.rate, date: fx.date, source: fx.source }, joinedDateIds: app.plan.orderDates.map((d) => d.id).filter((id) => !skip.has(id)),
  });
  // The coin days are asked for before the figures are worked out (prices.js paces the requests): a day CoinGecko's
  // keyless history no longer reaches then reads as a day with no price in this drawing already.
  askCoins(ti);
  const out = { r: G.growth(ti.input), asks: ti.asks, start: ti.start, allBefore: ti.allBefore };
  memo = { key, out };
  return out;
}

/** Ask CoinGecko's history for the coin days the figures still need (once each; prices.js paces them). */
function askCoins(g) {
  if (g && g.asks.length) prices.askHistory(g.asks, now());
}

// ---------------------------------------------------------------- words for money and dates

const money = (m) => (m ? fUsd(m.usd, 2) : G.GROWTH_TEXT.no_price);
const baht = (m) => (m && Number.isFinite(m.thb) ? fThb(m.thb, 0) : null);
const showThb = () => settings().showThb !== false;
/** "10 Nov 2026". */
function dmy(iso) {
  const p = ui.dayParts(iso);
  return p.date === "—" ? "—" : `${p.date} ${p.month} ${p.year}`;
}
/** "up $4.00 (4.0%)", "down $20.00 (20.0%)", "no change": the word carries the sign. */
function growthWords(g, pct) {
  if (!g) return G.GROWTH_TEXT.no_price;
  if (g.minor === 0) return G.directionWord(g);
  return `${G.directionWord(g)} ${fUsd(Math.abs(g.usd), 2)}${Number.isFinite(pct) ? ` (${fNum(Math.abs(pct), 1)}%)` : ""}`;
}
/** "up ฿130", "down ฿650" (the baht of a growth), or null without a rate. */
function growthBaht(g) {
  if (!g || !Number.isFinite(g.thb)) return null;
  if (g.minor === 0) return null;
  return `${G.directionWord(g)} ${fThb(Math.abs(g.thb), 0)}`;
}
/** A sentence of growth.js as a paragraph tagged with its id. */
const said = (w, cls = "p.gr-line") => (w ? h(cls, { "data-text-id": w.id }, w.text) : null);

// ---------------------------------------------------------------- the page

export function renderGrowth() {
  const g = growthNow();
  askCoins(g);
  const out = [viewHead("growth", COPY.eyebrow, COPY.title, COPY.lede)];
  if (g.allBefore) {
    out.push(book.note(COPY.allBefore, { tone: "ink" }));
    return out;
  }
  const r = g.r;
  if (r.status !== "running") {
    // Before the start: the one sentence with the date, and nothing else (addendum c.B.4). The hourglass plate is a
    // still picture, aria-hidden, with no figure on or near it.
    const w = G.startWords(r, ui.dateWords);
    out.push(h("section.bk-section.gr-wait", { "data-gr": "wait" },
      book.plate({ art: "hourglass", size: "small" }),
      said(w, "p.gr-start")));
    return out;
  }
  out.push(figuresBlock(r));
  out.push(chartBlock(r));
  // When the page opens on a phone, its table and sources (far below the first screen there) come a moment later, in a
  // frame of their own: drawn with the rest, a long plan's first frame of style and layout was a long task on a slow
  // phone (brief F9, the qa_growth.py G14 method). Nothing on the first screen moves when they come. A redraw in place,
  // or a wider screen, draws everything at once (so a focus in the table comes back where it was).
  if (app.entering && phone()) out.push(drawnLater(() => [tableBlock(r), sourcesBlock()]));
  else out.push(tableBlock(r), sourcesBlock());
  return out;
}

/** A phone's width (under 480 px, as css/growth.css's bar of seven): the table starts far below the first screen. */
const phone = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(max-width: 479px)").matches;
/** A frame is due within this (60 Hz), so the frame that draws the page's first part comes before the rest. */
const LATER_MS = 16;
/** An empty block that becomes make()'s nodes a moment later, unless the page was drawn again or left meanwhile. */
function drawnLater(make) {
  const slot = h("div.gr-later");
  setTimeout(() => { if (slot.isConnected) slot.replaceWith(...make()); }, LATER_MS);
  return slot;
}

/** Money put in, value now and growth, with baht beside them; the line on how it is counted; the counts. */
function figuresBlock(r) {
  const thb = showThb();
  const fig = (id, label, main, subs) => h("div.gr-fig.bk-plate-box", { "data-gr": id },
    h("dt.gr-fig-label", label),
    h("dd.gr-fig-value", h(main === G.GROWTH_TEXT.no_price ? "span.gr-none" : "span.num", main),
      ...subs.filter(Boolean).map((s) => h("span.gr-fig-sub", s))));
  const part = r.counts.unpriced > 0 && r.value;
  const typeable = typeableUnpriced(r, app.plan);
  const waiting = coinsWaiting(r, app.plan);
  const hint = typeable.length ? G.typedHintWords({ ...r, counts: { ...r.counts, unpriced: typeable.length } }) : null;
  const hs = prices.data.history.status;
  let coinLine = null;
  if (waiting.length) coinLine = prices.data.off ? COPY.coinsOff : hs === "error" ? COPY.coinDown : COPY.coinWait;
  const firstTypeable = typeable.length ? typeable.slice().sort((a, b) => (a.date < b.date ? -1 : 1))[0] : null;
  return h("section.bk-section.gr-figures", { "aria-labelledby": "gr-figs-h" },
    book.sectionHead({ title: COPY.figures, level: 2, id: "gr-figs-h" }),
    h("dl.gr-figs",
      fig("put", G.GROWTH_TEXT.head_put, money(r.put), [thb ? baht(r.put) : null]),
      fig("value", G.GROWTH_TEXT.head_value, money(r.value), [thb && r.value ? baht(r.value) : null, part ? COPY.valueFor(money(r.putPriced)) : null]),
      fig("growth", G.GROWTH_TEXT.head_growth, growthWords(r.growth, r.pct), [thb ? growthBaht(r.growth) : null])),
    said(G.countWords(r), "p.gr-count"),
    said(G.unpricedWords(r)),
    hint ? h("p.gr-line", said(hint, "span.gr-hint"), " ", deskLink(firstTypeable)) : null,
    coinLine ? book.note(coinLine) : null,
    h("p.gr-basis", { "data-text-id": "basis" }, G.GROWTH_TEXT.basis));
}

/** A link to Today's order desk on the date of the first order with no price, where its price is typed. */
function deskLink(u) {
  const d = u ? app.plan.orderDates.find((x) => x.date === u.date) : null;
  return h("a.link-arrow.gr-desk", {
    href: "#/today", "data-fk": "gr-desk",
    on: { click: (e) => {
      e.preventDefault();
      if (d) app.deskDate = d.id;
      // Today's next drawing brings the desk into view and focuses it, once the router has drawn it (views/today.js
      // openDesk: a fixed wait could come before Today is drawn behind the frost veil)
      app.focusDesk = true;
      hooks.go("today");
    } },
  }, COPY.typeOnToday, h("span", { "aria-hidden": "true" }, " →"));
}

// ---------------------------------------------------------------- the chart

const DAY_MS = 86400000;
const dayNum = (iso) => Date.parse(iso + "T00:00:00Z") / DAY_MS;
/** A round top for the money axis: 1, 2 or 5 times a power of ten, at or above v. */
function niceTop(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * Money put in against value at each order date, then now: one SVG (aria-hidden) on a time axis from 0 dollars, the
 * two lines in the neutral series inks (value solid, money put in dashed), HTML labels at the lines' ends, the figure
 * named for screen readers with one sentence, and the figures behind it in a fold.
 */
function chartBlock(r) {
  const pts = r.points;
  const head = book.sectionHead({ title: COPY.chart, level: 2, id: "gr-chart-h" });
  if (pts.length < 2) {
    return h("section.bk-section.gr-chart-sec", { "aria-labelledby": "gr-chart-h" }, head, book.note(COPY.chartOne));
  }
  // Like with like: the line of money put in is the money put in for the orders that have a price (putPriced), the
  // same orders the value counts; when some have none, a note under the chart says how much of it that is.
  const putOf = (p) => (r.counts.unpriced > 0 ? p.putPriced : p.put);
  const t0 = dayNum(pts[0].date), t1 = dayNum(pts[pts.length - 1].date);
  const span = Math.max(1, t1 - t0);
  const top = niceTop(Math.max(...pts.map((p) => Math.max(putOf(p).usd, p.value ? p.value.usd : 0))) * 1.08);
  const X = (p) => ((dayNum(p.date) - t0) / span) * 1000;
  const Ypct = (v) => (1 - v / top) * 100;
  const Y = (v) => Ypct(v) * 3;
  // Money goes in on order dates only (addendum c.B.1), and the page knows a value only at those dates and now, so each
  // line holds its figure until the next date and steps there: a ramp between two dates would show money put in, or a
  // gain, that never was (review finding N3). A value with no price yet leaves a gap: the line starts at its first one.
  const stepPath = (get) => {
    let d = "", pen = false;
    for (const p of pts) {
      const v = get(p);
      if (v == null) { pen = false; continue; }
      d += pen ? `H${X(p).toFixed(1)}V${Y(v).toFixed(1)}` : `M${X(p).toFixed(1)} ${Y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const svg = h("svg", { class: "gr-chart-svg", viewBox: "0 0 1000 300", preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" },
    h("line", { class: "gr-grid", x1: "0", x2: "1000", y1: "300", y2: "300" }),
    h("line", { class: "gr-grid", x1: "0", x2: "1000", y1: Y(top / 2).toFixed(1), y2: Y(top / 2).toFixed(1) }),
    // the dashed line over the solid one: on a stretch where they are the same figure (an order at its cost) both show
    h("path", { class: "gr-line-value", d: stepPath((p) => (p.value ? p.value.usd : null)) }),
    h("path", { class: "gr-line-put", d: stepPath((p) => putOf(p).usd) }));
  const last = pts[pts.length - 1];
  const lastValue = [...pts].reverse().find((p) => p.value);
  // the two end labels, pushed apart when they would touch (about one label line of the 240 px plot)
  let a = Ypct(putOf(last).usd), b = lastValue ? Ypct(lastValue.value.usd) : null;
  const gap = 13;
  if (b != null && Math.abs(a - b) < gap) {
    const mid = (a + b) / 2, s = a <= b ? -1 : 1;
    a = mid + (s * gap) / 2; b = mid - (s * gap) / 2;
  }
  const clampPct = (v) => Math.max(6, Math.min(94, v));
  const marks = h("div.gr-chart-marks", { "aria-hidden": "true" },
    h("span.gr-chart-y.num", { style: { top: "0%" } }, fUsd(top, 0)),
    h("span.gr-chart-y.num", { style: { top: "100%" } }, fUsd(0, 0)),
    h("span.gr-chart-end.is-put", { style: { top: `${clampPct(a)}%` } }, h("b.num", money(putOf(last))), " ", h("span", G.GROWTH_TEXT.line_put)),
    b != null ? h("span.gr-chart-end.is-value", { style: { top: `${clampPct(b)}%` } }, h("b.num", money(lastValue.value)), " ", h("span", G.GROWTH_TEXT.line_value)) : null);
  const sayId = "gr-chart-say";
  const plot = h("div.gr-chart-plot", { role: "img", "aria-label": COPY.chart, "aria-describedby": sayId }, svg, marks);
  const xRow = h("div.gr-chart-x", { "aria-hidden": "true" }, h("span", dmy(pts[0].date)), h("span", dmy(last.date)));
  const sw = (cls) => h("svg", { class: `gr-legend-mark ${cls}`, viewBox: "0 0 36 12", "aria-hidden": "true", focusable: "false" }, h("path", { d: "M2 6H34" }));
  const legend = h("ul.gr-legend", h("li", sw("is-value"), G.GROWTH_TEXT.line_value), h("li", sw("is-put"), G.GROWTH_TEXT.line_put));
  const say = h("p.bk-note.is-soft.gr-chart-say", { id: sayId },
    COPY.chartSay(pts.length, dmy(pts[0].date), dmy(last.date), money(putOf(last)), money(last.value)));
  const part = r.counts.unpriced > 0 ? book.note(COPY.chartPart(money(r.putPriced), money(r.put)), { tone: "ink" }) : null;
  if (part) part.setAttribute("data-gr", "chart-part");
  const figs = book.fold({
    summary: COPY.chartFigures,
    children: h("table.bk-table.gr-points",
      h("caption.visually-hidden", COPY.chartFigures),
      h("thead", h("tr", h("th", { scope: "col" }, COPY.dateHead), h("th", { scope: "col" }, G.GROWTH_TEXT.line_put),
        part ? h("th", { scope: "col" }, COPY.pricedHead) : null, h("th", { scope: "col" }, G.GROWTH_TEXT.line_value))),
      h("tbody", pts.map((p) => h("tr", { "data-kind": p.kind },
        h("th", { scope: "row" }, `${ui.dateWords(p.date)}${p.kind === "now" ? `, ${COPY.now}` : ""}`),
        h("td", { "data-label": G.GROWTH_TEXT.line_put }, h("span.num", money(p.put))),
        part ? h("td", { "data-label": COPY.pricedHead }, h("span.num", money(p.putPriced))) : null,
        h("td", { "data-label": G.GROWTH_TEXT.line_value }, p.value ? h("span.num", money(p.value)) : G.GROWTH_TEXT.no_price))))),
  });
  const sum = figs.querySelector("summary");
  if (sum) sum.setAttribute("data-fk", "gr-points");
  return h("section.bk-section.gr-chart-sec", { "aria-labelledby": "gr-chart-h" }, head,
    h("figure.gr-chart", { "data-gr": "chart" }, h("div.gr-chart-frame", plot), xRow, legend), part, say, figs);
}

// ---------------------------------------------------------------- the table

/** "10 Nov 2026 $140.00 · your fill price" for each price paid, and "8 Dec 2026 no price yet" for each order without. */
function paidCell(row) {
  const items = [
    ...row.buys.map((b) => ({ date: b.date, el: h("li", { "data-order": b.order },
      h("span.gr-day", dmy(b.date)), " ", h("span.num", fPrice(b.price, b.priceCurrency)),
      h("span.gr-src", ` · ${G.paidLabelWords(b.label) || b.source || ""}${b.priceDate && b.priceDate !== b.date ? `, ${dmy(b.priceDate)}` : ""}`)) })),
    ...row.missing.map((m) => ({ date: m.date, el: h("li.is-missing", { "data-order": m.order },
      h("span.gr-day", dmy(m.date)), " ", h("span.gr-none", G.reasonWords(m.reason))) })),
  ].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  const list = h("ul.gr-paid", items.map((x) => x.el));
  if (items.length <= 3) return list;
  const f = book.fold({ summary: COPY.paidDates(items.length), children: list });
  const s = f.querySelector("summary");
  if (s) s.setAttribute("data-fk", `gr-paid-${row.instrument}`);
  return f;
}

/** The price now with its date and source ("$145.00", "28 Oct 2026 · CoinGecko"), or "no price yet". */
function nowCell(row) {
  const l = row.latest;
  if (!l) return h("span.gr-none", G.GROWTH_TEXT.no_price);
  return [h("span.num", fPrice(l.price, l.currency)),
    h("span.gr-src.gr-block", `${l.date ? dmy(l.date) : "—"} · ${G.paidLabelWords(l.label) || l.source || ""}`)];
}

function tableBlock(r) {
  const H = G.GROWTH_TEXT;
  const cols = [H.head_units, H.head_paid, H.head_now, H.head_put, H.head_value, H.head_growth];
  return h("section.bk-section.gr-table-sec", { "aria-labelledby": "gr-table-h" },
    book.sectionHead({ title: COPY.table, level: 2, id: "gr-table-h" }),
    h("div.gr-table-wrap",
      h("table.bk-table.gr-table", { "data-gr": "table" },
        h("caption.visually-hidden", COPY.table),
        h("thead", h("tr", h("th", { scope: "col" }, H.head_name), cols.map((c) => h("th", { scope: "col" }, c)))),
        h("tbody", r.rows.map((row) => {
          const inst = instById(row.instrument) || { id: row.instrument, ticker: row.ticker, name: row.name };
          return h("tr", { "data-gr-row": row.instrument },
            h("th", { scope: "row" }, nameEl(inst, { masked: isFieldInst(inst) })),
            h("td", { "data-label": H.head_units }, row.priced ? h("span.num", unitsWords(row.units)) : h("span.gr-none", H.no_price)),
            h("td", { "data-label": H.head_paid }, paidCell(row)),
            h("td", { "data-label": H.head_now }, nowCell(row)),
            h("td", { "data-label": H.head_put }, h("span.num", money(row.put))),
            h("td", { "data-label": H.head_value }, row.value ? h("span.num", money(row.value)) : h("span.gr-none", H.no_price)),
            h("td", { "data-label": H.head_growth }, row.growth ? h("span.num", growthWords(row.growth, row.pct)) : h("span.gr-none", H.no_price)));
        })))));
}

const UNITS_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });
/** Units for the eye (growth.js unitsShown), with thousands grouped. */
const unitsWords = (u) => UNITS_FMT.format(G.unitsShown(u));

// ---------------------------------------------------------------- sources

function sourcesBlock() {
  const f = fxInfo();
  const rate = f.source === "plan"
    ? book.note(COPY.ratePlan(fNum(f.rate, 2)))
    : book.note([COPY.rateLive(fNum(f.rate, 2), f.date ? ui.dateWords(f.date) : null), sourceLink(prices.SOURCES.fx), "."]);
  return h("section.bk-section.gr-sources", { "aria-labelledby": "gr-src-h" },
    book.sectionHead({ title: COPY.sources, level: 2, id: "gr-src-h" }),
    prices.watchesCoins() ? book.note([sourceLink(prices.SOURCES.crypto), COPY.coinSource, " ", COPY.coinYear]) : null,
    book.note(COPY.typedSource),
    rate,
    book.note(COPY.privacy));
}

// ---------------------------------------------------------------- Today's short card

/**
 * Growth so far, on Today: the start sentence before the plan's first order date; then money put in, value now and
 * growth, and the "N of M orders have a price" line; a link to the Growth page. Null without a plan, or for a friend
 * who follows none of the plan's order dates.
 */
export function growthCard() {
  const g = growthNow();
  if (!g || g.allBefore) return null;
  askCoins(g);
  const r = g.r;
  const body = [];
  if (r.status !== "running") body.push(said(G.startWords(r, ui.dateWords), "p.gr-start"));
  else {
    const pair = (id, label, v, sub = null) => h("div.gr-mini-pair", { "data-gr": id }, h("dt", label),
      h("dd", h(v === G.GROWTH_TEXT.no_price ? "span.gr-none" : "span.num", v), sub ? h("span.gr-fig-sub.gr-block", sub) : null));
    // value and growth count the orders that have a price: when some have none, the value says how much they put in
    const part = r.counts.unpriced > 0 && r.value ? COPY.valueFor(money(r.putPriced)) : null;
    body.push(h("dl.gr-mini",
      pair("put", G.GROWTH_TEXT.head_put, money(r.put)),
      pair("value", G.GROWTH_TEXT.head_value, money(r.value), part),
      pair("growth", G.GROWTH_TEXT.head_growth, growthWords(r.growth, r.pct))));
    body.push(said(G.countWords(r), "p.gr-count"));
  }
  return h("section.bk-section.ttm-growth", { "aria-labelledby": "today-growth-h", "data-fk": "today-growth" },
    book.sectionHead({ title: COPY.cardTitle, level: 2, id: "today-growth-h" }),
    ...body,
    h("a.link-arrow", { href: "#/growth", "data-fk": "today-growth-link" }, COPY.cardLink, h("span", { "aria-hidden": "true" }, " →")));
}
