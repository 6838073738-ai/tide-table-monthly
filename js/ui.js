// Shared UI components. All output is built with DOM APIs or escaped strings — never raw remote HTML.

const SVGNS = "http://www.w3.org/2000/svg";

/** True when motion should stop: the reader asked for reduced motion, turned on Still pictures
 * (html[data-motion="still"]), or the tab is hidden (html[data-tab="hidden"]). Safe to import anywhere. */
export const reducedMotion = () => {
  if (typeof window === "undefined") return true;
  const d = typeof document !== "undefined" ? document.documentElement : null;
  if (d && (d.getAttribute("data-motion") === "still" || d.getAttribute("data-tab") === "hidden")) return true;
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
};

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Only http(s) links and same-page "#..." routes survive; everything else becomes "#". */
export function safeUrl(u) {
  if (typeof u === "string" && u.startsWith("#") && !/[\s<>"']/.test(u)) return u;
  try { const x = new URL(u, location.href); return x.protocol === "http:" || x.protocol === "https:" ? x.href : "#"; }
  catch { return "#"; }
}

/**
 * h("div.card#id", {attrs, on: {click}}, ...children)
 * children: strings (text nodes), nodes, arrays, null/false (skipped).
 */
export function h(tag, props, ...children) {
  if (props == null || typeof props !== "object" || props instanceof Node || Array.isArray(props)) { children.unshift(props); props = {}; }
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
  const isSvg = props.svg || ["svg", "path", "circle", "line", "rect", "g", "text", "polyline", "defs", "linearGradient", "stop", "clipPath", "tspan"].includes(m[1]);
  const el = isSvg ? document.createElementNS(SVGNS, m[1] || "g") : document.createElement(m[1] || "div");
  for (const part of (m[2] || "").match(/[.#][\w-]+/g) || []) {
    if (part[0] === ".") el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(props)) {
    if (k === "svg" || v == null || v === false) continue;
    if (k === "on") { for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn); continue; }
    if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv); continue; }
    if (k === "class") { el.setAttribute("class", v); continue; }
    if (k === "text") { el.textContent = v; continue; }
    if (k === "href") { el.setAttribute("href", safeUrl(v)); continue; }
    if (k === "dataset") { Object.assign(el.dataset, v); continue; }
    el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}
function append(el, kids) {
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// ---------- motion helpers ----------

/**
 * Write a number into el.textContent using fmt. Money never counts up in the storybook look, so this sets the
 * final value at once (the signature stays for the views that call it; from and duration are ignored).
 */
export function countUp(el, to, fmt = (x) => String(Math.round(x))) {
  el._cu = to;
  el.textContent = fmt(to);
}

/** Flash an element green/red on price change. */
export function flash(el, dir) {
  if (!el || !dir) return;
  el.classList.remove("flash-up", "flash-down");
  void el.offsetWidth; // restart the animation
  el.classList.add(dir > 0 ? "flash-up" : "flash-down");
}

// ---------- charts (SVG) ----------

/**
 * Sparkline with optional ceiling line. values oldest→newest.
 * opts: {w, h, ceiling, stroke, fill, label, markers:[{i, cls}] }
 */
export function sparkline(values, opts = {}) {
  const w = opts.w || 240, hgt = opts.h || 56, pad = 3;
  const vals = (values || []).filter((v) => Number.isFinite(v));
  const svg = h("svg.spark", { viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: "none", role: "img", "aria-label": opts.label || "Price history" });
  if (vals.length < 2) { svg.appendChild(h("text.spark-empty", { x: w / 2, y: hgt / 2 + 4, "text-anchor": "middle" }, "no history")); return svg; }
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const ceil = Number.isFinite(opts.ceiling) ? opts.ceiling : null;
  if (ceil != null) { lo = Math.min(lo, ceil); hi = Math.max(hi, ceil); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const x = (i) => pad + (i / (vals.length - 1)) * (w - 2 * pad);
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (hgt - 2 * pad);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const id = "g" + Math.random().toString(36).slice(2, 8);
  const up = vals[vals.length - 1] >= vals[0];
  svg.appendChild(h("defs", h("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 },
    h("stop", { offset: "0%", "stop-color": "currentColor", "stop-opacity": 0.22 }),
    h("stop", { offset: "100%", "stop-color": "currentColor", "stop-opacity": 0 }))));
  svg.classList.add(up ? "is-up" : "is-down");
  svg.appendChild(h("path.spark-area", { d: `${d}L${x(vals.length - 1)},${hgt}L${x(0)},${hgt}Z`, fill: `url(#${id})` }));
  if (ceil != null) svg.appendChild(h("line.spark-ceiling", { x1: 0, x2: w, y1: y(ceil), y2: y(ceil) }));
  const line = h("path.spark-line", { d, pathLength: 1 });
  svg.appendChild(line);
  for (const mk of opts.markers || []) if (vals[mk.i] != null) svg.appendChild(h("circle", { class: "spark-marker " + (mk.cls || ""), cx: x(mk.i), cy: y(vals[mk.i]), r: 2.5 }));
  svg.appendChild(h("circle.spark-dot", { cx: x(vals.length - 1), cy: y(vals[vals.length - 1]), r: 3 }));
  return svg;
}

/**
 * Donut chart. segments: [{label, value, color}] → SVG with animated arcs (CSS transition on
 * stroke-dasharray). Returns {el, update(segments)}.
 */
export function donut(segments, { size = 220, thickness = 26, label = "Allocation", center } = {}) {
  const r = (size - thickness) / 2, c = 2 * Math.PI * r;
  const svg = h("svg.donut", { viewBox: `0 0 ${size} ${size}`, role: "img", "aria-label": label });
  const g = h("g", { transform: `rotate(-90 ${size / 2} ${size / 2})` });
  svg.appendChild(h("circle.donut-track", { cx: size / 2, cy: size / 2, r, "stroke-width": thickness, fill: "none" }));
  svg.appendChild(g);
  const centerG = h("g.donut-center");
  svg.appendChild(centerG);
  function update(segs, centerLines) {
    clear(g);
    const total = segs.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
    let acc = 0;
    segs.forEach((s, i) => {
      const len = (Math.max(0, s.value) / total) * c;
      const arc = h("circle.donut-seg", {
        cx: size / 2, cy: size / 2, r, fill: "none", "stroke-width": thickness,
        stroke: s.color, "stroke-dasharray": `0 ${c}`, "stroke-dashoffset": -acc,
        style: { "--i": i }, tabindex: 0, "data-fk": `seg-${s.key || s.label}`, "aria-label": `${s.label}: ${(s.value / total * 100).toFixed(1)}%`,
      });
      arc.appendChild(h("title", {}, `${s.label}: ${(s.value / total * 100).toFixed(1)}%`));
      g.appendChild(arc);
      const target = `${Math.max(0, len - (segs.length > 1 ? 1.5 : 0))} ${c}`;
      if (reducedMotion()) arc.setAttribute("stroke-dasharray", target);
      else setTimeout(() => arc.setAttribute("stroke-dasharray", target), 30 + i * 45);
      acc += len;
    });
    clear(centerG);
    const lines = centerLines || center || [];
    lines.forEach((t, i) => centerG.appendChild(h("text", { x: size / 2, y: size / 2 + (i - (lines.length - 1) / 2) * 22 + 6, "text-anchor": "middle", class: i === 0 ? "donut-big" : "donut-small" }, t)));
  }
  update(segments);
  return { el: svg, update };
}

/**
 * Semicircle gauge 0..100 (Fear & Greed, headroom…). Returns {el, set(value, label)}.
 * bands: [{to: 25, cls: "g-fear"}, …]
 */
export function gauge({ min = 0, max = 100, value = null, label = "", bands = [], size = 200 } = {}) {
  const r = size / 2 - 14, cx = size / 2, cy = size / 2 + 4;
  const svg = h("svg.gauge", { viewBox: `0 0 ${size} ${size / 2 + 26}`, role: "img", "aria-label": label });
  const arcPath = (a0, a1) => {
    const p = (a) => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`;
  };
  let from = min;
  for (const b of bands) {
    svg.appendChild(h("path", { class: "gauge-band " + (b.cls || ""), d: arcPath((from - min) / (max - min), (b.to - min) / (max - min)) }));
    from = b.to;
  }
  if (!bands.length) svg.appendChild(h("path.gauge-band", { d: arcPath(0, 1) }));
  const needle = h("g.gauge-needle", {}, h("line", { x1: cx, y1: cy, x2: cx, y2: cy - r + 8 }), h("circle", { cx, cy, r: 5 }));
  needle.style.transformOrigin = `${cx}px ${cy}px`;
  svg.appendChild(needle);
  const valText = h("text.gauge-value", { x: cx, y: cy - 18, "text-anchor": "middle" }, "—");
  const subText = h("text.gauge-label", { x: cx, y: cy + 20, "text-anchor": "middle" }, "");
  svg.appendChild(valText); svg.appendChild(subText);
  function set(v, sub = "") {
    const p = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0.5;
    needle.style.transform = `rotate(${-90 + p * 180}deg)`;
    valText.textContent = Number.isFinite(v) ? String(Math.round(v)) : "—";
    subText.textContent = sub;
    svg.setAttribute("aria-label", `${label}: ${Number.isFinite(v) ? Math.round(v) : "unavailable"} ${sub}`);
  }
  set(value);
  return { el: svg, set };
}

/** Horizontal headroom bar: where price sits relative to the ceiling. pct = (ceiling-price)/ceiling*100. */
export function headroomBar(pct, { label = "Headroom to ceiling" } = {}) {
  const wrap = h("div.headroom", { role: "img", "aria-label": `${label}: ${Number.isFinite(pct) ? pct.toFixed(1) + "%" : "n/a"}` });
  const fill = h("div.headroom-fill");
  const mark = h("div.headroom-mark");
  wrap.append(h("div.headroom-track", fill, mark));
  const p = Number.isFinite(pct) ? Math.max(-20, Math.min(40, pct)) : null;
  const pos = p == null ? 50 : ((40 - p) / 60) * 100; // 0% headroom sits at 66.7% of the track
  requestAnimationFrame(() => { fill.style.width = pos + "%"; mark.style.left = pos + "%"; });
  setTimeout(() => { fill.style.width = pos + "%"; mark.style.left = pos + "%"; }, 60);
  wrap.classList.toggle("is-over", p != null && p < 0);
  return wrap;
}

export function pill(text, kind = "neutral", icon) {
  return h(`span.pill.pill-${kind}`, icon ? h("span.pill-ico", { "aria-hidden": "true" }, icon) : null, text);
}

// ---------- toasts ----------
export function toast(msg, kind = "info", ms = 3600) {
  const host = document.querySelector("[data-toasts]");
  if (!host) return;
  // The host is not a live region itself (book-api.md: <div data-toasts></div>), so each toast is the one live
  // region of its event, never nested. It goes in empty and gets its words a moment later, so screen readers that
  // only follow changes to a region already in the page still read it once.
  const t = h(`div.toast.toast-${kind}`, { role: kind === "alert" ? "alert" : "status" });
  host.appendChild(t);
  setTimeout(() => { t.textContent = msg; }, 100);
  setTimeout(() => t.classList.add("is-leaving"), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/** Announce a summary to screen readers (not per tick). */
export function announce(msg) {
  const el = document.querySelector("[data-sr-live]");
  if (el) el.textContent = msg;
}

// ---------- time ----------
export function relTime(epochSec, now = Date.now()) {
  if (!Number.isFinite(epochSec)) return "—";
  const s = Math.round(now / 1000 - epochSec);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}

export function fmtCountdown(ms) {
  if (ms <= 0) return "now";
  const d = Math.floor(ms / 86400000), hh = Math.floor((ms % 86400000) / 3600000), mm = Math.floor((ms % 3600000) / 60000);
  if (d >= 2) return `${d} days`;
  if (d === 1) return `1 day ${hh} h`;
  if (hh >= 1) return `${hh} h ${mm} min`;
  return `${mm} min`;
}

const dtfCache = new Map();
function partsIn(tz, date) {
  let f = dtfCache.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); dtfCache.set(tz, f); }
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { wd, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/**
 * Regular-hours status for a plan venue (holidays not modelled — the UI says "regular hours").
 * Returns {open, label, nextChangeMin}.
 */
export function marketStatus(venue, now = new Date()) {
  const { wd, minutes } = partsIn(venue.tz, now);
  if (!venue.days.includes(wd)) return { open: false, label: "closed (weekend)" };
  for (const [a, b] of venue.sessions) {
    const [ah, am] = a.split(":").map(Number), [bh, bm] = b.split(":").map(Number);
    const s = ah * 60 + am, e = bh * 60 + bm;
    if (minutes >= s && minutes < e) return { open: true, label: "open", minsSinceOpen: minutes - s, minsToClose: e - minutes };
  }
  return { open: false, label: "closed" };
}

export function bkkClock(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

/** "YYYY-MM-DD" -> a UTC Date, or null for anything else (a bad imported date shows "—", never throws). */
function isoDay(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return Number.isFinite(t.getTime()) ? t : null;
}
export function fmtDateLong(dateStr) {
  const t = isoDay(dateStr);
  return t ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(t) : "—";
}
export function fmtDateShort(dateStr) {
  const t = isoDay(dateStr);
  return t ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(t) : "—";
}

// ---------- words for dates, money and shares (the storybook's formats; pure, no clock unless passed in) ----------

const MINUS = "−";
const DAYS3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December"];

/** x with dp decimals, rounded the way Python formats a float: the exact binary value, ties to even
 * (12.5 -> "12", 1.25 -> "1.2"). Number.toFixed alone sends ties up. x is assumed finite and dp <= 20. */
export function pyFixed(x, dp = 0) {
  const neg = x < 0 || Object.is(x, -0);
  const a = Math.abs(x);
  let s = a.toFixed(dp);
  const exact = a.toFixed(Math.min(100, dp + 30));    // every digit of the binary value up to here
  const tail = exact.slice(exact.length - 30);
  if (/^50*$/.test(tail)) {                            // exactly half way: keep the even neighbour
    const down = exact.slice(0, exact.length - 30).replace(/\.$/, "");
    const last = Number(down.replace(".", "").slice(-1));
    if (last % 2 === 0) s = down;
  }
  return (neg && Number(s) !== 0 ? "-" : "") + s;
}

function groupThousands(s) {
  const [i, f] = s.split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return f === undefined ? g : g + "." + f;
}

function dayOf(iso) {
  const t = isoDay(iso);
  if (!t) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;  // 2026-02-30
  return t;
}

/** "Tue 8 Dec 2026" (no comma); "—" for anything that is not a real YYYY-MM-DD. */
export function dateWords(iso) {
  const t = dayOf(iso);
  return t ? `${DAYS3[t.getUTCDay()]} ${t.getUTCDate()} ${MON3[t.getUTCMonth()]} ${t.getUTCFullYear()}` : "—";
}

/** "Tuesday 8 December 2026". */
export function dateWordsFull(iso) {
  const t = dayOf(iso);
  return t ? `${DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}` : "—";
}

/** "Sep 2021" for "2021-09" (a YYYY-MM-DD gives its month too); "—" otherwise. */
export function monthWords(key) {
  const m = typeof key === "string" && /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(key);
  const n = m ? Number(m[2]) : 0;
  return m && n >= 1 && n <= 12 ? `${MON3[n - 1]} ${m[1]}` : "—";
}

/** {day: "Fri", date: "6", month: "Nov", year: "2026"} for a calendar chip; every part "—" for a bad date. */
export function dayParts(iso) {
  const t = dayOf(iso);
  if (!t) return { day: "—", date: "—", month: "—", year: "—" };
  return { day: DAYS3[t.getUTCDay()], date: String(t.getUTCDate()), month: MON3[t.getUTCMonth()], year: String(t.getUTCFullYear()) };
}

/** "today", "tomorrow", "in 11 days", "yesterday", "11 days ago"; "" when either date is not a real day. */
export function inDays(iso, todayIso) {
  const a = dayOf(iso), b = dayOf(todayIso);
  if (!a || !b) return "";
  const n = Math.round((a.getTime() - b.getTime()) / 86400000);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** "฿15,000": no decimals from ฿100 up; below that, two decimals only when there are satang. True minus. */
export function bahtWords(n) {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  let body;
  if (a >= 100 || Math.abs(Number(pyFixed(a, 2)) - Math.round(a)) < 1e-9) body = groupThousands(pyFixed(a, 0));
  else body = pyFixed(a, 2);
  return (n < 0 && Number(body.replace(/,/g, "")) !== 0 ? MINUS : "") + "฿" + body;
}

/** Sizes in words: "฿1.2 billion", "฿32.2 trillion", "฿150 billion"; below a billion, as bahtWords. */
export function bahtSize(n) {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n), neg = n < 0 ? MINUS : "";
  if (a >= 1e12) return `${neg}฿${groupThousands(pyFixed(a / 1e12, 1))} trillion`;
  if (a >= 1e9) return `${neg}฿${a < 1e11 ? pyFixed(a / 1e9, 1) : pyFixed(a / 1e9, 0)} billion`;
  return bahtWords(n);
}

/** "about $149" (whole dollars, true minus). */
export function aboutUsd(n) {
  if (!Number.isFinite(n)) return "—";
  const body = groupThousands(pyFixed(Math.abs(n), 0));
  return `about ${n < 0 && body !== "0" ? MINUS : ""}$${body}`;
}

/** p in percent: whole numbers from 10% up, one decimal below, "0%" for nothing, a true minus, "+" when signed. */
export function pctWords(p, { signed = false } = {}) {
  if (!Number.isFinite(p)) return "—";
  const a = Math.abs(p);
  const s = a >= 9.95 ? groupThousands(pyFixed(a, 0)) : pyFixed(a, 1);
  if (s === "0" || s === "0.0") return "0%";
  if (p < 0) return MINUS + s + "%";
  return (signed ? "+" : "") + s + "%";
}

/** A share of a budget, always one decimal: "30.1%". */
export function shareWords(p) {
  if (!Number.isFinite(p)) return "—";
  const s = pyFixed(Math.abs(p), 1);
  return (p < 0 && s !== "0.0" ? MINUS : "") + s + "%";
}

/** "14:32", Bangkok time (UTC+7, no daylight saving), from epoch milliseconds. */
export function timeWords(epochMs) {
  if (!Number.isFinite(epochMs)) return "—";
  const t = new Date(epochMs + 7 * 3600000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

// ---------- icons (stroke, 20px) ----------
const ICON_PATHS = {
  today: "M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.4 1.4M13.6 13.6 15 15M5 15l1.4-1.4M13.6 6.4 15 5M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  prices: "M3 15l4-5 3 3 4-6 3 4M3 17h14",
  calendar: "M4 5h12v11H4zM4 8h12M7 3v3M13 3v3",
  funding: "M3 7h14M3 7l3-3M3 7l3 3M17 13H3M17 13l-3-3M17 13l-3 3",
  portfolio: "M10 3a7 7 0 1 0 7 7h-7zM12 3.3A7 7 0 0 1 16.7 8H12z",
  rules: "M5 4h10v13H5zM8 8h4M8 11h4M8 14h2",
  market: "M3 13c2-2 3-2 5 0s3 2 5 0 3-2 4-1M3 9c2-2 3-2 5 0s3 2 5 0 3-2 4-1M6 4c1 1 2 1 3 0",
  news: "M4 4h10v12H5a1 1 0 0 1-1-1zM14 7h2v8a1 1 0 0 1-2 0M7 7h4M7 10h4M7 13h2",
  evidence: "M8 3h4M9 3v5l-4 7a1 1 0 0 0 1 2h8a1 1 0 0 0 1-2l-4-7V3",
  settings: "M10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4",
  more: "M5 10h.01M10 10h.01M15 10h.01",
  check: "M4 10l4 4 8-8",
  alert: "M10 3l8 14H2zM10 8v4M10 14.5v.01",
  info: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM10 9v5M10 6.5v.01",
  external: "M8 4H4v12h12v-4M11 3h6v6M17 3l-8 8",
};
export function icon(name, cls = "") {
  const svg = h("svg", { class: "ico " + cls, viewBox: "0 0 20 20", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" });
  svg.appendChild(h("path", { d: ICON_PATHS[name] || ICON_PATHS.info }));
  return svg;
}
