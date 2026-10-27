// Your mix: the page where a friend types their own percentage for each fund, stock and coin (#/mix, a
// hidden route like the setup), and the "Your mix" card on Settings (mixCard).
//
// The plan's mix stays the illustration it was written as, next to the plan's disclaimer. A friend's own
// mix is shown as their choice: no presets, no ratings, nothing that says what a share should be.
//
// With an own mix, every holding the friend includes is bought every month, from the month they choose
// (scale.js own mode). A typed share is that part of each month's money, an empty field keeps the plan's
// share, 0 leaves the holding out, and VWRA takes the rest. Months before the start, and months with
// records, keep their mix (months.setMixFrom). Every change is saved through core.commitPlanChange.

import {
  app, h, clear, icon, pill, toast, S, hooks, card, cardHead, viewHead, field, today, M, fM, short, monthName,
  plural, confirmDialog, commitPlanChange, explain, mixIsOwn, openMonthIds, resolvedMonths, fixed, onCleanup,
} from "../core.js?v=2.1.0";
import { planShares, beforeJoin, MIX_TENTHS_MAX } from "../scale.js?v=2.1.0";

const GROUP_TOKEN = { index: "--series-1", growth: "--series-7", crypto: "--series-5" };
const GROUP_WORDS = { index: "index funds", growth: "growth stocks and the quantum fund", crypto: "crypto" };
const EVERY_MONTH = "With your own mix, every holding you include is bought every month, from the month you choose.";
const SMALL_ORDERS = "More orders each month. A US-stock order under $5 or a coin order under $6 joins that month's VWRA order. London funds buy whole shares; the rest waits for the next VWRA order.";
const MIX_TOTAL = "Your shares add up to more than 100%.";

// ---------------------------------------------------------------- what the base says

let factsMemo = { base: null, f: null };
/** The plan's shares (cents of its $500 example year, B), the year (Yc), the cents one tenth of a percent
 *  buys (U), the fund that takes the rest (VWRA), the holdings a mix can name, each one's shown share in
 *  tenths and the dates the plan buys it. Worked out once per base. */
function facts() {
  const base = app.base;
  if (factsMemo.base === base) return factsMemo.f;
  const B = planShares(base);
  const Yc = Object.values(B).reduce((a, x) => a + x, 0);
  const restId = (base.orders.find((o) => o.carryTarget) || {}).instrument || null;
  const insts = base.instruments.filter((i) => B[i.id] > 0);
  const dateOf = Object.fromEntries(base.orderDates.map((d) => [d.id, d.date]));
  const dates = {};
  for (const o of base.orders) (dates[o.instrument] ||= []).push(dateOf[o.dateId]);
  const f = {
    B, Yc, U: Yc / MIX_TENTHS_MAX, restId, insts, dates,
    holdings: insts.filter((i) => i.id !== restId),
    shown: M.shownShareTenths(base),
    groups: (base.groups || []).filter((g) => insts.some((i) => i.group === g.id)),
  };
  factsMemo = { base, f };
  return f;
}

// ---------------------------------------------------------------- words and numbers

/** "8.3%", "10%", "0.7%": one decimal, without a trailing ".0". */
function pctText(x) {
  const t = Math.round(x * 10) / 10;
  return `${Number.isInteger(t) ? t : t.toFixed(1)}%`;
}
/** Tenths of a percent as a field shows them: 25 -> "2.5", 30 -> "3". */
const tenthsText = (q) => String(q / 10);
/** How a holding is named in a sentence: funds by ticker, US stocks by name, coins in lower case. */
function word(i, start = false) {
  const w = i.group === "crypto" ? String(i.name).toLowerCase() : i.orderStyle === "whole_usd" ? i.id : i.name;
  return start ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}
