// The almanac atoms (the alchemist's almanac look, docs/tt2/ADDENDUM-2026-10-27d.md), shared by both apps: pure DOM
// builders with the data passed in.
// The contract is docs/tt2/build/book-api.md. Every builder takes one props object (picture, vignette, lineIcon,
// labelChip and note take their key first) and returns one Element whose root carries data-bk="<name>". Live atoms
// hang a small controller on el.bk; a controller call never fires the atom's own callbacks.
// Rules: text is always text (no markup strings), links go through safeUrl, nothing is fetched or stored, no
// animation frames, and the only timer is the split strip's settle debounce. Nothing here ranks, scores, sorts or
// colours a number. Importing this file touches no document or window.

import { h, clear } from "./ui.js?v=2.2.0";

// ------------------------------------------------------------------------------------------- fixed copy

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v);
  return Object.freeze(o);
}

const CHART_LABELS = {
  mixEnd: "your mix", worldEnd: "fund alone", dip: "Deepest dip", legendMix: "Your mix",
  legendWorld: "The all-world fund alone", legendDip: "From the high to the deepest dip",
};

const EMBLEM_NAMES = {
  cars: "the sign of Mars", financials: "the balance", energy: "the sign of fire", staples: "the sign of salt",
  health: "the rod of Asclepius", realestate: "the sign of earth", industrials: "the sign of Saturn",
  materials: "the sign of sulphur", communication: "the sign of air", utilities: "the sign of water",
  discretionary: "the sign of Venus", technology: "the sign of Mercury", retail: "the crescent Moon",
  telecom: "the sign of Uranus",
};
const SEAL_SCENE = (name) => `An engraved picture: ${name} in a ringed seal, on a starry plate above the hills.`;
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
    today: "An engraved picture: a little paper boat sails on the waves under a crescent moon and a few stars.",
    ...Object.fromEntries(Object.entries(EMBLEM_NAMES).map(([id, name]) => [id, SEAL_SCENE(name)])),
  },
  plates: {
    hero: "The almanac's frontispiece.",
    alembic: "The alchemist's bench: the tools of the work.",
    hourglass: "The hourglass of the year.",
    starchart: "A chart of the heavens.",
  },
  wheelRing: "AURUM NOSTRUM · ABUNDANTIA · 10¹² · SOLVE ET COAGULA",
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
  // Growth: a tide staff standing in water, a level that reads a fall as plainly as a rise (no arrow, no chart)
  growth: ["M16 4v24M16 6h5M16 10h3M16 14h5", "M3 20q3.25-3 6.5 0t6.5 0 6.5 0 6.5 0"],
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

// The emblems, engraved: one alchemical, planetary or elemental sign for each field, and the globe, the coin and the
// vessel for the holdings outside every field. The same drawings as the files app/img/<id>-day.svg and -night.svg,
// painted by classes here for the inline vignettes. Each op is [kind, role, geometry]: kind "p" a path, "c" a circle
// "cx cy r", "e" an ellipse "cx cy rx ry"; role "g" a glyph line, "f" a closed shape on the sheet, "t" a thin line.
// Every field has the same seal, ink and weights: no emblem reads as richer than another, and none uses gold leaf,
// a crown, a coin or Jupiter (addendum d.B.6).
const GLYPHS = {
  financials: [["p", "g", "M60 32 V88 M46 90 H74 M30 41 H90"], ["c", "f", "60 31 3.5"], ["p", "t", "M30 41 L20 66 M30 41 L40 66 M90 41 L80 66 M90 41 L100 66"], ["p", "f", "M17 66 H43 Q42 77 30 77 Q18 77 17 66 Z"], ["p", "f", "M77 66 H103 Q102 77 90 77 Q78 77 77 66 Z"]],
  energy: [["p", "f", "M60 27 L91 84 H29 Z"]],
  staples: [["c", "f", "60 60 26"], ["p", "g", "M34 60 H86"]],
  health: [["p", "g", "M60 24 V96"], ["p", "g", "M46 92 C76 88 76 76 60 72 C44 68 44 57 60 53 C76 49 75 40 63 37"], ["e", "f", "60 35 5 4"]],
  realestate: [["p", "f", "M29 35 H91 L60 91 Z"], ["p", "g", "M39 54 H81"]],
  industrials: [["p", "g", "M52 26 V72 M38 38 H66"], ["p", "g", "M52 60 C58 50 76 50 77 62 C78 74 63 78 70 93"]],
  materials: [["p", "f", "M60 25 L85 63 H35 Z"], ["p", "g", "M60 63 V97 M45 81 H75"]],
  communication: [["p", "f", "M60 27 L91 84 H29 Z"], ["p", "g", "M40 65 H80"]],
  utilities: [["p", "f", "M29 35 H91 L60 91 Z"]],
  discretionary: [["c", "f", "60 45 19"], ["p", "g", "M60 64 V97 M46 82 H74"]],
  technology: [["p", "g", "M44 22 A16 14 0 0 0 76 22"], ["c", "f", "60 50 15"], ["p", "g", "M60 65 V97 M47 83 H73"]],
  cars: [["c", "f", "51 69 20"], ["p", "g", "M65 55 L88 32 M73 31 H89 V47"]],
  retail: [["p", "f", "M50 27 A33 33 0 1 1 50 93 A42 42 0 0 0 50 27 Z"]],
  telecom: [["p", "g", "M41 27 C31 41 31 58 41 72 M79 27 C89 41 89 58 79 72 M35 49.5 H85 M60 31 V80"], ["c", "f", "60 88 7.5"]],
  globe: [["c", "f", "60 60 30"], ["e", "t", "60 60 13 30"], ["p", "t", "M60 30 V90 M30 60 H90 M34 45 H86 M34 75 H86"], ["c", "g", "60 60 30"]],
  coin: [["c", "f", "60 60 29"], ["c", "t", "60 60 22"], ["p", "g", "M53 53 H67 V67 H53 Z"]],
  basket: [["p", "f", "M53 27 V47 A24 24 0 1 0 67 47 V27"], ["p", "g", "M48 27 H72"], ["p", "t", "M40 72 H80"]],
};

