// Tide Table · Monthly 2.0: the entry point. It loads the base plan (data/base-plan.json) and the open data's
// index (data/index.json, through datafiles.js), scales the plan to the friend's amounts, mix and fields
// (months.js, split.js), and owns the router (#/today, #/fields, #/field/<id>[/<company>], #/company/<id>,
// #/split, #/year, #/money, #/holdings, #/rules, #/settings, #/setup, #/mix), the storybook frame (contents
// column, top bar, tab bar, footer; book.js), the Bangkok clock, price freshness, the older-tab banner, the
// theme and Still pictures. Views are in js/views/, shared helpers in js/core.js. Everything the friend enters
// stays in this browser (store.js).

import {
  app, hooks, h, clear, ui, L, store, prices, $, $$, S, today, initNow, now, saveUi, errorState, modal, ago,
  sourceLink, M, planKeyOf, amountWords, mixIsOwn, confirmDialog, toast, long, universeOn, hasFieldMonths,
  commitPlanChange, dayShort, pre,
} from "./core.js?v=2.0.0";
import * as scale from "./scale.js?v=2.0.0";
import * as book from "./book.js?v=2.0.0";
import * as D from "./datafiles.js?v=2.0.0";
import * as FU from "./fieldsui.js?v=2.0.0";
import { fieldName, isFieldId } from "./fields-catalog.js?v=2.0.0";
import { THEME_KEY, STILL_KEY, cleanPlan, validateImport, withoutUnbought } from "./store.js?v=2.0.0";
import { renderSetup } from "./views/setup.js?v=2.0.0";
import { renderToday, stopTodayTicker } from "./views/today.js?v=2.0.0";
import { renderYear } from "./views/year.js?v=2.0.0";
import { renderMoney } from "./views/money.js?v=2.0.0";
import { renderHoldings } from "./views/holdings.js?v=2.0.0";
import { renderRules } from "./views/rules.js?v=2.0.0";
import { renderSettings } from "./views/settings.js?v=2.0.0";
import { renderMix } from "./views/mix.js?v=2.0.0";
import { renderFields, configureFieldsUi, upcomingDoc } from "./views/fields.js?v=2.0.0";
import { renderField } from "./views/field.js?v=2.0.0";
import { renderCompany } from "./views/company.js?v=2.0.0";
import { renderSplit } from "./views/split.js?v=2.0.0";
import { resetDraft } from "./views/draft.js?v=2.0.0";

const BASE_TITLE = "Tide Table · Monthly";
const VIEWS = [
  { id: "today", title: "Today", icon: "today", deps: ["state", "crypto", "fx", "time", "theme", "data"], render: renderToday, onHide: stopTodayTicker },
  { id: "fields", title: "Fields", icon: "fields", deps: ["data"], render: renderFields, fields: true },
  { id: "field", title: "A field", icon: "fields", deps: ["data"], render: renderField, fields: true, nav: "fields", group: "hidden" },
  { id: "company", title: "A company", icon: "fields", deps: ["data"], render: renderCompany, fields: true, nav: "fields", group: "hidden" },
  { id: "split", title: "My split", short: "Split", icon: "split", deps: ["state", "data", "fx"], render: renderSplit, fields: true },
  { id: "year", title: "My year", short: "Year", icon: "year", deps: ["state", "time", "data"], render: renderYear },
  { id: "money", title: "Money", icon: "funding", deps: ["state", "fx", "time"], render: renderMoney },
  { id: "holdings", title: "Holdings", icon: "portfolio", deps: ["state", "crypto", "theme"], render: renderHoldings },
  { id: "rules", title: "Rules", icon: "rules", deps: ["state", "time"], render: renderRules },
  { id: "settings", title: "Settings", icon: "settings", deps: ["state", "crypto", "fx"], render: renderSettings },
  { id: "setup", title: "Your amount", icon: "funding", group: "hidden", deps: ["fx"], render: renderSetup },
  { id: "mix", title: "Your mix", icon: "portfolio", group: "hidden", nav: "settings", deps: ["state", "fx"], render: renderMix },
];
const byId = Object.fromEntries(VIEWS.map((v) => [v.id, v]));
const ROUTES = VIEWS.map((v) => v.id);
const dirty = new Set();
const sectionEl = (id) => document.querySelector(`main [data-view="${id}"]`);