const listWords = (ws) => (ws.length < 3 ? ws.join(" and ") : `${ws.slice(0, -1).join(", ")} and ${ws[ws.length - 1]}`);
/** "April": the month an order date's money is for. */
const monthOnly = (dateId) => M.monthWord(app.base, dateId);
/** The plan's own dates for a holding: "8 Dec and 8 Jun", or "every month" for VWRA. */
function planDates(f, id) {
  if (id === f.restId) return "every month";
  return listWords([...new Set(f.dates[id] || [])].map(short));
}

/** Months as runs, in date order: "November to March", "May", "November to January and April". */
function monthRuns(ids) {
  const order = app.base.orderDates.map((d) => d.id);
  const idx = ids.map((d) => order.indexOf(d)).filter((k) => k >= 0).sort((a, b) => a - b);
  const runs = [];
  for (const k of idx) {
    const last = runs[runs.length - 1];
    if (last && k === last[1] + 1) last[1] = k; else runs.push([k, k]);
  }
  return listWords(runs.map(([a, b]) => (a === b ? monthOnly(order[a]) : `${monthOnly(order[a])} to ${monthOnly(order[b])}`)));
}

/**
 * A share as typed: { tenths } (null when the field is empty: the plan's share) or { error: true }. Takes
 * "2.5", "2.50", "3", "3.", ".5" and a trailing "%"; refuses a comma decimal, a second decimal, a sign and
 * anything above 100.
 */
function parseShare(raw) {
  const s = String(raw == null ? "" : raw).trim().replace(/\s*%$/, "");
  if (!s) return { tenths: null };
  const m = /^(\d{0,3})(?:\.(\d)?0?)?$/.exec(s);
  if (!m || (!m[1] && m[2] == null)) return { error: true };
  const tenths = Number(m[1] || 0) * 10 + Number(m[2] || 0);
  return tenths > MIX_TENTHS_MAX ? { error: true } : { tenths };
}

/** The joined months' mixes as resolved, one string: two plan records with the same string buy the same mix. */
function mixSig(planRec) {
  return JSON.stringify(M.resolveMonths(app.base, planRec).filter((r) => !r.preJoin)
    .map((r) => [r.dateId, Object.keys(r.mix).sort().map((k) => [k, r.mix[k]])]));
}

/** Each instrument's and each group's cents over the months that count for the friend (not before they joined). */
function yearOf(plan) {
  const pj = beforeJoin(plan, (S().plan || {}).joinedAt);
  const group = Object.fromEntries(plan.instruments.map((i) => [i.id, i.group]));
  const by = {}, groups = {};
  let all = 0;
  for (const o of plan.orders) {
    if (pj.orderIds.has(o.id)) continue;
    const c = Math.round(o.usd * 100);
    by[o.instrument] = (by[o.instrument] || 0) + c;
    groups[group[o.instrument]] = (groups[group[o.instrument]] || 0) + c;
    all += c;
  }
  return { by, groups, all };
}

/** The group bar and its legend for a year (yearOf). */
function groupBar(y, label) {
  const gs = facts().groups.map((g) => ({ ...g, c: y.groups[g.id] || 0 })).filter((g) => g.c > 0);
  const pct = (g) => (y.all ? (100 * g.c) / y.all : 0);
  const color = (g) => `var(${GROUP_TOKEN[g.id] || "--series-3"})`;
  return [
    h("div.mix-bar", { role: "img", "aria-label": `${label}: ${gs.map((g) => `${g.label} ${pctText(pct(g))}`).join(", ")}` },
      gs.map((g) => h("span.mix-seg", { style: { width: pct(g).toFixed(2) + "%", background: color(g) } }))),
    h("ul.mix-legend", gs.map((g) => h("li", h("span.swatch", { style: { background: color(g) }, "aria-hidden": "true" }), `${g.label} `, h("span.num", pctText(pct(g)))))),
  ];
}

// ---------------------------------------------------------------- why a holding is not bought

