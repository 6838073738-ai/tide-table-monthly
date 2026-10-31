// Today's hero, both apps: hero-gl.js's lifecycle. Its rules and their reasons: docs/QA.md 2.2, hero-api.md 11.

export const GL_OPTIONS = Object.freeze({ alpha: true, premultipliedAlpha: true, antialias: false, depth: true,
  stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true });
export const AWAY_MS = 3 * 60 * 1000;
export const FRAME_MS = 1000 / 30;
export const SLOW = Object.freeze({ frames: 90, gapMs: 50 });
export const LIFTS = Object.freeze(["reduced motion", "still pictures", "forced colours"]);
const KEY = "tt-hero-arrived";

export function gateOf(e) {
  return e.reduced ? "reduced motion" : e.still ? "still pictures" : e.saveData ? "save-data"
    : typeof e.memory === "number" && e.memory < 4 ? "low memory" : e.forced ? "forced colours" : null;
}
export function due(t, slot) {
  return slot == null || t - slot >= 1.5 * FRAME_MS ? t : t - slot >= FRAME_MS - 4 ? slot + FRAME_MS : null;
}
export function slowDevice(g) {
  if (!g || g.length < SLOW.frames) return false;
  const s = [...g].sort((a, b) => a - b), m = s.length >> 1;
  return (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) > SLOW.gapMs;
}
export const batteryLow = (b) => !!b && b.charging === false && b.level < 0.2;
export function arrivalOf(store, seen) {
  try { return seen || store().getItem(KEY) ? "again" : "first"; } catch { return "first"; }
}
const held = (s) => s.frozen != null || s.hold || s.slow || s.battery;
export function stateOf(s) {
  return !s.canvas || s.lost ? "off" : !s.drawn || !s.shown ? "loading" : !s.mounted || s.hidden || !s.onScreen
    ? "paused" : held(s) ? "still" : "moving";
}
export function awayTimer(lose, { set = (f, ms) => setTimeout(f, ms), clear = (i) => clearTimeout(i) } = {}) {
  let id = null;
  return { leave() { if (id === null) id = set(() => { id = null; lose(); }, AWAY_MS); },
    back() { if (id !== null) clear(id); id = null; }, get pending() { return id !== null; } };
}

const S = { box: null, disc: null, mounted: false, canvas: null, gl: null, scene: null, begun: false, dead: false,
  gate: null, idled: false, drawn: false, shown: false, lost: false, hidden: false, onScreen: false, hold: "",
  slow: false, battery: false, frozen: null, size: 0, dpr: 1, theme: "", state: "off", why: "", arrival: "", frames: 0 };
const MQ = {};
let M, io, ro, watching, starting, warned, arrived, waitSize, step = 0, leaving = 0, raf = 0, slot = null, last = null;
let gaps = [];
let reveals = 0, clockT = 0, since = null;
const away = awayTimer(() => S.mounted || drop("away"));
const later = (f, ms = 0) => setTimeout(f, ms);
const sceneT = (t = performance.now()) => clockT + (since === null ? 0 : Math.max(0, t - since) / 1000);
const dpr = () => Math.min(globalThis.devicePixelRatio > 0 ? globalThis.devicePixelRatio : 1, 3);
const root = () => document.documentElement;
const theme = () => { const t = root().getAttribute("data-theme"); return t === "light" || t === "dark" ? t : MQ.dark.matches ? "dark" : "light"; };
const env = () => ({ reduced: MQ.reduce.matches, still: root().getAttribute("data-motion") === "still",
  saveData: !!(navigator.connection && navigator.connection.saveData), memory: navigator.deviceMemory, forced: MQ.forced.matches });

