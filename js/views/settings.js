// Settings: the friend's amounts (which months their records fix, and the buttons to change the rest),
// their mix (the card from views/mix.js), their name, the theme, baht display, the 27 Nov closes that set
// the ceilings, export / import / start over, and where every number comes from.

import {
  app, h, icon, toast, L, S, store, prices, hooks, settings, ceilingOf, locked,
  fM, fB, fNum, fThb, fPrice, long, short, countWord, plural, ago, parseNum,
  pill, card, cardHead, viewHead, field, disclosure, sourceLink, commit, modal, confirmDialog, exportState,
  M, fixed, joinedMonthIds, openMonthIds, amountWords, mixIsOwn, joinedBudgetUsd, resolvedMonths, isBoughtInst, pre,
} from "../core.js?v=2.0.0";
import { DEFAULT_STATE, MAX_IMPORT_BYTES, MAX_DEPTH, STILL_KEY, depthOf, cleanPlan, validateImport, withoutUnbought } from "../store.js?v=2.0.0";
import * as book from "../book.js?v=2.0.0";
import { openMonthDialog, monthWordOf, typedWords } from "./amounts.js?v=2.0.0";
import { mixCard } from "./mix.js?v=2.0.0";

function setSetting(key, value) { commit((d) => { d.settings[key] = value; }); }

/** "November to January: $500 a month · February to October: $300 a month"; a month set on its own reads
 *  "May: $700, set on its own". Empty when every joined month has the same amount. */
function runWords() {
  const runs = M.amountRuns(app.base, S().plan);
  if (runs.length < 2) return "";
  return runs.map((r) => {
    const span = r.from === r.to ? monthWordOf(r.from) : `${monthWordOf(r.from)} to ${monthWordOf(r.to)}`;
    if (r.own) return r.from === r.to ? `${span}: ${fM(r.usd)}, set on its own` : `${span}: ${fM(r.usd)} a month, each set on its own`;
    return `${span}: ${fM(r.usd)} a month`;
  }).join(" · ");
}

/** The amount card: how many months the records fix, the amounts, how they were typed, and the buttons. */
function amountCard(plan, st, nameField) {
  const p = st.plan;
  const joined = joinedMonthIds().length;
  const nFixed = fixed().size;
  const isLocked = locked();
  const anyOpen = openMonthIds().length > 0;
  const input = p.input || {};
  const typed = input.currency === "THB"
    ? `You typed ${fB(input.amount)} a month, converted at ฿${fNum(input.rate, 2)} per dollar (${input.rateSource || "the plan's rate"}${input.rateDate ? `, ${long(input.rateDate)}` : ""}).`
    : `You typed ${fM(input.amount)} a month.`;
  // Months with an amount of their own typed in baht say so too.
  const monthTyped = resolvedMonths().filter((r) => !r.preJoin && r.own).map((r) => typedWords(r.input, `for ${monthWordOf(r.dateId)}`)).filter(Boolean);
  const runs = runWords();
  const late = pre().dateIds.length > 0;
  return card(".set-card.amount-card", { "aria-labelledby": "s-amt" },
    cardHead(h("span#s-amt", "Your amounts"), null,
      isLocked ? pill("Every month fixed", "amber", "◷") : nFixed ? pill(`${nFixed} of ${joined} months fixed`, "amber", "◷") : pill("Can change", "kelp", "✓")),
    h("p.amount-big", h("span.num-display", (amountWords() || `${fM(plan.funding.monthlyUsd)} a month`).replace(/ a month$/, "")), h("span.amount-per", " a month"),
      h("span.amount-year", ` · ${fM(joinedBudgetUsd())} ${late ? "from when you joined" : "over the year"}`)),
    runs ? h("p.am-runs", { "data-fk": "amount-runs" }, runs) : null,
    h("p", typed),
    monthTyped.map((s) => h("p.small.muted", s)),
    h("p", isLocked
      ? "Every month of your plan has a logged fill, skip or transfer, so the amounts stay as they are."
      : "A month's amount is fixed once you log a fill, a skip or a transfer that it pays for, so the records you keep stay true. The other months can still change."),
    h("p", "If you send more or less to Interactive Brokers one month, record it on the Money page. While that month can change, you can size its orders to what you sent; otherwise only that month's VWRA order changes (rule r10)."),
    anyOpen ? h("div.data-actions",
      h("a.btn", { href: "#/setup", "data-fk": "change-amount" }, "Change amount"),
      h("button.btn", { type: "button", "data-fk": "change-month", on: { click: () => openMonthDialog(null) } }, "Change one month")) : null,
    nameField);
}