/** Fields, My split and the field pages are offered when the open data has a list, or the friend has fields. */
const fieldsOffered = () => universeOn() || hasFieldMonths();
/** The own-mix editor is hidden in 2.0 (spec 8.1): its route works only for a state that holds a mix. */
const mixReachable = () => mixIsOwn() || Object.values((S().plan && S().plan.months) || {}).some((e) => e && e.mix && Object.keys(e.mix).length);

// ---------------------------------------------------------------- the plan at the friend's amount

/**
 * Scale the base plan to the saved amounts, mix and fields (months.planOrNull: with every amount as typed, then,
 * only if one of them no longer gives its dollars, from the dollars alone) whenever the plan record changes; true
 * when app.plan changed. When neither works (a hand-edited file), app.plan is null and app.planError says why.
 */
function syncPlan() {
  const p = S().plan;
  const key = planKeyOf(p);
  if (key === app.planKey) return false;
  app.planKey = key;
  app.planError = null;
  app.plan = null;
  app.planInputs = true;
  if (p) {
    try {
      const r = M.planOrNull(app.base, p);
      app.plan = r.plan;
      app.planInputs = !r.plan || r.inputs;
      if (!r.plan) app.planError = r.error || new Error("The saved amount could not be used.");
    } catch (e) {
      app.planError = e;
    }
  }
  app.instMap = app.plan ? Object.fromEntries(app.plan.instruments.map((x) => [x.id, x])) : {};
  // A field month's title comes from the base templates' own-mix wording ("Month 3: your mix"): it follows the
  // friend's fields, so the views say so (the plan is worked out again from the saved record each time).
  if (app.plan) {
    const fm = new Set((app.plan.scale && app.plan.scale.fieldMonths) || []);
    for (const d of app.plan.orderDates || []) {
      if (fm.has(d.id) && typeof d.title === "string") d.title = d.title.replace(/\byour mix\b/, "your fields");
    }
  }
  return true;
}

let lastFieldsSig = null;
function onPlanChange() {
  for (const v of VIEWS) dirty.add(v.id);
  if (app.plan) prices.start(app.plan, pre().orderIds);
  const stage = app.plan ? "plan" : "setup";
  const newStage = document.documentElement.dataset.stage !== stage;
  document.documentElement.dataset.stage = stage;
  // A save (or another tab's) changed the saved fields: this tab's draft starts again from them.
  const sig = JSON.stringify((S().plan && S().plan.fields) || null);
  if (sig !== lastFieldsSig) { if (lastFieldsSig !== null) resetDraft(); lastFieldsSig = sig; }
  buildChrome();
  renderFoot();
  renderFresh();
  // A new view (the setup's "Start", an import) starts at the top with its heading focused. A change made in
  // place (a month's amount, the mix) redraws the view where it is, and keeps the focus where it was.
  route({ force: true, focus: newStage || currentRoute().view !== app.active });
  syncFirstTrade();
}

// ---------------------------------------------------------------- rendering

function invalidate(dep) {
  for (const v of VIEWS) if (v.deps.includes(dep)) dirty.add(v.id);
  queueRender();
}
let renderQueued = false;
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    if (app.active && dirty.has(app.active)) renderView(app.active);
  }, 30);
}

function teardown(id) {
  for (const fn of app.cleanup[id] || []) { try { fn(); } catch { /* ignore */ } }
  app.cleanup[id] = [];
  app.after[id] = [];
}