function update() {
  const st = (S.state = stateOf(S));
  if (st === "moving") {
    if (since === null) since = performance.now();
    if (!raf) { slot = last = null; gaps = []; raf = requestAnimationFrame(tick); }
  } else {
    if (since !== null) { clockT = sceneT(); since = null; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  if (!S.box) return;
  if (S.box.getAttribute("data-hero-state") !== st) S.box.setAttribute("data-hero-state", st);
  S.box.toggleAttribute("data-hero-left", st === "paused" && !S.mounted && !held(S));
}
function tick(t) {
  raf = 0;
  if (S.state !== "moving") return;
  raf = requestAnimationFrame(tick);
  const s = due(t, slot);
  if (s === null) return;
  slot = s;
  if (last !== null && gaps.push(t - last) >= SLOW.frames) {
    if (slowDevice(gaps)) { S.slow = true; return update(); }
    gaps = [];
  }
  last = t;
  if (dpr() !== S.dpr) fit();
  draw(sceneT(t));
}
function draw(t) {
  try { if (S.scene && S.scene.draw(t)) S.frames++; } catch (e) { fail(e); }
}
function fit() {
  S.dpr = dpr();
  return !!(S.scene && S.size > 0 && S.scene.resize(S.size, S.dpr));
}

function start() {
  if (S.begun || S.dead || starting) return;
  starting = true;
  const go = () => (typeof requestIdleCallback === "function" ? requestIdleCallback(idle, { timeout: 1500 }) : later(idle, 300));
  if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true });
}
function idle() {
  starting = false;
  S.idled = true;
  begin();
}
function begin() {
  if (S.begun || S.dead || !S.idled || !S.mounted || S.hidden || !S.onScreen || !S.disc) return;
  const why = gateOf(env());
  S.why = why || "";
  if (why) {
    if (LIFTS.includes(why)) S.gate = why; else S.dead = true;
    return update();
  }
  S.gate = null;
  S.begun = true;
  later(context);
}
function context() {
  if (!S.begun || S.canvas) return;
  if (!S.mounted) { S.begun = false; return; }   // Today was left meanwhile
  const c = document.createElement("canvas");
  c.className = "bk-hero-canvas";
  c.setAttribute("aria-hidden", "true");
  c.tabIndex = -1;
  let gl = null;
  try { gl = c.getContext("webgl2", GL_OPTIONS); } catch { /* none */ }
  if (!gl) { Object.assign(S, { begun: false, dead: true, why: "no webgl2" }); return update(); }
  c.addEventListener("webglcontextlost", lost);
  c.addEventListener("webglcontextrestored", restored);
  Object.assign(S, { canvas: c, gl, drawn: false, shown: false, lost: false });
  if (S.disc) S.disc.append(c);
  update();
  later(load);
}
function load() {
  const gl = S.gl;
  (M ? Promise.resolve(M) : import("./hero-gl.js?v=2.2.0")).then((m) => {
    M = m;
    if (S.gl !== gl || S.lost) return;
    const sc = (S.scene = m.createScene(gl));
    sc.setTheme((S.theme = theme()));
    fit();
    let i = 0;
    const next = () => {
      step = 0;
      if (S.scene !== sc) return;
      if (sc.steps[i].name === "frame" && !(S.size > 0)) { waitSize = next; return; }
      let done;
      try { done = sc.steps[i].run(); } catch (e) { return fail(e); }
      if (!done) step = later(next, sc.pollMs);
      else if (++i < sc.steps.length) step = later(next);
      else { S.frames++; S.drawn = true; reveal(); }
    };
    step = later(next);
  }).catch(fail);
}
function reveal() {
  const id = ++reveals;
  const show = () => {
    if (id !== reveals || S.shown || !S.drawn) return;
    S.shown = true;
    if (!arrived) { arrived = true; try { sessionStorage.setItem(KEY, "1"); } catch { /* blocked */ } }
    update();
  };
  later(show, 250);
  requestAnimationFrame(() => requestAnimationFrame(show));
}

function lost(e) {
  e.preventDefault();
  clearTimeout(step);
  waitSize = null;
  Object.assign(S, { lost: true, scene: null, drawn: false, shown: false, why: "context lost" });
  update();
}
function restored() {
  if (!S.lost) return;
  S.lost = false;
  S.arrival = "again";
  if (S.box) S.box.setAttribute("data-hero-arrival", "again");
  clockT = 0;
  load();
}
function fail(e) {
  if (!warned) { warned = true; console.warn("hero: the poster stays.", (e && e.message) || e); }
  drop("error", true);
}
function drop(why, dead) {
  const { canvas: c, gl, scene } = S;
  clearTimeout(step);
  waitSize = null;
  try { if (scene) scene.dispose(); } catch { /* gone with its context */ }
  if (c) { c.removeEventListener("webglcontextlost", lost); c.removeEventListener("webglcontextrestored", restored); c.remove(); }
  try { const x = gl && gl.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); } catch { /* lost already */ }
  Object.assign(S, { canvas: null, gl: null, scene: null, begun: false, drawn: false, shown: false, lost: false, why });
  if (dead) S.dead = true;
  update();
}

