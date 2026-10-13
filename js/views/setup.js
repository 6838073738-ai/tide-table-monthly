// Setup: the friend's monthly amount (US dollars or Thai baht), an optional first name, and a live
// preview of the twelve months at that amount. Shown on the first visit, and from Settings ("Change
// amount") until the first fill, skip or transfer is logged.

import {
  app, h, clear, icon, L, S, prices, commit, toast, hooks, card, field, errorState, sourceLink, today, now,
  fM, fB, fUsd, fThb, fNum, long, dayShort, dateWords, monthName, locked, parseNum, svg,
} from "../core.js";
import { scalePlan, thbToUsd, usdToThb, isMonthlyUsdInRange, beforeJoin, MIN_MONTHLY_USD, MAX_MONTHLY_USD, BASE_MONTHLY_USD } from "../scale.js";
import { importState } from "./settings.js";

const GROUP_TOKEN = { index: "--series-1", growth: "--series-7", crypto: "--series-5" };

/** The form as it is being filled in (kept across re-renders). typed: the last amount typed in each currency. */
function draft() {
  if (!app.draft) {
    const p = S().plan;
    app.draft = {
      currency: p ? p.input.currency : "USD",
      amount: p ? String(p.input.amount) : "",
      name: (S().profile && S().profile.name) || "",
      typed: {},
    };
  }
  return app.draft;
}

/** The date the friend counts as starting (scale.beforeJoin): the one saved with the plan; for a plan
 *  saved before join dates were kept, the day it was first saved; else today. */
function joinDate(s = S()) {
  if (s.plan && s.plan.joinedAt) return s.plan.joinedAt;
  const c = s.createdAt ? Date.parse(s.createdAt) : NaN;
  return Number.isFinite(c) ? L.bkkDate(c) : today();
}

/** The rate a baht amount is converted at today: Frankfurter's when known, else the plan's ฿33.00. */
function rateNow() {
  const r = prices.fxRate(app.base.meta.planFx);
  return { ...r, rate: Math.round(r.rate * 100) / 100 };
}

/**
 * The draft read as a monthly amount: {usd, error, empty}. usd is in dollars to the cent; error is a
 * sentence for the friend (null when the amount can be used).
 */
function readAmount(d = draft()) {
  const raw = String(d.amount || "").trim();
  if (!raw) return { empty: true, usd: null, error: "Type how much you can invest each month." };
  const x = parseNum(raw);
  if (!Number.isFinite(x)) return { usd: null, error: "That doesn't look like an amount. Type digits only, for example 500." };
  if (x <= 0) return { usd: null, error: "The amount must be more than zero." };
  const r = rateNow();
  const usd = d.currency === "THB" ? thbToUsd(x, r.rate) : Math.round(x * 100) / 100;
  if (isMonthlyUsdInRange(usd)) return { usd, error: null };
  const lo = fM(MIN_MONTHLY_USD), hi = fM(MAX_MONTHLY_USD);
  const loT = fThb(Math.ceil(usdToThb(MIN_MONTHLY_USD, r.rate))), hiT = fThb(Math.floor(usdToThb(MAX_MONTHLY_USD, r.rate)));
  if (d.currency === "THB") {
    return { usd: null, error: `${fB(x)} is ${fUsd(usd, 2)} at ฿${fNum(r.rate, 2)} per dollar. The plan works with ${loT} to ${hiT} a month (${lo} to ${hi}).` };
  }
  return { usd: null, error: usd < MIN_MONTHLY_USD
    ? `The smallest amount this plan works with is ${lo} a month: below that, most orders would be too small to place.`
    : `The largest amount this plan works with is ${hi} a month.` };
}

