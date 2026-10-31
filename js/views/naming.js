// Names and the locked 10% in the friends' views (Tide Table 2.1, docs/tt2/ADDENDUM-2026-10-27b.md sections B.6,
// C and G; docs/tt2/build/lock-api.md 5 to 7).
//
// Every view that names a holding draws it here: "<TICKER> · <Full name>" (names.js), the ticker in a span that
// never wraps, the name in one that may, and the screen-reader words ("NVIDIA Corporation, ticker NVDA") in visually
// hidden text. The locked listing's lines come from the plan (plan.scale.lock, lock.js) and the upcoming entry
// (app.lockEntry, main.js), each with its date line and the one short "as written" line, and with the same row,
// colour and position rules as every other holding: no highlight, no badge beyond its factual chips.

import { app, h, fM, fUsd, ost, isDone, isPreOrder, instById, skippedUsd } from "../core.js?v=2.2.0";
import * as N from "../names.js?v=2.2.0";
import * as LK from "../lock.js?v=2.2.0";
import * as FU from "../fieldsui.js?v=2.2.0";
import * as book from "../book.js?v=2.2.0";

// ---------------------------------------------------------------- ticker and full name

/** { text, sr, ticker, name } for an instrument, a data row, a ticked company's saved name or an upcoming entry. */
export function named(x) {
  if (!x || typeof x !== "object") return { text: "", sr: "", ticker: null, name: null };
  // a ticked company's saved name ({ n, t, v }) reads like a data row
  if (typeof x.n === "string" && !x.name && !x.longName) return N.tickerName({ ticker: x.t || null, name: x.n });
  return N.tickerName(x);
}

/** "NVDA · NVIDIA Corporation" as plain text (titles, toasts, prose, aria-labels); the id when nothing else. */
export function nameText(x) {
  const t = named(x).text;
  return t || String((x && (x.name || x.id)) || "");
}

/** The ticker alone ("VWRA", "BTC"), for a line right under the full name; the name when it has none. */
export function tickerText(x) {
  return N.tickerOf(x) || nameText(x);
}

/**
 * The name as page text: the ticker (never cut), " · ", the full name (it may wrap), and the screen-reader words.
 * cls: extra classes for the outer span (".tn" always). masked: the name is a third party's (a data record), so the
 * fact linter leaves its words alone (data-mask, as fieldsui does).
 */
export function nameEl(x, { cls = "", masked = false } = {}) {
  const n = named(x);
  // The same parts as the shared pages' names (fieldsui nameEl): the ticker with its dot never breaks, the name wraps.
  const root = h(`span.bk-tn${cls}`, { "data-mask": masked ? "" : null, "data-ticker": n.ticker || null });
  if (n.ticker && n.name) {
    root.append(h("span.bk-tn-shown", { "aria-hidden": "true" },
      h("span.bk-tn-ticker", `${n.ticker}${N.SEP.trimEnd()}`), " ", h("span.bk-tn-name", n.name)),
    h("span.visually-hidden.bk-tn-sr", n.sr));
  } else root.append(h(n.ticker ? "span.bk-tn-ticker" : "span.bk-tn-name", n.text || String((x && x.id) || "")));
  return root;
}

/**
 * What to buy, in words (core.orderWhat with the holding named by names.js): under the full name on the desk the
 * ticker alone ("$45 of NVDA, fractional"), elsewhere ticker and full name (opts.full). A filled order says what it
 * cost, a skipped one the money that moved on, and one from before the friend joined that it is not bought.
 */
