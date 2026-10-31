// Tide Table · Monthly 2.1: the entry point. It loads the base plan (data/base-plan.json) and the open data's
// index (data/index.json, through datafiles.js), scales the plan to the friend's amounts, mix and fields
// (months.js, split.js), and owns the router (#/today, #/fields, #/field/<id>[/<company>], #/company/<id>,
// #/stocks, #/growth, #/split, #/year, #/money, #/holdings, #/rules, #/settings, #/setup, #/mix), the storybook frame
// (contents column, top bar, tab bar, footer; book.js), the Bangkok clock, price freshness, the older-tab banner,
// the theme and Still pictures. Views are in js/views/, shared helpers in js/core.js. Everything the friend enters
// stays in this browser (store.js).
//
// 2.1 (docs/tt2/ADDENDUM-2026-10-27b.md B, D): every friend's plan holds Anthropic locked at 10% of each month. This
// file adds the lock to a plan record that has none (months.lockMutator, a normal plan change that keeps every
// started month), reads the upcoming list's entry for it (lock.js loadLockEntry: data/upcoming.json when the site
// has it, else the bundled data/upcoming-curated.json) and saves its first trading day once the list shows it
// (docs/tt2/build/lock-api.md 4). The Stocks page (views/stocks.js) is a tab.
//
// 2.2 (docs/tt2/ADDENDUM-2026-10-27c.md D.3): the Growth page (views/growth.js, the tracker "on time, never sold") is a
// tab and a page of the contents column, with a short card on Today. With the open data the bar has seven tabs, so a
// phone folds it earlier than 2.1's bar of six (moreTab, css/growth.css): under GROWTH_FOLD_PX it keeps five tabs and
// "More", under 360 px four and "More". Coin history answers (prices.js) draw the pages that use them again. The page's
// section and its stylesheet (css/growth.css) are added here when index.html does not have them.

import {
  app, hooks, h, clear, ui, L, store, prices, $, $$, S, today, initNow, now, saveUi, errorState, modal, ago,
  sourceLink, M, amountWords, mixIsOwn, confirmDialog, toast, long, universeOn, hasFieldMonths,
  commitPlanChange, dayShort, pre, bkkTime,
} from "./core.js?v=2.2.0";
import * as scale from "./scale.js?v=2.2.0";
import * as book from "./book.js?v=2.2.0";
import * as D from "./datafiles.js?v=2.2.0";
import * as FU from "./fieldsui.js?v=2.2.0";
import { fieldName, isFieldId } from "./fields-catalog.js?v=2.2.0";
import { THEME_KEY, STILL_KEY, cleanPlan, validateImport, withoutUnbought } from "./store.js?v=2.2.0";
import * as LK from "./lock.js?v=2.2.0";
import { renderSetup } from "./views/setup.js?v=2.2.0";
import { renderToday, stopTodayTicker } from "./views/today.js?v=2.2.0";
import { renderYear } from "./views/year.js?v=2.2.0";
import { renderMoney } from "./views/money.js?v=2.2.0";
import { renderHoldings } from "./views/holdings.js?v=2.2.0";
import { renderRules } from "./views/rules.js?v=2.2.0";
import { renderSettings } from "./views/settings.js?v=2.2.0";
import { renderMix } from "./views/mix.js?v=2.2.0";
import { renderFields, configureFieldsUi, upcomingDoc } from "./views/fields.js?v=2.2.0";
import { renderField } from "./views/field.js?v=2.2.0";
import { renderCompany } from "./views/company.js?v=2.2.0";
import { renderSplit } from "./views/split.js?v=2.2.0";
import { renderStocks } from "./views/stocks.js?v=2.2.0";
import { renderGrowth, growthNow } from "./views/growth.js?v=2.2.0";
import { resetDraft } from "./views/draft.js?v=2.2.0";
import { markHead, withColophon, unmountHero } from "./views/almanac.js?v=2.2.0";

