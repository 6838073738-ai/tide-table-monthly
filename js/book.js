// The Warm Storybook atoms, shared by both apps: pure DOM builders with the data passed in.
// The contract is docs/tt2/build/book-api.md. Every builder takes one props object (picture, vignette, lineIcon,
// labelChip and note take their key first) and returns one Element whose root carries data-bk="<name>". Live atoms
// hang a small controller on el.bk; a controller call never fires the atom's own callbacks.
// Rules: text is always text (no markup strings), links go through safeUrl, nothing is fetched or stored, no
// animation frames, and the only timer is the split strip's settle debounce. Nothing here ranks, scores, sorts or
// colours a number. Importing this file touches no document or window.

import { h, clear } from "./ui.js?v=2.0.0";

// ------------------------------------------------------------------------------------------- fixed copy

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v);
  return Object.freeze(o);
}

const CHART_LABELS = {
  mixEnd: "your mix", worldEnd: "fund alone", dip: "Deepest dip", legendMix: "Your mix",
  legendWorld: "The all-world fund alone", legendDip: "From the high to the deepest dip",
};

const SCENE = "on a green hill under a wide sky.";
export const FIXED = deepFreeze({
  bothSides: "Facts from the past and today, from both sides. Not a forecast. Tide Table never says buy, sell or hold.",
  well: "What has been going well",
  wrong: "What could go wrong",
  footer: "Tide Table shows facts from the past and today. It is not personal advice and never says buy, sell or hold. Check that any choice fits your own money, goals and taxes.",
  bumps: "Each bar is one month. Taller bars: bigger moves.",
  labels: {
    y5: "5 fiscal years checked",
    y4ttm: "4 fiscal years and the latest 12 months checked",
    na: "Profit history not available from open data",
  },
  chapter: { done: "Done", now: "Today", later: "Planned" },
  tick: { mark: "Mark as placed", placed: "Placed" },
  switchWords: ["Off", "On"],
  still: "Still pictures",
  stillPill: "Still",
  night: "Night pages",
  split: {
    fields: "to your fields",
    world: "to the all-world fund",
    ticks: "to your fields",
    label: "Your fields' share of each month",
    unset: "Not chosen yet. Move the marker to choose how much goes to your fields.",
    noField: "Choose a field to mix it in.",
  },
  chart: CHART_LABELS,
  newTab: "(opens in a new tab)",
  letters: "Jump to a letter",
  contents: "Contents",
  pages: "Pages",
  vignettes: {
    today: "A painted picture: a little paper boat sails on the tide past a small house on stilts, a tree and an island with a palm.",
    cars: "A painted picture: a small red car drives toward you on a country road between green hills.",
    financials: `A painted picture: a piggy bank and a coin ${SCENE}`,
    energy: `A painted picture: a flame ${SCENE}`,
    staples: `A painted picture: a bowl of rice with chopsticks ${SCENE}`,
    health: `A painted picture: a doctor's bag ${SCENE}`,
    realestate: `A painted picture: a small house with a chimney ${SCENE}`,
    industrials: `A painted picture: two gears ${SCENE}`,
    materials: `A painted picture: two stones and a pickaxe ${SCENE}`,
    communication: `A painted picture: two speech bubbles ${SCENE}`,
    utilities: `A painted picture: a light bulb and a drop of water ${SCENE}`,
    discretionary: `A painted picture: a kite with a long tail ${SCENE}`,
    technology: `A painted picture: a computer screen ${SCENE}`,
    retail: `A painted picture: a shop with a striped awning ${SCENE}`,
    telecom: `A painted picture: a radio mast ${SCENE}`,
  },
});

export const PICTURES = Object.freeze(["financials", "energy", "staples", "health", "realestate", "industrials",
  "materials", "communication", "utilities", "discretionary", "technology", "cars", "retail", "telecom",
  "globe", "coin", "basket", "boat", "sun", "umbrella", "star"]);

// ------------------------------------------------------------------------------------------- small helpers

let seq = 0;
const newId = (given) => (given ? String(given) : `bk-${++seq}`);
const warned = new Set();
function warn(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  try { console.warn(`book.js: ${msg}`); } catch { /* no console: nothing to do */ }
}
const isNode = (x) => typeof Node !== "undefined" && x instanceof Node;

/** Append Content (a string, a Node, or an array of them; null and false skipped) as text and nodes. */
function put(el, c) {
  if (c == null || c === false) return el;
  if (Array.isArray(c)) { for (const x of c) put(el, x); return el; }
  el.appendChild(isNode(c) ? c : document.createTextNode(String(c)));
  return el;
}
const hasContent = (c) => !(c == null || c === false || c === "" || (Array.isArray(c) && !c.some(hasContent)));
const hidden = (text) => h("span.visually-hidden", text);
const ids = (...xs) => xs.filter(Boolean).join(" ") || null;
const sub = (base, part) => base + "-" + part;   // an internal id made from the atom's id

function setDisabled(el, on) {
  if (on) el.setAttribute("aria-disabled", "true"); else el.removeAttribute("aria-disabled");
}
const isDisabled = (el) => el.getAttribute("aria-disabled") === "true";

/** An external link: a new tab, no referrer, and the words that say so. */
function extLink(cls, text, url, extra) {
  const a = h(`a.${cls}`, { href: url, rel: "noopener noreferrer", referrerpolicy: "no-referrer", target: "_blank" });
  put(a, text);
  if (extra) put(a, extra);
  a.append(hidden(` ${FIXED.newTab}`));
  return a;
}

// ------------------------------------------------------------------------------------------- icons

// 32 x 32 line icons, 2.4px round strokes in currentColor. "c cx cy r" is a circle, "r x y w h rx" a rectangle,
// anything else a path.
const ICONS = {
  today: ["c 16 12 5", "M16 3v2M7.5 6.5l1.4 1.4M24.5 6.5l-1.4 1.4M5 12h2M25 12h2M3 22q3.25-3 6.5 0t6.5 0 6.5 0 6.5 0M6 27.5q2.5-2 5 0t5 0 5 0 5 0"],
  fields: ["M8 27V17M16 27V13M24 27V18M3 27.5h26", "c 8 13.5 3.5", "c 16 9.5 3.5", "c 24 14.5 3.5"],
  split: ["M16 7v20M10 27.5h12M5 10h22", "M5 10l-3 8h6zM27 10l-3 8h6z", "M2 18q3 4 6 0M24 18q3 4 6 0"],
  year: ["M4 8q6-2.5 12 1 6-3.5 12-1v17q-6-2-12 1-6-3-12-1zM16 9v17"],
  settings: ["c 16 16 4", "M16 4v4M16 24v4M4 16h4M24 16h4M7.5 7.5l2.8 2.8M21.7 21.7l2.8 2.8M7.5 24.5l2.8-2.8M21.7 10.3l2.8-2.8"],
  more: ["r 5 5 9 9 2", "r 18 5 9 9 2", "r 5 18 9 9 2", "r 18 18 9 9 2"],
  plan: ["M7 4h12l6 6v18H7z", "M19 4v6h6M11 15h10M11 20h10M11 25h6"],
  prices: ["M4 16 16 4h12v12L16 28z", "c 22.5 9.5 2"],
  calendar: ["r 5 7 22 20 3", "M5 13h22M11 4v6M21 4v6"],
  funding: ["M4 11h20M20 7l4 4-4 4M28 21H8M12 17l-4 4 4 4"],
  portfolio: ["c 16 16 12", "M16 4v12l8.5 8.5"],
  rules: ["r 7 6 18 22 2", "M12 3.5h8v5h-8zM11 15l2.5 2.5L18 13M11 23h10"],
  market: ["M8 19a5 5 0 0 1 .6-9.9A7 7 0 0 1 21.6 9.6 4.8 4.8 0 1 1 23 19z", "M3 25q3.25-3 6.5 0t6.5 0 6.5 0 6.5 0"],
  news: ["M5 7h18v18a3 3 0 0 0 3 3H8a3 3 0 0 1-3-3zM23 12h4v13a3 3 0 0 1-3 3", "M9 12h10M9 17h10M9 22h6"],
  evidence: ["M12 4h8M13.5 4v8L7 24a2.5 2.5 0 0 0 2.2 3.8h13.6A2.5 2.5 0 0 0 25 24l-6.5-12V4M10 19h12"],
  guide: ["M16 4v24M10 28h12M16 7h9l3 3-3 3h-9M16 15H7l-3 3 3 3h9"],
  intention: ["M16 26.5S5 20 5 12.5A5.5 5.5 0 0 1 16 10a5.5 5.5 0 0 1 11 2.5C27 20 16 26.5 16 26.5z"],
  search: ["c 14 14 8", "M20 20l7 7"],
  back: ["M19 6l-10 10 10 10"],
  check: ["M6 17l6 6 14-14"],
  info: ["c 16 16 12", "M16 14v8M16 10v.5"],
  plus: ["M16 6v20M6 16h20"],
  x: ["M8 8l16 16M24 8L8 24"],
  moon: ["M24 20.5A10 10 0 0 1 11.5 8 10 10 0 1 0 24 20.5z"],
  pause: ["M11 8v16M21 8v16"],
  down: ["M8 12l8 8 8-8"],
  alert: ["c 16 16 12", "M16 9v9M16 22v.5"],
  clock: ["c 16 16 12", "M16 9v7l5 3"],
  external: ["M14 6H7a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-7M19 5h8v8M27 5L15 17"],
};

/** A 32 x 32 line icon in currentColor (decorative). An unknown name draws "info" and warns once. */
export function lineIcon(name, { className } = {}) {
  let parts = ICONS[name];
  if (!parts) { warn(`icon:${name}`, `no icon called ${JSON.stringify(name)}; drawing "info"`); parts = ICONS.info; }
  const svg = h("svg", {
    class: className ? `bk-icon ${className}` : "bk-icon", viewBox: "0 0 32 32", fill: "none", stroke: "currentColor",
    "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false",
    "data-icon": ICONS[name] ? name : "info",
  });
  for (const p of parts) {
    const n = p.split(" ");
    if (n[0] === "c") svg.appendChild(h("circle", { cx: n[1], cy: n[2], r: n[3] }));
    else if (n[0] === "r") svg.appendChild(h("rect", { x: n[1], y: n[2], width: n[3], height: n[4], rx: n[5] }));
    else svg.appendChild(h("path", { d: p }));
  }
  return svg;
}

/** The done mark: a filled round in --done with a paper tick. */
function doneMark() {
  return h("svg", { class: "bk-done-mark", viewBox: "0 0 30 30", "aria-hidden": "true", focusable: "false" },
    h("circle", { cx: "15", cy: "15", r: "13", class: "bk-done-fill" }),
    h("path", { d: "M8.5 15.5l4.2 4.2 8.8-9", class: "bk-done-tick" }));
}

