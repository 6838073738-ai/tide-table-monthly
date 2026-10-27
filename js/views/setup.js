// Setup: the friend's monthly amount (US dollars or Thai baht), an optional first name, and a live
// preview of the twelve months at that amount. Shown on the first visit, and from Settings ("Change
// amount") to set a new usual amount from a month on: earlier months, and months the friend's records fix,
// keep their amounts (months.setAmountFrom, saved through core.commitPlanChange).

import {
  app, h, clear, icon, L, S, prices, commit, toast, hooks, card, field, errorState, sourceLink, today, now,
  fM, fB, fUsd, fThb, fNum, long, dayShort, dateWords, monthName, locked, parseNum, svg,
  M, commitPlanChange, explain, fixed, openMonthIds, resolvedMonths, mixIsOwn, store, universeOn,
} from "../core.js?v=2.1.0";
import { scalePlan, thbToUsd, usdToThb, beforeJoin, ownIdMonth, MIN_MONTHLY_USD, MAX_MONTHLY_USD, BASE_MONTHLY_USD } from "../scale.js?v=2.1.0";
import { importState } from "./settings.js?v=2.1.0";
import * as book from "../book.js?v=2.1.0";
import * as LK from "../lock.js?v=2.1.0";
import { lockDateLine } from "./naming.js?v=2.1.0";
import { rateNow as rateToday, readTyped, inputRecord, recordWords, placedWarning, monthWordOf, monthOption, listAnd, holdName, paidBy } from "./amounts.js?v=2.1.0";

const GROUP_TOKEN = { index: "--series-1", growth: "--series-7", crypto: "--series-5" };
/** The locked 10% (lock.js LOCK_GROUP) is a single stock like the plan's others, so the mix counts it with them in
 *  "growth": no slice, legend row or colour of its own (addendum G, review finding UI-2). */
const shownGroup = (i) => (i && i.group === LK.LOCK_GROUP.id ? "growth" : i ? i.group : null);

/**
 * The year a new friend gets at `usd` a month: the written plan with the locked 10% (addendum B.1), from their first
 * month (months.adoptLock gives a fresh plan the same). Falls back to the plan alone if the lock cannot be worked
 * out, so the preview always shows a year.
 */
function newPlanAt(usd, input = null) {
  const pj = beforeJoin(app.base, joinDate());
  const rec = {
    monthlyUsd: usd, input: { ...(input || { currency: "USD", amount: usd }), usd }, lockedAt: null, joinedAt: joinDate(),
    months: {}, mix: {}, mixFrom: null, lock: { k: LK.LOCK_KEY, from: pj.firstDateId || "m13", f: null, s: null },
  };
  try { return M.scaleFor(app.base, rec, { inputs: false }); } catch (e) { console.warn("the locked 10% could not be shown in the preview", e); }
  return scalePlan(app.base, usd);
}

/** The preview's line about the locked 10%, with its date line and the "as written" line (lock-api.md 6). */
function lockPreviewNote() {
  return `${LK.LOCK_NAME}: ${LK.LOCK_COPY.share}, locked in every plan. Until it trades, its 10% goes to VWRA. ${lockDateLine()} ${LK.LOCK_COPY.asWritten}`;
}

/** True on the "Change your monthly amount" page: there is a plan already, and it can be worked out. */
const isChanging = () => !!(S().plan && app.plan);

/**
 * The form as it is being filled in (kept across re-renders). typed: the last amount typed in each
 * currency. When changing: from, the first month the new amount applies to; keep[mNN] false for a month
 * set on its own that the friend unticked.
 */
function draft() {
  if (!app.draft) {
    const p = S().plan;
    app.draft = {
      currency: p ? p.input.currency : "USD",
      amount: p ? String(p.input.amount) : "",
      name: (S().profile && S().profile.name) || "",
      typed: {},
      from: null,
      keep: {},
    };
  }
  const d = app.draft;
  // The month a change starts from must still be open (a record may have fixed it meanwhile).
  if (isChanging() && !openMonthIds().includes(d.from)) d.from = M.defaultFrom(app.base, S(), today());
  return d;
}

/** The date the friend counts as starting (scale.beforeJoin): the one saved with the plan; for a plan
 *  saved before join dates were kept, the day it was first saved; else today. */
