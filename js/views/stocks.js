// Stocks (docs/tt2/ADDENDUM-2026-10-27b.md D, with B.6 and G): everything the friend's plan buys, by ticker and full
// name, in three sections: the stocks (the written plan's seven, Anthropic locked at 10% of each month, and in field
// mode the companies the friend ticked), the funds and the coins. Each section runs A to Z by full name; nothing is
// ranked, scored or highlighted. Each holding shows where it trades and through which account, its part of this
// month at the friend's amount and its share of the month, its year, the plan's ceiling and the plan's own written
// thesis lines. With the open data, a stock the list holds shows its figures year by year, its debt and its facts
// from both sides, with a link to its company page; without it, one plain line says when they appear. The sentences
// describe; they never judge.

import {
  app, h, S, schedule, autoDeskDate, monthOf, joinedPlan, ceilingOf, fmtCeil, fM, fNum, dayShort, monthName, viewHead,
  universeOn, savedFields, fieldsSpecNow, fieldMonthsOn, accountLabel, countWord, plural, instById,
} from "../core.js?v=2.2.0";
import * as book from "../book.js?v=2.2.0";
import * as FU from "../fieldsui.js?v=2.2.0";
import * as D from "../datafiles.js?v=2.2.0";
import * as N from "../names.js?v=2.2.0";
import * as LK from "../lock.js?v=2.2.0";
import { fieldName } from "../fields-catalog.js?v=2.2.0";
import { notBought, notBoughtMonth } from "./mix.js?v=2.2.0";
import {
  nameEl, nameText, lockNow, lockEntry, lockSubject, lockChips, lockDateLine, lockMonthWords, andList,
} from "./naming.js?v=2.2.0";

/** The page's own words (new in 2.1; plain, describing, never judging). */
export const COPY = Object.freeze({
  title: "Stocks",
  lede: "Every holding in your plan, by its ticker and full name: the stocks, then the funds, then the coins, each A to Z. Each one shows its part of this month at your amount, and the plan's own written lines.",
  stocks: "Stocks",
  funds: "Funds",
  coins: "Coins",
  fundsIntro: "A fund holds many companies, so it has no yearly figures of its own here.",
  coinsIntro: "Coins have no company reports, so they have no yearly figures.",
  fieldMode: "In your field months, your fields buy the companies you ticked, so the plan's own stocks may have no order in them.",
  noSet: "Its yearly figures appear here once the open-data list is published.",
  noSetIntro: "Yearly figures for these stocks appear here once the open-data list is published.",
  notInList: "The open data's company list does not hold it, so no yearly figures are shown for it here.",
  loading: "Loading its figures.",
  noPrices: "Share prices are not part of the open data this site uses.",
  bothSides: "Facts from both sides",
  companyPage: "Its company page",
  noCeiling: "None",
  notTrading: "Not trading yet",
  noOrder: (m) => `No order in ${m}.`,
  theYear: "Over your year",
  thisMonth: (m) => `In ${m}`,
});

const KIND_OF_GROUP = { crypto: "coin", index: "fund" };
/** stock, fund or coin: a coin by its group, a fund by its group or its whole-share London listing, else a stock. */
export function kindOf(i) {
  if (!i) return "stock";
  if (KIND_OF_GROUP[i.group]) return KIND_OF_GROUP[i.group];
  if (i.orderStyle === "whole_usd" || i.venue === "LSE") return "fund";
  return "stock";
}

const VENUE_WORDS = { LSE: "London Stock Exchange, in US dollars", US: "A US exchange", CRYPTO: "Crypto" };
/** A to Z by the full name as shown (never re-cased): case and accents aside. */
const byName = (a, b) => a.sortName.localeCompare(b.sortName, "en", { sensitivity: "base" }) || a.key.localeCompare(b.key);

// ---------------------------------------------------------------- the holdings, as rows of the page

/** The month this page speaks of: the order date the desk opens on (the next one with open orders), else the last. */
function focusDate() {
  const sch = schedule();
  return autoDeskDate(sch) || sch.dates[sch.dates.length - 1] || null;
}

