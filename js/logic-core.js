// Pure plan logic for a monthly plan: no DOM, no fetch. Every function takes plain data and returns
// plain data. logic.js re-exports all of it (and adds functions of its own), so app.js and the
// tests see one module; the friends' app (friends/) imports this file alone.

export const DAY_MS = 86400000;

// ---------- dates (all plan dates are Bangkok calendar dates) ----------

/** "2026-12-08" + "16:00" Bangkok -> epoch ms. Bangkok has no DST (UTC+7). */
export function bkkToEpoch(dateStr, timeStr = "00:00") {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr === "any" ? [0, 0] : timeStr.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh - 7, mm);
}

/** Bangkok calendar date "YYYY-MM-DD" for an epoch ms. */
export function bkkDate(epochMs) {
  const t = new Date(epochMs + 7 * 3600000);
  return t.toISOString().slice(0, 10);
}

export function daysBetween(fromDate, toDate) {
  return Math.round((bkkToEpoch(toDate) - bkkToEpoch(fromDate)) / DAY_MS);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" plus n calendar months; the day is clamped to the target month (31 Mar − 1 month = 28/29 Feb). */
export function addMonthsIso(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, dim))).toISOString().slice(0, 10);
}

/** The last Monday–Friday strictly before a date (holidays are not modelled). */
export function prevBusinessDay(dateStr) {
  let t = bkkToEpoch(dateStr, "12:00");
  do { t -= DAY_MS; } while ([0, 6].includes(new Date(t + 7 * 3600000).getUTCDay()));
  return bkkDate(t);
}

// ---------- schedule ----------

/** The calendar date an order date falls on. A plan whose dates can move passes its own resolver
 *  (orderDate, settings) -> "YYYY-MM-DD" to buildSchedule, nextEvents and fundingWarnings. */
const planDate = (orderDate) => orderDate.date;

/** True when the plan is funded month by month (funding.mode "monthly"). */
export const isMonthly = (plan) => !!(plan && plan.funding && plan.funding.mode === "monthly");

export function buildSchedule(plan, settings = {}, dateOf = planDate) {
  const dates = plan.orderDates.map((d) => ({ ...d, effective: dateOf(d, settings) }));
  const byId = Object.fromEntries(dates.map((d) => [d.id, d]));
  const orders = plan.orders.map((o) => {
    const d = byId[o.dateId];
    // Crypto orders ("any" time) sort as 09:00 Bangkok.
    return { ...o, date: d.effective, timeBkk: o.time, at: bkkToEpoch(d.effective, o.time === "any" ? "09:00" : o.time) };
  });
  return { dates, orders };
}

/** Next upcoming event (order date or funding deadline) at or after now. */
export function nextEvents(plan, settings, state, nowMs, funding, dateOf = planDate) {
  const { dates } = buildSchedule(plan, settings, dateOf);
  const events = [];
  // `at` orders and counts down; `untimed` marks events the plan gives no clock time for (crypto
  // "any hour" days, send days, arrive-by and checklist deadlines), so the UI shows only their date.
  for (const d of dates) {
    const first = plan.orders.filter((o) => o.dateId === d.id).map((o) => o.time).filter((t) => t !== "any").sort()[0];
    events.push({ kind: "order", id: d.id, date: d.effective, at: bkkToEpoch(d.effective, first || "09:00"), untimed: !first, title: d.title, summary: d.summary, step: d.step });
  }
  for (const t of (funding ? funding.transfers : [])) {
    if (t.arriveBy) events.push({ kind: "funding", id: t.id, date: t.arriveBy, at: bkkToEpoch(t.arriveBy, "17:00"), untimed: true, title: `${t.label} must arrive`, summary: t.pays });
    if (t.send) events.push({ kind: "send", id: t.id + "-send", date: t.send, at: bkkToEpoch(t.send, "10:00"), untimed: true, title: `Send: ${t.label}`, summary: t.pays });
  }
  for (const m of plan.milestones || []) events.push({ kind: "milestone", id: m.id, date: m.date, at: bkkToEpoch(m.date, "23:59"), untimed: true, title: m.title, summary: m.text });
  events.push({ kind: "prep", id: "prep", date: plan.prepDeadline, at: bkkToEpoch(plan.prepDeadline, "17:00"), untimed: true, title: "Final checks done", summary: "Accounts, practice run, thesis checks and calendar — before any money moves." });
  return events.filter((e) => e.at + 6 * 3600000 >= nowMs).sort((a, b) => a.at - b.at);
}

// ---------- funding ----------