const BASE_TITLE = "Tide Table · Monthly";
const VIEWS = [
  { id: "today", title: "Today", icon: "today", deps: ["state", "crypto", "fx", "time", "theme", "data", "lock", "history"], render: renderToday,
    onHide: () => { stopTodayTicker(); unmountHero(); } },
  { id: "fields", title: "Fields", icon: "fields", deps: ["data"], render: renderFields, fields: true },
  { id: "field", title: "A field", icon: "fields", deps: ["data"], render: renderField, fields: true, nav: "fields", group: "hidden" },
  { id: "company", title: "A company", icon: "fields", deps: ["data"], render: renderCompany, fields: true, nav: "fields", group: "hidden" },
  { id: "stocks", title: "Stocks", icon: "market", deps: ["state", "data", "time", "lock"], render: renderStocks },
  { id: "growth", title: "Growth", icon: "growth", deps: ["state", "crypto", "fx", "time", "lock", "history"], render: renderGrowth },
  { id: "split", title: "My split", short: "Split", icon: "split", deps: ["state", "data", "fx", "lock"], render: renderSplit, fields: true },
  { id: "year", title: "My year", short: "Year", icon: "year", deps: ["state", "time", "data", "lock"], render: renderYear },
  { id: "money", title: "Money", icon: "funding", deps: ["state", "fx", "time", "lock"], render: renderMoney },
  { id: "holdings", title: "Holdings", icon: "portfolio", deps: ["state", "crypto", "theme", "lock"], render: renderHoldings },
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
  // months.planKey: core.planKeyOf's parts and the lock (lock-api.md 4.1), so adding the lock or saving its first
  // trading day works the plan out again at once
  const key = M.planKey(p);
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
  syncLockTrade();
}

// ---------------------------------------------------------------- rendering

function invalidate(dep) {
  for (const v of VIEWS) if (v.deps.includes(dep)) dirty.add(v.id);
  queueRender();
}
let renderQueued = false;
let waitsFor = null; // the field being typed in that a redraw waits for (see queueRender)
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    if (!app.active || !dirty.has(app.active)) return;
    // A price still being typed on the order desk (views/today.js marks it data-edited) is never drawn away under the
    // friend's fingers: the browser would save the half-typed number as the field left the page (review finding
    // RR-01). The view is drawn once the field is left, which saves what it holds.
    const ae = document.activeElement;
    const sec = sectionEl(app.active);
    if (ae && ae.dataset && ae.dataset.edited && sec && sec.contains(ae)) {
      if (waitsFor !== ae) { waitsFor = ae; ae.addEventListener("blur", () => { waitsFor = null; queueRender(); }, { once: true }); }
      return;
    }
    renderView(app.active);
  }, 30);
}

function teardown(id) {
  for (const fn of app.cleanup[id] || []) { try { fn(); } catch { /* ignore */ } }
  app.cleanup[id] = [];
  app.after[id] = [];
}

// Each view section's height as last laid out (a ResizeObserver, so reading it forces nothing). A redraw keeps it as
// the section's min-height while the view is drawn again. Reading offsetHeight there laid the old view out only to
// clear it: about 90 ms at 4x CPU on a phone when coin data redrew Today at start-up (brief F9).
const viewHeights = new WeakMap();
const heightWatch = typeof ResizeObserver === "function" ? new ResizeObserver((es) => {
  for (const e of es) {
    const b = e.borderBoxSize && (e.borderBoxSize[0] || e.borderBoxSize);
    viewHeights.set(e.target, b ? b.blockSize : e.contentRect.height);
  }
}) : null;

