// The risk-mix maths for the browser: a port of the risk part of docs/tt2/facts-risk-ref/factsrisk.py (spec 7.1,
// facts-and-risk.md section 4), kept equal to it by tests/fixtures/facts/vectors.json and the worked example.
// Pure ES module, no dependencies, nothing runs at import. It computes past facts only; it never picks, ranks or
// proposes a split or a weight.
//
// Shapes: a month key is "YYYY-MM"; a series is {month: r | null}, r a simple monthly return in baht with
// dividends added back (0.05 = +5%); months is the list of return months, oldest first. A split is the fields'
// share in whole tenths of a percent, 0 to 1000 (the friends' strip moves in 50s).

export const MONTHS_IN_WINDOW = 60;
export const MIN_FIELD_MEMBERS = 3;
export const MIN_MIX_MONTHS = 36;
export const SPIKE_LOG = Math.log(3);
export const TENTHS_FULL = 1000;

const has = (x) => typeof x === "number" && Number.isFinite(x);

// ---------------------------------------------------------------- months

export function monthAdd(key, n) {
  const t = Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1) + n;
  return `${String(Math.floor(t / 12)).padStart(4, "0")}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Calendar months from a to b ("2021-09" to "2021-12" is 3). */
export function monthDiff(a, b) {
  return (Number(b.slice(0, 4)) * 12 + Number(b.slice(5, 7))) - (Number(a.slice(0, 4)) * 12 + Number(a.slice(5, 7)));
}

/** Every month key from first to last, both included. */
export function monthRange(first, last) {
  const out = [];
  for (let k = first; k <= last; k = monthAdd(k, 1)) out.push(k);
  return out;
}

// ---------------------------------------------------------------- returns

/** A local-currency return seen in baht; fx = baht per 1 unit of the local currency at each month end. */
export function toBase(rLocal, fxPrev, fxNow) {
  if (!has(rLocal) || !fxPrev || !fxNow) return null;
  return (1 + rLocal) * (fxNow / fxPrev) - 1;
}

/** Annualised swings: sample standard deviation (n-1) of monthly returns times sqrt(12); null under 2 returns. */
export function annVol(rs) {
  const xs = rs.filter(has);
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v) * Math.sqrt(12);
}

/** start, then start compounded by each return (rs.length + 1 values). */
export function valuePath(rs, start = 100) {
  const p = [start];
  for (const r of rs) p.push(p[p.length - 1] * (1 + r));
  return p;
}

/**
 * Deepest fall from a running high; months[0] is the starting month-end, rs[i] is months[i + 1]'s return. Ties:
 * the earliest low of the deepest depth, measured from the latest running high before it.
 */
export function worstDrop(rs, months) {
  const path = valuePath(rs);
  let run = 0;
  let best = { depth: 0, peak: null, trough: null };
  path.forEach((v, i) => {
    if (v >= path[run]) run = i;
    const dd = v / path[run] - 1;
    if (dd < best.depth - 1e-12) best = { depth: dd, peak: run, trough: i };
  });
  if (best.trough === null) {
    return { depth: 0, peakMonth: null, troughMonth: null, recoveryMonth: null, fallMonths: 0,
             climbMonths: null, belowAtEnd: 0, recovered: true };
  }
  const { peak: p, trough: t } = best;
  let rec = null;
  for (let i = t + 1; i < path.length; i++) if (path[i] >= path[p] - 1e-12) { rec = i; break; }
  return {
    depth: best.depth, peakMonth: months[p], troughMonth: months[t],
    recoveryMonth: rec === null ? null : months[rec], fallMonths: t - p,
    climbMonths: rec === null ? null : rec - t,
    belowAtEnd: rec === null ? path[path.length - 1] / path[p] - 1 : 0, recovered: rec !== null,
  };
}

/** Highest and lowest 12-month change, with the months each window starts and ends on; null under 13 values. */
export function rolling12m(rs, months) {
  const path = valuePath(rs);
  if (path.length < 13) return null;
  let hi = null, lo = null;
  for (let i = 12; i < path.length; i++) {
    const w = { change: path[i] / path[i - 12] - 1, from: months[i - 12], to: months[i] };
    // ties, as in factsrisk.py: the highest keeps the later window, the lowest the earlier one
    if (!hi || w.change >= hi.change) hi = w;
    if (!lo || w.change < lo.change) lo = w;
  }
  return { high: hi, low: lo, windows: path.length - 12 };
}

// ---------------------------------------------------------------- the field basket and its data-error guard

/**
 * Months whose return looks like a data error: |ln(1+r)| > ln 3 and the next month undoes more than half of it.
 * Both months are returned. A real crash that stays down is kept; the newest month cannot be judged yet.
 */
export function spikeMonths(rs) {
  const keys = Object.keys(rs).sort();
  const out = new Set();
  keys.forEach((a, i) => {
    const r = rs[a];
    if (!has(r) || r <= -1) return;
    const la = Math.log1p(r);
    if (Math.abs(la) <= SPIKE_LOG) return;
    const b = i + 1 < keys.length ? keys[i + 1] : null;
    const rb = b ? rs[b] : null;
    if (has(rb) && rb > -1 && Math.abs(la + Math.log1p(rb)) < 0.5 * Math.abs(la)) {
      out.add(a);
      out.add(b);
    }
  });
  return out;
}

/**
 * An equal share in every member, evened out every month: the plain mean of the members' returns that month, spike
 * months left out, none when fewer than minMembers have a return. members: {id: series}.
 */
export function fieldSeries(members, months, minMembers = MIN_FIELD_MEMBERS) {
  const flagged = Object.fromEntries(Object.entries(members).map(([id, rs]) => [id, spikeMonths(rs)]));
  const series = {}, counts = {};
  for (const m of months) {
    const xs = [];
    for (const [id, rs] of Object.entries(members)) {
      if (has(rs[m]) && !flagged[id].has(m)) xs.push(rs[m]);
    }
    counts[m] = xs.length;
    series[m] = xs.length >= minMembers ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  }
  const out = {};
  for (const [id, set] of Object.entries(flagged)) if (set.size) out[id] = [...set].sort();
  return { series, counts, flagged: out };
}

// ---------------------------------------------------------------- the friend's split

/**
 * fieldsTenths/1000 shared equally by the chosen fields, the rest in VWRA, put back to that split every month. Only
 * months where every needed input has a value are used. fields: [series], vwra: series.
 */
export function mixSeries(fields, vwra, fieldsTenths, months) {
  if (!Number.isInteger(fieldsTenths) || fieldsTenths < 0 || fieldsTenths > TENTHS_FULL) {
    throw new RangeError("fieldsTenths must be an integer 0..1000");
  }
  const wF = fields.length ? fieldsTenths / TENTHS_FULL : 0;
  const used = [], out = [];
  for (const m of months) {
    const v = vwra[m];
    const fs = fields.map((f) => f[m]);
    if (!has(v) && wF < 1) continue;
    if (fields.length && wF > 0 && fs.some((x) => !has(x))) continue;
    const favg = fields.length && wF > 0 ? fs.reduce((a, b) => a + b, 0) / fs.length : 0;
    out.push(wF * favg + (1 - wF) * (wF < 1 ? v : 0));
    used.push(m);
  }
  return { months: used, returns: out };
}

function viewOf(used, rs) {
  if (rs.length < MIN_MIX_MONTHS) return { enough: false, months: rs.length, need: MIN_MIX_MONTHS };
  const pathMonths = [monthAdd(used[0], -1), ...used];
  const path = valuePath(rs);
  return {
    enough: true, months: rs.length, first: used[0], last: used[used.length - 1],
    gapMonths: monthDiff(used[0], used[used.length - 1]) + 1 - used.length,
    swings: annVol(rs), worstDrop: worstDrop(rs, pathMonths), rolling12: rolling12m(rs, pathMonths),
    growth: path[path.length - 1] / 100 - 1, path, pathMonths, returns: rs,
  };
}

/** Everything the risk card shows for one split (facts-and-risk.md 4.2); {enough: false, …} under 36 months. */
export function riskView(fields, vwra, fieldsTenths, months) {
  const { months: used, returns: rs } = mixSeries(fields, vwra, fieldsTenths, months);
  return viewOf(used, rs);
}

// ---------------------------------------------------------------- a mix of holdings (the owner's builder)

/**
 * M_t = sum of w_i r_i,t for the weights given (any amounts; they are scaled to add up to 1 over the holdings
 * used). Holdings with no weight are not used; a holding with fewer than minHistory months of returns is left out
 * and named in short; the mix uses the months every other holding has. series: {id: series}; weights: {id: number}.
 */
export function holdingsMix(series, weights, months, { minHistory = MIN_MIX_MONTHS } = {}) {
  const ids = Object.keys(weights).filter((id) => has(weights[id]) && weights[id] > 0).sort();
  const short = [], missing = [], used = [];
  for (const id of ids) {
    const rs = series[id];
    if (!rs) { missing.push(id); continue; }
    if (months.filter((m) => has(rs[m])).length < minHistory) short.push(id);
    else used.push(id);
  }
  const total = used.reduce((a, id) => a + weights[id], 0);
  const w = Object.fromEntries(used.map((id) => [id, weights[id] / total]));
  const outMonths = [], returns = [];
  if (used.length) {
    for (const m of months) {
      if (!used.every((id) => has(series[id][m]))) continue;
      returns.push(used.reduce((a, id) => a + w[id] * series[id][m], 0));
      outMonths.push(m);
    }
  }
  return { months: outMonths, returns, used, short, missing, weights: w };
}

/** riskView's numbers for a holdings mix, plus which holdings were used, left out as short, or had no series. */
export function holdingsView(series, weights, months, opts = {}) {
  const mx = holdingsMix(series, weights, months, opts);
  return { ...viewOf(mx.months, mx.returns), used: mx.used, short: mx.short, missing: mx.missing };
}
