// Ticker and full name (Tide Table 2.1; docs/tt2/ADDENDUM-2026-10-27b.md section C): every place a holding or a
// company is named shows "<TICKER> · <Full name>", for example "NVDA · NVIDIA Corporation" or "VWRA · Vanguard
// FTSE All-World UCITS ETF, accumulating", with the ticker a friend sees in their broker (no exchange suffix of a
// quote service: VWRA, not VWRA.L) and coins by their symbol ("BTC · Bitcoin"). With no ticker (a listing that is
// not trading yet, a company whose data has none) only the name is shown. A name is never made up and never
// re-cased: it is shown as its source writes it. Screen readers get "<Full name>, ticker <TICKER>".
//
// Pure ES module, no DOM and no imports, shared by both apps (the friends' build copies it like the other shared
// modules). The host draws the text; a long name wraps and the ticker is never cut (the host keeps it in one span).

/** The separator between ticker and name. */
export const SEP = " · ";

/** Exchange suffixes of quote-service symbols ("7203.T", "VWRA.L"), stripped from the ticker that is shown. Kept
 *  without their dot here and joined into the pattern below. */
const SUFFIXES = Object.freeze([
  "L", "IL", "T", "HK", "BK", "SI", "KS", "KQ", "SS", "SZ", "TW", "TWO", "NS", "BO", "JK", "KL", "AX", "NZ",
  "TO", "V", "NE", "CN", "DE", "F", "BE", "DU", "HM", "MU", "SG", "PA", "AS", "BR", "LS", "MI", "MC", "SW",
  "VI", "ST", "OL", "CO", "HE", "IC", "IR", "WA", "PR", "BD", "AT", "IS", "TA", "JO", "SA", "MX", "BA", "SN",
]);
const SUFFIX_RE = new RegExp(`\\.(?:${SUFFIXES.join("|")})$`);
/** A coin's quote-currency tail ("BTC-USD"). */
const COIN_TAIL = /-(?:USD|USDT|USDC|EUR|GBP|THB)$/;
/** An id of Tide Table's own (s + CIK, j + JPX code, l + LEI, y + a personal id): never a ticker. */
const OWN_ID = /^[sjly][0-9A-Za-z]{1,40}$/;

const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** True for a coin: kind "coin", or an instrument of the crypto group or venue. */
function isCoin(x) {
  return !!x && (x.kind === "coin" || x.group === "crypto" || x.venue === "CRYPTO");
}

/**
 * The ticker to show for a symbol: without an exchange suffix ("VWRA.L" -> "VWRA"), a coin without its quote
 * currency ("BTC-USD" -> "BTC"), never one of Tide Table's own ids, never re-cased. Null when there is none.
 */
export function showTicker(symbol, { coin = false } = {}) {
  const s = text(symbol);
  if (!s || OWN_ID.test(s)) return null;
  let t = s.replace(SUFFIX_RE, "");
  if (coin) t = t.replace(COIN_TAIL, "");
  return t || null;
}

/** The ticker of an instrument, a data row or an upcoming entry: its `ticker`, else its `symbol`, else its id when
 *  that is a plan ticker (VWRA), as showTicker shows it; null when it has none. */
export function tickerOf(x) {
  if (!x || typeof x !== "object") return null;
  const coin = isCoin(x);
  for (const v of [x.ticker, x.symbol, x.id]) {
    const t = showTicker(v, { coin });
    if (t) return t;
  }
  return null;
}

/** The full name of an instrument, a data row or an upcoming entry: its `longName`, else its `name`, as written;
 *  null when it has none. */
export function fullNameOf(x) {
  if (!x || typeof x !== "object") return null;
  return text(x.longName) || text(x.name) || null;
}

/**
 * How to name a holding or a company: { text, sr, ticker, name }.
 * - text: "<TICKER> · <Full name>", or the name alone with no ticker, or the ticker alone with no name;
 * - sr: "<Full name>, ticker <TICKER>" for screen readers (the name alone, or "ticker <TICKER>", likewise);
 * - ticker, name: the two parts (null when missing), for a host that draws them in two spans.
 * x: { ticker, name, longName, symbol, kind } (kind "coin" for a coin; an instrument's group "crypto" or venue
 * "CRYPTO" says the same), or any instrument, data row or upcoming entry with those keys.
 */
export function tickerName(x) {
  const ticker = tickerOf(x);
  const name = fullNameOf(x);
  if (ticker && name) return { text: `${ticker}${SEP}${name}`, sr: `${name}, ticker ${ticker}`, ticker, name };
  if (name) return { text: name, sr: name, ticker: null, name };
  if (ticker) return { text: ticker, sr: `ticker ${ticker}`, ticker, name: null };
  return { text: "", sr: "", ticker: null, name: null };
}