// ------------------------------------------------------------------------------------------- drawing helpers

const svgEl = (tag, attrs, ...kids) => h(tag, { svg: true, ...attrs }, ...kids);
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
function shapeEl(kind, geo, cls, extra = {}) {
  const n = String(geo).split(" ");
  if (kind === "c") return svgEl("circle", { class: cls, cx: n[0], cy: n[1], r: n[2], ...extra });
  if (kind === "e") return svgEl("ellipse", { class: cls, cx: n[0], cy: n[1], rx: n[2], ry: n[3], ...extra });
  return svgEl("path", { class: cls, d: geo, ...extra });
}
/** Rows of engraved hatching inside a circle, as one path. */
function hatchInCircle(cx, cy, r, step) {
  let d = "";
  for (let y = cy - r + step / 2; y < cy + r; y += step) {
    const half = Math.sqrt(Math.max(r * r - (y - cy) ** 2, 0));
    if (half > 2) d += `M${f1(cx - half)} ${f1(y)}H${f1(cx + half)}`;
  }
  return d;
}
/** Tick marks round a ring, every third a little longer. */
function ringTicks(cx, cy, r1, r2, n) {
  let d = "";
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    const ra = r1 - (k % 3 === 0 ? 1.2 : 0);
    d += `M${f1(cx + ra * Math.cos(a))} ${f1(cy + ra * Math.sin(a))}L${f1(cx + r2 * Math.cos(a))} ${f1(cy + r2 * Math.sin(a))}`;
  }
  return d;
}
/** One emblem in its seal (120 x 120), painted by classes so the night-sky pages repaint it. */
function sealDrawing(id) {
  const g = svgEl("g", { class: "bk-seal" },
    shapeEl("c", "60 60 55", "bk-f-raised"),
    svgEl("path", { class: "bk-ln bk-ln-hair bk-ln-lapis bk-ln-soft", d: hatchInCircle(60, 60, 49, 4) }),
    shapeEl("c", "60 60 55", "bk-ln bk-ln-thin"),
    shapeEl("c", "60 60 50", "bk-ln bk-ln-hair"),
    svgEl("path", { class: "bk-ln bk-ln-hair", d: ringTicks(60, 60, 51.5, 54.2, 48) }));
  const ops = GLYPHS[id] || [];
  for (const [kind, , geo] of ops) g.append(shapeEl(kind, geo, "bk-ln bk-ln-halo"));
  for (const [kind, role, geo] of ops) {
    g.append(shapeEl(kind, geo, role === "f" ? "bk-f-raised bk-ln bk-ln-heavy" : role === "g" ? "bk-ln bk-ln-heavy" : "bk-ln"));
  }
  return g;
}

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

/** The paper boat (decorative). It stands still: since 2.2 no bob is drawn (book.css), because every boat stands
 * beside a figure or a control, inside the calm zone (style brief F2); bob keeps only the old wrapper (span.bk-bob). */
export function boat({ bob = true, size = 46 } = {}) {
  const w = Number(size) > 0 ? Number(size) : 46;
  const hgt = (w * 46) / 60;
  const el = h("span.bk-boat", { "data-bk": "boat", "aria-hidden": "true", style: { width: `${w}px`, height: `${hgt}px` } });
  const imgs = picImgs("boat", w, hgt, false);
  if (bob) el.append(h("span.bk-bob", imgs)); else el.append(...imgs);
  return el;
}

// ------------------------------------------------------------------------------------------- the old watercolour filters, and the vignettes

/** The two live filters (#wc watercolour, #ink wobbly outlines), kept for hosts that still draw with them; the
 * almanac's own engravings use neither. */
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

const SPARKS = [[96, 64], [212, 40], [318, 96], [452, 50], [566, 88], [664, 44], [702, 146], [140, 152], [612, 172], [40, 108]];
/** A small engraved star: a cross of hairlines with shorter diagonals. */
const sparkPath = (pts, r = 6) => pts.map(([x, y]) =>
  `M${x} ${y - r}V${y + r}M${x - r} ${y}H${x + r}M${x - r * 0.4} ${y - r * 0.4}L${x + r * 0.4} ${y + r * 0.4}M${x - r * 0.4} ${y + r * 0.4}L${x + r * 0.4} ${y - r * 0.4}`).join("");