export function renderSetup() {
  if (!app.base) return [errorState("The plan could not be loaded.", app.planError)];
  const d = draft();
  const changing = !!(S().plan && app.plan);
  if (changing && locked()) return lockedNotice();
  const base = app.base;
  const first = base.orderDates[0].date, last = base.orderDates[base.orderDates.length - 1].date;
  const pj = beforeJoin(base, joinDate());
  const out = [];
  if (S().plan && !app.plan) out.push(h("p.banner.is-warn", { role: "alert" }, icon("alert"), h("span", "The amount saved in this browser could not be used. Please choose your monthly amount again; your other records are kept.")));

  // ---- welcome
  out.push(card(".setup-hero", { "aria-labelledby": "h-setup" },
    h("div.setup-hero-text",
      changing ? h("p.eyebrow.eyebrow-moon", "Settings · your amount") : null, // the top bar already names the app
      h("h1.vtitle#h-setup", { tabindex: "-1" }, changing ? "Change your monthly amount" : "Your monthly plan, sized to you"),
      h("p.lede", changing
        ? "Pick a new amount. The plan's dates and mix stay the same; every order is worked out again from the new amount."
        : `Type what you can put aside each month, in US dollars or Thai baht. You get one written plan at that size: the same funds, stocks and coins on the second Tuesday of each month, ${dateWords(first)} to ${dateWords(last)}. You place each order in your own broker's app; Tide Table tells you what is due and keeps your records.`),
      lateNote(pj),
      changing ? null : h("ul.promises",
        h("li", icon("check"), h("span", h("strong", "Private. "), "No account, and nothing you type leaves this browser.")),
        h("li", icon("calendar"), h("span", h("strong", "Steady. "), "The dates are written in advance and never move for news or prices. Two written rules can move a purchase to another written date: a price ceiling (r1) and the 30% coin rule (r8).")),
        h("li", icon("info"), h("span", h("strong", "Plain words. "), "Every order comes with a short “How to place” guide.")))),
    setupWaves()));

  // ---- form + preview
  const preview = h("div.setup-preview-body");
  // Polite, and tied to the field (aria-describedby): it changes only after a pause in typing, on leaving the
  // field or on "Start", and only when its text changes, so a screen reader is not interrupted mid-amount.
  const err = h("p.form-error#setup-err", { "aria-live": "polite" });
  const rateLine = h("div.setup-rate", { "data-fk": "setup-rate" });
  const sym = h("span.amount-sym", { "aria-hidden": "true" }, d.currency === "THB" ? "฿" : "$");
  const hint = h("span.field-hint#setup-hint");
  const amount = h("input#setup-amount", {
    "data-fk": "setup-amount", inputmode: "decimal", autocomplete: "off", spellcheck: "false", maxlength: 14,
    placeholder: d.currency === "THB" ? "16,500" : "500", value: d.amount, "aria-describedby": "setup-hint setup-err",
  });
  const name = h("input", { "data-fk": "setup-name", autocomplete: "given-name", maxlength: 40, value: d.name, placeholder: "Optional" });
  const curBtn = (cur, label, fk) => h("button.seg-btn", {
    type: "button", "aria-pressed": String(d.currency === cur), "data-fk": fk,
    on: { click: () => switchCurrency(cur) },
  }, label);
  const seg = h("div.seg.cur-seg", { role: "group", "aria-label": "Currency" },
    curBtn("USD", "US dollars ($)", "setup-currency-usd"), curBtn("THB", "Thai baht (฿)", "setup-currency-thb"));

  let showErr = false; // after the first try to start: every problem shows at once
  /** Show the amount's problem (or none); the text only changes when it differs, so nothing is re-read. */
  const showError = (a, settled) => {
    const out = a.error && ((!a.empty && (showErr || (settled && a.usd == null))) || (showErr && a.empty)) ? a.error : "";
    // While typing, a problem appears only once the amount settles; a fixed amount clears it at once.
    if (!settled && !showErr && out) return;
    if (err.textContent !== out) err.textContent = out;
    amount.setAttribute("aria-invalid", String(!!out));
  };
  const refresh = (settled = false) => {
    const a = readAmount();
    sym.textContent = d.currency === "THB" ? "฿" : "$";
    amount.placeholder = d.currency === "THB" ? "16,500" : "500";
    const r = rateNow();
    hint.textContent = d.currency === "THB"
      ? `From ${fThb(Math.ceil(usdToThb(MIN_MONTHLY_USD, r.rate)))} to ${fThb(Math.floor(usdToThb(MAX_MONTHLY_USD, r.rate)))} a month. The plan works in US dollars, so baht are converted once, when you start.`
      : `From ${fM(MIN_MONTHLY_USD)} to ${fM(MAX_MONTHLY_USD)} a month.`;
    clear(rateLine).append(...rateText(a, r));
    showError(a, settled);
    clear(preview).append(...previewBody(a.usd).filter(Boolean)); // DOM append() would write "null" as text
  };
  let t = null, settle = null;
  amount.addEventListener("input", () => {
    d.amount = amount.value;
    d.typed[d.currency] = amount.value;
    app.draft = d;
    clearTimeout(t); clearTimeout(settle);
    t = setTimeout(() => refresh(false), 120);
    settle = setTimeout(() => showError(readAmount(), true), 1000);
  });
  amount.addEventListener("blur", () => { clearTimeout(settle); if (amount.value.trim()) showError(readAmount(), true); });
  name.addEventListener("input", () => { d.name = name.value; app.draft = d; });
  function switchCurrency(cur) {
    if (d.currency === cur) return;
    // Keep the same money when switching. What the friend typed in that currency comes back as it was,
    // if it is still the same money; otherwise the amount is converted at today's rate, to the satang or
    // cent, so switching back and forth never changes the dollars.
    const a = readAmount();
    const r = rateNow();
    d.typed[d.currency] = d.amount;
    if (a.usd != null) {
      const back = d.typed[cur];
      const same = back != null && readAmount({ currency: cur, amount: back }).usd === a.usd;
      if (same) d.amount = back;
      else if (cur === "THB") {
        const whole = Math.round(usdToThb(a.usd, r.rate));
        d.amount = String(thbToUsd(whole, r.rate) === a.usd ? whole : usdToThb(a.usd, r.rate));
      } else d.amount = String(a.usd);
    }
    d.currency = cur;
    app.draft = d;
    hooks.renderView("setup");
  }

  const form = h("form.setup-form-el", { novalidate: true, "aria-labelledby": "setup-form-h" },
    h("h2.card-title#setup-form-h", h("span.step-no", { "aria-hidden": "true" }, "1"), changing ? "The new amount" : "Your monthly amount"),
    seg,
    h("label.field.amount-field", { for: "setup-amount" }, h("span.field-label", "Each month I can invest"),
      h("span.amount-wrap", sym, amount), hint),
    rateLine,
    err,
    changing ? null : field("Your first name (optional)", name, "Only used to say hello. It stays in this browser."),
    h("div.setup-actions",
      h("button.btn.btn-primary.btn-big", { type: "submit", "data-fk": "setup-start" }, changing ? "Use this amount" : "Start my plan", h("span", { "aria-hidden": "true" }, " →")),
      changing ? h("a.btn.btn-ghost", { href: "#/settings", "data-fk": "setup-cancel" }, "Cancel")
        : h("label.btn.btn-ghost.file-btn", { "data-fk": "setup-imp", title: "A copy you downloaded from Settings, in another browser" }, "Load a saved copy…",
          h("input.visually-hidden", { type: "file", accept: "application/json,.json", on: { change: (e) => importState(e.target) } }))),
    h("p.fine", changing
      ? "Your checklists, notes and journal stay as they are."
      : "You can change the amount until you log your first fill, skip or transfer. This is a tracker for a written plan, not advice: check that it fits your own money, goals and taxes."),
    changing ? null : h("p.fine", "Your records stay in this browser only. On an iPhone or iPad, add this page to your Home Screen (Share, then Add to Home Screen), and download a copy now and then from Settings."));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    showErr = true;
    clearTimeout(settle);
    const a = readAmount();
    if (a.error) { refresh(true); amount.focus(); return; }
    start(a.usd, changing);
  });

  out.push(h("div.setup-grid",
    card(".setup-form", form, changing ? null : howItWorks(base)),
    card(".setup-preview", { "aria-labelledby": "setup-pv-h" }, preview)));

  refresh(true); // a re-render is not typing: show the amount's state as it stands
  return out;
}