function renderView(id, { entering = false } = {}) {
  const v = byId[id];
  const el = sectionEl(id);
  if (!v || !el) return;
  dirty.delete(id);
  // keep focus, caret and unsaved drafts across a data re-render (the view's heading included: route()
  // puts focus there, and a data change can arrive a moment later)
  const ae = document.activeElement;
  const fk = ae && el.contains(ae) ? ae.getAttribute("data-fk") : null;
  const headFocused = !!(ae && ae.id === "h-" + id && el.contains(ae));
  let caret = null;
  try { if (fk && typeof ae.selectionStart === "number") caret = [ae.selectionStart, ae.selectionEnd]; } catch { /* not a text field */ }
  const drafts = {};
  for (const d of $$("[data-keep]", el)) drafts[d.getAttribute("data-fk")] = d.value;
  el.style.minHeight = el.offsetHeight + "px";

  teardown(id);
  clear(el);
  // An opening plays when a view opens, not each time it is drawn again (prices, a save, the clock).
  el.classList.toggle("is-settled", !entering);
  app.renderingId = id;
  app.entering = entering;
  try {
    if (id !== "setup" && !app.plan) throw new Error("No plan yet");
    const out = v.render(el);
    if (out) el.append(...[].concat(out).filter(Boolean));
  } catch (e) {
    console.warn(e);
    el.append(errorState("This page hit a problem. The rest of Tide Table still works.", e));
  }
  app.entering = false;

  $$(".rise", el).forEach((c, i) => c.style.setProperty("--i", Math.min(i, 14)));
  // The view's heading takes the focus when the view opens (route()), so it can always be focused.
  const head = el.querySelector("#h-" + id);
  if (head && !head.hasAttribute("tabindex")) head.setAttribute("tabindex", "-1");
  for (const fn of app.after[id] || []) { try { fn(); } catch (e) { console.warn(e); } }
  for (const [k, val] of Object.entries(drafts)) {
    const d = el.querySelector(`[data-fk="${CSS.escape(k)}"]`);
    if (d && d.hasAttribute("data-keep")) d.value = val;
  }
  if (fk) {
    const t = el.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
    if (t) { t.focus({ preventScroll: true }); if (caret) try { t.setSelectionRange(caret[0], caret[1]); } catch { /* ignore */ } }
  } else if (headFocused) {
    const hd = el.querySelector("#h-" + id);
    if (hd) hd.focus({ preventScroll: true });
  }
  app.renderingId = null;
  setTimeout(() => { el.style.minHeight = ""; }, 80);
}

// ---------------------------------------------------------------- router

/**
 * The route the hash asks for: { view, key, field, company }. key is the canonical route without "#/" (a field
 * page with a company open in place is "field/<id>/<company>"). Anything that is not a route goes to Today; an
 * in-page anchor (e.g. "#main", "#desk") keeps the current view.
 */
function currentRoute() {
  if (!app.plan) return { view: "setup", key: "setup", field: null, company: null };
  const hash = location.hash || "";
  if (hash && hash !== "#" && hash !== "#/" && !hash.startsWith("#/")) {
    const v = app.active && app.active !== "setup" ? app.active : "today";
    return { view: v, key: app.routeKey || v, field: app.route ? app.route.field : null, company: app.route ? app.route.company : null };
  }
  const r = FU.parseRoute(hash, { routes: ROUTES, fallback: "today" });
  let view = r.ok ? r.route : "today";
  // Fields and a field's page stay reachable without the data (they say the facts are not ready, or did not
  // load); My split needs fields to split.
  if (view === "split" && !fieldsOffered()) view = "today";
  if (view === "mix" && !mixReachable()) view = "today";
  if (view === "field" && !isFieldId(r.field)) view = "fields";
  const key = view === r.route ? r.hash.replace(/^#\//, "") : view;
  return { view, key, field: r.field, company: r.company };
}

function viewTitle(id, r) {
  if (id === "field" && r.field) return fieldName(r.field);
  return byId[id] ? byId[id].title : BASE_TITLE;
}

function route({ initial = false, force = false, focus = !initial } = {}) {
  const r = currentRoute();
  const id = r.view;
  const prev = app.active;
  if (prev === id && r.key === app.routeKey && !initial && !force) return;
  const moved = prev !== id || r.key !== app.routeKey;
  for (const sec of $$("main [data-view]")) sec.hidden = sec.dataset.view !== id;
  if (prev && prev !== id) {
    const pv = byId[prev];
    try { if (pv && pv.onHide) pv.onHide(); } catch (e) { console.warn(e); }
    teardown(prev);
    const ps = sectionEl(prev);
    if (ps) clear(ps); // a hidden view keeps no stale copies of ids or data-fk keys
    if (prev === "setup") app.draft = null;
  }
  app.active = id;
  app.routeKey = r.key;
  app.route = { view: id, field: r.field, company: r.company };
  const el = sectionEl(id);
  el.setAttribute("aria-labelledby", "h-" + id);
  el.classList.add("view", "view-" + id);
  renderView(id, { entering: moved || initial });
  const title = viewTitle(id, r);
  document.title = id === "today" || id === "setup" ? BASE_TITLE : `${title} · ${BASE_TITLE}`;
  setActiveNav(id);
  if (focus && (moved || force)) {
    window.scrollTo(0, 0);
    const hd = el.querySelector("#h-" + id) || el.querySelector("h1, h2");
    if (hd) { if (!hd.hasAttribute("tabindex")) hd.setAttribute("tabindex", "-1"); hd.focus({ preventScroll: true }); }
    else { const m = $("#main"); if (m) m.focus({ preventScroll: true }); }
  }
}

hooks.go = (id) => {
  const target = "#/" + id;
  if (location.hash === target) route({ force: id !== app.active });
  else location.hash = target;
};
hooks.invalidate = invalidate;
hooks.renderView = (id) => renderView(id || app.active);
hooks.firstRoute = () => (universeOn() ? "fields" : "today");

/** "Skip to the page" moves focus to the current view's heading without changing the route. */
function skipToContent(e) {
  e.preventDefault();
  const sec = app.active && sectionEl(app.active);
  const hd = sec && (sec.querySelector("#h-" + app.active) || sec.querySelector("h1, h2"));
  if (hd && !hd.hasAttribute("tabindex")) hd.setAttribute("tabindex", "-1");
  const target = hd || $("#main");
  if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: "start" }); }
}

