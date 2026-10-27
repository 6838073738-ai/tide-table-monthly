// The facts mechanic's words for the browser: number and date formats, the 2.0 fact-line templates, the risk view's
// sentences and the wording linter. A port of docs/tt2/facts-risk-ref/lines.py (spec 7.1), kept equal to the
// pipeline's Python (pipeline/lines.py) by the shared vectors in tests/fixtures/facts/vectors.json.
//
// Pure ES module, no dependencies, nothing runs at import. It never decides anything: it words computed facts.
//
// Two Python details a port must copy, because the vectors pin them:
// - Rounding: Python formats the exact binary value of a float with ties to even, so 12.5 shows as "12" and 1.25
//   as "1.2". Number.toFixed rounds those ties up, so fixed() below rounds the exact value itself (BigInt).
// - Word edges: Python's \w and \b know every alphabet ("Gröbest" holds no banned word), so the patterns below use
//   Unicode letter and number classes instead of JavaScript's ASCII \w and \b.
//
// It holds the linter's banned-word list (BANNED, below): the words the linter refuses, never copy. The friends'
// build reads every other line of this file with its advice scan.

export const MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
export const SYMBOL = Object.freeze({ USD: "$", THB: "฿", JPY: "¥", EUR: "€", GBP: "£" });
// GBP is named by its code: the friends' leak check refuses the currency's English name anywhere in their build.
export const CUR_NAME = Object.freeze({ USD: "US dollars", THB: "baht", JPY: "Japanese yen", EUR: "euros", GBP: "GBP (sterling)" });
export const CUR_UNIT = Object.freeze({ USD: "dollar", THB: "baht", JPY: "yen", EUR: "euro", GBP: "GBP" });
export const MINUS = "−";
export const MAX_PER_SIDE = 4;

/** The fixed card orders with prices (facts-and-risk.md 2.3) and without them (spec 7.2). */
export const ORDER_WELL = Object.freeze(["streak", "price_5y", "dividends", "profit_trend", "sales_ups", "price_1y",
  "margin", "fx", "profit_ups"]);
export const ORDER_WRONG = Object.freeze(["deepest_fall", "swings", "fx", "profit_downs", "profit_trend", "price_5y",
  "price_1y", "below_high", "sales_downs", "margin"]);
export const ORDER_WELL_OPEN = Object.freeze(["streak", "profit_trend", "sales_ups", "margin", "fx", "profit_ups"]);
export const ORDER_WRONG_OPEN = Object.freeze(["no_prices", "fx", "profit_downs", "profit_trend", "sales_downs", "margin"]);
export const FX_CARD_MIN = 0.05;

// ---------------------------------------------------------------- exact decimal rounding (Python's format)

const DV = new DataView(new ArrayBuffer(8));

/** x >= 0, finite: [mantissa, exponent] with x = mantissa * 2 ** exponent exactly. */
function exactParts(x) {
  DV.setFloat64(0, x);
  const hi = DV.getUint32(0), lo = DV.getUint32(4);
  const e = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (e === 0) return [mant, -1074];
  mant |= 1n << 52n;
  return [mant, e - 1075];
}

/** Python's f"{x:.{d}f}": the exact binary value, rounded half to even, with d decimals. */
export function fixed(x, d = 0) {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  const neg = x < 0 || Object.is(x, -0);
  const [mant, exp] = exactParts(Math.abs(x));
  const scale = 10n ** BigInt(d);
  let q;
  if (exp >= 0) {
    q = (mant << BigInt(exp)) * scale;
  } else {
    const num = mant * scale;
    const den = 1n << BigInt(-exp);
    q = num / den;
    const twice = (num % den) * 2n;
    if (twice > den || (twice === den && (q & 1n) === 1n)) q += 1n;
  }
  let s = q.toString();
  if (d > 0) {
    s = s.padStart(d + 1, "0");
    s = `${s.slice(0, -d)}.${s.slice(-d)}`;
  }
  return (neg ? "-" : "") + s;
}