/**
 * What one drawing of the page needs from the plan, worked out once (review finding UI-1): the month it speaks of,
 * its words, its dollars, and the joined plan's orders grouped by instrument.
 */
function pageContext() {
  const d = focusDate();
  const r = d ? monthOf(d.id) : null;
  const byInst = new Map();
  for (const o of joinedPlan().orders) {
    const list = byInst.get(o.instrument);
    if (list) list.push(o); else byInst.set(o.instrument, [o]);
  }
  const dayOf = new Map(schedule().dates.map((x) => [x.id, x.effective]));
  return { d, r, month: monthWord(d), monthCents: r && Number.isFinite(r.usd) ? Math.round(r.usd * 100) : 0, byInst, dayOf, day: dayWordsOnce, money: usdWords };
}

// The same words as core's dayShort ("Tue 10 Nov") and fM ("$1,234", "$137.50", "−$5"), from formatters made once:
// core's build a new formatter on each call, and this page names many amounts and dates (review finding UI-1).
const DAY_FMT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const USD_FMT = [0, 2].map((dp) => new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }));
function dayWordsOnce(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return Number.isFinite(d.getTime()) ? DAY_FMT.format(d) : "—";
}
function usdWords(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  const c = Math.round(Math.abs(x) * 100);
  return (x < 0 && c ? "−$" : "$") + USD_FMT[c % 100 ? 1 : 0].format(c / 100);
}

const centsOf = (os) => os.reduce((a, o) => a + Math.round((o.usd || 0) * 100), 0);

/** The plan's (and the friend's) orders of one instrument: this month's dollars, and the year's. */
function amountsOf(id, cx) {
  const mine = (id && cx.byInst.get(id)) || [];
  const month = cx.d ? mine.filter((o) => o.dateId === cx.d.id) : [];
  return { monthCents: centsOf(month), yearCents: centsOf(mine), dates: [...new Set(mine.map((o) => o.date || cx.dayOf.get(o.dateId)))].filter(Boolean) };
}

/** The ticked companies of the friend's fields ({ id, saved name, fields }) in field mode, else none. */
function tickedCompanies() {
  if (!fieldMonthsOn()) return [];
  const spec = fieldsSpecNow();
  const f = savedFields();
  const names = (f && f.names) || (spec && spec.names) || {};
  const lists = (spec && spec.lists) || {};
  const out = new Map();
  for (const [field, ids] of Object.entries(lists)) {
    for (const id of Array.isArray(ids) ? ids : []) {
      const cur = out.get(id) || { id, name: names[id] || { n: (instById(id) || {}).name || id }, fields: [] };
      cur.fields.push(field);
      out.set(id, cur);
    }
  }
  return [...out.values()];
}

/** Every row of the page: { key, kind, sortName, inst?, lock?, ticked? }. */
function rowsOf() {
  const base = new Set(app.base.instruments.map((i) => i.id));
  const rows = app.plan.instruments.filter((i) => base.has(i.id)).map((i) => ({ key: i.id, kind: kindOf(i), sortName: N.fullNameOf(i) || i.id, inst: i }));
  const e = lockEntry();
  const L = lockNow();
  const lockId = (L && L.id) || (e && e.id) || null;
  const ticked = tickedCompanies();
  const lockRow = { key: "lock", kind: "stock", sortName: N.fullNameOf(lockSubject()) || LK.LOCK_NAME, lock: true, inst: (app.plan.instruments || []).find((i) => LK.isLockInst(i)) || null, alsoIn: [] };
  rows.push(lockRow);
  for (const c of ticked) {
    if (lockId && c.id === lockId) { lockRow.alsoIn = c.fields; continue; }
    rows.push({ key: c.id, kind: "stock", sortName: (c.name && c.name.n) || c.id, ticked: c, inst: instById(c.id) || null });
  }
  return rows;
}

// ---------------------------------------------------------------- one holding

const monthWord = (d) => (d ? monthName(d.effective, false, true) : "this month");
const pctOfMonth = (cents, monthCents) => (monthCents > 0 ? fNum((cents / monthCents) * 100, 1) : "0");