// ---------------------------------------------------------------- the frame (book.js)

const chrome = { rail: null, topbar: null, tabbar: null };

/** The tabs (brief G10, spec 8.2): five with the open data's list, else Today · My year · Settings. */
function tabItems() {
  const ids = fieldsOffered() ? ["today", "fields", "split", "year", "settings"] : ["today", "year", "settings"];
  return ids.map((id) => ({ id, label: byId[id].title, short: byId[id].short || byId[id].title, href: "#/" + id, icon: byId[id].icon }));
}
/** The contents column lists every view a friend can open. */
function railItems() {
  const ids = fieldsOffered() ? ["today", "fields", "split", "year", "money", "holdings", "rules", "settings"]
    : ["today", "year", "money", "holdings", "rules", "settings"];
  return ids.map((id) => ({ id, label: byId[id].title, href: "#/" + id, icon: byId[id].icon }));
}
const navIdOf = (id) => (byId[id] && byId[id].nav) || id;

function brandSub() {
  const words = app.plan ? amountWords() : "";
  return words ? words + (mixIsOwn() ? " · your mix" : "") : "Monthly";
}

function stillOn() { return S().settings.still === true; }
function nightOn() {
  const t = S().settings.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
function setStill(on) {
  book.applyStill(on);
  try { localStorage.setItem(STILL_KEY, on ? "1" : "0"); } catch { /* storage blocked */ }
  store.update((d) => { if (on) d.settings.still = true; else delete d.settings.still; });
}
function setNight(on) { store.update((d) => { d.settings.theme = on ? "dark" : "light"; }); }

function switches() {
  chrome.stillSw = book.switchRow({ label: book.FIXED.still, checked: stillOn(), onChange: (on) => { setStill(on); } });
  chrome.nightSw = book.switchRow({ label: book.FIXED.night, checked: nightOn(), onChange: (on) => { setNight(on); } });
  chrome.stillSw.setAttribute("data-fk", "rail-still");
  chrome.nightSw.setAttribute("data-fk", "rail-night");
  return [chrome.stillSw, chrome.nightSw];
}

/** The Still pictures and Night pages controls follow the saved settings (another control or tab changed them). */
function syncSwitches() {
  for (const [el, on] of [[chrome.stillSw, stillOn()], [chrome.nightSw, nightOn()], [chrome.pill, stillOn()]]) {
    if (el && el.bk && typeof el.bk.get === "function" && el.bk.get() !== on) el.bk.set(on);
  }
}

function swap(slot, next) {
  const cur = chrome[slot] || document.querySelector(`[data-${slot}]`);
  if (cur && cur.parentNode) cur.replaceWith(next);
  chrome[slot] = next;
}

/** The contents column, the top bar and the tab bar for the current stage and data. */
function buildChrome() {
  const brand = { name: "Tide Table", sub: brandSub(), href: app.plan ? "#/today" : undefined };
  const current = navIdOf(app.active);
  const rail = book.contentsColumn({ brand, items: app.plan ? railItems() : [], current, foot: switches() });
  rail.setAttribute("data-rail", "");
  swap("rail", rail);
  const pill = book.stillPill({ pressed: stillOn(), onChange: (on) => { setStill(on); } });
  pill.setAttribute("data-fk", "still-pill");
  chrome.pill = pill;
  const top = book.topBar({ brand, tools: pill });
  top.setAttribute("data-topbar", "");
  swap("topbar", top);
  const tabs = app.plan ? book.tabBar({ items: tabItems(), current }) : h("div", { hidden: true });
  tabs.setAttribute("data-tabbar", "");
  swap("tabbar", tabs);
  document.documentElement.dataset.tabs = app.plan ? String(tabItems().length) : "0";
}

function renderBrand() {
  const s = brandSub();
  for (const el of $$(".bk-brand-sub")) if (el.textContent !== s) el.textContent = s;
}

function setActiveNav(id) {
  const n = navIdOf(id);
  for (const k of ["rail", "tabbar"]) if (chrome[k] && chrome[k].bk && chrome[k].bk.setCurrent) chrome[k].bk.setCurrent(n);
}

function tickClock() {
  const el = $("[data-clock]");
  if (!el) return;
  const d = new Date(now());
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const day = dayShort(L.bkkDate(now()));
  if (el._t === t + day) return;
  el._t = t + day;
  clear(el).append(h("span.clock-day", day), h("span.clock-time.num", ` ${t}`), h("span.clock-tz", " Bangkok time"));
  el.setAttribute("aria-label", `Bangkok time ${day}, ${t}`);
}

function renderFresh() {
  const host = $("[data-fresh]");
  if (!host) return;
  const kids = [];
  const d = prices.data;
  // A plan that buys no coins asks CoinGecko nothing (spec 8.9), so there is no coin line to show.
  if (app.plan && prices.watchesCoins()) {
    let text;
    if (d.off) text = "Live prices off";
    else if (!d.cryptoAt) text = d.cryptoStatus === "error" ? "Coin prices offline" : "Loading coin prices";
    else text = "Coin prices " + ago(d.cryptoAt);
    kids.push(h("span.fresh-text", text));
    if (d.cryptoStatus === "error" && d.cryptoAt) kids.push(h("span.fresh-text", " · the last known ones"));
  }
  if (store.saveError || !store.available) kids.push(h("button.save.is-error", { type: "button", "data-fk": "save-error", title: String((store.saveError && store.saveError.message) || "Storage is blocked"), on: { click: () => hooks.go("settings") } }, "Not saved"));
  else if (saveUi.state === "saved" && Date.now() - saveUi.at < 8000) kids.push(h("span.save.is-saved", " · Saved in this browser"));
  clear(host).append(...kids);
}
hooks.renderFresh = () => { renderFresh(); setTimeout(renderFresh, 8200); };

// ---------------------------------------------------------------- an older copy, open in another tab

const OLDER_TEXT = "An older copy of Tide Table · Monthly, open in another tab, saved records after this update. Close that tab, then choose which records to keep.";

/** The banner under the top bar, on every view, while store.olderCopy is set (store.js checkLegacy). */
function renderOlder() {
  const host = $("[data-older]");
  if (!host) return;
  const raw = app.base ? store.olderCopy : null;
  if (!raw) {
    if (!host.hidden || host.childNodes.length) { host.hidden = true; clear(host); host._raw = null; }
    return;
  }
  if (host._raw === raw && !host.hidden) return; // drawn already: keep the focus where it is
  host._raw = raw;
  host.hidden = false;
  // data-fk "older-…", not the shorter "old-…": the leak check's rule M23 refuses that keep key's tail.
  const use = book.quietButton({ label: "Use the older tab's records", onClick: useOlder });
  use.setAttribute("data-fk", "older-use");
  const keep = book.quietButton({ label: "Keep these", onClick: keepThese });
  keep.setAttribute("data-fk", "older-keep");
  const b = book.banner({ state: "problem", content: OLDER_TEXT, actions: [use, keep] });
  b.setAttribute("role", "alert");
  b.classList.add("ttm-older");
  clear(host).append(b);
}

/** After the banner goes, the focus goes to the current view's heading (the button it was on is gone). */
function focusView() {
  const sec = app.active && sectionEl(app.active);
  const hd = sec && sec.querySelector("#h-" + app.active);
  const target = hd || $("#main");
  if (target) target.focus({ preventScroll: true });
}

function keepThese() {
  store.dismissOlder();
  toast("The records in this tab are kept", "info");
  focusView();
}

/** "Use the older tab's records": checked and loaded exactly like an imported file (Settings), after a confirm. */
async function useOlder() {
  const ok = await confirmDialog({
    title: "Use the older tab's records?",
    text: "The older tab's records replace these. Month amounts and a mix set since the update are not in them.",
    ok: "Use them", danger: true,
  });
  const raw = store.olderCopy; // the latest copy, if that tab saved again meanwhile
  if (!ok || !raw || !app.base) return;
  let doc = null;
  try { doc = JSON.parse(raw); } catch { /* refused below */ }
  const r = doc && typeof doc === "object" && !Array.isArray(doc) ? M.planOrNull(app.base, cleanPlan(doc.plan)) : { plan: null, error: null };
  const errs = validateImport(doc, r.plan, { base: app.base, error: r.error });
  if (errs.length) {
    modal({ title: "The older tab's records can't be used", lede: "Nothing was changed.", body: h("ul.err-list", errs.map((e) => h("li", e))),
      actions: [h("button.btn.btn-primary", { type: "submit" }, "OK")], onSubmit: () => true });
    return;
  }
  store.replace(withoutUnbought(doc, r.plan));
  store.dismissOlder();
  toast("The older tab's records are loaded", "success");
  focusView();
}

// ---------------------------------------------------------------- the footer

function renderFoot() {
  const f = $("[data-foot]");
  const plan = app.plan || app.base;
  if (!f || !plan) return;
  const m = plan.meta;
  const next = book.pageFoot({ lines: [
    m.disclaimer,
    `${m.sourceDoc}${app.plan ? "" : " (an example until you choose your amount)"} · dated ${long(m.docDate)} · Everything you enter stays in this browser.`,
    [!app.plan || prices.watchesCoins() ? [sourceLink(prices.SOURCES.crypto), " · "] : null, sourceLink(prices.SOURCES.fx), " · Stock and fund prices are the ones you type."],
  ] });
  next.setAttribute("data-foot", "");
  f.replaceWith(next);
}

function applyTheme(t) {
  const root = document.documentElement;
  const want = t === "dark" || t === "light" ? t : null;
  if (want) { if (root.dataset.theme !== want) root.dataset.theme = want; } else if (root.dataset.theme) delete root.dataset.theme;
  try { localStorage.setItem(THEME_KEY, t || "auto"); } catch { /* storage blocked */ }
}

function checkDayRollover() {
  const d = today();
  if (app.lastDay && d !== app.lastDay) invalidate("time");
  app.lastDay = d;
}

// ---------------------------------------------------------------- upcoming listings: their first trading day

/**
 * When the open data first shows the first trading day of an upcoming listing the friend ticked (its names
 * snapshot still waits, w.f null), save it once with months.setFirstTrade (upcoming-api.md 6): it then counts
 * from the first month after that day that the friend has not started, so no month with records changes and
 * no order marked placed changes. This save runs without asking, so it is checked first: a change that would
 * alter an order marked placed is not saved (setFirstTrade never makes one; this keeps it so).
 */
let syncing = false;
async function syncFirstTrade() {
  if (syncing || !app.plan || !universeOn()) return;
  const names = (S().plan && S().plan.fields && S().plan.fields.names) || {};
  const waiting = Object.entries(names).filter(([, n]) => n && n.w && !n.w.f);
  if (!waiting.length) return;
  syncing = true;
  try {
    const doc = await upcomingDoc();
    if (!doc) return;
    for (const [id, n] of waiting) {
      const e = doc.entries.find((x) => x && x.id === id);
      // only a listed entry on a US exchange has a first trading day to save (a date set before the listing would
      // count the row before it trades, and setFirstTrade keeps the first date it saves)
      const first = e ? FU.upcomingFirstTrade(e) : null;
      if (!first) continue;
      try {
        const mutator = (d) => M.setFirstTrade(d, app.base, { id, first });
        const cand = M.planChange(app.base, S(), mutator);
        const touched = M.placedChanged(S(), app.plan, cand.plan);
        if (touched.length) { console.warn("syncFirstTrade: not saved, it would change orders marked placed", touched); continue; }
        commitPlanChange(mutator);
        const saved = S().plan.fields.names[id];
        toast(firstTradeWords(n.n, first, saved && saved.w ? saved.w.s : null), "info", 6000);
      } catch (err) { console.warn(err); }
    }
  } finally {
    syncing = false;
  }
}

/** The note after a first trading day is saved: the order date it counts from (w.s), and why when that is
 *  later than the first order date after the day (the months in between are started). */
function firstTradeWords(name, first, s) {
  const dates = app.base.orderDates;
  const next = dates.find((x) => x.date > first);
  const from = dates.find((x) => x.id === s);
  const lead = `${name} trades since ${dayShort(first)}.`;
  if (!next) return `${lead} That is after this plan's last order date, so it gets no part of this plan.`;
  if (!from) return `${lead} The months that list it have records or orders you placed, so they stay as they are, and it gets no part of them.`;
  if (from.id === next.id) return `${lead} From the order date on ${dayShort(from.date)}, it gets its part of your field.`;
  return `${lead} The months you have started stay as they are, so it gets its part of your field from the order date on ${dayShort(from.date)}.`;
}

/** The app's version from this module's own version query (the build adds it); this code is 2.0 at least. */
function appVersion() {
  const v = new URL(import.meta.url).searchParams.get("v");
  return v && /^\d+\.\d+\.\d+$/.test(v) && D.compareVersions(v, "2.0.0") >= 0 ? v : "2.0.0";
}

// ---------------------------------------------------------------- start

async function init() {
  initNow();
  book.watchTab();
  book.mountDefs();
  store.load();
  applyTheme(S().settings.theme);
  book.applyStill(stillOn());
  prices.init();
  // The stale check counts days on the app's own clock (?now= shifts it, to look at a day).
  D.configure({ base: "data/", version: appVersion(), now: () => now() });
  configureFieldsUi();
  const indexP = D.loadIndex();
  try {
    // The same version query as this module's own URL (the build adds it), so a page gets one consistent set of files.
    const res = await fetch("data/base-plan.json" + new URL(import.meta.url).search, { cache: "no-cache" });
    if (!res.ok) throw new Error(`data/base-plan.json: HTTP ${res.status}`);
    app.base = await res.json();
  } catch (e) {
    console.warn(e);
    const boot = $("[data-boot]");
    if (boot) clear(boot).append(errorState("The plan could not be loaded. Check your connection and reload the page.", e));
    return;
  }
  app.data = await indexP;
  syncPlan();
  if (app.plan) prices.start(app.plan, pre().orderIds);
  app.lastDay = today();
  lastFieldsSig = JSON.stringify((S().plan && S().plan.fields) || null);
  document.documentElement.dataset.stage = app.plan ? "plan" : "setup";
  document.documentElement.dataset.data = app.data ? app.data.status : "missing";

  let lastTheme = S().settings.theme, lastStill = stillOn();
  store.subscribe((s) => {
    if (s.settings.theme !== lastTheme) { lastTheme = s.settings.theme; applyTheme(lastTheme); invalidate("theme"); syncSwitches(); }
    if (stillOn() !== lastStill) { lastStill = stillOn(); book.applyStill(lastStill); try { localStorage.setItem(STILL_KEY, lastStill ? "1" : "0"); } catch { /* blocked */ } syncSwitches(); invalidate("theme"); }
    renderFresh();
    renderOlder();
    if (syncPlan()) { onPlanChange(); return; }
    renderBrand();
    invalidate("state");
  });
  let lastFx = "", lastCrypto = "";
  prices.subscribe((d) => {
    const fx = `${d.fxStatus}|${d.fx ? d.fx.rate : ""}`;
    if (fx !== lastFx) { lastFx = fx; invalidate("fx"); if (app.active !== "setup") renderFoot(); }
    const cr = `${d.cryptoStatus}|${d.cryptoAt}`;
    if (cr !== lastCrypto) { lastCrypto = cr; invalidate("crypto"); }
    renderFresh();
  });

  buildChrome();
  renderFoot();
  tickClock();
  renderFresh();
  setInterval(tickClock, 1000);
  setInterval(() => { renderFresh(); checkDayRollover(); }, 15000);

  window.addEventListener("hashchange", () => route());
  const skip = $("a.bk-skip");
  if (skip) skip.addEventListener("click", skipToContent);
  document.addEventListener("visibilitychange", () => {
    document.documentElement.classList.toggle("tab-hidden", document.hidden);
    if (!document.hidden) checkDayRollover();
  });
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", () => { invalidate("theme"); syncSwitches(); });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => invalidate("theme"));

  const boot = $("[data-boot]");
  if (boot) boot.remove();
  renderOlder();
  route({ initial: true });
  syncFirstTrade();

  // QA and debugging handle (references to the shared modules; the friend's data stays in this browser).
  window.TTM = {
    store, scale, months: M, prices, app, logic: L, ui, now, today, invalidate, data: D, fieldsui: FU,
    get plan() { return app.plan; },
    render: (id) => renderView(id || app.active),
    go: (id) => hooks.go(id),
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