/**
 * Why an instrument is not bought at the friend's amounts, mix and fields, for Holdings and Rules:
 * { kind: "mix" } when it has no order and the friend's own mix leaves it out (0%);
 * { kind: "fields" } when it has no order and the friend's months are field months, which buy only the
 *   companies they ticked and VWRA (the example plan's other holdings are simply not in their fields);
 * { kind: "waiting" } for a company on the friend's list that has no order because it does not trade yet;
 * { kind: "amount" } when it has no order because each one would be under its smallest order;
 * { kind: "mix-from", dateId } or { kind: "fields-from", dateId } when it is bought in earlier months and left
 *   out from that month on;
 * null when it is bought.
 */
export function notBought(instId) {
  if (!app.plan) return null;
  const rows = resolvedMonths().filter((r) => !r.preJoin);
  const zero = rows.filter((r) => r.mode === "own" && r.mix[instId] === 0);
  const inst = app.plan.instruments.find((i) => i.id === instId);
  const own = !!inst && inst.group === "fields";
  const rest = (app.plan.orders.find((o) => o.carryTarget) || {}).instrument || null;
  const fm = own || instId === rest ? [] : rows.filter((r) => r.mode === "fields");
  if (!app.plan.orders.some((o) => o.instrument === instId)) {
    if (own) {
      const sf = (app.plan.scale && app.plan.scale.fields) || {};
      return { kind: Object.values(sf).some((f) => f && Array.isArray(f.W) && f.W.includes(instId)) ? "waiting" : "amount" };
    }
    return { kind: zero.length ? "mix" : fm.length ? "fields" : "amount" };
  }
  if (zero.length) return { kind: "mix-from", dateId: zero[0].dateId };
  return fm.length ? { kind: "fields-from", dateId: fm[0].dateId } : null;
}
/** "April": the month a "mix-from" note names. */
export const notBoughtMonth = (why) => (why && why.dateId ? monthOnly(why.dateId) : "");

// ---------------------------------------------------------------- back to the plan's mix

/** The month "Back to the plan's mix" starts from: the first open month at or after the default start whose
 *  mix is the friend's own, or null when no open month has one. */
function resetFrom() {
  const open = new Set(openMonthIds());
  const start = M.defaultFrom(app.base, S(), today());
  const order = app.base.orderDates.map((d) => d.id);
  const own = resolvedMonths().filter((r) => !r.preJoin && r.mode === "own" && open.has(r.dateId) && order.indexOf(r.dateId) >= order.indexOf(start));
  return own.length ? own[0].dateId : null;
}

/** "Back to the plan's mix" from month `fromId`, after a confirm; true when it was saved. */
async function backToPlanMix(fromId) {
  if (!fromId) return false;
  const month = monthOnly(fromId);
  const ok = await confirmDialog({
    title: "Go back to the plan's mix?",
    text: `Go back to the plan's mix from ${month}? Months with records keep theirs.`,
    ok: "Use the plan's mix",
  });
  if (!ok) return false;
  try {
    commitPlanChange((d) => M.setMixFrom(d, app.base, { fromId, mix: {} }));
  } catch (e) {
    toast(explain(e), "alert", 6000);
    return false;
  }
  toast(`From ${month}, Tide Table follows the plan's mix again`, "success");
  return true;
}

// ---------------------------------------------------------------- the Settings card

/** The "Your mix" card for Settings: which mix is in force, the year's split at the friend's amounts, and the
 *  way to change it. null before there is a plan. */
