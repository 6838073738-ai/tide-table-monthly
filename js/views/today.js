// Today: the countdown to the next step (an order date, a day to send money, the getting-ready
// deadline), the getting-ready checklist, progress, alerts from the plan's own rules, and the order
// desk with its fill and skip dialogs.

import {
  app, h, icon, toast, ui, L, S, $, svg, hooks, prices, now, today, ost, isDone, instById, rule,
  schedule, funding, carry, fxInfo, priceInfo, priceSource, ceilingOf, orderCeiling,
  fM, fUsd, fThb, fNum, fPct, fPrice, long, short, inDays, parseNum, bkkTime, timeLabel, fmtQty, qtyWords, monthName, dayShort,
  autoDeskDate, dateOfId, ordersOn, orderWhat, adjustFor, nextCarryTarget, howTo, statusPill, ceilPill, fmtCeil, STATUS_PILL, pill,
  card, cardHead, ruleQuote, disclosure, field, afterRender, sourceLink, commit, modal, confirmDialog, plural,
  pre, isPreOrder, isPreTransfer, isPreDate, joinedPlan, joinedBudgetUsd, progressNow, coinQty, leftoverText, coinMinUsd, skippedUsd,
  copyDue, exportState, howOf, dateNotesFor,
} from "../core.js";

const EVENT_KIND = { order: "Order date", funding: "Money must arrive", send: "Send money", milestone: "Plan date", prep: "Getting ready" };
/** The dial's word on the day of an event the plan gives no clock time for. */
const DAY_WORD = { send: "send day", funding: "money due", prep: "deadline", milestone: "plan date" };
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
      if (e.kind === "prep") return { ...e, title: "Finish getting ready", summary: "Accounts, a practice run, the thesis checks and your calendar, before any money moves." };
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
    if (e.kind === "prep") return app.plan.prep.some((p) => !st.prep[p.id]);
    if (e.kind === "milestone") return app.plan.instruments.some((i) => ceilingOf(i).kind === "pending");
    return true;
  });
  return { all, open, fund };
}

export function stopTodayTicker() {
  if (app.todayTimer) { clearInterval(app.todayTimer); app.todayTimer = null; }
}