/** Why a plan holding has no order in the friend's year (mix.notBought), in the Holdings page's words. */
function notBoughtWords(id) {
  const why = notBought(id);
  if (!why) return null;
  switch (why.kind) {
    case "mix": return "Not in your mix: its share is in VWRA.";
    case "fields": return "Not in your fields: your field months buy your own companies.";
    case "waiting": return "Not trading yet: its part goes to your other companies or VWRA.";
    case "mix-from": return `Not in your mix from ${notBoughtMonth(why)}.`;
    case "fields-from": return `Not in your fields from ${notBoughtMonth(why)}.`;
    default: return "Not bought at your amount: its share is in a VWRA order.";
  }
}

/** The plan's ceiling for an instrument, as the order desk shows it ("$243", "27 Nov close + 10%", "None"). */
function ceilingWords(i) {
  if (!i || !i.ceiling) return COPY.noCeiling;
  const c = ceilingOf(i);
  const v = fmtCeil(c, i);
  if (v === "None") return COPY.noCeiling;
  return c.value != null ? `At most ${v} a share (plan rule r1)` : `At most the ${v}, a share (plan rule r1)`;
}

/** dt/dd pairs, skipping empty ones. */
function facts(pairs) {
  return h("dl.st-facts", pairs.filter((p) => p && p[1] != null && p[1] !== "").map(([k, v, fk]) => [h("dt", k), h("dd", fk ? { "data-st-line": fk } : {}, v)]));
}

/** "$45, 9% of the month" and "$540 over 12 order dates", or why there is none. */
function moneyPairs(row, cx) {
  const i = row.inst;
  const a = i ? amountsOf(i.id, cx) : { monthCents: 0, yearCents: 0, dates: [] };
  const m = cx.month;
  const month = a.monthCents > 0 ? `${cx.money(a.monthCents / 100)}, ${pctOfMonth(a.monthCents, cx.monthCents)}% of the month` : COPY.noOrder(m);
  const year = a.yearCents > 0
    ? `${cx.money(a.yearCents / 100)} on ${plural(a.dates.length, "order date")}${a.dates.length && a.dates.length <= 3 ? ` (${a.dates.map(cx.day).join(", ")})` : ""}`
    : (i && notBoughtWords(i.id)) || "No order in your year.";
  return [[COPY.thisMonth(m), month, "month"], [COPY.theYear, year, "year"]];
}

/** The plan's own written lines for a holding: "Held because" and "Still holds if" (as the Rules page shows them). */
function thesisPairs(i) {
  const t = i ? (app.plan.thesis || []).find((x) => x.instrument === i.id) : null;
  return t ? [["Held because", t.heldBecause, "held"], ["Still holds if", t.holdsIf, "holds"]] : [];
}

function metaLine(row) {
  const i = row.inst;
  if (row.ticked) {
    const n = row.ticked.name || {};
    const where = n.v || (i && i.exchange) || "A US exchange";
    return [`${where} · Interactive Brokers`, `On your list in ${andList(row.ticked.fields.map(fieldName))}`].join(" · ");
  }
  return `${VENUE_WORDS[i.venue] || i.venue} · ${accountLabel(i.account)}`;
}

function itemHead(row, x, extra) {
  const id = `st-h-${String(row.key).replace(/[^A-Za-z0-9-]/g, "")}`;
  return h("header.st-head", h("h3.st-name", { id }, nameEl(x, { masked: !!row.ticked })), extra || null);
}

/** One plan holding or ticked company: name, where, money, ceiling, the plan's lines, then its figures. */
function holdingItem(row, cx) {
  const i = row.inst;
  const x = row.ticked ? { ticker: row.ticked.name.t || null, name: row.ticked.name.n || row.key } : i;
  const pairs = [...moneyPairs(row, cx)];
  if (!row.ticked) pairs.push(["Ceiling", ceilingWords(i), "ceiling"], ...thesisPairs(i));
  return h("li.st-item", { "data-st": row.key, "data-kind": row.kind, "aria-labelledby": `st-h-${String(row.key).replace(/[^A-Za-z0-9-]/g, "")}` },
    itemHead(row, x),
    h("p.st-meta", metaLine(row)),
    facts(pairs),
    row.kind === "stock" ? figuresHost(row) : null);
}