function joinDate(s = S()) {
  if (s.plan && s.plan.joinedAt) return s.plan.joinedAt;
  const c = s.createdAt ? Date.parse(s.createdAt) : NaN;
  return Number.isFinite(c) ? L.bkkDate(c) : today();
}

/** The rate a baht amount is converted at today: Frankfurter's when known, else the plan's ฿33.00. */
const rateNow = rateToday;

/**
 * The draft read as a monthly amount: {usd, error, empty}. usd is in dollars to the cent; error is a
 * sentence for the friend (null when the amount can be used).
 */
/** The usual amount as it was typed, when changing: the same baht keep the rate they were saved with. */
const savedInput = () => (isChanging() ? S().plan.input : null);
const readAmount = (d = draft()) => readTyped(d.currency, d.amount, savedInput());

/** The months set on their own after the month a change starts from (open ones): each gets a "Keep" box. */
function ownAfter(d) {
  const ids = app.base.orderDates.map((x) => x.id);
  const k = ids.indexOf(d.from);
  const open = openMonthIds();
  return resolvedMonths().filter((r) => r.own && open.includes(r.dateId) && ids.indexOf(r.dateId) > k).map((r) => r.dateId);
}

/**
 * The change the page would save, worked out on a copy (months.planChange): {plan, state} for a usable
 * amount, {error} when it cannot be made, or null while there is no usable amount. Only when changing.
 */
function candidate(d, a) {
  if (!isChanging() || a.usd == null || !d.from) return null;
  const input = inputRecord(d.currency, d.amount, a.usd, savedInput());
  const keepOwn = ownAfter(d).filter((m) => d.keep[m] !== false);
  const mutator = (x) => M.setAmountFrom(x, app.base, { fromId: d.from, usd: a.usd, input, keepOwn });
  try {
    const r = M.planChange(app.base, S(), mutator);
    return { plan: r.plan, state: r.state, mutator };
  } catch (e) {
    return { error: e };
  }
}