export function mixCard() {
  if (!app.plan || !app.base) return null;
  const f = facts();
  const p = S().plan;
  const own = mixIsOwn();
  const open = openMonthIds();
  const rows = resolvedMonths().filter((r) => !r.preJoin);
  const ownMonths = rows.filter((r) => r.mode === "own").map((r) => r.dateId);
  const n = Object.keys(p.mix || {}).length;
  let text;
  if (own) {
    const from = p.mixFrom && rows.some((r) => r.dateId === p.mixFrom) ? `From ${monthOnly(p.mixFrom)}, Tide Table` : "Tide Table";
    text = `${from} follows your own mix, and buys every holding you include every month. ${n} ${n === 1 ? "holding differs" : "holdings differ"} from the plan's.`;
  } else {
    const parts = f.groups.map((g) => `${pctText((100 * f.insts.filter((i) => i.group === g.id).reduce((a, i) => a + f.B[i.id], 0)) / f.Yc)} ${GROUP_WORDS[g.id] || g.label.toLowerCase()}`);
    text = `Tide Table follows the plan's mix, shown as an illustration: ${parts.join(", ")} over a steady year.`;
    if (ownMonths.length) text += ` ${monthRuns(ownMonths)} ${ownMonths.length === 1 ? "keeps" : "keep"} your own mix.`;
  }
  const back = own ? resetFrom() : null;
  return card(".set-card.mx-set", { "aria-labelledby": "s-mix" },
    cardHead(h("span#s-mix", "Your mix"), null, own ? pill("Your own mix", "sky", "✓") : pill("The plan's mix", "neutral", "□")),
    h("p", text),
    h("div.mx-set-bar", h("p.eyebrow", "Your year at your amounts"), groupBar(yearOf(app.plan), "Your year at your amounts")),
    open.length
      ? h("div.mx-actions",
        h("a.btn", { href: "#/mix", "data-fk": "mix-edit" }, "Choose your mix"),
        back ? h("button.btn.btn-ghost", { type: "button", "data-fk": "mix-reset", on: { click: () => backToPlanMix(back) } }, "Back to the plan's mix") : null)
      : h("p.muted.small", "Every month has records, so its mix stays as it is."));
}

// ---------------------------------------------------------------- the editor (#/mix)

/** The editor's draft, kept across re-renders while the page is open: the "Starting with" month, each field as
 *  typed, the fields whose problem is shown (after a pause or on leaving the field) and whether a save was tried. */
let ed = null;

function startDraft() {
  const vals = {};
  for (const [id, q] of Object.entries(S().plan.mix || {})) vals[id] = tenthsText(q);
  ed = { from: M.defaultFrom(app.base, S(), today()), vals, settled: new Set(), all: false };
}

/**
 * The draft read: { mix (tenths of the valid typed fields), errs ({ id: sentence }), over (more than 100%),
 * restPct (VWRA's share now), totalPct, cand ({ state, plan } from months.planChange, or null), error (why it
 * cannot be worked out), unchanged (the months would buy what they buy now), placed (placed orders it alters) }.
 */
function readDraft() {
  const f = facts();
  const mix = {}, errs = {};
  let total = 0;
  for (const i of f.holdings) {
    const r = parseShare(ed.vals[i.id]);
    if (r.error) errs[i.id] = `${word(i, true)}: type a percentage from 0 to 100, with at most one decimal, for example 2.5.`;
    else if (r.tenths != null) mix[i.id] = r.tenths;
    total += mix[i.id] != null ? mix[i.id] * f.U : f.B[i.id];
  }
  const over = total > f.Yc;
  const out = { mix, errs, over, restPct: over ? 0 : (100 * (f.Yc - total)) / f.Yc, totalPct: over ? (100 * total) / f.Yc : 100, cand: null, error: null, unchanged: false, placed: [] };
  if (Object.keys(errs).length || over || !ed.from) return out;
  try {
    out.cand = M.planChange(app.base, S(), (d) => M.setMixFrom(d, app.base, { fromId: ed.from, mix }));
    out.unchanged = mixSig(out.cand.state.plan) === mixSig(S().plan);
    out.placed = M.placedChanged(S(), app.plan, out.cand.plan);
  } catch (e) {
    out.error = e;
  }
  return out;
}