// ---------------------------------------------------------------- the locked 10% (addendum B.6, G)

/**
 * The locked listing's money in the friend's plan, read from the plan's own orders (review finding M2): this month's
 * and the year's dollars of its orders, the part of them that is the locked 10%, and the rest, which a field list
 * that still holds it (a state saved before 2.1's lock; fields.js no longer lets it be ticked) adds to the same order.
 */
function lockMoney(L, e, cx) {
  const id = (L && L.id) || (e && e.id) || null;
  const a = amountsOf(id, cx);
  const months = L ? Object.entries(L.months || {}) : [];
  const lockOrdered = (r) => (r && r.to === "order" ? r.orderCents || 0 : 0);
  const mrec = cx.d && L && L.months ? L.months[cx.d.id] : null;
  const yearLock = months.reduce((x, [, r]) => x + lockOrdered(r), 0);
  return {
    tenth: months.reduce((x, [, r]) => x + (r.cents || 0), 0), months: months.length,
    monthCents: a.monthCents, monthLock: lockOrdered(mrec), monthList: Math.max(0, a.monthCents - lockOrdered(mrec)),
    yearCents: a.yearCents, yearLock, yearList: Math.max(0, a.yearCents - yearLock),
  };
}

/** Anthropic, locked at 10% of each month: the same row as any stock, its two factual chips, this month's 10% and
 *  where it goes (with its date line), the year, the "as written" line, then its facts like every other company's. */
function lockItem(row, cx) {
  const L = lockNow();
  const e = lockEntry();
  const subject = lockSubject();
  const m = cx.d ? lockMonthWords(app.plan, cx.d.id) : null;
  const month = cx.month;
  const mo = lockMoney(L, e, cx);
  // a field list that still holds it (only a state saved before 2.1's lock): the lists named, for its extra part
  const lists = mo.yearList > 0 && row.alsoIn && row.alsoIn.length ? andList(row.alsoIn.map(fieldName)) : null;
  const fromList = (c) => `${fM(c / 100)} from your list in ${lists || "your fields"}`;
  let monthLine;
  const fromDate = L ? (app.base.orderDates.find((x) => x.id === L.from) || {}).date : null;
  if (!m) monthLine = fromDate ? `Not part of ${month}: in your plan the 10% starts in ${monthName(fromDate, false, true)}.` : `Not part of ${month}.`;
  else if (m.trading && m.m.orderCents && mo.monthList > 0) {
    monthLine = `${fM(mo.monthCents / 100)}, ${pctOfMonth(mo.monthCents, cx.monthCents)}% of the month: ${fM(mo.monthLock / 100)}, its locked 10%, and ${fromList(mo.monthList)}.`;
  } else if (m.trading && m.m.orderCents) monthLine = `${fM(m.m.orderCents / 100)}, ${m.text.charAt(0).toLowerCase()}${m.text.slice(1)}`;
  else monthLine = `${fM(m.m.cents / 100)}, 10% of the month. ${m.text} ${lockDateLine(e)}${mo.monthList > 0 ? ` Also ${fromList(mo.monthList)}, as an order of its own.` : ""}`;
  // the year: every joined lock month's 10%, how much of it became orders, and any part a field list adds
  const rest = mo.tenth - mo.yearLock;
  const year = !mo.months ? "No month of your year holds it."
    : mo.yearList > 0 ? `${fM(mo.yearCents / 100)} as its own orders over your year: ${fM(mo.yearLock / 100)} of it the locked 10%, and ${fromList(mo.yearList)}.${rest > 0 ? ` The other ${fM(rest / 100)} of its 10% goes to VWRA.` : ""}`
      : mo.yearLock ? `${fM(mo.tenth / 100)} in all, 10% of each month; ${fM(mo.yearLock / 100)} of it as its own orders, the rest with VWRA.`
        : `${fM(mo.tenth / 100)} in all, 10% of each month. Until it trades, each month's 10% goes to VWRA.`;
  const traded = !!(L && L.first && L.exchange);
  const where = traded ? `${L.exchange} · Interactive Brokers` : `${COPY.notTrading} · Interactive Brokers`;
  return h("li.st-item", { "data-st": "lock", "data-kind": "stock", "data-lock": L ? L.key : LK.LOCK_KEY, "aria-labelledby": "st-h-lock" },
    itemHead({ key: "lock" }, subject, lockChips(e)),
    h("p.st-meta", [where, lists ? `On your list in ${lists}` : null].filter(Boolean).join(" · ")),
    facts([[COPY.thisMonth(month), monthLine, "month"], [COPY.theYear, year, "year"], ["Share", LK.LOCK_COPY.share, "share"], ["Ceiling", COPY.noCeiling, "ceiling"]]),
    book.note(LK.LOCK_COPY.asWritten),
    lockFigures(e));
}