// Drawing data, from the picture-book mockups (inline pictures only; the files are pre-baked).
const SPOT = {
  cars: [["p|bk-f-rose|M16 80 C16 70 22 64 31 63 L41 49 C44 45 48 43 54 43 L72 43 C79 43 83 46 87 51 L95 62 C103 63 106 69 106 76 L106 80 Z","p|bk-f-white|M47 61 L53 50 C54 48.5 55.5 48 57 48 L62 48 L62 61 Z","p|bk-f-white|M67 48 L73 48 C76 48 78 49.5 80 52 L86 61 L67 61 Z","c|bk-f-glow|100 70 3.5"],
    ["p|bk-ln|M16 80 C16 70 22 64 31 63 L41 49 C44 45 48 43 54 43 L72 43 C79 43 83 46 87 51 L95 62 C103 63 106 69 106 76 L106 80 Z","p|bk-ln bk-ln-thin|M47 61 L53 50 C54 48.5 55.5 48 57 48 L62 48 L62 61 Z M67 48 L73 48 C76 48 78 49.5 80 52 L86 61 L67 61 Z M64 64 L64 76","c|bk-f-ink|38 81 11","c|bk-f-ink|84 81 11","c|bk-f-white|38 81 4.2","c|bk-f-white|84 81 4.2","p|bk-ln bk-ln-thin bk-ln-soft|M8 95 Q60 91 112 95"]],
  retail: [["p|bk-f-sand|M24 54 L96 54 L96 98 L24 98 Z","p|bk-f-rose|M18 40 L32 40 L32 54 Q25 62 18 54 Z","p|bk-f-white|M32 40 L46 40 L46 54 Q39 62 32 54 Z","p|bk-f-rose|M46 40 L60 40 L60 54 Q53 62 46 54 Z","p|bk-f-white|M60 40 L74 40 L74 54 Q67 62 60 54 Z","p|bk-f-rose|M74 40 L88 40 L88 54 Q81 62 74 54 Z","p|bk-f-white|M88 40 L102 40 L102 54 Q95 62 88 54 Z","p|bk-f-sky|M64 70 L84 70 L84 98 L64 98 Z","p|bk-f-sky|M32 66 L56 66 L56 84 L32 84 Z","c|bk-f-marigold|39 79 4","c|bk-f-rose|48 79 4","p|bk-f-white|M42 24 L78 24 L78 36 L42 36 Z"],
    ["p|bk-ln|M24 56 L24 98 L96 98 L96 56","p|bk-ln|M18 40 L102 40 L102 54 Q95 62 88 54 Q81 62 74 54 Q67 62 60 54 Q53 62 46 54 Q39 62 32 54 Q25 62 18 54","p|bk-ln bk-ln-thin|M64 98 L64 70 L84 70 L84 98 M32 66 L56 66 L56 84 L32 84 Z M42 24 L78 24 L78 36 L42 36 Z M60 36 L60 40","c|bk-f-ink|79 85 1.8","p|bk-ln bk-ln-thin bk-ln-soft|M10 99 L110 99"]],
  telecom: [["p|bk-f-white|M60 28 L78 98 L42 98 Z|.7","c|bk-f-glow|60 24 6"],
    ["p|bk-ln|M60 28 L44 98 M60 28 L76 98 M38 98 L82 98","p|bk-ln bk-ln-thin|M53 56 L67 56 M50 70 L70 70 M47 84 L73 84 M53 56 L70 70 M67 56 L50 70 M50 70 L73 84 M70 70 L47 84","c|bk-ln|60 24 6","p|bk-ln bk-ln-thin|M45 16 Q39 24 45 32 M75 16 Q81 24 75 32 M36 10 Q26 24 36 38 M84 10 Q94 24 84 38"]],
  technology: [["p|bk-f-white|M20 28 Q20 24 24 24 L96 24 Q100 24 100 28 L100 78 Q100 82 96 82 L24 82 Q20 82 20 78 Z","p|bk-f-sky|M27 31 L93 31 L93 75 L27 75 Z","p|bk-f-sand|M52 82 L48 96 L72 96 L68 82 Z","p|bk-f-white|M34 38 L60 38 L60 58 L34 58 Z|.85","p|bk-f-marigold|M66 40 L86 40 L86 50 L66 50 Z"],
    ["p|bk-ln|M20 28 Q20 24 24 24 L96 24 Q100 24 100 28 L100 78 Q100 82 96 82 L24 82 Q20 82 20 78 Z M52 82 L48 96 L72 96 L68 82 M40 97 L80 97","p|bk-ln bk-ln-thin|M34 38 L60 38 L60 58 L34 58 Z M38 45 L54 45 M38 51 L50 51 M66 40 L86 40 L86 50 L66 50 Z","p|bk-f-white bk-ln bk-ln-thin|M68 56 L68 72 L72 68 L76 75 L79 73 L75 66 L81 66 Z"]],
  health: [["p|bk-f-white|M22 46 Q22 40 28 40 L92 40 Q98 40 98 46 L98 90 Q98 96 92 96 L28 96 Q22 96 22 90 Z","p|bk-f-rose|M53 52 L67 52 L67 61 L76 61 L76 75 L67 75 L67 84 L53 84 L53 75 L44 75 L44 61 L53 61 Z"],
    ["p|bk-ln|M22 46 Q22 40 28 40 L92 40 Q98 40 98 46 L98 90 Q98 96 92 96 L28 96 Q22 96 22 90 Z M46 40 L46 33 Q46 27 52 27 L68 27 Q74 27 74 33 L74 40","p|bk-ln bk-ln-thin|M53 52 L67 52 L67 61 L76 61 L76 75 L67 75 L67 84 L53 84 L53 75 L44 75 L44 61 L53 61 Z"]],
  financials: [["e|bk-f-rose|58 70 34 25","p|bk-f-rose|M44 50 L40 36 L55 46 Z","e|bk-f-rose|93 70 7 9","p|bk-f-rose|M36 86 L36 99 L46 99 L46 90 Z M68 90 L68 99 L78 99 L78 86 Z","c|bk-f-glow|60 27 10"],
    ["e|bk-ln|58 70 34 25","p|bk-ln bk-ln-thin|M44 50 L40 36 L55 46","e|bk-ln bk-ln-thin|93 70 7 9","p|bk-ln bk-ln-thin|M36 88 L36 99 L46 99 L46 92 M68 92 L68 99 L78 99 L78 88","p|bk-ln|M51 47 L67 47","c|bk-ln bk-ln-thin|60 27 10","p|bk-ln bk-ln-thin|M60 22 L60 32","c|bk-f-ink|79 62 2.6","c|bk-f-ink|91 68 1.4","c|bk-f-ink|95 68 1.4","p|bk-ln bk-ln-thin|M24 67 Q14 63 18 56 Q23 51 26 58"]],
  discretionary: [["p|bk-f-marigold|M64 14 L62 46 L30 44 Z","p|bk-f-rose|M64 14 L94 46 L62 46 Z","p|bk-f-marigold|M62 46 L94 46 L60 84 Z","p|bk-f-rose|M30 44 L62 46 L60 84 Z","p|bk-f-lilac|M52 92 L58 96 L52 100 Z M64 96 L58 100 L64 104 Z"],
    ["p|bk-ln|M64 14 L94 46 L60 84 L30 44 Z","p|bk-ln bk-ln-thin|M64 14 L60 84 M30 44 L94 46","p|bk-ln bk-ln-thin|M60 84 Q50 92 58 98 Q66 104 56 112"]],
  staples: [["p|bk-f-white|M24 62 Q26 42 46 40 Q60 30 76 40 Q96 42 96 62 Z","p|bk-f-sky|M18 62 L102 62 Q100 92 74 98 L46 98 Q20 92 18 62 Z","p|bk-f-sky|M48 98 L72 98 L70 105 L50 105 Z"],
    ["p|bk-ln|M18 62 L102 62 Q100 92 74 98 L46 98 Q20 92 18 62 Z M48 98 L50 105 L70 105 L72 98","p|bk-ln bk-ln-thin|M24 62 Q26 42 46 40 Q60 30 76 40 Q96 42 96 62","p|bk-ln bk-ln-thin bk-ln-soft|M40 50 L43 48 M54 44 L57 45 M66 49 L69 47 M78 52 L81 53 M48 56 L51 55 M62 56 L65 57","p|bk-ln bk-ln-thin|M30 78 Q36 73 42 78 Q48 83 54 78 Q60 73 66 78 Q72 83 78 78 Q84 73 90 78","p|bk-ln|M72 32 L108 14 M76 36 L110 22","p|bk-ln bk-ln-thin bk-ln-soft|M42 30 Q38 24 42 18 Q46 12 42 6 M56 28 Q52 22 56 16"]],
  industrials: [["p|bk-f-sand|M78.0 64.0 L85.8 67.6 L84.5 73.7 L75.9 73.8 L72.4 79.4 L76.1 87.2 L71.1 91.0 L64.5 85.6 L58.2 87.6 L56.0 95.9 L49.8 95.7 L48.2 87.3 L42.0 84.8 L35.0 89.8 L30.4 85.6 L34.6 78.1 L31.4 72.2 L22.9 71.5 L22.0 65.3 L30.1 62.3 L31.4 55.8 L25.3 49.8 L28.6 44.5 L36.7 47.3 L42.0 43.2 L41.2 34.7 L47.1 32.7 L51.5 40.1 L58.2 40.4 L63.0 33.3 L68.8 35.6 L67.4 44.1 L72.4 48.6 L80.7 46.3 L83.6 51.8 L77.1 57.4Z","c|bk-f-paper|54 64 9","p|bk-f-marigold|M103.0 30.0 L107.8 32.3 L106.8 36.2 L101.4 35.6 L98.9 38.6 L100.1 43.8 L96.4 45.4 L93.5 40.9 L89.6 40.7 L86.2 44.9 L82.7 43.0 L84.4 38.0 L82.1 34.8 L76.7 34.8 L76.0 30.9 L81.0 29.0 L82.1 25.2 L78.7 21.1 L81.4 18.0 L85.9 20.8 L89.6 19.3 L90.7 14.1 L94.7 14.2 L95.4 19.5 L98.9 21.4 L103.7 19.0 L106.0 22.3 L102.3 26.1Z"],
    ["p|bk-ln|M78.0 64.0 L85.8 67.6 L84.5 73.7 L75.9 73.8 L72.4 79.4 L76.1 87.2 L71.1 91.0 L64.5 85.6 L58.2 87.6 L56.0 95.9 L49.8 95.7 L48.2 87.3 L42.0 84.8 L35.0 89.8 L30.4 85.6 L34.6 78.1 L31.4 72.2 L22.9 71.5 L22.0 65.3 L30.1 62.3 L31.4 55.8 L25.3 49.8 L28.6 44.5 L36.7 47.3 L42.0 43.2 L41.2 34.7 L47.1 32.7 L51.5 40.1 L58.2 40.4 L63.0 33.3 L68.8 35.6 L67.4 44.1 L72.4 48.6 L80.7 46.3 L83.6 51.8 L77.1 57.4Z","c|bk-ln|54 64 9","p|bk-ln bk-ln-thin|M103.0 30.0 L107.8 32.3 L106.8 36.2 L101.4 35.6 L98.9 38.6 L100.1 43.8 L96.4 45.4 L93.5 40.9 L89.6 40.7 L86.2 44.9 L82.7 43.0 L84.4 38.0 L82.1 34.8 L76.7 34.8 L76.0 30.9 L81.0 29.0 L82.1 25.2 L78.7 21.1 L81.4 18.0 L85.9 20.8 L89.6 19.3 L90.7 14.1 L94.7 14.2 L95.4 19.5 L98.9 21.4 L103.7 19.0 L106.0 22.3 L102.3 26.1Z","c|bk-ln bk-ln-thin|92 30 4"]],
  energy: [["p|bk-f-marigold|M60 104 C36 104 26 86 30 70 C34 56 46 50 46 34 C58 42 62 50 62 58 C66 52 66 44 64 36 C80 46 92 62 90 78 C88 94 78 104 60 104 Z","p|bk-f-rose|M60 100 C48 100 44 90 46 82 C48 74 56 70 56 62 C64 68 70 76 70 84 C70 94 66 100 60 100 Z"],
    ["p|bk-ln|M60 104 C36 104 26 86 30 70 C34 56 46 50 46 34 C58 42 62 50 62 58 C66 52 66 44 64 36 C80 46 92 62 90 78 C88 94 78 104 60 104 Z","p|bk-ln bk-ln-thin|M60 100 C48 100 44 90 46 82 C48 74 56 70 56 62 C64 68 70 76 70 84 C70 94 66 100 60 100 Z"]],
  materials: [["p|bk-f-sky|M20 98 Q18 78 34 72 Q50 64 60 78 Q70 94 60 100 Z","p|bk-f-lilac|M54 100 Q54 84 68 80 Q86 76 94 88 Q98 100 88 101 Z","c|bk-f-glow|44 84 3"],
    ["p|bk-ln|M20 98 Q18 78 34 72 Q50 64 60 78 Q70 94 60 100 Z M54 100 Q54 84 68 80 Q86 76 94 88 Q98 100 88 101","p|bk-ln bk-ln-heavy|M50 30 L86 78","p|bk-f-white bk-ln bk-ln-thin|M24 40 Q44 12 76 20 Q60 22 52 28 Q40 30 24 40 Z","p|bk-ln bk-ln-thin bk-ln-soft|M10 102 L110 102"]],
  utilities: [["p|bk-f-glow|M60 14 C40 14 30 30 32 46 C34 58 44 64 46 74 L74 74 C76 64 86 58 88 46 C90 30 80 14 60 14 Z","p|bk-f-sand|M46 74 L74 74 L72 90 L48 90 Z","p|bk-f-sky|M96 62 C96 62 108 78 108 86 C108 93 102 98 96 98 C90 98 84 93 84 86 C84 78 96 62 96 62 Z"],
    ["p|bk-ln|M60 14 C40 14 30 30 32 46 C34 58 44 64 46 74 L74 74 C76 64 86 58 88 46 C90 30 80 14 60 14 Z M46 74 L48 90 L72 90 L74 74","p|bk-ln bk-ln-thin|M48 80 L72 80 M49 85 L71 85 M54 90 Q60 98 66 90 M54 56 L60 46 L66 56","p|bk-ln bk-ln-thin|M96 62 C96 62 108 78 108 86 C108 93 102 98 96 98 C90 98 84 93 84 86 C84 78 96 62 96 62 Z"]],
  realestate: [["p|bk-f-white|M30 60 L90 60 L90 98 L30 98 Z","p|bk-f-rose|M22 62 L60 30 L98 62 Z","p|bk-f-rose|M76 40 L76 24 L86 24 L86 48 Z","p|bk-f-sky|M52 74 L66 74 L66 98 L52 98 Z","p|bk-f-glow|M35 70 L46 70 L46 81 L35 81 Z","p|bk-f-glow|M73 70 L84 70 L84 81 L73 81 Z"],
    ["p|bk-ln|M30 62 L30 98 L90 98 L90 62 M22 62 L60 30 L98 62 M76 41 L76 24 L86 24 L86 49","p|bk-ln bk-ln-thin|M52 98 L52 74 L66 74 L66 98 M35 70 L46 70 L46 81 L35 81 Z M40.5 70 L40.5 81 M35 75.5 L46 75.5 M73 70 L84 70 L84 81 L73 81 Z M78.5 70 L78.5 81 M73 75.5 L84 75.5","p|bk-ln bk-ln-thin bk-ln-soft|M81 18 Q76 13 81 8 Q86 3 82 0","p|bk-ln bk-ln-thin bk-ln-soft|M12 99 L108 99"]],
  communication: [["p|bk-f-white|M18 30 Q18 22 26 22 L74 22 Q82 22 82 30 L82 56 Q82 64 74 64 L44 64 L31 76 L33 64 L26 64 Q18 64 18 56 Z","p|bk-f-sky|M46 78 Q46 70 54 70 L94 70 Q102 70 102 78 L102 94 Q102 102 94 102 L90 102 L92 112 L80 102 L54 102 Q46 102 46 94 Z"],
    ["p|bk-ln|M18 30 Q18 22 26 22 L74 22 Q82 22 82 30 L82 56 Q82 64 74 64 L44 64 L31 76 L33 64 L26 64 Q18 64 18 56 Z","c|bk-f-ink|36 43 4","c|bk-f-ink|50 43 4","c|bk-f-ink|64 43 4","p|bk-ln|M46 78 Q46 70 54 70 L94 70 Q102 70 102 78 L102 94 Q102 102 94 102 L90 102 L92 112 L80 102 L54 102 Q46 102 46 94 Z","p|bk-ln bk-ln-thin|M56 82 L92 82 M56 90 L82 90"]],
  globe: [["c|bk-f-sky|60 60 40","p|bk-f-meadow|M36 34 Q50 24 60 32 Q60 44 48 46 Q40 54 32 46 Q28 40 36 34 Z","p|bk-f-meadow|M64 50 Q78 46 86 56 Q90 70 80 82 Q70 86 66 76 Q60 64 64 50 Z","p|bk-f-meadow|M34 66 Q46 62 48 74 Q46 88 38 90 Q28 82 34 66 Z"],
    ["c|bk-ln|60 60 40","e|bk-ln bk-ln-thin bk-ln-soft|60 60 18 40","e|bk-ln bk-ln-thin bk-ln-soft|60 60 40 13","p|bk-ln bk-ln-thin|M36 34 Q50 24 60 32 Q60 44 48 46 Q40 54 32 46 Q28 40 36 34 Z M64 50 Q78 46 86 56 Q90 70 80 82 Q70 86 66 76 Q60 64 64 50 Z M34 66 Q46 62 48 74 Q46 88 38 90 Q28 82 34 66 Z"]],
};
const BOAT_FILL = ["p|bk-f-white|M8 24 L52 24 L44 38 L16 38 Z","p|bk-f-white|M30 4 L42 24 L18 24 Z"];
const BOAT_INK = ["p|bk-ln|M8 24 L52 24 L44 38 L16 38 Z","p|bk-ln|M30 4 L42 24 L18 24 Z","p|bk-ln bk-ln-thin bk-ln-soft|M30 8 L30 24"];
const VIG_TODAY = { box: "0 0 760 410", kids: [["g","","wc","",["p|bk-f-sky|M740.9 166.7 C737.9 189.4 717.0 220.7 699.8 240.5 C682.6 260.3 664.7 272.9 637.6 285.5 C610.5 298.2 580.4 307.5 537.2 316.4 C494.0 325.3 421.9 338.3 378.4 338.7 C334.8 339.1 314.9 326.0 275.8 319.0 C236.7 312.0 176.8 312.8 143.9 296.7 C110.9 280.5 99.8 246.0 77.9 222.3 C56.0 198.6 15.4 174.8 12.2 154.5 C9.1 134.2 37.4 115.2 59.0 100.5 C80.6 85.7 108.0 78.5 141.6 66.0 C175.3 53.5 223.1 34.9 261.0 25.6 C298.9 16.2 330.1 12.2 369.2 10.1 C408.2 8.0 449.5 7.1 495.3 13.0 C541.2 18.9 607.2 30.1 644.3 45.3 C681.5 60.6 701.9 84.2 718.0 104.5 C734.1 124.7 744.0 144.1 740.9 166.7Z|.42","p|bk-f-sky|M692.0 142.0 C690.5 154.7 689.2 172.1 676.2 184.5 C663.2 196.9 636.6 209.6 614.2 216.4 C591.8 223.2 575.8 221.4 542.0 225.1 C508.3 228.8 447.4 239.5 411.8 238.6 C376.1 237.7 353.0 225.1 328.3 219.5 C303.5 213.8 285.2 211.9 263.0 204.8 C240.8 197.6 206.3 186.3 194.9 176.6 C183.6 167.0 198.0 159.2 194.9 147.0 C191.8 134.9 163.4 115.8 176.3 103.6 C189.2 91.5 243.2 82.0 272.4 74.1 C301.6 66.2 324.5 60.0 351.5 56.2 C378.5 52.4 407.5 53.6 434.3 51.2 C461.2 48.8 487.0 38.2 512.7 41.9 C538.4 45.5 560.0 62.1 588.8 73.1 C617.6 84.1 668.2 96.5 685.4 108.0 C702.6 119.5 693.6 129.2 692.0 142.0Z|.38",["g","bk-day-only","","",["c|bk-f-glow|612 92 44|.95","p|bk-f-white|M110 112 Q118 90 144 98 Q160 78 186 92 Q212 88 214 110 Q216 124 196 124 L124 124 Q104 124 110 112 Z|.95","p|bk-f-white|M352 76 Q360 60 378 66 Q390 52 408 62 Q426 60 426 76 Q426 86 412 86 L364 86 Q348 86 352 76 Z|.85"]],["g","bk-night-only","","",["p|bk-f-glow|M630 60 A40 40 0 1 0 654 124 A32 32 0 1 1 630 60 Z"]],"p|bk-f-meadow|M40 236 Q120 196 210 214 Q300 176 400 206 Q500 170 600 200 Q680 186 738 214 Q748 252 730 268 L46 272 Q28 256 40 236 Z|.55","p|bk-f-sea|M750.9 342.3 C750.1 350.4 707.5 356.9 686.9 363.3 C666.3 369.7 656.5 376.0 627.3 380.7 C598.2 385.4 549.9 388.7 512.2 391.5 C474.5 394.3 442.5 397.2 401.2 397.6 C360.0 398.0 304.0 396.8 264.5 394.1 C225.0 391.5 198.8 387.5 164.2 381.6 C129.7 375.8 80.5 366.2 57.0 358.9 C33.6 351.6 21.5 344.8 23.8 337.9 C26.0 330.9 50.2 324.7 70.4 317.3 C90.5 309.8 113.6 299.3 144.5 293.3 C175.5 287.3 211.8 283.7 256.0 281.3 C300.3 278.9 364.4 278.5 410.1 279.0 C455.8 279.5 491.9 281.6 530.2 284.3 C568.4 287.0 612.9 290.4 639.8 295.4 C666.7 300.4 673.2 306.6 691.8 314.4 C710.3 322.2 751.7 334.1 750.9 342.3Z|.72","p|bk-f-meadow|M18 296 Q70 240 150 246 Q232 250 286 286 Q300 304 290 318 L30 324 Q8 314 18 296 Z|.95","p|bk-f-sand|M560 300 Q600 270 652 276 Q700 282 716 302 Q700 314 640 314 Q580 314 560 300 Z|.9","p|bk-f-white|M92 222 L156 222 L156 252 L92 252 Z","p|bk-f-rose|M80 226 Q104 210 124 186 Q144 210 168 226 Z","p|bk-f-glow|M102 230 L116 230 L116 244 L102 244 Z","p|bk-f-sky|M132 232 L146 232 L146 252 L132 252 Z","c|bk-f-meadow|232 236 24","c|bk-f-meadow|220 226 15","p|bk-f-meadow bk-fronds|M676 236 Q656 226 640 236 M676 236 Q662 216 648 214 M676 236 Q684 214 700 210 M676 236 Q698 228 712 240 M676 236 Q690 244 694 258"]],["g","","ink","",["p|bk-ln bk-ln-thin bk-ln-soft|M40 236 Q120 196 210 214 Q300 176 400 206 Q500 170 600 200 Q680 186 738 214","p|bk-ln bk-ln-thin|M18 296 Q70 240 150 246 Q232 250 286 286","p|bk-ln bk-ln-thin|M92 224 L92 252 L156 252 L156 224 M80 226 Q104 210 124 186 Q144 210 168 226 Z M76 222 Q74 216 80 214 M172 222 Q174 216 168 214 M124 186 L124 178","p|bk-ln bk-ln-thin|M102 230 L116 230 L116 244 L102 244 Z M132 252 L132 232 L146 232 L146 252 M98 252 L98 272 M150 252 L150 272 M124 252 L124 270","p|bk-ln bk-ln-thin|M232 290 L232 258 M232 270 L244 258","p|bk-ln bk-ln-thin|M664 300 Q670 268 676 236","p|bk-ln bk-ln-thin|M676 236 Q656 226 640 236 M676 236 Q662 216 648 214 M676 236 Q684 214 700 210 M676 236 Q698 228 712 240 M676 236 Q690 244 694 258","p|bk-ln bk-ln-thin|M560 300 Q600 270 652 276 Q700 282 716 302","p|bk-ln bk-ln-thin bk-ln-soft|M520 66 q6 -6 12 0 q6 -6 12 0 M552 98 q5 -5 10 0 q5 -5 10 0 M486 112 q4 -4 8 0 q4 -4 8 0",["g","bk-night-only","","",["p|bk-ln bk-ln-thin|M470 50 l0 10 M465 55 l10 0 M300 120 l0 8 M296 124 l8 0 M700 170 l0 8 M696 174 l8 0 M230 52 l0 8 M226 56 l8 0 M540 150 l0 6 M537 153 l6 0"]]]],["g","bk-drift","","",["p|bk-ln bk-ln-white bk-wave|M70 334 Q100 326 130 334 T190 334 M318 356 Q348 348 378 356 T438 356 M520 332 Q550 324 580 332 T640 332 M180 376 Q210 368 240 376 T300 376 M560 372 Q590 364 620 372 T680 372"]],["g","","","translate(372 254) scale(1.95)",[["g","bk-bob","","",["e|bk-f-sea|30 41 22 3.2|.6",["g","","wc","",["p|bk-f-white|M8 24 L52 24 L44 38 L16 38 Z","p|bk-f-white|M30 4 L42 24 L18 24 Z"]],["g","","ink","",["p|bk-ln|M8 24 L52 24 L44 38 L16 38 Z","p|bk-ln|M30 4 L42 24 L18 24 Z","p|bk-ln bk-ln-thin bk-ln-soft|M30 8 L30 24"]]]]]]] };
const VIG_CARS = { box: "0 0 760 380", kids: [["g","","wc","",["p|bk-f-sky|M710.2 139.7 C714.7 157.5 727.8 186.3 714.2 202.7 C700.5 219.1 658.2 224.9 628.4 238.1 C598.5 251.2 572.6 272.1 535.3 281.5 C497.9 290.9 451.6 296.2 404.2 294.5 C356.7 292.8 294.6 279.2 250.5 271.4 C206.4 263.6 174.1 258.1 139.7 247.7 C105.4 237.3 57.1 224.1 44.1 209.2 C31.2 194.4 56.2 178.6 61.9 158.5 C67.7 138.3 66.6 105.0 78.6 88.3 C90.6 71.6 107.7 70.6 133.9 58.1 C160.1 45.7 196.7 20.8 235.8 13.7 C275.0 6.6 321.0 14.5 368.6 15.7 C416.2 16.8 473.4 14.1 521.6 20.5 C569.9 26.9 630.5 41.6 658.2 54.1 C685.8 66.6 678.7 81.5 687.4 95.8 C696.1 110.1 705.8 121.9 710.2 139.7Z|.45",["g","bk-day-only","","",["c|bk-f-glow|618 86 38|.95","p|bk-f-white|M120 100 Q128 80 152 88 Q166 70 190 82 Q214 78 216 98 Q218 112 198 112 L132 112 Q114 112 120 100 Z|.9"]],["g","bk-night-only","","",["p|bk-f-glow|M636 56 A36 36 0 1 0 660 114 A28 28 0 1 1 636 56 Z"]],"p|bk-f-meadow|M40 222 Q130 168 240 196 Q330 150 430 190 Q520 158 620 186 Q700 172 736 204 Q744 236 728 250 L52 254 Q30 240 40 222 Z|.5","p|bk-f-meadow|M22 262 Q90 214 200 228 Q290 238 352 286 Q330 340 250 362 Q120 372 48 350 Q4 314 22 262 Z|.95","p|bk-f-meadow|M440 280 Q520 226 620 224 Q712 226 742 262 Q756 316 716 350 Q620 370 520 360 Q446 330 440 280 Z|.85","p|bk-f-sand|M236 370 C300 318 384 262 420 214 L446 214 C474 262 524 318 592 370 Q414 382 236 370 Z","c|bk-f-meadow|126 246 28","c|bk-f-meadow|115 235 17|.8","c|bk-f-meadow|668 232 22","c|bk-f-meadow|659 223 13|.8","c|bk-f-meadow|560 214 14","c|bk-f-meadow|554 208 8|.8","p|bk-f-white|M626 270 L688 270 L688 294 L626 294 Z"]],["g","","ink","",["p|bk-ln bk-ln-thin bk-ln-soft|M40 222 Q130 168 240 196 Q330 150 430 190 Q520 158 620 186 Q700 172 736 204","p|bk-ln bk-ln-thin|M22 262 Q90 214 200 228 Q290 238 352 286 M440 280 Q520 226 620 224 Q712 226 742 262","p|bk-ln bk-ln-thin|M236 372 C300 318 384 262 420 214 M446 214 C474 262 524 318 592 372","p|bk-ln bk-road|M414 372 C420 320 428 262 433 216","p|bk-ln|M126 300 L126 270 M668 278 L668 252 M560 236 L560 226 M640 330 L640 270","c|bk-ln bk-ln-thin|126 246 28","c|bk-ln bk-ln-thin|668 232 22","c|bk-ln bk-ln-thin bk-ln-soft|560 214 14","p|bk-ln bk-ln-thin|M626 270 L688 270 L688 294 L626 294 Z M636 282 L676 282","p|bk-ln bk-ln-thin bk-ln-soft|M520 60 q6 -6 12 0 q6 -6 12 0 M548 92 q5 -5 10 0 q5 -5 10 0",["g","bk-night-only","","",["p|bk-ln bk-ln-thin|M470 50 l0 10 M465 55 l10 0 M300 110 l0 8 M296 114 l8 0 M230 52 l0 8 M226 56 l8 0"]]]],["g","","","translate(330 186) scale(1.72)",[["g","","","",["e|bk-f-ink|60 93 46 4|.18",["g","","wc","",["p|bk-f-rose|M16 80 C16 70 22 64 31 63 L41 49 C44 45 48 43 54 43 L72 43 C79 43 83 46 87 51 L95 62 C103 63 106 69 106 76 L106 80 Z","p|bk-f-white|M47 61 L53 50 C54 48.5 55.5 48 57 48 L62 48 L62 61 Z","p|bk-f-white|M67 48 L73 48 C76 48 78 49.5 80 52 L86 61 L67 61 Z","c|bk-f-glow|100 70 3.5"]],["g","","ink","",["p|bk-ln|M16 80 C16 70 22 64 31 63 L41 49 C44 45 48 43 54 43 L72 43 C79 43 83 46 87 51 L95 62 C103 63 106 69 106 76 L106 80 Z","p|bk-ln bk-ln-thin|M47 61 L53 50 C54 48.5 55.5 48 57 48 L62 48 L62 61 Z M67 48 L73 48 C76 48 78 49.5 80 52 L86 61 L67 61 Z M64 64 L64 76","c|bk-f-ink|38 81 11","c|bk-f-ink|84 81 11","c|bk-f-white|38 81 4.2","c|bk-f-white|84 81 4.2"]]]]]]] };
const VIG_LAND = { box: "0 0 760 380", wash: ["p|bk-f-sky|M710.2 139.7 C714.7 157.5 727.8 186.3 714.2 202.7 C700.5 219.1 658.2 224.9 628.4 238.1 C598.5 251.2 572.6 272.1 535.3 281.5 C497.9 290.9 451.6 296.2 404.2 294.5 C356.7 292.8 294.6 279.2 250.5 271.4 C206.4 263.6 174.1 258.1 139.7 247.7 C105.4 237.3 57.1 224.1 44.1 209.2 C31.2 194.4 56.2 178.6 61.9 158.5 C67.7 138.3 66.6 105.0 78.6 88.3 C90.6 71.6 107.7 70.6 133.9 58.1 C160.1 45.7 196.7 20.8 235.8 13.7 C275.0 6.6 321.0 14.5 368.6 15.7 C416.2 16.8 473.4 14.1 521.6 20.5 C569.9 26.9 630.5 41.6 658.2 54.1 C685.8 66.6 678.7 81.5 687.4 95.8 C696.1 110.1 705.8 121.9 710.2 139.7Z|.45",["g","bk-day-only","","",["c|bk-f-glow|618 86 38|.95","p|bk-f-white|M120 100 Q128 80 152 88 Q166 70 190 82 Q214 78 216 98 Q218 112 198 112 L132 112 Q114 112 120 100 Z|.9"]],["g","bk-night-only","","",["p|bk-f-glow|M636 56 A36 36 0 1 0 660 114 A28 28 0 1 1 636 56 Z"]],"p|bk-f-meadow|M40 222 Q130 168 240 196 Q330 150 430 190 Q520 158 620 186 Q700 172 736 204 Q744 236 728 250 L52 254 Q30 240 40 222 Z|.5","p|bk-f-meadow|M22 262 Q90 214 200 228 Q290 238 352 286 Q330 340 250 362 Q120 372 48 350 Q4 314 22 262 Z|.95","p|bk-f-meadow|M440 280 Q520 226 620 224 Q712 226 742 262 Q756 316 716 350 Q620 370 520 360 Q446 330 440 280 Z|.85","c|bk-f-meadow|126 246 28","c|bk-f-meadow|115 235 17|.8","c|bk-f-meadow|668 232 22","c|bk-f-meadow|659 223 13|.8"],
  ink: ["p|bk-ln bk-ln-thin bk-ln-soft|M40 222 Q130 168 240 196 Q330 150 430 190 Q520 158 620 186 Q700 172 736 204","p|bk-ln bk-ln-thin|M22 262 Q90 214 200 228 Q290 238 352 286 M440 280 Q520 226 620 224 Q712 226 742 262","c|bk-ln bk-ln-thin|126 246 28","c|bk-ln bk-ln-thin|668 232 22","p|bk-ln bk-ln-thin bk-ln-soft|M520 60 q6 -6 12 0 q6 -6 12 0 M548 92 q5 -5 10 0 q5 -5 10 0",["g","bk-night-only","","",["p|bk-ln bk-ln-thin|M470 50 l0 10 M465 55 l10 0 M300 110 l0 8 M296 114 l8 0 M230 52 l0 8 M226 56 l8 0"]]] };