/** The #/mix page. */
export function renderMix() {
  if (!app.plan || !app.base) return null;
  const f = facts();
  const open = openMonthIds();
  if (app.entering || !ed) startDraft();
  if (!open.includes(ed.from)) ed.from = M.defaultFrom(app.base, S(), today());
  const own = mixIsOwn();
  const out = [viewHead("mix", "Settings · your mix", "Choose your mix",
    "Type your own percentage for any fund, stock or coin. Tide Table then sizes each order from your mix instead of the plan's. The twelve order dates stay the same, and VWRA takes the rest of each month.")];
  out.push(h("div.mx-intro.rise",
    h("p.mx-every", icon("calendar"), h("span", EVERY_MONTH)),
    h("div.mx-disc", icon("info"), h("div",
      h("p", app.plan.meta.disclaimer),
      h("p", "The plan's mix is the illustration it was written as. It is not advice, and Tide Table never rates a mix or proposes one.")))));
  if (!open.length) {
    out.push(card(".mx-fixed", { "aria-labelledby": "mx-fixed-h" },
      h("h2.card-title#mx-fixed-h", "Every month has records"),
      h("p", "Each month of your plan has a logged fill, skip or transfer, so its mix stays as it is."),
      h("a.btn", { href: "#/settings", "data-fk": "mix-cancel" }, "Open Settings")));
    return out;
  }

  // ---- the form
  const dateOf = Object.fromEntries(app.base.orderDates.map((d) => [d.id, d.date]));
  const from = h("select#mx-from", { "data-fk": "mix-from" },
    open.map((d) => h("option", { value: d, selected: d === ed.from }, `${monthName(dateOf[d])} · orders on ${short(dateOf[d])}`)));
  from.addEventListener("change", () => { ed.from = from.value; refresh(); });

  const rowsOf = {}; // id -> { input, err, reset, year }
  let tSoon = null, tSettle = null;
  onCleanup(() => { clearTimeout(tSoon); clearTimeout(tSettle); });
  const soon = () => {
    clearTimeout(tSoon); clearTimeout(tSettle);
    tSoon = setTimeout(refresh, 120);
    tSettle = setTimeout(() => { for (const i of f.holdings) if (String(ed.vals[i.id] || "").trim()) ed.settled.add(i.id); refresh(); }, 1000);
  };

  const holdingRow = (i) => {
    const id = i.id;
    const input = h("input.mx-share", {
      id: "mx-in-" + id, "data-fk": "mix-" + id, inputmode: "decimal", autocomplete: "off", spellcheck: "false", maxlength: 7,
      placeholder: tenthsText(f.shown[id]), value: ed.vals[id] || "",
      "aria-label": `${i.name}, your share in percent`, "aria-describedby": `mx-hint mx-err-${id}`,
    });
    input.addEventListener("input", () => { ed.vals[id] = input.value; ed.settled.delete(id); soon(); });
    input.addEventListener("blur", () => { if (input.value.trim()) { ed.settled.add(id); refresh(); } });
    const reset = h("button.btn.btn-small.btn-ghost.mx-use", {
      type: "button", "data-fk": "mix-reset-" + id, hidden: true,
      on: { click: () => { ed.vals[id] = ""; ed.settled.delete(id); input.value = ""; refresh(); input.focus(); } },
    }, "Use the plan's");
    const err = h("span.form-error.mx-err", { id: "mx-err-" + id });
    const year = h("td.num.r", { "data-label": "Your year" });
    rowsOf[id] = { input, err, reset, year };
    return h("tr",
      h("th", { scope: "row" }, h("span.mx-name", i.name), h("span.ticker.num", i.id), h("span.sub", `The plan buys it ${planDates(f, id)}`)),
      h("td.num.r", { "data-label": "The plan's mix" }, pctText(f.shown[id] / 10)),
      h("td", { "data-label": "Your mix" }, h("div.mx-in", input, h("span.mx-pct", { "aria-hidden": "true" }, "%"), reset), err),
      year);
  };
  const restCell = h("span.mx-rest");
  const restYear = h("td.num.r", { "data-label": "Your year" });
  const restRow = (i) => h("tr.mx-rest-row",
    h("th", { scope: "row" }, h("span.mx-name", i.name), h("span.ticker.num", i.id), h("span.sub", `The plan buys it ${planDates(f, i.id)}`)),
    h("td.num.r", { "data-label": "The plan's mix" }, pctText(f.shown[i.id] / 10)),
    h("td", { "data-label": "Your mix" }, restCell),
    restYear);
  const totalMine = h("td", { "data-label": "Your mix" });
  const totalYear = h("td.num.r", { "data-label": "Your year" });
  const table = h("table.data-table.mx-table",
    h("caption.visually-hidden", "Your mix, holding by holding"),
    h("thead", h("tr", h("th", { scope: "col" }, "Holding"), h("th.r", { scope: "col" }, "The plan's mix"), h("th", { scope: "col" }, "Your mix"), h("th.r", { scope: "col" }, "Your year"))),
    f.groups.map((g) => h("tbody",
      h("tr.mx-group", h("th", { scope: "rowgroup", colspan: 4 }, g.label)),
      f.insts.filter((i) => i.group === g.id).map((i) => (i.id === f.restId ? restRow(i) : holdingRow(i))))),
    h("tfoot", h("tr",
      h("th", { scope: "row" }, "Total"),
      h("td.num.r", { "data-label": "The plan's mix" }, "100%"),
      totalMine,
      totalYear)));

  const errBox = h("div.mx-errs#mx-errs", { "aria-live": "polite" });
  const placedBox = h("p.mx-placed", { "aria-live": "polite" });
  const saveHint = h("p.field-hint#mx-save-hint");
  const save = h("button.btn.btn-primary", { type: "button", "data-fk": "mix-save", "aria-describedby": "mx-save-hint", on: { click: () => onSave() } }, "Use this mix");
  const actions = h("div.mx-actions",
    save,
    h("a.btn.btn-ghost", { href: "#/settings", "data-fk": "mix-cancel" }, "Cancel"),
    own ? h("button.btn.btn-ghost", { type: "button", "data-fk": "mix-plan", on: { click: async () => {
      if (await backToPlanMix(ed.from)) { ed = null; hooks.go("settings"); }
    } } }, "Back to the plan's mix") : null);

  const editCard = card(".mx-edit", { "aria-labelledby": "mx-edit-h" },
    cardHead(h("span#mx-edit-h", "Your shares"), "Each share is that part of every month's money from the month you choose."),
    field("Starting with", from, "Earlier months and months with records keep their mix."),
    h("p.field-hint.mx-hint#mx-hint", "Leave it empty for the plan's share. 0 means not in your mix."),
    h("div.table-wrap", table),
    h("p.mx-note", "VWRA takes what the other orders leave in each month, and every amount the rules carry (rule r10 and the leftover rule)."),
    h("p.mx-note", SMALL_ORDERS),
    errBox,
    placedBox,
    actions,
    saveHint);

  // ---- the year at the friend's amounts
  const yearBody = h("div.mx-year-body");
  const yearCard = card(".mx-year", { "aria-labelledby": "mx-year-h" },
    cardHead(h("span#mx-year-h", "Your year at your amounts"), "It follows the shares and the month above as you type."),
    yearBody,
    h("p.fine", "Percentages are of each month's money. In a month you put in more, every order that month is bigger, so your year's real split follows the months you send."));

  out.push(h("div.mx-grid", editCard, yearCard));

  /** Puts the draft on the page: each field's state, VWRA's line, the totals, the year, the problems and the save button. */
  function refresh() {
    const d = readDraft();
    const shownErrs = [];
    for (const i of f.holdings) {
      const r = rowsOf[i.id];
      const raw = String(ed.vals[i.id] || "").trim();
      const p = parseShare(raw);
      const err = d.errs[i.id];
      const show = !!err && (ed.all || ed.settled.has(i.id));
      if (r.err.textContent !== (show ? err : "")) r.err.textContent = show ? err : "";
      r.input.setAttribute("aria-invalid", String(show));
      r.reset.hidden = !(raw && (p.error || p.tenths !== f.shown[i.id]));
      if (show) shownErrs.push(err);
    }
    restCell.textContent = `VWRA: the rest (now ${pctText(d.restPct)})`;
    clear(totalMine).append(h("span.num", pctText(d.totalPct)));
    const y = d.cand ? yearOf(d.cand.plan) : null;
    const yPct = (id) => (y && y.all ? pctText((100 * (y.by[id] || 0)) / y.all) : "—");
    for (const i of f.holdings) rowsOf[i.id].year.textContent = yPct(i.id);
    restYear.textContent = yPct(f.restId);
    totalYear.textContent = y && y.all ? "100%" : "—";

    const problems = [...shownErrs];
    if (d.over) problems.push(MIX_TOTAL);
    if (d.error) problems.push(explain(d.error));
    clear(errBox).append(...(problems.length ? [h("ul.err-list", problems.map((t) => h("li", t)))] : []));
    const n = d.placed.length;
    placedBox.textContent = n ? `You marked ${plural(n, "order")} placed in the months this changes. If ${n === 1 ? "its amount changes, change it" : "their amounts change, change them"} in your broker's app too.` : "";
    placedBox.hidden = !n;

    const blocked = !d.cand || d.over || !!d.error || Object.keys(d.errs).length > 0;
    save.disabled = blocked || d.unchanged;
    saveHint.textContent = d.unchanged && !blocked
      ? (own ? "This is the mix you have from then. Change a share or the month to change it." : "Change a share to use your own mix.")
      : "";
    saveHint.hidden = !saveHint.textContent;

    clear(yearBody).append(...yearView(d));
  }

  /** The year card's content: the group bar, the start month's orders and VWRA's part of each month. */
  function yearView(d) {
    const plan = d.cand ? d.cand.plan : app.plan;
    const rec = d.cand ? d.cand.state.plan : S().plan;
    const kids = [];
    if (!d.cand) kids.push(h("p.muted.small", "This shows the mix you have now. Fix the problem in your shares to see the change."));
    kids.push(h("div.mx-bar", groupBar(yearOf(plan), "Your year at your amounts")));
    kids.push(monthView(plan, rec, ed.from));
    kids.push(h("h3.mx-sub", "VWRA's part of each month"), strip(plan, rec));
    return kids;
  }

  refresh();
  return out;
}