/** Python's f"{x:,.{d}f}": fixed() with commas between groups of three digits. */
export function grouped(x, d = 0) {
  const s = fixed(x, d);
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const dot = body.indexOf(".");
  const int = dot < 0 ? body : body.slice(0, dot);
  const frac = dot < 0 ? "" : body.slice(dot);
  return (neg ? "-" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + frac;
}

/** Python's f"{x:g}" (6 significant digits, trailing zeros dropped), for the split percent. */
export function gFormat(x) {
  if (!Number.isFinite(x)) return fixed(x);
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  const e = Number(x.toExponential(5).split("e")[1]);
  if (e >= -4 && e < 6) {
    let s = fixed(x, 5 - e);
    if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }
  let [m, ex] = x.toExponential(5).split("e");
  if (m.includes(".")) m = m.replace(/0+$/, "").replace(/\.$/, "");
  const n = Number(ex);
  return `${m}e${n < 0 ? "-" : "+"}${String(Math.abs(n)).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- formats (lines.py)

/** "+12%", "−8.4%", "0%": whole numbers from 10% up, one decimal below, a true minus sign. */
export function pct(x, signed = true) {
  const v = x * 100.0;
  const a = Math.abs(v);
  const s = a >= 9.95 ? fixed(a, 0) : fixed(a, 1);
  if (s === "0" || s === "0.0") return "0%";
  if (!signed) return `${s}%`;
  return (v > 0 ? "+" : MINUS) + s + "%";
}

/** "$13.7 billion", "¥2.5 trillion", "$1,500", "฿36.10"; short=false keeps small amounts exact. */
export function money(x, cur, short = true) {
  const sym = Object.prototype.hasOwnProperty.call(SYMBOL, cur) ? SYMBOL[cur] : `${cur} `;
  const a = Math.abs(x);
  const neg = x < 0 ? MINUS : "";
  if (short && a >= 1e12) return `${neg}${sym}${fixed(a / 1e12, 1)} trillion`;
  if (short && a >= 1e9) return a < 1e11 ? `${neg}${sym}${fixed(a / 1e9, 1)} billion` : `${neg}${sym}${fixed(a / 1e9, 0)} billion`;
  if (short && a >= 1e6) return `${neg}${sym}${fixed(a / 1e6, 1)} million`;
  if (a >= 1000) return `${neg}${sym}${grouped(a, 0)}`;
  if (Math.abs(a - Math.round(a)) < 1e-9) return `${neg}${sym}${fixed(a, 0)}`;
  return `${neg}${sym}${fixed(a, 2)}`;
}

/** "Sep 2021" for "2021-09". */
export function monthLabel(key) {
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/** "3 Oct 2026" for "2026-10-03". */
export function dayLabel(d) {
  return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}

/** A fiscal year named by its end: a December year is just "2025", any other "the year to Mar 2026". */
export function fyLabel(end) {
  if (end.slice(5, 7) === "12") return end.slice(0, 4);
  return `the year to ${monthLabel(end.slice(0, 7))}`;
}

/** "2022 to 2025", or "ending Jan 2023 to Jan 2026" when either year does not end in December. */
export function fySpan(a, b) {
  if (a.slice(5, 7) === "12" && b.slice(5, 7) === "12") return `${a.slice(0, 4)} to ${b.slice(0, 4)}`;
  return `ending ${monthLabel(a.slice(0, 7))} to ${monthLabel(b.slice(0, 7))}`;
}

/** "8.9" under 10, "43" from 10 up. */
export function times(x) {
  return x < 10 ? fixed(x, 1) : fixed(x, 0);
}

/** "YYYY-MM" plus n months. */
export function monthAdd(key, n) {
  const t = Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1) + n;
  return `${String(Math.floor(t / 12)).padStart(4, "0")}-${String((t % 12) + 1).padStart(2, "0")}`;
}

function cap(s) {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------- the 2.0 fact lines (spec 7.2, Appendix C)

/** The streak line for label y5 (facts-and-risk.md 2.3); ends = the fiscal year ends checked, oldest first. */
export function streakY5(name, ends) {
  return `${name} made a profit in each of its last ${ends.length} fiscal years (${fySpan(ends[0], ends[ends.length - 1])}).`;
}

/** The streak line for label y4ttm. */
export function streakY4ttm(name, ends, ttmEnd) {
  return `${name} made a profit in each of its last 4 fiscal years (ending ${monthLabel(ends[0].slice(0, 7))} to `
    + `${monthLabel(ends[ends.length - 1].slice(0, 7))}) and in the 12 months to ${monthLabel(ttmEnd.slice(0, 7))}.`;
}

/** The open-data company line no_prices; month = the window's last month ("YYYY-MM"). */
export function noPricesCompanyPublic(name, month) {
  return `This site uses open data only, so it has no share-price history: any fall in ${name}'s share price over `
    + `the 5 years to ${monthLabel(month)} is not counted in these lines.`;
}

/** The open-data field line no_prices. */
export function noPricesFieldPublic(n, month) {
  return `This site uses open data only, so it has no share-price history: how the share prices of these ${n} `
    + `companies moved over the 5 years to ${monthLabel(month)} is not counted in these lines.`;
}

/**
 * The personal set's no_prices line, for a company with no price history yet. source is the price source's name,
 * passed in by the owner's app (this shared file names no personal source).
 */
export function noPricesCompanyPersonal(name, month, source) {
  return `${source} has no share-price history for ${name} over the 5 years to ${monthLabel(month)}, so any `
    + "fall in its share price is not counted in these lines.";
}

/**
 * The card's two lists from a company's lines: the first that apply in the fixed order of the set's mode, at most
 * four a side; a line with card false (an exchange-rate move under 5%) waits for All facts.
 */
export function pick(lines, { prices = true, maxPerSide = MAX_PER_SIDE } = {}) {
  const res = {};
  for (const [side, order] of [["well", prices ? ORDER_WELL : ORDER_WELL_OPEN], ["wrong", prices ? ORDER_WRONG : ORDER_WRONG_OPEN]]) {
    const byId = new Map();
    for (const l of lines) {
      const onCard = l.card !== undefined ? l.card : l.cardEligible !== undefined ? l.cardEligible : true;
      if (l.side === side && onCard && !byId.has(l.id)) byId.set(l.id, l);
    }
    res[side] = order.filter((id) => byId.has(id)).map((id) => byId.get(id)).slice(0, maxPerSide);
  }
  return res;
}

// ---------------------------------------------------------------- the risk view in plain words (4.5)

/**
 * The risk card's sentences for one split (lines.risk_words). view and vwraView are riskmix.riskView results;
 * splitFieldsPct is the fields' share in percent (the split's tenths / 10); fieldNames are the plain names. The
 * first sentence repeats the reader's own input and is not a fact line.
 */
export function riskWords(view, vwraView, splitFieldsPct, fieldNames) {
  if (!view.enough) {
    return [`There are only ${view.months} months with data for every part of this mix; the picture needs `
      + `${view.need}. Choose other fields or a different split to see it.`];
  }
  const m0 = monthLabel(monthAdd(view.first, -1));
  const m1 = monthLabel(view.last);
  const r0 = monthLabel(view.first);
  const vEnd = 100.0 * (1.0 + view.growth);
  const wd = view.worstDrop;
  const names = fieldNames && fieldNames.length ? fieldNames.join(", ") : "no fields";
  const lines = [
    `Your split: ${gFormat(splitFieldsPct)}% in ${names} (shared equally), ${gFormat(100 - splitFieldsPct)}% in the all-world fund (VWRA).`,
    `฿100 kept in this mix from the end of ${m0} became ฿${fixed(vEnd, 0)} by the end of ${m1}.`,
  ];
  if (wd.depth < 0) {
    const tail = wd.recovered ? ` It took ${wd.climbMonths} months to climb back.` : ` By ${m1} it had not climbed back yet.`;
    lines.push(`Deepest dip: ฿100 at the high in ${monthLabel(wd.peakMonth)} was ฿${fixed(100 * (1 + wd.depth), 0)} `
      + `at the low in ${monthLabel(wd.troughMonth)}.${tail}`);
  } else {
    lines.push(`Deepest dip: none at month ends between ${m0} and ${m1}.`);
  }
  lines.push(`Bumpiness from ${r0} to ${m1}: about ${pct(view.swings, false)} a year. The all-world `
    + `fund alone over the same months: about ${pct(vwraView.swings, false)}.`);
  const { high: hi, low: lo } = view.rolling12;
  const loWord = lo.change < 0 ? "biggest 12-month fall" : "smallest 12-month rise";
  lines.push(`Biggest 12-month rise: ${pct(hi.change)} (${monthLabel(hi.from)} to ${monthLabel(hi.to)}). `
    + `${cap(loWord)}: ${pct(lo.change)} (${monthLabel(lo.from)} to ${monthLabel(lo.to)}).`);
  return lines;
}

// ---------------------------------------------------------------- the wording linter (facts-and-risk.md 2.2)

// Python's \w (Unicode letters, numbers and the underscore), \d and \s, for the patterns below.
const W = "[\\p{L}\\p{N}_]";
const D = "\\p{Nd}";

/** The banned patterns, in lines.py's order and Python syntax (\w, \d and \s are translated when compiled). */
export const BANNED = Object.freeze([
  // advice and instructions
  "buy", "buying", "sell", "selling", "hold", "holding", "recommend\\w*", "suggest\\w*", "advis\\w*",
  "should", "ought", "must", "consider", "avoid", "watch out", "don'?t miss",
  // forecasts
  "will", "would", "could", "might", "may(?!\\s+(?:19|20)\\d{2})", "likely", "unlikely", "expect\\w*", "forecast\\w*",
  "predict\\w*", "outlook", "target\\w*", "set to", "poised", "on track", "going to", "potential",
  "upside", "downside", "future", "soon", "next year", "guarantee\\w*",
  // judgements and ratings
  "best", "worst", "top", "winner\\w*", "loser\\w*", "leader\\w*", "laggard\\w*", "strong\\w*",
  "weak\\w*", "healthy", "solid", "impressive", "disappointing", "great", "good", "bad", "poor\\w*",
  "excellent", "attractive", "unattractive", "cheap\\w*", "expensive", "undervalued", "overvalued",
  "bargain", "fair value", "opportunit\\w*", "safe\\w*", "risky", "riskier", "conservative",
  "aggressive", "bullish", "bearish", "rally", "plunge\\w*", "soar\\w*", "crash\\w*", "tumbl\\w*",
  "surg\\w*", "skyrocket\\w*", "collaps\\w*", "momentum", "quality", "moat", "blue[- ]chip",
  "rating", "rated", "score", "grade", "stars?", "rank\\w*", "picks?", "favou?rite", "winning",
  "losing", "beat\\w*", "outperform\\w*", "underperform\\w*",
]);

function toJs(src) {
  return src.replace(/\\w/g, W).replace(/\\d/g, D).replace(/\\s/g, "\\s");
}

const BANNED_RE = new RegExp(`(?<![\\p{L}\\p{N}_-])(${BANNED.map(toJs).join("|")})(?![\\p{L}\\p{N}_-])`, "giu");
const MON = MONTHS.join("|");
const DATE_RE = new RegExp(`(?<!${W})(?:(?:${MON}) (?:19|20)${D}{2}|(?:19|20)${D}{2})(?!${W})`, "u");
const DIGIT_RE = /\p{Nd}/u;
/** The only places banned words may appear: fixed labels of the pages, never generated lines. */
export const ALLOWED_LABELS = Object.freeze(["What has been going well", "What could go wrong", "Worst drop"]);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Python's code-point string order (JavaScript's < compares UTF-16 units). */
function cpCompare(a, b) {
  const x = Array.from(a), y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d) return d;
  }
  return x.length - y.length;
}

