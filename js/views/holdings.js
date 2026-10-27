// Holdings: what the friend owns from the fills they logged, valued where a price is known (coins
// live, stocks and funds at the last price they typed or filled, each labelled), the split between
// index funds and growth against its targets (the plan's 85.2 / 14.8, or those of the friend's own mix),
// the year's allocation (the plan's mix, or the friend's), the VWRA carry month by month, and the fill
// log with a CSV export.
//
// With field months the year is the friend's own: the mix shows their fields' money as its own group ("Your
// fields"), and the example plan's targets are not shown. Their split is restated in their own words, with no
// target and nothing to steer toward (spec 12.1 rule 6).

import {
  app, h, ui, L, S, toast, ost, instById, schedule, carry, priceInfo, priceSource, quotesForHoldings,
  fM, fUsd, fPct, fNum, fPrice, short, fmtQty, plural, statusPill, pill,
  card, cardHead, viewHead, empty, chipGroup, downloadFile, today, hooks, progressNow, joinedBudgetUsd, isPreOrder, isPreTransfer,
  mixIsOwn, resolvedMonths, amountWords, tickerOf, isFieldInst, fieldMonthsOn, fieldsSpecNow,
} from "../core.js?v=2.0.0";
import { openFillDialog, undoOrder } from "./today.js?v=2.0.0";
import { notBought, notBoughtMonth } from "./mix.js?v=2.0.0";
import { splitLine } from "./split.js?v=2.0.0";

const GROUP_TOKEN = { index: "--series-1", growth: "--series-7", crypto: "--series-5", fields: "--series-4" };
const GROUP_ORDER = ["index", "growth", "crypto", "fields"];

