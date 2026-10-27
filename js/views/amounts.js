// A month's amount: the dialog that sets one open month's amount, or a new usual amount from that month on
// (openMonthDialog), opened from the Year page, Money, Today and Settings. Also the small helpers the
// amount screens share: reading a typed amount, the rate it is converted at, a month's orders in words,
// and the warning for orders marked placed.
//
// Every change goes through core.commitPlanChange, so a month the friend's records fix never changes.
// A month is named by its order date: "December" is the money for the 8 Dec orders.

import {
  app, h, clear, icon, S, prices, toast, modal, M, commitPlanChange, explain, openMonthIds, monthOf, fixed, today,
  fM, fB, fUsd, fThb, fNum, long, short, dayShort, monthName, parseNum, sourceLink, plural,
} from "../core.js?v=2.0.0";
import { thbToUsd, usdToThb, isMonthlyUsdInRange, MIN_MONTHLY_USD, MAX_MONTHLY_USD } from "../scale.js?v=2.0.0";

const DEST = { SwissBorg: "SwissBorg", IBKR: "Interactive Brokers" };
/** "Interactive Brokers" for IBKR; other accounts by their own name. */
export const destWord = (to) => DEST[to] || to;

/** "January": the month whose money an order date id stands for. */
export const monthWordOf = (dateId) => M.monthWord(app.base || app.plan, dateId);

/** "a and b", "a, b and c". */
export const listAnd = (ws) => (ws.length < 3 ? ws.join(" and ") : `${ws.slice(0, -1).join(", ")} and ${ws[ws.length - 1]}`);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Empty el, then append the kids that are not null or false (DOM append() would write "null" as text). */
export const fill = (el, ...kids) => { clear(el).append(...kids.flat().filter((k) => k != null && k !== false)); return el; };

/** The order date record (id, date) of a month id, from the base plan. */
const dateRec = (dateId) => (app.base ? app.base.orderDates.find((d) => d.id === dateId) : null) || { id: dateId, date: "" };

// ---------------------------------------------------------------- amounts as typed

/** The rate a baht amount is converted at today: Frankfurter's when known, else the plan's (two decimals). */
export function rateNow() {
  const r = prices.fxRate(app.base.meta.planFx);
  return { ...r, rate: Math.round(r.rate * 100) / 100 };
}

/** "From $25 to $10,000." in dollars, or the same range in baht at today's rate. */
export function rangeWords(currency, r = rateNow()) {
  if (currency === "THB") return `From ${fThb(Math.ceil(usdToThb(MIN_MONTHLY_USD, r.rate)))} to ${fThb(Math.floor(usdToThb(MAX_MONTHLY_USD, r.rate)))} at ฿${fNum(r.rate, 2)} per dollar.`;
  return `From ${fM(MIN_MONTHLY_USD)} to ${fM(MAX_MONTHLY_USD)}.`;
}

/**
 * An amount as typed, read as dollars: {usd, error, empty}. usd is to the cent; error is a sentence for the
 * friend (null when the amount can be used). currency "USD" or "THB"; baht are converted at today's rate.
 */
export function readAmountOf(currency, raw0) {
  const raw = String(raw0 || "").trim();
  if (!raw) return { empty: true, usd: null, error: "Type how much you can invest each month." };
  const x = parseNum(raw);
  if (!Number.isFinite(x)) return { usd: null, error: "That doesn't look like an amount. Type digits only, for example 500." };
  if (x <= 0) return { usd: null, error: "The amount must be more than zero." };
  const r = rateNow();
  const usd = currency === "THB" ? thbToUsd(x, r.rate) : Math.round(x * 100) / 100;
  if (isMonthlyUsdInRange(usd)) return { usd, error: null };
  const lo = fM(MIN_MONTHLY_USD), hi = fM(MAX_MONTHLY_USD);
  const loT = fThb(Math.ceil(usdToThb(MIN_MONTHLY_USD, r.rate))), hiT = fThb(Math.floor(usdToThb(MAX_MONTHLY_USD, r.rate)));
  if (currency === "THB") {
    return { usd: null, error: `${fB(x)} is ${fUsd(usd, 2)} at ฿${fNum(r.rate, 2)} per dollar. The plan works with ${loT} to ${hiT} a month (${lo} to ${hi}).` };
  }
  return { usd: null, error: usd < MIN_MONTHLY_USD
    ? `The smallest amount this plan works with is ${lo} a month: below that, most orders would be too small to place.`
    : `The largest amount this plan works with is ${hi} a month.` };
}