/** The locked listing's facts from the upcoming list: where it stands, the reported timing while it waits (an
 *  estimate with its date and sources, never a prediction), when it was last checked, and both sides. */
function lockFigures(e) {
  const host = h("div.st-figs", { "data-st-figs": "lock", "data-fact-surface": "" });
  if (!e) { host.append(book.note(LK.LOCK_COPY.noData)); return host; }
  host.append(book.note(FU.upcomingStatusWords(e)));
  if (FU.upcomingTimingShown(e)) {
    host.append(book.note(FU.upcomingTimingWords(e)));
    const est = e.estimate && Array.isArray(e.estimate.sources) ? e.estimate.sources.filter((x) => x && x.url) : [];
    if (est.length) {
      host.append(h("div.st-sources", book.fold({ summary: FU.UPCOMING_COPY.timingSources, children: book.linkList({ label: FU.UPCOMING_COPY.timingSources, items: est.map((x) => ({ text: x.label, meta: FU.dayWords(x.date), url: x.url })) }) })));
    }
  }
  const checked = FU.upcomingCheckedWords(e);
  if (checked) host.append(book.note(checked));
  const card = FU.spreadOf(e.facts);
  if (card.well.length && card.wrong.length) host.append(bothSides("lock", card, [e.name, e.short].filter(Boolean)));
  if (universeOn() && e.id) host.append(companyLink(e.id, "lock"));
  return host;
}

// ---------------------------------------------------------------- a stock's figures (addendum E, data-records.md)

/** A closed fold "Facts from both sides"; its spread is built when it first opens (review finding UI-1: the page has
 *  one fold for each stock, and building them all up front made the tab switch one long task). */
function bothSides(key, card, masks) {
  let built = false;
  const f = book.fold({
    summary: COPY.bothSides,
    onToggle: (open) => {
      if (!open || built) return;
      built = true;
      const body = f.querySelector(".bk-fold-body") || f;
      body.append(book.bookSpread({ well: card.well, wrong: card.wrong, masks, level: 4, compact: true }));
    },
  });
  const s = f.querySelector("summary");
  if (s) s.setAttribute("data-fk", `st-sides-${key}`);
  return f;
}

function companyLink(id, key) {
  return h("p.st-link", h("a.link-arrow", { href: FU.companyHref(id), "data-fk": `st-co-${key}` }, COPY.companyPage, h("span", { "aria-hidden": "true" }, " →")));
}

let searchMemo = null;
/** The open data's company id for a plan stock, by its ticker in search.json; a ticked company is its own id. */
async function companyIdFor(row) {
  if (row.ticked) return row.key;
  const t = N.tickerOf(row.inst);
  if (!t) return null;
  if (!searchMemo) searchMemo = D.loadSearch().catch((e) => { searchMemo = null; throw e; });
  const s = await searchMemo;
  const hit = ((s && s.items) || []).find((r) => Array.isArray(r.tickers) && r.tickers.includes(t));
  return hit ? hit.id : null;
}