/**
 * Monthly funding: one fixed transfer per month (plus SwissBorg in the first month), each paying the
 * order date in t.forDate. A logged amount (state.funding[id].sentUsd / sentThb) replaces the plan's;
 * baht are worked out at `fx` otherwise. Each transfer keeps the plan's fields, plus planUsd, usd and thb.
 */
export function computeMonthlyFunding(plan, fx, fundingState = {}) {
  const sent = (id, key) => (fundingState && fundingState[id] && Number.isFinite(fundingState[id][key]) ? fundingState[id][key] : null);
  const transfers = plan.funding.transfers.map((t) => {
    const usd = sent(t.id, "sentUsd") ?? t.usd;
    return { ...t, planUsd: t.usd, usd, thb: sent(t.id, "sentThb") ?? Math.round(usd * fx) };
  });
  const totalUsd = round2(transfers.reduce((a, t) => a + (t.usd || 0), 0));
  const totalThb = transfers.reduce((a, t) => a + (t.thb || 0), 0);
  return { fx, monthly: true, transfers, totalUsd, totalThb, monthlyUsd: plan.funding.monthlyUsd, budgetThbAtFx: Math.round(plan.meta.budgetUsd * fx) };
}

/** Warnings derived from a monthly plan's funding timing vs its order schedule (none for a plan that
 *  is not monthly). Levels: info | warn | alert. */
export function fundingWarnings(plan, funding, settings, dateOf = planDate) {
  const w = [];
  if (!isMonthly(plan)) return w;
  // Each month's money arrives the Friday before its date; a hand-edited plan could break that.
  const dateOfId = Object.fromEntries(buildSchedule(plan, settings, dateOf).dates.map((d) => [d.id, d.effective]));
  for (const t of funding.transfers) {
    if (t.send && t.arriveBy && t.send > t.arriveBy) w.push({ level: "warn", id: "send-late-" + t.id, text: `${t.id} ${t.label}: it is sent ${t.send}, after its arrive-by date (${t.arriveBy}).` });
    const d = dateOfId[t.forDate];
    if (t.arriveBy && d && t.arriveBy > d) w.push({ level: "warn", id: "arrive-late-" + t.id, text: `${t.id} ${t.label}: it arrives ${t.arriveBy}, after the orders it pays for (${d}).` });
  }
  return w;
}

// ---------- ceilings ----------

/**
 * Resolve an instrument's ceiling in its quote unit.
 * closes: { [instrumentId]: {date, close} } captured 27 Nov closes; overrides: manual values from settings.
 */
export function resolveCeiling(inst, closes = {}, overrides = {}) {
  const c = inst.ceiling;
  if (!c) return { kind: "none", value: null };
  if (Number.isFinite(overrides[inst.id])) return { kind: "manual", value: overrides[inst.id], unit: c.unit };
  if (c.type === "fixed") return { kind: "fixed", value: c.value, unit: c.unit };
  if (c.type === "close_plus") {
    const got = closes[inst.id];
    if (got && got.date === c.date && Number.isFinite(got.close)) {
      return { kind: "close_plus", value: round2(got.close * (1 + c.pct / 100)), unit: c.unit, close: got.close, date: c.date, pct: c.pct };
    }
    return { kind: "pending", value: null, unit: c.unit, date: c.date, pct: c.pct };
  }
  return { kind: "none", value: null };
}

/** Status of a live price vs its ceiling. */
export function ceilingStatus(price, ceiling) {
  if (!ceiling || ceiling.value == null) return ceiling && ceiling.kind === "pending" ? "pending" : "nocap";
  if (!Number.isFinite(price)) return "unknown";
  return price <= ceiling.value ? "under" : "over";
}

export function headroomPct(price, ceilingValue) {
  if (!Number.isFinite(price) || !Number.isFinite(ceilingValue) || ceilingValue === 0) return null;
  return ((ceilingValue - price) / ceilingValue) * 100;
}

// ---------- order sizing ----------

/**
 * How to place one dollar-amount order (kind "usd") at the given live price: fractional shares, whole
 * shares or a coin amount, following the order's flags. quote: {price}; fx is not needed for dollar
 * orders. An order of any other kind comes back unsized.
 * Returns {qty, qtyLabel, estCostUsd, limit, limitUnit, leftoverUsd, notes[]}.
 */