/** What the start month's money buys at the draft: its orders by date, its transfers and the orders too small to place. */
function monthView(plan, rec, from) {
  const base = app.base;
  const r = M.resolveMonths(base, rec).find((x) => x.dateId === from);
  if (!r) return null;
  const month = monthOnly(from);
  const inst = Object.fromEntries(plan.instruments.map((i) => [i.id, i]));
  const dateOf = Object.fromEntries(plan.orderDates.map((d) => [d.id, d.date]));
  const os = plan.orders.filter((o) => M.monthOfOrder(base, o.id) === from);
  const lines = [];
  for (const dateId of [...new Set(os.map((o) => o.dateId))]) {
    const on = os.filter((o) => o.dateId === dateId);
    const rest = on.find((o) => o.carryTarget);
    const named = on.filter((o) => !o.carryTarget).map((o) => `${word(inst[o.instrument])} ${fM(o.usd)}`);
    if (rest && rest.usd > 0) named.push(`VWRA ${fM(rest.usd)}`);
    const parts = [];
    if (named.length) parts.push(`On ${short(dateOf[dateId])}: ${listWords(named)}.`);
    else parts.push(`On ${short(dateOf[dateId])}:`);
    if (rest && !(rest.usd > 0)) parts.push("VWRA: takes any leftover.");
    lines.push(h("p", parts.join(" ")));
  }
  const tx = plan.funding.transfers.filter((t) => t.forDate === from);
  const label = (id) => ((plan.accounts || []).find((a) => a.id === id) || {}).label || id;
  if (tx.length) lines.push(h("p.muted.small", `You send ${listWords(tx.map((t) => `${fM(t.usd)} to ${label(t.to)}`))} for ${month}'s orders.`));
  const rolled = ((plan.scale && plan.scale.rolled) || []).filter((x) => x.fundDateId === from);
  if (rolled.length) {
    const min = (plan.scale && plan.scale.minOrderUsd) || {};
    // The smallest order of each kind among them: a fund buys at least $1, a US stock and a coin their minimum.
    const kinds = [["whole_usd", "a fund"], ["fractional_usd", "a US stock"], ["usd_amount", "a coin"]]
      .filter(([st]) => rolled.some((x) => x.style === st))
      .map(([st, w]) => `${fM(st === "whole_usd" ? Math.max(1, min[st] || 0) : min[st] || 0)} for ${w}`);
    const text = rolled.length === 1
      ? (() => {
        const x = rolled[0];
        const under = x.minUsd > 0
          ? (x.account === "SwissBorg" ? `under the ${fM(x.minUsd)} the plan allows for SwissBorg's smallest exchange` : `under the ${fM(x.minUsd)} the plan uses as the smallest order`)
          : "less than a dollar";
        return `At ${fM(r.usd)} in ${month}, ${word(inst[x.instrument])}'s order would be ${under}. Its money goes to ${month}'s VWRA order instead.`;
      })()
      : `At ${fM(r.usd)} in ${month}, the orders for ${listWords(rolled.map((x) => word(inst[x.instrument])))} would each be under the smallest order (${listWords(kinds)}). Their money goes to ${month}'s VWRA order instead.`;
    lines.push(h("p.mx-roll", icon("info"), h("span", text)));
  }
  return h("div.mx-month",
    h("p.eyebrow", `${monthName(r.date)} at ${fM(r.usd)} · ${r.mode === "own" ? "your mix" : "the plan's mix"}`),
    lines);
}

