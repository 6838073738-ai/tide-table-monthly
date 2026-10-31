// The almanac's pieces in the friends' screens (the alchemist's almanac look: docs/tt2/ADDENDUM-2026-10-27d.md B.3 to
// B.5, B2.2, C and D, with the glass almanac of docs/tt2/ADDENDUM-2026-10-28.md B; docs/tt2/build/book-api.md 19.7
// and 20). book.js draws them; this file only says where they go. All of them are decoration and aria-hidden:
//
// - the hero box heads Today's first screen (book.heroBox: the night plate, the poster wheel, the disc), and its
//   heading stands alone under it; js/hero.js, once it is on the page, may grow the 3D armillary out of the poster
//   (mountHero), and stops when Today is left (unmountHero);
// - the frontispiece plate opens My year, not Today (addendum 2026-10-28 B.2: one subject per screen); the setup
//   keeps it on a first visit;
// - a tarot card stands beside the date heading of each dated step, never beside an amount or a tick (style brief
//   3.1): on My year each month's, on Today each next step's. The card is the one of the order date the step leads up
//   to (month 1 is I), so a date has the same card on every page, and never follows what a step buys;
// - a plate marks an empty state;
// - every page's heading carries the zodiac glyph of the page's fixed place in the contents (GLYPH_PLACE), which steps
//   from air, fire and earth to its sign on the page's first opening in a session, and the Folio kicker of the same
//   place over it ("Folio I" to "Folio X");
// - the colophon (the manifestation signs of addendum C) has a cell of its own in the footer, beside the fixed
//   disclaimer only, with its watermark kept inside that cell.
//
// None of them is ever on, beside or behind a money figure, a holding, an order, a price, a ceiling, a button, a form
// field or a line about the locked listing, and none of them is tied to a holding (addendum C and D). The plates keep
// 24 px (32 px from 760 px wide) from every figure and control (the calm zone of the style brief's F2, css/app.css),
// and the hero box keeps it from Today's next-step panel, with the heading between them.
//
// A slow phone (spec 13.3, addendum D): the cards are drawn after the page's own words, in tasks of their own, into
// slots that already hold their room, so the page never moves when they arrive and the page's own task does not grow.
// The hero box is built once and kept; js/hero.js is asked for only after the page is drawn.

import { h } from "../core.js?v=2.2.0";
import * as book from "../book.js?v=2.2.0";

/** Each page's fixed place in the contents (main.js VIEWS), for its heading's glyph and Folio: the same number on
 *  every visit, with or without the open data. The glyph never follows what a page shows. */
export const GLYPH_PLACE = Object.freeze({
  today: 1, fields: 2, stocks: 3, growth: 4, split: 5, year: 6, money: 7, holdings: 8, rules: 9, settings: 10,
});

/** The wheel turns once in --d-turn (tokens.css, book-api 19.2), in 4,800 steps (book.css). */
const TURN_S = 240;
const TURN_STEPS = 4800;
/** The pages whose glyph has stepped to its sign in this browser session (sessionStorage, and here). */
const SEEN_KEY = "ttm:glyphs-seen";
/**
 * The pages whose glyph never steps: their heading stands within the calm zone of a money figure (My year's "$500 a
 * month" eyebrow, Money's lede), where nothing may move (style brief F2), so their sign shows at once. The router
 * leaves their headings unveiled for the same reason (main.js calmAround).
 */
const STILL_GLYPH = new Set(["year", "money"]);

// ---------------------------------------------------------------- drawing later, in short tasks
const queue = [];
let timer = 0;
function later(fn) {
  queue.push(fn);
  if (!timer) timer = setTimeout(drain, 0);
}
function drain() {
  timer = 0;
  const t0 = performance.now();
  while (queue.length) {
    try { queue.shift()(); } catch (e) { console.warn(e); }
    if (queue.length && performance.now() - t0 > 30) { timer = setTimeout(drain, 0); return; }
  }
}