export function sizeOrder(order, inst, quote, fx, ceiling, adjustUsd = 0) {
  const price = quote && Number.isFinite(quote.price) ? quote.price : null;
  const out = { qty: null, qtyLabel: "—", estCostUsd: null, limit: null, limitUnit: inst.quoteCurrency, leftoverUsd: 0, notes: [] };
  const usd = Math.max(0, (order.usd || 0) + adjustUsd);
  // A SwissBorg dollar amount includes its fee: qty × price + fee = the dollars in the wallet.
  const feeMult = inst.account === "SwissBorg" && Number.isFinite(inst.feePct) ? 1 + inst.feePct / 100 : 1;
  const feeNote = feeMult > 1 ? ` The ${fmtNum(inst.feePct, 2)}% fee comes out of the same dollars.` : "";

  switch (order.kind) {
    case "usd": {
      if (order.fractional) {
        out.estCostUsd = usd;
        if (price) {
          out.qty = Math.floor((usd / price) * 100) / 100;
          out.qtyLabel = `${out.qty.toFixed(2)} sh`;
          const lim = price * 1.005;
          out.limit = ceiling && ceiling.value != null ? Math.min(lim, ceiling.value) : lim;
        }
        out.notes.push("Fractional: enter a $" + fmtInt(usd) + " cash amount, limit at the ask + 0.5%, never above the ceiling.");
      } else if (order.wholeShares) {
        if (price) {
          out.qty = Math.floor(usd / price);
          out.qtyLabel = `${out.qty} sh`;
          out.estCostUsd = round2(out.qty * price);
          out.leftoverUsd = round2(usd - out.estCostUsd);
          out.limit = price;
        }
        out.notes.push("Whole shares: dollar amount ÷ ask, rounded down.");
      } else {
        out.estCostUsd = usd;
        if (price) { out.qty = usd / (price * feeMult); out.qtyLabel = `${fmtNum(out.qty, 6)} ${inst.id}`; }
        if (feeNote) out.notes.push(feeNote.trim());
      }
      break;
    }
    default:
      break;
  }
  return out;
}

// ---------- carry-overs from logged fills ----------

/**
 * USD cost of a fill as entered by the user: qty × price plus fees, for an instrument quoted in US
 * dollars (fees in dollars too). Other quote currencies: null.
 */
export function fillCostUsd(inst, qty, price, fees, fx) {
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return null;
  const f = Number.isFinite(fees) ? fees : 0;
  return inst.quoteCurrency === "USD" ? round2(qty * price + f) : null;
}

/** Pre-fill for the fee field: the instrument's SwissBorg fee (its feePct); brokers vary, so 0 elsewhere. */
export function suggestFees(inst, qty, price) {
  if (inst.account === "SwissBorg" && Number.isFinite(inst.feePct) && Number.isFinite(qty) && Number.isFinite(price)) return round2(qty * price * (inst.feePct / 100));
  return 0;
}

/**
 * Monthly plans: each order marked carryTarget (VWRA) also buys what earlier IBKR orders left unspent:
 * cash left over from whole shares or under a planned amount, a skipped order's money (rules r1/r2 send
 * it to VWRA), and the difference between a month's logged transfer and its planned amount (rule r10).
 * Walks the dates in order. A filled VWRA order passes on only its own leftover; one still to buy is
 * assumed to take the carry, so later months start again from zero (a shortfall is carried on). Money
 * the user chose to keep as cash when skipping ("redirect": "cash") is not carried.
 * Also sizes the January coins from the SwissBorg wallet (walletUsd, coinUsd).
 * Returns { byOrder: { id: { planUsd, carryUsd, usd, shortUsd } }, nextId, nextCarryUsd, walletUsd, coinUsd }.
 */
