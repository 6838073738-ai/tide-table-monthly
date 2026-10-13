// Settings: the friend's amount (and when it locks), their name, the theme, baht display, the 27 Nov
// closes that set five ceilings, export / import / start over, and where every number comes from.

import {
  app, h, icon, toast, L, S, store, prices, hooks, settings, ceilingOf, locked,
  fM, fB, fNum, fThb, fPrice, long, short, countWord, plural, ago, parseNum,
  pill, card, cardHead, viewHead, field, disclosure, sourceLink, commit, modal, confirmDialog, exportState,
} from "../core.js";
import { DEFAULT_STATE, MAX_IMPORT_BYTES, validateImport, withoutUnbought } from "../store.js";
import { scalePlan } from "../scale.js";

function setSetting(key, value) { commit((d) => { d.settings[key] = value; }); }

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

/** "Five ceilings are set by the 27 Nov close: + 10% for …; + 15% for …." */
function closePlusSummary() {
  const cp = app.plan.instruments.filter((i) => i.ceiling && i.ceiling.type === "close_plus");
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
  const isLocked = locked();
  const out = [viewHead("settings", "Tide Table · Monthly", "Settings",
    "Everything you enter is kept in this browser, on this device. Nothing is sent anywhere. Download a copy now and then: clearing the browser's data deletes it, and some browsers clear it on their own.")];
  if (!store.available || store.saveError) {
    out.push(h("p.banner.is-warn.rise", { role: "alert" }, icon("alert"), h("span", "This browser is not keeping your records (its storage is blocked or full). Download a copy below before you close the page.")));
  }

  const input = p.input || {};
  const typed = input.currency === "THB"
    ? `You typed ${fB(input.amount)} a month, converted at ฿${fNum(input.rate, 2)} per dollar (${input.rateSource || "the plan's rate"}${input.rateDate ? `, ${long(input.rateDate)}` : ""}).`
    : `You typed ${fM(input.amount)} a month.`;
  const nameI = h("input", { "data-fk": "set-name", autocomplete: "given-name", maxlength: 40, value: (st.profile && st.profile.name) || "", placeholder: "Optional" });
  nameI.addEventListener("change", () => { const v = nameI.value.trim().slice(0, 40); commit((d) => { d.profile = { ...d.profile, name: v }; }); toast(v ? `Hello, ${v}` : "Name removed", "info"); });

  const showThb = set.showThb !== false;
  const thbSwitch = h("button.switch", { type: "button", role: "switch", "aria-checked": String(showThb), "data-fk": "set-thb", on: { click: () => setSetting("showThb", !showThb) } },
    h("span.switch-track", { "aria-hidden": "true" }, h("span.switch-thumb")), h("span.switch-label", "Show baht next to dollars on the Money page"));

  out.push(h("div.settings-grid",
    card(".set-card.amount-card", { "aria-labelledby": "s-amt" },
      cardHead(h("span#s-amt", "Your amount"), null, isLocked ? pill("Locked", "amber", "◷") : pill("Can change", "kelp", "✓")),
      h("p.amount-big", h("span.num-display", fM(plan.funding.monthlyUsd)), h("span.amount-per", " a month"), h("span.amount-year", ` · ${fM(plan.meta.budgetUsd)} over the year`)),
      h("p", typed),
      isLocked
        ? h("p", `Locked since your first fill, skip or transfer${p.lockedAt ? ` (${short(p.lockedAt.slice(0, 10))})` : ""}, so the records you keep stay true. If you send more or less to Interactive Brokers one month, record it on the Money page: only that month's VWRA order changes (rule r10). To choose a new amount, download your records and start over.`)
        : h("p", "You can change it until you log your first fill, skip or transfer."),
      isLocked ? null : h("a.btn", { href: "#/setup", "data-fk": "change-amount" }, "Change amount"),
      field("Your first name (optional)", nameI, "Only used to say hello on Today.")),

    card(".set-card", { "aria-labelledby": "s-th" },
      cardHead(h("span#s-th", "Appearance")),
      h("fieldset.radio-set.theme-set", h("legend", "Theme"),
        [["auto", "Match the system", "Night sea after dark"], ["dark", "Night sea", "Dark"], ["light", "Chart paper", "Light"]].map(([v, t, sub]) =>
          h(`label.radio.theme-opt.t-${v}`, h("input", { type: "radio", name: "theme", value: v, checked: (set.theme || "auto") === v, "data-fk": "th-" + v, on: { change: () => setSetting("theme", v) } }),
            h("span.theme-swatch", { "aria-hidden": "true" }), h("span", h("strong", t), h("span.radio-sub", sub))))),
      thbSwitch),

    card(".set-card.is-wide", { "aria-labelledby": "s-ce" },
      cardHead(h("span#s-ce", "Ceilings"), `${closePlusSummary()} On Friday 27 November 2026, look up each closing price (in your broker's app or on any finance website) and type it here.`),
      h("div.ceil-rows", plan.instruments.filter((i) => i.ceiling && i.ceiling.type === "close_plus").map((i) => {
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
        h("div.ceil-rows", plan.instruments.filter((i) => i.ceiling && i.ceiling.type === "fixed").map((i) => {
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

    card(".set-card", { "aria-labelledby": "s-about" },
      cardHead(h("span#s-about", "About these numbers")),
      h("dl.about-list",
        h("dt", "The plan"), h("dd", `Written on ${long(plan.meta.docDate)} for ${fM(app.base.funding.monthlyUsd)} a month and scaled to your ${fM(plan.funding.monthlyUsd)}. Ceilings, dates and rules are the plan's own and do not change with your amount.`),
        h("dt", "Coin prices"), h("dd", sourceLink(prices.SOURCES.crypto), ". ", prices.data.off ? "Turned off for this page." : prices.data.cryptoAt ? `Last updated ${ago(prices.data.cryptoAt)}; every 2 minutes while this page is open.` : "Not loaded yet."),
        h("dt", "Exchange rate"), h("dd", sourceLink(prices.SOURCES.fx), ". ", prices.data.fx ? `฿${fNum(prices.data.fx.rate, 2)} per dollar on ${long(prices.data.fx.date)}; checked once a day.` : `Not available, so the plan's ฿${fNum(plan.meta.planFx, 2)} is used.`),
        h("dt", "Stock and fund prices"), h("dd", "No live source: you type the price your broker's app shows, and Tide Table uses it to size the order and value what you own."),
        h("dt", "Your data"), h("dd", "No account, no cookies, no tracking. Requests for prices never include your amounts or holdings.")))));
  return out;
}

/** The plan at a file's own amount, for checking an import (null when it cannot be scaled). */
function planFor(doc) {
  const p = doc && doc.plan;
  if (!p || typeof p.monthlyUsd !== "number") return null;
  const input = p.input && typeof p.input === "object" ? { currency: p.input.currency, amount: p.input.amount, rate: p.input.rate, rateSource: p.input.rateSource, rateDate: p.input.rateDate } : null;
  try { return scalePlan(app.base, p.monthlyUsd, input ? { input } : {}); } catch { /* try without the typed amount */ }
  try { return scalePlan(app.base, p.monthlyUsd); } catch { return null; }
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
    // validateImport refuses a file nested too deeply before it looks at anything else.
    const plan = planFor(doc);
    const errs = validateImport(doc, plan);
    if (errs.length) {
      modal({ title: "This file can't be loaded", lede: "Nothing was changed.", body: h("ul.err-list", errs.map((e) => h("li", e))), actions: [h("button.btn.btn-primary", { type: "submit" }, "OK")], onSubmit: () => true });
      return;
    }
    // A to-do or placed entry for an order not bought at the file's amount (left from before an amount
    // change) has nothing to say: drop it. Unknown fields are dropped by the store (withDefaults).
    doc = withoutUnbought(doc, plan);
    const filled = Object.values(doc.orders || {}).filter((o) => o && o.status === "filled").length;
    const nTx = Object.values(doc.funding || {}).filter((f) => f && f.status && f.status !== "todo").length;
    const here = S();
    const anything = here.plan || here.journal.length || ["orders", "funding", "prices", "prep", "thesis"].some((k) => Object.keys(here[k] || {}).length);
    const ok = !anything || await confirmDialog({
      title: "Replace what is here?",
      text: `${file.name}: ${fM(doc.plan.monthlyUsd)} a month, ${plural(filled, "filled order")}, ${plural(nTx, "transfer")} recorded, ${plural((doc.journal || []).length, "journal entry", "journal entries")}. Everything in this browser now is replaced.`,
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
      store.replace(fresh);
      toast("Everything was deleted. Choose your amount to start again.", "info");
      hooks.go("setup");
      return true;
    },
  });
}