export function renderSetup() {
  if (!app.base) return [errorState("The plan could not be loaded.", app.planError)];
  const d = draft();
  const changing = isChanging();
  if (changing && locked()) return lockedNotice();
  const base = app.base;
  const first = base.orderDates[0].date, last = base.orderDates[base.orderDates.length - 1].date;
  const pj = beforeJoin(base, joinDate());
  const out = [];
  if (S().plan && !app.plan) out.push(h("p.banner.is-warn", { role: "alert" }, icon("alert"), h("span", "The amount saved in this browser could not be used. Please choose your monthly amount again; your other records are kept.")));
  // A saved state this version could not read (spec 8.5: a damaged copy) is set aside whole, never thrown away.
  if (store.unread && !S().plan) {
    out.push(book.banner({ state: "problem", live: true, content: "Your saved records could not be read, so they were set aside and nothing was changed. Load a copy you saved to bring them back, or start again below." }));
  }

  // ---- welcome
  out.push(card(".setup-hero", { "aria-labelledby": "h-setup" },
    h("div.setup-hero-text",
      changing ? h("p.eyebrow.eyebrow-moon", "Settings · your amount") : null, // the top bar already names the app
      h("h1.vtitle#h-setup", { tabindex: "-1" }, changing ? "Change your monthly amount" : "Your monthly plan, sized to you"),
      h("p.lede", changing
        ? "Pick a new amount and the first month it applies to. Earlier months keep their amounts, and so does any month with a logged fill, skip or transfer."
        : `Type what you can put aside each month, in US dollars or Thai baht. You get one written plan at that size: the same funds, stocks and coins on the second Tuesday of each month, ${dateWords(first)} to ${dateWords(last)}. You place each order in your own broker's app; Tide Table tells you what is due and keeps your records.`),
      lateNote(pj),
      changing ? null : promises(".is-wide")),
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
  // Changing: the first month the new amount applies to, the months set on their own after it, and the
  // November coin note. The button names the amount and the month.
  const fromSel = changing ? h("select#setup-from", { "data-fk": "setup-from", "aria-describedby": "setup-from-hint", on: { change: (e) => { d.from = e.target.value; app.draft = d; refresh(true); } } },
    openMonthIds().map((id) => h("option", { value: id, selected: id === d.from }, monthOption(id)))) : null;
  const keepBox = h("div.am-keep");
  const coinNote = h("p.am-note", { "data-fk": "setup-coins" });
  const startText = h("span", changing ? "Use this amount" : "Start my plan");
  // The screen's one main button (book.js button()).
  const startBtn = book.button({ label: [startText, h("span", { "aria-hidden": "true" }, " →")], type: "submit" });
  startBtn.setAttribute("data-fk", "setup-start");
  let cand = null;
  const showError = (a, settled) => {
    let out = a.error && ((!a.empty && (showErr || (settled && a.usd == null))) || (showErr && a.empty)) ? a.error : "";
    // An amount that works but cannot be used for this change (a mix that does not fit it, a month with records).
    if (!a.error && cand && cand.error) out = explain(cand.error, { context: "amount" });
    // While typing, a problem appears only once the amount settles; a fixed amount clears it at once.
    if (!settled && !showErr && out) return;
    if (err.textContent !== out) err.textContent = out;
    amount.setAttribute("aria-invalid", String(!!out));
  };
  const refresh = (settled = false) => {
    const a = readAmount();
    cand = candidate(d, a);
    sym.textContent = d.currency === "THB" ? "฿" : "$";
    amount.placeholder = d.currency === "THB" ? "16,500" : "500";
    const r = rateNow();
    hint.textContent = d.currency === "THB"
      ? `From ${fThb(Math.ceil(usdToThb(MIN_MONTHLY_USD, r.rate)))} to ${fThb(Math.floor(usdToThb(MAX_MONTHLY_USD, r.rate)))} a month. The plan works in US dollars, so baht are converted once, when you start.`
      : `From ${fM(MIN_MONTHLY_USD)} to ${fM(MAX_MONTHLY_USD)} a month.`;
    clear(rateLine).append(...rateText(a, r).filter(Boolean));
    showError(a, settled);
    if (changing) {
      // Rebuilt only when the list changes, so a box keeps its focus while it is ticked.
      const after = ownAfter(d);
      if (keepBox.dataset.key !== after.join(",")) {
        keepBox.dataset.key = after.join(",");
        clear(keepBox).append(...(after.length ? [h("p.field-label", "Months set on their own")].concat(after.map((m) => {
          const mo = resolvedMonths().find((x) => x.dateId === m);
          return h("label.check.am-check", h("input", { type: "checkbox", checked: d.keep[m] !== false, "data-fk": `setup-keep-${m}`, on: { change: (e) => { d.keep[m] = e.target.checked; app.draft = d; refresh(true); } } }),
            h("span.check-box", { "aria-hidden": "true" }, icon("check")),
            h("span.check-text", `Keep ${monthWordOf(m)} at ${fM(mo.usd)} (set for that month only)`));
        })) : []));
      }
      keepBox.hidden = !after.length;
      // November's money also pays for orders on a later date (January's ether and solana).
      const later = d.from ? app.plan.orders.filter((o) => o.dateId !== d.from && paidBy(o) === d.from) : [];
      coinNote.textContent = later.length ? `${monthWordOf(d.from)}'s money also pays for ${monthWordOf(later[0].dateId)}'s ${listAnd([...new Set(later.map((o) => holdName(app.plan, o.instrument)))])}.` : "";
      coinNote.hidden = !later.length;
      startText.textContent = a.usd != null && d.from ? `Use ${fM(a.usd)} from ${monthWordOf(d.from)}` : "Use this amount";
    }
    clear(preview).append(...(changing ? changePreview(a, cand) : previewBody(a.usd)).filter(Boolean)); // DOM append() would write "null" as text
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
    changing ? h("label.field", { for: "setup-from" }, h("span.field-label", "Starting with"), fromSel,
      h("span.field-hint#setup-from-hint", "Earlier months and months with records keep their amounts.")) : null,
    seg,
    h("label.field.amount-field", { for: "setup-amount" }, h("span.field-label", changing ? "Each month from then, I can invest" : "Each month I can invest"),
      h("span.amount-wrap", sym, amount), hint),
    rateLine,
    err,
    changing ? keepBox : null,
    changing ? coinNote : null,
    changing ? null : field("Your first name (optional)", name, "Only used to say hello. It stays in this browser."),
    h("div.setup-actions",
      startBtn,
      changing ? h("a.btn.btn-ghost", { href: "#/settings", "data-fk": "setup-cancel" }, "Cancel")
        : h("label.btn.btn-ghost.file-btn", { "data-fk": "setup-imp", title: "A copy you downloaded from Settings, in another browser" }, "Load a saved copy…",
          h("input.visually-hidden", { type: "file", accept: "application/json,.json", on: { change: (e) => importState(e.target) } }))),
    h("p.fine", changing
      ? "Your checklists, notes and journal stay as they are."
      // 2.0 hides the own-mix editor (spec 8.1), so the first screen promises only what Settings has.
      : `${universeOn() ? "Next you can choose fields and companies for your months. " : ""}Later you can change your amount for any month you haven't logged yet, in Settings. This is a tracker for a written plan, not advice: check that it fits your own money, goals and taxes.`),
    changing ? null : h("p.fine", "Your records stay in this browser only. On an iPhone or iPad, add this page to your Home Screen (Share, then Add to Home Screen), and download a copy now and then from Settings."));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    showErr = true;
    clearTimeout(settle);
    const a = readAmount();
    if (a.error) { refresh(true); amount.focus(); return; }
    if (changing) saveChange(a, refresh, amount, err);
    else start(a.usd, changing);
  });

  out.push(h("div.setup-grid",
    card(".setup-form", form, changing ? null : howItWorks(base)),
    card(".setup-preview", { "aria-labelledby": "setup-pv-h" }, preview)));
  // On a phone the three promises come after the form, so the amount field is on the first screen.
  if (!changing) out.push(promises(".is-narrow"));

  refresh(true); // a re-render is not typing: show the amount's state as it stands
  return out;
}