/** True when `saved` (a kept input record) is the same baht amount as typed: it keeps its own dollars and rate. */
const sameBaht = (currency, raw, saved) => !!saved && saved.currency === "THB" && currency === "THB" && Number.isFinite(saved.usd)
  && Number.isFinite(saved.rate) && parseNum(raw) === saved.amount && isMonthlyUsdInRange(saved.usd);

/**
 * readAmountOf, read against an amount already saved (`saved`, an input record): the same baht as saved keep
 * the dollars and rate they were saved with, so opening a page and saving it again never moves an amount
 * with today's rate. {usd, error, empty, saved?, rate?, rateDate?}
 */
export function readTyped(currency, raw, saved) {
  if (sameBaht(currency, raw, saved)) return { usd: saved.usd, error: null, saved: true, rate: saved.rate, rateDate: saved.rateDate || null };
  return readAmountOf(currency, raw);
}

/** How an amount was typed, as the plan keeps it (plan.input, or a month's input): baht with today's rate,
 *  or the saved record when the same baht were typed (see readTyped). */
export function inputRecord(currency, raw, usd, saved = null) {
  if (sameBaht(currency, raw, saved) && saved.usd === usd) {
    return { currency: "THB", amount: saved.amount, rate: saved.rate, rateSource: saved.rateSource || null, rateDate: saved.rateDate || null };
  }
  if (currency !== "THB") return { currency: "USD", amount: usd, rate: null, rateSource: null, rateDate: null };
  const r = rateNow();
  return {
    currency: "THB", amount: Math.round(parseNum(raw) * 100) / 100, rate: r.rate,
    rateSource: r.source === "plan" ? "the plan's rate" : "Frankfurter (European Central Bank)", rateDate: r.source === "plan" ? null : r.date,
  };
}

/** "You typed ฿23,450 for May, converted at ฿33.50 per dollar (Frankfurter …, 26 Feb 2027)." for a month
 *  whose own amount was typed in baht; null otherwise. */
export function typedWords(input, what) {
  if (!input || input.currency !== "THB") return null;
  return `You typed ${fB(input.amount)} ${what}, converted at ฿${fNum(input.rate, 2)} per dollar (${input.rateSource || "the plan's rate"}${input.rateDate ? `, ${long(input.rateDate)}` : ""}).`;
}

// ---------------------------------------------------------------- a month in words

const LIST_WORDS = { QNTM: "the quantum fund" };
/** A holding as a sentence names it: funds by ticker (the quantum fund in words), stocks by name, coins in
 *  lower case. */
export function holdName(plan, id) {
  if (LIST_WORDS[id]) return LIST_WORDS[id];
  const i = ((plan && plan.instruments) || []).find((x) => x.id === id) || { id, name: id };
  if (i.group === "crypto") return String(i.name).toLowerCase();
  return i.orderStyle === "whole_usd" ? i.id : i.name;
}

/** "the quantum fund $45, VWRA $195 and Nvidia $60". A $0 VWRA order (an own mix that leaves it nothing)
 *  reads "VWRA (takes any leftover)". */
export function ordersWords(plan, orders) {
  return listAnd(orders.map((o) => (o.carryTarget && !(o.usd > 0) ? `${holdName(plan, o.instrument)} (takes any leftover)` : `${holdName(plan, o.instrument)} ${fM(o.usd)}`)));
}

