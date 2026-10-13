// Tide Table · Monthly: the entry point. It loads the base plan (data/base-plan.json), scales it to the
// friend's monthly amount (scale.js), and owns the router (#/today, #/year, #/money, #/holdings,
// #/rules, #/settings, #/setup), the page chrome (rail, phone tab bar and More sheet, Bangkok clock,
// price freshness, footer) and the theme. Views are in js/views/, shared helpers in js/core.js.
// Everything the friend enters stays in this browser (store.js).

import {
  app, hooks, h, clear, icon, ui, L, store, prices, $, $$, S, today, initNow, now, schedule, autoDeskDate,
  inDays, long, fM, saveUi, errorState, modal, ago, sourceLink, progressNow,
} from "./core.js";
import * as scale from "./scale.js";
import { THEME_KEY } from "./store.js";
import { renderSetup } from "./views/setup.js";
import { renderToday, stopTodayTicker } from "./views/today.js";
import { renderYear } from "./views/year.js";
import { renderMoney } from "./views/money.js";
import { renderHoldings } from "./views/holdings.js";
import { renderRules } from "./views/rules.js";
import { renderSettings } from "./views/settings.js";

const BASE_TITLE = "Tide Table · Monthly";
const VIEWS = [
  { id: "today", title: "Today", icon: "today", deps: ["state", "crypto", "fx", "time", "theme"], render: renderToday, onHide: stopTodayTicker },
  { id: "year", title: "Year", icon: "calendar", deps: ["state", "time"], render: renderYear },
  { id: "money", title: "Money", icon: "funding", deps: ["state", "fx", "time"], render: renderMoney },
  { id: "holdings", title: "Holdings", icon: "portfolio", deps: ["state", "crypto", "theme"], render: renderHoldings },
  { id: "rules", title: "Rules", icon: "rules", deps: ["state", "time"], render: renderRules },
  { id: "settings", title: "Settings", icon: "settings", group: "system", deps: ["state", "crypto", "fx"], render: renderSettings },
  { id: "setup", title: "Your amount", icon: "funding", group: "hidden", deps: ["fx"], render: renderSetup },
];
const byId = Object.fromEntries(VIEWS.map((v) => [v.id, v]));
const TAB_IDS = ["today", "year", "money", "holdings"];
const dirty = new Set();
const sectionEl = (id) => document.querySelector(`main [data-view="${id}"]`);

// ---------------------------------------------------------------- the plan at the friend's amount

/** Scale the base plan to the saved amount when that amount changed; true when app.plan changed. */
function syncPlan() {
  const p = S().plan;
  const key = p ? JSON.stringify([p.monthlyUsd, p.input]) : "";
  if (key === app.planKey) return false;
  app.planKey = key;
  app.planError = null;
  app.plan = null;
  if (p) {
    const i = p.input || {};
    try {
      app.plan = scale.scalePlan(app.base, p.monthlyUsd, { input: { currency: i.currency, amount: i.amount, rate: i.rate, rateSource: i.rateSource, rateDate: i.rateDate } });
    } catch {
      // The amount as typed no longer matches its dollars (a hand-edited file): keep the dollars.
      try { app.plan = scale.scalePlan(app.base, p.monthlyUsd); } catch (e) { app.planError = e; }
    }
  }
  app.instMap = app.plan ? Object.fromEntries(app.plan.instruments.map((x) => [x.id, x])) : {};
  return true;
}

function onPlanChange() {
  for (const v of VIEWS) dirty.add(v.id);
  if (app.plan) prices.start(app.plan);
  document.documentElement.dataset.stage = app.plan ? "plan" : "setup";
  buildNav();
  renderBrand();
  renderRailStatus();
  renderFoot();
  renderFresh(); // the price chip: the store change that brought the plan rendered it while there was none
  route({ force: true, focus: true });
}

// ---------------------------------------------------------------- rendering