function tok(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888888"; }
function withAlpha(color, a) {
  const c = String(color).trim();
  if (c.startsWith("#")) {
    let x = c.slice(1);
    if (x.length === 3) x = [...x].map((ch) => ch + ch).join("");
    const n = parseInt(x.slice(0, 6), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) { const p = m[1].split(",").map((s) => s.trim()); return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a})`; }
  return c;
}
const groupLabel = (id) => (app.plan.groups.find((g) => g.id === id) || {}).label || id;

export function renderHoldings() {
  const plan = app.plan, st = S();
  const hold = L.computeHoldings(plan, st.orders, quotesForHoldings(), {});
  const hasFills = hold.rows.length > 0;
  const pr = progressNow();
  const out = [viewHead("holdings", "What you own", "Holdings",
    "Built from the fills you logged. Coins are valued at live CoinGecko prices; stocks and funds at the last price you typed or filled, and each row says which. Values are information only: the plan's dates never change with them.")];

  // ---- summary + holdings table
  const pnl = L.round2(hold.totalValueUsd - hold.pricedCostUsd);
  out.push(card(".hold-card", { "aria-labelledby": "hold-h" },
    cardHead(h("span#hold-h", "Your positions"), hasFills ? `${plural(hold.rows.length, "instrument")} from ${plural(pr.done, "filled order")}` : null),
    hasFills ? h("div.pv-stats.hold-stats",
      h("div.pv-stat", h("span.stat-label", "Invested"), h("span.pv-big.num-display", fUsd(hold.totalCostUsd, 2)), h("span.stat-sub", `of ${fM(joinedBudgetUsd())} planned`)),
      h("div.pv-stat", h("span.stat-label", "Value where priced"), h("span.pv-big.num-display", hold.pricedCostUsd ? fUsd(hold.totalValueUsd, 2) : "—"), h("span.stat-sub", hold.missing.length ? `${plural(hold.missing.length, "position")} without a price` : "every position priced")),
      h("div.pv-stat", h("span.stat-label", "Change vs cost"), h(`span.pv-big.num-display${pnl > 0 ? ".is-pos" : pnl < 0 ? ".is-neg" : ""}`, hold.pricedCostUsd ? `${pnl > 0 ? "+" : ""}${fUsd(pnl, 2)}` : "—"), h("span.stat-sub", hold.pricedCostUsd ? fPct((pnl / hold.pricedCostUsd) * 100, 1) + " on the priced positions" : "no prices yet"))) : null,
    hasFills ? h("div.table-wrap", h("table.data-table.hold-table",
      h("thead", h("tr", ["Instrument", "Quantity", "Avg cost", "Cost", "Price", "Value", "Change"].map((t, k) => h(`th${k ? ".r" : ""}`, { scope: "col" }, t)))),
      h("tbody", hold.rows.map((r) => {
        const pi = priceInfo(r.inst);
        return h("tr",
          h("th", { scope: "row" }, h("span.hold-name", r.inst.name), h("span.ticker.num", tickerOf(r.inst))),
          h("td.num.r", { "data-label": "Quantity" }, fmtQty(r.inst, r.qty)),
          h("td.num.r", { "data-label": "Avg cost" }, r.avgCostUsd != null ? fUsd(r.avgCostUsd, r.avgCostUsd < 10 ? 4 : 2) : "—"),
          h("td.num.r", { "data-label": "Cost" }, fUsd(r.costUsd, 2)),
          h("td.num.r", { "data-label": "Price" }, pi.price != null ? fPrice(pi.price, r.inst.quoteCurrency) : "—", h("span.sub.price-src", priceSource(pi))),
          h("td.num.r", { "data-label": "Value" }, r.valueUsd != null ? fUsd(r.valueUsd, 2) : "—"),
          h(`td.num.r${r.pnlUsd > 0 ? ".is-pos" : r.pnlUsd < 0 ? ".is-neg" : ""}`, { "data-label": "Change" }, r.pnlUsd != null ? `${r.pnlUsd > 0 ? "+" : ""}${fUsd(r.pnlUsd, 2)}` : "—", r.pnlPct != null ? h("span.sub", fPct(r.pnlPct, 1)) : null));
      })),
      hold.missing.length ? h("tfoot", h("tr.hold-missing", h("td", { colspan: 7 }, h("span.muted.small", `No price yet for ${hold.missing.map((id) => instById(id).name).join(", ")}: left out of the value. ${hold.missing.some((id) => !instById(id).coingeckoId) ? "Type a stock or fund's price on the order desk to include it." : "Coins are included once the live price arrives."}`)))) : null))
      : empty("Nothing here yet", "Log a fill on the order desk (Today) and it appears here.", "portfolio")));

  out.push(splitPanel(hold));
  out.push(allocCard(hold, hasFills));
  out.push(carryPanel());
  out.push(fillLog());
  return out;
}

/** Index funds vs growth against the targets (shares of the stock money), the twice-yearly check. The targets
 *  are the plan's, or, with the friend's own mix, worked out from it (app.plan.groups). */
function splitPanel(hold) {
  const plan = app.plan;
  if (fieldMonthsOn()) return fieldSplitPanel();
  const own = mixIsOwn();
  const groups = plan.groups.filter((g) => g.rebalanceTargetPct != null);
  const actual = Object.fromEntries(groups.map((g) => [g.id, hold.rows.filter((r) => r.inst.group === g.id).reduce((a, r) => a + (Number.isFinite(r.valueUsd) ? r.valueUsd : 0), 0)]));
  const total = groups.reduce((a, g) => a + actual[g.id], 0);
  const maint = plan.maintenance.find((m) => /Rebalancing/i.test(m.what));
  const first = maint ? maint.when.split(",")[0] : "1 Dec 2027";
  // During year one the blocks are off target by design (the plan's own note), so nothing is flagged yet.
  const preview = today() <= plan.orderDates[plan.orderDates.length - 1].date;
  if (!groups.length) {
    // A mix with no fund or stock money at all (only coins): there is no split to check.
    return card(".rebal-card", { "aria-labelledby": "rebal-h" },
      cardHead(h("span#rebal-h", "Index funds and growth"), "Your targets, from your mix, as shares of the stock and fund money."),
      h("p.muted.small", "Your mix puts no money into funds or stocks, so there is no split to check."));
  }
  return card(".rebal-card", { "aria-labelledby": "rebal-h" },
    cardHead(h("span#rebal-h", "Index funds and growth"), own
      ? `Your targets, from your mix, as shares of the stock and fund money. The first check is ${first}; until then this is only a preview.`
      : `The plan's targets, as shares of the stock and fund money. Its first check is ${first}; until then this is only a preview, and year one is off target by design.`),
    total ? null : h("p.muted.small", own
      ? `No priced stock or fund fills yet: the bars show your targets for the ${fM(plan.meta.stockMoneyUsd)} stock and fund money.`
      : `No priced stock or fund fills yet: the bars show the plan's own split of the ${fM(plan.meta.stockMoneyUsd)} stock and fund money.`),
    h("ul.rebal-list", groups.map((g) => {
      const a = total ? (actual[g.id] / total) * 100 : g.rebalanceTargetPct;
      const diff = a - g.rebalanceTargetPct;
      const off = total && !preview && Math.abs(diff) > 5;
      return h(`li.rebal-row${off ? ".is-off" : ""}`,
        h("p.rebal-name", g.label),
        h("div.rebal-bar", { role: "img", "aria-label": `${g.label}: ${total ? fNum(a, 1) + "% now" : "the plan's split"}, target ${fNum(g.rebalanceTargetPct, 1)}%` },
          h("span.rebal-fill", { style: { width: Math.min(100, a).toFixed(1) + "%" } }),
          h("span.rebal-target", { style: { left: g.rebalanceTargetPct.toFixed(1) + "%" } })),
        h("p.rebal-val.num", total ? `${fNum(a, 1)}%` : "—", h("span.sub", ` target ${fNum(g.rebalanceTargetPct, 1)}%`)),
        off ? pill(`${fNum(Math.abs(diff), 1)} points off`, "amber", "!") : total ? pill(`${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${fNum(Math.abs(diff), 1)} points`, "neutral", "≈") : null);
    })),
    maint ? h("p.fine", maint.detail) : null);
}