let seen = null;
function seenPages() {
  if (!seen) {
    seen = new Set();
    try { for (const id of JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]")) seen.add(String(id)); } catch { /* blocked: this page load only */ }
  }
  return seen;
}
function markSeen(id) {
  seenPages().add(id);
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch { /* blocked: this page load only */ }
}

/**
 * Put the page's glyph before the words of its heading #h-<id> (inside it, aria-hidden, so the heading's name stays
 * the same), and the page's Folio kicker over it (placeFolio). Once per heading. entering: the page has just opened
 * (route()); on its first opening in this session its glyph steps from air, fire and earth to its sign (book.css
 * --d-glyph; at once when motion is stopped, and always on the STILL_GLYPH pages).
 */
export function markHead(id, section, { entering = false } = {}) {
  const n = GLYPH_PLACE[id];
  const hd = n && section ? section.querySelector(`#h-${id}`) : null;
  if (!hd || hd.querySelector(".bk-head-glyph")) return;
  const step = !!entering && !STILL_GLYPH.has(id) && !seenPages().has(id);
  (hd.querySelector(".bk-title-main") || hd).prepend(book.headGlyph(n, { step }));
  if (step) markSeen(id);
  placeFolio(hd, n);
}

/**
 * The Folio kicker over a heading, in the running head: at the right of the eyebrow just before the heading, or of the
 * heading's own kicker line; on a line of its own, at the right, over a title with neither. Once per heading block.
 */
const EYEBROW = ".eyebrow, .ix-eyebrow, .bk-eyebrow";
function placeFolio(hd, n) {
  const box = hd.parentElement;
  if (!box || box.querySelector(":scope > .bk-folio")) return;
  const folio = book.folio(n);
  const prev = hd.previousElementSibling;
  if (prev && prev.matches(EYEBROW)) prev.before(folio);
  else {
    if (!hd.querySelector(".bk-kicker")) folio.classList.add("is-alone");
    hd.before(folio);
  }
}

const frontis = new Map();
/**
 * The frontispiece, the engraved hero plate, at the head of a page: one kept element per page (key), so a redraw
 * never loads it again. Lazy, except on the screen a first visit opens on (the setup: lazy false).
 */
export function frontispiece(key, { lazy = true } = {}) {
  if (!frontis.has(key)) {
    frontis.set(key, h("div.alm-frontis", { "data-alm": "frontispiece" }, book.plate({ art: "hero", size: "hero", lazy })));
  }
  return frontis.get(key);
}

// ---------------------------------------------------------------- the hero box (addendum 2026-10-28 B; brief 3.1)

/** The ring's own clock: the wall clock less the time the ring has stood still while the 3D turned (lag), so it turns
 *  on from where it stood. heldAt: when the hold now running began. */
let lag = 0, heldAt = 0;
const turnClock = () => Date.now() - lag;
/** The wheel's angle at a time on the ring's clock, as its CSS turn draws it: one turn in TURN_S, in TURN_STEPS steps. */
const turnDeg = (ms) => ((Math.floor((((ms / 1000) % TURN_S) / TURN_S) * TURN_STEPS) / TURN_STEPS) * 360).toFixed(3);
/**
 * The ring keeps its place across redraws, holds and returns: its turn is set from the ring's clock, not from when it
 * was put on the page. A running CSS turn takes a new delay as if it had it from its start, so it would jump: the ring
 * is put back in its place as well, which starts its turn again, now, from that clock. So a redraw that keeps the box
 * on the page (the routers) never moves the signs.
 */
function keepTurn(box) {
  const spin = box.querySelector(".bk-wheel-spin");
  if (!spin || spin.style.transform) return;
  spin.style.animationDelay = `${-((turnClock() / 1000) % TURN_S).toFixed(2)}s`;
  const p = spin.parentNode;
  if (p && spin.isConnected) { const next = spin.nextSibling; p.removeChild(spin); p.insertBefore(spin, next); }
}
/**
 * One subject moves at a time (brief 3.0): while the 3D turns (hero.js: moving, still or paused) book.css stops the
 * wheel's turn, and the signs keep the angle they had reached, so nothing jumps; when only the poster shows again they
 * turn on from that angle (the time held is added to lag), never from where the wall clock has got to.
 */
const HELD = new Set(["moving", "still", "paused"]);
function holdTurn(box) {
  const spin = box.querySelector(".bk-wheel-spin");
  if (!spin) return;
  if (HELD.has(box.getAttribute("data-hero-state"))) {
    if (!spin.style.transform) { heldAt = Date.now(); spin.style.transform = `rotate(${turnDeg(turnClock())}deg)`; }
  } else if (spin.style.transform) {
    lag += Date.now() - heldAt;
    spin.style.transform = "";
    keepTurn(box);
  }
}

let heroEl = null;
/**
 * Today's hero box (book.heroBox), built once and kept, so a redraw never builds it again and the canvas hero.js puts
 * in it stays. It heads Today's first screen; Today's heading stands alone under it.
 */
export function hero() {
  if (!heroEl) {
    heroEl = book.heroBox({ id: "ttm-hero" });
    if (typeof MutationObserver === "function") {
      new MutationObserver(() => holdTurn(heroEl)).observe(heroEl, { attributes: true, attributeFilter: ["data-hero-state"] });
      // motion stopped and allowed again (Still pictures, a hidden tab, reduced motion): the CSS turn starts again then,
      // from the ring's clock too, so the 3D never takes over at another angle than the one the signs show
      const again = () => { if (heroEl.isConnected) keepTurn(heroEl); };
      const root = typeof document === "object" && document.documentElement;
      if (root) new MutationObserver(again).observe(root, { attributes: true, attributeFilter: ["data-motion", "data-tab"] });
      const reduce = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
      if (reduce && reduce.addEventListener) reduce.addEventListener("change", again);
    }
  }
  keepTurn(heroEl);
  return heroEl;
}

let heroAsked = false, heroWarned = false;
/**
 * Ask js/hero.js to grow the 3D armillary out of the poster, once the box is on the page (Today's afterRender).
 * hero.js runs its own gates (reduced motion, Still pictures, Save-Data, memory, a WebGL2 context) before it fetches
 * anything more, and does nothing new for a box it holds already; if it cannot load, the poster stays.
 */
export function mountHero(box) {
  if (!box || !box.isConnected) return;
  heroAsked = true;
  const onFail = (e) => {
    if (!heroWarned) { heroWarned = true; console.warn("The hero stays a still picture:", e && e.message ? e.message : e); }
  };
  import('../hero.js?v=2.2.0').then((m) => m.mountHero(box)).catch(onFail);
}
/** Today is left: hero.js pauses (and lets its context go a while later). Nothing to do if it was never asked for. */
export function unmountHero() {
  if (!heroAsked) return;
  import('../hero.js?v=2.2.0').then((m) => m.unmountHero()).catch(() => { /* never loaded */ });
}

/**
 * A step's place in time for its card (1 = the plan's first order date): the order date the step leads up to. An
 * order is its own date's; a send or an arrival is the order date it pays for (forDate); anything else (the
 * checklist, a check day) is the first order date on or after its own date. Null after the last order date. So My
 * year's month k and every step that leads up to it carry the same card, and nothing a step buys counts.
 * dates: schedule().dates, oldest first ({id, effective}).
 */
export function placeOf(dates, e) {
  if (!Array.isArray(dates) || !e) return null;
  const at = (id) => dates.findIndex((d) => d.id === id);
  let k = -1;
  if (e.kind === "order") k = at(e.id);
  else if (e.forDate) k = at(e.forDate);
  if (k < 0 && e.date) k = dates.findIndex((d) => d.effective >= e.date);
  return k < 0 ? null : k + 1;
}

/** A card's slot: the card's own box, empty, filled with the card a task later (nothing moves when it comes). */
function cardSlot(position, cls) {
  const slot = h(`div.bk-card.is-small.alm-slot${cls}`, { "aria-hidden": "true" });
  later(() => {
    if (!slot.isConnected) return;
    const c = book.tarotCard({ position, small: true });
    for (const k of cls.split(".").filter(Boolean)) c.classList.add(k);
    slot.replaceWith(c);
  });
  return slot;
}

/**
 * A dated step with its tarot card: the card of the step's place in time (position, 1 = the first). The card and el's
 * first child (the step's date heading, which holds no amount) share a row of their own, div.alm-step-head, at the top
 * of el; everything else in el keeps its own layout under that row, clear of the card (css/app.css). The card carries
 * no date of its own here: the heading beside it says the date.
 */
export function dated(el, position) {
  if (!el || !(Number(position) >= 1)) return el;
  const head = el.firstElementChild;
  const row = h("div.alm-step-head", cardSlot(position, ""));
  el.classList.add("alm-dated");
  if (head) { el.insertBefore(row, head); row.append(head); } else el.prepend(row);
  return el;
}

/** A small card face for a step in a list (Today's next steps), decorative: an empty cell when the step has no place. */
export function miniCard(position) {
  return Number(position) >= 1 ? cardSlot(position, ".alm-mini") : h("span.alm-mini.is-none", { "aria-hidden": "true" });
}

/** An empty state with a small decorative plate above it. */
export function emptyPlate(art, node) {
  return h("div.alm-empty", book.plate({ art, size: "small" }), node);
}

let sealEl = null;
/**
 * The footer with the colophon: the fixed disclaimer, the colophon in a cell of its own beside it (from 720 px; under
 * it on a phone), and the footer's other lines under an engraved hairline, away from the colophon. Those lines name
 * the plan with its amount, so the colophon never sits beside them.
 */
export function withColophon(foot) {
  if (!foot || !foot.firstElementChild) return foot;
  if (!sealEl) {
    // the footer is below the first screen: the colophon is drawn a task later, in its own cell
    sealEl = h("div.alm-seal", { "aria-hidden": "true", "data-alm": "colophon" });
    later(() => sealEl.append(book.colophon()));
  }
  const [, ...rest] = [...foot.children];
  foot.classList.add("alm-foot");
  foot.append(sealEl);
  if (rest.length) foot.append(h("div.alm-foot-more", rest));
  return foot;
}