function invalidate(dep) {
  for (const v of VIEWS) if (v.deps.includes(dep)) dirty.add(v.id);
  queueRender();
  renderRailStatus();
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
  if (entering && !ui.reducedMotion()) {
    el.classList.remove("is-entering");
    void el.offsetWidth;
    el.classList.add("is-entering");
    clearTimeout(el._enterT);
    el._enterT = setTimeout(() => el.classList.remove("is-entering"), 1300);
  }
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

function currentRoute() {
  if (!app.plan) return "setup";
  const hash = location.hash || "";
  const m = /^#\/([\w-]+)/.exec(hash);
  // An in-page anchor (e.g. "#main") is not a route: stay on the current view.
  if (!m && hash && hash !== "#" && hash !== "#/") return app.active && app.active !== "setup" ? app.active : "today";
  const id = m && m[1];
  return id && byId[id] ? id : "today";
}

function route({ initial = false, force = false, focus = !initial } = {}) {
  const id = currentRoute();
  const prev = app.active;
  if (prev === id && !initial && !force) return;
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
  const v = byId[id];
  const el = sectionEl(id);
  el.setAttribute("aria-labelledby", "h-" + id);
  el.classList.add("view", "view-" + id);
  renderView(id, { entering: prev !== id || initial });
  const t = $("[data-view-title]");
  if (t) t.textContent = id === "setup" ? BASE_TITLE : v.title;
  document.title = id === "today" || id === "setup" ? BASE_TITLE : `${v.title} · ${BASE_TITLE}`;
  setActiveNav(id);
  if (focus) {
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

/** "Skip to content" moves focus to the current view's heading without changing the route. */
function skipToContent(e) {
  e.preventDefault();
  const sec = app.active && sectionEl(app.active);
  const hd = sec && (sec.querySelector("#h-" + app.active) || sec.querySelector("h1, h2"));
  if (hd && !hd.hasAttribute("tabindex")) hd.setAttribute("tabindex", "-1");
  const target = hd || $("#main");
  if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: "start" }); }
}

// ---------------------------------------------------------------- chrome

function navLink(v, cls = "nav-link") {
  return h(`a.${cls}`, { href: "#/" + v.id, "data-route": v.id }, icon(v.icon), h("span.nav-label", v.title));
}

function buildNav() {
  const rail = $('[data-nav="rail"]');
  const tab = $('[data-nav="tabbar"]');
  if (rail) clear(rail);
  if (tab) clear(tab);
  if (!app.plan) return; // setup: no navigation until there is a plan
  const core = VIEWS.filter((v) => !v.group);
  const sys = VIEWS.filter((v) => v.group === "system");
  if (rail) rail.append(h("p.nav-group", "Your plan"), h("ul.nav-list", core.map((v) => h("li", navLink(v)))), h("ul.nav-list.nav-sys", sys.map((v) => h("li", navLink(v)))));
  if (tab) {
    for (const id of TAB_IDS) tab.append(navLink(byId[id], "tab"));
    tab.append(h("button.tab.tab-more", { type: "button", "aria-haspopup": "dialog", "data-more": "", "data-fk": "more", on: { click: openMoreSheet } }, icon("more"), h("span.nav-label", "More")));
  }
  if (app.active) setActiveNav(app.active);
}