function watch() {
  if (watching) return !!ro;
  watching = true;
  if (typeof IntersectionObserver !== "function" || typeof ResizeObserver !== "function" || typeof matchMedia !== "function") return false;
  for (const [k, q] of [["reduce", "(prefers-reduced-motion: reduce)"], ["forced", "(forced-colors: active)"], ["dark", "(prefers-color-scheme: dark)"]]) {
    (MQ[k] = matchMedia(q)).addEventListener("change", prefs);
  }
  new MutationObserver(prefs).observe(root(), { attributes: true, attributeFilter: ["data-motion", "data-theme"] });
  S.hidden = !!document.hidden;
  document.addEventListener("visibilitychange", () => { S.hidden = !!document.hidden; begin(); update(); });
  io = new IntersectionObserver((es) => { S.onScreen = es[es.length - 1].isIntersecting; begin(); update(); });
  ro = new ResizeObserver((es) => {
    const e = es[es.length - 1], b = e.contentBoxSize && (e.contentBoxSize[0] || e.contentBoxSize);
    S.size = b ? b.inlineSize : e.contentRect.width;
    if (fit() && S.drawn) draw(sceneT());   // before the paint: never a blank canvas
    if (waitSize && S.size > 0) { step = later(waitSize); waitSize = null; }
  });
  try {
    navigator.getBattery().then((b) => {
      const f = () => { S.battery = batteryLow(b); update(); };
      b.addEventListener("levelchange", f);
      b.addEventListener("chargingchange", f);
      f();
    }, () => {});
  } catch { /* no Battery API */ }
  prefs();
  return !!ro;
}
function prefs() {
  const e = env(), t = theme();
  S.hold = e.reduced ? "reduced motion" : e.still ? "still pictures" : e.forced ? "forced colours" : "";
  if (S.gate && !gateOf(e)) { S.gate = null; S.why = ""; begin(); }
  if (S.scene && t !== S.theme && S.scene.setTheme((S.theme = t)) && S.drawn) draw(sceneT());
  update();
}
function swap(box) {
  if (S.box && S.box !== box) { io.unobserve(S.box); if (S.disc) ro.unobserve(S.disc); }
  S.box = box;
  S.disc = box.querySelector("[data-hero-disc]");
  if (S.canvas && S.disc && S.canvas.parentNode !== S.disc) S.disc.append(S.canvas);
  if (S.arrival) box.setAttribute("data-hero-arrival", S.arrival);
  box.setAttribute("data-hero-state", S.state);
  box.removeAttribute("data-hero-left");
  io.observe(box);
  if (S.disc) ro.observe(S.disc);
}

export function mountHero(box) {
  if (!box || typeof box.querySelector !== "function") return;
  try { mount(box); } catch (e) { fail(e); }
}
function mount(box) {
  publish();
  if (!watch()) return;
  away.back();
  if (leaving) { clearTimeout(leaving); leaving = 0; }   // left and back in one go: a redraw
  if (S.mounted) { if (box !== S.box) swap(box); return; }
  Object.assign(S, { mounted: true, onScreen: false, arrival: arrivalOf(() => sessionStorage, arrived) });
  if (!S.dead && !S.gate) S.why = "";
  const keep = held(S);
  if (!keep) clockT = 0;
  swap(box);
  if (S.scene && S.scene.ready && !keep) {
    S.shown = false;
    step = later(() => { if (S.scene && S.mounted) draw(0); if (S.scene && S.mounted) reveal(); });
  }
  update();
  start();
}
export function unmountHero() {
  if (!S.mounted || leaving) return;
  leaving = later(() => {
    leaving = 0;
    S.mounted = S.onScreen = false;
    if (S.box) io.unobserve(S.box);
    if (S.disc) ro.unobserve(S.disc);
    if (S.canvas) away.leave();
    update();
  });
}

const api = Object.freeze({
  get state() { return S.state; },
  get drawn() { return S.drawn; },
  get arrival() { return S.arrival; },
  get frames() { return S.frames; },
  get reason() {
    const s = S.state;
    return s === "off" ? S.why || (S.box ? "waiting" : "not mounted") : s === "loading" ? s
      : s === "paused" ? (!S.mounted ? "left today" : S.hidden ? "hidden" : "off screen")
        : s === "still" ? (S.frozen != null ? "frozen" : S.hold || (S.slow ? "slow device" : "low battery")) : "";
  },
  freeze(ms) {
    S.frozen = ms == null || ms === false ? null : Math.max(0, +ms || 0) / 1000;
    update();
    if (S.frozen === null) return true;
    clockT = S.frozen;
    if (!S.drawn) return false;
    draw(S.frozen);
    return true;
  },
  litPixels() {
    try { return S.scene && S.drawn ? S.scene.litPixels() : 0; } catch { return 0; }
  },
});
function publish() {
  if (typeof window !== "object" || !window) return;
  const tt = (window.TT = window.TT || {});
  if (tt.hero !== api) tt.hero = api;
}
publish();