export function renderToday() {
  const plan = app.plan;
  const st = S();
  const { all, open, fund } = planEvents();
  const t = now();
  const td = today();
  const todayOrder = open.find((e) => e.kind === "order" && e.date === td);
  // A day event stays next for all of its day: the plan gives a send day no clock time.
  const future = open.filter((e) => (isDayEvent(e) ? e.date >= td : e.at > t));
  const next = todayOrder || future[0] || null;
  const prevAt = next ? Math.max(L.bkkToEpoch(plan.meta.docDate, "00:00"), ...all.filter((e) => e.at < next.at && e.at <= t).map((e) => e.at)) : t;
  const name = st.profile && st.profile.name;
  const out = [
    h("h1.visually-hidden", { id: "h-today", tabindex: "-1" }, "Today"),
    h("p.greet.rise", name ? `Hello, ${name}.` : "Hello.", h("span.greet-date", ` ${new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Bangkok" }).format(new Date(t))}`)),
  ];

  // ---- hero
  const hero = card(".hero", { "aria-labelledby": "next-title" });
  const grid = h("div.hero-grid");
  if (next) {
    const moon = moonDial();
    const money = next.kind === "send" || next.kind === "funding" ? moneyGroup(next, fund, st) : null;
    // Money due with a transfer still to send: say "Send" until it is marked sent.
    const title = money && next.kind === "funding" && money.toSend ? `Send the money for ${monthName(dateOfId(next.forDate), false, true)}` : next.title;
    grid.append(moon.el);
    grid.append(h("div.hero-main",
      h("p.eyebrow.eyebrow-moon", next === todayOrder ? "Today · order day" : `${next.date === td ? "Today" : "Next"} · ${EVENT_KIND[next.kind] || "Event"}${next.step ? " · step " + next.step : ""}`),
      h("h2.hero-title#next-title", title),
      h("p.hero-when", h("span", long(next.date)), heroWhen(next)),
      // The plan's summary quotes plan amounts: left out when a rule for differences changed one of them
      // (the list below shows the amounts that apply), and for a month's money with several transfers.
      next.summary && (!money || money.group.length === 1) && !(next.kind === "order" && ordersOn(next.id).some((o) => !isDone(o.id) && adjustFor(o, carry()) !== 0))
        ? h("p.hero-summary", next.summary) : null,
      heroTodo(next, fund, st, money)));
    const after = future.filter((e) => e !== next).slice(0, 4);
    grid.append(h("aside.hero-side", { "aria-label": "Coming up" },
      h("p.eyebrow", "After that"),
      after.length ? h("ol.upcoming", after.map((e) => h("li",
        h("span.up-date.num", short(e.date)),
        h("span.up-text", h("span.up-title", e.title), h("span.up-rel", `${EVENT_KIND[e.kind] || ""} · ${inDays(L.daysBetween(td, e.date))}`))))) : h("p.muted", "Nothing else scheduled."),
      h("a.link-arrow", { href: "#/year", "data-fk": "hero-year" }, "The whole year", h("span", { "aria-hidden": "true" }, " →"))));
    afterRender(() => startTodayTicker(moon, next, prevAt, next === todayOrder));
  } else {
    const left = schedule().orders.filter((o) => !isDone(o.id)).sort((a, b) => a.at - b.at);
    const last = plan.orderDates[plan.orderDates.length - 1];
    if (left.length) {
      // Every date has passed but some orders were never logged: the year is not complete yet.
      const dates = [...new Set(left.map((o) => o.dateId))];
      grid.append(h("div.hero-main.is-complete", h("p.eyebrow", "Every order date has passed"), h("h2.hero-title#next-title", `${plural(left.length, "order")} still open`),
        h("p.hero-summary", `${dates.map((d) => short(dateOfId(d))).join(", ")}: log each fill, or record a skip, so your records are complete.`),
        h("a.btn.btn-moon", { href: "#desk", "data-fk": "hero-desk", on: { click: (e) => { e.preventDefault(); openDesk(dates[0]); } } }, "Open the order desk")));
    } else if (!joinedPlan().orders.length) {
      grid.append(h("div.hero-main.is-complete", h("p.eyebrow", "Before you joined"), h("h2.hero-title#next-title", "The plan's twelve months had passed."),
        h("p.hero-summary", "Nothing is due. The plan's maintenance calendar is on the Rules page."),
        h("a.link-arrow", { href: "#/rules", "data-fk": "hero-maint" }, "The maintenance calendar →")));
    } else {
      grid.append(h("div.hero-main.is-complete", h("p.eyebrow", "Year one complete"), h("h2.hero-title#next-title", "Every order is done."),
        h("p.hero-summary", ((plan.dateNotes || {})[last.id] || [])[0] || "The maintenance calendar takes over."),
        h("a.link-arrow", { href: "#/rules", "data-fk": "hero-maint" }, "The maintenance calendar →")));
    }
  }
  hero.append(grid, tideWaves());
  out.push(hero);

  out.push(keepCopyCard());
  out.push(readyCard());
  out.push(renderProgress(st));
  out.push(renderAlerts());
  out.push(renderDesk());
  return out;
}

function heroWhen(next) {
  if (!next.untimed) return h("span.num", ` · ${bkkTime(next.at)} Bangkok time`);
  if (next.kind === "order") return h("span", " · any time that day");
  if (next.kind === "funding" || next.kind === "prep") return h("span.num", " · by 17:00 Bangkok time");
  return null;
}

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

