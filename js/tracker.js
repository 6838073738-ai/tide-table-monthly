// The growth tracker's inputs in the friends' app (Tide Table 2.2; docs/tt2/ADDENDUM-2026-10-27c.md D;
// docs/tt2/build/growth-api.md 3). Pure: no page, no network, no clock and no imports. It turns the friend's scaled
// plan (months.planOrNull, with the locked 10% already in it), their records (store.js) and the prices the page knows
// (prices.js) into the input of growth.js `growth()`, and lists the coin days whose price the page still asks
// CoinGecko's daily history for. views/growth.js and Today's card call it once per drawing.
//
// "On time, never sold": every order of the months the friend follows counts on its order date for its planned
// dollars (the order's own `usd`; a skip or a fill changes nothing here but the price paid). The coins the plan pays
// from the money sent to SwissBorg in November (ether and solana in January, `cryptoWait`) count only while the wallet
// holds that money: for a friend who joined after November the rest of the app gives them none (core funding and carry,
// "Nothing to buy" on Today), so they are never money put in here either (review finding M1).
// - The price paid of an order, in this order (addendum D.1): the fill the friend logged for it; else the price they
//   typed for it on Today (store `typed`, "<dateId>:<instrumentId>"); else, for a price typed before 2.2 kept only as
//   the holding's latest price, that one when it was typed on the order's own date; else, for a coin, CoinGecko's
//   price of the order date (label "day"; { missing: "history" } when its history has none); else none.
// - The price now: a coin's live CoinGecko price; a stock's or fund's latest price typed or logged, on any date, with
//   its date. growth() picks the newest dated price of these and the prices paid.
// - The coin days the page asks CoinGecko's history for are the same for every friend whose months buy a coin (every
//   coin of the plan on every order date of the plan that has come), so the dates it receives never show when a friend
//   started or which months buy coins (spec 8.9; review finding PRIV-2).

/** Where a price came from, as shown beside it (the label words of growth.js come first where there are some). */
export const SOURCES = Object.freeze({
  live: "CoinGecko",
  day: "CoinGecko's daily history",
  records: "your records",
});

/** The key of a price typed for a month's order of a holding (the same as store.js typedKey). */
export const typedKey = (dateId, instrumentId) => `${dateId}:${instrumentId}`;

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const posNum = (v) => typeof v === "number" && Number.isFinite(v) && v > 0;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v) => typeof v === "string" && ISO_DAY.test(v);

/** The Bangkok day (UTC+7) of a time given as ISO text or epoch ms; null for anything else. */
export function bkkDay(at) {
  const ms = typeof at === "number" ? at : typeof at === "string" ? Date.parse(at) : NaN;
  return Number.isFinite(ms) ? new Date(ms + 7 * 3600000).toISOString().slice(0, 10) : null;
}

/** True for a coin of the plan (it has a CoinGecko id). */
const isCoin = (i) => !!(i && typeof i.coingeckoId === "string" && i.coingeckoId);

/**
 * The price paid for one order from the friend's own records: the fill logged for it; else the price typed for it on
 * Today (store `typed`); else, unless it is a coin, a price typed before 2.2 that the holding kept as its latest price,
 * when it was typed on the order's own date. { price, date, label: "fill" | "typed" } or null. o: { id, dateId, date,
 * instrument }. The tracker's price paid starts here (a coin's day price from CoinGecko comes after it), and Today's
 * order desk shows the same price on a row whose date has passed.
 */
export function recordedPaid(state, o, { coin = false } = {}) {
  if (!isObj(o)) return null;
  const st = isObj(state) ? state : {};
  const rec = isObj(st.orders) ? st.orders[o.id] : null;
  if (isObj(rec) && rec.status === "filled" && posNum(rec.price)) return { price: rec.price, date: isDay(rec.filledAt) ? rec.filledAt : o.date, label: "fill" };
  const t = isObj(st.typed) ? st.typed[typedKey(o.dateId, o.instrument)] : null;
  if (isObj(t) && posNum(t.price)) return { price: t.price, date: bkkDay(t.at) || o.date, label: "typed" };
  if (coin) return null;
  // A price typed before 2.2 is kept only as the holding's latest price: it is this order's when it was typed on the
  // order's own date (the desk opens on that date's orders).
  const p = isObj(st.prices) ? st.prices[o.instrument] : null;
  if (isObj(p) && p.src !== "fill" && posNum(p.price) && bkkDay(p.at) === o.date) return { price: p.price, date: o.date, label: "typed" };
  return null;
}