/** With field months: the friend's own split in their words and where to change it; no target and nothing to
 *  steer toward (spec 12.1 rule 6). */
function fieldSplitPanel() {
  const words = splitLine(fieldsSpecNow());
  return card(".rebal-card.ttm-own-split", { "aria-labelledby": "rebal-h", "data-fk": "own-split" },
    cardHead(h("span#rebal-h", "Your split"), "How much of each month goes to your fields is your own choice."),
    words ? h("p", { "data-fk": "own-split-words" }, words) : null,
    h("p", "It is yours to keep or change on ",
      h("a", { href: "#/split", "data-fk": "own-split-link" }, "My split"), ". Months with records keep the split they had."));
}

function allocItems(mode, hold) {
  const plan = app.plan;
  const val = (id) => { const r = hold.rows.find((x) => x.id === id); return r && Number.isFinite(r.valueUsd) ? r.valueUsd : 0; };
  if (mode === "instrument") {
    const seen = {};
    // With field months, an example-plan holding with no order and nothing owned is not part of the friend's
    // year: it is left out rather than listed as "not bought".
    const theirs = fieldMonthsOn() ? (i) => isFieldInst(i) || i.targetUsd > 0 || val(i.id) > 0 : () => true;
    return plan.instruments.filter(theirs).map((i) => {
      const n = (seen[i.group] = (seen[i.group] || 0) + 1);
      return { id: i.id, label: i.name, target: i.targetUsd, actual: val(i.id), color: withAlpha(tok(GROUP_TOKEN[i.group] || "--series-3"), Math.max(0.38, 1 - (n - 1) * 0.17)) };
    });
  }
  return GROUP_ORDER.map((k) => {
    const insts = plan.instruments.filter((i) => i.group === k);
    return { id: k, label: groupLabel(k), target: insts.reduce((a, i) => a + i.targetUsd, 0), actual: insts.reduce((a, i) => a + val(i.id), 0), color: tok(GROUP_TOKEN[k]) };
  }).filter((x) => x.target > 0 || x.actual > 0);
}