function heroTodo(next, fund, st, money) {
  const cr = carry();
  if (next.kind === "order") {
    const os = ordersOn(next.id).filter((o) => !isDone(o.id));
    const shown = os.slice(0, 4);
    return h("div.hero-todo",
      h("ul.todo-list", shown.map((o) => h("li", h("span.todo-time.num", timeLabel(o)), h("span.todo-acct", o.account), h("span.todo-what", orderWhat(o, cr))))),
      os.length > shown.length ? h("p.muted.small", `+ ${os.length - shown.length} more on the order desk below`) : null,
      h("a.btn.btn-moon", { href: "#desk", "data-fk": "hero-desk", on: { click: (e) => { e.preventDefault(); openDesk(next.id); } } }, "Open the order desk"));
  }
  if (money) {
    const { group, stOf, toSend } = money;
    const fs = st.funding || {};
    const fx = fxInfo();
    const toDo = group.filter((t) => stOf(t) === "todo" && howOf(t));
    return h("div.hero-todo",
      h("ul.todo-list.is-money", { "data-fk": "hero-transfers" }, group.map((t) => {
        const s = fs[t.id] || {};
        return h("li",
          h("span.todo-time.num", fM(t.usd)),
          stOf(t) === "todo"
            ? h("span.todo-what", `to ${dest(t.to)}`, h("span.muted", ` · about ${fThb(t.thb)} at ฿${fNum(fx.rate, 2)}`))
            : h("span.todo-what", `in ${dest(t.to)}`, h("span.muted", ` · sent${s.sentAt ? " " + short(s.sentAt) : ""}, not marked arrived yet`)));
      })),
      toDo.map((t) => h("p.muted.small", toDo.length > 1 || group.length > 1 ? `${dest(t.to)}: ${howOf(t)}` : howOf(t))),
      h("a.btn.btn-moon", { href: "#/money", "data-fk": "hero-money" }, toSend ? "Record it on Money" : "Open Money"));
  }
  if (next.kind === "prep") {
    const done = app.plan.prep.filter((p) => st.prep[p.id]).length;
    return h("div.hero-todo",
      h("p.todo-line", h("strong", `${done} of ${app.plan.prep.length}`), " getting-ready checks done."),
      h("a.btn.btn-moon", { href: "#ready", "data-fk": "hero-checklist", on: { click: (e) => { e.preventDefault(); const r = $("#ready") || $("#prep-h"); if (r) { r.scrollIntoView({ behavior: ui.reducedMotion() ? "auto" : "smooth", block: "start" }); r.focus({ preventScroll: true }); } else hooks.go("rules"); } } }, "Open the checklist"));
  }
  if (next.kind === "milestone") {
    return h("div.hero-todo",
      h("p.todo-line", "Look up each one's closing price that day, then type them in Settings."),
      h("a.btn.btn-moon", { href: "#/settings", "data-fk": "hero-ceilings" }, "Enter the closes"));
  }
  return null;
}

/** Open the order desk on a date and bring it into view. */
export function openDesk(dateId) {
  app.deskDate = dateId;
  if (app.active !== "today") { hooks.go("today"); }
  hooks.invalidate("state");
  setTimeout(() => { const d = $("#desk"); if (d) { d.scrollIntoView({ behavior: ui.reducedMotion() ? "auto" : "smooth", block: "start" }); d.focus({ preventScroll: true }); } }, 120);
}

function moonDial() {
  const size = 236, c = size / 2, r = 96;
  const C = 2 * Math.PI * r;
  const ticks = svg("g.moon-ticks");
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * 2 * Math.PI - Math.PI / 2;
    const r1 = r + 10, r2 = r + (k % 5 === 0 ? 18 : 14);
    ticks.append(svg("line", { x1: (c + r1 * Math.cos(a)).toFixed(2), y1: (c + r1 * Math.sin(a)).toFixed(2), x2: (c + r2 * Math.cos(a)).toFixed(2), y2: (c + r2 * Math.sin(a)).toFixed(2), class: k % 5 === 0 ? "major" : "" }));
  }
  const arc = svg("circle.moon-arc", { cx: c, cy: c, r, transform: `rotate(-90 ${c} ${c})`, "stroke-dasharray": `${C} ${C}` });
  const dot = svg("circle.moon-dot", { cx: c, cy: c - r, r: 7 });
  const gid = "moonglow" + Math.random().toString(36).slice(2, 7);
  const s = svg("svg.moon-svg", { viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true" },
    svg("defs", {}, svg("radialGradient", { id: gid, cx: "50%", cy: "38%", r: "60%" },
      svg("stop", { offset: "0%", class: "moon-g0" }), svg("stop", { offset: "100%", class: "moon-g1" }))),
    svg("circle.moon-disc", { cx: c, cy: c, r: r - 16, fill: `url(#${gid})` }),
    ticks,
    svg("circle.moon-track", { cx: c, cy: c, r }),
    arc, dot);
  const big = h("span.moon-big"), unit = h("span.moon-unit"), small = h("span.moon-small.num");
  const el = h("div.moon", { role: "img" }, s, h("div.moon-face", big, unit, small));
  return { el, arc, dot, big, unit, small, C, c, r };
}