/**
 * A price typed on Today's order desk, put into a draft of the friend's records (store.update's): price a number above
 * 0, or null when the field was cleared. order: the desk row's { dateId, date }; today: the app's Bangkok day; at: when
 * it was typed (the browser's clock, for the holding's latest price); typedAt: the same moment by the app's clock (the
 * order's own date when ?now= moves it).
 * - A row of today or later: the holding's latest price (it sizes the orders and is the price now), and on the order's
 *   own date also that order's price paid. Clearing removes both.
 * - A row whose order date has passed: that order's price paid, dated by the order date (16:00 Bangkok, as the fill
 *   dialog dates a fill logged for a past day), and the holding's latest price only while no newer one is kept, so an
 *   old price never becomes the price now (review finding M2). Clearing removes that order's price, and a latest price
 *   typed that same day, which would still count for it (recordedPaid).
 */
export function deskPrice(d, { order, instrument, price = null, today, at = null, typedAt = at } = {}) {
  if (!isObj(d) || !isObj(order) || typeof instrument !== "string" || !isDay(order.date) || !isDay(today)) return;
  if (!isObj(d.prices)) d.prices = {};
  if (!isObj(d.typed)) d.typed = {};
  const key = typedKey(order.dateId, instrument);
  const past = order.date < today;
  const due = order.date <= today;
  const cur = d.prices[instrument];
  if (price == null) {
    if (!past) { delete d.prices[instrument]; if (due) delete d.typed[key]; return; }
    delete d.typed[key];
    if (isObj(cur) && cur.src !== "fill" && bkkDay(cur.at) === order.date) delete d.prices[instrument];
    return;
  }
  if (!posNum(price)) return;
  if (past) {
    const paidAt = `${order.date}T16:00:00+07:00`;
    d.typed[key] = { price, at: paidAt };
    if (!isObj(cur) || !(Date.parse(cur.at) > Date.parse(paidAt))) d.prices[instrument] = { price, at: paidAt, src: "entry" };
    return;
  }
  d.prices[instrument] = { price, at, src: "entry" };
  if (due) d.typed[key] = { price, at: typedAt };
}

/**
 * The input of growth() for the friend's plan, and what the page still has to ask for.
 * - plan: the scaled plan (app.plan): orderDates [{id, date}], orders [{id, dateId, instrument, usd}], instruments.
 * - state: the friend's state (store.get()): orders (fills), typed, prices.
 * - live: the live coin prices by instrument id ({ price, at } as prices.data.crypto holds them; at in epoch ms).
 * - history: (coingeckoId, date) -> { price } | { missing: "history" } | null (prices.historyPrice).
 * - fx: { rate, date, source } (core fxInfo; its source words are the host's), or null.
 * - today: the Bangkok day (YYYY-MM-DD). joinedDateIds: the order date ids the friend follows (all when null).
 * Returns { input, start, asks: [{ coin, date }], allBefore }: allBefore is true when the friend follows none of
 * the plan's order dates (they started after its last one); growth() then has no order to count.
 */