function numInput(fk, value, onCommit, { placeholder = "", label } = {}) {
  const el = h("input", { inputmode: "decimal", autocomplete: "off", "data-fk": fk, placeholder, "aria-label": label || null, value: Number.isFinite(value) ? String(value) : "" });
  el.addEventListener("change", () => {
    const raw = el.value.trim();
    const v = raw === "" ? null : parseNum(raw);
    if (v !== null && !(v > 0)) { el.setAttribute("aria-invalid", "true"); toast("Please type a price, for example 243.50", "alert"); return; }
    el.removeAttribute("aria-invalid");
    onCommit(v);
  });
  return el;
}

/** The instruments with a ceiling set by the 27 Nov close, among the ones the friend's plan buys. */
const closePlusRows = () => app.plan.instruments.filter((i) => i.ceiling && i.ceiling.type === "close_plus" && isBoughtInst(i.id));

/** "Five ceilings are set by the 27 Nov close: + 10% for …; + 15% for …." (the rows shown below it) */
function closePlusSummary() {
  const cp = closePlusRows();
  if (!cp.length) return "";
  const byPct = {};
  for (const i of cp) (byPct[i.ceiling.pct] ||= []).push(i.group === "index" || i.id === "QNTM" ? i.id : i.name);
  const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0]);
  const parts = Object.keys(byPct).map(Number).sort((a, b) => a - b).map((pct) => `+ ${pct}% for ${list(byPct[pct])}`);
  return `${countWord(cp.length)} ceiling${cp.length === 1 ? " is" : "s are"} set by the ${short(cp[0].ceiling.date)} closing price: ${parts.join("; ")}.`;
}