function rows(x1, x2, y1, y2, step) {
  let d = "";
  for (let y = y1; y <= y2; y += step) d += `M${x1} ${y}H${x2}`;
  return d;
}
/** The plate every vignette is engraved on: a sky panel with hatching and a few stars, framed by a double rule. */
function plateBack(svg, ground) {
  svg.append(
    svgEl("rect", { class: "bk-f-sky", x: "6", y: "6", width: "748", height: "368", rx: "4", opacity: ".55" }),
    svgEl("path", { class: "bk-ln bk-ln-hair bk-ln-lapis bk-ln-faint", d: rows(18, 742, 20, 360, 8) }),
    svgEl("path", { class: "bk-ln bk-ln-thin bk-ln-gold", d: sparkPath(SPARKS) }));
  if (ground) svg.append(...ground());
}
function plateFrame(svg) {
  svg.append(
    svgEl("rect", { class: "bk-ln bk-ln-thin", x: "6", y: "6", width: "748", height: "368", rx: "4" }),
    svgEl("rect", { class: "bk-ln bk-ln-hair", x: "14", y: "14", width: "732", height: "352", rx: "2" }));
  for (const [x, y] of [[14, 14], [746, 14], [14, 366], [746, 366]]) {
    svg.append(svgEl("circle", { class: "bk-f-raised", cx: x, cy: y, r: "4.5" }),
      svgEl("circle", { class: "bk-ln bk-ln-hair", cx: x, cy: y, r: "4.5" }));
  }
}
const HILLS = "M6 300 Q120 266 236 286 T470 278 T754 292 V374 H6 Z";
function hills() {
  let marks = "";
  for (let y = 312; y <= 366; y += 11) for (let x = 24 + ((y / 11) % 2) * 11; x < 740; x += 22) marks += `M${x} ${y}l9 -4`;
  return [svgEl("path", { class: "bk-f-sand", d: HILLS }),
    svgEl("path", { class: "bk-ln bk-ln-hair bk-ln-soft", d: marks }),
    svgEl("path", { class: "bk-ln bk-ln-thin", d: "M6 300 Q120 266 236 286 T470 278 T754 292" })];
}
function boatDrawing(cls = "") {
  return svgEl("g", { class: cls || null },
    svgEl("path", { class: "bk-f-white", d: "M7 25 H53 L45 39 H15 Z M30 4 L43 25 H17 Z" }),
    svgEl("path", { class: "bk-ln bk-ln-hair bk-ln-lapis", d: "M14 30 H46 M17 34 H43 M30 9 V25" }),
    svgEl("path", { class: "bk-ln bk-ln-thin", d: "M7 25 H53 L45 39 H15 Z M30 4 L43 25 H17 Z" }));
}

function vignetteSvg(id) {
  const svg = svgEl("svg", { viewBox: "0 0 760 380", "aria-hidden": "true", focusable: "false", preserveAspectRatio: "xMidYMid meet" });
  if (id === "today") {
    plateBack(svg, () => [
      svgEl("path", { class: "bk-f-glow", d: "M652 54 A32 32 0 1 0 652 114 A40 40 0 0 1 652 54 Z" }),
      svgEl("path", { class: "bk-ln bk-ln-thin", d: "M652 54 A32 32 0 1 0 652 114 A40 40 0 0 1 652 54 Z" }),
      svgEl("path", { class: "bk-f-sand", d: "M6 264 Q70 236 142 252 Q196 228 262 256 V266 H6 Z" }),
      svgEl("path", { class: "bk-ln bk-ln-thin", d: "M6 264 Q70 236 142 252 Q196 228 262 256" }),
      svgEl("path", { class: "bk-f-sea", d: "M6 262 H754 V374 H6 Z", opacity: ".45" }),
      svgEl("path", { class: "bk-ln bk-ln-hair bk-ln-lapis bk-ln-faint", d: rows(10, 750, 268, 368, 6) }),
      svgEl("path", { class: "bk-ln bk-ln-thin", d: "M6 262 H754" }),
    ]);
    let waves = "";
    for (const [x0, y] of [[30, 296], [250, 318], [470, 296], [120, 344], [560, 340], [360, 364]]) {
      waves += `M${x0} ${y} q15 -8 30 0 t30 0 t30 0 t30 0`;
    }
    svg.append(svgEl("g", { class: "bk-drift" }, svgEl("path", { class: "bk-ln bk-ln-thin bk-wave", d: waves })));
    svg.append(svgEl("g", { transform: "translate(312 170) scale(2.3)" },
      svgEl("g", { class: "bk-bob" }, svgEl("ellipse", { class: "bk-f-ink", cx: "30", cy: "41", rx: "22", ry: "2.6", opacity: ".16" }), boatDrawing())));
    plateFrame(svg);
    return svg;
  }
  plateBack(svg, hills);
  svg.append(svgEl("ellipse", { class: "bk-f-ink", cx: "380", cy: "292", rx: "104", ry: "8", opacity: ".14" }));
  const seal = sealDrawing(id);
  seal.setAttribute("transform", "translate(284 82) scale(1.6)");
  svg.append(seal);
  plateFrame(svg);
  return svg;
}

/** The opening picture of a chapter or a field page: an engraved plate, inline, painted by classes, with one sentence. */
export function vignette(id, { label } = {}) {
  let key = id;
  if (!VIGNETTE_IDS.includes(key)) { warn(`vig:${id}`, `no vignette called ${JSON.stringify(id)}; drawing "today"`); key = "today"; }
  const el = h("div.bk-vignette", { role: "img", "aria-label": label || FIXED.vignettes[key], "data-bk": "vignette",
    "data-live-filter": "", "data-vignette": key });
  el.appendChild(vignetteSvg(key));
  return el;
}

// ------------------------------------------------------------------------------------------- the almanac (2.3)
// Ornaments, plates, the tarot card of a dated step, the wheel of the heavens and the colophon. All decoration:
// aria-hidden (a card's date excepted), faint, still where motion is stopped. None of them takes a holding, an
// amount or a name: a card follows only a step's place in time, and the hosts keep the colophon and the wheel away
// from every figure, holding, order, price, ceiling, button and form field (addendum d.C).

/** The zodiac, Aries to Pisces, and the seven classical planets, each with U+FE0E (text, never an emoji). */
export const ZODIAC = Object.freeze(["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"].map((g) => g + "︎"));
const PLANETS = ["☉", "☽", "☿", "♀", "♂", "♃", "♄"].map((g) => g + "︎");

/** The Major Arcana I to XXI with each card's traditional planet, sign or element. Card X is drawn as "The Wheel" with
 * a plain star: its planet, Jupiter, is one of the colophon's signs, which never sit beside a dated step. */