export function trackerInput({ plan, state, live = {}, history = () => null, fx = null, today, joinedDateIds = null } = {}) {
  const dates = Array.isArray(plan && plan.orderDates) ? plan.orderDates : [];
  const dateOf = new Map(dates.map((d) => [d.id, d.date]));
  const insts = new Map((Array.isArray(plan && plan.instruments) ? plan.instruments : []).map((i) => [i.id, i]));
  const joined = Array.isArray(joinedDateIds) ? new Set(joinedDateIds) : null;
  const followed = dates.filter((d) => !joined || joined.has(d.id)).map((d) => d.date).filter(isDay).sort();
  const allBefore = dates.length > 0 && followed.length === 0;
  // The first followed order date; with none followed, a day after every order, so nothing counts.
  const start = followed[0] || (allBefore ? "9999-12-31" : null);
  const st = isObj(state) ? state : {};
  const latest = isObj(st.prices) ? st.prices : {};
  const coinLive = isObj(live) ? live : {};
  const planOrders = (Array.isArray(plan && plan.orders) ? plan.orders : []).filter(isObj);

  // The coins marked cryptoWait are paid from what the SwissBorg transfers of the months the friend follows leave after
  // those months' other coin buys (the wallet of logic-core computeMonthlyCarry, here with no records: "on time"). When
  // that is nothing, nothing pays them, so they are left out. An own mix's later transfers change nothing: each pays its
  // own month's coins, and leaves the wallet as it was.
  const transfers = plan && plan.funding && Array.isArray(plan.funding.transfers) ? plan.funding.transfers : [];
  const follows = (dateId) => !joined || joined.has(dateId);
  const centsOf = (usd) => Math.round((Number(usd) || 0) * 100);
  const sentSwiss = transfers.filter((t) => isObj(t) && t.to === "SwissBorg" && follows(t.forDate)).reduce((a, t) => a + centsOf(t.usd), 0);
  const spentSwiss = planOrders.filter((o) => o.account === "SwissBorg" && !o.cryptoWait && follows(o.dateId)).reduce((a, o) => a + centsOf(o.usd), 0);
  const walletPays = sentSwiss > spentSwiss;
  const orders = planOrders.filter((o) => !o.cryptoWait || walletPays).map((o) => ({
    id: o.id, date: dateOf.get(o.dateId) || null, instrument: o.instrument, amount: o.usd, currency: "USD", dateId: o.dateId,
  }));

  /** The price paid for one order (addendum D.1's order of preference). */
  function buyPrice(id, o) {
    if (!o) return null;
    const inst = insts.get(o.instrument);
    const coin = isCoin(inst);
    const own = recordedPaid(st, o, { coin });
    if (own) return { price: own.price, date: own.date, source: SOURCES.records, label: own.label, currency: "USD" };
    if (coin) {
      const hp = typeof history === "function" ? history(inst.coingeckoId, o.date) : null;
      if (isObj(hp) && posNum(hp.price)) return { price: hp.price, date: o.date, source: SOURCES.day, label: "day", currency: "USD" };
      if (isObj(hp) && hp.missing) return { missing: "history" };
    }
    return null;
  }

  /** The price now of one instrument: live for a coin, the latest typed or logged for a stock or fund. */
  function latestPrice(id, inst) {
    const i = inst || insts.get(id);
    if (isCoin(i)) {
      const q = coinLive[id];
      if (isObj(q) && posNum(q.price) && Number.isFinite(q.at)) return { price: q.price, date: bkkDay(q.at), source: SOURCES.live, label: null, currency: "USD" };
      return null;
    }
    const p = latest[id];
    if (isObj(p) && posNum(p.price) && bkkDay(p.at)) {
      return { price: p.price, date: bkkDay(p.at), source: SOURCES.records, label: p.src === "fill" ? "fill" : "typed", currency: "USD" };
    }
    return null;
  }

  // The coin days to ask CoinGecko's history for: every coin of the plan on every order date of the plan that has
  // come, for every friend whose months buy a coin (by the rule of prices.js coinMap, the live price's: some coin order
  // in a month they follow, the unfunded ones included), and none for a friend whose months buy none. The plan's order
  // dates are every friend's, so the dates asked for never say when this friend started, which months buy coins or
  // how much (spec 8.9); at most 3 coins on 12 dates.
  const coinIds = [...new Set([...insts.values()].filter(isCoin).map((i) => i.coingeckoId))].sort();
  const buysCoin = planOrders.some((o) => isCoin(insts.get(o.instrument)) && follows(o.dateId));
  const coinDays = buysCoin && isDay(today) ? [...new Set(dates.map((d) => d.date).filter((d) => isDay(d) && d <= today))].sort() : [];
  const asks = [];
  for (const date of coinDays) for (const coin of coinIds) asks.push({ coin, date });

  const fxIn = isObj(fx) && posNum(fx.rate) ? { thbPerUsd: fx.rate, date: isDay(fx.date) ? fx.date : null, source: fx.source || null } : null;
  return {
    input: { orders, instruments: plan && plan.instruments, buyPrice, latestPrice, fx: fxIn, base: "USD", today, start },
    start, asks, allBefore,
  };
}

/** The unpriced orders whose price the friend can type on Today (stocks and funds; a coin's comes from CoinGecko). */
export function typeableUnpriced(result, plan) {
  const insts = new Map((Array.isArray(plan && plan.instruments) ? plan.instruments : []).map((i) => [i.id, i]));
  return ((result && result.unpriced) || []).filter((u) => !isCoin(insts.get(u.instrument)) && u.reason !== "no_rate");
}

/** The unpriced coin orders still waiting for CoinGecko's price of their day (asked, not answered yet). */
export function coinsWaiting(result, plan) {
  const insts = new Map((Array.isArray(plan && plan.instruments) ? plan.instruments : []).map((i) => [i.id, i]));
  return ((result && result.unpriced) || []).filter((u) => isCoin(insts.get(u.instrument)) && u.reason === "no_price");
}