function startTodayTicker(m, next, prevAt, isToday) {
  stopTodayTicker();
  let lastLabelMin = -1;
  const pad = (n) => String(n).padStart(2, "0");
  // A day event (send day, money due, deadline) has no clock time in the plan: the dial counts calendar
  // days to it, the same count as everywhere else on the page, and says "Today" on the day.
  const dayEvent = isDayEvent(next);
  const target = dayEvent ? L.bkkToEpoch(next.date, "00:00") : next.at;
  const tick = () => {
    const t = now();
    const rem = target - t;
    const win = Math.max(60000, target - prevAt);
    const frac = isToday ? 0 : Math.max(0, Math.min(1, rem / win));
    m.arc.setAttribute("stroke-dasharray", `${(frac * m.C).toFixed(2)} ${m.C.toFixed(2)}`);
    const a = -Math.PI / 2 + frac * 2 * Math.PI;
    m.dot.setAttribute("cx", (m.c + m.r * Math.cos(a)).toFixed(2));
    m.dot.setAttribute("cy", (m.c + m.r * Math.sin(a)).toFixed(2));
    let label;
    if (dayEvent) {
      const days = L.daysBetween(today(), next.date);
      if (days <= 0) { m.big.textContent = "Today"; m.big.classList.add("is-word"); m.unit.textContent = DAY_WORD[next.kind] || "today"; m.small.textContent = dayShort(next.date); label = `Today: ${next.title}`; }
      else { m.big.textContent = String(days); m.big.classList.remove("is-word"); m.unit.textContent = days === 1 ? "day" : "days"; m.small.textContent = dayShort(next.date); label = `${plural(days, "day")} until: ${next.title}`; }
    } else if (isToday || rem <= 0) {
      m.big.textContent = "Today"; m.big.classList.add("is-word"); m.unit.textContent = "order day"; m.small.textContent = bkkTime(t) + " Bangkok";
      label = `Today is an order day: ${next.title}`;
    } else {
      const d = Math.floor(rem / 86400000), hh = Math.floor((rem % 86400000) / 3600000), mm = Math.floor((rem % 3600000) / 60000), ss = Math.floor((rem % 60000) / 1000);
      if (d >= 1) { m.big.textContent = String(d); m.unit.textContent = d === 1 ? "day" : "days"; m.small.textContent = `${pad(hh)}:${pad(mm)}:${pad(ss)}`; }
      else { m.big.textContent = `${hh}:${pad(mm)}`; m.unit.textContent = "hours"; m.small.textContent = `${pad(ss)} s`; }
      label = `${ui.fmtCountdown(rem)} until: ${next.title}`;
    }
    const minute = Math.floor(t / 60000);
    if (minute !== lastLabelMin) { lastLabelMin = minute; m.el.setAttribute("aria-label", label); }
    if (!isToday && !dayEvent && rem <= 0) { stopTodayTicker(); hooks.invalidate("time"); }
  };
  tick();
  app.todayTimer = setInterval(() => { if (!document.hidden) tick(); }, 1000);
}