export const ARCANA = Object.freeze([
  ["I", "The Magician", "☿"], ["II", "The High Priestess", "☽"], ["III", "The Empress", "♀"], ["IV", "The Emperor", "♈"],
  ["V", "The Hierophant", "♉"], ["VI", "The Lovers", "♊"], ["VII", "The Chariot", "♋"], ["VIII", "Strength", "♌"],
  ["IX", "The Hermit", "♍"], ["X", "The Wheel", "✦"], ["XI", "Justice", "♎"], ["XII", "The Hanged Man", "\u{1F704}"],
  ["XIII", "Death", "♏"], ["XIV", "Temperance", "♐"], ["XV", "The Devil", "♑"], ["XVI", "The Tower", "♂"],
  ["XVII", "The Star", "♒"], ["XVIII", "The Moon", "♓"], ["XIX", "The Sun", "☉"], ["XX", "Judgement", "\u{1F702}"],
  ["XXI", "The World", "♄"],
].map(([numeral, name, glyph], i) => Object.freeze({ n: i + 1, numeral, name, glyph: glyph + "︎" })));

/** The arcanum of a step's place in time (1 = the first step): I to XXI, then round again. Null for anything else. */
export function arcanaFor(position) {
  const p = Number(position);
  if (!Number.isInteger(p) || p < 1) return null;
  return ARCANA[(p - 1) % ARCANA.length];
}

/** The engraved art (WebP, no metadata) in app/img/art/: width and height as drawn. */
export const ART = Object.freeze({
  hero: Object.freeze([1344, 768]), alembic: Object.freeze([900, 616]), hourglass: Object.freeze([720, 720]),
  starchart: Object.freeze([900, 616]), ace: Object.freeze([300, 394]),
  "card-1": Object.freeze([300, 394]), "card-2": Object.freeze([300, 394]), "card-3": Object.freeze([300, 394]),
  "card-4": Object.freeze([300, 394]), "card-5": Object.freeze([300, 394]), "card-6": Object.freeze([300, 394]),
  "card-7": Object.freeze([300, 378]), "card-8": Object.freeze([300, 394]), "card-9": Object.freeze([300, 394]),
  "card-10": Object.freeze([300, 394]), "card-11": Object.freeze([300, 394]), "card-12": Object.freeze([300, 394]),
});
/** The arcana with an engraved face: I to XII, so a plan's twelve order dates all carry art. */
const ART_CARDS = 12;
function artUrl(name) {
  const here = import.meta.url;
  let search = "";
  try { search = new URL(here).search; } catch { /* keep no version */ }
  return new URL(`../img/art/${name}.webp${search}`, here).href;
}
function artImg(name, cls, lazy) {
  const [w, hh] = ART[name];
  const img = h(`img${cls ? "." + cls : ""}`, { src: artUrl(name), alt: "", width: String(w), height: String(hh), decoding: "async",
    loading: lazy ? "lazy" : null });
  img.addEventListener("error", () => { img.hidden = true; });
  return img;
}

/** Air, fire and earth: the three elements a heading's glyph steps through before it settles on its sign. */
const STEP_GLYPHS = Object.freeze(["\u{1F701}", "\u{1F702}", "\u{1F703}"].map((g) => g + "︎"));

/** A view's one zodiac glyph before its heading, from the view's fixed order (1 = the first view). Never from
 * anything the view shows. step: the view's first opening in a session (the host knows it): an aria-hidden strip of
 * air, fire and earth steps over the sign and leaves it (book.css, --d-glyph); the sign is the glyph's own text (in
 * span.bk-glyph-sign when it steps), so with motion stopped it shows at once. */
export function headGlyph(order, { step = false } = {}) {
  const n = Number(order);
  const el = h("span.bk-head-glyph.sym", { "aria-hidden": "true", "data-bk": "head-glyph" });
  if (!Number.isInteger(n) || n < 1) { warn(`glyph:${order}`, `headGlyph needs a view's place, 1 or more (got ${JSON.stringify(order)})`); return el; }
  const sign = ZODIAC[(n - 1) % 12];
  if (!step) { el.textContent = sign; return el; }
  el.classList.add("is-step");
  el.append(h("span.bk-glyph-sign", sign),
    h("span.bk-glyph-steps", h("span.bk-glyph-strip", STEP_GLYPHS.map((g) => h("span.bk-glyph", g)))));
  return el;
}

/** A Roman numeral, I to MMMCMXCIX (null outside 1 to 3999). */
function roman(n) {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return null;
  const parts = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of parts) while (n >= v) { out += s; n -= v; }
  return out;
}

/** The Folio kicker over a view's heading: "Folio I" to "Folio XV", by the view's fixed place in the contents (the
 * same order as its glyph), never by anything the view shows. Decoration: aria-hidden, a Cinzel label in gold. */
export function folio(order) {
  const n = Number(order);
  const el = h("span.bk-folio", { "aria-hidden": "true", "data-bk": "folio" });
  const r = roman(n);
  if (!r) { warn(`folio:${order}`, `folio needs a view's place, 1 or more (got ${JSON.stringify(order)})`); return el; }
  el.textContent = `Folio ${r}`;
  return el;
}

/** An engraved double rule with a small gilt star at its centre (plain: the rule alone). Decorative. */
export function starStop({ plain = false } = {}) {
  return h(plain ? "div.bk-rule" : "div.bk-star-stop", { "aria-hidden": "true", "data-bk": "star-stop" });
}

const PLATE_SIZES = ["hero", "wide", "round", "small"];
/** An engraved plate in a gold frame. No caption: decorative (aria-hidden, alt=""). With a caption: the caption is
 * read, and alt is the short alt given (or none). Lazy unless lazy is false (the first screen's plate). */