// ------------------------------------------------------------------------------------------- painting inline pictures

function paintLeaf(spec) {
  const [kind, cls, geo, op] = spec.split("|");
  let el;
  if (kind === "p") el = h("path", { class: cls || null, d: geo });
  else {
    const n = geo.split(" ");
    el = kind === "c" ? h("circle", { class: cls || null, cx: n[0], cy: n[1], r: n[2] })
      : h("ellipse", { svg: true, class: cls || null, cx: n[0], cy: n[1], rx: n[2], ry: n[3] });
  }
  if (op) el.setAttribute("opacity", op);
  return el;
}
function paint(node) {
  if (typeof node === "string") return paintLeaf(node);
  const [, cls, filter, transform, kids] = node;
  const g = h("g", { class: cls || null, filter: filter ? `url(#${filter})` : null, transform: transform || null });
  for (const k of kids) g.appendChild(paint(k));
  return g;
}
const layer = (filter, kids, extra = {}) => paint(["g", extra.cls || "", filter, extra.t || "", kids]);

// ------------------------------------------------------------------------------------------- picture files

const BOX = { boat: [60, 46], sun: [48, 48], umbrella: [48, 48], star: [32, 32] };
function picUrl(id, theme) {
  const here = import.meta.url;
  let search = "";
  try { search = new URL(here).search; } catch { /* keep no version */ }
  return new URL(`../img/${id}-${theme}.svg${search}`, here).href;
}
function picImgs(id, w, hgt, lazy) {
  return ["day", "night"].map((theme) => {
    const img = h(`img.is-${theme}`, {
      src: picUrl(id, theme), alt: "", width: String(Math.round(w)), height: String(Math.round(hgt)), decoding: "async",
      loading: lazy ? "lazy" : null,
    });
    img.addEventListener("error", () => { img.hidden = true; });
    return img;
  });
}