function setActiveNav(id) {
  for (const a of $$("[data-route]")) {
    if (a.dataset.route === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  const more = $("[data-more]");
  if (more) more.classList.toggle("is-active", !TAB_IDS.includes(id));
}

function openMoreSheet() {
  const rest = VIEWS.filter((v) => v.group !== "hidden" && !TAB_IDS.includes(v.id));
  const m = modal({
    title: "More", cls: ".sheet",
    body: h("div.sheet-group", h("ul.sheet-list", rest.map((v) => h("li", h("a.sheet-link", {
      href: "#/" + v.id, "data-route": v.id, "data-fk": "more-" + v.id,
      on: { click: (e) => { e.preventDefault(); m.keepFocus(); m.close(); setTimeout(() => hooks.go(v.id), 0); } },
    }, icon(v.icon), h("span", v.title)))))),
  });
  setActiveNav(app.active);
}

function tickClock() {
  const el = $("[data-clock]");
  if (!el) return;
  const d = new Date(now());
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short" }).format(d);
  if (el._t === t + day) return;
  el._t = t + day;
  clear(el).append(h("span.clock-time.num", t), h("span.clock-meta", h("span.clock-day", day), h("span.clock-tz", "Bangkok")));
  el.setAttribute("aria-label", `Bangkok time ${day}, ${t}`);
}

function renderFresh() {
  const host = $("[data-fresh]");
  if (!host) return;
  const kids = [];
  const d = prices.data;
  if (app.plan) {
    let cls = "ok", text;
    if (d.off) { cls = "wait"; text = "Live prices off"; }
    else if (!d.cryptoAt) { cls = d.cryptoStatus === "error" ? "bad" : "wait"; text = d.cryptoStatus === "error" ? "Coin prices offline" : "Loading coin prices…"; }
    else { text = "Coin prices " + ago(d.cryptoAt); if (d.cryptoStatus === "error" || Date.now() - d.cryptoAt > 600000) cls = "warn"; }
    kids.push(h(`span.fresh-dot.is-${cls}`, { "aria-hidden": "true" }), h("span.fresh-text", text));
    if (d.cryptoStatus === "error" && d.cryptoAt) kids.push(h("span.badge.badge-amber", { title: d.cryptoError || "The last refresh failed" }, "last known"));
  }
  if (store.saveError || !store.available) kids.push(h("button.save.is-error", { type: "button", "data-fk": "save-error", title: String((store.saveError && store.saveError.message) || "Storage is blocked"), on: { click: () => hooks.go("settings") } }, "Not saved"));
  else if (saveUi.state === "saved" && Date.now() - saveUi.at < 8000) kids.push(h("span.save.is-saved", icon("check"), "Saved in this browser"));
  clear(host).append(...kids);
}
hooks.renderFresh = () => { renderFresh(); setTimeout(renderFresh, 8200); };

function renderRailStatus() {
  const host = $("[data-status]");
  if (!host) return;
  if (!app.plan) { host.hidden = true; clear(host); return; }
  host.hidden = false;
  const pr = progressNow();
  const next = autoDeskDate(schedule());
  clear(host).append(
    h("div.rs-row", h("span.rs-label", "Orders done"), h("span.rs-val.num", `${pr.done + pr.skipped}`, h("span.rs-of", ` / ${pr.total}`))),
    h("div.rs-bar", { role: "img", "aria-label": `${pr.done} of ${pr.total} orders filled, ${pr.skipped} skipped` }, h("span", { style: { width: (pr.pct * 100).toFixed(1) + "%" } })),
    next ? h("div.rs-next", h("span.rs-label", "Next order date"), h("span.rs-date", long(next.effective)), h("span.rs-rel", inDays(L.daysBetween(today(), next.effective)))) : h("div.rs-next", h("span.rs-label", "Year one complete")),
  );
}

function renderBrand() {
  for (const el of $$("[data-brand-sub]")) el.textContent = app.plan ? `${fM(app.plan.funding.monthlyUsd)} a month` : "Monthly";
}

function renderFoot() {
  const f = $("[data-foot]");
  const plan = app.plan || app.base;
  if (!f || !plan) return;
  const m = plan.meta;
  clear(f).append(
    h("p.foot-disclaimer", icon("info"), h("span", m.disclaimer)),
    h("p.foot-meta", `${m.sourceDoc}${app.plan ? "" : " (an example until you choose your amount)"} · dated ${long(m.docDate)} · Everything you enter stays in this browser.`),
    h("p.foot-meta", sourceLink(prices.SOURCES.crypto), h("span", " · "), sourceLink(prices.SOURCES.fx), h("span", " · Stock and fund prices are the ones you type.")));
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

// ---------------------------------------------------------------- start

async function init() {
  initNow();
  document.documentElement.classList.toggle("tab-hidden", document.hidden);
  store.load();
  applyTheme(S().settings.theme);
  prices.init();
  try {
    const res = await fetch("data/base-plan.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`data/base-plan.json: HTTP ${res.status}`);
    app.base = await res.json();
  } catch (e) {
    console.warn(e);
    const boot = $("[data-boot]");
    if (boot) clear(boot).append(errorState("The plan could not be loaded. Check your connection and reload the page.", e));
    return;
  }
  syncPlan();
  if (app.plan) prices.start(app.plan);
  app.lastDay = today();
  document.documentElement.dataset.stage = app.plan ? "plan" : "setup";

  let lastTheme = S().settings.theme;
  store.subscribe((s) => {
    if (s.settings.theme !== lastTheme) { lastTheme = s.settings.theme; applyTheme(lastTheme); invalidate("theme"); }
    renderFresh();
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

  buildNav();
  renderBrand();
  renderFoot();
  tickClock();
  renderFresh();
  renderRailStatus();
  setInterval(tickClock, 1000);
  setInterval(() => { renderFresh(); checkDayRollover(); }, 15000);

  window.addEventListener("hashchange", () => route());
  const skip = $("a.skip");
  if (skip) skip.addEventListener("click", skipToContent);
  document.addEventListener("visibilitychange", () => {
    document.documentElement.classList.toggle("tab-hidden", document.hidden);
    if (!document.hidden) checkDayRollover();
  });
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", () => invalidate("theme"));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => invalidate("theme"));

  const boot = $("[data-boot]");
  if (boot) boot.remove();
  route({ initial: true });

  // QA and debugging handle (references to the shared modules; the friend's data stays in this browser).
  window.TTM = {
    store, scale, prices, app, logic: L, ui, now, today, invalidate,
    get plan() { return app.plan; },
    render: (id) => renderView(id || app.active),
    go: (id) => hooks.go(id),
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