export function plate(props = {}) {
  const { art, caption, alt = "", size, lazy = true, id } = props;
  const decorative = !hasContent(caption);
  const fig = h(`figure.bk-plate${PLATE_SIZES.includes(size) ? ".is-" + size : ""}`, { "data-bk": "plate", "data-art": String(art),
    id: id || null, "aria-hidden": decorative ? "true" : null });
  if (!Object.hasOwn(ART, String(art))) { warn(`art:${art}`, `no plate called ${JSON.stringify(art)}`); return fig; }
  const img = artImg(String(art), "", lazy !== false);
  if (!decorative && alt) img.setAttribute("alt", String(alt));
  fig.append(h("div.bk-plate-frame", img));
  if (!decorative) fig.append(put(h("figcaption.bk-plate-caption"), caption));
  return fig;
}

/** The face of a card, engraved: numeral and glyph at the top, the name at the foot (on art, in dark bands). */
function cardFace(a, useArt) {
  const svg = svgEl("svg", { viewBox: "0 0 70 100", preserveAspectRatio: "none", focusable: "false" });
  const name = a ? a.name.toUpperCase() : "";
  const fit = name.length > 13 ? { textLength: "62", lengthAdjust: "spacingAndGlyphs" } : {};
  if (useArt) {
    svg.append(svgEl("rect", { class: "bk-card-band", x: "0", y: "0", width: "70", height: "16" }),
      svgEl("rect", { class: "bk-card-band", x: "0", y: "83", width: "70", height: "17" }),
      svgEl("text", { x: "35", y: "11.2", "text-anchor": "middle" },
        svgEl("tspan", { class: "bk-card-num", "font-size": "8" }, a.numeral + " "),
        svgEl("tspan", { class: "bk-card-glyph", "font-size": "8" }, a.glyph)),
      svgEl("text", { class: "bk-card-name", x: "35", y: "93.6", "text-anchor": "middle", "font-size": "5.6", ...fit }, name),
      svgEl("rect", { class: "bk-card-frame", x: "2.5", y: "2.5", width: "65", height: "95", rx: "2" }));
    return svg;
  }
  svg.append(svgEl("rect", { class: "bk-card-frame", x: "2.5", y: "2.5", width: "65", height: "95", rx: "2" }),
    svgEl("rect", { class: "bk-card-frame", x: "5", y: "5", width: "60", height: "90", rx: "1.5" }));
  if (a) {
    svg.append(svgEl("text", { class: "bk-card-num", x: "35", y: "17", "text-anchor": "middle", "font-size": "9" }, a.numeral),
      svgEl("text", { class: "bk-card-glyph", x: "35", y: "52", "text-anchor": "middle", "dominant-baseline": "central", "font-size": "24" }, a.glyph),
      svgEl("text", { class: "bk-card-name", x: "35", y: "87", "text-anchor": "middle", "font-size": "5.6", ...fit }, name));
  }
  return svg;
}

/** A dated step's tarot card (addendum d.B.4): the Major Arcana card of the step's place in time (position 1 = I), its
 * planet or sign, and the date. Cards I to XII carry the engraved art unless art is false. The face is decorative;
 * date (short words, shown) and full (the date in full words, read) are the host's. */
export function tarotCard(props = {}) {
  const { position, date, full, art = true, small = false, id } = props;
  const a = arcanaFor(position);
  if (!a) warn(`card:${position}`, `tarotCard needs a step's place in time, 1 or more (got ${JSON.stringify(position)})`);
  const useArt = !!(a && art !== false && a.n <= ART_CARDS);
  const face = h("span.bk-card-face", { "aria-hidden": "true" });
  if (useArt) face.append(artImg(`card-${a.n}`, "", true));
  face.append(cardFace(a, useArt));
  const el = h(`div.bk-card${useArt ? ".is-art" : ""}${small ? ".is-small" : ""}`, { "data-bk": "tarot-card",
    "data-arcana": a ? a.numeral : null, id: id || null }, face);
  if (hasContent(date)) el.append(put(h("span.bk-card-date", { "aria-hidden": hasContent(full) ? "true" : null }), date));
  if (hasContent(full)) el.append(hidden(String(full)));
  return el;
}

/** The wheel of the heavens (addendum d.B.5): one SVG with the twelve signs, the seven classical planets, the
 * philosopher's stone at its centre and the engraved ring. The ring turns once in four minutes, only without reduced
 * motion and while nothing stops motion (spin false: it never turns). Decorative. */
export function wheel({ spin = true, id } = {}) {
  const base = newId(id);
  const pt = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [200 + r * Math.cos(a), 200 + r * Math.sin(a)]; };
  const svg = svgEl("svg", { class: "bk-wheel", viewBox: "0 0 400 400", "aria-hidden": "true", focusable: "false", "data-bk": "wheel" });
  const ring = sub(base, "ring");
  svg.append(svgEl("defs", {}, svgEl("path", { id: ring, d: "M200,200 m0,-178 a178,178 0 1,1 0,356 a178,178 0 1,1 0,-356" })));
  const turn = svgEl("g", { class: spin === false ? "bk-wheel-ring" : "bk-wheel-ring bk-wheel-spin" },
    svgEl("circle", { class: "bk-w-line", cx: "200", cy: "200", r: "192" }),
    svgEl("circle", { class: "bk-w-thin", cx: "200", cy: "200", r: "188" }),
    svgEl("circle", { class: "bk-w-line", cx: "200", cy: "200", r: "166" }),
    svgEl("text", { class: "bk-w-ins" },
      svgEl("textPath", { href: `#${ring}`, textLength: "1110", lengthAdjust: "spacing" }, `${FIXED.wheelRing} · ${FIXED.wheelRing} ·`)));
  let spokes = "";
  for (let k = 0; k < 12; k++) {
    const [x1, y1] = pt(116, k * 30), [x2, y2] = pt(166, k * 30);
    spokes += `M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}`;
    const [x, y] = pt(141, k * 30 + 15);
    turn.append(svgEl("text", { class: "bk-w-sign", x: f1(x), y: f1(y) }, ZODIAC[k]));
  }
  for (let k = 0; k < 72; k++) {
    const [x1, y1] = pt(k % 6 ? 160 : 156, k * 5), [x2, y2] = pt(166, k * 5);
    spokes += `M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}`;
  }
  turn.append(svgEl("path", { class: "bk-w-thin", d: spokes }));
  svg.append(turn,
    svgEl("circle", { class: "bk-w-line", cx: "200", cy: "200", r: "116" }),
    svgEl("circle", { class: "bk-w-thin", cx: "200", cy: "200", r: "66" }));
  PLANETS.forEach((g, k) => {
    const [x, y] = pt(91, (k * 360) / 7);
    svg.append(svgEl("text", { class: "bk-w-planet", x: f1(x), y: f1(y) }, g));
  });
  svg.append(...stoneShapes(58, 58));
  return svg;
}