/** The month whose money pays for an order (a base or own-mode id). */
export const paidBy = (o) => M.monthOfOrder(app.base, o.id);

/** "W02 sent", "XDEW filled": a fixed month's records in words (two at most, then "and 1 more"). */
export function recordWords(records, plan = app.plan) {
  const word = (r) => {
    if (r.kind === "transfer") return `${r.id} ${r.status}`;
    const o = plan && plan.orders.find((x) => x.id === r.id);
    return `${o ? holdName(plan, o.instrument) : r.id} ${r.status}`;
  };
  const shown = records.slice(0, 2).map(word);
  return records.length > 2 ? `${shown.join(", ")} and ${records.length - 2} more` : listAnd(shown);
}

/** The warning for orders marked placed whose amount a change alters: null when there are none.
 *  where "dialog": "1 of these orders"; "months": "in the months this changes" (the amount page). */
export function placedWarning(ids, where = "dialog") {
  if (!ids || !ids.length) return null;
  const text = where === "months"
    ? `You marked ${plural(ids.length, "order")} placed in the months this changes. If ${ids.length === 1 ? "its amount changes" : "their amounts change"}, change ${ids.length === 1 ? "it" : "them"} in your broker's app too.`
    : `You marked ${ids.length} of these orders placed. If you change the amount, change it in your broker's app too.`;
  return h("p.am-warn", { "data-fk": "am-placed" }, icon("alert"), h("span", text));
}

/**
 * What month f's money buys and how it is sent, in plan `plan` (sentences): its orders, the orders it pays
 * for on a later date (November's money pays for January's ether and solana), its transfers with their
 * dates, the orders on its date that another month's money pays for, and any order too small to place.
 */
export function monthLines(plan, f, usd) {
  const d = dateRec(f);
  const Month = monthWordOf(f);
  const mine = plan.orders.filter((o) => paidBy(o) === f);
  const onDate = mine.filter((o) => o.dateId === f);
  const later = mine.filter((o) => o.dateId !== f);
  const fromOther = plan.orders.filter((o) => o.dateId === f && paidBy(o) !== f);
  const tx = plan.funding.transfers.filter((t) => t.forDate === f);
  const lines = [];
  if (onDate.length || later.length) {
    let s = onDate.length ? `Orders on ${short(d.date)}: ${ordersWords(plan, onDate)}.` : "";
    if (later.length) {
      const dates = [...new Set(later.map((o) => dateRec(o.dateId).date))];
      s += `${s ? " Then" : "Orders paid from this month:"} ${ordersWords(plan, later)} on ${listAnd(dates.map(short))}.`;
    }
    lines.push(s);
  }
  if (tx.length === 1) {
    const t = tx[0];
    lines.push(`You send ${fM(t.usd)} to ${destWord(t.to)} on ${dayShort(t.send)}; it must arrive by ${dayShort(t.arriveBy)}.`);
  } else if (tx.length > 1) {
    const total = tx.reduce((a, t) => a + Math.round(t.usd * 100), 0) / 100;
    const parts = tx.map((t) => {
      const pays = mine.filter((o) => o.account === t.to);
      const now = pays.filter((o) => o.dateId === f).map((o) => holdName(plan, o.instrument));
      const then = pays.filter((o) => o.dateId !== f);
      const when = then.length ? `${now.length ? `${listAnd(now)} now, ` : ""}${listAnd(then.map((o) => holdName(plan, o.instrument)))} in ${monthName(dateRec(then[0].dateId).date, false, true)}` : "";
      return `${fM(t.usd)} ${t === tx[0] ? "goes " : ""}to ${destWord(t.to)}${t.to !== "IBKR" && when ? ` (${when})` : ""}`;
    });
    const same = tx.every((t) => t.send === tx[0].send && t.arriveBy === tx[0].arriveBy);
    lines.push(`Of ${Month}'s ${fM(usd != null ? usd : total)}, ${listAnd(parts)}.${same ? ` You send ${tx.length === 2 ? "both" : "them"} on ${dayShort(tx[0].send)}; they must arrive by ${dayShort(tx[0].arriveBy)}.` : ""}`);
  }
  if (fromOther.length) {
    const names = listAnd([...new Set(fromOther.map((o) => holdName(plan, o.instrument)))]);
    const one = fromOther.length === 1;
    lines.push(`${cap(names)} on ${short(d.date)} ${one ? "is" : "are"} paid from ${monthWordOf(paidBy(fromOther[0]))}'s money, so this amount does not change ${one ? "it" : "them"}.`);
  }
  for (const r of ((plan.scale && plan.scale.rolled) || []).filter((x) => x.fundDateId === f)) {
    const where = r.account === "SwissBorg" ? "the plan allows for SwissBorg's smallest exchange (5 euros)" : "the plan uses as the smallest order";
    const into = plan.orders.find((o) => o.id === r.into);
    lines.push(`At ${fM(usd != null ? usd : 0)} in ${Month}, ${holdName(plan, r.instrument)}'s order would be ${fM(r.usd)}, under the ${fM(r.minUsd)} ${where}. Its money goes to ${monthWordOf(into ? into.dateId : f)}'s VWRA order instead.`);
  }
  return lines;
}

