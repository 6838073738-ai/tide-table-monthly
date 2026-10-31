// Today: the next-step panel (brief 4.7 and 4.8.1: a wash panel with one heading, when it is, the two
// calendar chips and the main button; the steps after it in a quiet list under it), the getting-ready
// checklist, progress, alerts from the plan's own rules, and the order desk with its fill and skip dialogs.

import {
  app, h, icon, toast, ui, L, S, $, svg, hooks, prices, now, today, ost, isDone, instById, rule,
  schedule, funding, carry, fxInfo, priceInfo, priceSource, ceilingOf, orderCeiling,
  fM, fUsd, fThb, fNum, fPct, fPrice, long, short, inDays, parseNum, bkkTime, timeLabel, fmtQty, qtyWords, monthName, dayShort,
  autoDeskDate, dateOfId, ordersOn, orderWhat, adjustFor, nextCarryTarget, howTo, statusPill, ceilPill, fmtCeil, STATUS_PILL, pill,
  card, cardHead, ruleQuote, disclosure, field, afterRender, sourceLink, commit, modal, confirmDialog, plural,
  pre, isPreOrder, isPreTransfer, isPreDate, joinedPlan, joinedBudgetUsd, progressNow, coinQty, leftoverText, coinMinUsd, skippedUsd,
  copyDue, exportState, howOf, dateNotesFor, openMonthIds, isBoughtInst, prepNotNeeded,
  tickerOf, isFieldInst, universeOn, hasFieldMonths, fixed, monthOf, dtfOf,
} from "../core.js?v=2.2.0";
import { ownIdMonth } from "../scale.js?v=2.2.0";
import { orderWhy, waitingWhy } from "../split.js?v=2.2.0";
import * as book from "../book.js?v=2.2.0";
import * as FU from "../fieldsui.js?v=2.2.0";
import * as D from "../datafiles.js?v=2.2.0";
import { fieldName } from "../fields-catalog.js?v=2.2.0";
import { monthAmountLink } from "./amounts.js?v=2.2.0";
import { splitLine } from "./split.js?v=2.2.0";
import { upcomingChecked } from "./fields.js?v=2.2.0";
import * as LK from "../lock.js?v=2.2.0";
import { nameEl, nameText, whatNamed, lockWhyLine, lockFacts } from "./naming.js?v=2.2.0";
import { typedKey } from "../store.js?v=2.2.0";
import { recordedPaid, deskPrice } from "../tracker.js?v=2.2.0";
import { growthCard } from "./growth.js?v=2.2.0";
import * as ALM from "./almanac.js?v=2.2.0";

/** The one-time panel for a friend with records, on their first 2.0 visit (spec 8.2), is remembered here. */
const INTRO_KEY = "ttm:fields-intro";
const INTRO_TEXT = "You can now choose fields for the months that have no records yet. Your months with records stay as they are.";
const CHAPTER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** A VWRA order of $0 (an own mix that leaves it nothing) with nothing carried into it: it is there to take
 *  leftovers and the rules' carries, and reads "VWRA: takes any leftover". */
const takesLeftover = (o, cr) => !!o.carryTarget && !(o.usd > 0) && !isDone(o.id) && !(cr && cr.byOrder[o.id] && cr.byOrder[o.id].usd > 0);
/** What to buy, in words (naming.whatNamed: core.orderWhat with the holding by ticker, or by ticker and full name
 *  where no name line is above it), with a $0 VWRA order as "VWRA: takes any leftover". */
const whatOf = (o, cr, full = false) => (takesLeftover(o, cr) ? `${instById(o.instrument).id}: takes any leftover` : whatNamed(o, cr, { full }));

/** The getting-ready items that apply to this friend's plan (a SwissBorg item is not needed without coins; the
 *  thesis checks and the 27 Nov closes are not needed when the plan buys none of those holdings). */
const prepNeeded = () => app.plan.prep.filter((p) => !prepNotNeeded(p.id));
/** The checklist in a few words, naming the thesis checks only when the friend's plan needs them. */
function prepSummary() {
  const thesis = app.plan.prep.find((p) => /^Thesis checks\b/.test(p.text));
  return thesis && !prepNotNeeded(thesis.id)
    ? "Accounts, a practice run, the thesis checks and your calendar, before any money moves."
    : "Accounts, a practice run and your calendar, before any money moves.";
}
/** An instrument with a ceiling still to set on 27 Nov, among the ones the friend's plan buys. */
const ceilingPending = () => app.plan.instruments.filter((i) => isBoughtInst(i.id) && ceilingOf(i).kind === "pending");

const EVENT_KIND = { order: "Order date", funding: "Money must arrive", send: "Send money", milestone: "Plan date", prep: "Getting ready" };
const VENUE_SHORT = { LSE: "London", US: "US", CRYPTO: "Crypto" };
const dest = (to) => (to === "IBKR" ? "Interactive Brokers" : to);
/** A send day, an arrive-by day, the checklist deadline or a plan date: shown by date, all day long. */
const isDayEvent = (e) => e.kind !== "order" && !!e.untimed;

// ---------------------------------------------------------------- events