function rateText(a, r) {
  const d = draft();
  const src = r.source === "plan"
    ? [h("span", "Rate: the plan's own"), h("span.muted", " (the live rate is not available right now)")]
    : [sourceLink(prices.SOURCES.fx), h("span", r.date ? `, ${long(r.date)}` : "")];
  if (d.currency === "THB") {
    const x = parseNum(d.amount);
    return [
      a.usd != null ? h("p.rate-main", h("strong.num", fB(x)), " a month is ", h("strong.num", fM(a.usd)), ` at ฿${fNum(r.rate, 2)} per US dollar.`)
        : h("p.rate-main", `Baht are converted at ฿${fNum(r.rate, 2)} per US dollar.`),
      h("p.rate-src", icon("funding"), h("span", ...src)),
    ];
  }
  return a.usd != null && r.rate
    ? [h("p.rate-main.muted", `About ${fThb(Math.round(usdToThb(a.usd, r.rate)))} a month at ฿${fNum(r.rate, 2)} per dollar.`), h("p.rate-src", icon("funding"), h("span", ...src))]
    : [];
}

/** The twelve months at `usd` a month (or the $500 example while the amount is empty or out of range). */
function previewBody(usd) {
  const example = usd == null;
  const M = example ? BASE_MONTHLY_USD : usd;
  let plan;
  try { plan = scalePlan(app.base, M); } catch (e) { return [errorState("This amount cannot be worked out.", e)]; }
  const inst = Object.fromEntries(plan.instruments.map((i) => [i.id, i]));
  // A friend starting late: the months before they joined buy nothing, and coins paid from a SwissBorg
  // transfer before then have nothing in the wallet.
  const pj = beforeJoin(plan, joinDate());
  const noWallet = walletGone(plan, pj);
  const counted = plan.orders.filter((o) => !pj.orderIds.has(o.id) && !(noWallet && o.cryptoWait));
  const total = counted.reduce((a, o) => a + Math.round(o.usd * 100), 0) / 100;
  const groups = plan.groups.map((g) => ({ ...g, usd: counted.filter((o) => inst[o.instrument].group === g.id).reduce((a, o) => a + o.usd, 0) })).filter((g) => g.usd > 0);
  const rows = plan.orderDates.map((d, k) => {
    const before = pj.dateIds.includes(d.id);
    const os = plan.orders.filter((o) => o.dateId === d.id).sort((a, b) => (a.account === b.account ? (a.time < b.time ? -1 : 1) : a.account === "SwissBorg" ? -1 : 1));
    const send = plan.funding.transfers.filter((t) => t.forDate === d.id).reduce((a, t) => a + Math.round(t.usd * 100), 0) / 100;
    return h(`li.pv-row${before ? ".is-pre" : ""}`,
      h("div.pv-date", h("span.pv-day.num", dayShort(d.date)), h("span.pv-month", `Month ${k + 1}`)),
      before ? h("ul.pv-what", h("li.pv-note", "Before you joined: nothing is bought or sent"))
        : h("ul.pv-what", os.map((o) => {
          const i = inst[o.instrument];
          const zero = noWallet && o.cryptoWait;
          return h("li", h("span.pv-name", i.group === "index" || i.id === "QNTM" ? i.id : i.name), " ", h("span.pv-amt.num", fM(zero ? 0 : o.usd)),
            o.cryptoWait ? h("span.pv-note", zero ? " (nothing in the wallet for it)" : " from the money waiting in SwissBorg") : null);
        })),
      h("div.pv-send", h("span.pv-send-label", "You send"), h("span.num", before ? "—" : fM(send))));
  });
  const notes = previewNotes(plan, M, example, pj);
  return [
    h("header.card-head",
      h("div.card-head-text",
        h("h2.card-title#setup-pv-h", h("span.step-no", { "aria-hidden": "true" }, "2"), example ? `An example year at ${fM(M)} a month` : `Your year at ${fM(M)} a month`),
        h("p.card-sub", example ? "Type your amount and every number below follows it." : "The same twelve dates for everyone; only the amounts follow yours."))),
    h("div.pv-stats",
      h("div.pv-stat", h("span.stat-label", "Each month"), h("span.pv-big.num-display", fM(M))),
      h("div.pv-stat", h("span.stat-label", pj.dateIds.length ? "From when you join" : "Over the year"), h("span.pv-big.num-display", fM(total))),
      h("div.pv-stat", h("span.stat-label", "Orders"), h("span.pv-big.num-display", String(plan.orders.filter((o) => !pj.orderIds.has(o.id)).length)))),
    h("div.pv-mix",
      h("p.eyebrow", "Where the money goes"),
      h("div.mix-bar", { role: "img", "aria-label": groups.map((g) => `${g.label} ${fNum((g.usd / total) * 100, 1)}%`).join(", ") },
        groups.map((g) => h("span.mix-seg", { style: { width: ((g.usd / total) * 100).toFixed(2) + "%", background: `var(${GROUP_TOKEN[g.id] || "--series-3"})` } }))),
      h("ul.mix-legend", groups.map((g) => h("li", h("span.swatch", { style: { background: `var(${GROUP_TOKEN[g.id] || "--series-3"})` }, "aria-hidden": "true" }), `${g.label} `, h("span.num", `${fNum((g.usd / total) * 100, 1)}%`))))),
    h("ol.pv-list", { "aria-label": "The twelve order dates" }, rows),
    notes.length ? h("ul.pv-notes", notes.map((n) => h("li", icon("info"), h("span", n)))) : null,
    h("p.fine", "These are amounts to invest, not forecasts: the plan never says what they will be worth."),
  ];
}