/** VWRA's part of each month at the draft: twelve cells, each with its month, its amount and a word for its mix. */
function strip(plan, rec) {
  const base = app.base;
  const fx = fixed();
  return h("ul.mx-strip", M.resolveMonths(base, rec).map((r) => {
    const v = plan.orders.find((o) => o.carryTarget && M.monthOfOrder(base, o.id) === r.dateId);
    const tag = r.preJoin ? "before you joined" : fx.has(r.dateId) ? "has records" : r.mode === "own" ? "your mix" : "plan's mix";
    const money = r.preJoin || (v && v.usd > 0);
    return h(`li.mx-cell${!r.preJoin && r.mode === "own" ? ".is-own" : ""}`,
      h("span.mx-cell-m", monthName(r.date, true)),
      money ? h("span.mx-cell-v.num", r.preJoin ? "—" : fM(v.usd)) : h("span.mx-cell-v.is-words", "takes any leftover"),
      h("span.mx-cell-t", tag));
  }));
}

/** "Use this mix": saved from the chosen month, then back to Settings. */
function onSave() {
  if (!ed) return;
  ed.all = true;
  const d = readDraft();
  if (!d.cand || d.over || d.error || Object.keys(d.errs).length || d.unchanged) {
    hooks.renderView("mix");
    const bad = document.querySelector('[data-view="mix"] input[aria-invalid="true"]');
    if (bad) bad.focus();
    return;
  }
  const fromId = ed.from, mix = d.mix;
  try {
    commitPlanChange((s) => M.setMixFrom(s, app.base, { fromId, mix }));
  } catch (e) {
    toast(explain(e), "alert", 6000);
    hooks.renderView("mix");
    return;
  }
  const month = monthOnly(fromId);
  ed = null;
  toast(mixIsOwn() ? `From ${month}, Tide Table follows your mix` : `From ${month}, Tide Table follows the plan's mix again`, "success");
  hooks.go("settings");
}