function allocCard(hold, hasFills) {
  const plan = app.plan;
  const mode = app.ui.allocMode;
  const items = allocItems(mode, hold);
  const totT = items.reduce((a, x) => a + x.target, 0) || 1;
  const totA = items.reduce((a, x) => a + x.actual, 0);
  const segs = items.filter((x) => x.target > 0).map((x) => ({ key: x.id, label: x.label, value: x.target, color: x.color }));
  // The friend's own mix or fields in some month they count (the standing mix, or one a month keeps): the year
  // is theirs.
  const ownMix = mixIsOwn() || resolvedMonths().some((r) => !r.preJoin && r.mode === "own");
  const own = ownMix || fieldMonthsOn();
  const dn = ui.donut(segs, { size: 236, thickness: 26, label: `${own ? "Your" : "The plan's"} allocation by ${mode}`, center: [fM(plan.meta.investUsd), "planned"] });
  const amounts = / to /.test(amountWords()) ? "your amounts" : "your amount";
  const year = own ? "Your year at your amounts" : `The plan's year at ${amounts}`;
  /** Why an instrument has no order, or is left out from some month on (instrument rows only). */
  const note = (x) => {
    const why = mode === "instrument" ? notBought(x.id) : null;
    if (!why) return null;
    if (!x.target) {
      switch (why.kind) {
        case "mix": return "Not in your mix · its share is in VWRA";
        case "fields": return "Not in your fields";
        case "waiting": return "Not trading yet · its part goes to your other companies or VWRA";
        default: return "Not bought at your amount · its share is in VWRA";
      }
    }
    if (why.kind === "mix-from") return `Not in your mix from ${notBoughtMonth(why)}`;
    return why.kind === "fields-from" ? `Not in your fields from ${notBoughtMonth(why)}` : null;
  };
  return card(".alloc-card", { "aria-labelledby": "alloc-h" },
    cardHead([h("span#alloc-h", own ? "Your mix" : "The plan's mix"), ownMix ? [" ", pill("Your own mix", "sky", "✓")] : null],
      hasFills ? `${year}, next to what your positions are worth where priced.` : `${year}. What you own appears after your first logged fill.`,
      h("div.alloc-tools", chipGroup("Group the mix by", [["group", "Group"], ["instrument", "Instrument"]], mode, (v) => { app.ui.allocMode = v; hooks.renderView("holdings"); }, "am"))),
    h("div.alloc-body",
      h("div.donut-wrap", dn.el),
      h("div.table-wrap", h("table.data-table.alloc-table",
        h("caption.visually-hidden", own ? "Your allocation and your positions" : "The plan's allocation and your positions"),
        h("thead", h("tr", h("th", { scope: "col" }, mode === "instrument" ? "Instrument" : "Group"), h("th.r", { scope: "col" }, own ? "Your plan" : "Plan"), h("th.r", { scope: "col" }, "You own"), h("th", { scope: "col" }, h("span.visually-hidden", "Comparison")))),
        h("tbody", items.map((x) => {
          const tp = (x.target / totT) * 100, ap = totA ? (x.actual / totA) * 100 : null;
          const why = note(x);
          return h("tr",
            h("th", { scope: "row" }, h("span.swatch", { style: { background: x.color }, "aria-hidden": "true" }), x.label, why ? h("span.sub", why) : null),
            h("td.num.r", h("span", fPct(tp, 1, false)), h("span.sub", fM(x.target))),
            h("td.num.r", ap == null ? h("span.muted", "—") : [h("span", fPct(ap, 1, false)), h("span.sub", fUsd(x.actual, 2))]),
            h("td.cmp-cell", h("div.cmp", { "aria-hidden": "true" }, h("span.cmp-t", { style: { width: Math.min(100, tp * (mode === "instrument" ? 1.4 : 1)).toFixed(1) + "%" } }), ap != null ? h("span.cmp-a", { style: { width: Math.min(100, ap * (mode === "instrument" ? 1.4 : 1)).toFixed(1) + "%", background: x.color } }) : null)));
        }))))));
}