export function renderSettings() {
  const plan = app.plan, st = S(), set = st.settings;
  const p = st.plan;
  const out = [viewHead("settings", "Tide Table · Monthly", "Settings",
    "Everything you enter is kept in this browser, on this device. Nothing is sent anywhere. Download a copy now and then: clearing the browser's data deletes it, and some browsers clear it on their own.")];
  if (!store.available || store.saveError) {
    out.push(h("p.banner.is-warn.rise", { role: "alert" }, icon("alert"), h("span", "This browser is not keeping your records (its storage is blocked or full). Download a copy below before you close the page.")));
  }

  const nameI = h("input", { "data-fk": "set-name", autocomplete: "given-name", maxlength: 40, value: (st.profile && st.profile.name) || "", placeholder: "Optional" });
  nameI.addEventListener("change", () => { const v = nameI.value.trim().slice(0, 40); commit((d) => { d.profile = { ...d.profile, name: v }; }); toast(v ? `Hello, ${v}` : "Name removed", "info"); });

  const showThb = set.showThb !== false;
  const thbSwitch = h("button.switch", { type: "button", role: "switch", "aria-checked": String(showThb), "data-fk": "set-thb", on: { click: () => setSetting("showThb", !showThb) } },
    h("span.switch-track", { "aria-hidden": "true" }, h("span.switch-thumb")), h("span.switch-label", "Show baht next to dollars on the Money page"));

  // The "Your mix" card comes from the mix page's module; a problem there never hides the rest of Settings. The
  // own-mix editor is hidden in 2.0 (spec 8.1): the card shows only for a state that already holds a mix.
  let mix = null;
  const holdsMix = mixIsOwn() || Object.values((p && p.months) || {}).some((e) => e && e.mix && Object.keys(e.mix).length);
  if (holdsMix) { try { mix = mixCard(); } catch (e) { console.warn(e); } }

  // Still pictures and Night pages (brief 4.6, 4.8.6), the same settings as the contents column's switches.
  const still = book.switchRow({ label: book.FIXED.still, checked: set.still === true, hint: "On: nothing on the page moves.",
    onChange: (on) => {
      book.applyStill(on);
      try { localStorage.setItem(STILL_KEY, on ? "1" : "0"); } catch { /* storage blocked */ }
      commit((d) => { if (on) d.settings.still = true; else delete d.settings.still; });
    } });
  still.setAttribute("data-fk", "set-still");

  out.push(h("div.settings-grid",
    amountCard(plan, st, field("Your first name (optional)", nameI, "Only used to say hello on Today.")),
    mix,

    card(".set-card", { "aria-labelledby": "s-th" },
      cardHead(h("span#s-th", "Appearance")),
      h("fieldset.radio-set.theme-set", h("legend", "Theme"),
        [["auto", "Match this device", "Night pages after dark"], ["dark", "Night pages", "Always dark"], ["light", "Day pages", "Always light"]].map(([v, t, sub]) =>
          h(`label.radio.theme-opt.t-${v}`, h("input", { type: "radio", name: "theme", value: v, checked: (set.theme || "auto") === v, "data-fk": "th-" + v, on: { change: () => setSetting("theme", v) } }),
            h("span.theme-swatch", { "aria-hidden": "true" }), h("span", h("strong", t), h("span.radio-sub", sub))))),
      thbSwitch, still),

    card(".set-card.is-wide", { "aria-labelledby": "s-ce" },
      cardHead(h("span#s-ce", "Ceilings"), closePlusRows().length
        ? `${closePlusSummary()} On Friday 27 November 2026, look up each closing price (in your broker's app or on any finance website) and type it here.`
        : "Your plan buys none of the holdings whose ceiling is set by the 27 November closing price."),
      h("div.ceil-rows", closePlusRows().map((i) => {
        const got = (set.closes || {})[i.id];
        const c = ceilingOf(i);
        return h("div.ceil-row",
          h("p.ceil-name", i.name, h("span.ticker.num", i.id)),
          h("p.ceil-auto.small", `Ceiling: close + ${i.ceiling.pct}%`),
          field("27 Nov close (US$)", numInput("close-" + i.id, got ? got.close : null, (v) => commit((d) => {
            if (v == null) delete d.settings.closes[i.id];
            else d.settings.closes[i.id] = { date: i.ceiling.date, close: L.round2(v) };
          }), { placeholder: "after 27 Nov", label: `${i.name} closing price on 27 Nov 2026, US dollars` })),
          h("p.ceil-result", "Ceiling ", h("strong.num", c.value != null ? fPrice(c.value, i.quoteCurrency) : "set on 27 Nov"), h("span.muted", c.kind === "manual" ? " · your override" : c.kind === "close_plus" ? " · from your close" : "")));
      })),
      disclosure("fixed-ceil", "Change a fixed ceiling (this changes the plan's own number)",
        h("div.ceil-rows", plan.instruments.filter((i) => i.ceiling && i.ceiling.type === "fixed" && isBoughtInst(i.id)).map((i) => {
          const ov = set.ceilingOverrides[i.id];
          return h("div.ceil-row.is-fixed",
            h("p.ceil-name", i.name, h("span.ticker.num", i.id)),
            h("p.ceil-auto.small", `Plan: ${fPrice(i.ceiling.value, i.quoteCurrency)}`),
            field("Ceiling (US$)", numInput("ovf-" + i.id, ov, (v) => commit((d) => {
              if (v == null) delete d.settings.ceilingOverrides[i.id]; else d.settings.ceilingOverrides[i.id] = v;
            }), { placeholder: String(i.ceiling.value), label: `${i.name} ceiling, US dollars` })));
        })))),

    card(".set-card", { "aria-labelledby": "s-data" },
      cardHead(h("span#s-data", "Your records"), "Your amount, fills, transfers, prices you typed, checklists, notes and journal."),
      h("div.data-actions",
        h("button.btn", { type: "button", "data-fk": "exp", on: { click: exportState } }, "Download a copy (JSON)"),
        h("label.btn.file-btn", { "data-fk": "imp" }, "Load a copy…", h("input.visually-hidden", { type: "file", accept: "application/json,.json", on: { change: (e) => importState(e.target) } })),
        h("button.btn.btn-danger", { type: "button", "data-fk": "reset", on: { click: startOver } }, "Start over")),
      h("p.fine", { "data-fk": "last-copy" }, set.lastExportAt ? `Last copy downloaded ${long(L.bkkDate(Date.parse(set.lastExportAt)))}.` : "No copy downloaded yet."),
      h("p.fine", "Some browsers clear a site's data on their own: Safari does after about a week without a visit. On an iPhone or iPad, add this page to your Home Screen (Share, then Add to Home Screen): it keeps its own data there. Either way, a copy now and then keeps your records safe."),
      h("p.fine", "Loading a copy replaces what is here after you confirm. Start over deletes everything in this browser and asks for your amount again.")),

    card(".set-card", { "aria-labelledby": "s-pages" },
      cardHead(h("span#s-pages", "More pages"), "The money you send, what you own, and the plan's own rules."),
      h("ul.bk-list.ttm-more-pages",
        h("li", h("a", { href: "#/money", "data-fk": "set-money" }, "Money: what to send and when")),
        h("li", h("a", { href: "#/holdings", "data-fk": "set-holdings" }, "Holdings: what you own")),
        h("li", h("a", { href: "#/rules", "data-fk": "set-rules" }, "Rules: the plan's rules and checks")))),

    card(".set-card", { "aria-labelledby": "s-about" },
      cardHead(h("span#s-about", "About these numbers")),
      h("dl.about-list",
        h("dt", "The plan"), h("dd", aboutPlan(plan, p)),
        h("dt", "Coin prices"), h("dd", sourceLink(prices.SOURCES.crypto), ". ", prices.data.off ? "Turned off for this page." : prices.data.cryptoAt ? `Last updated ${ago(prices.data.cryptoAt)}; every 2 minutes while this page is open.` : "Not loaded yet."),
        h("dt", "Exchange rate"), h("dd", sourceLink(prices.SOURCES.fx), ". ", prices.data.fx ? `฿${fNum(prices.data.fx.rate, 2)} per dollar on ${long(prices.data.fx.date)}; checked once a day.` : `Not available, so the plan's ฿${fNum(plan.meta.planFx, 2)} is used.`),
        h("dt", "Stock and fund prices"), h("dd", "No live source: you type the price your broker's app shows, and Tide Table uses it to size the order and value what you own."),
        h("dt", "Your data"), h("dd", "No account, no cookies, no tracking. Requests for prices never include your amounts or holdings.")))));
  return out;
}