/** The figures part of a stock: loaded when the open data is there, else the plain line. */
function figuresHost(row) {
  const host = h("div.st-figs", { "data-st-figs": row.key });
  const st = app.data;
  if (!universeOn()) {
    host.append(book.note(st && st.status === "failed" ? FU.COPY.failed : COPY.noSet));
    return host;
  }
  host.append(book.note(COPY.loading));
  (async () => {
    const id = await companyIdFor(row);
    const rec = id ? await D.loadCompany(id) : null;
    host.replaceChildren(...(rec ? figures({ id, ...rec }, row.key) : [book.note(COPY.notInList)]));
    host.dataset.ready = "true";
  })().catch((e) => {
    console.warn("a stock's figures did not load", e);
    host.replaceChildren(book.banner({ state: "problem", content: FU.COPY.failed }));
    host.dataset.ready = "true";
  });
  return host;
}

/** A record's years in the shared shape (fieldsui yearTable), drawn here only while that export is not there. */
function yearsOf(rec) {
  if (typeof FU.yearTable === "function") return FU.yearTable(rec);
  if (!Array.isArray(rec.years)) return null;
  const cur = (rec.rule && rec.rule.unit) || null;
  const money = (v) => (typeof v === "number" && Number.isFinite(v) ? moneyWords(v, cur) : "Not reported");
  return {
    columns: ["Period", "Ended", `Sales${cur ? ` (${cur})` : ""}`, `Profit${cur ? ` (${cur})` : ""}`],
    rows: rec.years.map((y) => ({ end: y.end, ttm: y.ttm === true, period: `${y.ttm ? "The 12 months to" : "The year to"} ${FU.monthWords(y.end)}`, ended: FU.dayWords(y.end), sales: money(y.sales), profit: money(y.profit) })),
    source: rec.rule && rec.rule.source ? { label: `Yearly reports via ${rec.rule.source}`, date: rec.rule.checkedOn || null, url: null } : null,
  };
}

/** The latest debt in the shared shape (fieldsui debtTable), drawn here only while that export is not there. */
function debtOf(rec) {
  if (typeof FU.debtTable === "function") return FU.debtTable(rec);
  const d = rec.debt && !rec.debt.missing ? rec.debt : null;
  const row = (id, label) => {
    const v = d ? d[id] : null;
    const has = typeof v === "number" && Number.isFinite(v);
    return { id, label, value: has ? moneyWords(v, d.currency) : "Not reported", date: has ? FU.dayWords(d.date) : "—", concept: has ? (d.concepts || {})[id] || null : null };
  };
  return { missing: !d, rows: [row("longTerm", "Long-term debt"), row("liabilities", "Total liabilities")], notes: [] };
}

const SYMBOLS = { USD: "$", EUR: "€", JPY: "¥" };
/** "$215.9 billion", "€512.6 million" (only used while fieldsui's own words are not there). */
function moneyWords(v, cur) {
  const sym = SYMBOLS[cur] || (cur ? `${cur} ` : "");
  const a = Math.abs(v), neg = v < 0 ? "−" : "";
  if (a >= 1e12) return `${neg}${sym}${(a / 1e12).toFixed(1)} trillion`;
  if (a >= 1e9) return `${neg}${sym}${(a / 1e9).toFixed(1)} billion`;
  if (a >= 1e6) return `${neg}${sym}${(a / 1e6).toFixed(1)} million`;
  return `${neg}${sym}${FU.intWords(a)}`;
}