function wavePath(width, height, amp, wavelength, base, phase = 0) {
  let d = `M0,${height} L0,${(base + amp * Math.sin(phase)).toFixed(1)}`;
  for (let x = 8; x <= width; x += 8) d += ` L${x},${(base + amp * Math.sin((x / wavelength) * 2 * Math.PI + phase)).toFixed(1)}`;
  return d + ` L${width},${height} Z`;
}
export function tideWaves() {
  const W = 1440, H = 120;
  const layer = (cls, amp, wl, base, ph) => svg(`g.tide-layer.${cls}`, {}, svg("path", { d: wavePath(W * 2, H, amp, wl, base, ph) }));
  return svg("svg.tide", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" },
    layer("l1", 9, 480, 46, 0), layer("l2", 7, 360, 64, 1.3), layer("l3", 5, 720, 82, 2.1));
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

/** The plan's final checks, on Today until they are done (or the ceiling day has passed); always on Rules. */
function readyCard() {
  const plan = app.plan, st = S();
  const n = plan.prep.length;
  const done = plan.prep.filter((p) => st.prep[p.id]).length;
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
    h("ul.checklist", plan.prep.map((p) => h(`li${st.prep[p.id] ? ".is-done" : ""}`,
      h("label.check",
        h("input", { type: "checkbox", checked: !!st.prep[p.id], "data-fk": "ready-" + p.id, on: { change: (e) => { const v = e.target.checked; commit((d) => { d.prep[p.id] = v; }); } } }),
        h("span.check-box", { "aria-hidden": "true" }, icon("check")),
        h("span.check-text", p.text, p.appNote ? h("span.check-note", ` ${p.appNote}`) : null))))));
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
  const ticks = h("div.ticks", { role: "img", "aria-label": progressLabel(pr) },
    orders.slice().sort((a, b) => a.at - b.at).map((o) => h(`span.tick.is-${ost(o.id).status || "pending"}`, { title: `${short(o.date)} · ${instById(o.instrument).name} · ${(STATUS_PILL[ost(o.id).status || "pending"] || [])[0]}` })));
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
    out.push({ level: "alert", key: "r1-" + o.id, title: `${i.name} is above its ceiling`,
      body: `${fPrice(p.price, i.quoteCurrency)} (${priceSource(p)}) against a ceiling of ${fPrice(c.value, i.quoteCurrency)}. ${d >= 0 ? `Its order is ${inDays(d)} (${long(o.date)}).` : `Its ${short(o.date)} order is still open.`}`,
      rule: rule("r1"), href: "#desk" });
  }
  // r2: a thesis-gated order within 14 days
  for (const o of orders) {
    if (!o.thesisGate || isDone(o.id)) continue;
    const d = L.daysBetween(td, o.date);
    if (d < 0 || d > 14) continue;
    const i = instById(o.instrument), last = lastCheck(i.id);
    out.push({ level: "warn", key: "r2-" + o.id, title: `Thesis check due: ${i.name}`,
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
  // r8: ether and solana, in the weeks before their date (no price history here, so this is a reminder);
  // not when the wallet holds nothing for them
  const coins = orders.filter((o) => o.cryptoWait && !isDone(o.id) && !(cr.coinUsd && cr.coinUsd[o.id] === 0));
  if (coins.length) {
    const d = L.daysBetween(td, coins[0].date);
    if (d >= 0 && d <= 14) {
      out.push({ level: "info", key: "r8", title: `Rule r8 check before ${long(coins[0].date)}`,
        body: `Look at how much ${coins.map((o) => instById(o.instrument).name.toLowerCase()).join(" and ")} moved over the 30 days before the order (your SwissBorg app shows it).`,
        rule: rule("r8"), href: "#desk" });
    }
  }
  // ceiling day (27 Nov)
  const m = (plan.milestones || []).find((x) => x.id === "m-ceil");
  if (m) {
    const dd = L.daysBetween(td, m.date);
    const pending = plan.instruments.filter((i) => ceilingOf(i).kind === "pending").map((i) => i.name);
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
  const done = plan.prep.filter((p) => st.prep[p.id]).length;
  if (done < plan.prep.length && !readyShown() && pd >= -14 && pd <= 30) {
    out.push({ level: pd <= 3 ? "warn" : "info", key: "prep", title: `Getting ready: ${done} of ${plan.prep.length} done`,
      body: `The plan says finish them by ${long(plan.prepDeadline)}${pd >= 0 ? `, ${inDays(pd)}` : ""}, before any money moves.`, href: "#/rules" });
  }
  const rank = { alert: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
function readyShown() {
  const plan = app.plan, st = S();
  const ms = (plan.milestones || []).find((m) => m.id === "m-ceil");
  return plan.prep.some((p) => !st.prep[p.id]) && today() <= (ms ? ms.date : plan.orderDates[0].date);
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
  const body = [
    h("div.desk-cols", { "aria-hidden": "true" }, ["Time", "Order", "Price", "Ceiling", "Size at this price", "Market", ""].map((t) => h("span", t))),
    h("ol.desk-list", { "aria-labelledby": "desk-h" }, rows),
  ];
  if (selPre) body.unshift(h("p.desk-past", icon("info"), `Before you joined: this order date came before you started on ${long(pre().joinedAt)}. Nothing is bought or sent for it, and nothing is owed.`));
  else if (dd < 0 && openCount) body.unshift(h("p.desk-past", icon("info"), `This date has passed with ${plural(openCount, "order")} still open. The plan: if an exchange was closed, place the order on its next open day; then log the fill or record a skip.`));
  return card(".desk", { id: "desk", tabindex: "-1", "aria-labelledby": "desk-h" }, head,
    h("p.desk-help", "For each order: type the price your broker's app shows (coins update by themselves), place the order there, then log the fill here. “How to place” explains each step."),
    body,
    notes.length ? h("div.desk-notes", h("p.eyebrow", "Notes for this date, from the plan"), h("ul", notes.map((n) => h("li", n)))) : null,
    hasCoins ? h("p.fine.desk-src", icon("info"), h("span", sourceLink(prices.SOURCES.crypto), prices.data.cryptoAt ? `, updated ${ui.relTime(prices.data.cryptoAt / 1000)}` : "", ". Stock and fund prices are the ones you type.")) : null);
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
  const input = h("input.price-input", {
    id: "in-" + id, "data-fk": id, inputmode: "decimal", autocomplete: "off", spellcheck: "false", maxlength: 12,
    value: pi.price != null ? String(pi.price) : "", placeholder: "US$",
    "aria-describedby": "src-" + id,
    on: { change: (e) => savePrice(i, e.target) },
  });
  return h("div.dr-price.is-input",
    h("label.cell-label.is-shown", { for: "in-" + id }, `Price in your app`, h("span.visually-hidden", ` for ${i.name}, in US dollars`)),
    input,
    h("span.price-src#src-" + id, pi.price == null ? "Type it to size the order" : priceSource(pi)));
}

function savePrice(i, el) {
  const raw = el.value.trim();
  if (raw === "") {
    el.removeAttribute("aria-invalid");
    commit((d) => { delete d.prices[i.id]; });
    return;
  }
  const v = parseNum(raw);
  if (!(v > 0) || !Number.isFinite(v)) {
    // The message stays in the field's own description (aria-describedby) until the price is fixed.
    const msg = "Type the price as a number, for example 193.92. Nothing was saved.";
    el.setAttribute("aria-invalid", "true");
    const src = document.getElementById("src-price-" + i.id);
    if (src) { src.textContent = msg; src.classList.add("is-error"); }
    ui.announce(`${i.name}: ${msg}`);
    return;
  }
  el.removeAttribute("aria-invalid");
  commit((d) => { d.prices[i.id] = { price: v, at: new Date().toISOString(), src: "entry" }; });
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
    h("div.dr-time", h("span.num", timeLabel(o)), o.time !== "any" ? h("span.dr-tz", "Bangkok") : null),
    h("div.dr-order", h("p.dr-name", i.name, h("span.ticker.num", i.id)), h("p.dr-what", h("span.acct-chip", o.account), " ", orderWhat(o))),
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
  const fresh = app.justFilled && app.justFilled.id === o.id && Date.now() - app.justFilled.t < 1600;
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
  if (adj && !isDone(o.id) && !(coinNote && usdNow <= 0)) sizeBits.push(h("span.size-note", `${adj > 0 ? "+" : "−"}${fUsd(Math.abs(adj), 2)} by the rules for differences`));
  const skipFirst = zero || !!coinNote;
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
    h("div.dr-time", h("span.num", timeLabel(o)), o.time !== "any" ? h("span.dr-tz", "Bangkok") : null),
    h("div.dr-order",
      h("p.dr-name", i.name, h("span.ticker.num", i.id)),
      h("p.dr-what", h("span.acct-chip", o.account), " ", orderWhat(o, ctx.carry)),
      o.thesisGate ? h("p.dr-gate", icon("rules"), "Thesis check first (rule r2)") : null),
    priceCell(o, i, pi),
    h("div.dr-ceil", h("span.cell-label", "Ceiling"), c.kind === "none" ? null : h("span.num.dr-ceil-val", fmtCeil(c, i)), ceilPill(cs), hr != null ? h("span.dr-head.num", hr >= 0 ? `${fNum(hr, 1)}% below it` : `${fNum(-hr, 1)}% over`) : null),
    h("div.dr-size", h("span.cell-label", "Size at this price"), sizeBits),
    h("div.dr-venue", h("span.cell-label", "Market"), h(`span.venue-inline${nowSt.open ? ".is-open" : ""}`, h("span.vdot", { "aria-hidden": "true" }), `${VENUE_SHORT[venue.id] || venue.label} ${nowSt.open ? "open" : "closed"}`), h("span.dr-hours", "now · regular hours")),
    h("div.dr-act", statusPill(status), actions),
    status === "filled" ? h(`div.stamp${fresh ? ".stamp-in" : ""}`, { "aria-hidden": "true" }, "Filled") : null,
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
  toast(`Marked placed: ${instById(o.instrument).name}`, "info");
}

export async function undoOrder(o) {
  const s = ost(o.id);
  if (s.status === "filled") {
    const ok = await confirmDialog({ title: "Undo this fill?", text: `The fill for ${instById(o.instrument).name} on ${short(o.date)} goes back to to-do. The logged numbers are cleared.`, ok: "Undo fill", danger: true });
    if (!ok) return;
  }
  commit((d) => { d.orders[o.id] = { status: "pending", qty: null, price: null, fees: null, costUsd: null, filledAt: null, note: "", redirect: null }; });
  toast("Back to to-do", "info");
}

function celebrate(oid) {
  app.justFilled = { id: oid, t: Date.now() };
  const row = document.querySelector(`[data-row="${CSS.escape(oid)}"]`);
  if (!row || ui.reducedMotion()) return;
  const r = row.getBoundingClientRect();
  const host = h("div.spray", { "aria-hidden": "true", style: { left: Math.round(Math.min(r.right - 90, window.innerWidth - 40)) + "px", top: Math.round(r.top + Math.min(r.height / 2, 60)) + "px" } });
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + Math.random() * 0.35;
    const dist = 26 + Math.random() * 54;
    host.append(h("i", { style: { "--dx": (Math.cos(a) * dist).toFixed(1) + "px", "--dy": (Math.sin(a) * dist - 14).toFixed(1) + "px", "--d": Math.round(Math.random() * 140) + "ms", "--s": (0.5 + Math.random() * 0.9).toFixed(2) } }));
  }
  document.body.append(host);
  setTimeout(() => host.remove(), 1200);
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
    title: `${Number.isFinite(s.costUsd) ? "Edit fill" : "Log fill"}: ${i.name}`,
    lede: `${long(o.date)} · ${o.account} · ${orderWhat(o, cr)}`,
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
      if (first) celebrate(o.id);
      toast(`${first ? "Filled" : "Fill updated"}: ${i.name} · ${fmtQty(i, qty)} @ ${fPrice(price, i.quoteCurrency)} · ${fUsd(cost, 2)}`, "success");
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
    title: `Skip: ${i.name}`,
    lede: `${long(o.date)} · ${orderWhat(o, cr)}`,
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
      toast(`Skipped: ${i.name} → ${v === "VWRA" ? "VWRA" : wallet ? "stays in the wallet" : "cash"}`, "info");
      return true;
    },
  });
}