/** True when the coins' SwissBorg money (sent in November) was due before the friend joined, while the
 *  coins' own date was not: the wallet that pays for them is empty. */
function walletGone(plan, pj) {
  const s01 = plan.funding.transfers.find((t) => t.to === "SwissBorg");
  return !!(s01 && pj.transferIds.has(s01.id) && plan.orders.some((o) => o.cryptoWait && !pj.orderIds.has(o.id)));
}

/**
 * The plan has already begun: when it started, which months count for this friend (scale.beforeJoin:
 * those whose order date is still ahead), and, when the first of them had its money due already, the
 * plan's late-money rule. null when the friend is on time.
 */
function lateNote(pj) {
  const base = app.base;
  const name = (id) => monthName(base.orderDates.find((d) => d.id === id).date, false, true);
  const join = pj.joinedAt || joinDate();
  const firstD = base.orderDates.find((d) => d.id === (pj.firstDateId || base.orderDates[0].id) && d.date >= join) || null;
  const due = firstD ? base.funding.transfers.filter((t) => t.forDate === firstD.id && t.arriveBy).map((t) => t.arriveBy).sort()[0] : null;
  const lateMoney = !!(due && join > due);
  if (!pj.dateIds.length && !lateMoney) return null;
  const months = pj.dateIds.map(name);
  const list = months.length > 1 ? `${months.slice(0, -1).join(", ")} and ${months[months.length - 1]}` : months[0];
  const last = base.orderDates[base.orderDates.length - 1];
  const left = base.orderDates.length - pj.dateIds.length;
  const coins = base.orders.filter((o) => o.cryptoWait && !pj.orderIds.has(o.id)).map((o) => base.instruments.find((i) => i.id === o.instrument).name.toLowerCase());
  const parts = [h("strong", `The plan started on ${dateWords(base.orderDates[0].date)}. `)];
  if (!firstD) parts.push(`Starting on ${dateWords(join)}, every order date has passed, so nothing is left to buy.`);
  else if (pj.dateIds.length) {
    parts.push(`Starting on ${dateWords(join)}, your months are the ${left === 1 ? "last order date" : `${left} order dates`} from ${dateWords(firstD.date)} to ${dateWords(last.date)}. ${list} came before you joined: ${months.length > 1 ? "those months are" : "that month is"} marked “before you joined”, nothing is bought or sent for ${months.length > 1 ? "them" : "it"}, and nothing is owed.`);
    if (walletGone(base, pj)) parts.push(` The plan pays for ${coins.join(" and ")} from the money sent to SwissBorg in November, so for you ${coins.length > 1 ? "they are" : "it is"} $0.`);
  } else parts.push(`All twelve months count for you, from ${dateWords(firstD.date)}.`);
  if (firstD && lateMoney) parts.push(` The money for ${name(firstD.id)} was due by ${dateWords(due)}: send it as soon as you can, and place that month's orders on the next open day after it lands (the plan's rule r9).`);
  return h("p.late-note", { "data-fk": "setup-late" }, icon("calendar"), h("span", ...parts));
}