/** A stock's figures from the open data: its years, its debt, the no-prices line, both sides, its company page. */
function figures(rec, key) {
  const out = [];
  const masks = [rec.name];
  out.push(h("p.eyebrow", "From the open data"), h("p.st-listed", h("span.st-rec-name", FU.nameEl(rec)), " ",
    book.labelChip(rec.rule ? rec.rule.label : "y5", {})));
  const t = yearsOf(rec);
  if (t && t.rows && t.rows.length) {
    const [, ended, sales, profit] = t.columns;
    out.push(h("table.bk-table.bk-years.st-years", { "data-st-years": key },
      h("caption", "Year by year, oldest first"),
      h("thead", h("tr", t.columns.map((c) => h("th", { scope: "col" }, c)))),
      h("tbody", t.rows.map((r) => h("tr", { "data-end": r.end, "data-ttm": r.ttm ? "true" : null },
        h("th", { scope: "row" }, r.period),
        h("td", { "data-label": ended }, r.ended),
        h("td", { "data-label": sales }, h("span.num", r.sales)),
        h("td", { "data-label": profit }, h("span.num", r.profit)))))));
    if (t.ttmNote) out.push(book.note(t.ttmNote));
  } else {
    out.push(book.note("The reports Tide Table reads give no yearly figures for this company."));
  }
  const dt = debtOf(rec);
  // A set from before 2.1 has no debt for a record (no rows): only its note is drawn, never an empty list.
  if (dt.rows.length) out.push(h("ul.st-debt", { "data-st-debt": key }, dt.rows.map((r) => h("li", { "data-debt": r.id },
    h("span.st-debt-label", `${r.label}: `), h("span.num", r.value), r.value !== "Not reported" && r.date && r.date !== "—" ? ` on ${r.date}` : "",
    r.concept ? h("span.st-concept", " · ", r.words ? [`${r.words} (`, h("span.bk-concept", r.concept), ")"] : h("span.bk-concept", r.concept)) : null))));
  out.push(...(dt.notes || []).map((n) => book.note(n)));
  const src = t && t.source ? t.source : null;
  if (src) out.push(book.note(`Source: ${src.label}${src.date ? `, checked on ${FU.dayWords(src.date)}` : ""}.`));
  out.push(book.note(COPY.noPrices));
  const na = rec.rule && rec.rule.label === "na";
  if (!na && rec.lines) {
    const card = FU.spreadOf(rec.lines);
    if (card.well.length && card.wrong.length) out.push(bothSides(key, card, masks));
  }
  out.push(companyLink(rec.id, key));
  return out;
}

// ---------------------------------------------------------------- the page

function sectionOf(kind, title, intro, rows, cx) {
  if (!rows.length) return null;
  const id = `st-sec-${kind}`;
  return h("section.bk-section.st-section", { "data-st-sec": kind, "aria-labelledby": id },
    book.sectionHead({ title, level: 2, id, intro }),
    h("ol.st-list", rows.sort(byName).map((r) => (r.lock ? lockItem(r, cx) : holdingItem(r, cx)))));
}

export function renderStocks() {
  const cx = pageContext();
  const { d, r } = cx;
  const rows = rowsOf();
  const stocks = rows.filter((x) => x.kind === "stock");
  const funds = rows.filter((x) => x.kind === "fund");
  const coins = rows.filter((x) => x.kind === "coin");
  const lines = [];
  if (d) lines.push(`This month here means ${cx.month}: the order date on ${dayShort(d.effective)}${r ? `, ${fM(r.usd)} at your amount` : ""}.`);
  const out = [viewHead("stocks", `${countWord(rows.length)} holdings`, COPY.title, COPY.lede)];
  for (const l of lines) out.push(book.note(l, { tone: "ink" }));
  if (fieldMonthsOn()) out.push(book.note(COPY.fieldMode));
  const idx = app.data && app.data.status === "ok" && app.data.index ? app.data.index : null;
  const planStocks = stocks.filter((x) => !x.ticked && !x.lock).length;
  const stockIntro = [
    `The written plan's ${countWord(planStocks).toLowerCase()} stocks and ${LK.LOCK_NAME}, locked at ${LK.LOCK_COPY.share}.`,
    fieldMonthsOn() && stocks.some((x) => x.ticked) ? " The companies you ticked in your fields are here too." : "",
    universeOn() && idx && idx.rule && idx.rule.text ? ` The open data lists companies with ${idx.rule.text}.` : !universeOn() ? ` ${COPY.noSetIntro}` : "",
  ].join("");
  out.push(sectionOf("stocks", COPY.stocks, stockIntro, stocks, cx));
  out.push(sectionOf("funds", COPY.funds, `The plan's ${countWord(funds.length).toLowerCase()} funds. ${COPY.fundsIntro}`, funds, cx));
  out.push(sectionOf("coins", COPY.coins, `The plan's ${countWord(coins.length).toLowerCase()} coins. ${COPY.coinsIntro}`, coins, cx));
  const fresh = idx ? FU.freshnessWords(idx.asOf) : null;
  if (fresh) out.push(book.note(fresh));
  return out.filter(Boolean);
}