/**
 * Replace each mask (a company, sector or publisher name) by "Name" where it stands exactly, case-sensitive and
 * not touching a letter, digit or underscore, longest first (spec 7.3).
 */
export function maskText(text, masks = []) {
  let out = String(text);
  const ms = [...new Set((masks || []).filter((m) => typeof m === "string" && m))]
    .sort((a, b) => Array.from(b).length - Array.from(a).length || cpCompare(a, b));
  for (const m of ms) out = out.replace(new RegExp(`(?<!${W})${escapeRe(m)}(?!${W})`, "gu"), "Name");
  return out;
}

/** Python's repr() of a string, as the linter's problem texts print the matched words. */
export function pyRepr(s) {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = q;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === q) out += `\\${q}`;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u.test(ch) || (/\p{Zs}/u.test(ch) && ch !== " ")) {
      out += cp < 0x100 ? `\\x${cp.toString(16).padStart(2, "0")}`
        : cp < 0x10000 ? `\\u${cp.toString(16).padStart(4, "0")}` : `\\U${cp.toString(16).padStart(8, "0")}`;
    } else out += ch;
  }
  return out + q;
}

/**
 * Problems with one generated line, after its masks: banned words (each as "banned word: 'word'"), a number
 * without a date, an exclamation mark. An empty list means the line is clean.
 */
export function lint(text, masks = []) {
  const t = maskText(text, masks);
  const problems = [];
  BANNED_RE.lastIndex = 0;
  for (const m of t.matchAll(BANNED_RE)) problems.push(`banned word: ${pyRepr(m[0])}`);
  if (DIGIT_RE.test(t) && !DATE_RE.test(t)) problems.push("number without a date");
  if (t.includes("!")) problems.push("exclamation mark");
  return problems;
}