/** "Written on 9 October 2026 for $500 a month, and scaled to your amounts. From April it follows your mix. …" */
function aboutPlan(plan, p) {
  const mix = mixIsOwn() && p.mixFrom ? ` From ${monthWordOf(p.mixFrom)} it follows your mix.` : "";
  return `Written on ${long(plan.meta.docDate)} for ${fM(app.base.funding.monthlyUsd)} a month, and scaled to your amounts.${mix} Ceilings, dates and rules are the plan's own and do not change with your amounts.`;
}

/** True when a file is no deeper than a Tide Table · Monthly copy can be (validateImport says so otherwise). */
const depthOk = (doc) => depthOf(doc, MAX_DEPTH) <= MAX_DEPTH;

/**
 * The plan a file's own amounts and mix give, for checking an import: { plan, error } (months.planOrNull,
 * with every amount as typed, then from the dollars alone). The file may be version 1 or 2; its plan
 * record is cleaned as the store would keep it.
 */
function planFor(doc) {
  const p = doc && typeof doc === "object" && !Array.isArray(doc) ? doc.plan : null;
  if (!p || typeof p !== "object" || typeof p.monthlyUsd !== "number") return { plan: null, error: null };
  try { return M.planOrNull(app.base, cleanPlan(p)); } catch (e) { return { plan: null, error: e }; }
}