/** One of PICTURES as its two pre-baked files (one shown per theme by CSS), decorative. */
export function picture(id, { size = 56, lazy = true } = {}) {
  const [bw, bh] = BOX[id] || [120, 120];
  const w = Number(size) > 0 ? Number(size) : 56;
  const hgt = (w * bh) / bw;
  const el = h("span.bk-pic", { "data-bk": "picture", "data-pic": String(id), "aria-hidden": "true",
    style: { width: `${w}px`, height: `${hgt}px` } });
  if (!PICTURES.includes(id)) { warn(`pic:${id}`, `no picture called ${JSON.stringify(id)}`); return el; }
  el.append(...picImgs(id, w, hgt, lazy));
  return el;
}

/** The paper boat (decorative), bobbing unless bob is false. */
export function boat({ bob = true, size = 46 } = {}) {
  const w = Number(size) > 0 ? Number(size) : 46;
  const hgt = (w * 46) / 60;
  const el = h("span.bk-boat", { "data-bk": "boat", "aria-hidden": "true", style: { width: `${w}px`, height: `${hgt}px` } });
  const imgs = picImgs("boat", w, hgt, false);
  if (bob) el.append(h("span.bk-bob", imgs)); else el.append(...imgs);
  return el;
}

// ------------------------------------------------------------------------------------------- watercolour filters and vignettes