function previewNotes(plan, M, example, pj) {
  const notes = [];
  const inst = Object.fromEntries(plan.instruments.map((i) => [i.id, i]));
  const dateOf = Object.fromEntries(plan.orderDates.map((d) => [d.id, d.date]));
  const at = example ? `At ${fM(M)}` : `At ${fM(M)} a month`;
  for (const r of plan.scale.rolled) {
    if (pj.orderIds.has(r.into)) continue; // it would have gone into a month from before the friend joined
    const i = inst[r.instrument];
    const where = r.account === "SwissBorg" ? `under the ${fM(r.minUsd)} the plan allows for SwissBorg's smallest exchange (5 euros)` : `under the ${fM(r.minUsd)} the plan uses as the smallest order`;
    const into = plan.orders.find((o) => o.id === r.into);
    notes.push(`${at}, ${i.name}'s order would be ${fM(r.usd)}, ${where}. Its share goes into the ${dayShort(dateOf[into ? into.dateId : r.fundDateId])} VWRA order instead${r.account === "SwissBorg" ? ", and you send that much less to SwissBorg" : ""}.`);
  }
  const s01 = plan.funding.transfers.find((t) => t.to === "SwissBorg");
  const btc = plan.orders.find((o) => o.account === "SwissBorg" && !o.cryptoWait);
  const coins = plan.orders.filter((o) => o.cryptoWait);
  if (s01 && btc && coins.length && !pj.transferIds.has(s01.id)) {
    // Part of November's money, not more of it: the month's total already counts it.
    const nov = plan.funding.transfers.filter((t) => t.forDate === s01.forDate).reduce((a, t) => a + Math.round(t.usd * 100), 0) / 100;
    notes.push(`Of November's ${fM(nov)}, ${fM(s01.usd)} goes to SwissBorg: ${fM(btc.usd)} buys bitcoin, and ${fM(coins.reduce((a, o) => a + Math.round(o.usd * 100), 0) / 100)} waits in the wallet for January's ${coins.map((o) => inst[o.instrument].name.toLowerCase()).join(" and ")}.`);
  }
  if (M < BASE_MONTHLY_USD) {
    notes.push(`The plan was written for ${fM(BASE_MONTHLY_USD)} a month. The funds (VWRA, XDEW, EIMI and the quantum fund) are bought in whole shares, and one share can cost more than some of these orders. Then that order buys nothing that month and its money joins the next VWRA order (the plan's leftover rule), so nothing is lost. The order desk shows it once you type the price from your broker's app.`);
  }
  return notes;
}