export function whatNamed(o, cr, { full = false } = {}) {
  const i = instById(o.instrument);
  const s = ost(o.id);
  const name = full ? nameText(i) : tickerText(i);
  if (isPreOrder(o.id)) return `${name}: not bought, before you joined`;
  if (s.status === "filled" && Number.isFinite(s.costUsd)) return `${fUsd(s.costUsd, 2)} of ${name} bought (plan ${fM(o.usd)})`;
  if (s.status === "skipped") return `${fUsd(skippedUsd(o, cr), 2)} of ${name}, skipped`;
  if (cr && !isDone(o.id) && o.carryTarget && cr.byOrder[o.id] && cr.byOrder[o.id].usd !== o.usd) return `${fUsd(cr.byOrder[o.id].usd, 2)} of ${name} in whole shares (plan ${fM(o.usd)}, adjusted)`;
  if (cr && !isDone(o.id) && o.cryptoWait && cr.coinUsd && Number.isFinite(cr.coinUsd[o.id]) && cr.coinUsd[o.id] !== o.usd) return `${fUsd(cr.coinUsd[o.id], 2)} of ${name} (plan ${fM(o.usd)}, what the wallet holds)`;
  return o.fractional ? `${fM(o.usd)} of ${name}, fractional` : o.wholeShares ? `${fM(o.usd)} of ${name} in whole shares` : `${fM(o.usd)} of ${name}`;
}