/** The two live filters (#wc watercolour, #ink wobbly outlines), as the mockups define them. */
export function filterDefs() {
  const f = (tag, attrs, ...kids) => h(tag, { svg: true, ...attrs }, ...kids);
  return h("svg", { class: "bk-defs", "aria-hidden": "true", focusable: "false", width: "0", height: "0" },
    f("filter", { id: "wc", x: "-12%", y: "-12%", width: "124%", height: "124%", "color-interpolation-filters": "sRGB" },
      f("feTurbulence", { type: "fractalNoise", baseFrequency: "0.035", numOctaves: "3", seed: "7", result: "n1" }),
      f("feDisplacementMap", { in: "SourceGraphic", in2: "n1", scale: "7", xChannelSelector: "R", yChannelSelector: "G", result: "d" }),
      f("feTurbulence", { type: "fractalNoise", baseFrequency: "0.011", numOctaves: "2", seed: "3", result: "n2" }),
      f("feColorMatrix", { in: "n2", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.5 0 0 0 0.14", result: "blot" }),
      f("feComposite", { in: "d", in2: "blot", operator: "in", result: "body" }),
      f("feMorphology", { in: "d", operator: "erode", radius: "1.4", result: "er" }),
      f("feComposite", { in: "d", in2: "er", operator: "out", result: "rim" }),
      f("feColorMatrix", { in: "rim", type: "matrix", values: "0.8 0 0 0 0  0 0.8 0 0 0  0 0 0.82 0 0  0 0 0 0.55 0", result: "rimd" }),
      f("feGaussianBlur", { in: "rimd", stdDeviation: "0.5", result: "rims" }),
      f("feMerge", {}, f("feMergeNode", { in: "body" }), f("feMergeNode", { in: "rims" }))),
    f("filter", { id: "ink", x: "-6%", y: "-6%", width: "112%", height: "112%" },
      f("feTurbulence", { type: "fractalNoise", baseFrequency: "0.07", numOctaves: "2", seed: "4", result: "t" }),
      f("feDisplacementMap", { in: "SourceGraphic", in2: "t", scale: "2.4", xChannelSelector: "R", yChannelSelector: "G" })));
}

/** Put filterDefs() first in the body, once; returns the defs element. */
export function mountDefs(doc = document) {
  const have = doc.getElementById("wc");
  if (have) return have.closest("svg") || have;
  const defs = filterDefs();
  doc.body.insertBefore(defs, doc.body.firstChild);
  return defs;
}

const VIGNETTE_IDS = ["today", "cars", "financials", "energy", "staples", "health", "realestate", "industrials",
  "materials", "communication", "utilities", "discretionary", "technology", "retail", "telecom"];

function vignetteSvg(id) {
  const svg = (box) => h("svg", { viewBox: box, "aria-hidden": "true", focusable: "false", preserveAspectRatio: "xMidYMid meet" });
  if (id === "today" || id === "cars") {
    const v = id === "today" ? VIG_TODAY : VIG_CARS;
    const s = svg(v.box);
    for (const k of v.kids) s.appendChild(paint(k));
    return s;
  }
  const s = svg(VIG_LAND.box);
  s.appendChild(layer("wc", VIG_LAND.wash));
  s.appendChild(layer("ink", VIG_LAND.ink));
  const spot = SPOT[id];
  s.appendChild(paint(["g", "", "", "translate(272 128) scale(1.8)", [
    "e|bk-f-ink|60 104 44 4.5|.16",
    ["g", "", "wc", "", spot[0]],
    ["g", "", "ink", "", spot[1]],
  ]]));
  return s;
}

/** The opening picture of a chapter or a field page: inline, painted by classes, with one sentence. */
export function vignette(id, { label } = {}) {
  let key = id;
  if (!VIGNETTE_IDS.includes(key)) { warn(`vig:${id}`, `no vignette called ${JSON.stringify(id)}; drawing "today"`); key = "today"; }
  const el = h("div.bk-vignette", { role: "img", "aria-label": label || FIXED.vignettes[key], "data-bk": "vignette",
    "data-live-filter": "", "data-vignette": key });
  el.appendChild(vignetteSvg(key));
  return el;
}

// ------------------------------------------------------------------------------------------- buttons

function makeButton(cls, name, props = {}) {
  const { label, href, type = "button", onClick, icon, pressed, disabled = false, describedBy, id } = props;
  const el = href != null ? h(`a.${cls}`, { href }) : h(`button.${cls}`, { type });
  el.setAttribute("data-bk", name);
  if (id) el.id = id;
  const labelEl = h("span.bk-btn-label");
  let iconEl = icon ? lineIcon(icon) : null;
  if (iconEl) el.append(iconEl);
  el.append(labelEl);
  put(labelEl, label);
  if (describedBy) el.setAttribute("aria-describedby", describedBy);
  const state = { disabled: !!disabled, pressed };
  const apply = () => {
    setDisabled(el, state.disabled);
    if (state.pressed === undefined || state.pressed === null) el.removeAttribute("aria-pressed");
    else el.setAttribute("aria-pressed", String(!!state.pressed));
  };
  el.addEventListener("click", (e) => {
    if (state.disabled) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (onClick) onClick(e);
  });
  apply();
  el.bk = {
    set(p = {}) {
      if ("label" in p) { clear(labelEl); put(labelEl, p.label); }
      if ("icon" in p) {
        if (iconEl) iconEl.remove();
        iconEl = p.icon ? lineIcon(p.icon) : null;
        if (iconEl) el.insertBefore(iconEl, labelEl);
      }
      if ("disabled" in p) state.disabled = !!p.disabled;
      if ("pressed" in p) state.pressed = p.pressed;
      apply();
    },
    get: () => ({ disabled: state.disabled, pressed: state.pressed }),
  };
  return el;
}

/** The screen's one main button: --action fill, 56px. The only builder that makes a .bk-btn. */
export function button(props = {}) {
  return makeButton("bk-btn", "button", props);
}

/** Every other button: raised paper, a 2px --line edge, 48px; pressed fills with --action. */
export function quietButton(props = {}) {
  const el = makeButton("bk-quiet", "quiet-button", props);
  if (props.wide) el.classList.add("is-wide");
  return el;
}

/** A button that reads like a link (--link, underlined, 48px tall, no box). */
export function textButton(props = {}) {
  return makeButton("bk-text-btn", "text-button", props);
}

/** A toggle that says its state in words; optimistic (onChange returning false undoes the press). */
export function toggleWords(props = {}) {
  const { pressed = false, off, on, name, hintOff, hintOn, iconOff, main = false, disabled = false, describedBy, id, onChange } = props;
  const base = newId(id);
  const hintId = sub(base, "hint");
  let state = !!pressed;
  const root = h("div.bk-toggle", { "data-bk": "toggle-words" });
  const hint = h("p.bk-toggle-hint", { id: hintId });
  const words = () => (state
    ? [lineIcon("check"), h("span.bk-toggle-words", put(document.createDocumentFragment(), on)), name ? hidden(` ${name}`) : null]
    : [iconOff ? lineIcon(iconOff) : null, h("span.bk-toggle-words", put(document.createDocumentFragment(), off)), name ? hidden(` ${name}`) : null]);
  const btn = (main ? button : quietButton)({ label: words(), pressed: state, disabled, id: id || null,
    describedBy: ids(hasContent(hintOn) || hasContent(hintOff) ? hintId : null, describedBy) });
  root.append(btn);
  if (hasContent(hintOn) || hasContent(hintOff)) root.append(hint);
  const render = () => {
    btn.bk.set({ label: words(), pressed: state });
    clear(hint);
    const t = state ? hintOn : hintOff;
    put(hint, t);
    hint.hidden = !hasContent(t);
  };
  render();
  btn.addEventListener("click", () => {
    if (isDisabled(btn)) return;
    const prev = state;
    state = !state;
    render();
    if (onChange && onChange(state, root) === false) { state = prev; render(); }
  });
  root.bk = {
    get: () => state,
    set(b) { state = !!b; render(); },
    setDisabled(b) { btn.bk.set({ disabled: !!b }); },
  };
  return root;
}

/** A round box and words: "Mark as placed" <-> "Placed at 10:12" in --done. Optimistic. */
export function tick(props = {}) {
  const { placed = false, label = FIXED.tick.mark, placedLabel = FIXED.tick.placed, context, disabled = false, describedBy, id, onChange } = props;
  const st = { placed: !!placed, label, placedLabel };
  const box = h("span.bk-tick-box", { "aria-hidden": "true" });
  const words = h("span.bk-tick-label");
  const el = h("button.bk-tick", { type: "button", "data-bk": "tick", id: id || null, "aria-describedby": describedBy || null },
    box, words, context ? hidden(`: ${context}`) : null);
  setDisabled(el, disabled);
  const render = () => {
    el.setAttribute("aria-pressed", String(st.placed));
    clear(box);
    if (st.placed) box.append(doneMark());
    words.textContent = st.placed ? st.placedLabel : st.label;
  };
  render();
  el.addEventListener("click", () => {
    if (isDisabled(el)) return;
    const prev = st.placed;
    st.placed = !st.placed;
    render();
    if (onChange && onChange(st.placed, el) === false) { st.placed = prev; render(); }
  });
  el.bk = {
    get: () => st.placed,
    set(p = {}) {
      if (typeof p === "boolean") p = { placed: p };
      if ("placed" in p) st.placed = !!p.placed;
      if ("placedLabel" in p) st.placedLabel = p.placedLabel;
      if ("label" in p) st.label = p.label;
      if ("disabled" in p) setDisabled(el, !!p.disabled);
      render();
    },
  };
  return el;
}

/** A switch row (role="switch") with its state word: Still pictures, Night pages. Optimistic. */
export function switchRow(props = {}) {
  const { label, checked = false, words = FIXED.switchWords, hint, onChange, id } = props;
  const base = newId(id);
  let state = !!checked;
  const word = h("span.bk-switch-word", { "aria-hidden": "true" });
  const sw = h("button.bk-switch", { type: "button", role: "switch", id: base,
    "aria-describedby": hasContent(hint) ? sub(base, "hint") : null },
  h("span.bk-switch-label", label), word, h("span.bk-switch-knob", { "aria-hidden": "true" }));
  const root = h("div.bk-switch-row", { "data-bk": "switch-row" }, sw,
    hasContent(hint) ? put(h("p.bk-switch-hint", { id: sub(base, "hint") }), hint) : null);
  const render = () => { sw.setAttribute("aria-checked", String(state)); word.textContent = words[state ? 1 : 0]; };
  render();
  sw.addEventListener("click", () => {
    if (isDisabled(sw)) return;
    const prev = state;
    state = !state;
    render();
    if (onChange && onChange(state, root) === false) { state = prev; render(); }
  });
  root.bk = { get: () => state, set(b) { state = !!b; render(); } };
  return root;
}

function makePill(name, { icon, label, pressed = false, onChange } = {}) {
  let state = !!pressed;
  const el = h("button.bk-pill", { type: "button", "data-bk": name }, icon ? lineIcon(icon) : null, h("span", label));
  const render = () => el.setAttribute("aria-pressed", String(state));
  render();
  el.addEventListener("click", () => {
    if (isDisabled(el)) return;
    const prev = state;
    state = !state;
    render();
    if (onChange && onChange(state, el) === false) { state = prev; render(); }
  });
  el.bk = { get: () => state, set(b) { state = !!b; render(); } };
  return el;
}

/** The phone top bar's Still pill: aria-pressed="true" means Still pictures is on. */
export function stillPill({ pressed = false, onChange, label = FIXED.stillPill } = {}) {
  return makePill("still-pill", { icon: "pause", label, pressed, onChange });
}

/** The same pill with any icon and words (for example moon + "Night"). */
export function pillToggle(props = {}) {
  return makePill("pill-toggle", props);
}

/** A chip: 44px, a pill. With pressed given it is a filter chip (aria-pressed, a tick when on). */
export function chip(props = {}) {
  const { label, count, pressed, icon, disabled = false, describedBy, id, onChange, onClick } = props;
  const isFilter = pressed !== undefined && pressed !== null;
  const st = { pressed: !!pressed, count };
  const mark = h("span.bk-chip-mark", { "aria-hidden": "true" });
  const countEl = h("span.bk-chip-count.num");
  const el = h("button.bk-chip", { type: "button", "data-bk": "chip", id: id || null, "aria-describedby": describedBy || null },
    isFilter ? mark : null, icon ? lineIcon(icon) : null, h("span.bk-chip-label", label), countEl);
  setDisabled(el, disabled);
  const render = () => {
    if (isFilter) {
      el.setAttribute("aria-pressed", String(st.pressed));
      clear(mark);
      if (st.pressed) mark.append(lineIcon("check"));
    }
    countEl.textContent = st.count === undefined || st.count === null || st.count === "" ? "" : String(st.count);
    countEl.hidden = !countEl.textContent;
  };
  render();
  el.addEventListener("click", (e) => {
    if (isDisabled(el)) return;
    if (!isFilter) { if (onClick) onClick(e); return; }
    const prev = st.pressed;
    st.pressed = !st.pressed;
    render();
    if (onChange && onChange(st.pressed, el) === false) { st.pressed = prev; render(); }
  });
  el.bk = {
    get: () => (isFilter ? st.pressed : undefined),
    set(p = {}) {
      if ("pressed" in p && isFilter) st.pressed = !!p.pressed;
      if ("count" in p) st.count = p.count;
      if ("disabled" in p) setDisabled(el, !!p.disabled);
      render();
    },
  };
  return el;
}

/** A labelled group of filter chips: single (exactly one pressed) or multi. Optimistic. */
export function chipGroup(props = {}) {
  const { label, chips = [], selected, single = true, note: noteText, onChange, id } = props;
  const base = newId(id);
  let sel = single ? (selected ?? (chips[0] && chips[0].id)) : new Set(Array.isArray(selected) ? selected : []);
  const list = h("ul.bk-chips", { "aria-labelledby": sub(base, "label") });
  const items = new Map();
  const root = h("div.bk-chip-group", { "data-bk": "chip-group" }, h("p.bk-group-label", { id: sub(base, "label") }, label), list);
  const value = () => (single ? sel : chips.map((c) => c.id).filter((x) => sel.has(x)));
  const render = () => { for (const [cid, c] of items) c.bk.set({ pressed: single ? cid === sel : sel.has(cid) }); };
  for (const c of chips) {
    const ch = chip({ label: c.label, count: c.count, pressed: false, id: sub(base, String(c.id)),
      onChange: (next) => {
        if (single) {
          if (!next) return false;             // pressing the chosen chip keeps it
          const prev = sel;
          sel = c.id;
          render();
          if (onChange && onChange(value(), root) === false) { sel = prev; render(); return false; }
          return undefined;
        }
        const prev = new Set(sel);
        if (next) sel.add(c.id); else sel.delete(c.id);
        if (onChange && onChange(value(), root) === false) { sel = prev; render(); return false; }
        return undefined;
      } });
    ch.dataset.chip = String(c.id);
    items.set(c.id, ch);
    list.append(h("li", ch));
  }
  render();
  if (hasContent(noteText)) root.append(put(h("p.bk-note.is-soft"), noteText));
  root.bk = {
    get: value,
    set(s) { sel = single ? s : new Set(Array.isArray(s) ? s : []); render(); },
    setCounts(counts = {}) { for (const [cid, c] of items) if (cid in counts) c.bk.set({ count: counts[cid] }); },
  };
  return root;
}

/** The small chip after a fact line: an info mark and a short source; pressing it shows the sources and dates. */
export function sourceChip(props = {}) {
  const { short, items = [], id } = props;
  const base = newId(id);
  const more = h("span.bk-source-more", { id: sub(base, "more"), hidden: true });
  for (const it of items) {
    const line = h("span.bk-source-item");
    const words = [it.label, it.date ? ` · ${it.date}` : ""].join("");
    if (it.url) line.append(extLink("bk-source-link", words, it.url)); else line.append(words);
    more.append(line);
  }
  const btn = h("button.bk-source", { type: "button", "aria-expanded": "false", "aria-controls": sub(base, "more") },
    lineIcon("info"), h("span.bk-source-short", short));
  const root = h("span.bk-source-wrap", { "data-bk": "source-chip" }, btn, more);
  const setOpen = (o) => { more.hidden = !o; btn.setAttribute("aria-expanded", String(o)); };
  btn.addEventListener("click", () => setOpen(more.hidden));
  root.bk = { open: () => setOpen(true), close: () => setOpen(false) };
  return root;
}

/** The profit-rule label on every company row and page. Static, no colour, no icon. */
export function labelChip(label, { text } = {}) {
  let words = text;
  if (!words) {
    words = FIXED.labels[label];
    if (!words) { warn(`label:${label}`, `no label called ${JSON.stringify(label)}`); words = String(label ?? ""); }
  }
  return h("span.bk-label-chip", { "data-bk": "label-chip", "data-label": String(label ?? "") }, words);
}

// ------------------------------------------------------------------------------------------- inputs and folds

function fieldParts(base, labelText, hint, extraLabel) {
  const lab = h("label.bk-label", { for: base }, labelText, extraLabel || null);
  const hintEl = h("p.bk-hint", { id: sub(base, "hint") });
  put(hintEl, hint);
  hintEl.hidden = !hasContent(hint);
  const err = h("p.bk-error", { id: sub(base, "error"), hidden: true });
  return { lab, hintEl, err };
}

function errorSetter(input, err) {
  return (c) => {
    clear(err);
    put(err, c);
    const on = hasContent(c);
    err.hidden = !on;
    if (on) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
  };
}

/** A visible label, a search field and an optional hint. */
export function searchBox(props = {}) {
  const { id, label, placeholder, value = "", hint, onInput, onSubmit } = props;
  const base = newId(id);
  const { lab, hintEl } = fieldParts(base, label, hint);
  const input = h("input.bk-input", { id: base, type: "search", autocomplete: "off", enterkeyhint: "search",
    placeholder: placeholder || null, "aria-describedby": hasContent(hint) ? sub(base, "hint") : null, spellcheck: "false" });
  input.value = value;
  input.addEventListener("input", () => { if (onInput) onInput(input.value); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && onSubmit) { e.preventDefault(); onSubmit(input.value); } });
  const root = h("div.bk-search", { "data-bk": "search-box" }, lab, h("div.bk-input-icon", lineIcon("search"), input), hintEl);
  root.bk = { get: () => input.value, set(v) { input.value = v ?? ""; }, focus: () => input.focus() };
  return root;
}

/** The company list's Order menu: a visible label and a native select. */
export function orderMenu(props = {}) {
  const { id, label, options = [], value, onChange } = props;
  const base = newId(id);
  const sel = h("select.bk-input", { id: base });
  for (const o of options) sel.append(h("option", { value: o.value }, o.text));
  if (value !== undefined && value !== null) sel.value = value;
  sel.addEventListener("change", () => { if (onChange) onChange(sel.value); });
  const root = h("div.bk-select", { "data-bk": "order-menu" }, h("label.bk-label", { for: base }, label),
    h("div.bk-select-wrap", sel, lineIcon("down")));
  root.bk = { get: () => sel.value, set(v) { sel.value = v; } };
  return root;
}

const parseWhole = (s) => {
  const t = String(s ?? "").replace(/[\s,฿$]/g, "");
  if (!/^\d{1,15}$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
};
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Any amount a person types: a ฿ or $ sign inside the field, commas on blur, a whole number or null out. */
export function moneyInput(props = {}) {
  const { id, label, currency = "THB", value = null, hint, error, onInput, onCommit } = props;
  const base = newId(id);
  const usd = currency === "USD";
  const { lab, hintEl, err } = fieldParts(base, label, hint, hidden(usd ? " in dollars" : " in baht"));
  const input = h("input.bk-input.num", { id: base, inputmode: "numeric", autocomplete: "off", type: "text",
    "aria-describedby": ids(hasContent(hint) ? sub(base, "hint") : null, sub(base, "error")) });
  let cur = value === null || value === undefined ? null : parseWhole(value);
  const show = () => { input.value = cur === null ? "" : (document.activeElement === input ? String(cur) : commas(cur)); };
  show();
  input.addEventListener("focus", () => { if (cur !== null) input.value = String(cur); });
  input.addEventListener("input", () => { cur = parseWhole(input.value); if (onInput) onInput(cur); });
  const commit = () => { cur = parseWhole(input.value); if (onCommit) onCommit(cur); };
  input.addEventListener("blur", () => { commit(); if (cur !== null) input.value = commas(cur); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
  const setError = errorSetter(input, err);
  setError(error);
  const root = h("div.bk-field", { "data-bk": "money-input" }, lab,
    h("div.bk-money", h("span.bk-money-sign", { "aria-hidden": "true" }, usd ? "$" : "฿"), input), hintEl, err);
  root.bk = { get: () => cur, set(n) { cur = n === null || n === undefined ? null : parseWhole(n); show(); }, setError };
  return root;
}

/** A labelled text field or text area. */
export function textField(props = {}) {
  const { id, label, value = "", multiline = false, maxLength, hint, onInput, onCommit } = props;
  const base = newId(id);
  const { lab, hintEl, err } = fieldParts(base, label, hint);
  const input = multiline
    ? h("textarea.bk-input.bk-textarea", { id: base, rows: "4" })
    : h("input.bk-input", { id: base, type: "text", autocomplete: "off" });
  if (maxLength) input.setAttribute("maxlength", String(maxLength));
  input.setAttribute("aria-describedby", ids(hasContent(hint) ? sub(base, "hint") : null, sub(base, "error")));
  input.value = value ?? "";
  input.addEventListener("input", () => { if (onInput) onInput(input.value); });
  input.addEventListener("blur", () => { if (onCommit) onCommit(input.value); });
  if (!multiline) input.addEventListener("keydown", (e) => { if (e.key === "Enter" && onCommit) onCommit(input.value); });
  const setError = errorSetter(input, err);
  const root = h("div.bk-field", { "data-bk": "text-field" }, lab, input, hintEl, err);
  root.bk = { get: () => input.value, set(t) { input.value = t ?? ""; }, setError };
  return root;
}

/** A fold: "Five more notes", "All facts". Native details keys. */
export function fold(props = {}) {
  const { summary, children, open = false, id, onToggle } = props;
  const sum = h("summary.bk-fold-summary", put(h("span.bk-fold-words"), summary), lineIcon("down", { className: "bk-fold-icon" }));
  const body = put(h("div.bk-fold-body"), children);
  const el = h("details.bk-fold", { "data-bk": "fold", id: id || null }, sum, body);
  el.open = !!open;
  el.addEventListener("toggle", () => { if (onToggle) onToggle(el.open); });
  return el;
}

// ------------------------------------------------------------------------------------------- panels and page parts

const TONES = ["next", "sky", "meadow", "sand", "lilac", "rose", "marigold"];

/** A watercolour panel. Text inside keeps the wash rule; live adds the #wc filter (the next-step panel only). */
export function washPanel(props = {}) {
  const { tone = "next", live = false, as = "div", labelledBy, children } = props;
  let t = tone;
  if (!TONES.includes(t)) { warn(`tone:${tone}`, `no wash tone ${JSON.stringify(tone)} (sea is never under text); using "next"`); t = "next"; }
  const tag = ["div", "section", "aside"].includes(as) ? as : "div";
  const el = h(`${tag}.bk-wash.bk-wash-${t}`, { "data-bk": "wash-panel", "aria-labelledby": labelledBy || null,
    "data-live-filter": live ? "" : null });
  put(el, children);
  return el;
}

/** The chapter heading on Today and the title block of a field page. */
export function openingHead(props = {}) {
  const { kicker, title, scale = "chapter", level = 1, lines = [], after, vignette: pic, id } = props;
  const hd = h(`h${level === 2 ? 2 : 1}.${scale === "page" ? "bk-title-page" : "bk-title-chapter"}`, { id: id || null },
    kicker ? [h("span.bk-kicker", kicker), hidden(": ")] : null, put(h("span.bk-title-main"), title));
  const text = h("div.bk-opening-text", hd);
  for (const l of lines || []) text.append(put(h("p.bk-lede"), l));
  if (hasContent(after)) text.append(put(h("div.bk-opening-after"), after));
  const el = h("header.bk-opening.bk-bloom", { "data-bk": "opening-head" }, text);
  if (pic) el.append(h("div.bk-opening-pic", pic)); else el.classList.add("is-no-pic");
  return el;
}

/** A section heading with an optional intro line. */
export function sectionHead({ title, level = 2, intro, id } = {}) {
  const hd = h(level === 3 ? "h3.bk-h3" : "h2.bk-h2", { id: id || null });
  put(hd, title);
  return h("div.bk-section-head", { "data-bk": "section-head" }, hd, hasContent(intro) ? put(h("p.bk-soft"), intro) : null);
}

/** A back link with the back icon ("All fields"), 48px tall. */
export function crumb({ href, label } = {}) {
  return h("a.bk-crumb", { href: href || "#", "data-bk": "crumb" }, lineIcon("back"), h("span", label));
}

/** A plain 18px line: freshness, records, coverage, caveats of a list. */
export function note(content, { tone = "soft", id } = {}) {
  return put(h(`p.bk-note.is-${tone === "ink" ? "ink" : "soft"}`, { "data-bk": "note", id: id || null }), content);
}

const STATES = ["done", "wait", "info", "problem"];
function stateIcon(state) {
  if (state === "done") return doneMark();
  return lineIcon(state === "wait" ? "clock" : state === "problem" ? "alert" : "info");
}

/** A status is always an icon and words; the words carry the meaning, never the colour. */
export function statusLine({ state = "info", content, id } = {}) {
  const s = STATES.includes(state) ? state : "info";
  return h(`p.bk-status.is-${s}`, { "data-bk": "status-line", id: id || null },
    h("span.bk-status-icon", { "aria-hidden": "true" }, stateIcon(s)), put(h("span.bk-status-words"), content));
}

/** A notice on top of a page. Actions are text or quiet buttons, never a .bk-btn. */
export function banner({ state = "info", title, content, actions, live = false } = {}) {
  const s = STATES.includes(state) ? state : "info";
  const acts = (Array.isArray(actions) ? actions : actions ? [actions] : []).filter(Boolean);
  if (acts.some((a) => a.classList && a.classList.contains("bk-btn"))) warn("banner-btn", "a banner's actions are never a main button");
  const body = h("div.bk-banner-body",
    hasContent(title) ? put(h("p.bk-banner-title"), title) : null,
    hasContent(content) ? put(h("div.bk-banner-text"), content) : null,
    acts.length ? h("div.bk-banner-actions", acts) : null);
  return h(`div.bk-banner.is-${s}`, { "data-bk": "banner", role: live ? "status" : null },
    h("span.bk-banner-icon", { "aria-hidden": "true" }, stateIcon(s)), body);
}

/** The footer: the fixed disclaimer first, then the host's lines. */
export function pageFoot({ lines = [] } = {}) {
  const el = h("footer.bk-foot", { "data-bk": "page-foot" }, h("p", FIXED.footer));
  for (const l of lines || []) el.append(put(h("p"), l));
  return el;
}

// ------------------------------------------------------------------------------------------- facts, fields, companies

const WORDISH = /[\p{L}\p{N}_]/u;
/** Text with every mask (exact, longest first, not touching a letter or digit) wrapped in span[data-mask]. */
function masked(text, masks) {
  const list = [...new Set((masks || []).filter((m) => typeof m === "string" && m))].sort((a, b) => b.length - a.length);
  const s = String(text ?? "");
  if (!list.length) return [s];
  const out = [];
  let i = 0, plain = "";
  while (i < s.length) {
    let hit = null;
    for (const m of list) {
      if (s.startsWith(m, i) && !(i > 0 && WORDISH.test(s[i - 1])) && !(i + m.length < s.length && WORDISH.test(s[i + m.length]))) { hit = m; break; }
    }
    if (hit) {
      if (plain) { out.push(plain); plain = ""; }
      out.push(h("span", { "data-mask": "" }, hit));
      i += hit.length;
    } else { plain += s[i]; i += 1; }
  }
  if (plain) out.push(plain);
  return out;
}

function factItems(lines, masks) {
  const ul = h("ul.bk-facts");
  for (const ln of lines || []) {
    const src = ln && ln.source;
    ul.append(h("li.bk-fact", h("span.bk-fact-text", masked(ln && ln.text, masks)),
      src && hasContent(src.short) ? sourceChip({ short: src.short, items: src.items || [] }) : null));
  }
  return ul;
}

/** The two pages of one sheet: what has been going well, and what could go wrong. Same paper, ink and weight. */
export function bookSpread(props = {}) {
  const { well = [], wrong = [], masks = [], fixedLine = true, level = 3, compact = false, id } = props;
  const base = newId(id);
  if (!well.length || !wrong.length) warn("spread-empty", "a book spread side has no lines (both sides are never empty)");
  const hTag = level === 4 ? "h4" : "h3";
  const side = (cls, pic, title, lines) => h(`section.bk-side.${cls}`, { "aria-labelledby": sub(base, cls.slice(3)) },
    h("div.bk-side-head", picture(pic, { size: compact ? 40 : 48, lazy: false }),
      h(`${hTag}.bk-side-title`, { id: sub(base, cls.slice(3)) }, title)),
    factItems(lines, masks));
  const el = h("div.bk-spread-wrap", { "data-bk": "book-spread", "data-fact-surface": "" },
    fixedLine ? h("p.bk-both-note", FIXED.bothSides) : null,
    h(`div.bk-spread${compact ? ".is-compact" : ""}`, side("is-well", "sun", FIXED.well, well), side("is-wrong", "umbrella", FIXED.wrong, wrong)));
  if (id) el.id = id;
  return el;
}

/** "In the news": third-party headlines, quoted, newest first as given, outside both sides, never coloured. */
export function headlineList(props = {}) {
  const { items = [], note: noteText, none, attribution } = props;
  const el = h("div.bk-news-wrap", { "data-bk": "headline-list" });
  if (hasContent(noteText)) el.append(put(h("p.bk-soft"), noteText));
  if (items.length) {
    const ul = h("ul.bk-news", { "data-third-party": "" });
    for (const it of items) {
      ul.append(h("li", extLink("bk-news-link", `“${it.title}”`, it.url, lineIcon("external", { className: "bk-ext" })),
        h("span.bk-news-meta", [it.publisher, it.date].filter(Boolean).join(" · "))));
    }
    el.append(ul);
  } else if (hasContent(none)) el.append(put(h("p.bk-soft"), none));
  if (hasContent(attribution)) el.append(put(h("p.bk-attrib"), attribution));
  return el;
}

/** Plain external links with a meta line ("10-K filed with the SEC" · "Fri 30 Jan 2026"). */
export function linkList({ items = [], label } = {}) {
  const ul = h("ul.bk-links", { "data-bk": "link-list", "aria-label": label || null });
  for (const it of items) ul.append(h("li", extLink("bk-link", it.text, it.url), hasContent(it.meta) ? h("span.bk-link-meta", it.meta) : null));
  return ul;
}

/** The numbers table behind "All facts". Under 560px each row becomes a block. */
export function factTable(props = {}) {
  const { caption, columns = ["Fact", "Value", "Date", "Source"], rows = [] } = props;
  const cols = columns.length === 4 ? columns : ["Fact", "Value", "Date", "Source"];
  const tb = h("tbody");
  for (const r of rows) {
    tb.append(h("tr", h("th", { scope: "row" }, r.label),
      h("td", { "data-col": "value", "data-label": cols[1] }, r.value ?? ""),
      h("td", { "data-col": "date", "data-label": cols[2] }, r.date ?? ""),
      h("td", { "data-col": "source", "data-label": cols[3] }, r.source ?? "")));
  }
  return h("table.bk-table", { "data-bk": "fact-table" }, hasContent(caption) ? put(h("caption"), caption) : null,
    h("thead", h("tr", cols.map((c) => h("th", { scope: "col" }, c)))), tb);
}

/** The column headings over a company list (wide screens only; each row carries its own labels). */
export function companyListHead({ columns = [] } = {}) {
  // the action column has no heading and is added here: a trailing empty heading is that column, so it is not counted
  const cols = [...columns];
  while (cols.length > 1 && !hasContent(cols[cols.length - 1])) cols.pop();
  const facts = Math.max(0, cols.length - 1);
  return h("div.bk-co-head", { "data-bk": "company-list-head", "aria-hidden": "true", style: { "--bk-co-facts": String(facts) } },
    cols.map((c) => h("span", c)), h("span.bk-co-head-act"));
}

/** One company in a list; opens in place onto its own small spread (built by more() on the first open). */
export function companyRow(props = {}) {
  const { id, name, place, ticker, venue, label, facts = [], action = null, note: noteText, open = false, more, onToggle } = props;
  const base = newId(`bk-co-${String(id ?? "").replace(/[^\w-]/g, "")}-${++seq}`);
  const moreEl = h("div.bk-co-more", { id: sub(base, "more"), hidden: true });
  const nameBtn = h("button.bk-co-name", { type: "button", "aria-expanded": "false", "aria-controls": sub(base, "more") },
    h("span", { "data-mask": "" }, name));
  // the ticker is a name too (masked on fact surfaces): a ticker can spell an ordinary word
  const listing = ticker || venue
    ? h("span.bk-co-ticker", ticker ? h("span", { "data-mask": "" }, String(ticker)) : null, ticker && venue ? " · " : null, venue ? String(venue) : null)
    : null;
  const factsEl = h("div.bk-co-facts");
  for (const f of facts) {
    const val = f.wide
      ? [h("span.bk-co-fact-value.num.is-narrow", f.value), h("span.bk-co-fact-value.num.is-wide", f.wide)]
      : h("span.bk-co-fact-value.num", f.value);
    factsEl.append(h("p.bk-co-fact", h("span.bk-co-fact-label", f.label), " ", val));
  }
  const el = h("li.bk-co", { "data-bk": "company-row", "data-id": String(id ?? ""), style: { "--bk-co-facts": String(facts.length) } },
    h("div.bk-co-who", nameBtn, h("span.bk-co-place", place), listing, labelChip(label)),
    factsEl, h("div.bk-co-act", action), hasContent(noteText) ? put(h("p.bk-note.is-soft.bk-co-note"), noteText) : null, moreEl);
  let built = false;
  const setOpen = (o, fire) => {
    if (o && !built && typeof more === "function") {
      built = true;
      try { const m = more(); if (m) moreEl.append(m); } catch (e) { warn("co-more", `a company row's more() failed: ${e && e.message}`); }
    }
    moreEl.hidden = !o;
    nameBtn.setAttribute("aria-expanded", String(o));
    el.classList.toggle("is-open", o);
    if (fire && onToggle) onToggle(o, el);
  };
  nameBtn.addEventListener("click", () => setOpen(moreEl.hidden, true));
  if (open) setOpen(true, false);
  el.bk = { open: () => setOpen(true, false), close: () => setOpen(false, false), isOpen: () => !moreEl.hidden };
  return el;
}

/** Only the letters that occur; onJump(letter). */
export function letterStrip({ letters = [], onJump, label = FIXED.letters } = {}) {
  const ul = h("ul.bk-letters-list");
  const nav = h("nav.bk-letters", { "data-bk": "letter-strip", "aria-label": label }, ul);
  const fill = (ls) => {
    clear(ul);
    for (const l of ls) {
      const b = h("button.bk-letter", { type: "button" }, String(l));
      b.addEventListener("click", () => { if (onJump) onJump(l); });
      ul.append(h("li", b));
    }
  };
  fill(letters);
  nav.bk = { setLetters: fill, show(on) { nav.hidden = !on; } };
  return nav;
}

/** A field tile: the spot picture, the plain name, what is inside and a count. Never a performance number. */
export function fieldTile(props = {}) {
  const { id, name, inside, count, detail, href, chosen = false, toggle = null, onToggle } = props;
  const ribbon = h("span.bk-ribbon", { "aria-hidden": "true" }, lineIcon("check"));
  const el = h("li.bk-tile", { "data-bk": "field-tile", "data-field": String(id ?? "") }, ribbon,
    picture(id, { size: 104 }),
    h("h3.bk-tile-name", h("a.bk-tile-link", { href: href || "#" }, name)),
    h("p.bk-tile-inside", inside),
    h("p.bk-tile-count", count),
    hasContent(detail) ? put(h("p.bk-tile-detail"), detail) : null);
  let state = !!chosen;
  let tog = null;
  const render = () => { el.classList.toggle("is-chosen", state); ribbon.hidden = !state; };
  if (toggle) {
    tog = toggleWords({ pressed: state, off: toggle.off, on: toggle.on, name: toggle.name ?? name,
      onChange: (next, t) => {
        const prev = state;
        state = next;
        render();
        if (onToggle && onToggle(next, el) === false) { state = prev; render(); return false; }
        return undefined;
      } });
    tog.classList.add("bk-tile-toggle");
    el.append(tog);
  }
  render();
  el.bk = { get: () => state, set(b) { state = !!b; render(); if (tog) tog.bk.set(state); } };
  return el;
}

// ------------------------------------------------------------------------------------------- money, time and the plan

/** One order of a month: the picture, the name, "field · place", the amount and why it is that amount, the tick. */
export function orderRow(props = {}) {
  const { picture: pic, name, masks = false, sub, amount, about, why, extra = [], tick: tk, id } = props;
  const el = h("li.bk-order", { "data-bk": "order-row", id: id || null },
    h("span.bk-order-pic", pic ? picture(pic, { size: 56 }) : null),
    h("span.bk-order-name", masks ? h("span", { "data-mask": "" }, name) : name),
    hasContent(sub) ? put(h("span.bk-order-sub"), sub) : null,
    h("span.bk-order-money", h("span.bk-order-amt.bk-amount.num", amount), about ? h("span.bk-order-about.num", about) : null),
    hasContent(why) ? put(h("p.bk-order-why"), why) : null,
    ...(extra || []).map((x) => put(h("p.bk-order-extra"), x)),
    tk ? h("div.bk-order-tick", tk) : null);
  return el;
}

/** One month as a small page of the book: Done (a painted star), Today (the boat), Planned (a dashed page). */
export function chapterPage(props = {}) {
  const { index, month, full, amount, status = "later", word, large = false, onOpen } = props;
  const s = ["done", "now", "later"].includes(status) ? status : "later";
  const w = word || FIXED.chapter[s];
  const inner = [
    s === "done" ? h("span.bk-chap-deco", picture("star", { size: 32, lazy: false })) : null,
    s === "now" ? h("span.bk-chap-deco.is-boat", boat({ bob: true, size: 40 })) : null,
    h("span.bk-chap-month", { "aria-hidden": "true" }, month),
    h("span.bk-chap-amount.num", { "aria-hidden": "true" }, amount),
    h("span.bk-chap-word", { "aria-hidden": "true" }, w),
    hidden(`Chapter ${index}, ${full}: ${amount}, ${w}`),
  ];
  const li = h(`li.bk-chap.is-${s}${large ? ".is-large" : ""}`, { "data-bk": "chapter-page", "aria-current": s === "now" ? "date" : null });
  if (typeof onOpen === "function") {
    const b = h("button.bk-chap-btn", { type: "button" }, inner);
    b.addEventListener("click", () => onOpen());
    li.append(b);
  } else li.append(...inner.filter(Boolean));
  return li;
}

/** The year: 4 pages a row on phones, 6 from 640px (large: 3 and 4). pages are props or chapterPage elements. */
export function chapterList({ pages = [], large = false } = {}) {
  return h(`ol.bk-chapters${large ? ".is-large" : ""}`, { "data-bk": "chapter-list" },
    pages.map((p) => (isNode(p) ? p : chapterPage({ ...p, large }))));
}

/** A small calendar page and words: "Fri 6 · Money arrives · in 11 days". Not a control. */
export function calendarChip(props = {}) {
  const { day, date, what, when, full } = props;
  return h("div.bk-cal", { "data-bk": "calendar-chip" },
    h("span.bk-cal-page", { "aria-hidden": "true" }, h("span.bk-cal-day", day), h("span.bk-cal-date.num", date)),
    h("span.bk-cal-words", [what, when].filter(Boolean).join(" · ")), full ? hidden(`, ${full}`) : null);
}

/** An order day in the builder: a stamp, the date in words, the day's subtotal and its rows. */
export function dayGroup(props = {}) {
  const { stamp, title, subtotal, children, level = 3, id } = props;
  const base = newId(id);
  const rows = h("ul.bk-day-rows");
  put(rows, children);
  return h("section.bk-day", { "data-bk": "day-group", "aria-labelledby": sub(base, "title") },
    h("div.bk-day-head", h("span.bk-day-stamp.num", { "aria-hidden": "true" }, stamp),
      h(`${level === 4 ? "h4" : "h3"}.bk-day-title`, { id: sub(base, "title") }, title),
      hasContent(subtotal) ? h("span.bk-day-subtotal.num", subtotal) : null),
    rows);
}

/** The builder's water gauge: the placed share as water, a hatched "being added" part, the boat at the waterline.
 * Import it with an alias where ui.js's semicircle gauge is also used. */
export function gauge(props = {}) {
  const st = { total: 0, placed: 0, adding: 0, top: null, ticks: {}, label: "" };
  const top = h("div.bk-gauge-top");
  const water = h("span.bk-gauge-water");
  const add = h("span.bk-gauge-adding");
  const bar = h("div.bk-gauge-bar", { role: "img", "data-live-filter": "" }, water, add);
  const bt = h("span.bk-gauge-boat", boat({ bob: true, size: 48 }));
  const ticks = h("div.bk-gauge-ticks", { "aria-hidden": "true" });
  const el = h("div.bk-gauge.bk-wash.bk-wash-sky", { "data-bk": "gauge" }, top, h("div.bk-gauge-wrap", bt, bar), ticks);
  const draw = () => {
    const total = Number(st.total) > 0 ? Number(st.total) : 0;
    const clamp = (x) => Math.max(0, Math.min(total, Number(x) || 0));
    const placed = clamp(st.placed);
    const adding = Math.min(clamp(st.adding), total - placed);
    const p = total ? (placed / total) * 100 : 0, a = total ? (adding / total) * 100 : 0;
    water.style.width = `${p}%`;
    add.style.left = `${p}%`;
    add.style.width = `${a}%`;
    add.hidden = a <= 0;
    bt.style.left = `${p}%`;
    clear(top); put(top, st.top);
    clear(ticks);
    for (const k of ["start", "middle", "end"]) ticks.append(put(h(`span.bk-gauge-tick.is-${k}`), st.ticks[k]));
    bar.setAttribute("aria-label", st.label || "");
  };
  el.bk = {
    update(p = {}) {
      for (const k of ["total", "placed", "adding", "top", "ticks", "label"]) if (k in p) st[k] = p[k] ?? (k === "ticks" ? {} : st[k]);
      draw();
    },
  };
  el.bk.update(props);
  return el;
}

// ------------------------------------------------------------------------------------------- the split and the past picture

/** The friends' split: a proportion strip of tenths 0-1000 (null = unset, no marker). Keys, pointer, ends. */
export function splitStrip(props = {}) {
  const {
    value = null, step = 50, ends = true, words = { fields: FIXED.split.fields, world: FIXED.split.world },
    valuetext = (pct) => `${pct}% ${FIXED.split.fields}, ${100 - pct}% ${FIXED.split.world}`,
    label = FIXED.split.label, labelHidden = true, unsetText = FIXED.split.unset, disabled = false,
    disabledText = FIXED.split.noField, describedBy, onInput, onChange, onSettle, id,
  } = props;
  const base = newId(id);
  const st = { value: null, disabled: !!disabled, disabledText };
  const snap = (v) => Math.max(0, Math.min(1000, Math.round(v / step) * step));
  if (value !== null && value !== undefined && Number.isFinite(Number(value))) st.value = snap(Number(value));
  const pctOf = (v) => { const p = v / 10; return Number.isInteger(p) ? p : Math.round(p * 10) / 10; };

  const pctF = h("span.bk-split-pct.num"), pctW = h("span.bk-split-pct.num");
  const endsEl = ends ? h("div.bk-split-ends",
    h("p.bk-split-end.is-fields", pctF, h("span.bk-split-words", words.fields)),
    h("p.bk-split-end.is-world", pctW, h("span.bk-split-words", words.world))) : null;
  const lab = h(`span.bk-split-label${labelHidden ? ".visually-hidden" : ""}`, { id: sub(base, "label") }, label);
  const partF = h("span.bk-split-fields"), partW = h("span.bk-split-world"), thumb = h("span.bk-split-thumb");
  const noteEl = h("p.bk-split-note", { id: sub(base, "note") });
  const track = h("div.bk-split-track", { role: "slider", tabindex: "0", id: base, "aria-labelledby": sub(base, "label"),
    "aria-valuemin": "0", "aria-valuemax": "100", "aria-describedby": ids(sub(base, "note"), describedBy) }, partF, partW, thumb);
  const ticks = h("div.bk-split-ticks", { "aria-hidden": "true" },
    ["0%", "25%", "50%", "75%", "100%"].map((t, i) => h("span.bk-split-tick", { style: { left: `${i * 25}%` } }, t)),
    h("span.bk-split-tick-cap", FIXED.split.ticks));
  const el = h("div.bk-split", { "data-bk": "split-strip" }, endsEl, lab, track, ticks, noteEl);

  const render = () => {
    const state = st.disabled ? "disabled" : st.value === null ? "unset" : "set";
    el.setAttribute("data-state", state);
    setDisabled(track, st.disabled);
    if (state === "set") {
      const p = pctOf(st.value);
      track.setAttribute("aria-valuenow", String(p));
      track.setAttribute("aria-valuetext", valuetext(p));
      partF.style.width = `${p}%`;
      partW.style.left = `${p}%`;
      partW.style.width = `${100 - p}%`;
      thumb.style.left = `${p}%`;
      el.style.setProperty("--bk-split", `${p}%`);
      partF.hidden = p <= 0; partW.hidden = p >= 100; thumb.hidden = false;
      pctF.textContent = `${p}%`; pctW.textContent = `${pctOf(1000 - st.value)}%`;
      noteEl.textContent = ""; noteEl.hidden = true;
    } else {
      const words2 = state === "disabled" ? st.disabledText : unsetText;
      track.setAttribute("aria-valuenow", "0");
      track.setAttribute("aria-valuetext", words2);
      partF.hidden = true; partW.hidden = true; thumb.hidden = true;
      pctF.textContent = ""; pctW.textContent = "";
      noteEl.textContent = words2; noteEl.hidden = false;
    }
  };
  render();

  let settle = null;
  const moved = () => {
    if (onInput) onInput(st.value);
    if (settle) clearTimeout(settle);
    settle = setTimeout(() => { settle = null; if (onSettle) onSettle(st.value); }, 500);
  };
  const setTo = (v) => {
    const n = snap(v);
    if (n === st.value) return false;
    st.value = n;
    render();
    moved();
    return true;
  };

  const KEYS = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: 250, PageDown: -250 };
  let keyMoved = false;
  track.addEventListener("keydown", (e) => {
    if (st.disabled) return;
    const cur = st.value === null ? 0 : st.value;
    let next = null;
    if (e.key in KEYS) next = cur + KEYS[e.key];
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 1000;
    if (next === null) return;
    e.preventDefault();
    if (setTo(next)) keyMoved = true;   // from unset any key sets a value (the base is 0)
  });
  track.addEventListener("keyup", () => { if (keyMoved) { keyMoved = false; if (onChange) onChange(st.value); } });

  let dragging = false;
  const fromPointer = (e) => {
    const r = track.getBoundingClientRect();
    if (!r.width) return null;
    return ((e.clientX - r.left) / r.width) * 1000;
  };
  track.addEventListener("pointerdown", (e) => {
    if (st.disabled || (e.button !== undefined && e.button !== 0)) return;
    const v = fromPointer(e);
    if (v === null) return;
    dragging = true;
    try { track.setPointerCapture(e.pointerId); } catch { /* not capturable: the drag still works over the track */ }
    track.focus({ preventScroll: true });
    setTo(v);
    e.preventDefault();
  });
  track.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const v = fromPointer(e);
    if (v !== null) setTo(v);
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    try { track.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (onChange) onChange(st.value);
  };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);

  el.bk = {
    get: () => st.value,
    set(v) { st.value = v === null || v === undefined || !Number.isFinite(Number(v)) ? null : snap(Number(v)); render(); },
    setDisabled(b, text) { st.disabled = !!b; if (text) st.disabledText = text; render(); },
  };
  return el;
}

/** A stat card (the local app's risk view): the mix's value, one sentence, and the two fixed ends beside it. */
export function statCard(props = {}) {
  const { label, value, sentence, ends = [], level = 3, id } = props;
  const base = newId(id);
  if (ends.length !== 2) warn("stat-ends", "a stat card shows exactly two ends");
  const dl = h("dl.bk-stat-ends");
  for (const e of ends) {
    const l = String(e.label ?? "");
    dl.append(h("div.bk-stat-end", h("dt", l.endsWith(":") ? l : `${l}:`), h("dd.num", e.value)));
  }
  return h("section.bk-stat", { "data-bk": "stat-card", "aria-labelledby": sub(base, "label") },
    h(`${level === 4 ? "h4" : "h3"}.bk-stat-label`, { id: sub(base, "label") }, label),
    h("p.bk-stat-value.num", value), hasContent(sentence) ? put(h("p.bk-stat-sentence"), sentence) : null, dl);
}

const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthKey = (k) => { const m = /^(\d{4})-(\d{2})$/.exec(String(k)); return m ? { y: Number(m[1]), m: Number(m[2]) } : null; };
const baht = (v) => `฿${Math.round(v)}`;

/** What ฿100 in a mix did: one SVG on a fixed scale, HTML labels (18px at any width), the boat at the end. */
export function hundredChart(props = {}) {
  const labels = { ...CHART_LABELS, ...(props.labels || {}) };
  const svg = h("svg", { class: "bk-chart-svg", viewBox: "0 0 1000 300", preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" });
  const marks = h("div.bk-chart-marks", { "aria-hidden": "true" });
  const plot = h("div.bk-chart-plot", { role: "img", "aria-label": props.title || "", "aria-describedby": props.describedBy || null }, svg, marks);
  const xRow = h("div.bk-chart-x", { "aria-hidden": "true" });
  const legend = h("ul.bk-legend");
  const el = h("figure.bk-chart", { "data-bk": "hundred-chart" }, h("div.bk-chart-frame", plot), xRow, legend);
  const st = { months: [], mix: [], world: null, dip: null, scale: null };

  const draw = () => {
    let n = Math.min(st.months.length, st.mix.length);
    if (st.world) n = Math.min(n, st.world.length);
    if (st.months.length !== st.mix.length || (st.world && st.world.length !== st.mix.length)) warn("chart-len", "the chart's months, mix and world differ in length; drawing what lines up");
    clear(svg); clear(marks); clear(xRow); clear(legend);
    if (n < 2) return;
    const months = st.months.slice(0, n), mix = st.mix.slice(0, n), world = st.world ? st.world.slice(0, n) : null;
    if (!st.scale) {
      const all = [...mix, ...(world || []), 100].filter(Number.isFinite);
      st.scale = { lo: Math.floor(Math.min(...all) / 50) * 50, hi: Math.ceil(Math.max(...all) / 50) * 50 };
    }
    let { lo, hi } = st.scale;
    if (!(hi > lo)) hi = lo + 50;
    const X = (i) => (i / (n - 1)) * 1000;
    const Ypct = (v) => ((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * 100;
    const Y = (v) => Ypct(v) * 3;
    const idx = (key) => months.indexOf(key);
    for (let v = Math.ceil(lo / 50) * 50; v <= hi + 1e-9; v += 50) {
      svg.append(h("line", { class: "bk-chart-grid", x1: "0", x2: "1000", y1: Y(v).toFixed(1), y2: Y(v).toFixed(1) }));
      marks.append(h("span.bk-chart-y.num", { style: { top: `${Ypct(v)}%` } }, baht(v)));
    }
    const dip = st.dip;
    const pi = dip ? idx(dip.peak) : -1, ti = dip ? idx(dip.trough) : -1;
    if (pi >= 0 && ti > pi) {
      svg.append(h("rect", { class: "bk-chart-dip", x: X(pi).toFixed(1), y: "0", width: (X(ti) - X(pi)).toFixed(1), height: "300" }));
      const bi = dip.back ? idx(dip.back) : -1;
      const endX = bi > pi ? X(bi) : 1000;
      svg.append(h("line", { class: "bk-chart-high", x1: X(pi).toFixed(1), x2: endX.toFixed(1), y1: Y(mix[pi]).toFixed(1), y2: Y(mix[pi]).toFixed(1) }));
      marks.append(h("span.bk-chart-flag", { style: { left: `${(pi / (n - 1)) * 100}%` } },
        `${labels.dip}: ${baht(mix[pi])} to ${baht(mix[ti])}`));
    }
    const line = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
    svg.append(h("path", { class: "bk-chart-area", d: `${line(mix)}L1000 300L0 300Z` }));
    if (world) svg.append(h("path", { class: "bk-chart-world", d: line(world) }));
    svg.append(h("path", { class: "bk-chart-mix", d: line(mix) }));
    // end labels, the boat at the end of the mix line
    const endMix = h("span.bk-chart-end.is-mix", { style: { top: `${Ypct(mix[n - 1])}%` } },
      h("b.num", baht(mix[n - 1])), " ", h("span", labels.mixEnd));
    marks.append(endMix);
    let endWorld = null;
    if (world) {
      endWorld = h("span.bk-chart-end.is-world", { style: { top: `${Ypct(world[n - 1])}%` } },
        h("b.num", baht(world[n - 1])), " ", h("span", labels.worldEnd));
      marks.append(endWorld);
    }
    marks.append(h("span.bk-chart-boat", { style: { top: `${Ypct(mix[n - 1])}%` } }, boat({ bob: true, size: 40 })));
    const spread = () => {
      if (!endWorld) return;
      const ph = plot.clientHeight || 260;
      const lh = Math.max(endMix.offsetHeight || 0, endWorld.offsetHeight || 0) || 48;
      const gap = ((lh * 1.05) / ph) * 100;
      let a = Ypct(mix[n - 1]), b = Ypct(world[n - 1]);
      if (Math.abs(a - b) < gap) {
        const mid = (a + b) / 2, s = a <= b ? -1 : 1;
        a = mid + (s * gap) / 2; b = mid - (s * gap) / 2;
      }
      endMix.style.top = `${a}%`; endWorld.style.top = `${b}%`;
    };
    const fitX = () => {   // a year label that would touch its neighbour is left out (the first and last stay)
      const xs = [...xRow.children];
      for (const x of xs) x.hidden = false;
      if (xs.length < 3) return;
      const last = xs[xs.length - 1].getBoundingClientRect();
      let right = xs[0].getBoundingClientRect().right;
      if (!last.width) return;
      for (const x of xs.slice(1, -1)) {
        const r = x.getBoundingClientRect();
        if (r.left < right + 12 || r.right > last.left - 12) x.hidden = true; else right = r.right;
      }
    };
    st.spread = () => { spread(); fitX(); };
    // the months under the chart: the first, each January as its year, the last
    const first = monthKey(months[0]), last = monthKey(months[n - 1]);
    const lab = (i, text) => xRow.append(h("span.bk-chart-xl", { style: { left: `${(i / (n - 1)) * 100}%` } }, text));
    if (first) lab(0, `${MON3[first.m - 1]} ${first.y}`);
    months.forEach((k, i) => {
      const m = monthKey(k);
      if (m && m.m === 1 && i >= 6 && i <= n - 7) lab(i, String(m.y));
    });
    if (last) lab(n - 1, `${MON3[last.m - 1]} ${last.y}`);
    const sw = (cls) => h("svg", { class: `bk-legend-mark ${cls}`, viewBox: "0 0 36 12", "aria-hidden": "true", focusable: "false" },
      cls === "is-dip" ? h("rect", { x: "0", y: "0", width: "36", height: "12", rx: "3" }) : h("path", { d: "M2 6H34" }));
    legend.append(h("li", sw("is-mix"), labels.legendMix));
    if (world) legend.append(h("li", sw("is-world"), labels.legendWorld));
    if (pi >= 0 && ti > pi) legend.append(h("li", sw("is-dip"), labels.legendDip));
    if (el.isConnected) st.spread();
  };
  el.bk = {
    update(p = {}) {
      if (p.months) st.months = [...p.months];
      if (p.mix) st.mix = [...p.mix];
      if ("world" in p) st.world = p.world ? [...p.world] : null;
      if ("dip" in p) st.dip = p.dip || null;
      if (p.scale) st.scale = { ...p.scale };
      draw();
    },
  };
  el.bk.update({ months: props.months || [], mix: props.mix || [], world: props.world || null, dip: props.dip || null, scale: props.scale || null });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (st.spread) st.spread(); }).observe(plot);
  if (typeof document !== "undefined" && document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (st.spread) st.spread(); });
  return el;
}

/** One bar a month in --ink: filled above the line for a month that went up, open below it for one that went down. */
export function bumpsStrip({ returns = [], max, caption = FIXED.bumps } = {}) {
  const svg = h("svg", { class: "bk-bumps-svg", preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" });
  const el = h("figure.bk-bumps", { "data-bk": "bumps-strip" }, h("div.bk-bumps-plot", svg), h("figcaption.bk-bumps-cap", caption));
  const st = { returns: [], max: null };
  const draw = () => {
    clear(svg);
    const r = st.returns.filter(Number.isFinite);
    const n = Math.max(1, r.length);
    svg.setAttribute("viewBox", `0 0 ${n * 10} 100`);
    const m = Number(st.max) > 0 ? Number(st.max) : Math.max(1e-9, ...r.map(Math.abs));
    svg.append(h("line", { class: "bk-bumps-base", x1: "0", x2: String(n * 10), y1: "50", y2: "50" }));
    r.forEach((v, i) => {
      const hh = Math.max(1, (Math.min(Math.abs(v), m) / m) * 46);
      svg.append(h("rect", { class: v >= 0 ? "bk-bump is-up" : "bk-bump is-down", x: String(i * 10 + 2), width: "6",
        y: (v >= 0 ? 50 - hh : 50).toFixed(2), height: hh.toFixed(2) }));
    });
  };
  el.bk = { update(p = {}) { if (p.returns) st.returns = [...p.returns]; if ("max" in p) st.max = p.max; draw(); } };
  el.bk.update({ returns, max });
  return el;
}

/** The two ends and the mix in one table; the mix is named in words, never highlighted. */
export function compareRows(props = {}) {
  const { caption, columns = [], rows = [] } = props;
  const tb = h("tbody");
  for (const r of rows) {
    tb.append(h("tr", h("th", { scope: "row" }, r.label),
      (r.cells || []).map((c, i) => h("td", { "data-label": columns[i] ?? "" }, c ?? ""))));
  }
  return h("table.bk-compare", { "data-bk": "compare-rows" }, hasContent(caption) ? put(h("caption"), caption) : null,
    h("thead", h("tr", h("td"), columns.map((c) => h("th", { scope: "col" }, c)))), tb);
}

// ------------------------------------------------------------------------------------------- the frame and the dock

/** The brand: the boat (still), the name in hand lettering and the subtitle. */
export function brandMark({ name = "Tide Table", sub, href } = {}) {
  const kids = [boat({ bob: false, size: 52 }), h("span.bk-brand-text", h("span.bk-brand-name", name), hasContent(sub) ? h("span.bk-brand-sub", sub) : null)];
  return href ? h("a.bk-brand", { href, "data-bk": "brand-mark" }, kids) : h("span.bk-brand", { "data-bk": "brand-mark" }, kids);
}

function navLinks(items, current, cls, build) {
  const map = new Map();
  for (const it of items) {
    const a = build(it);
    if (it.id === current) a.setAttribute("aria-current", "page");
    map.set(it.id, a);
  }
  const setCurrent = (cid) => { for (const [k, a] of map) { if (k === cid) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); } };
  return { map, setCurrent };
}

/** The contents column (from 1024px): every view, the current one bold with a sky wash and the ribbon. */
export function contentsColumn(props = {}) {
  const { brand = {}, items = [], current, title = FIXED.contents, foot } = props;
  const ul = h("ul.bk-contents");
  const { map, setCurrent } = navLinks(items, current, "bk-contents-link", (it) =>
    h("a.bk-contents-link", { href: it.href, "data-view": it.id }, lineIcon(it.icon || "info"), h("span", it.label)));
  for (const a of map.values()) ul.append(h("li", a));
  const el = h("aside.bk-rail", { "data-bk": "contents-column" }, brandMark(brand),
    h("nav.bk-contents-nav", { "aria-label": title }, h("p.bk-contents-title", { "aria-hidden": "true" }, title), ul),
    hasContent(foot) ? put(h("div.bk-rail-foot"), foot) : null);
  el.bk = { setCurrent };
  return el;
}

/** The phone and tablet top bar (under 1024px): the brand and its tools (the Still pill). */
export function topBar({ brand = {}, tools } = {}) {
  return h("header.bk-topbar", { "data-bk": "top-bar" }, brandMark(brand), put(h("div.bk-topbar-tools"), tools));
}

/** The tab bar (under 1024px): 64px links, icon over word; under 360px the short words. */
export function tabBar(props = {}) {
  const { items = [], current, label = FIXED.pages } = props;
  const nav = h("nav.bk-tabbar", { "data-bk": "tab-bar", "aria-label": label, style: { "--bk-tabs": String(Math.max(1, items.length)) } });
  const { map, setCurrent } = navLinks(items, current, "bk-tab", (it) =>
    h("a.bk-tab", { href: it.href, "data-view": it.id }, h("span.bk-tab-icon", lineIcon(it.icon || "info")),
      h(`span.bk-tab-long${it.short ? ".has-short" : ""}`, it.label),
      it.short ? h("span.bk-tab-short", { "aria-hidden": "true" }, it.short) : null));
  for (const a of map.values()) nav.append(a);
  nav.bk = { setCurrent };
  keepFocusClear(nav.ownerDocument);
  return nav;
}

/** One row: a short summary and the screen's main button (from button()). The last child of its view. */
export function dock(props = {}) {
  const sum = h("p.bk-dock-summary"), det = h("p.bk-dock-detail"), nt = h("p.bk-dock-note");
  const st = { button: props.button || null };
  if (st.button && !(st.button.classList && st.button.classList.contains("bk-btn"))) warn("dock-btn", "a dock's button comes from button()");
  const el = h("div.bk-dock", { "data-bk": "dock" }, h("div.bk-dock-words", sum, det, nt), st.button);
  const fill = (node, c) => { clear(node); put(node, c); node.hidden = !hasContent(c); };
  el.bk = {
    update(p = {}) {
      if ("summary" in p) fill(sum, p.summary);
      if ("detail" in p) fill(det, p.detail);
      if ("note" in p) fill(nt, p.note);
      if ("disabled" in p && st.button && st.button.bk) st.button.bk.set({ disabled: !!p.disabled });
    },
  };
  el.bk.update({ summary: props.summary, detail: props.detail, note: props.note });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => keepDockRoom(el)).observe(el);
  keepFocusClear(el.ownerDocument);
  return el;
}

// Keyboard focus never stays under the shown tab bar or dock (WCAG 2.4.11). The browser scrolls a focused control
// into view only when it lies outside the window: one that is inside the window but behind a bar at its bottom
// stays there, whatever scroll-padding-bottom says (seen on the classic Rules view at 768 px, focus walking from
// the button above to the Journal box). So on each keyboard focus move, a control a bar covers is scrolled up at
// once until it clears the bar by 8 px; one that is wholly below the window is left to the browser, which scrolls
// it into view with book.css's room. Controls in a bar or in a fixed box (a dialog) are left alone. One listener
// per document, added by tabBar() and dock().
const FOCUS_ROOM = 8;
const focusClear = new WeakSet();
function keepFocusClear(doc) {
  if (!doc || !doc.addEventListener || focusClear.has(doc)) return;
  focusClear.add(doc);
  doc.addEventListener("focusin", (e) => {
    const el = e.target, win = doc.defaultView;
    if (!win || !el || el.nodeType !== 1 || el === doc.body || el === doc.documentElement) return;
    try { if (!el.matches(":focus-visible")) return; } catch { /* an old engine: check it anyway */ }
    const vh = win.innerHeight;
    const r = el.getBoundingClientRect();
    if (r.height <= 0 || r.width <= 0 || r.top >= vh) return;
    let barTop = vh;
    for (const b of doc.querySelectorAll('[data-bk="dock"], [data-bk="tab-bar"]')) {
      if (b.contains(el)) return;
      const cs = win.getComputedStyle(b);
      if (cs.display === "none" || cs.visibility === "hidden" || (cs.position !== "fixed" && cs.position !== "sticky")) continue;
      const q = b.getBoundingClientRect();
      // a bar in the window's lower half that the control sits over (a floating dock may not span the page)
      if (q.height > 0 && q.top > vh / 2 && q.top < barTop && q.left < r.right && q.right > r.left) barTop = q.top;
    }
    if (barTop >= vh || r.bottom - barTop <= 0.5) return;
    for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) if (win.getComputedStyle(p).position === "fixed") return;
    // never past its own top: a control taller than the room keeps its top in view (under scroll-padding-top)
    const top = parseFloat(win.getComputedStyle(doc.documentElement).scrollPaddingTop) || 0;
    const dy = Math.min(r.bottom - barTop + FOCUS_ROOM, r.top - top);
    if (dy > 0.5) win.scrollBy({ top: dy, left: 0, behavior: "instant" });
  });
}

// The shown dock's height on the page (html's --bk-dock-h), so book.css keeps that much room under a focused
// control when the browser scrolls it into view (WCAG 2.4.11). A hidden or removed dock sets 0px if it was the one.
let dockRoomFrom = null;
function keepDockRoom(el) {
  const root = el.ownerDocument && el.ownerDocument.documentElement;
  if (!root) return;
  const tall = el.isConnected ? Math.ceil(el.getBoundingClientRect().height) : 0;
  if (tall > 0) { dockRoomFrom = el; root.style.setProperty("--bk-dock-h", `${tall}px`); }
  else if (dockRoomFrom === el) { dockRoomFrom = null; root.style.setProperty("--bk-dock-h", "0px"); }
}

// ------------------------------------------------------------------------------------------- motion helpers

const watched = new WeakSet();
/** Keep html[data-tab] at "hidden" or "shown", now and on every visibilitychange (one listener per document). */
export function watchTab(doc = document) {
  const sync = () => doc.documentElement.setAttribute("data-tab", doc.hidden ? "hidden" : "shown");
  sync();
  if (!watched.has(doc)) { watched.add(doc); doc.addEventListener("visibilitychange", sync); }
}

/** Turn Still pictures on or off (the host saves the setting itself). */
export function applyStill(on, doc = document) {
  if (on) doc.documentElement.setAttribute("data-motion", "still"); else doc.documentElement.removeAttribute("data-motion");
}

/** True when Still pictures is on, the tab is hidden, or the reader asked for reduced motion. */
export function motionStopped(doc = document) {
  const d = doc.documentElement;
  if (d.getAttribute("data-motion") === "still" || d.getAttribute("data-tab") === "hidden") return true;
  const w = doc.defaultView;
  return !!(w && w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