export function computeMonthlyCarry(plan, orderState = {}, fundingState = {}) {
  const dates = [...plan.orderDates].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const st = (id) => orderState[id] || {};
  const cost = (id) => (Number.isFinite(st(id).costUsd) ? st(id).costUsd : null);
  const sentDiff = (t) => {
    const f = fundingState && fundingState[t.id];
    return f && Number.isFinite(f.sentUsd) ? f.sentUsd - (t.usd || 0) : 0;
  };
  const byOrder = {};
  let running = 0;
  let nextId = null;
  for (const d of dates) {
    for (const t of plan.funding.transfers || []) if (t.forDate === d.id && t.to === "IBKR") running += sentDiff(t);
    const os = plan.orders.filter((o) => o.dateId === d.id && o.account === "IBKR");
    const target = os.find((o) => o.carryTarget);
    let others = 0;
    for (const o of os) {
      if (o === target) continue;
      const s = st(o.id);
      if (s.status === "filled" && cost(o.id) != null) others += (o.usd || 0) - cost(o.id);
      else if (s.status === "skipped" && s.redirect !== "cash") others += o.usd || 0;
    }
    if (!target) { running += others; continue; }
    const carryUsd = round2(running + others);
    const raw = round2(target.usd + carryUsd);
    byOrder[target.id] = { planUsd: target.usd, carryUsd, usd: Math.max(0, raw), shortUsd: raw < 0 ? -raw : 0 };
    const s = st(target.id);
    if (s.status === "filled" && cost(target.id) != null) running = round2(raw - cost(target.id));
    else if (s.status === "skipped") running = s.redirect === "cash" ? Math.min(0, raw) : raw; // "Keep as cash" holds the money back; a shortfall still carries on
    else {
      if (nextId == null) nextId = target.id;
      running = Math.min(0, raw);
    }
  }
  // SwissBorg: the coins marked cryptoWait (ether, solana) are paid from what the first month's transfer
  // leaves after the bitcoin buy. Less than planned: both shrink in proportion; more: they keep the
  // plan's amounts and the rest stays in the wallet.
  const swissT = (plan.funding.transfers || []).filter((t) => t.to === "SwissBorg");
  const swissUsd = swissT.reduce((a, t) => {
    const f = fundingState && fundingState[t.id];
    return a + (f && Number.isFinite(f.sentUsd) ? f.sentUsd : t.usd || 0);
  }, 0);
  const coins = plan.orders.filter((o) => o.account === "SwissBorg" && o.cryptoWait);
  const firstBuys = plan.orders.filter((o) => o.account === "SwissBorg" && !o.cryptoWait);
  const spentFirst = firstBuys.reduce((a, o) => a + (st(o.id).status === "filled" && cost(o.id) != null ? cost(o.id) : st(o.id).status === "skipped" ? 0 : o.usd || 0), 0);
  const coinPlan = coins.reduce((a, o) => a + (o.usd || 0), 0);
  const walletUsd = round2(swissUsd - spentFirst);
  const coinUsd = {};
  const use = Math.min(Math.max(0, walletUsd), coinPlan);
  let left = round2(use);
  coins.forEach((o, k) => {
    const v = k === coins.length - 1 ? left : round2(coinPlan ? (o.usd * use) / coinPlan : 0);
    coinUsd[o.id] = round2(Math.max(0, Math.min(v, left)));
    left = round2(left - coinUsd[o.id]);
  });
  return { byOrder, nextId, nextCarryUsd: nextId ? byOrder[nextId].carryUsd : 0, walletUsd, coinUsd };
}

// ---------- portfolio ----------

/** Holdings from filled orders, valued at live prices. toUsd(price, quoteCurrency, fx) converts a
 *  quote to dollars (NaN when it cannot); this core one knows US-dollar quotes only. */
export function computeHoldings(plan, orderState = {}, quotes = {}, fx = {}, toUsd = priceToUsd) {
  const rows = {};
  for (const o of plan.orders) {
    const s = orderState[o.id];
    if (!s || s.status !== "filled" || !Number.isFinite(s.qty)) continue;
    const inst = plan.instruments.find((i) => i.id === o.instrument);
    const r = rows[inst.id] || (rows[inst.id] = { id: inst.id, inst, qty: 0, costUsd: 0, fills: 0 });
    r.qty += s.qty;
    r.costUsd += Number.isFinite(s.costUsd) ? s.costUsd : 0;
    r.fills += 1;
  }
  // Rows without a usable live price (no quote, or no FX to convert it) get null values, and their
  // cost is left out of pricedCostUsd so the total P&L compares like with like.
  let totalCost = 0, totalValue = 0, pricedCost = 0;
  const missing = [];
  const out = Object.values(rows).map((r) => {
    const q = quotes[r.inst.symbol];
    const unit = q && Number.isFinite(q.price) ? toUsd(q.price, r.inst.quoteCurrency, fx || {}) : NaN;
    const valueUsd = Number.isFinite(unit) ? unit * r.qty : null;
    totalCost += r.costUsd;
    if (valueUsd != null) { totalValue += valueUsd; pricedCost += r.costUsd; } else missing.push(r.id);
    return { ...r, valueUsd: valueUsd == null ? null : round2(valueUsd), pnlUsd: valueUsd == null ? null : round2(valueUsd - r.costUsd), pnlPct: valueUsd == null || !r.costUsd ? null : ((valueUsd - r.costUsd) / r.costUsd) * 100, avgCostUsd: r.qty ? r.costUsd / r.qty : null };
  });
  return { rows: out, totalCostUsd: round2(totalCost), totalValueUsd: round2(totalValue), pricedCostUsd: round2(pricedCost), missing };
}

/** A quote in dollars: US-dollar quotes as they are, anything else NaN. */
export function priceToUsd(price, ccy, fx) {
  if (ccy === "USD") return price;
  return NaN;
}