/** The philosopher's stone at the wheel's centre: a circle, a square, a triangle and a circle within, rx by ry (an
 * upright stone is drawn a little taller than wide). */
function stoneShapes(rx, ry) {
  const kx = rx / 58, ky = ry / 58;
  const s = 58 / Math.SQRT2;
  const leg = Math.hypot(s, 2 * s);
  const inr = (2 * s * 2 * s / 2) / ((2 * s + 2 * leg) / 2);
  const X = (u) => f1(200 + u * kx), Y = (v) => f1(200 + v * ky);
  const round = (r, cy) => (kx === ky
    ? svgEl("circle", { class: "bk-w-stone", cx: "200", cy: Y(cy), r: f1(r * kx) })
    : svgEl("ellipse", { class: "bk-w-stone", cx: "200", cy: Y(cy), rx: f1(r * kx), ry: f1(r * ky) }));
  return [
    round(58, 0),
    svgEl("rect", { class: "bk-w-stone", x: X(-s), y: Y(-s), width: f1(2 * s * kx), height: f1(2 * s * ky) }),
    svgEl("polygon", { class: "bk-w-stone", points: `${X(-s)},${Y(s)} ${X(s)},${Y(s)} 200,${Y(-s)}` }),
    round(inr, s - inr)];
}

// ------------------------------------------------------------------------------------------- the hero box (2.2)
// The head of Today's first screen in both apps (the glass almanac: docs/tt2/ADDENDUM-2026-10-28.md B; style brief
// 3.0 and 3.1). A still night plate, the engraved wheel with its band of signs narrowed, and an empty disc over the
// wheel's inner disc where app/js/hero.js may put its canvas. Decoration only: aria-hidden, no words, no figures, no
// holding, nothing that refers to the page. The poster is complete without the canvas.

/** Where the armillary of app/js/hero-gl.js stands at scene time 0, in the wheel's viewBox (docs/tt2/build/hero-api.md
 * 6): the rings as ellipses [cx, cy, rx, ry, turn in degrees] (the meridian, the equator, the ecliptic), the seven
 * beads [x, y, r] and the stone [rx, ry]. The poster's flat centre is drawn there, so the canvas thaws out of it. */
const HERO_RINGS = Object.freeze([[192.6, 195.4, 99.1, 112.4, 31.8], [200, 205.2, 108.5, 30.4, 0], [200, 209.4, 108, 69.2, 0]]);
const HERO_BEADS = Object.freeze([[200, 278.7, 8.4], [291.4, 246.3, 8], [301.2, 185.3, 7.1], [241.3, 145.5, 6.5],
  [158.7, 145.5, 6.5], [98.8, 185.3, 7.1], [108.6, 246.3, 8]]);
const HERO_STONE = Object.freeze([22.4, 25.1]);

/** The hero's wheel: book.wheel's engraving with its band of signs narrowed. The inscription band stays between r 166
 * and 188, its words on r 178 and never moving; the signs and ticks sit between r 140 and 166 and turn; the inner disc
 * inside r 140 (70% of the wheel's width) holds the flat centre, the poster: the engraved rings, the seven planets on
 * the beads' places and the stone, in g[data-hero-poster-centre]. */
function heroWheel(base) {
  const pt = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [200 + r * Math.cos(a), 200 + r * Math.sin(a)]; };
  const svg = svgEl("svg", { class: "bk-wheel bk-hero-wheel", viewBox: "0 0 400 400", "aria-hidden": "true", focusable: "false",
    "data-bk": "hero-wheel" });
  const ring = sub(base, "ring");
  svg.append(svgEl("defs", {}, svgEl("path", { id: ring, d: "M200,200 m0,-178 a178,178 0 1,1 0,356 a178,178 0 1,1 0,-356" })),
    svgEl("circle", { class: "bk-w-line", cx: "200", cy: "200", r: "192" }),
    svgEl("circle", { class: "bk-w-thin", cx: "200", cy: "200", r: "188" }),
    svgEl("circle", { class: "bk-w-line", cx: "200", cy: "200", r: "166" }),
    svgEl("text", { class: "bk-w-ins" },
      svgEl("textPath", { href: `#${ring}`, textLength: "1110", lengthAdjust: "spacing" }, `${FIXED.wheelRing} · ${FIXED.wheelRing} ·`)),
    svgEl("circle", { class: "bk-w-line", cx: "200", cy: "200", r: "140" }));
  const turn = svgEl("g", { class: "bk-wheel-ring bk-wheel-spin" });
  let spokes = "";
  for (let k = 0; k < 12; k++) {
    const [x1, y1] = pt(140, k * 30), [x2, y2] = pt(166, k * 30);
    spokes += `M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}`;
    const [x, y] = pt(152.5, k * 30 + 15);
    turn.append(svgEl("text", { class: "bk-w-sign", x: f1(x), y: f1(y) }, ZODIAC[k]));
  }
  for (let k = 0; k < 72; k++) {
    if (k % 6 === 0) continue;   // a spoke stands there
    const [x1, y1] = pt(161, k * 5), [x2, y2] = pt(166, k * 5);
    spokes += `M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}`;
  }
  turn.append(svgEl("path", { class: "bk-w-thin", d: spokes }));
  const centre = svgEl("g", { class: "bk-hero-centre", "data-hero-poster-centre": "" },
    ...HERO_RINGS.map(([cx, cy, rx, ry, deg]) => svgEl("ellipse", { class: "bk-w-orbit", cx: String(cx), cy: String(cy), rx: String(rx),
      ry: String(ry), transform: deg ? `rotate(${deg} ${cx} ${cy})` : null })),
    // each planet as large as its bead looks: the nearer ones larger
    ...HERO_BEADS.map(([x, y, r], k) => svgEl("text", { class: "bk-w-planet", x: String(x), y: String(y),
      style: { "--bk-planet": `${f1(2.05 * r)}px` } }, PLANETS[k])),
    ...stoneShapes(...HERO_STONE));
  svg.append(turn, centre);
  return svg;
}