function renderView(id, { entering = false, focusHead = false } = {}) {
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
  el.style.minHeight = (heightWatch ? viewHeights.get(el) || 0 : el.offsetHeight) + "px";

  teardown(id);
  // Today's hero box stays on the page while the view is drawn again (views/almanac.js keeps it): taken off and put
  // back, its canvas's thaw was cut to a one-frame pop when coin prices drew Today again (book.css transitions; style
  // brief 3.1)
  const kept = keptHero(el);
  if (kept) { while (kept.nextSibling) kept.nextSibling.remove(); } else clear(el);
  // An opening plays when a view opens, not each time it is drawn again (prices, a save, the clock).
  el.classList.toggle("is-settled", !entering);
  app.renderingId = id;
  app.entering = entering;
  try {
    if (id !== "setup" && !app.plan) throw new Error("No plan yet");
    const out = v.render(el);
    let nodes = out ? [].concat(out).filter(Boolean) : [];
    if (kept) { if (nodes[0] === kept) nodes = nodes.slice(1); else kept.remove(); }
    putView(el, id, nodes, focusHead || headFocused);
  } catch (e) {
    console.warn(e);
    if (kept && kept.isConnected) kept.remove();
    el.append(errorState("This page hit a problem. The rest of Tide Table still works.", e));
  }
  app.entering = false;

  $$(".rise", el).forEach((c, i) => c.style.setProperty("--i", Math.min(i, 14)));
  // The almanac: the page's zodiac glyph before its heading's words and its Folio kicker over it, by its fixed place in
  // the contents; the glyph steps to its sign on the page's first opening in a session (views/almanac.js)
  markHead(id, el, { entering });
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
    if (hd && hd !== document.activeElement) hd.focus({ preventScroll: true });
  }
  app.renderingId = null;
  setTimeout(() => { el.style.minHeight = ""; }, 80);
}

/**
 * Put a view's nodes in place. When its heading is to have the focus (route() opens the view, or a redraw of a view
 * whose heading had it), the heading takes it as soon as it is on the page, and the rest of the view follows: focus()
 * works out the page's style and layout at once, so with the whole new view in place it put all of them in the
 * drawing's task, a long task on a slow phone (brief F9, the qa_growth.py G14 method). Now they come with the next
 * frame, and the focus still moves in this task. A view whose heading is not one of its nodes is put in place whole.
 */
function putView(el, id, nodes, focusHead) {
  const k = focusHead ? nodes.findIndex((n) => n.id === "h-" + id || (n.querySelector && n.querySelector("#h-" + id))) : -1;
  if (k < 0) { el.append(...nodes); return; }
  el.append(...nodes.slice(0, k + 1));
  const hd = el.querySelector("#h-" + id);
  if (!hd.hasAttribute("tabindex")) hd.setAttribute("tabindex", "-1");
  hd.focus({ preventScroll: true });
  el.append(...nodes.slice(k + 1));
}