// ---------------------------------------------------------------- the month dialog

/** A link-style button that opens a month's amount dialog: "Sending a different amount? Change December's
 *  amount" (Money's next transfer, Today's send day). */
export function monthAmountLink(dateId, fk) {
  return h("button.am-link", { type: "button", "data-fk": fk, on: { click: () => openMonthDialog(dateId) } },
    `Sending a different amount? Change ${monthWordOf(dateId)}'s amount`);
}

/** A short dialog that says why a month cannot change, with one button. */
function infoDialog(title, text) {
  return modal({ title, cls: ".is-confirm", body: h("p", text), actions: [h("button.btn.btn-primary", { type: "submit" }, "OK")], onSubmit: () => true });
}

/** "February 2027 · orders on 9 Feb". */
export const monthOption = (dateId) => { const d = dateRec(dateId); return `${monthName(d.date)} · orders on ${short(d.date)}`; };

/**
 * The amount dialog for one open month (dateId "m04"), or, with null, for a month the friend picks (a
 * "Month" select of the open months). "Just January" sets that month's own amount; "January and every
 * month after it" sets a new usual amount from that month on (months.setAmountFrom), keeping the months set
 * on their own that stay ticked. Saved through commitPlanChange; a refusal is shown in the dialog.
 */
export function openMonthDialog(dateId = null) {
  if (!app.base || !app.plan || !S().plan) return null;
  const open = openMonthIds();
  if (!open.length) {
    return infoDialog("Every month has records", "Each month of your plan has a logged fill, skip or transfer, so its amount stays as it is. If you send more or less to Interactive Brokers one month, record it on the Money page: only that month's VWRA order changes (rule r10).");
  }
  if (dateId && !open.includes(dateId)) {
    const r = monthOf(dateId);
    if (r && r.preJoin) return infoDialog(`${monthWordOf(dateId)}'s amount`, "That month is before you joined, so nothing is bought in it.");
    return infoDialog(`${monthWordOf(dateId)}'s amount`, `${monthWordOf(dateId)} has records (${recordWords(fixed().get(dateId) || [])}), so its amount stays as it is.`);
  }
  const pick = !dateId;
  const st = { month: dateId || M.defaultFrom(app.base, S(), today()) || open[0], apply: "just", keep: {}, currency: "USD", amount: "", saved: null };
  const loadMonth = () => {
    const r = monthOf(st.month);
    const inp = r && r.input;
    st.saved = inp || null; // the month's amount as it was typed: the same baht keep their saved rate (readTyped)
    st.currency = inp && inp.currency === "THB" ? "THB" : "USD";
    st.amount = inp && Number.isFinite(inp.amount) ? String(inp.amount) : String(r ? r.usd : "");
  };
  loadMonth();

  const err = h("p.form-error#md-err", { "aria-live": "polite" });
  const sym = h("span.amount-sym", { "aria-hidden": "true" });
  const hint = h("span.field-hint#md-hint");
  const amount = h("input#md-amount", {
    "data-fk": "md-amount", inputmode: "decimal", autocomplete: "off", spellcheck: "false", maxlength: 14,
    value: st.amount, "aria-describedby": "md-hint md-err",
  });
  const rateLine = h("div.setup-rate.am-rate");
  // Controls are built once and updated in place: a field's blur redraws the dialog, and a button rebuilt
  // between mousedown and mouseup would lose the click.
  const curBtns = [["USD", "US dollars ($)", "md-currency-usd"], ["THB", "Thai baht (฿)", "md-currency-thb"]].map(([cur, label, fk]) =>
    h("button.seg-btn", { type: "button", "data-cur": cur, "data-fk": fk, on: { click: () => switchCurrency(cur) } }, label));
  const seg = h("div.seg.cur-seg", { role: "group", "aria-label": "Currency" }, curBtns);
  const keepBox = h("div.am-keep");
  const preview = h("div.am-preview", { "data-fk": "md-preview" });
  const usualBox = h("div.am-usual");
  const save = h("button.btn.btn-primary", { type: "submit", "data-fk": "md-save" });
  const radioJust = h("input", { type: "radio", name: "md-apply", value: "just", checked: true, "data-fk": "md-just", on: { change: () => { st.apply = "just"; refresh(true); } } });
  const radioFrom = h("input", { type: "radio", name: "md-apply", value: "from", "data-fk": "md-from", on: { change: () => { st.apply = "from"; refresh(true); } } });
  const justText = h("strong"), fromText = h("strong");
  const applySet = h("fieldset.radio-set.am-apply", h("legend", "Apply it to"),
    h("label.radio", radioJust, h("span", justText, h("span.radio-sub", "The other months keep their amounts."))),
    h("label.radio", radioFrom, h("span", fromText, h("span.radio-sub", "This becomes your usual amount from this month on. Earlier months, and months with records, keep theirs."))));

  const monthSel = pick ? h("select", { "data-fk": "md-month", id: "md-month", on: { change: (e) => { st.month = e.target.value; st.keep = {}; loadMonth(); amount.value = st.amount; refresh(true); } } },
    open.map((id) => h("option", { value: id, selected: id === st.month }, monthOption(id)))) : null;

  let shownErr = false;
  let cand = null, candErr = null;
  const work = () => {
    const a = readTyped(st.currency, st.amount, st.saved);
    cand = null; candErr = null;
    if (a.usd == null) return a;
    try { cand = M.planChange(app.base, S(), mutatorFor(a.usd)).plan; } catch (e) { candErr = e; }
    return a;
  };
  /** The change as a deterministic mutator (months.js), for the preview and for saving. */
  const mutatorFor = (usd) => {
    const input = inputRecord(st.currency, st.amount, usd, st.saved);
    if (st.apply === "from") {
      const keepOwn = ownAfter().filter((m) => st.keep[m] !== false);
      return (d) => M.setAmountFrom(d, app.base, { fromId: st.month, usd, input, keepOwn });
    }
    return (d) => M.setMonthAmount(d, app.base, { dateId: st.month, usd, input });
  };
  /** The months set on their own after the chosen month (open ones only): each gets a "Keep" box. */
  const ownAfter = () => {
    const ids = app.base.orderDates.map((d) => d.id);
    const k = ids.indexOf(st.month);
    return open.filter((m) => ids.indexOf(m) > k && (monthOf(m) || {}).own);
  };

  const title = () => `${monthWordOf(st.month)}'s amount`;
  const lede = () => `What you will put in for the ${short(dateRec(st.month).date)} orders. Every order paid from this month's money is sized to it.`;

  function refresh(settled = false) {
    const Month = monthWordOf(st.month);
    const r = rateNow();
    const m = monthOf(st.month) || {};
    sym.textContent = st.currency === "THB" ? "฿" : "$";
    amount.placeholder = st.currency === "THB" ? "16,500" : String(app.plan.funding.monthlyUsd);
    hint.textContent = rangeWords(st.currency, r);
    for (const b of curBtns) b.setAttribute("aria-pressed", String(b.dataset.cur === st.currency));
    justText.textContent = `Just ${Month}`;
    fromText.textContent = `${Month} and every month after it`;
    const a = work();
    // the rate line, as on the setup page
    const src = r.source === "plan" ? [h("span", "Rate: the plan's own"), h("span.muted", " (the live rate is not available right now)")] : [sourceLink(prices.SOURCES.fx), h("span", r.date ? `, ${long(r.date)}` : "")];
    const typed = typedWords(m.own || m.pinned ? m.input : null, `for ${Month}`);
    fill(rateLine,
      st.currency === "THB"
        ? (a.saved ? h("p.rate-main", h("strong.num", fB(parseNum(st.amount))), " is ", h("strong.num", fM(a.usd)), ` at ฿${fNum(a.rate, 2)} per US dollar, the rate it was saved with.`)
          : a.usd != null ? h("p.rate-main", h("strong.num", fB(parseNum(st.amount))), " is ", h("strong.num", fM(a.usd)), ` at ฿${fNum(r.rate, 2)} per US dollar.`) : h("p.rate-main", `Baht are converted at ฿${fNum(r.rate, 2)} per US dollar.`))
        : (a.usd != null ? h("p.rate-main.muted", `About ${fThb(Math.round(usdToThb(a.usd, r.rate)))} at ฿${fNum(r.rate, 2)} per dollar.`) : null),
      (st.currency === "THB" && !a.saved) || (st.currency !== "THB" && a.usd != null) ? h("p.rate-src", icon("funding"), h("span", ...src)) : null,
      typed ? h("p.rate-src", icon("info"), h("span", typed)) : null);
    // the error line: the amount's problem, or why the change cannot be made
    const msg = a.error ? ((shownErr || (settled && !a.empty)) ? a.error : "") : candErr ? explain(candErr, { context: "amount" }) : "";
    if (err.textContent !== msg) err.textContent = msg;
    amount.setAttribute("aria-invalid", String(!!msg));
    // keep the months set on their own (with "every month after it"): rebuilt only when the list changes
    const after = st.apply === "from" ? ownAfter() : [];
    const keepKey = after.join(",");
    if (keepBox.dataset.key !== keepKey) {
      keepBox.dataset.key = keepKey;
      fill(keepBox, ...(after.length ? [h("p.field-label", "Months set on their own")].concat(after.map((x) => {
        const mo = monthOf(x);
        return h("label.check.am-check", h("input", { type: "checkbox", checked: st.keep[x] !== false, "data-fk": `md-stay-${x}`, on: { change: (e) => { st.keep[x] = e.target.checked; refresh(true); } } }),
          h("span.check-box", { "aria-hidden": "true" }, icon("check")),
          h("span.check-text", `Keep ${monthWordOf(x)} at ${fM(mo.usd)} (set for that month only)`));
      })) : []));
    }
    keepBox.hidden = !after.length;
    // the live preview
    const plan = cand || app.plan;
    const lines = monthLines(plan, st.month, a.usd != null ? a.usd : m.usd);
    if (st.apply === "from" && a.usd != null) {
      const later = app.base.orderDates.map((d) => d.id).filter((x) => x > st.month);
      const fixedLater = later.filter((x) => fixed().has(x)).map(monthWordOf);
      lines.push(`From ${Month} on, every month without an amount of its own uses ${fM(a.usd)}.${fixedLater.length ? ` ${listAnd(fixedLater)} ${fixedLater.length === 1 ? "has" : "have"} records and ${fixedLater.length === 1 ? "keeps its" : "keep their"} amount.` : ""}`);
    }
    fill(preview,
      h("p.eyebrow", cand ? `${Month} at ${fM(a.usd)}` : `${Month} now`),
      h("ul.am-lines", lines.map((s) => h("li", s))),
      cand ? placedWarning(M.placedChanged(S(), app.plan, cand)) : null);
    // back to the usual amount (a month set on its own): rebuilt only when the month changes
    const usualKey = m.own ? st.month : "";
    if (usualBox.dataset.key !== usualKey) {
      usualBox.dataset.key = usualKey;
      fill(usualBox, m.own ? h("button.btn.btn-small.btn-ghost", { type: "button", "data-fk": "md-usual", on: { click: useUsual } }, `Use your usual amount (${fM(app.plan.funding.monthlyUsd)})`) : null);
    }
    usualBox.hidden = !m.own;
    save.textContent = `Save ${Month}'s amount`;
    const dlg = m0 && m0.dlg;
    if (dlg) {
      const t = dlg.querySelector(".modal-title"), l = dlg.querySelector(".modal-lede");
      if (t && t.textContent !== title()) t.textContent = title();
      if (l && l.textContent !== lede()) l.textContent = lede();
    }
  }

  function switchCurrency(cur) {
    if (st.currency === cur) return;
    const a = readTyped(st.currency, st.amount, st.saved);
    const r = rateNow();
    if (a.usd != null) {
      if (cur === "THB" && st.saved && st.saved.currency === "THB" && st.saved.usd === a.usd) st.amount = String(st.saved.amount); // as it was typed
      else if (cur === "THB") {
        const whole = Math.round(usdToThb(a.usd, r.rate));
        st.amount = String(thbToUsd(whole, r.rate) === a.usd ? whole : usdToThb(a.usd, r.rate));
      } else st.amount = String(a.usd);
    }
    st.currency = cur;
    amount.value = st.amount;
    refresh(true);
    amount.focus();
  }

  function useUsual() {
    const Month = monthWordOf(st.month);
    const id = st.month;
    try {
      commitPlanChange((d) => M.setMonthAmount(d, app.base, { dateId: id, usd: null }));
    } catch (e) {
      err.textContent = explain(e, { context: "amount" });
      return;
    }
    m0.close();
    toast(`${Month} is back to your usual amount`, "success");
  }

  let t = null;
  amount.addEventListener("input", () => {
    st.amount = amount.value;
    clearTimeout(t);
    t = setTimeout(() => refresh(false), 160);
  });
  amount.addEventListener("blur", () => { if (amount.value.trim()) refresh(true); });

  let m0 = null;
  m0 = modal({
    title: title(),
    lede: lede(),
    cls: ".am-dialog",
    body: [
      pick ? h("label.field", { for: "md-month" }, h("span.field-label", "Month"), monthSel) : null,
      seg,
      h("label.field.amount-field", { for: "md-amount" }, h("span.field-label", "This month I will invest"), h("span.amount-wrap", sym, amount), hint),
      rateLine,
      err,
      applySet,
      keepBox,
      preview,
      usualBox,
    ],
    actions: [h("button.btn.btn-ghost", { type: "button", "data-fk": "md-cancel", on: { click: () => m0.close() } }, "Cancel"), save],
    onSubmit: () => {
      shownErr = true;
      clearTimeout(t);
      st.amount = amount.value;
      refresh(true);
      const a = readTyped(st.currency, st.amount, st.saved);
      if (a.error) { amount.focus(); return false; }
      const Month = monthWordOf(st.month);
      try {
        commitPlanChange(mutatorFor(a.usd));
      } catch (e) {
        err.textContent = explain(e, { context: "amount" });
        amount.setAttribute("aria-invalid", "true");
        amount.focus();
        return false;
      }
      toast(st.apply === "from" ? `From ${Month}, your plan uses ${fM(a.usd)} a month` : `${Month} now uses ${fM(a.usd)}`, "success");
      return true;
    },
  });
  refresh(true);
  if (!pick) { amount.focus(); amount.select(); }
  return m0;
}