/** The plan's next events (logic.nextEvents) with friendlier titles, and the ones still open. */
function planEvents() {
  const st = S();
  const fund = funding();
  const tidOf = (e) => e.id.replace(/-send$/, "");
  const all = L.nextEvents(app.plan, {}, st, 0, fund)
    .filter((e) => !((e.kind === "send" || e.kind === "funding") && isPreTransfer(tidOf(e)))) // before the friend joined
    .map((e) => {
      const t = fund.transfers.find((x) => x.id === tidOf(e));
      if (e.kind === "send" && t) return { ...e, forDate: t.forDate, title: `Send the money for ${monthName(dateOfId(t.forDate), false, true)}` };
      if (e.kind === "funding" && t) return { ...e, forDate: t.forDate, title: `The money for ${monthName(dateOfId(t.forDate), false, true)} must arrive` };
      if (e.kind === "prep") return { ...e, title: "Finish getting ready", summary: prepSummary() };
      return e;
    });
  const fs = st.funding || {};
  // November has two transfers with the same dates: one event each for sending and arriving is enough
  // (the hero lists every transfer of the month, see moneyGroup).
  const seen = new Set();
  const open = all.filter((e) => {
    if (e.kind === "send" || e.kind === "funding") {
      const s = fs[tidOf(e)];
      const pending = e.kind === "send" ? !s || !s.status || s.status === "todo" : !s || s.status !== "arrived";
      if (!pending) return false;
      const key = `${e.kind}|${e.date}|${e.forDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }
    if (e.kind === "order") return ordersOn(e.id).some((o) => !isDone(o.id));
    if (e.kind === "prep") return prepNeeded().some((p) => !st.prep[p.id]);
    if (e.kind === "milestone") return ceilingPending().length > 0;
    return true;
  });
  return { all, open, fund };
}

export function stopTodayTicker() {
  if (app.todayTimer) { clearInterval(app.todayTimer); app.todayTimer = null; }
}

/** The next-step panel's main button (the screen's one filled button, book.js button()). */
function mainButton(label, href, fk, onClick) {
  const b = book.button({ label, href, onClick });
  b.setAttribute("data-fk", fk);
  return b;
}

const CAL_WHAT = { order: "Order day", funding: "Money arrives", send: "Send money", prep: "Getting ready", milestone: "Plan date" };
/** Two calendar-page chips (brief G6): the next day money must arrive and the next order day, with "in N days". */
function calendarChips(future, td) {
  const pick = [future.find((e) => e.kind === "funding"), future.find((e) => e.kind === "order")].filter(Boolean)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!pick.length) return null;
  return h("div.hero-cal", { "data-fk": "hero-cal" }, pick.map((e) => {
    const p = ui.dayParts(e.date);
    return book.calendarChip({ day: p.day, date: p.date, what: CAL_WHAT[e.kind] || "Plan date", when: inDays(L.daysBetween(td, e.date)), full: ui.dateWordsFull(e.date) });
  }));
}

/**
 * The open data's notices on Today (spec 8.8, Appendix C): for a friend with fields, the facts did not load or
 * are old; a newer app is out; and once, for a friend whose records predate fields, that fields can now be chosen.
 */
function dataNotices() {
  const out = [];
  const st = app.data;
  const withFields = hasFieldMonths();
  if (st && st.status === "failed" && withFields) out.push(book.banner({ state: "problem", content: FU.COPY.failed }));
  if (st && st.status === "ok") {
    if (st.stale && withFields) {
      const p = FU.bangkokParts(st.asOf);
      out.push(book.banner({ state: "wait", content: `These facts were rebuilt on ${p ? FU.dayWords(p.date) : "—"}, ${FU.intWords(st.days ?? 0)} days ago. Tide Table rebuilds them every morning when its sources answer.` }));
    }
    if (st.newer) out.push(book.banner({ state: "info", content: "A newer Tide Table is out. Reload the page." }));
  }
  let seen = false;
  try { seen = localStorage.getItem(INTRO_KEY) === "1"; } catch { /* storage blocked */ }
  if (universeOn() && !withFields && fixed().size > 0 && !seen) {
    const choose = book.textButton({ label: "Choose fields", href: "#/fields" });
    choose.setAttribute("data-fk", "intro-fields");
    const later = book.textButton({ label: "Not now", onClick: () => {
      try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* blocked */ }
      const p = document.querySelector('[data-fk="fields-intro"]');
      if (p) p.remove();
      const hd = document.getElementById("h-today");
      if (hd) hd.focus({ preventScroll: true });
    } });
    later.setAttribute("data-fk", "intro-later");
    const b = book.banner({ state: "info", content: INTRO_TEXT, actions: [choose, later] });
    b.setAttribute("data-fk", "fields-intro");
    out.push(b);
  }
  return out;
}

/** The twelve months as chapter pages (brief 4.8.1), each opening its order date on the desk; then "So far". */
function chapterPages({ large = false } = {}) {
  const sch = schedule();
  const auto = autoDeskDate(sch);
  const pages = sch.dates.map((d, k) => {
    const r = monthOf(d.id);
    const os = sch.orders.filter((o) => o.dateId === d.id);
    const before = isPreDate(d.id);
    const done = !before && os.length > 0 && os.every((o) => isDone(o.id));
    const status = done ? "done" : auto && auto.id === d.id ? "now" : "later";
    const el = book.chapterPage({
      index: k + 1, month: monthName(d.effective, true), full: monthName(d.effective), large,
      amount: before ? "—" : r ? fM(r.usd) : fM(app.plan.funding.monthlyUsd), status,
      word: before ? "Before you joined" : undefined, onOpen: () => openDesk(d.id),
    });
    const b = el.querySelector("button");
    if (b) b.setAttribute("data-fk", "chap-" + d.id);
    return el;
  });
  return book.chapterList({ pages, large });
}
export { chapterPages };

export function renderToday() {
  const plan = app.plan;
  const st = S();
  const { open, fund } = planEvents();
  const t = now();
  const td = today();
  const todayOrder = open.find((e) => e.kind === "order" && e.date === td);
  // A day event stays next for all of its day: the plan gives a send day no clock time.
  const future = open.filter((e) => (isDayEvent(e) ? e.date >= td : e.at > t));
  const next = todayOrder || future[0] || null;
  const name = st.profile && st.profile.name;
  // The chapter heading (brief 4.8.1): the month of the next order date (or the last one), as a chapter of the year.
  const sch0 = schedule();
  const focusDate = autoDeskDate(sch0) || sch0.dates[sch0.dates.length - 1];
  const k = Math.max(0, sch0.dates.findIndex((d) => d.id === focusDate.id));
  // The glass almanac (addendum 2026-10-28 B): the hero box heads the first screen, the night plate with the wheel of
  // the heavens, where js/hero.js may grow the 3D armillary; the heading stands alone under it, and the next-step
  // panel keeps the calm zone's distance from the box with the heading between them. The frontispiece opens My year,
  // not this page (views/almanac.js).
  const box = ALM.hero();
  afterRender(() => ALM.mountHero(box));
  const out = [
    box,
    book.openingHead({
      kicker: `Chapter ${CHAPTER_WORDS[k] || String(k + 1)}`, title: monthName(focusDate.effective, false, true), level: 1, id: "h-today",
      lines: [h("span.greet", name ? `Hello, ${name}.` : "Hello.", h("span.greet-date", ` Today is ${dtfOf("greet-date", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Bangkok" }).format(new Date(t))}.`))],
    }),
  ];

  // ---- the next-step panel (brief 4.7 and 4.8.1): a wash panel with one heading, the when
  // line, the two calendar chips and the main button. What comes after it is a quiet list under the panel.
  let kids;
  let after = null;
  if (next) {
    const money = next.kind === "send" || next.kind === "funding" ? moneyGroup(next, fund, st) : null;
    // Money due with a transfer still to send: say "Send" until it is marked sent.
    const title = money && next.kind === "funding" && money.toSend ? `Send the money for ${monthName(dateOfId(next.forDate), false, true)}` : next.title;
    const isToday = next === todayOrder;
    const count = h("span.hero-count", { "data-fk": "hero-count" }, ` · ${countWords(next, isToday)}`);
    const todo = heroTodo(next, fund, st, money);
    kids = [
      h("p.eyebrow", isToday ? "Today · order day" : `${next.date === td ? "Today" : "Next"} · ${EVENT_KIND[next.kind] || "Event"}${next.step ? " · step " + next.step : ""}`),
      h("h2.bk-h2#next-title", title),
      h("p.hero-when", h("span", long(next.date)), heroWhen(next), count),
      // The main button comes right under the heading and its date (style brief F8: a phone shows both on its first
      // screen with the hero box above them); what the step involves follows it.
      todo && todo.button,
      calendarChips(future, td),
      // The plan's summary quotes plan amounts: left out when a rule for differences changed one of them
      // (the list below shows the amounts that apply), and for a month's money with several transfers.
      next.summary && (!money || money.group.length === 1) && !(next.kind === "order" && ordersOn(next.id).some((o) => !isDone(o.id) && adjustFor(o, carry()) !== 0))
        ? h("p.hero-summary", next.summary) : null,
      todo && todo.body,
    ];
    after = afterList(future.filter((e) => e !== next).slice(0, 4), td);
    afterRender(() => startTodayTicker(count, next, isToday));
  } else {
    const left = schedule().orders.filter((o) => !isDone(o.id)).sort((a, b) => a.at - b.at);
    const last = plan.orderDates[plan.orderDates.length - 1];
    if (left.length) {
      // Every date has passed but some orders were never logged: the year is not complete yet.
      const dates = [...new Set(left.map((o) => o.dateId))];
      kids = [h("p.eyebrow", "Every order date has passed"), h("h2.bk-h2#next-title", `${plural(left.length, "order")} still open`),
        mainButton("Open the order desk", "#desk", "hero-desk", (e) => { e.preventDefault(); openDesk(dates[0]); }),
        h("p.hero-summary", `${dates.map((d) => short(dateOfId(d))).join(", ")}: log each fill, or record a skip, so your records are complete.`)];
    } else if (!joinedPlan().orders.length) {
      kids = [h("p.eyebrow", "Before you joined"), h("h2.bk-h2#next-title", "The plan's twelve months had passed."),
        h("p.hero-summary", "Nothing is due. The plan's maintenance calendar is on the Rules page."),
        h("a.link-arrow", { href: "#/rules", "data-fk": "hero-maint" }, "The maintenance calendar →")];
    } else {
      kids = [h("p.eyebrow", "Year one complete"), h("h2.bk-h2#next-title", "Every order is done."),
        h("p.hero-summary", ((plan.dateNotes || {})[last.id] || [])[0] || "The maintenance calendar takes over."),
        h("a.link-arrow", { href: "#/rules", "data-fk": "hero-maint" }, "The maintenance calendar →")];
    }
  }
  const panel = book.washPanel({ live: true, as: "section", labelledBy: "next-title", children: kids });
  panel.classList.add("ttm-step");
  panel.setAttribute("data-fk", "next-step");
  out.push(panel);
  // the open data's notices come right under the next step, so the first screen keeps the step and its button with
  // the hero box above them (style brief F8)
  out.push(...dataNotices());
  if (after) out.push(after);

  out.push(keepCopyCard());
  out.push(readyCard());
  out.push(renderProgress(st));
  // 2.2 (addendum c.D.3): the growth tracker's short card, "on time, never sold" (views/growth.js)
  out.push(growthCard());
  out.push(renderAlerts());
  out.push(renderDesk());
  const pr = progressNow();
  out.push(h("section.bk-section.ttm-chapters", { "aria-labelledby": "today-year-h" },
    book.sectionHead({ title: "Your year, chapter by chapter", level: 2, id: "today-year-h" }),
    chapterPages(),
    book.note(`So far: ${pr.done + pr.skipped} of ${plural(pr.total, "order")} done.`, { tone: "ink" })));
  const fresh = app.data && app.data.status === "ok" && hasFieldMonths() ? FU.freshnessWords(app.data.index.asOf) : null;
  out.push(h("div.bk-section.bk-stack.ttm-records",
    book.note(["Your records live only in this browser. ", h("a", { href: "#/settings", "data-fk": "records-copy" }, "Save a copy"), "."]),
    fresh ? book.note(fresh) : null));
  return out;
}

// Only the time is a figure (IBM Plex Mono, addendum d.B.2); the words round it stay in the body face.
function heroWhen(next) {
  if (!next.untimed) return h("span", " · ", h("span.num", bkkTime(next.at)), " Bangkok time");
  if (next.kind === "order") return h("span", " · any time that day");
  if (next.kind === "funding" || next.kind === "prep") return h("span", " · by ", h("span.num", "17:00"), " Bangkok time");
  return null;
}
/** An order's time as a figure (span.num), or "Any time" in words (word: its class, not the figure face). */
const timeCell = (o, cls, word) => (o.time === "any" ? h(`${cls}${word || ""}`, timeLabel(o)) : h(`${cls}.num`, timeLabel(o)));

/**
 * Every transfer behind a send or arrive-by event: all of that day's transfers still to send, or all of
 * that month's transfers not yet arrived (November has two). toSend: one of them is not marked sent.
 */
function moneyGroup(next, fund, st) {
  const fs = st.funding || {};
  const stOf = (t) => (fs[t.id] && fs[t.id].status) || "todo";
  const tr = fund.transfers.find((x) => x.id === next.id.replace(/-send$/, ""));
  if (!tr) return null;
  const group = fund.transfers.filter((t) => !t.preJoin && (next.kind === "send"
    ? t.send === tr.send && stOf(t) === "todo"
    : t.forDate === tr.forDate && t.arriveBy === tr.arriveBy && stOf(t) !== "arrived"));
  return { group, stOf, toSend: group.some((t) => stOf(t) === "todo") };
}

/**
 * What the next step involves (body: div.hero-todo) and its main button, apart: the panel puts the button right under
 * its heading and date, and the body after the calendar chips (style brief F8). Null for a step with neither.
 */
function heroTodo(next, fund, st, money) {
  const cr = carry();
  if (next.kind === "order") {
    const os = ordersOn(next.id).filter((o) => !isDone(o.id));
    const shown = os.slice(0, 4);
    return { body: h("div.hero-todo",
      h("ul.todo-list", shown.map((o) => h("li", timeCell(o, "span.todo-time"), h("span.todo-acct", o.account), h("span.todo-what", whatOf(o, cr, true))))),
      os.length > shown.length ? h("p.muted.small", `+ ${os.length - shown.length} more on the order desk below`) : null),
    button: mainButton("Open the order desk", "#desk", "hero-desk", (e) => { e.preventDefault(); openDesk(next.id); }) };
  }
  if (money) {
    const { group, stOf, toSend } = money;
    const fs = st.funding || {};
    const fx = fxInfo();
    const toDo = group.filter((t) => stOf(t) === "todo" && howOf(t));
    return { body: h("div.hero-todo",
      h("ul.todo-list.is-money", { "data-fk": "hero-transfers" }, group.map((t) => {
        const s = fs[t.id] || {};
        return h("li",
          h("span.todo-time.num", fM(t.usd)),
          stOf(t) === "todo"
            ? h("span.todo-what", `to ${dest(t.to)}`, h("span.muted", ` · about ${fThb(t.thb)} at ฿${fNum(fx.rate, 2)}`))
            : h("span.todo-what", `in ${dest(t.to)}`, h("span.muted", ` · sent${s.sentAt ? " " + short(s.sentAt) : ""}, not marked arrived yet`)));
      })),
      toDo.map((t) => h("p.muted.small", toDo.length > 1 || group.length > 1 ? `${dest(t.to)}: ${howOf(t)}` : howOf(t))),
      // Before any of the month's money goes, its amount can still change (no record fixes the month yet).
      toSend && openMonthIds().includes(next.forDate) ? monthAmountLink(next.forDate, "td-month-" + next.forDate) : null),
    button: mainButton(toSend ? "Record it on Money" : "Open Money", "#/money", "hero-money") };
  }
  if (next.kind === "prep") {
    const items = prepNeeded();
    const done = items.filter((p) => st.prep[p.id]).length;
    return { body: h("div.hero-todo",
      h("p.todo-line", h("strong", `${done} of ${items.length}`), " getting-ready checks done.")),
    button: mainButton("Open the checklist", "#ready", "hero-checklist", (e) => { e.preventDefault(); const r = $("#ready") || $("#prep-h"); if (r) { r.scrollIntoView({ behavior: ui.reducedMotion() ? "auto" : "smooth", block: "start" }); r.focus({ preventScroll: true }); } else hooks.go("rules"); }) };
  }
  if (next.kind === "milestone") {
    return { body: h("div.hero-todo",
      h("p.todo-line", "Look up each one's closing price that day, then type them in Settings.")),
    button: mainButton("Enter the closes", "#/settings", "hero-ceilings") };
  }
  return null;
}

/**
 * Open the order desk on a date and bring it into view. The desk takes the focus once Today has been drawn with it
 * (renderDesk, app.focusDesk): coming from another page, the router draws Today a frame or more later, behind the frost
 * veil, and gives the focus to its heading first, so a fixed wait could focus a desk not drawn yet (review RR-01).
 */
export function openDesk(dateId) {
  app.deskDate = dateId;
  app.focusDesk = true;
  // From another page the route draws Today, desk and all; drawn twice, the second drawing could cut the scroll short
  if (app.active !== "today") hooks.go("today");
  else hooks.invalidate("state");
}

/** After the drawing that consumes app.focusDesk, once the router has placed its own focus: the desk, in view. */
function focusDeskSoon() {
  afterRender(() => setTimeout(() => {
    const d = $("#desk");
    if (d) { d.scrollIntoView({ behavior: ui.reducedMotion() ? "auto" : "smooth", block: "start" }); d.focus({ preventScroll: true }); }
  }, 0));
}

/**
 * How far off the next step is, in words, the same count as the calendar chips: "in 18 days", "tomorrow",
 * "today", or for a step with a clock time later today "in 3 h 20 min". A send day, an arrive-by day or the
 * checklist deadline has no clock time in the plan, so it is counted in calendar days only.
 */
function countWords(next, isToday) {
  const days = L.daysBetween(today(), next.date);
  if (days > 0) return inDays(days);
  if (isToday || isDayEvent(next)) return "today";
  const rem = next.at - now();
  if (rem <= 0) return "today";
  const hh = Math.floor(rem / 3600000), mm = Math.floor((rem % 3600000) / 60000);
  return `in ${hh ? `${hh} h ` : ""}${mm} min`;
}

/** Keeps the count words current, and draws Today again once a step with a clock time has come. */
function startTodayTicker(el, next, isToday) {
  stopTodayTicker();
  const dayEvent = isDayEvent(next);
  const tick = () => {
    const w = ` · ${countWords(next, isToday)}`;
    if (el.textContent !== w) el.textContent = w;
    if (!isToday && !dayEvent && next.at - now() <= 0) { stopTodayTicker(); hooks.invalidate("time"); }
  };
  tick();
  app.todayTimer = setInterval(() => { if (!document.hidden) tick(); }, 1000);
}

/**
 * "After that": the next few steps under the panel, a quiet list, and a link to the whole year. The first step that
 * leads up to an order date carries that date's small tarot card (addendum d.B.4: by its place in time, never by what
 * it buys), the card the date has on My year too (views/almanac.js placeOf); the later steps to the same date keep the
 * card's cell empty, so one picture never runs down the column like a bullet.
 */
function afterList(after, td) {
  const dates = schedule().dates;
  const carded = new Set();
  const cardOf = (e) => {
    const place = ALM.placeOf(dates, e);
    if (place == null || carded.has(place)) return null;
    carded.add(place);
    return place;
  };
  return h("section.bk-section.ttm-after", { "aria-labelledby": "after-h", "data-fk": "hero-after" },
    book.sectionHead({ title: "After that", level: 2, id: "after-h" }),
    after.length ? h("ol.upcoming.alm-steps", after.map((e) => h("li",
      ALM.miniCard(cardOf(e)),
      h("span.up-date.num", short(e.date)),
      h("span.up-text", h("span.up-title", e.title), h("span.up-rel", `${EVENT_KIND[e.kind] || ""} · ${inDays(L.daysBetween(td, e.date))}`)))))
      : book.note("Nothing else scheduled."),
    h("a.link-arrow", { href: "#/year", "data-fk": "hero-year" }, "The whole year", h("span", { "aria-hidden": "true" }, " →")));
}

// ---------------------------------------------------------------- keep a copy

/** A copy outside the browser, asked for after an order date or two weeks without one (core.copyDue). */
function keepCopyCard() {
  const c = copyDue();
  if (!c.due) return null;
  return card(".keep-card", { "aria-labelledby": "keep-h", "data-fk": "keep-card" },
    h("div.keep-text",
      h("h2.card-title#keep-h", "Keep a copy of your records"),
      h("p.card-sub", `${c.orderDay ? `The ${short(c.orderDay)} order date has come since your last copy.` : "It has been more than two weeks."} Your records live only in this browser, and some browsers clear a site's data on their own: Safari does after about a week without a visit. A copy is a small file you can load again from Settings, here or on another device.`),
      h("p.fine", c.last ? `Last copy: ${long(c.last)}.` : "No copy yet.", " On an iPhone or iPad, add this page to your Home Screen (Share, then Add to Home Screen): it keeps its own data there.")),
    h("button.btn.btn-primary", { type: "button", "data-fk": "keep-exp", on: { click: exportState } }, "Download a copy"));
}

// ---------------------------------------------------------------- getting ready

/** The plan's final checks, on Today until they are done (or the ceiling day has passed); always on Rules.
 *  An item the friend's plan does not need (SwissBorg without coins) is shown muted, without a box, and is
 *  left out of the counts. */
function readyCard() {
  const plan = app.plan, st = S();
  const items = prepNeeded();
  const n = items.length;
  const done = items.filter((p) => st.prep[p.id]).length;
  const ms = (plan.milestones || []).find((m) => m.id === "m-ceil");
  if (done === n || today() > (ms ? ms.date : plan.orderDates[0].date)) return null;
  const dd = L.daysBetween(today(), plan.prepDeadline);
  const ringC = 2 * Math.PI * 22;
  return card(".ready-card", { id: "ready", tabindex: "-1", "aria-labelledby": "ready-h" },
    h("header.card-head",
      h("div.card-head-text",
        h("p.eyebrow", "Step 1 · before any money moves"),
        h("h2.card-title#ready-h", "Getting ready"),
        h("p.card-sub", `${dd >= 0 ? `Finish these by ${long(plan.prepDeadline)}, ${inDays(dd)}.` : `The plan's date for these was ${long(plan.prepDeadline)}.`} Tick each one off as you do it.`)),
      h("div.prep-count",
        svg("svg.mini-ring", { viewBox: "0 0 56 56", "aria-hidden": "true" }, svg("circle.mr-track", { cx: 28, cy: 28, r: 22 }), svg("circle.mr-arc", { cx: 28, cy: 28, r: 22, transform: "rotate(-90 28 28)", "stroke-dasharray": `${((done / n) * ringC).toFixed(1)} ${ringC.toFixed(1)}` })),
        h("p.prep-num", h("span.num-display", String(done)), h("span.stat-of", `/${n}`)),
        h("p.prep-due", `${n - done} to go`))),
    h("ul.checklist", plan.prep.map((p) => {
      const off = prepNotNeeded(p.id);
      if (off) {
        return h("li.am-off", { "data-fk": "ready-off-" + p.id },
          h("div.check", h("span.check-box", { "aria-hidden": "true" }, "–"),
            h("span.check-text", p.text, h("span.check-note.am-off-note", ` ${off}`))));
      }
      return h(`li${st.prep[p.id] ? ".is-done" : ""}`,
        h("label.check",
          h("input", { type: "checkbox", checked: !!st.prep[p.id], "data-fk": "ready-" + p.id, on: { change: (e) => { const v = e.target.checked; commit((d) => { d.prep[p.id] = v; }); } } }),
          h("span.check-box", { "aria-hidden": "true" }, icon("check")),
          h("span.check-text", p.text, p.appNote ? h("span.check-note", ` ${p.appNote}`) : null)));
    })));
}

// ---------------------------------------------------------------- progress

function progressLabel(pr) { return `${pr.done} of ${pr.total} orders filled, ${pr.placed} placed, ${pr.skipped} skipped`; }

const lastShown = {};
function cu(key, value, fmt, cls = "") {
  const el = h(`span${cls}`);
  const prev = lastShown[key];
  lastShown[key] = value;
  if (Number.isFinite(prev) && prev !== value) ui.countUp(el, value, fmt, { from: prev, duration: 600 });
  else if (!Number.isFinite(prev) && app.entering) ui.countUp(el, value, fmt, { from: 0, duration: 700 });
  else el.textContent = fmt(value);
  return el;
}

function renderProgress(st) {
  const plan = app.plan;
  const pr = progressNow();
  const sch = schedule();
  // The months before the friend joined are not theirs to complete.
  const dates = sch.dates.filter((d) => !isPreDate(d.id));
  const orders = sch.orders.filter((o) => !isPreOrder(o.id));
  const datesDone = dates.filter((d) => orders.filter((o) => o.dateId === d.id).every((o) => isDone(o.id))).length;
  const planned = joinedBudgetUsd(); // the money of the months that count (coins with an empty wallet buy nothing)
  // An own mix buys every holding every month (over a hundred orders): small ticks that wrap on a phone.
  const ticks = h(`div.ticks${orders.length > 40 ? ".am-many" : ""}`, { role: "img", "aria-label": progressLabel(pr) },
    orders.slice().sort((a, b) => a.at - b.at).map((o) => h(`span.tick.is-${ost(o.id).status || "pending"}`, { title: `${short(o.date)} · ${nameText(instById(o.instrument))} · ${(STATUS_PILL[ost(o.id).status || "pending"] || [])[0]}` })));
  return card(".progress", { "aria-label": "Plan progress" },
    h("div.stats",
      h("div.stat", h("span.stat-label", "Orders done"), h("span.stat-val", cu("orders-done", pr.done + pr.skipped, (x) => String(Math.round(x)), ".num-display"), h("span.stat-of", ` / ${pr.total}`)), h("span.stat-sub", pr.done + pr.skipped + pr.placed ? [`${pr.done} filled`, pr.skipped ? `${pr.skipped} skipped` : "", pr.placed ? `${pr.placed} placed` : ""].filter(Boolean).join(" · ") : `${plural(dates.length, "order date")}`)),
      h("div.stat", h("span.stat-label", "Invested"), h("span.stat-val", cu("invested", pr.investedUsd, (x) => fUsd(x), ".num-display")), h("span.stat-sub", `of ${fM(planned)} planned`)),
      h("div.stat", h("span.stat-label", "Order dates complete"), h("span.stat-val", h("span.num-display", String(datesDone)), h("span.stat-of", ` / ${dates.length}`)), h("span.stat-sub", pre().dateIds.length && pre().firstDateId ? `${plan.meta.planLabel} · from ${short(dateOfId(pre().firstDateId))}` : plan.meta.subtitle))),
    ticks,
    h("div.tick-legend", h("span.tl.is-filled", "Filled"), h("span.tl.is-placed", "Placed"), h("span.tl.is-skipped", "Skipped"), h("span.tl.is-pending", "To do")));
}

// ---------------------------------------------------------------- alerts from the plan's rules

function lastCheck(instId) {
  const t = S().thesis[instId];
  const checks = t && Array.isArray(t.checks) ? t.checks.filter((c) => c && c.date) : [];
  return checks.sort((a, b) => (a.date < b.date ? -1 : 1))[checks.length - 1] || null;
}
const prettyDates = (text) => String(text || "").replace(/(\d{4}-\d{2}-\d{2})/g, (m) => short(m));

/** A month's money not arrived by its Friday, recorded as arriving after its orders' date, or sent short. */
export function moneyWarnings(fund = funding()) {
  const fs = S().funding || {};
  const td = today();
  const out = L.fundingWarnings(app.plan, fund, {}).map((w) => ({ ...w, title: `${w.id.startsWith("send-late-") ? "A transfer cannot arrive in time" : "A transfer arrives after its orders"}` }));
  const late = rule("r9") || { if: "A month's money lands after its Friday", then: app.plan.funding.lateRule };
  const list = (ts) => ts.map((t) => `${fM(t.usd)} to ${dest(t.to)}`).join(" and ");
  // One warning per order date, naming every transfer for it (November has two). A month from before the
  // friend joined has nothing open, so it raises none.
  for (const forDate of [...new Set(fund.transfers.map((t) => t.forDate))]) {
    const d = dateOfId(forDate);
    const month = monthName(d, false, true);
    const ts = fund.transfers.filter((t) => !t.preJoin && t.forDate === forDate && t.arriveBy && schedule().orders.some((o) => o.dateId === forDate && o.account === t.to && !isDone(o.id)));
    if (!d || !ts.length) continue;
    const arrivedLate = ts.filter((t) => { const s = fs[t.id] || {}; return s.status === "arrived" && s.arrivedAt && s.arrivedAt > d; });
    const missing = ts.filter((t) => (fs[t.id] || {}).status !== "arrived" && td > t.arriveBy);
    if (arrivedLate.length) {
      out.push({ level: "warn", id: "money-late-" + forDate, title: `The money for ${month} arrived after its order date`, text: `${list(arrivedLate)} arrived after the orders on ${short(d)}. Place those orders on the next open day.`, rule: late });
    }
    if (missing.length) {
      out.push({ level: td >= d ? "alert" : "warn", id: "money-due-" + forDate, title: `The money for ${month} is not marked arrived`, text: `${list(missing)} ${missing.length > 1 ? "were" : "was"} due by ${long(missing[0].arriveBy)} for the orders on ${short(d)}. Mark ${missing.length > 1 ? "them" : "it"} arrived on the Money page once ${missing.length > 1 ? "they land" : "it lands"}.`, rule: late });
    }
  }
  return out;
}

function buildAlerts() {
  const plan = app.plan, st = S(), out = [];
  const td = today();
  const { orders } = schedule();
  const cr = carry();
  // r1: over the ceiling on its order date (or still open from a past date, four Tuesdays).
  const seenR1 = new Set();
  for (const o of orders.slice().sort((a, b) => a.at - b.at)) {
    if (o.ceiling !== "instrument" || isDone(o.id) || seenR1.has(o.instrument)) continue;
    const d = L.daysBetween(td, o.date);
    if (d > 0 || d < -28) continue;
    const i = instById(o.instrument), c = ceilingOf(i), p = priceInfo(i);
    if (L.ceilingStatus(p.price, c) !== "over") continue;
    seenR1.add(o.instrument);
    out.push({ level: "alert", key: "r1-" + o.id, title: `${nameText(i)} is above its ceiling`,
      body: `${fPrice(p.price, i.quoteCurrency)} (${priceSource(p)}) against a ceiling of ${fPrice(c.value, i.quoteCurrency)}. ${d >= 0 ? `Its order is ${inDays(d)} (${long(o.date)}).` : `Its ${short(o.date)} order is still open.`}`,
      rule: rule("r1"), href: "#desk" });
  }
  // r2: a thesis-gated order within 14 days
  for (const o of orders) {
    if (!o.thesisGate || isDone(o.id)) continue;
    const d = L.daysBetween(td, o.date);
    if (d < 0 || d > 14) continue;
    const i = instById(o.instrument), last = lastCheck(i.id);
    out.push({ level: "warn", key: "r2-" + o.id, title: `Thesis check due: ${nameText(i)}`,
      body: `${(o.note || "").split(".")[0]} on ${long(o.date)}, ${inDays(d)}. ${last ? `Last check logged ${short(last.date)}: ${last.pass ? "passed" : "failed"}.` : "No check logged yet: log it on the Rules page."}`,
      rule: rule("r2"), href: "#/rules" });
  }
  // r9 and r10: late money, and a month that arrived short or long
  for (const w of moneyWarnings()) out.push({ level: w.level, key: "f-" + w.id, title: w.title, body: prettyDates(w.text), rule: w.rule || null, href: "#/money" });
  const fs = st.funding || {};
  for (const t of plan.funding.transfers) {
    const s = fs[t.id];
    if (t.to !== "IBKR" || !s || !Number.isFinite(s.sentUsd) || s.sentUsd === t.usd) continue;
    const target = plan.orders.find((o) => o.dateId === t.forDate && o.carryTarget);
    if (!target || isDone(target.id)) continue;
    const c = cr.byOrder[target.id];
    const diff = L.round2(s.sentUsd - t.usd);
    out.push({ level: c && c.shortUsd ? "warn" : "info", key: "r10-" + t.id, title: `${t.label}: ${fUsd(Math.abs(diff), 2)} ${diff < 0 ? "less" : "more"} than planned`,
      body: c ? `Only the ${short(dateOfId(t.forDate))} VWRA order changes, by ${diff < 0 ? "−" : "+"}${fUsd(Math.abs(diff), 2)}. ${L.round2(c.carryUsd) !== diff ? "With earlier leftovers it" : "It"} is now ${fUsd(c.usd, 2)} (plan ${fM(target.usd)}).${c.shortUsd ? ` That is ${fUsd(c.shortUsd, 2)} short, so the other orders wait for next month's money.` : ""}` : "",
      rule: rule("r10"), href: "#/money" });
  }
  // r8: ether and solana, and every coin an own mix buys, in the weeks before their date (no price history
  // here, so this is a reminder); not when the wallet holds nothing for them. One reminder: the next date.
  const coinsAll = orders.filter((o) => (o.cryptoWait || (o.account === "SwissBorg" && ownIdMonth(o.id))) && !isDone(o.id) && o.date >= td && !(cr.coinUsd && cr.coinUsd[o.id] === 0))
    .sort((a, b) => a.at - b.at);
  const coins = coinsAll.filter((o) => coinsAll.length && o.date === coinsAll[0].date);
  if (coins.length) {
    const d = L.daysBetween(td, coins[0].date);
    if (d >= 0 && d <= 14) {
      out.push({ level: "info", key: "r8", title: `Rule r8 check before ${long(coins[0].date)}`,
        body: `Look at how much ${[...new Set(coins.map((o) => instById(o.instrument).name.toLowerCase()))].join(" and ")} moved over the 30 days before the order (your SwissBorg app shows it).`,
        rule: rule("r8"), href: "#desk" });
    }
  }
  // ceiling day (27 Nov): only the instruments the friend's plan buys
  const m = (plan.milestones || []).find((x) => x.id === "m-ceil");
  if (m) {
    const dd = L.daysBetween(td, m.date);
    const pending = ceilingPending().map((i) => nameText(i));
    const p7 = plan.prep.find((p) => p.appNote) || {};
    if (dd >= 0 && dd <= 14 && pending.length) {
      out.push({ level: dd <= 1 ? "warn" : "info", key: "ceil-day", title: `Ceiling day ${inDays(dd)}: ${long(m.date)}`, body: `${m.text}${p7.appNote ? " " + p7.appNote : ""}`,
        rule: p7.text ? { if: "Getting ready", then: p7.text } : null, href: "#/settings" });
    } else if (dd < 0 && pending.length) {
      out.push({ level: "info", key: "ceil-wait", title: "Waiting for the 27 Nov closes", body: `Ceilings still to set for ${pending.join(", ")}. Type each one's 27 Nov closing price in Settings.`, href: "#/settings" });
    }
  }
  // the getting-ready deadline, once the checklist has left Today
  const pd = L.daysBetween(td, plan.prepDeadline);
  const needed = prepNeeded();
  const done = needed.filter((p) => st.prep[p.id]).length;
  if (done < needed.length && !readyShown() && pd >= -14 && pd <= 30) {
    out.push({ level: pd <= 3 ? "warn" : "info", key: "prep", title: `Getting ready: ${done} of ${needed.length} done`,
      body: `The plan says finish them by ${long(plan.prepDeadline)}${pd >= 0 ? `, ${inDays(pd)}` : ""}, before any money moves.`, href: "#/rules" });
  }
  const rank = { alert: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
function readyShown() {
  const plan = app.plan, st = S();
  const ms = (plan.milestones || []).find((m) => m.id === "m-ceil");
  return prepNeeded().some((p) => !st.prep[p.id]) && today() <= (ms ? ms.date : plan.orderDates[0].date);
}

function renderAlerts() {
  const alerts = buildAlerts();
  const LV = { alert: ["alert", "Needs a rule"], warn: ["alert", "Check"], info: ["info", "Note"] };
  return card(".alerts-card", { "aria-labelledby": "alerts-h" },
    cardHead(h("span#alerts-h", "From the plan's rules"), "Only the plan's own written rules and the timing of your transfers raise these. Dates never move for news or prices; two written rules (r1, a price ceiling, and r8, the 30% coin rule) can move a purchase to another written date.",
      h("span.count-badge.num", { "aria-label": plural(alerts.length, "item") }, String(alerts.length))),
    alerts.length
      ? h("ul.alerts", alerts.map((a) => h(`li.alert.alert-${a.level}`,
        h("div.alert-ico", { "aria-hidden": "true" }, icon(LV[a.level][0])),
        h("div.alert-main",
          h("p.alert-kicker", LV[a.level][1]),
          h("p.alert-title", a.title),
          a.body ? h("p.alert-body", a.body) : null,
          a.rule ? ruleQuote(a.rule, a.rule.id ? `Plan rule ${a.rule.id.slice(1)}` : "The plan says") : null),
        a.href ? h("a.alert-link", { href: a.href, "data-fk": "alert-" + a.key, "aria-label": `Open: ${a.title}`, on: a.href === "#desk" ? { click: (e) => { e.preventDefault(); openDesk(app.deskDate); } } : undefined }, h("span", { "aria-hidden": "true" }, "→")) : null)))
      : h("div.calm", h("p.calm-title", "Nothing to act on today."), ruleQuote(rule("r7"))));
}

// ---------------------------------------------------------------- order desk

function renderDesk() {
  if (app.focusDesk) { app.focusDesk = false; focusDeskSoon(); }
  const sch = schedule();
  const td = today();
  const auto = autoDeskDate(sch);
  const sel = (app.deskDate && sch.dates.find((d) => d.id === app.deskDate)) || auto || sch.dates[sch.dates.length - 1];
  const os = sch.orders.filter((o) => o.dateId === sel.id).sort((a, b) => a.at - b.at);
  const ctx = { carry: carry() };
  const dd = L.daysBetween(td, sel.effective);
  const openCount = os.filter((o) => !isDone(o.id)).length;
  const totalUsd = os.reduce((a, o) => a + (o.usd || 0), 0);
  const hasCoins = os.some((o) => instById(o.instrument).coingeckoId);

  const chips = h("div.date-chips", { role: "group", "aria-label": "Choose an order date" },
    sch.dates.map((d) => {
      const dos = sch.orders.filter((o) => o.dateId === d.id);
      const before = isPreDate(d.id);
      const allDone = dos.every((o) => isDone(o.id));
      const overdue = !allDone && d.effective < td;
      return h(`button.date-chip${allDone && !before ? ".is-done" : ""}${before ? ".is-pre" : ""}${overdue ? ".is-overdue" : ""}${d.id === (auto && auto.id) ? ".is-next" : ""}`, {
        type: "button", "aria-pressed": String(d.id === sel.id), "data-fk": "desk-" + d.id,
        title: `${long(d.effective)} · ${before ? "before you joined" : d.title}`,
        on: { click: () => { app.deskDate = d.id; hooks.invalidate("state"); } },
      }, h("span.dc-date", short(d.effective)), h("span.dc-dot", { "aria-hidden": "true" }), h("span.visually-hidden", before ? " (before you joined)" : allDone ? " (done)" : overdue ? " (date passed, orders open)" : ""));
    }));

  const selPre = isPreDate(sel.id);
  const head = h("header.desk-head",
    h("div.desk-title-wrap",
      h("p.eyebrow", `Order desk · step ${sel.step}${sel.id === (auto && auto.id) ? " · next" : ""}`),
      h("h2.desk-title", { id: "desk-h" }, long(sel.effective)),
      h("p.desk-sub", h("span", sel.title), h("span.dot-sep", "·"), h("span", plural(os.length, "order")), h("span.dot-sep", "·"),
        selPre ? h("span", "before you joined") : [h("span.num", `about ${fM(L.round2(totalUsd))}`), h("span.dot-sep", "·"), h("span", dd === 0 ? "today" : inDays(dd))])),
    chips);

  const rows = os.map((o) => deskRow(o, ctx));
  const notes = selPre ? [] : dateNotesFor(sel.id);
  const fieldLines = selPre ? [] : fieldMonthLines(sel.id);
  if (universeOn()) afterRender(() => markDelisted(os));
  const body = [
    h("ol.desk-list", { "aria-labelledby": "desk-h" }, rows),
  ];
  if (selPre) body.unshift(h("p.desk-past", icon("info"), `Before you joined: this order date came before you started on ${long(pre().joinedAt)}. Nothing is bought or sent for it, and nothing is owed.`));
  else if (dd < 0 && openCount) body.unshift(h("p.desk-past", icon("info"), `This date has passed with ${plural(openCount, "order")} still open. The plan: if an exchange was closed, place the order on its next open day; then log the fill or record a skip.`));
  // data-fk: a redraw (coin prices, CoinGecko's daily history) gives the focus back to the desk when it had it, as after
  // "Open the order desk" (main.js renderView; review finding RR-01)
  return card(".desk", { id: "desk", tabindex: "-1", "data-fk": "desk", "aria-labelledby": "desk-h" }, head,
    h("p.desk-help", "For each order: type the price your broker's app shows (coins update by themselves), place the order there, then log the fill here. “How to place” explains each step."),
    fieldLines.length ? h("div.desk-fields", fieldLines) : null,
    body,
    notes.length ? h("div.desk-notes", h("p.eyebrow", "Notes for this date, from the plan"), h("ul", notes.map((n) => h("li", n)))) : null,
    hasCoins ? h("p.fine.desk-src", icon("info"), h("span", sourceLink(prices.SOURCES.crypto), prices.data.cryptoAt ? `, updated ${ui.relTime(prices.data.cryptoAt / 1000)}` : "", ". Stock and fund prices are the ones you type.")) : null);
}

/** Why a field month's order has its amount (brief G5): "Half of Retail", "60% of the month, plus …"; and the
 *  locked 10% (lock-api.md 6): where this month's 10% went, with its date line and the "as written" line. */
function whyLine(o) {
  const w = orderWhy(app.plan, o.id, fieldName);
  return [w ? h("p.dr-why", { "data-fk": "why-" + o.id }, w) : null, lockWhyLine(o.id, "lock-why-" + o.id)];
}

/**
 * A field month on the desk: the month's split in words (and where to change it), and for each upcoming listing
 * the friend ticked that does not trade yet, where its part went this month (upcoming-api.md 6).
 */
function fieldMonthLines(dateId) {
  const f = app.plan.scale && app.plan.scale.fields ? app.plan.scale.fields[dateId] : null;
  if (!f) return [];
  const out = [];
  const spec = (monthOf(dateId) || {}).fields || { chosen: f.F, split: f.s };
  const words = splitLine(spec, { ninety: !!f.ninety });
  if (words) {
    out.push(h("p.desk-split", { "data-fk": "desk-split" }, words, " ",
      fixed().has(dateId) ? "This month has records, so its split stays as it is." : [h("a", { href: "#/split" }, "Change it on My split"), "."]));
  }
  for (const id of f.W || []) {
    const w = waitingWhy(app.plan, dateId, id, fieldName);
    // "is not trading yet" always carries the date it was last checked (upcoming-api.md 4)
    const checked = upcomingChecked(id);
    if (w) out.push(h("p.desk-waiting", { "data-fk": "waiting-" + id }, icon("info"), h("span", w, checked ? h("span.desk-checked", ` ${checked}`) : null)));
  }
  return out;
}

/**
 * A company whose listing ended (spec 8.8), or whose main listing moved over the counter so that it can no longer be
 * added to a list: its order rows say so, from its record in the open data. The orders stay as the friend set them.
 */
function markDelisted(os) {
  const ids = os.map((o) => instById(o.instrument)).filter(isFieldInst);
  if (!ids.length) return;
  // Only companies the data still names (search.json keeps those that left for 400 days): an upcoming listing or a
  // company long gone has no record to read, and asking for it would only fetch a file that is not there.
  D.loadSearch().then((s) => {
    const known = new Set(((s && s.items) || []).map((r) => r.id));
    for (const o of os) markOne(o, known);
  }).catch(() => { /* the facts did not load: the orders stay as they are */ });
}

function markOne(o, known) {
  const i = instById(o.instrument);
  if (!isFieldInst(i) || !known.has(i.id)) return;
  D.loadCompany(i.id).then((rec) => {
    if (!rec) return;
    // not addable any more and still listed: its main listing is over the counter now (spec 8.3; the order was made
    // from the listing saved when it was ticked, names[id].v)
    const co = FU.companyInfo({ id: i.id, ...rec });
    const otc = !rec.delisted && co.addable === false && (co.otc || co.venue === "OTC");
    // or its main listing moved to the Texas Stock Exchange (G4 fix of review finding ibkr-otc-txse)
    const txse = !rec.delisted && !otc && co.addable === false && co.venue === "TXSE";
    if (!rec.delisted && !otc && !txse) return;
    const cell = document.querySelector(`[data-row="${CSS.escape(o.id)}"] .dr-order`);
    if (!cell || cell.querySelector(".dr-delisted")) return;
    cell.append(rec.delisted
      ? h("p.dr-delisted", { "data-fk": "delisted-" + o.id }, `SEC's list shows no listing for ${nameText(i)} since ${FU.dayWords(rec.delisted)}. Your order stays as you set it.`)
      : otc ? h("p.dr-delisted", { "data-fk": "otc-" + o.id }, `SEC's list now shows ${nameText(i)} over the counter. Your order stays as you set it.`)
        : h("p.dr-delisted", { "data-fk": "txse-" + o.id }, `SEC's list now shows ${nameText(i)} on the Texas Stock Exchange. Your order stays as you set it.`));
  }).catch(() => { /* the facts did not load: the order stays as it is */ });
}

function priceCell(o, i, pi) {
  if (i.coingeckoId) {
    const chg = Number.isFinite(pi.changePct) ? h(`span.chg.chg-${pi.changePct > 0.005 ? "up" : pi.changePct < -0.005 ? "down" : "flat"}`, { title: "Change over the last 24 hours" },
      h("span", { "aria-hidden": "true" }, pi.changePct > 0.005 ? "▲ " : pi.changePct < -0.005 ? "▼ " : "■ "), fPct(pi.changePct, 1), h("span.price-age", " 24 h")) : null;
    return h("div.dr-price", h("span.cell-label", "Live price"),
      h("span.num.price.dr-price-val", fPrice(pi.price, i.quoteCurrency)), chg,
      h(`span.price-src${pi.kind === "last" ? ".is-stale" : ""}`, pi.price == null ? (prices.data.off ? "live prices are off" : prices.data.cryptoStatus === "error" ? "CoinGecko is not answering; trying again later" : "waiting for CoinGecko") : priceSource(pi)));
  }
  const id = "price-" + i.id;
  // 2.2: a row whose order date has passed is about that order: its field holds the price paid for it (the growth
  // tracker's, tracker.js recordedPaid), never the holding's price now, which a row of today or later takes. A logged
  // fill is that price, changed with "Edit fill" (review finding M2). It is named by its date, not as "Price you paid",
  // while nothing says the friend paid it: the order may still be open, or skipped (the tracker counts it all the same).
  const past = o.date < today();
  const paid = pastPaid(o, i);
  if (paid && paid.label === "fill") {
    return h("div.dr-price", h("span.cell-label.is-shown", "Price you paid"),
      h("span.num.price.dr-price-val", fPrice(paid.price, i.quoteCurrency)), h("span.price-src", "your fill price"));
  }
  const input = h("input.price-input", {
    id: "in-" + id, "data-fk": id, inputmode: "decimal", autocomplete: "off", spellcheck: "false", maxlength: 12,
    value: past ? (paid ? String(paid.price) : "") : pi.price != null ? String(pi.price) : "", placeholder: "US$",
    "aria-describedby": "src-" + id,
    // 2.2: a price typed again with the same figure still counts as typed for this order (no change event fires).
    // data-edited also tells the router not to draw the page again while the field is being typed in (main.js).
    on: {
      input: (e) => { e.target.dataset.edited = "1"; },
      change: (e) => { delete e.target.dataset.edited; savePrice(o, i, e.target); },
      blur: (e) => { if (e.target.dataset.edited) { delete e.target.dataset.edited; savePrice(o, i, e.target); } },
    },
  });
  const src = past
    ? (paid ? paidWords(o, i) : "Type it to count this order in Growth")
    : pi.price == null ? "Type it to size the order" : priceSource(pi);
  return h("div.dr-price.is-input",
    h("label.cell-label.is-shown", { for: "in-" + id }, past ? `Price on ${short(o.date)}` : "Price in your app", h("span.visually-hidden", ` for ${nameText(i)}, in US dollars`)),
    input,
    h("span.price-src#src-" + id, src));
}

/** The price paid a row whose order date has passed holds (a fill, or a price typed for it); null on any other row. */
function pastPaid(o, i) {
  return o.date < today() ? recordedPaid(S(), { id: o.id, dateId: o.dateId, date: o.date, instrument: i.id }) : null;
}

/** Where a past row's price paid comes from, in words: the price typed for this order, or one typed that day before
 *  2.2 (kept then only as the holding's latest price, tracker.js recordedPaid). */
function paidWords(o, i) {
  const t = S().typed[typedKey(o.dateId, i.id)];
  return t && t.price > 0 ? "the price you typed for this order" : "the price you typed that day";
}

/**
 * A price typed on the desk (tracker.js deskPrice keeps it in the records).
 * - On a row of today or later: the holding's latest price (it sizes its orders and values it), and on the order's
 *   own date also the price typed for that order (store `typed`, 2.2: the growth tracker's price paid when no fill is
 *   logged for it). Clearing the field clears both.
 * - On a row whose order date has passed: that order's price paid, dated by its order date, and the holding's latest
 *   price only while no newer one is kept, so an old price never becomes the price now (review finding M2). Clearing
 *   the field clears that order's price (and a latest price typed that day, which would still count for it).
 */
function savePrice(o, i, el) {
  const raw = el.value.trim();
  const order = { dateId: o.dateId, date: o.date };
  if (raw === "") {
    el.removeAttribute("aria-invalid");
    commit((d) => deskPrice(d, { order, instrument: i.id, price: null, today: today() }));
    return;
  }
  const v = parseNum(raw);
  if (!(v > 0) || !Number.isFinite(v)) {
    // The message stays in the field's own description (aria-describedby) until the price is fixed.
    const msg = "Type the price as a number, for example 193.92. Nothing was saved.";
    el.setAttribute("aria-invalid", "true");
    const src = document.getElementById("src-price-" + i.id);
    if (src) { src.textContent = msg; src.classList.add("is-error"); }
    ui.announce(`${nameText(i)}: ${msg}`);
    return;
  }
  el.removeAttribute("aria-invalid");
  const at = new Date().toISOString();
  // the typed price's day is the app's day (?now= moves it, to look at a plan date; in use it is the same time)
  const typedAt = new Date(now()).toISOString();
  commit((d) => deskPrice(d, { order, instrument: i.id, price: v, today: today(), at, typedAt }));
}

/** Where a leftover or a skipped order's money goes: the next VWRA order still open, or (after the last
 *  one) cash at Interactive Brokers, as the plan's last-order note says. */
function leftoverWhere(o, ct = nextCarryTarget(o)) {
  return ct ? (ct.date === o.date ? "this date's VWRA order" : `the VWRA order on ${short(ct.date)}`) : null;
}

/**
 * Why a coin order paid from the SwissBorg wallet cannot be placed as it is: the wallet holds nothing for
 * it, or less than SwissBorg's smallest exchange. null when it can.
 */
function coinShort(o, cr) {
  if (!o.cryptoWait || isDone(o.id) || !cr.coinUsd || !Number.isFinite(cr.coinUsd[o.id])) return null;
  const usd = cr.coinUsd[o.id];
  if (usd <= 0) {
    const s01 = app.plan.funding.transfers.find((t) => t.to === "SwissBorg");
    return isPreTransfer(s01 && s01.id)
      ? `Nothing to buy: ${instById(o.instrument).name.toLowerCase()} is paid from the money sent to SwissBorg in ${monthName(dateOfId(s01.forDate), false, true)}, before you joined, so your wallet holds nothing for it. Record a skip to close it.`
      : `Nothing to buy: the SwissBorg wallet holds nothing for it after the bitcoin buy. Record a skip; the plan adds no new money for it.`;
  }
  if (usd < coinMinUsd()) return `${fUsd(usd, 2)} is under SwissBorg's smallest exchange (5 euros, about ${fM(coinMinUsd())}), so it cannot be placed. Record a skip: the money stays in the wallet.`;
  return null;
}

/** A row for an order from before the friend joined: nothing to buy, nothing to log. */
function preRow(o) {
  const i = instById(o.instrument);
  return h("li.desk-row.is-pre", { "data-row": o.id },
    h("div.dr-time", timeCell(o, "span", ".dr-any"), o.time !== "any" ? h("span.dr-tz", "Bangkok") : null),
    h("div.dr-order", h("p.dr-name", nameEl(i, { masked: isFieldInst(i) })), h("p.dr-what", h("span.acct-chip", o.account), " ", whatNamed(o))),
    h("div.dr-act", pill("Before you joined", "muted", "–")));
}

function deskRow(o, ctx) {
  if (isPreOrder(o.id)) return preRow(o);
  const i = instById(o.instrument);
  const s = ost(o.id);
  const status = s.status || "pending";
  const c = orderCeiling(o);
  const pi = priceInfo(i);
  const p = pi.price;
  const cs = L.ceilingStatus(p, c);
  const adj = adjustFor(o, ctx.carry);
  const sz = L.sizeOrder(o, i, p != null ? { price: p } : null, null, c, adj);
  const venue = app.plan.venues.find((v) => v.id === i.venue);
  const nowSt = ui.marketStatus(venue, new Date(now()));
  const atSt = o.time === "any" ? null : ui.marketStatus(venue, new Date(L.bkkToEpoch(o.date, o.time)));
  const hr = c.value != null ? L.headroomPct(p, c.value) : null;
  const ht = howTo(i);
  const ct = nextCarryTarget(o);
  const where = leftoverWhere(o, ct);
  const mc = o.carryTarget && !isDone(o.id) ? ctx.carry.byOrder[o.id] : null;
  const usdNow = Math.max(0, L.round2((o.usd || 0) + adj));
  const zero = !isDone(o.id) && o.wholeShares && p != null && sz.qty === 0;
  const coinNote = coinShort(o, ctx.carry);

  const sizeBits = [];
  if (status === "filled") {
    // What was bought, and what the fill left for the next VWRA order (worked out from the fill, not the plan).
    const had = o.carryTarget && ctx.carry.byOrder[o.id] ? ctx.carry.byOrder[o.id].usd : o.usd;
    const left = o.account === "IBKR" && Number.isFinite(s.costUsd) ? L.round2(had - s.costUsd) : 0;
    sizeBits.push(h("span.size-qty.num", `${qtyWords(i, s.qty)} bought`), h("span.size-cost.num", `for ${fUsd(s.costUsd, 2)}`));
    if (left > 0.5) sizeBits.push(h("span.size-note", where ? `${fUsd(left, 2)} left over → VWRA ${short(ct.date)}` : `${fUsd(left, 2)} left over stays as cash at Interactive Brokers`));
  } else if (status === "skipped") {
    const moved = skippedUsd(o, ctx.carry);
    const goes = o.account === "SwissBorg" ? "stays in the SwissBorg wallet"
      : s.redirect === "VWRA" ? (where ? `moved to ${where}` : "stays as cash at Interactive Brokers") : "kept as cash at Interactive Brokers";
    sizeBits.push(h("span.size-qty", "Not bought"), h("span.size-note", `${fUsd(moved, 2)} ${goes}`));
  } else if (takesLeftover(o, ctx.carry)) {
    // An own mix that leaves VWRA nothing this month: the order is there for leftovers and carries.
    sizeBits.push(h("span.size-qty", "Takes any leftover"), h("p.size-zero", { "data-fk": "vwra-zero-" + o.id }, icon("info"),
      h("span", "Your mix leaves nothing for VWRA this month. A leftover carried here is bought with it; if it stays at $0, record a skip.")));
  } else if (p == null) {
    sizeBits.push(h("span.size-qty", "—"), h("span.size-note", i.coingeckoId ? "Sized once the live price arrives." : "Type the price from your app to size this order."));
  } else if (o.wholeShares) {
    sizeBits.push(h("span.size-qty.num", qtyWords(i, sz.qty)));
    if (zero) {
      sizeBits.push(h("p.size-zero", icon("info"), h("span", where
        ? `0 shares at ${fPrice(p, i.quoteCurrency)}: this ${fUsd(usdNow, usdNow % 1 ? 2 : 0)} buys no whole share. Skip it and its money joins ${where} (the plan's leftover rule).`
        : `0 shares at ${fPrice(p, i.quoteCurrency)}: this ${fUsd(usdNow, usdNow % 1 ? 2 : 0)} buys no whole share. This is the last VWRA order, so there is no later one to join: skip it and the money stays as cash at Interactive Brokers.`)));
    } else {
      sizeBits.push(h("span.size-cost.num", `≈ ${fUsd(sz.estCostUsd, 2)}`));
      if (sz.leftoverUsd > 0.5) sizeBits.push(h("span.size-note", ct ? `${fUsd(sz.leftoverUsd, 2)} left over → VWRA ${short(ct.date)}` : `${fUsd(sz.leftoverUsd, 2)} left over stays as cash at Interactive Brokers`));
    }
  } else if (o.fractional) {
    sizeBits.push(h("span.size-qty.num", `Enter ${fM(o.usd)} cash`), h("span.size-cost.num", `≈ ${qtyWords(i, sz.qty)}`));
  } else if (coinNote) {
    sizeBits.push(h("span.size-qty.num", `${fUsd(usdNow, 2)}`), h("p.size-zero", { "data-fk": "coin-note-" + o.id }, icon("info"), h("span", coinNote)));
  } else {
    sizeBits.push(h("span.size-qty.num", `≈ ${qtyWords(i, sz.qty)}`), h("span.size-cost.num", `for ${fUsd(usdNow, usdNow % 1 ? 2 : 0)}, fee included`));
  }
  // 2.2: on a row whose order date has passed the field holds that order's price paid, so the size says the price it is
  // worked out at, right under the figures it gives (the holding's latest price, which sizes every open order)
  if (!i.coingeckoId && p != null && !isDone(o.id) && !zero && !takesLeftover(o, ctx.carry) && o.date < today()) {
    const paid = pastPaid(o, i);
    if (!paid || paid.price !== p) sizeBits.splice(2, 0, h("span.size-note", { "data-fk": "sized-at-" + o.id }, `at ${fPrice(p, i.quoteCurrency)}, ${priceSource(pi)}`));
  }
  if (adj && !isDone(o.id) && !(coinNote && usdNow <= 0)) sizeBits.push(h("span.size-note", `${adj > 0 ? "+" : "−"}${fUsd(Math.abs(adj), 2)} by the rules for differences`));
  const skipFirst = zero || !!coinNote || takesLeftover(o, ctx.carry);
  const nothing = !!coinNote && usdNow <= 0;

  let actions;
  if (status === "filled") {
    actions = [
      h("p.filled-sum.num", `${short(s.filledAt || today())} · ${fmtQty(i, s.qty)} @ ${fPrice(s.price, i.quoteCurrency)} · ${fUsd(s.costUsd, 2)}`),
      h("div.row-actions",
        h("button.btn.btn-small", { type: "button", "data-fk": "edit-" + o.id, on: { click: () => openFillDialog(o) } }, "Edit fill"),
        h("button.btn.btn-small.btn-ghost", { type: "button", "data-fk": "undo-" + o.id, on: { click: () => undoOrder(o) } }, "Undo")),
    ];
  } else if (status === "skipped") {
    actions = [
      h("p.filled-sum", `Skipped → ${s.redirect === "VWRA" ? "VWRA" : o.account === "SwissBorg" ? "stays in the wallet" : "kept as cash"}${s.note ? ` · ${s.note}` : ""}`),
      h("div.row-actions", h("button.btn.btn-small.btn-ghost", { type: "button", "data-fk": "undo-" + o.id, on: { click: () => undoOrder(o) } }, "Undo skip")),
    ];
  } else {
    actions = [h("div.row-actions",
      // A coin with nothing in the wallet for it cannot be placed or filled: only a skip closes it.
      status === "pending" && !nothing ? h("button.btn.btn-small", { type: "button", "data-fk": "placed-" + o.id, on: { click: () => markPlaced(o) } }, "Mark placed") : null,
      nothing ? null : h(`button.btn.btn-small${skipFirst ? "" : ".btn-primary"}`, { type: "button", "data-fk": "fill-" + o.id, on: { click: () => openFillDialog(o) } }, "Log fill"),
      h(`button.btn.btn-small${skipFirst ? ".btn-primary" : ".btn-ghost"}`, { type: "button", "data-fk": "skip-" + o.id, on: { click: () => openSkipDialog(o) } }, "Skip"),
      status === "placed" ? h("button.btn.btn-small.btn-ghost", { type: "button", "data-fk": "unplace-" + o.id, on: { click: () => undoOrder(o) } }, "Not placed") : null)];
  }

  const wallet = ctx.carry;
  const how = disclosure("how-" + o.id, "How to place",
    h("div.how",
      ht ? h("dl.how-grid", h("dt", "Find it as"), h("dd", ht.find), h("dt", "Order to enter"), h("dd", ht.order), h("dt", "How many"), h("dd", ht.count)) : null,
      h("ul.how-notes",
        sz.notes.map((n) => h("li", n)),
        o.account === "IBKR" && o.wholeShares ? h("li", leftoverText()) : null,
        h("li", wordsFor(o, i))),
      o.then ? h("p.how-then", h("strong", "Then: "), o.then) : null,
      o.note && !(coinNote && usdNow <= 0) ? h("p.how-then", o.note) : null, // a coin with an empty wallet: its row says why
      o.cryptoWait && !isDone(o.id) && wallet.walletUsd > 0 && wallet.coinUsd && wallet.coinUsd[o.id] !== o.usd ? h("p.how-then", `The SwissBorg wallet holds ${fUsd(Math.max(0, wallet.walletUsd), 2)} after the bitcoin buy, less than the ${fM(L.round2(app.plan.orders.filter((x) => x.cryptoWait).reduce((a, x) => a + x.usd, 0)))} planned for the coins, so they shrink in proportion: ${fUsd(wallet.coinUsd[o.id], 2)} for this order.`) : null,
      mc && (mc.carryUsd || mc.shortUsd) ? h("p.how-then", `Plan ${fM(o.usd)} ${mc.carryUsd < 0 ? "−" : "+"} ${fUsd(Math.abs(mc.carryUsd), 2)} carried from earlier orders and transfers = ${fUsd(mc.usd, 2)}.${mc.shortUsd ? ` That is ${fUsd(mc.shortUsd, 2)} short, so the other orders wait for next month's money (rule r10).` : ""}`) : null,
      atSt ? h("p.how-then", `${venue.label} at ${o.time} Bangkok time on ${short(o.date)}: ${atSt.open ? "inside" : "outside"} regular trading hours.`) : null));

  return h(`li.desk-row.is-${status}${o.thesisGate ? ".is-gated" : ""}${skipFirst ? ".is-zero" : ""}`, { "data-row": o.id },
    h("div.dr-time", timeCell(o, "span", ".dr-any"), o.time !== "any" ? h("span.dr-tz", "Bangkok") : null),
    h("div.dr-order",
      h("p.dr-name", nameEl(i, { masked: isFieldInst(i) })),
      h("p.dr-what", h("span.acct-chip", o.account), " ", whatOf(o, ctx.carry)),
      whyLine(o),
      // The locked listing's order once it trades: two sourced facts about a first day's order (lock-api.md 6).
      LK.isLockOrder(o) && !isDone(o.id) ? lockFacts("lock-facts-" + o.id) : null,
      o.thesisGate ? h("p.dr-gate", icon("rules"), "Thesis check first (rule r2)") : null),
    priceCell(o, i, pi),
    h("div.dr-ceil", h("span.cell-label", "Ceiling"), c.kind === "none" ? null : h("span.num.dr-ceil-val", fmtCeil(c, i)), ceilPill(cs), hr != null ? h("span.dr-head.num", hr >= 0 ? `${fNum(hr, 1)}% below it` : `${fNum(-hr, 1)}% over`) : null),
    h("div.dr-size", h("span.cell-label", "Size at this price"), sizeBits),
    h("div.dr-venue", h("span.cell-label", "Market"), h(`span.venue-inline${nowSt.open ? ".is-open" : ""}`, h("span.vdot", { "aria-hidden": "true" }), `${VENUE_SHORT[venue.id] || venue.label} ${nowSt.open ? "open" : "closed"}`), h("span.dr-hours", "now · regular hours")),
    h("div.dr-act", statusPill(status), actions),
    status === "filled" ? h("div.stamp", { "aria-hidden": "true" }, "Filled") : null,
    h("div.dr-how", how));
}

/** One plain sentence on the words this order uses. */
function wordsFor(o, i) {
  if (o.wholeShares) return "Whole shares: you buy a whole number of shares at a limit price (the most you will pay); the cash left over stays in your account.";
  if (o.fractional) return `Fractional: you enter a dollar amount and get part of a share. The ceiling is the most the plan pays for one share${i.ceiling && i.ceiling.type === "fixed" ? ` (${fPrice(i.ceiling.value, i.quoteCurrency)} here)` : ""}.`;
  return "SwissBorg: you exchange US dollars (or USDC) for the coin. The 0.99% fee comes out of the same dollars, so the coin amount is a little less.";
}

function markPlaced(o) {
  commit((d) => { d.orders[o.id] = { ...(d.orders[o.id] || {}), status: "placed" }; });
  toast(`Marked placed: ${nameText(instById(o.instrument))}`, "info");
}

export async function undoOrder(o) {
  const s = ost(o.id);
  if (s.status === "filled") {
    const ok = await confirmDialog({ title: "Undo this fill?", text: `The fill for ${nameText(instById(o.instrument))} on ${short(o.date)} goes back to to-do. The logged numbers are cleared.`, ok: "Undo fill", danger: true });
    if (!ok) return;
  }
  commit((d) => { d.orders[o.id] = { status: "pending", qty: null, price: null, fees: null, costUsd: null, filledAt: null, note: "", redirect: null }; });
  toast("Back to to-do", "info");
}

export function openFillDialog(o) {
  const i = instById(o.instrument);
  const s = ost(o.id);
  const cr = carry();
  const c = orderCeiling(o);
  const pi = priceInfo(i);
  const sz = L.sizeOrder(o, i, pi.price != null ? { price: pi.price } : null, null, c, adjustFor(o, cr));
  // A worked-out coin amount has float noise: offer it to 8 decimals (one satoshi), as the app shows it.
  const qty0 = Number.isFinite(s.qty) ? s.qty : i.group === "crypto" ? coinQty(sz.qty) : sz.qty;
  const price0 = Number.isFinite(s.price) ? s.price : pi.price;
  const fees0 = Number.isFinite(s.fees) ? s.fees : L.suggestFees(i, qty0, price0);
  const inp = (name, val, extra = {}) => h("input", { name, inputmode: "decimal", autocomplete: "off", value: Number.isFinite(val) ? String(val) : "", ...extra });
  const qtyI = inp("qty", qty0), priceI = inp("price", price0), feesI = inp("fees", fees0);
  const dateI = h("input", { name: "date", type: "date", value: s.filledAt || (today() >= o.date ? today() : o.date) });
  const costI = inp("cost", null);
  const noteI = h("input", { name: "note", value: s.note || "", autocomplete: "off", maxlength: 200 });
  const costHint = h("span.field-hint");
  const errId = "fill-err-" + o.id;
  const err = h("p.form-error", { role: "alert", id: errId });
  let costManual = Number.isFinite(s.costUsd);
  if (costManual) costI.value = String(s.costUsd);
  const auto = () => L.fillCostUsd(i, parseNum(qtyI.value), parseNum(priceI.value), parseNum(feesI.value), null);
  const recalc = () => {
    const a = auto();
    if (!costManual) costI.value = Number.isFinite(a) ? a.toFixed(2) : "";
    costHint.textContent = costManual && Number.isFinite(a) ? `Edited by you · worked out ${fUsd(a, 2)}` : "Quantity × price + fees. Change it if your app shows a different total.";
  };
  // The fee follows quantity × price (SwissBorg's 0.99%) until the friend types a fee of their own.
  let feesManual = Number.isFinite(s.fees);
  const refee = () => {
    if (feesManual) return;
    const sf = L.suggestFees(i, parseNum(qtyI.value), parseNum(priceI.value));
    feesI.value = Number.isFinite(sf) ? String(sf) : "";
  };
  for (const x of [qtyI, priceI]) x.addEventListener("input", () => { refee(); recalc(); });
  feesI.addEventListener("input", () => { feesManual = feesI.value.trim() !== ""; recalc(); });
  costI.addEventListener("input", () => { costManual = costI.value.trim() !== ""; recalc(); });
  const resetCost = h("button.btn.btn-small.btn-ghost", { type: "button", on: { click: () => { costManual = false; recalc(); } } }, "Work it out");
  recalc();

  modal({
    title: `${Number.isFinite(s.costUsd) ? "Edit fill" : "Log fill"}: ${nameText(i)}`,
    lede: `${long(o.date)} · ${o.account} · ${whatOf(o, cr)}`,
    body: [
      h("p.modal-help", "Copy these from the order confirmation in your broker's app."),
      h("div.form-grid",
        field(i.group === "crypto" ? `Amount of ${i.id}` : "Shares", qtyI, o.fractional ? "Two decimals are fine for part of a share" : i.group === "crypto" ? "As many decimals as your app shows" : null),
        field(`Price per ${i.group === "crypto" ? "coin" : "share"} (US$)`, priceI, pi.price != null ? `${pi.kind === "live" ? "Live" : "Last known"} ${fPrice(pi.price, i.quoteCurrency)}` : null),
        field("Fees (US$)", feesI, i.account === "SwissBorg" ? "Filled in with SwissBorg's 0.99%" : "Brokers vary; type what the confirmation shows"),
        field("Fill date", dateI),
        field("Total cost (US$)", h("div.cost-row", costI, resetCost), null),
        costHint, field("Note (optional)", noteI, null, ".span-2"), err)],
    actions: [h("button.btn.btn-ghost", { type: "button", on: { click: (e) => e.target.closest("dialog").close() } }, "Cancel"), h("button.btn.btn-primary", { type: "submit" }, "Save fill")],
    onSubmit: () => {
      const qty = parseNum(qtyI.value), price = parseNum(priceI.value), fees = parseNum(feesI.value), cost = parseNum(costI.value);
      const date = dateI.value;
      const bad = [];
      if (!(qty > 0)) bad.push(["the quantity", qtyI]);
      if (!(price > 0)) bad.push(["the price", priceI]);
      if (feesI.value.trim() !== "" && !(fees >= 0)) bad.push(["the fees", feesI]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) bad.push(["the date", dateI]);
      if (!(cost > 0)) bad.push(["the total cost", costI]);
      // Each field the message names is marked and points at it; focus goes to the first one.
      for (const x of [qtyI, priceI, feesI, dateI, costI]) { x.removeAttribute("aria-invalid"); x.removeAttribute("aria-describedby"); }
      if (bad.length) {
        err.textContent = `Please check ${bad.map(([w]) => w).join(", ")}.`;
        for (const [, x] of bad) { x.setAttribute("aria-invalid", "true"); x.setAttribute("aria-describedby", errId); }
        bad[0][1].focus();
        return false;
      }
      const first = !Number.isFinite(s.costUsd);
      if (first && app.active === "today" && !app.deskDate) app.deskDate = o.dateId;
      const note = noteI.value.trim().slice(0, 200);
      // The fill's price becomes the price this instrument is valued at, unless a newer one was typed.
      const at = date === today() ? new Date().toISOString() : `${date}T16:00:00+07:00`;
      commit((d) => {
        d.orders[o.id] = { ...(d.orders[o.id] || {}), status: "filled", qty, price, fees: Number.isFinite(fees) ? fees : 0, costUsd: L.round2(cost), filledAt: date, note, redirect: null };
        const cur = d.prices[i.id];
        if (!i.coingeckoId && (!cur || !(Date.parse(cur.at) > Date.parse(at)))) d.prices[i.id] = { price, at, src: "fill" };
      });
      toast(`${first ? "Filled" : "Fill updated"}: ${nameText(i)} · ${fmtQty(i, qty)} @ ${fPrice(price, i.quoteCurrency)} · ${fUsd(cost, 2)}`, "success");
      return true;
    },
  });
}

export function openSkipDialog(o) {
  const i = instById(o.instrument);
  // The coins are paid from the SwissBorg wallet, so their money can only stay there.
  const wallet = o.account === "SwissBorg";
  const pi = priceInfo(i);
  const cr = carry();
  const sz = L.sizeOrder(o, i, pi.price != null ? { price: pi.price } : null, null, orderCeiling(o), adjustFor(o, cr));
  const zero = o.wholeShares && pi.price != null && sz.qty === 0;
  const ct = nextCarryTarget(o);
  const coinNote = coinShort(o, cr);
  // After the last VWRA order there is none to join: the money stays as cash (the plan's last-order note).
  const def = wallet || !ct ? "cash" : "VWRA";
  const hasCeil = orderCeiling(o).kind !== "none";
  // The rule that sends this order's money to VWRA, named by case: a fund that buys no whole share, or an
  // order with no ceiling and no thesis check, follows the leftover rule; r1 and r2 only where they apply.
  const why = zero || (!hasCeil && !o.thesisGate) ? "The plan's leftover rule"
    : hasCeil && o.thesisGate ? "Rules r1 (the ceiling) and r2 (the thesis check)"
      : hasCeil ? "Rule r1 (still above its ceiling after four Tuesdays)" : "Rule r2 (a failed thesis check)";
  const choices = wallet
    ? [["cash", "Stays in the SwissBorg wallet", o.cryptoWait && !coinNote ? "Rule r8: buy it on the next date instead; if it has jumped more than 30% again by then, that money buys bitcoin." : "It waits in the wallet as dollars or USDC."]]
    : [ct ? ["VWRA", "Into VWRA", `${why}: that money joins the next VWRA order (${short(ct.date)}).`] : null,
      ["cash", "Keep as cash", ct ? "Hold it as cash at Interactive Brokers for now." : "This is the last VWRA order, so there is none to join: the money stays as cash at Interactive Brokers."]].filter(Boolean);
  const radios = h("fieldset.radio-set", h("legend", "Where the money goes"),
    choices.map(([v, t, sub]) =>
      h("label.radio", h("input", { type: "radio", name: "redirect", value: v, checked: v === def, "data-fk": "skipto-" + v }), h("span", h("strong", t), h("span.radio-sub", sub)))));
  const reason = h("textarea", { name: "reason", rows: 3, maxlength: 200, placeholder: zero ? "e.g. One share costs more than this month's amount" : coinNote ? "e.g. Too little in the wallet for this order" : "e.g. Still above the ceiling after four Tuesdays; thesis check failed" });
  const leftover = { then: leftoverText() };
  modal({
    title: `Skip: ${nameText(i)}`,
    lede: `${long(o.date)} · ${whatOf(o, cr)}`,
    body: [
      zero ? h("p.skip-zero", icon("info"), h("span", ct
        ? `At ${fPrice(pi.price, i.quoteCurrency)} a share, this order buys no whole share. The plan's leftover rule: its money joins the next VWRA order.`
        : `At ${fPrice(pi.price, i.quoteCurrency)} a share, this order buys no whole share. It is the last VWRA order, so its money stays as cash at Interactive Brokers.`)) : null,
      coinNote ? h("p.skip-zero", icon("info"), h("span", coinNote)) : null,
      wallet ? (o.cryptoWait && !coinNote ? ruleQuote(rule("r8"), "Plan rule 8") : null)
        : zero ? null : hasCeil ? ruleQuote(rule("r1"), "Plan rule 1") : o.thesisGate ? null : ruleQuote(leftover, "The plan's leftover rule"),
      o.thesisGate && !zero ? ruleQuote(rule("r2"), "Plan rule 2") : null,
      radios, field("Reason (for your records)", reason)],
    actions: [h("button.btn.btn-ghost", { type: "button", on: { click: (e) => e.target.closest("dialog").close() } }, "Cancel"), h("button.btn.btn-primary", { type: "submit" }, "Record skip")],
    onSubmit: (e) => {
      const v = (e.target.querySelector("input[name=redirect]:checked") || {}).value || def;
      if (app.active === "today" && !app.deskDate) app.deskDate = o.dateId;
      const note = reason.value.trim().slice(0, 200);
      commit((d) => { d.orders[o.id] = { ...(d.orders[o.id] || {}), status: "skipped", redirect: v, note }; });
      toast(`Skipped: ${nameText(i)} → ${v === "VWRA" ? "VWRA" : wallet ? "stays in the wallet" : "cash"}`, "info");
      return true;
    },
  });
}