function howItWorks(base) {
  const steps = [
    ["Get ready", `By ${dateWords(base.prepDeadline)}: open an Interactive Brokers account (for the funds and stocks) and a SwissBorg account (for the coins). A checklist walks you through it.`],
    ["Send the month's money", "The week before each order date. Tide Table shows how much, where to and by when."],
    ["Place the orders", "On the order date, in your broker's app. Tick each one off here, and that month is done."],
  ];
  return h("div.how-works",
    h("p.eyebrow", "How it works"),
    h("ol.steps", steps.map(([t, s], k) => h("li", h("span.steps-no.num", { "aria-hidden": "true" }, String(k + 1)), h("span", h("strong", t), h("span.steps-sub", s))))));
}

function lockedNotice() {
  const p = S().plan;
  return [
    h("h1.visually-hidden#h-setup", { tabindex: "-1" }, "Your monthly amount"),
    card(".setup-locked", { "aria-labelledby": "locked-h" },
      h("p.eyebrow", "Your amount"),
      h("h2.card-title#locked-h", `${fM(p.monthlyUsd)} a month, locked`),
      h("p", "The amount locks once you log a fill, a skip or a transfer, so the records you have kept stay true. If you send more or less to Interactive Brokers one month, record it on the Money page: only that month's VWRA order changes (rule r10)."),
      h("p", "To pick a new amount, export your records from Settings and start over."),
      h("a.btn", { href: "#/settings", "data-fk": "locked-settings" }, "Open Settings")),
  ];
}