/** The setup's three promises: in the welcome on wide screens (.is-wide), after the form on phones (.is-narrow). */
function promises(cls) {
  return h(`ul.promises${cls}`,
    h("li", icon("check"), h("span", h("strong", "Private. "), "No account, and nothing you type leaves this browser.")),
    h("li", icon("calendar"), h("span", h("strong", "Steady. "), "The dates are written in advance and never move for news or prices. Two written rules can move a purchase to another written date: a price ceiling (r1) and the 30% coin rule (r8).")),
    h("li", icon("info"), h("span", h("strong", "Plain words. "), "Every order comes with a short “How to place” guide.")));
}

function rateText(a, r) {
  const d = draft();
  const src = r.source === "plan"
    ? [h("span", "Rate: the plan's own"), h("span.muted", " (the live rate is not available right now)")]
    : [sourceLink(prices.SOURCES.fx), h("span", r.date ? `, ${long(r.date)}` : "")];
  if (d.currency === "THB") {
    const x = parseNum(d.amount);
    return [
      a.saved ? h("p.rate-main", h("strong.num", fB(x)), " a month is ", h("strong.num", fM(a.usd)), ` at ฿${fNum(a.rate, 2)} per US dollar, the rate it was saved with.`)
        : a.usd != null ? h("p.rate-main", h("strong.num", fB(x)), " a month is ", h("strong.num", fM(a.usd)), ` at ฿${fNum(r.rate, 2)} per US dollar.`)
          : h("p.rate-main", `Baht are converted at ฿${fNum(r.rate, 2)} per US dollar.`),
      a.saved ? null : h("p.rate-src", icon("funding"), h("span", ...src)),
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
  try { plan = newPlanAt(M); } catch (e) { return [errorState("This amount cannot be worked out.", e)]; }
  const pj = beforeJoin(plan, joinDate());
  return yearPreview(plan, {
    title: example ? `An example year at ${fM(M)} a month` : `Your year at ${fM(M)} a month`,
    sub: example ? "Type your amount and every number below follows it." : "The same twelve dates for everyone; only the amounts follow yours.",
    each: fM(M),
    mixLine: "This is the plan's mix, shown as an illustration.",
    notes: [...previewNotes(plan, M, example, pj), lockPreviewNote()],
    pj,
  });
}

/**
 * Changing the amount: the year as the change would make it (cand.plan), each month tagged with what
 * happens to its amount: fixed by the friend's records, staying as it is, or "was $500". While there is
 * no usable amount (or the change cannot be made), the year as it is now.
 */
function changePreview(a, cand) {
  const d = draft();
  const ok = !!(cand && cand.plan);
  const plan = ok ? cand.plan : app.plan;
  const now = resolvedMonths();
  const next = ok ? M.resolveMonths(app.base, cand.state.plan) : now;
  const fx = fixed();
  const cents = (x) => Math.round(x * 100);
  const tagOf = (dateId) => {
    const b = now.find((r) => r.dateId === dateId), x = next.find((r) => r.dateId === dateId);
    if (!b || b.preJoin) return null; // the row already says "before you joined"
    if (fx.has(dateId)) return h("span.am-tag.is-fixed", `Fixed by your records (${recordWords(fx.get(dateId))})`);
    if (ok && cents(x.usd) !== cents(b.usd)) return h("span.am-tag.is-new", `was ${fM(b.usd)}`);
    return h("span.am-tag", `Stays at ${fM(b.usd)}`);
  };
  const p = ok ? cand.state.plan : S().plan;
  const pj = beforeJoin(plan, joinDate());
  return yearPreview(plan, {
    title: ok ? `Your year with ${fM(a.usd)} from ${monthWordOf(d.from)}` : "Your year as it is now",
    sub: ok ? "Each month says what happens to its amount." : "Type a new amount to see each month's orders at it.",
    each: M.amountWords(app.base, p).replace(/ a month$/, ""),
    mixLine: mixIsOwn() && p.mixFrom ? `Your own mix, from ${monthWordOf(p.mixFrom)}.` : "This is the plan's mix, shown as an illustration.",
    notes: previewNotes(plan, ok ? a.usd : app.plan.funding.monthlyUsd, false, pj, true),
    pj,
    tagOf,
    warn: ok ? placedWarning(M.placedChanged(S(), app.plan, cand.plan), "months") : null,
  });
}

/** The preview card's body for a scaled plan: the numbers, where the money goes, the twelve dates (each
 *  with opts.tagOf's tag when changing) and the notes. */
function yearPreview(plan, { title, sub, each, mixLine, notes, pj, tagOf = null, warn = null }) {
  const inst = Object.fromEntries(plan.instruments.map((i) => [i.id, i]));
  // A friend starting late: the months before they joined buy nothing, and coins paid from a SwissBorg
  // transfer before then have nothing in the wallet.
  const noWallet = walletGone(plan, pj);
  const counted = plan.orders.filter((o) => !pj.orderIds.has(o.id) && !(noWallet && o.cryptoWait));
  const total = counted.reduce((a, o) => a + Math.round(o.usd * 100), 0) / 100;
  const groups = plan.groups.map((g) => ({ ...g, usd: counted.filter((o) => shownGroup(inst[o.instrument]) === g.id).reduce((a, o) => a + o.usd, 0) })).filter((g) => g.usd > 0);
  const own = new Set((plan.scale && plan.scale.ownMonths) || []);
  const rows = plan.orderDates.map((d, k) => {
    const before = pj.dateIds.includes(d.id);
    const os = plan.orders.filter((o) => o.dateId === d.id).sort((a, b) => (a.account === b.account ? (a.time < b.time ? -1 : 1) : a.account === "SwissBorg" ? -1 : 1));
    const send = plan.funding.transfers.filter((t) => t.forDate === d.id).reduce((a, t) => a + Math.round(t.usd * 100), 0) / 100;
    const tag = tagOf ? tagOf(d.id) : null;
    return h(`li.pv-row${before ? ".is-pre" : ""}`,
      h("div.pv-date", h("span.pv-day.num", dayShort(d.date)), h("span.pv-month", `Month ${k + 1}${own.has(d.id) && !before ? " · your mix" : ""}`)),
      before ? h("ul.pv-what", h("li.pv-note", "Before you joined: nothing is bought or sent"))
        : h("ul.pv-what", os.map((o) => {
          const i = inst[o.instrument];
          const zero = noWallet && o.cryptoWait;
          const amt = o.carryTarget && !(o.usd > 0) ? "takes any leftover" : fM(zero ? 0 : o.usd);
          return h("li", h("span.pv-name", i.group === "index" || i.id === "QNTM" ? i.id : i.name), " ", h("span.pv-amt.num", amt),
            o.cryptoWait ? h("span.pv-note", zero ? " (nothing in the wallet for it)" : " from the money waiting in SwissBorg") : null);
        })),
      h("div.pv-send", h("span.pv-send-label", "You send"), h("span.num", before ? "—" : fM(send))),
      tag);
  });
  return [
    h("header.card-head",
      h("div.card-head-text",
        h("h2.card-title#setup-pv-h", h("span.step-no", { "aria-hidden": "true" }, "2"), title),
        h("p.card-sub", sub))),
    h("div.pv-stats",
      h("div.pv-stat", h("span.stat-label", "Each month"), h("span.pv-big.num-display", each)),
      h("div.pv-stat", h("span.stat-label", pj.dateIds.length ? "From when you join" : "Over the year"), h("span.pv-big.num-display", fM(total))),
      h("div.pv-stat", h("span.stat-label", "Orders"), h("span.pv-big.num-display", String(plan.orders.filter((o) => !pj.orderIds.has(o.id)).length)))),
    h("div.pv-mix",
      h("p.eyebrow", "Where the money goes"),
      h("div.mix-bar", { role: "img", "aria-label": groups.map((g) => `${g.label} ${fNum((g.usd / total) * 100, 1)}%`).join(", ") },
        groups.map((g) => h("span.mix-seg", { style: { width: ((g.usd / total) * 100).toFixed(2) + "%", background: `var(${GROUP_TOKEN[g.id] || "--series-3"})` } }))),
      h("ul.mix-legend", groups.map((g) => h("li", h("span.swatch", { style: { background: `var(${GROUP_TOKEN[g.id] || "--series-3"})` }, "aria-hidden": "true" }), `${g.label} `, h("span.num", `${fNum((g.usd / total) * 100, 1)}%`)))),
      mixLine ? h("p.am-mixline", { "data-fk": "setup-mixline" }, mixLine) : null),
    warn,
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

/**
 * Notes under the preview: orders too small to place (one sentence per holding; a holding that is too
 * small in several months of an own mix gets one sentence for all of them), November's SwissBorg money,
 * and whole shares below the plan's own amount. usd: the amount typed; changing: name each month's amount.
 */
function previewNotes(plan, usd, example, pj, changing = false) {
  const notes = [];
  const inst = Object.fromEntries(plan.instruments.map((i) => [i.id, i]));
  const dateOf = Object.fromEntries(plan.orderDates.map((d) => [d.id, d.date]));
  const monthUsd = (dateId) => (plan.scale.months && plan.scale.months[dateId] != null ? plan.scale.months[dateId] : usd);
  const at = (r) => (changing ? `At ${fM(monthUsd(r.fundDateId))} in ${monthWordOf(r.fundDateId)}` : example ? `At ${fM(usd)}` : `At ${fM(usd)} a month`);
  const byInst = new Map();
  for (const r of plan.scale.rolled) {
    if (pj.orderIds.has(r.into)) continue; // it would have gone into a month from before the friend joined
    if (!byInst.has(r.instrument)) byInst.set(r.instrument, []);
    byInst.get(r.instrument).push(r);
  }
  for (const rs of byInst.values()) {
    const r = rs[0];
    const i = inst[r.instrument];
    const where = r.account === "SwissBorg" ? `under the ${fM(r.minUsd)} the plan allows for SwissBorg's smallest exchange (5 euros)` : `under the ${fM(r.minUsd)} the plan uses as the smallest order`;
    const less = r.account === "SwissBorg" ? ", and you send that much less to SwissBorg" : "";
    if (rs.length === 1) {
      const into = plan.orders.find((o) => o.id === r.into);
      notes.push(`${at(r)}, ${i.name}'s order would be ${fM(r.usd)}, ${where}. Its share goes into the ${dayShort(dateOf[into ? into.dateId : r.fundDateId])} VWRA order instead${less}.`);
    } else {
      notes.push(`${i.name}'s order would be ${where} in ${listAnd(rs.map((x) => monthWordOf(x.fundDateId)))}. Each time, its share goes into that month's VWRA order instead${less}.`);
    }
  }
  // November's SwissBorg transfer (the plan's own, not one of an own mix's monthly ones).
  const s01 = plan.funding.transfers.find((t) => t.to === "SwissBorg" && !ownIdMonth(t.id));
  const btc = plan.orders.find((o) => o.account === "SwissBorg" && !o.cryptoWait && !ownIdMonth(o.id));
  const coins = plan.orders.filter((o) => o.cryptoWait);
  if (s01 && btc && coins.length && !pj.transferIds.has(s01.id)) {
    // Part of November's money, not more of it: the month's total already counts it.
    const nov = plan.funding.transfers.filter((t) => t.forDate === s01.forDate).reduce((a, t) => a + Math.round(t.usd * 100), 0) / 100;
    notes.push(`Of ${monthWordOf(s01.forDate)}'s ${fM(nov)}, ${fM(s01.usd)} goes to SwissBorg: ${fM(btc.usd)} buys bitcoin, and ${fM(coins.reduce((a, o) => a + Math.round(o.usd * 100), 0) / 100)} waits in the wallet for ${monthWordOf(coins[0].dateId)}'s ${coins.map((o) => inst[o.instrument].name.toLowerCase()).join(" and ")}.`);
  }
  if (usd < BASE_MONTHLY_USD) {
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

/** When every joined month has records: nothing on this page can change any more. */
function lockedNotice() {
  return [
    h("h1.visually-hidden#h-setup", { tabindex: "-1" }, "Your monthly amount"),
    card(".setup-locked", { "aria-labelledby": "locked-h" },
      h("p.eyebrow", "Your amount"),
      h("h2.card-title#locked-h", "Every month has records"),
      h("p", "Each month of your plan has a logged fill, skip or transfer, so its amount stays as it is. If you send more or less to Interactive Brokers one month, record it on the Money page: only that month's VWRA order changes (rule r10)."),
      h("a.btn", { href: "#/settings", "data-fk": "locked-settings" }, "Open Settings")),
  ];
}

/** Save the amount (and the name) on the first visit, then open Today. The plan has one amount and the
 *  plan's mix; later changes go through saveChange (and the month dialog, and the mix page). */
function start(usd, changing) {
  const d = draft();
  const input = inputRecord(d.currency, d.amount, usd);
  let scaled;
  try { scaled = scalePlan(app.base, usd, { input }); } catch (e) { toast(String(e.message || e), "alert"); return; }
  const name = String(d.name || "").trim().slice(0, 40);
  const bought = new Set(scaled.orders.map((o) => o.id));
  app.draft = null;
  app.deskDate = null;
  // The route first, so the plan's arrival (the store change below) opens it straight away: Today, or for a new
  // friend when the open data has a list, Fields (spec 8.2: amount, then fields, then My split).
  hooks.go(changing ? "today" : hooks.firstRoute());
  const saved = commit((s) => {
    // The join date is kept when the plan is chosen again: it says which months count (scale.beforeJoin).
    s.plan = { monthlyUsd: usd, input: { ...input, usd }, lockedAt: null, joinedAt: joinDate(s), months: {}, mix: {}, mixFrom: null };
    // Anthropic, locked at 10% of each month, from the first month (addendum B.1; months.adoptLock, lock-api.md 4)
    M.adoptLock(s, app.base, { today: today() });
    // An order the amount does not buy keeps no entry. Only a to-do or placed one can be there, and left
    // in place it would stop an export from loading again.
    for (const id of Object.keys(s.orders)) if (!bought.has(id)) delete s.orders[id];
    if (!s.createdAt) s.createdAt = new Date(now()).toISOString(); // the app clock (?now= in QA)
    if (!changing) s.profile = name ? { ...s.profile, name } : { ...s.profile };
  });
  if (saved) toast(`Your plan is ready: ${fM(usd)} a month`, "success");
}

/**
 * Changing: a new usual amount from the chosen month on (months.setAmountFrom), through commitPlanChange.
 * A refusal (a month with records, a mix that does not fit the amount) is shown in the field's error line
 * and nothing is saved. On success, back to Settings.
 */
function saveChange(a, refresh, amountEl, errEl) {
  const d = draft();
  const fromId = d.from;
  if (!fromId) return;
  const input = inputRecord(d.currency, d.amount, a.usd, savedInput());
  const keepOwn = ownAfter(d).filter((m) => d.keep[m] !== false);
  try {
    commitPlanChange((x) => M.setAmountFrom(x, app.base, { fromId, usd: a.usd, input, keepOwn }));
  } catch (e) {
    refresh(true);
    errEl.textContent = explain(e, { context: "amount" });
    amountEl.setAttribute("aria-invalid", "true");
    amountEl.focus();
    return;
  }
  app.draft = null;
  toast(`From ${monthWordOf(fromId)}, your plan uses ${fM(a.usd)} a month`, "success");
  hooks.go("settings");
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