/**
 * The hero box at the head of Today (both apps): div.bk-hero[data-hero][aria-hidden] holding the night plate (a
 * still CSS field: plate mist round the wheel falling to plate ground, seven gilt specks), the corner brackets
 * (book.css), the poster wheel and an empty div.bk-hero-disc[data-hero-disc] exactly over the wheel's inner disc
 * (r < 140 of its 400 viewBox). app/js/hero.js puts its canvas in the disc and sets data-hero-state (off, loading,
 * moving, still, paused) and data-hero-arrival (first, again) on the box; book.css plays the arrival from those, and
 * stops the wheel's turn while the 3D one turns. Nothing here starts, fetches or times anything.
 */
export function heroBox({ id } = {}) {
  const base = newId(id);
  const stage = h("div.bk-hero-stage", heroWheel(base), h("div.bk-hero-disc", { "data-hero-disc": "" }));
  return h("div.bk-hero", { "data-hero": "", "aria-hidden": "true", "data-bk": "hero-box", id: id || null }, stage);
}

/** One engraved word under a colophon piece: a drawing (svg text), never page text. */
function engraved(word) {
  const w = Math.round([...word].length * 8.4 + 6);
  return svgEl("svg", { class: "bk-engraved", viewBox: `0 0 ${w} 14`, width: String(w), height: "14", focusable: "false" },
    svgEl("text", { x: String(w / 2), y: "10.5" }, word));
}
/** The sigil of the colophon's phrase: its vowels and repeated letters struck out leave L V T R N F, drawn as one seal. */
function sigil() {
  return svgEl("svg", { class: "bk-sigil", viewBox: "0 0 100 100", fill: "none", stroke: "currentColor", "stroke-width": "2.2",
    "stroke-linecap": "round", "stroke-linejoin": "round", focusable: "false" },
  svgEl("circle", { cx: "50", cy: "50", r: "46", "stroke-width": "1" }),
  svgEl("circle", { cx: "50", cy: "50", r: "42", "stroke-width": "0.6" }),
  svgEl("path", { d: "M50 16 V84 M34 84 H66 M30 24 L50 54 L70 24 M36 16 H64 M50 32 C76 32 76 56 50 56 L72 80 M30 70 V46 L44 62 M50 44 H63" }),
  svgEl("circle", { cx: "50", cy: "11", r: "2.4" }));
}
/** The Ace of Pentacles, drawn: shown only when the engraved art cannot load. */
function aceDrawn() {
  const P = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [35 + r * Math.cos(a), 52 + r * Math.sin(a)]; };
  const pent = [0, 144, 288, 72, 216].map((d) => P(15, d).map(f1).join(",")).join(" ");
  let rays = "";
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6;
    rays += `M${f1(35 + 24 * Math.cos(a))} ${f1(52 + 24 * Math.sin(a))}L${f1(35 + 29 * Math.cos(a))} ${f1(52 + 29 * Math.sin(a))}`;
  }
  return svgEl("svg", { class: "bk-ace-drawn", viewBox: "0 0 70 104", fill: "none", stroke: "currentColor", focusable: "false", hidden: "" },
    svgEl("rect", { x: "1", y: "1", width: "68", height: "102", rx: "5", "stroke-width": "1.2" }),
    svgEl("rect", { x: "5", y: "5", width: "60", height: "94", rx: "3", "stroke-width": "0.6" }),
    svgEl("circle", { cx: "35", cy: "52", r: "20", "stroke-width": "1.4" }),
    svgEl("polygon", { points: pent, "stroke-width": "1.1" }),
    svgEl("path", { d: rays, "stroke-width": "0.8" }),
    svgEl("path", { d: "M22 88 Q35 80 48 88", "stroke-width": "0.8" }));
}
/** The magic square of Jupiter (Agrippa's 4 x 4: every row, column and diagonal sums to 34), as a faint watermark. */
const KAMEA = [[4, 14, 15, 1], [9, 7, 6, 12], [5, 11, 10, 8], [16, 2, 3, 13]];
function kamea() {
  const svg = svgEl("svg", { class: "bk-watermark", viewBox: "0 0 200 200", fill: "none", stroke: "currentColor", focusable: "false" },
    svgEl("circle", { cx: "100", cy: "100", r: "96", "stroke-width": "1.5" }),
    svgEl("circle", { cx: "100", cy: "100", r: "88", "stroke-width": "0.8" }));
  let grid = "";
  for (let i = 0; i < 5; i++) grid += `M${44 + i * 28} 44V156M44 ${44 + i * 28}H156`;
  svg.append(svgEl("path", { d: grid, "stroke-width": "1" }));
  KAMEA.forEach((row, r) => row.forEach((v, c) => {
    svg.append(svgEl("text", { x: String(58 + c * 28), y: String(63 + r * 28), stroke: "none" }, String(v)));
  }));
  return svg;
}