/** Save the amount (and the name), then open Today. */
function start(usd, changing) {
  const d = draft();
  const r = rateNow();
  const amountTyped = Math.round(parseNum(d.amount) * 100) / 100;
  const input = d.currency === "THB"
    ? { currency: "THB", amount: amountTyped, rate: r.rate, rateSource: r.source === "plan" ? "the plan's rate" : "Frankfurter (European Central Bank)", rateDate: r.source === "plan" ? null : r.date }
    : { currency: "USD", amount: usd, rate: null, rateSource: null, rateDate: null };
  let scaled;
  try { scaled = scalePlan(app.base, usd, { input }); } catch (e) { toast(String(e.message || e), "alert"); return; }
  const name = String(d.name || "").trim().slice(0, 40);
  const bought = new Set(scaled.orders.map((o) => o.id));
  app.draft = null;
  app.deskDate = null;
  // The route first, so the plan's arrival (the store change below) opens Today straight away.
  hooks.go("today");
  commit((s) => {
    // The join date is kept when the amount changes: it says which months count (scale.beforeJoin).
    s.plan = { monthlyUsd: usd, input: { ...input, usd }, lockedAt: null, joinedAt: joinDate(s) };
    // An order the new amount does not buy keeps no entry. Only a to-do or placed one can be there (a fill
    // or a skip locks the amount), and left in place it would stop an export from loading again.
    for (const id of Object.keys(s.orders)) if (!bought.has(id)) delete s.orders[id];
    if (!s.createdAt) s.createdAt = new Date(now()).toISOString(); // the app clock (?now= in QA)
    if (!changing) s.profile = name ? { ...s.profile, name } : { ...s.profile };
  });
  toast(changing ? `Your plan now uses ${fM(usd)} a month` : `Your plan is ready: ${fM(usd)} a month`, "success");
}

function setupWaves() {
  const W = 1440, H = 120;
  const path = (amp, wl, base, ph) => {
    let d = `M0,${H} L0,${(base + amp * Math.sin(ph)).toFixed(1)}`;
    for (let x = 8; x <= W * 2; x += 8) d += ` L${x},${(base + amp * Math.sin((x / wl) * 2 * Math.PI + ph)).toFixed(1)}`;
    return d + ` L${W * 2},${H} Z`;
  };
  return svg("svg.tide", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" },
    svg("g.tide-layer.l1", {}, svg("path", { d: path(9, 480, 46, 0) })),
    svg("g.tide-layer.l2", {}, svg("path", { d: path(7, 360, 64, 1.3) })),
    svg("g.tide-layer.l3", {}, svg("path", { d: path(5, 720, 82, 2.1) })));
}