/** Load a downloaded copy (Settings, and the setup screen on a new browser). Asks first if anything is here. */
export function importState(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) { toast("That file is larger than 512 KB, so it is not a Tide Table · Monthly copy", "alert", 6000); return; }
  const reader = new FileReader();
  reader.onload = async () => {
    let doc;
    try { doc = JSON.parse(String(reader.result)); } catch { toast("That file is not a JSON file", "alert"); return; }
    // validateImport refuses a file nested too deeply before it looks at anything else. It reads the raw
    // file (version 1 or 2); the store migrates it when it is loaded.
    const { plan, error } = depthOk(doc) ? planFor(doc) : { plan: null, error: null };
    const errs = validateImport(doc, plan, { base: app.base, error });
    if (errs.length) {
      modal({ title: "This file can't be loaded", lede: "Nothing was changed.", body: h("ul.err-list", errs.map((e) => h("li", e))), actions: [h("button.btn.btn-primary", { type: "submit" }, "OK")], onSubmit: () => true });
      return;
    }
    // A to-do or placed entry for an order the file's plan does not buy (left from before a change), and a
    // to-do entry for a transfer it does not need, have nothing to say: drop them. Unknown fields are
    // dropped by the store (withDefaults).
    doc = withoutUnbought(doc, plan);
    const filled = Object.values(doc.orders || {}).filter((o) => o && o.status === "filled").length;
    const nTx = Object.values(doc.funding || {}).filter((f) => f && f.status && f.status !== "todo").length;
    const rec = cleanPlan(doc.plan);
    const words = M.amountWords(app.base, rec) || `${fM(doc.plan.monthlyUsd)} a month`;
    const own = rec && rec.mix && Object.keys(rec.mix).length ? ", your own mix" : "";
    const here = S();
    const anything = here.plan || here.journal.length || ["orders", "funding", "prices", "prep", "thesis"].some((k) => Object.keys(here[k] || {}).length);
    const ok = !anything || await confirmDialog({
      title: "Replace what is here?",
      text: `${file.name}: ${words}${own}, ${plural(filled, "filled order")}, ${plural(nTx, "transfer")} recorded, ${plural((doc.journal || []).length, "journal entry", "journal entries")}. Everything in this browser now is replaced.`,
      ok: "Load it", danger: true,
    });
    if (!ok) return;
    store.replace(doc);
    toast("Your copy is loaded", "success");
    hooks.go("today");
  };
  reader.readAsText(file);
}

function startOver() {
  const m = modal({
    title: "Start over?",
    cls: ".is-confirm",
    body: [h("p", "This deletes your amount and every record in this browser: fills, transfers, prices you typed, checklists, notes and journal. Then you choose an amount again."),
      h("p.muted.small", "Download a copy first if you might want them back.")],
    actions: [
      h("button.btn.btn-ghost", { type: "button", on: { click: () => m.close() } }, "Cancel"),
      h("button.btn", { type: "button", "data-fk": "reset-export", on: { click: exportState } }, "Download a copy"),
      h("button.btn.btn-danger", { type: "submit" }, "Start over"),
    ],
    onSubmit: () => {
      const theme = settings().theme;
      const fresh = DEFAULT_STATE();
      fresh.settings.theme = theme;
      app.draft = null;
      app.deskDate = null;
      // Every saved copy goes: this version's, the older version's, and the set-aside ones.
      store.startOver(fresh);
      toast("Everything was deleted. Choose your amount to start again.", "info");
      hooks.go("setup");
      return true;
    },
  });
}