/** A list of names for a sentence: "A, B and C". */
export function andList(xs) {
  const a = xs.filter(Boolean);
  return a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}` : a[0] || "";
}

// ---------------------------------------------------------------- the locked 10% (lock-api.md 5, 6)

/** The plan's lock (plan.scale.lock) when some month of the friend's year holds it, else null: a plan without the
 *  lock, or one whose lock starts after its last month ("m13", lock-api.md 2), has no locked line to show. */
export function lockNow(plan = app.plan) {
  const L = LK.lockOf(plan);
  return L && L.months && Object.keys(L.months).length ? L : null;
}
/** The upcoming list's entry for the locked listing (main.js loads it), or null. */
export const lockEntry = () => app.lockEntry || null;
/** True when the entry says it trades on a US exchange (a first trading day is shown). */
export const entryListed = (e = lockEntry()) => !!LK.entryFirstTrade(e);

/**
 * What to name the locked listing by: once it trades, its ticker and full name from the plan's snapshot
 * ("ANT · Anthropic, PBC"); before that, its name alone (addendum C.3: no ticker until it trades).
 */
export function lockSubject(plan = app.plan) {
  const L = lockNow(plan);
  const e = lockEntry();
  if (L && L.ticker && L.first) return { ticker: L.ticker, longName: L.longName || (e && e.name) || L.name, name: L.name };
  return { name: (e && typeof e.name === "string" && e.name) || (L && (L.longName || L.name)) || LK.LOCK_NAME };
}

/**
 * The date line every "not trading" line carries (lock-api.md 6): when the list last checked it ("Checked by hand
 * on Tue 27 Oct 2026."), and once it is listed where it trades ("It trades as ANT on NASDAQ since Thu 19 Nov
 * 2026."). With no list at hand, LOCK_COPY.noData.
 */
export function lockDateLine(e = lockEntry()) {
  if (!e) return LK.LOCK_COPY.noData;
  const checked = FU.upcomingCheckedWords(e);
  if (e.status === "listed") return [FU.upcomingStatusWords(e), checked].filter(Boolean).join(" ");
  return checked || FU.upcomingStatusWords(e);
}

/** The factual chips of the locked listing: "Not listed yet" or "Listed", and "Outside the profit list". */
export function lockChips(e = lockEntry()) {
  const chips = FU.upcomingChips(e).map((c) => book.labelChip(c.id, { text: c.text }));
  if (e && e.status === "listed") chips.unshift(book.labelChip("listed", { text: "Listed" }));
  return h("span.bk-cluster.ttm-lock-chips", chips);
}

/**
 * True when x is the locked listing (addendum B.1: in every plan at 10% of each month, so never a field pick): fieldsui's
 * company info of an upcoming listing (upcoming.key) or of a company, a ticked company's saved name (w.k), an
 * instrument (lock), or a company id equal to the plan's lock id or the upcoming entry's id.
 */
export function isLockedListing(x) {
  if (!x) return false;
  let id = x;
  if (typeof x === "object") {
    if ((x.upcoming && x.upcoming.key === LK.LOCK_KEY) || (x.w && x.w.k === LK.LOCK_KEY) || x.lock === LK.LOCK_KEY || x.key === LK.LOCK_KEY) return true;
    id = x.id;
  }
  if (typeof id !== "string" || !id) return false;
  const L = LK.lockOf(app.plan);
  const e = lockEntry();
  return (!!L && L.id === id) || (!!e && e.id === id);
}

/** Why the locked listing cannot go on a field list (new copy for the main session to approve). */
export const lockedInPlanWords = () => `${LK.LOCK_NAME} is already in every plan at ${LK.LOCK_COPY.share}.`;

/** "10% of each month is locked in this plan for Anthropic." (the name by lockSubject: its ticker once it trades). */
export const lockShareWords = (plan = app.plan) => `${LK.LOCK_COPY.share} is locked in this plan for ${nameText(lockSubject(plan))}.`;

/** The words of a month's lock record (lock.js lockWhyText), or null when the month has none. */
export function lockMonthWords(plan, dateId) {
  const m = LK.lockMonth(plan, dateId);
  if (!m) return null;
  const L = lockNow(plan);
  return { m, id: m.why, text: LK.lockWhyText(m.why, L ? L.name : LK.LOCK_NAME), trading: m.to === "order" };
}

/**
 * The lock's "why" line for an order row (LK.lockWhy: the order the 10% became, or the VWRA order that took it this
 * month), with its date line when it says it is not trading, and the "as written" line. null for any other order.
 */
export function lockWhyLine(orderId, fk) {
  const w = LK.lockWhy(app.plan, orderId);
  if (!w) return null;
  // an order that also holds a field list's part (a list saved before 2.1's lock): which part of it is the 10%
  const o = (app.plan.orders || []).find((x) => x.id === orderId);
  const m = w.id === "lock_order" && o ? LK.lockMonth(app.plan, o.dateId) : null;
  const part = m && m.orderCents && lockOrderCents(app.plan, m) > m.orderCents ? `${fM(m.orderCents / 100)} of this order: ` : "";
  const parts = [part ? `${part}${w.text.charAt(0).toLowerCase()}${w.text.slice(1)}` : w.text];
  if (w.id !== "lock_order") parts.push(lockDateLine());
  parts.push(LK.LOCK_COPY.asWritten);
  return h("p.dr-why.ttm-lock-why", { "data-fk": fk || "lock-why-" + orderId, "data-lock": w.id }, parts.filter(Boolean).join(" "));
}

/** One month's lock line, for a month card or a list: the why words, the date line when not trading, the "as
 *  written" line (asWritten: false where the page says it once). */
export function lockMonthLine(plan, dateId, { fk, asWritten = true, cls = "p.mc-note" } = {}) {
  const w = lockMonthWords(plan, dateId);
  if (!w) return null;
  const m = w.m;
  const L = lockNow(plan);
  const total = w.trading ? lockOrderCents(plan, m) : 0;
  const lead = w.trading && m.orderCents
    ? `${nameText(lockSubject(plan))}: ${fM(m.orderCents / 100)}${total > m.orderCents ? ` of its ${fM(total / 100)} order` : ""}. ${w.text}`
    : w.text;
  const parts = [lead];
  if (!w.trading) parts.push(lockDateLine());
  if (asWritten) parts.push(LK.LOCK_COPY.asWritten);
  return h(`${cls}.ttm-lock-why`, { "data-fk": fk || `lock-${dateId}`, "data-lock": w.id, "data-lock-name": L ? L.key : "" }, parts.join(" "));
}

/** The dollars (in cents) of the order a lock month's 10% went into: more than the 10% when a field list that still
 *  holds the listing adds its part to the same order (lock.js merges them). */
function lockOrderCents(plan, m) {
  const o = m && m.order ? (plan.orders || []).find((x) => x.id === m.order) : null;
  return o ? Math.round((o.usd || 0) * 100) : 0;
}

/** The two sourced facts on the order row once it trades (LOCK_FACTS): facts with their source and date. */
export function lockFacts(fk = "lock-facts") {
  return h("div.ttm-lock-facts", { "data-fk": fk, "data-fact-surface": "" },
    h("p.eyebrow", "Two facts about a first day's order, with their sources"),
    h("ul.ttm-lock-fact-list", LK.LOCK_FACTS.map((f) => h("li", { "data-fact": f.id },
      h("span", f.text), " ",
      (f.sources || []).map((s) => h("span.ttm-lock-src", h("a.src-link", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.label), ` · ${FU.dayWords(s.date)}`))))));
}