/** Today's hero box, when it heads the section (book.heroBox, kept by views/almanac.js): it stays through a redraw. */
function keptHero(el) {
  const f = el.firstChild;
  return f && f.nodeType === 1 && f.hasAttribute("data-hero") ? f : null;
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

// ---------------------------------------------------------------- the frost veil (2.2; style brief 3.0)

let veiled = null;
/** Name a view's opening heading for the frost veil (book.css vt-head), one at a time: the heading itself, never its
 *  header, which may hold a button or a figure; and only when no figure or control is within the calm zone round it
 *  (F2), so a view whose heading sits by a figure simply switches. */
function veilHead(id) {
  if (veiled) { veiled.style.viewTransitionName = ""; veiled = null; }
  const sec = id && sectionEl(id);
  const hd = sec && (sec.querySelector("#h-" + id) || sec.querySelector("h1, h2"));
  if (hd && calmAround(hd, sec)) { hd.style.viewTransitionName = "vt-head"; veiled = hd; }
}
/** Lay a view out now (reading one box forces the page's style and layout), so the next task's measures are cheap. */
function layOut(id) {
  const sec = id && sectionEl(id);
  if (sec) sec.getBoundingClientRect();
}
// The calm zone (style brief F2): a figure (a currency sign before digits, a percentage, an amount in USD or THB) or a
// control within 24 px (32 px from 760 px) of the heading, plus the 6 px the new one rises, keeps that heading still.
const VEIL_FIGURE = /[$฿€£¥]\s?[\d.,]*\d|\d[\d,.]*\s?%|\d[\d,.]*\s?(?:USD|THB)\b/;
const VEIL_CONTROL = "button, input, select, textarea, summary, a.bk-btn, [role='button'], [role='switch'], [role='slider']";
function calmAround(hd, sec) {
  const r = hd.getBoundingClientRect();
  if (!r.height) return false;
  const gap = (innerWidth >= 760 ? 32 : 24) + 6;
  for (const el of sec.querySelectorAll("*")) {
    if (hd.contains(el) || el.contains(hd)) continue;
    const q = el.getBoundingClientRect();
    if (!q.height || q.bottom < r.top - gap || q.top > r.bottom + gap) continue;
    if (Math.hypot(Math.max(0, q.left - r.right, r.left - q.right), Math.max(0, q.top - r.bottom, r.top - q.bottom)) >= gap) continue;
    if (el.matches(VEIL_CONTROL)) return false;
    let own = "";
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.data;
    if (VEIL_FIGURE.test(own)) return false;
  }
  return true;
}
/** The veil runs only where the browser has view transitions and nothing stops motion (Still pictures, a hidden tab,
 *  reduced motion): otherwise the view simply switches, as before. */
const canVeil = () => typeof document.startViewTransition === "function" && !book.motionStopped();

/**
 * Open the view the hash asks for. A change of view (or of a field or company page) goes behind the frost veil: the
 * page swaps at once, every figure and button with it, and only the opening heading clears and settles (book.css).
 * The view is drawn inside the transition's callback, from the hash as it is then.
 */
function route(opts = {}) {
  const r = currentRoute();
  const prev = app.active;
  const changes = !!prev && (prev !== r.view || r.key !== app.routeKey);
  if (!opts.initial && changes && canVeil()) {
    veilHead(prev);
    try {
      // The new heading's calm zone is measured in tasks of its own, still before the new state is captured (the
      // transition waits for the promise): one task lays the new view out, the next measures round its heading.
      // Measuring in the drawing's task would force the whole view's style and layout into it (style brief F9:
      // 166 ms at 4x CPU going back to the friends' Today).
      const vt = document.startViewTransition(() => {
        routeNow(opts);
        return new Promise((done) => setTimeout(() => {
          layOut(app.active);
          setTimeout(() => { veilHead(app.active); done(); }, 0);
        }, 0));
      });
      for (const p of [vt.ready, vt.finished, vt.updateCallbackDone]) if (p && p.catch) p.catch(() => { /* skipped: the view is drawn all the same */ });
      return;
    } catch (e) {
      console.warn(e);
    }
  }
  routeNow(opts);
}

function routeNow({ initial = false, force = false, focus = !initial } = {}) {
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
  // the view's heading takes the focus as soon as it is on the page (putView), before the rest of the view
  renderView(id, { entering: moved || initial, focusHead: !!(focus && (moved || force)) });
  const title = viewTitle(id, r);
  document.title = id === "today" || id === "setup" ? BASE_TITLE : `${title} · ${BASE_TITLE}`;
  setActiveNav(id);
  if (focus && (moved || force)) {
    window.scrollTo(0, 0);
    const hd = el.querySelector("#h-" + id) || el.querySelector("h1, h2");
    if (hd && hd === document.activeElement) { /* focused already, by putView */ }
    else if (hd) { if (!hd.hasAttribute("tabindex")) hd.setAttribute("tabindex", "-1"); hd.focus({ preventScroll: true }); }
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

/**
 * The tabs (brief G10, spec 8.2, addendum b.D.1, c.D.3): every tab labelled. With the open data's list, Today · Fields
 * · Stocks · Growth · My split · My year · Settings; else Today · Stocks · Growth · My year · Settings. On a phone a
 * full bar uses the short words (Split, Year) and a narrower picture (friends.css, growth.css). A bar of seven keeps
 * its first five tabs and "More" under GROWTH_FOLD_PX, and every bar of more than five its first four and "More"
 * under 360 px (moreTab), so each word stays on one line.
 */
function tabItems() {
  const ids = fieldsOffered() ? ["today", "fields", "stocks", "growth", "split", "year", "settings"] : ["today", "stocks", "growth", "year", "settings"];
  return ids.map((id) => ({ id, label: byId[id].title, short: byId[id].short || byId[id].title, href: "#/" + id, icon: byId[id].icon }));
}
/** The contents column lists every view a friend can open. */
function railItems() {
  const ids = fieldsOffered() ? ["today", "fields", "stocks", "growth", "split", "year", "money", "holdings", "rules", "settings"]
    : ["today", "stocks", "growth", "year", "money", "holdings", "rules", "settings"];
  return ids.map((id) => ({ id, label: byId[id].title, href: "#/" + id, icon: byId[id].icon }));
}
const navIdOf = (id) => (byId[id] && byId[id].nav) || id;

/** The tabs a full bar shows on the narrowest phones (under 360 px, friends.css); the rest are under "More". */
const TABS_NARROW = 4;
/** The tabs a bar of seven shows from 360 px to GROWTH_FOLD_PX (growth.css); the rest are under "More". */
const TABS_SEVEN = 5;
/** The width under which a bar of seven folds (growth.css says the same in its media query). */
const GROWTH_FOLD_PX = 480;
/**
 * A bar of more than five tabs: the tabs after the fourth get .ttm-tab-fold and, in a bar of seven, the tabs after
 * the fifth also .ttm-tab-fold7; a "More" button (.ttm-tab-more) opens a sheet with the folded tabs and every other
 * page of the contents column. friends.css shows the button and hides .ttm-tab-fold under 360 px; growth.css shows it
 * and hides .ttm-tab-fold7 in a bar of seven under GROWTH_FOLD_PX, so wider phones keep every tab in the bar. Today
 * is always first and never folded.
 */
function moreTab(tabs, items) {
  if (items.length <= 5) return;
  items.forEach((x, k) => {
    const a = tabs.querySelector(`a.bk-tab[data-view="${CSS.escape(x.id)}"]`);
    if (!a) return;
    if (k >= TABS_NARROW) a.classList.add("ttm-tab-fold");
    if (items.length >= 7 && k >= TABS_SEVEN) a.classList.add("ttm-tab-fold7");
  });
  const more = h("button.bk-tab.ttm-tab-more", { type: "button", "aria-haspopup": "dialog", "data-fk": "tab-more", on: { click: () => openMore(items) } },
    h("span.bk-tab-icon", book.lineIcon("more")), h("span.bk-tab-long", "More"));
  tabs.append(more);
  chrome.more = more;
  chrome.moreIds = new Set(items.slice(0, TABS_NARROW).map((x) => x.id));
  chrome.moreIds7 = new Set(items.slice(0, TABS_SEVEN).map((x) => x.id));
}

/** The tabs the bar shows at this width (a folded tab is display: none). */
function shownTabIds(items) {
  const bar = chrome.tabbar;
  const out = new Set();
  for (const x of items) {
    const a = bar && bar.querySelector(`a.bk-tab[data-view="${CSS.escape(x.id)}"]`);
    if (a && getComputedStyle(a).display !== "none") out.add(x.id);
  }
  return out.size ? out : new Set(items.slice(0, TABS_NARROW).map((x) => x.id));
}

/** The sheet behind "More": the folded tabs, then the other pages of the contents column, each one link. */
function openMore(items) {
  const shown = shownTabIds(items);
  const rest = railItems().filter((x) => !shown.has(x.id));
  const m = modal({
    title: "More", cls: ".sheet.ttm-more",
    body: h("ul.bk-list.ttm-more-pages", rest.map((x) => h("li", h("a", {
      href: x.href, "data-fk": "more-" + x.id, "aria-current": navIdOf(app.active) === x.id ? "page" : null,
      on: { click: (e) => { e.preventDefault(); m.keepFocus(); m.close(); setTimeout(() => hooks.go(x.id), 0); } },
    }, book.lineIcon(x.icon || "info"), h("span", x.label))))),
  });
}

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
  const items = app.plan ? tabItems() : [];
  const tabs = app.plan ? book.tabBar({ items, current }) : h("div", { hidden: true });
  chrome.more = null;
  if (app.plan) moreTab(tabs, items);
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
  // "More" is the current tab on the narrowest phones when the page is one of its own (friends.css shows it there);
  // in a bar of seven, under GROWTH_FOLD_PX, when the page is not one of its first five (growth.css)
  if (chrome.more) {
    chrome.more.classList.toggle("is-current", !chrome.moreIds.has(n));
    chrome.more.classList.toggle("is-current7", !(chrome.moreIds7 || chrome.moreIds).has(n));
  }
}

// ---------------------------------------------------------------- the observatory line (2.2; style brief 3.1)
// The status strip as an instrument line under the top bar (book.css .bk-obs): Cinzel labels and Plex figures, an
// engraved + between the readings. Only facts the app has: the Bangkok clock, the coin prices' age, the day the open
// data was rebuilt, and whether the records are saved. It changes once a minute at most, and nothing in it moves.

/** One reading of the line: a label, then its figure or its words. */
const obsItem = (label, fig, word, cls = "") => h(`span.bk-obs-item${cls}`, label ? h("span.bk-obs-label", label) : null,
  label && (fig || word) ? " " : null, fig ? h("span.bk-obs-fig", fig) : null, fig && word ? " " : null, word ? h("span.bk-obs-word", word) : null);

function tickClock() {
  const el = $("[data-clock]");
  if (!el) return;
  const d = new Date(now());
  const t = bkkTime(d.getTime());
  const day = dayShort(L.bkkDate(now()));
  if (el._t === t + day) return;
  el._t = t + day;
  el.classList.add("bk-obs-item");
  clear(el).append(h("span.bk-obs-label", "Bangkok"), " ", h("span.bk-obs-fig", `${day} ${t}`));
  el.setAttribute("aria-label", `Bangkok time ${day}, ${t}`);
}

function renderFresh() {
  const host = $("[data-fresh]");
  if (!host) return;
  const kids = [];
  const d = prices.data;
  // A plan that buys no coins asks CoinGecko nothing (spec 8.9), so there is no coin line to show.
  if (app.plan && prices.watchesCoins()) {
    if (d.off) kids.push(obsItem("Live prices", null, "off"));
    else if (!d.cryptoAt) kids.push(obsItem("Coin prices", null, d.cryptoStatus === "error" ? "offline" : "loading"));
    else {
      // an age is a figure with its unit ("5 min") in Plex, and "ago" a word; "just now" stays all words (addendum
      // d.B.2: Plex for figures only)
      const a = ago(d.cryptoAt), err = d.cryptoStatus === "error" ? "· the last known ones" : null, m = /^(.*\d.*?) ago$/.exec(a);
      kids.push(m ? obsItem("Coin prices", m[1], err ? `ago ${err}` : "ago")
        : /\d/.test(a) ? obsItem("Coin prices", a, err) : obsItem("Coin prices", null, err ? `${a} ${err}` : a));
    }
  }
  // the day the open data was rebuilt, when the site has it (data/index.json)
  const facts = app.data && app.data.status === "ok" && app.data.index ? FU.bangkokParts(app.data.index.asOf) : null;
  if (facts) kids.push(obsItem("Facts", `${dayShort(facts.date)} ${facts.time}`, null, ".is-facts"));
  if (store.saveError || !store.available) kids.push(h("span.bk-obs-item", h("button.save.is-error", { type: "button", "data-fk": "save-error", title: String((store.saveError && store.saveError.message) || "Storage is blocked"), on: { click: () => hooks.go("settings") } }, "Not saved")));
  else if (saveUi.state === "saved" && Date.now() - saveUi.at < 8000) kids.push(obsItem(null, null, "Saved in this browser", ".save.is-saved"));
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
  // The almanac: the colophon in a cell of its own beside the fixed disclaimer, the other lines under it (views/almanac.js)
  withColophon(next);
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

// ---------------------------------------------------------------- the locked 10% (lock-api.md 4)

let lockTried = null;
/**
 * Add the locked 10% to a plan record that has none (lock-api.md 4.2): a 2.0 state, an import, "Start over" or
 * another tab's 2.0 save. It is a normal plan change (months.lockMutator through commitPlanChange): every month the
 * friend has started keeps its orders, and an order marked placed never changes. A refusal (said in the console) is
 * not tried again until the record changes; a save forgets the record, so a later save that drops the lock again (an
 * older tab's quiet re-migration, a 2.0 tab) gets it back even when that record is the same as before. It is saved
 * as the app's own change (auto), so it does not count as the friend having saved here. True when it was saved.
 */
function ensureLock() {
  if (!app.base || !M.needsLock(S())) return false;
  const key = M.planKey(S().plan);
  if (lockTried === key) return false;
  lockTried = key;
  const m = M.lockMutator(app.base, S(), { today: today() });
  if (!m) return false;
  try {
    commitPlanChange(m, { auto: true });
    const done = !M.needsLock(S());
    if (done) lockTried = null;
    return done;
  } catch (e) {
    console.warn("The locked 10% could not be added to this plan", e);
    return false;
  }
}

/** The upcoming list's entry for the locked listing, for the views (app.lockEntry); they draw again when it changes. */
async function loadLock() {
  const { entry } = await LK.loadLockEntry({ live: universeOn() ? upcomingDoc : null });
  const changed = JSON.stringify(entry || null) !== JSON.stringify(app.lockEntry || null);
  app.lockEntry = entry || null;
  if (changed) invalidate("lock");
  return app.lockEntry;
}

/**
 * Save the locked listing's first trading day once the list shows it (lock-api.md 4.3, like syncFirstTrade): set
 * once, never moved, and only when it changes no order marked placed. From the first month after that day that the
 * friend has not started, its 10% is an order of its own.
 */
let lockSyncing = false;
async function syncLockTrade() {
  if (lockSyncing || !app.base) return;
  lockSyncing = true;
  try {
    const entry = await loadLock();
    if (!app.plan || !entry) return;
    const m = M.lockMutator(app.base, S(), { today: today(), entry });
    if (!m) return;
    const cand = M.planChange(app.base, S(), m);
    const touched = M.placedChanged(S(), app.plan, cand.plan);
    if (touched.length) { console.warn("syncLockTrade: not saved, it would change orders marked placed", touched); return; }
    commitPlanChange(m, { auto: true });
    const L = LK.lockOf(app.plan);
    if (L && L.first) toast(lockTradeWords(L), "info", 6000);
  } catch (err) {
    console.warn(err);
  } finally {
    lockSyncing = false;
  }
}

/** The note after the first trading day is saved: from which order date its 10% is an order of its own. */
function lockTradeWords(L) {
  const name = L.name || LK.LOCK_NAME;
  const from = app.base.orderDates.find((x) => x.id === L.start);
  const lead = `${name} trades since ${dayShort(L.first)}.`;
  return from
    ? `${lead} From the order date on ${dayShort(from.date)}, its 10% of each month is an order of its own.`
    : `${lead} That is after the months this plan has left, so its 10% stays with VWRA.`;
}

// ---------------------------------------------------------------- 2.2: the Growth page's section and styles

/** A section for every view, in main, for a page whose index.html has none for it yet (the Growth page, 2.2). */
function ensureSections() {
  const main = $("#main");
  if (!main) return;
  const boot = main.querySelector("[data-boot]");
  for (const v of VIEWS) {
    if (sectionEl(v.id)) continue;
    const sec = h("section", { "data-view": v.id, hidden: true });
    if (boot) main.insertBefore(sec, boot); else main.append(sec);
  }
}

/**
 * The Growth page's stylesheet (css/growth.css: its figures, chart and table, Today's card, and the fold of a bar of
 * seven tabs), with this module's own version query, linked once after the page's own stylesheets when index.html
 * does not link it. Resolves when it has loaded, failed, or after 2 s, so the frame is drawn with it where it can be.
 */
function growthStyles() {
  if (document.querySelector('link[rel="stylesheet"][href*="css/growth.css"]')) return Promise.resolve();
  const href = new URL("../css/growth.css", import.meta.url);
  href.search = new URL(import.meta.url).search;
  const link = h("link", { rel: "stylesheet", href: href.href, "data-growth-css": "" });
  return new Promise((resolve) => {
    const done = () => resolve();
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
    setTimeout(done, 2000);
    document.head.append(link);
  });
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
  ensureSections();
  if (heightWatch) for (const sec of $$("main [data-view]")) heightWatch.observe(sec);
  const stylesP = growthStyles();
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
  await stylesP;
  // The lock before the first render, so the friend never sees the plan without it (lock-api.md 4.2), and the
  // upcoming entry, so its first lines carry their dates.
  ensureLock();
  try { await loadLock(); } catch (e) { console.warn(e); }
  syncPlan();
  if (app.plan) prices.start(app.plan, pre().orderIds);
  app.lastDay = today();
  lastFieldsSig = JSON.stringify((S().plan && S().plan.fields) || null);
  document.documentElement.dataset.stage = app.plan ? "plan" : "setup";
  document.documentElement.dataset.data = app.data ? app.data.status : "missing";

  let lastTheme = S().settings.theme, lastStill = stillOn();
  store.subscribe((s) => {
    // A plan record without the lock (setup, an import, Start over, another tab's 2.0 save) gets it first; that
    // change comes back here and draws the page.
    if (ensureLock()) return;
    if (s.settings.theme !== lastTheme) { lastTheme = s.settings.theme; applyTheme(lastTheme); invalidate("theme"); syncSwitches(); }
    if (stillOn() !== lastStill) { lastStill = stillOn(); book.applyStill(lastStill); try { localStorage.setItem(STILL_KEY, lastStill ? "1" : "0"); } catch { /* blocked */ } syncSwitches(); invalidate("theme"); }
    renderFresh();
    renderOlder();
    if (syncPlan()) { onPlanChange(); return; }
    renderBrand();
    invalidate("state");
  });
  let lastFx = "", lastCrypto = "", lastHistory = "";
  prices.subscribe((d) => {
    const fx = `${d.fxStatus}|${d.fx ? d.fx.rate : ""}`;
    if (fx !== lastFx) { lastFx = fx; invalidate("fx"); if (app.active !== "setup") renderFoot(); }
    const cr = `${d.cryptoStatus}|${d.cryptoAt}`;
    if (cr !== lastCrypto) { lastCrypto = cr; invalidate("crypto"); }
    // 2.2: a coin's price on an order date came (or its history failed): the pages that show growth draw again, once
    // for each batch of answers (one comes every 12 s, and drawing Today again for each took the order desk from under
    // the friend; review finding RR-01) and when the history stops or starts answering
    const hi = `${d.history.waiting ? "wait" : d.history.v}|${d.history.status}`;
    if (hi !== lastHistory) { lastHistory = hi; invalidate("history"); }
    renderFresh();
  });

  buildChrome();
  renderFoot();
  // the status strip is the observatory line (book.css .bk-obs)
  const strip = $(".ttm-strip");
  if (strip) strip.classList.add("bk-obs");
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
  syncLockTrade();

  // QA and debugging handle (references to the shared modules; the friend's data stays in this browser).
  window.TTM = {
    store, scale, months: M, prices, app, logic: L, ui, now, today, invalidate, data: D, fieldsui: FU, lock: LK,
    get plan() { return app.plan; },
    get lockEntry() { return app.lockEntry || null; },
    // 2.2: the growth tracker's figures as the pages show them, and the width under which a bar of seven folds
    growth: () => growthNow(),
    growthFoldPx: GROWTH_FOLD_PX,
    render: (id) => renderView(id || app.active),
    go: (id) => hooks.go(id),
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