/** Every VWRA order buys its plan amount plus what earlier orders and transfers left over. */
function carryPanel() {
  const plan = app.plan, st = S();
  const cr = carry();
  const dr = (id) => (plan.differenceRules.find((r) => r.id === id) || {}).text;
  // VWRA orders from before the friend joined are not theirs: they carry nothing and buy nothing.
  const targets = schedule().orders.filter((o) => o.carryTarget && !isPreOrder(o.id)).sort((a, b) => a.at - b.at);
  const next = targets.find((o) => o.id === cr.nextId) || null;
  const nc = next ? cr.byOrder[next.id] : null;
  const fs = st.funding || {};
  const logged = plan.funding.transfers.filter((t) => t.to === "IBKR" && fs[t.id] && Number.isFinite(fs[t.id].sentUsd));
  const sentDiff = L.round2(logged.reduce((a, t) => a + fs[t.id].sentUsd - t.usd, 0));
  const signed = (x, dp = 2) => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${fUsd(Math.abs(x), dp)}`;
  const row = (label, value, text) => h("li.carry-row", h("div.carry-label", h("p.carry-name", label), text ? h("p.carry-rule", text) : null), h("p.carry-val.num", value));
  const coins = plan.orders.filter((o) => o.cryptoWait && !isPreOrder(o.id));
  const swissPre = plan.funding.transfers.some((t) => t.to === "SwissBorg" && isPreTransfer(t.id));
  return card(".carry-card", { "aria-labelledby": "carry-h" },
    cardHead(h("span#carry-h", "VWRA, month by month"), "VWRA is the plan's world index fund. Each VWRA order also buys what earlier orders and transfers left over; this is worked out from your fills and the transfers you recorded."),
    h("div.carry-grid",
      h("ul.carry-list",
        row("Money sent vs plan", logged.length ? signed(sentDiff) : "$0", `${dr("monthly-diff")} ${logged.length ? `${plural(logged.length, "transfer")} recorded.` : "No amounts recorded yet."}`),
        row("Carried into the next VWRA order", nc ? signed(nc.carryUsd) : "—", dr("leftover")),
        dr("swissborg") && coins.length ? row("SwissBorg wallet after bitcoin", fUsd(Math.max(0, cr.walletUsd), 2), swissPre
          ? `The money for the coins went to SwissBorg in November, before you joined, so the wallet holds nothing for ${coins.map((o) => instById(o.instrument).name.toLowerCase()).join(" and ")}.`
          : `${dr("swissborg")} Now: ${coins.map((o) => `${instById(o.instrument).name.toLowerCase()} ${fUsd(cr.coinUsd[o.id], 2)}`).join(", ")}.`) : null),
      h("div.carry-results",
        h("div.carry-result.is-moon",
          h("p.eyebrow", next ? `${short(next.date)} · next VWRA order` : "VWRA orders"),
          h("p.carry-big", next ? h("span.num-display", fUsd(nc.usd, 2)) : "All bought"),
          next ? h("p.muted.small", `Plan ${fM(next.usd)} ${nc.carryUsd < 0 ? "−" : "+"} ${fUsd(Math.abs(nc.carryUsd), 2)} carried${nc.shortUsd ? `; ${fUsd(nc.shortUsd, 2)} short, so the other orders wait (rule r10)` : ""}`) : null))),
    h("div.table-wrap", h("table.data-table.is-compact.vwra-months",
      h("caption.visually-hidden", "VWRA orders, month by month"),
      h("thead", h("tr", ["Date", "Plan", "Carried", "Buy", "Status"].map((t, k) => h(`th${k && k < 4 ? ".r" : ""}`, { scope: "col" }, t)))),
      h("tbody", targets.map((o) => {
        const c = cr.byOrder[o.id] || { planUsd: o.usd, carryUsd: 0, usd: o.usd };
        const s = ost(o.id);
        return h(`tr${o.id === cr.nextId ? ".is-next" : ""}`,
          h("td.num", { "data-label": "Date" }, short(o.date)),
          h("td.num.r", { "data-label": "Plan" }, fM(o.usd)),
          h("td.num.r", { "data-label": "Carried" }, s.status === "filled" || s.status === "skipped" ? h("span.muted", "—") : c.carryUsd ? signed(c.carryUsd) : "$0"),
          h("td.num.r", { "data-label": "Buy" }, s.status === "filled" ? h("span", fUsd(s.costUsd, 2), h("span.sub", " bought")) : s.status === "skipped" ? h("span.muted", "skipped") : fUsd(c.usd, 2)),
          h("td", { "data-label": "Status" }, statusPill(s.status || "pending")));
      })))));
}

function fillLog() {
  const plan = app.plan;
  const sch = schedule();
  const fills = plan.orders.filter((o) => ost(o.id).status === "filled").map((o) => ({ o, s: ost(o.id), i: instById(o.instrument) }))
    .sort((a, b) => ((a.s.filledAt || "") < (b.s.filledAt || "") ? -1 : (a.s.filledAt || "") > (b.s.filledAt || "") ? 1 : a.o.id < b.o.id ? -1 : 1));
  return card(".log-card", { "aria-labelledby": "log-h" },
    cardHead(h("span#log-h", "Fill log"), "Date, quantity, price and fees for every fill, as the plan asks you to keep them.",
      h("button.btn.btn-small", { type: "button", "data-fk": "csv", disabled: !fills.length, on: { click: exportCsv } }, "Export CSV")),
    fills.length ? h("div.table-wrap", h("table.data-table.log-table",
      h("thead", h("tr", ["Date", "Order", "Instrument", "Qty", "Price", "Fees", "Cost (US$)", ""].map((t, k) => h(`th${k >= 3 && k <= 6 ? ".r" : ""}`, { scope: "col" }, t || h("span.visually-hidden", "Actions"))))),
      h("tbody", fills.map(({ o, s, i }) => {
        const so = sch.orders.find((x) => x.id === o.id);
        return h("tr",
          h("td.num", { "data-label": "Date" }, s.filledAt ? short(s.filledAt) : "—"),
          h("td", { "data-label": "Order" }, h("span.num", o.id), h("span.sub", `plan ${short(so.date)}`)),
          h("td", { "data-label": "Instrument" }, i.name),
          h("td.num.r", { "data-label": "Qty" }, fmtQty(i, s.qty)),
          h("td.num.r", { "data-label": "Price" }, fPrice(s.price, i.quoteCurrency)),
          h("td.num.r", { "data-label": "Fees" }, Number.isFinite(s.fees) ? fNum(s.fees, 2) : "—"),
          h("td.num.r", { "data-label": "Cost (US$)" }, fUsd(s.costUsd, 2)),
          h("td.r", h("div.row-actions",
            h("button.btn.btn-small.btn-ghost", { type: "button", "data-fk": "log-edit-" + o.id, on: { click: () => openFillDialog(so) } }, "Edit"),
            h("button.btn.btn-small.btn-ghost.is-danger", { type: "button", "data-fk": "log-del-" + o.id, on: { click: () => undoOrder(so) } }, "Delete"))));
      })))) : empty("No fills logged", "Fills you log on the order desk are listed here and can be downloaded as a CSV file.", "rules"));
}

function exportCsv() {
  const plan = app.plan;
  const sch = schedule();
  // Text cells starting with = + - @ (or a tab/CR) would run as a formula in a spreadsheet: prefix them
  // with an apostrophe. Numbers are written as numbers, so a negative amount is not altered.
  const q = (v) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["date", "order", "plan_date", "instrument", "symbol", "account", "qty", "price", "price_currency", "fees", "cost_usd", "note"]];
  for (const o of plan.orders) {
    const s = ost(o.id);
    if (s.status !== "filled") continue;
    const i = instById(o.instrument);
    const so = sch.orders.find((x) => x.id === o.id);
    rows.push([s.filledAt, o.id, so.date, i.id, i.symbol, o.account, s.qty, s.price, i.quoteCurrency, s.fees, s.costUsd, s.note || ""]);
  }
  downloadFile(`tide-table-monthly-fills-${today()}.csv`, rows.map((r) => r.map(q).join(",")).join("\n") + "\n", "text/csv");
  toast(`Downloaded ${plural(rows.length - 1, "fill")} as CSV`, "success");
}