/** Progress through the plan. */
export function progress(plan, orderState = {}) {
  let done = 0, skipped = 0, placed = 0, investedUsd = 0, plannedDoneUsd = 0;
  for (const o of plan.orders) {
    const s = orderState[o.id];
    if (!s) continue;
    if (s.status === "filled") { done++; investedUsd += Number.isFinite(s.costUsd) ? s.costUsd : 0; plannedDoneUsd += o.usd || 0; }
    if (s.status === "skipped") skipped++;
    if (s.status === "placed") placed++;
  }
  return { done, skipped, placed, total: plan.orders.length, investedUsd: round2(investedUsd), pct: (done + skipped) / plan.orders.length };
}

// ---------- trend indicators (context only) ----------

/**
 * closes: array of numbers oldest -> newest (daily). dates (optional, same length, "YYYY-MM-DD"):
 * when given, the 1/3/12-month changes and the 1-year high are measured by calendar date (a crypto
 * series trades 7 days a week, so 21 bars are only 3 weeks), and volatility is annualised with 365
 * days for a 7-day series. Without dates, trading-day counts are used (21/63/252 bars).
 */
export function indicators(closes, dates) {
  const raw = closes || [];
  const withDates = Array.isArray(dates) && dates.length === raw.length;
  const c = [], ds = [];
  raw.forEach((x, k) => { if (Number.isFinite(x)) { c.push(x); if (withDates) ds.push(dates[k]); } });
  const n = c.length;
  if (!n) return null;
  const last = c[n - 1];
  const byDate = withDates && ds.every((d) => typeof d === "string" && ISO_DATE.test(d));
  const sma = (k) => (n >= k ? c.slice(n - k).reduce((a, b) => a + b, 0) / k : null);
  const ret = (k) => (n > k ? (last / c[n - 1 - k] - 1) * 100 : null);
  const retMonths = (m) => {
    const cut = addMonthsIso(ds[n - 1], -m);
    for (let i = n - 2; i >= 0; i--) if (ds[i] <= cut) return (last / c[i] - 1) * 100;
    return null; // the series does not reach back that far
  };
  let hiFrom = Math.max(0, n - 252);
  if (byDate) { const cut = addMonthsIso(ds[n - 1], -12); hiFrom = ds.findIndex((d) => d >= cut); if (hiFrom < 0) hiFrom = n - 1; }
  const hi = Math.max(...c.slice(hiFrom));
  const sevenDay = byDate && ds.slice(-30).some((d) => [0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()));
  const rets = [];
  for (let i = Math.max(1, n - 20); i < n; i++) rets.push(Math.log(c[i] / c[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const vol = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(sevenDay ? 365 : 252) * 100 : null;
  const s50 = sma(50), s200 = sma(200);
  return {
    last,
    chg1m: byDate ? retMonths(1) : ret(21), chg3m: byDate ? retMonths(3) : ret(63), chg12m: byDate ? retMonths(12) : ret(252),
    vsSma50: s50 ? (last / s50 - 1) * 100 : null,
    vsSma200: s200 ? (last / s200 - 1) * 100 : null,
    drawdown: (last / hi - 1) * 100,
    vol20: vol,
    trend: s50 && s200 ? (last > s50 && s50 > s200 ? "up" : last < s50 && s50 < s200 ? "down" : "mixed") : s50 ? (last > s50 ? "up" : "down") : null,
  };
}

/** Crypto rule: none added after a month in which it rose more than 30%. Pass dates to measure a calendar month. */
export function cryptoRuleTriggered(closes, dates) {
  const ind = indicators(closes, dates);
  return !!(ind && ind.chg1m != null && ind.chg1m > 30);
}

// ---------- formatting ----------

export const num = (v, d) => (Number.isFinite(v) ? v : d);
export const round2 = (x) => Math.round(x * 100) / 100;
export function fmtInt(x) { return Number.isFinite(x) ? Math.round(x).toLocaleString("en-US") : "—"; }
export function fmtNum(x, dp = 2) { return Number.isFinite(x) ? x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—"; }
export function fmtUsd(x, dp = 0) { return Number.isFinite(x) ? (x < 0 ? "−$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—"; }
export function fmtThb(x, dp = 0) { return Number.isFinite(x) ? (x < 0 ? "−฿" : "฿") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—"; }
/** A dollar quote: four decimals under $1, three under $10, two above. */
export function fmtPrice(price, ccy) {
  if (!Number.isFinite(price)) return "—";
  const dp = price < 1 ? 4 : price < 10 ? 3 : 2;
  return "$" + fmtNum(price, dp);
}
export function fmtPct(x, dp = 1, signed = true) { return Number.isFinite(x) ? (signed && x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(dp) + "%" : "—"; }