/** The colophon (addendum d.C): the Ace of Pentacles, the sigil with 10¹² under it and Jupiter's glyph, with the magic
 * square of Jupiter as a faint watermark behind them. Decoration only: aria-hidden, still, never read aloud. The host
 * puts it in its footer, away from every figure, holding, order, price, button and form field. */
export function colophon() {
  const ace = artImg("ace", "bk-ace", true);
  const drawn = aceDrawn();
  ace.addEventListener("error", () => { drawn.removeAttribute("hidden"); });
  const jove = svgEl("svg", { class: "bk-jove", viewBox: "0 0 40 40", focusable: "false" },
    svgEl("text", { x: "20", y: "21", "font-size": "28" }, PLANETS[5]));
  return h("div.bk-colophon", { "aria-hidden": "true", "data-bk": "colophon" },
    kamea(),
    h("div.bk-colophon-piece", ace, drawn, engraved("ACE OF PENTACLES")),
    h("div.bk-colophon-piece", sigil(), engraved("10¹²")),
    h("div.bk-colophon-piece", jove, engraved("JUPITER")));
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

/** A tinted sheet in an engraved frame. Text inside keeps the wash rule; live marks the next-step panel
 * (data-live-filter; the almanac draws it without a filter). */
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
  const { kicker, title, scale = "chapter", level = 1, lines = [], after, vignette: pic, id, glyph } = props;
  const hd = h(`h${level === 2 ? 2 : 1}.${scale === "page" ? "bk-title-page" : "bk-title-chapter"}`, { id: id || null },
    kicker ? [h("span.bk-kicker", kicker), hidden(": ")] : null,
    put(h("span.bk-title-main"), [glyph != null ? headGlyph(glyph) : null, title]));
  const text = h("div.bk-opening-text", hd);
  for (const l of lines || []) text.append(put(h("p.bk-lede"), l));
  if (hasContent(after)) text.append(put(h("div.bk-opening-after"), after));
  const el = h("header.bk-opening.bk-bloom", { "data-bk": "opening-head" }, text);
  if (pic) el.append(h("div.bk-opening-pic", pic)); else el.classList.add("is-no-pic");
  return el;
}

/** A section heading with an optional intro line; glyph (a view's place) puts its zodiac glyph before the title. */
export function sectionHead({ title, level = 2, intro, id, glyph } = {}) {
  const hd = h(level === 3 ? "h3.bk-h3" : "h2.bk-h2", { id: id || null });
  if (glyph != null) hd.append(headGlyph(glyph));
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
    s === "now" ? h("span.bk-chap-deco.is-boat", boat({ bob: false, size: 40 })) : null,
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
  const bt = h("span.bk-gauge-boat", boat({ bob: false, size: 48 }));
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
    marks.append(h("span.bk-chart-boat", { style: { top: `${Ypct(mix[n - 1])}%` } }, boat({ bob: false, size: 40 })));
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

/** The brand: the boat (still), the name in display type and the subtitle in a Cinzel label. */
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
  // the current row stays in sight of the sticky Still pictures band; under 1024 px there is no column, and asking would only force a layout
  el.bk = { setCurrent: (cid) => {
    setCurrent(cid);
    const a = map.get(cid), w = el.ownerDocument && el.ownerDocument.defaultView;
    if (a && a.scrollIntoView && w && w.matchMedia && w.matchMedia("(min-width: 1024px)").matches) a.scrollIntoView({ block: "nearest" });
  } };
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
    // the browser leaves a control cut at the edge of a sideways strip or table, ring and all, unless it lies wholly outside
    for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
      if (!(p.scrollWidth > p.clientWidth + 1) || !/auto|scroll/.test(win.getComputedStyle(p).overflowX)) continue;
      const q = p.getBoundingClientRect(), b = el.getBoundingClientRect();
      p.scrollLeft += b.right + FOCUS_ROOM > q.right ? b.right + FOCUS_ROOM - q.right : b.left - FOCUS_ROOM < q.left ? b.left - FOCUS_ROOM - q.left : 0;
      break;
    }
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
// A new value on html restyles every element of the page, so it is written when the page is idle and only if it
// changed: never in the frame that draws a view, where the dock's first size arrives (style brief F9: opening the
// friends' Fields took up to 179 ms at 4x CPU when the two met). A browser without idle callbacks writes it at once.
let dockRoomFrom = null, dockRoomWait = false;
function keepDockRoom(el) {
  const root = el.ownerDocument && el.ownerDocument.documentElement;
  if (!root) return;
  const tall = el.isConnected ? Math.ceil(el.getBoundingClientRect().height) : 0;
  if (tall > 0) dockRoomFrom = el;
  else if (dockRoomFrom === el) dockRoomFrom = null;
  else return;
  const write = () => {
    dockRoomWait = false;
    const d = dockRoomFrom, v = d && d.isConnected ? `${Math.ceil(d.getBoundingClientRect().height)}px` : "0px";
    if (root.style.getPropertyValue("--bk-dock-h") !== v) root.style.setProperty("--bk-dock-h", v);
  };
  if (typeof requestIdleCallback !== "function") write();
  else if (!dockRoomWait) { dockRoomWait = true; requestIdleCallback(write, { timeout: 600 }); }
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
