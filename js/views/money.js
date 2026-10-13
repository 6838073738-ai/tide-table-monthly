// Money: the thirteen transfers (S01 to SwissBorg, W01–W12 to Interactive Brokers), when to send each
// and by when it must arrive, and what the friend actually sent. A different amount sent to Interactive
// Brokers changes only that month's VWRA order (rule r10); one sent to SwissBorg changes ether and
// solana (the plan's SwissBorg rule).

import {
  app, h, icon, toast, S, L, today, isDone, funding, carry, fxInfo, prices, settings, dateOfId,
  fM, fUsd, fThb, fNum, long, short, inDays, monthName, parseNum, plural, pill, pre, joinedBudgetUsd, howOf,
  card, cardHead, viewHead, disclosure, field, commit, modal, confirmDialog, sourceLink,
} from "../core.js";
import { moneyWarnings } from "./today.js";

const DEST = { SwissBorg: "SwissBorg", IBKR: "Interactive Brokers" };
const dest = (to) => DEST[to] || to;
/** "To SwissBorg" already names where it goes; "Month 2" does not. */
const labelTo = (t) => (/swissborg|interactive/i.test(t.label) ? t.label : `${t.label} to ${dest(t.to)}`);
/** What a different amount changes, by destination: the plan's rule r10, or its SwissBorg rule. */
function diffRule(t) {
  if (t.to === "IBKR") return "A different amount sent to Interactive Brokers changes only that month's VWRA order (rule r10).";
  const sb = (app.plan.differenceRules.find((r) => r.id === "swissborg") || {}).text;
  return sb || "A different amount sent to SwissBorg changes the coins paid from the wallet, not VWRA.";
}

/** "Baht at ฿33.53 per US dollar · Frankfurter …, 9 Oct 2026" with its source. */
export function rateLine() {
  const plan = app.plan;
  const f = fxInfo();
  const input = S().plan && S().plan.input;
  const own = input && input.currency === "THB";
  const planRate = own ? "your plan's rate, from when you started" : "the plan's rate";
  return h("p.rate-line.rise", icon("funding"),
    h("span", "Baht at ", h("strong.num", `฿${fNum(f.rate, 2)}`), " per US dollar · ",
      f.source === "plan" ? h("span", `${planRate} (the live rate is not available right now)`) : [sourceLink(prices.SOURCES.fx), f.date ? `, ${long(f.date)}` : "", f.source === "cached" ? " (last known)" : ""],
      f.source === "plan" ? null : h("span.muted", ` · ${planRate} ฿${fNum(plan.meta.planFx, 2)}`)));
}

export function renderMoney() {
  const plan = app.plan, st = S();
  const fund = funding();
  const warns = moneyWarnings(fund);
  const fs = st.funding || {};
  const statusOf = (t) => (fs[t.id] && fs[t.id].status) || "todo";
  const mine = fund.transfers.filter((t) => !t.preJoin); // the transfers that count for this friend
  const ibkr = mine.filter((t) => t.to === "IBKR");
  const others = mine.filter((t) => t.to !== "IBKR");
  const arrived = mine.filter((t) => statusOf(t) === "arrived");
  const next = mine.filter((t) => statusOf(t) !== "arrived").sort((a, b) => (a.arriveBy < b.arriveBy ? -1 : a.arriveBy > b.arriveBy ? 1 : 0))[0];
  const sentDiff = L.round2(ibkr.reduce((a, t) => a + (Number.isFinite((fs[t.id] || {}).sentUsd) ? t.usd - t.planUsd : 0), 0));
  const showThb = settings().showThb !== false;
  const pj = pre();
  const budget = joinedBudgetUsd();
  const out = [viewHead("money", `${fM(plan.funding.monthlyUsd)} a month · ${plural(mine.length, "transfer")}`, "Money",
    `Each month you send money to Interactive Brokers the week before the order date${others.length ? `, plus ${others.map((t) => `${fM(t.planUsd)} to ${dest(t.to)} in ${monthName(dateOfId(t.forDate), false, true)}`).join(" and ")}` : ""}. Record what you actually sent: a different amount sent to Interactive Brokers changes only that month's VWRA order (rule r10)${others.length ? "; one sent to SwissBorg changes only ether and solana (the plan's SwissBorg rule)" : ""}.${pj.dateIds.length ? ` Transfers for the months before you joined are not sent: they show $0.` : ""}`)];

  out.push(rateLine());

  // the next transfer + the year so far
  const pct = Math.min(100, (arrived.reduce((a, t) => a + t.usd, 0) / (fund.totalUsd || 1)) * 100);
  out.push(h("div.money-pair",
    card(".money-card", { "aria-labelledby": "mf-next-h" },
      h("p.eyebrow", next ? `Next · arrive by ${long(next.arriveBy)}` : "All transfers arrived"),
      h("h2.money-title#mf-next-h", next ? labelTo(next) : "Year one is funded"),
      next ? h("p.money-amt", h("span.num-display", fM(next.usd)), showThb ? h("span.money-amt-sub", ` ≈ ${fThb(next.thb)}`) : null) : null,
      next ? h("dl.kv",
        h("dt", "Send"), h("dd", next.send ? `${long(next.send)} (${inDays(L.daysBetween(today(), next.send))})` : "—"),
        h("dt", "To"), h("dd", dest(next.to)),
        h("dt", "Pays for"), h("dd", next.pays)) : h("p.muted.small", "Every transfer for the twelve order dates is marked arrived."),
      next ? h("button.btn.btn-primary.money-cta", { type: "button", "data-fk": "mf-next-" + next.id, on: { click: () => openTransferDialog(next, statusOf(next) === "sent" ? "arrived" : "sent") } }, statusOf(next) === "sent" ? "Mark it arrived" : "I sent it") : null),
    card(".money-card", { "aria-labelledby": "mf-year-h" },
      h("p.eyebrow", `${arrived.length} of ${mine.length} arrived`),
      h("h2.money-title#mf-year-h", "Year one"),
      h("p.money-amt", h("span.num-display", fM(fund.totalUsd)), showThb ? h("span.money-amt-sub", ` ≈ ${fThb(fund.totalThb)}`) : null),
      h("div.meter", { role: "img", "aria-label": `${arrived.length} of ${mine.length} transfers arrived` }, h("span", { style: { width: pct.toFixed(1) + "%" } })),
      h("dl.kv",
        h("dt", "Plan"), h("dd", h("span.num", fM(budget)), h("span.kv-note", `${fM(plan.funding.monthlyUsd)} a month for ${plural(plan.orderDates.length - pj.dateIds.length, "month")}${pj.dateIds.length ? ", from when you joined" : ""}`)),
        h("dt", "Sent to Interactive Brokers vs plan"), h(`dd${sentDiff < 0 ? ".is-coral" : ""}`, h("span.num", `${sentDiff > 0 ? "+" : sentDiff < 0 ? "−" : "±"}${fUsd(Math.abs(sentDiff), 2)}`), h("span.kv-note", "a difference changes that month's VWRA order (rule r10)"))))));

  // month by month
  out.push(card(".strip-card", { "aria-labelledby": "mstrip-h" },
    cardHead(h("span#mstrip-h", "Month by month"), "Each square is one transfer. It fills in as you mark it sent, then arrived."),
    h("ol.month-strip", fund.transfers.map((t) => {
      const s = t.preJoin ? "pre" : statusOf(t);
      const words = t.preJoin ? "before you joined" : s === "todo" ? "to send" : s;
      return h(`li.ms-cell.is-${s}${t.to === "IBKR" ? "" : ".is-alt"}`, { title: `${t.id} ${t.label}: ${fM(t.usd)} to ${dest(t.to)}, arrive by ${long(t.arriveBy)} (${words})` },
        h("span.msc-mon", monthName(t.arriveBy, true)), h("span.msc-amt.num", fM(t.usd)), h("span.msc-to", t.to === "IBKR" ? "IBKR" : dest(t.to)),
        h("span.visually-hidden", ` ${words}`));
    }))));

  // timing checks + the plan's money rules
  const LV = { alert: "alert", warn: "alert", info: "info" };
  out.push(card(".fund-rules", { "aria-labelledby": "fr-h" },
    cardHead(h("span#fr-h", "Timing checks")),
    warns.length ? h("ul.alerts.is-compact", warns.map((w) => h(`li.alert.alert-${w.level}`, h("div.alert-ico", { "aria-hidden": "true" }, icon(LV[w.level])), h("div.alert-main", h("p.alert-title", w.title), h("p.alert-body", w.text)))))
      : h("p.calm-line", icon("check"), "Every transfer is due the Friday before the orders it pays for."),
    h("div.rule-pair",
      h("div.rule-card", h("p.eyebrow", "If a month's money is late"), h("p", plan.funding.lateRule)),
      h("div.rule-card", h("p.eyebrow", "Bank fees"), h("p", plan.funding.feeNote)))));

  out.push(card(".tx-card", { "aria-labelledby": "tx-h" },
    cardHead(h("span#tx-h", "Transfers"), "Mark each one sent, then arrived. A different amount sent to Interactive Brokers changes that month's VWRA order (rule r10); one sent to SwissBorg changes only the coins."),
    h("div.table-wrap", transfersTable(fund, st, showThb)),
    h("p.fine", `Total at ฿${fNum(fund.fx, 2)}: ${fM(fund.totalUsd)} is about ${fThb(fund.totalThb)}${L.round2(fund.totalUsd) !== budget ? `, against the plan's ${fM(budget)}` : ""}.`)));
  return out;
}

const STATUS_WORDS = [["todo", "To do"], ["sent", "Sent"], ["arrived", "Arrived"]];

function transfersTable(fund, st, showThb) {
  const plan = app.plan;
  const td = today();
  const cr = carry();
  return h("table.data-table.tx-table",
    h("thead", h("tr",
      h("th", { scope: "col" }, "Transfer"), h("th", { scope: "col" }, "Send"), h("th", { scope: "col" }, "Arrive by"),
      h("th.r", { scope: "col" }, "US$"), showThb ? h("th.r", { scope: "col" }, `Baht at ฿${fNum(fund.fx, 2)}`) : null,
      h("th", { scope: "col" }, "Pays for"), h("th", { scope: "col" }, "Status"))),
    h("tbody", fund.transfers.map((t) => {
      if (t.preJoin) {
        return h("tr.is-pre",
          h("td", { "data-label": "Transfer" }, h("span.tx-id.num", t.id), h("span.tx-label", t.label), h("span.tx-to", `For ${short(dateOfId(t.forDate))} → ${dest(t.to)}`)),
          h("td.num", { "data-label": "Send" }, t.send ? short(t.send) : "—"),
          h("td.num", { "data-label": "Arrive by" }, t.arriveBy ? short(t.arriveBy) : "—"),
          h("td.num.r.nowrap", { "data-label": "US$" }, h("strong", fM(0)), h("span.tx-sub", `plan ${fM(t.planUsd)}`)),
          showThb ? h("td.num.r", { "data-label": `Baht at ฿${fNum(fund.fx, 2)}` }, "—") : null,
          h("td.tx-pays", { "data-label": "Pays for" }, h("span", "Nothing: this month was before you joined.")),
          h("td", { "data-label": "Status" }, pill("Before you joined", "muted", "–")));
      }
      const s = st.funding[t.id] || {};
      const status = s.status || "todo";
      const dd = t.arriveBy ? L.daysBetween(td, t.arriveBy) : null;
      const recorded = s.sentUsd != null || s.sentThb != null
        ? h("p.tx-rec.num", `Sent ${s.sentUsd != null ? fUsd(s.sentUsd, 2) : ""}${s.sentUsd != null && s.sentThb != null ? " · " : ""}${s.sentThb != null ? fThb(s.sentThb) : ""}${s.sentAt ? " on " + short(s.sentAt) : ""}${s.arrivedAt ? " · arrived " + short(s.arrivedAt) : ""}`) : null;
      // Rule r10 at work: what this month's VWRA order becomes after a different amount.
      const target = plan.orders.find((o) => o.dateId === t.forDate && o.carryTarget);
      const c = target && cr.byOrder[target.id];
      const coins = plan.orders.filter((o) => o.cryptoWait && !isDone(o.id));
      const effect = t.to === "IBKR" && t.usd !== t.planUsd && target && c && !isDone(target.id)
        ? h("p.tx-effect", `${t.usd > t.planUsd ? "+" : "−"}${fUsd(Math.abs(t.usd - t.planUsd), 2)} to the VWRA order on ${short(dateOfId(t.forDate))} (rule r10): now ${fUsd(c.usd, 2)}${c.shortUsd ? `, ${fUsd(c.shortUsd, 2)} short` : ""}`)
        // SwissBorg: VWRA does not change; the coins paid from the wallet do (the plan's SwissBorg rule).
        : t.to === "SwissBorg" && t.usd !== t.planUsd && coins.length && cr.coinUsd
          ? h("p.tx-effect", `VWRA does not change. The coins from the wallet are now ${coins.map((o) => `${app.instMap[o.instrument].name.toLowerCase()} ${fUsd(cr.coinUsd[o.id], 2)}`).join(" and ")} (the plan's SwissBorg rule).`) : null;
      return h(`tr.is-${status}`,
        h("td", { "data-label": "Transfer" }, h("span.tx-id.num", t.id), h("span.tx-label", t.label), h("span.tx-to", `For ${short(dateOfId(t.forDate))} → ${dest(t.to)}`)),
        h("td.num", { "data-label": "Send" }, t.send ? short(t.send) : "—"),
        h("td.num", { "data-label": "Arrive by" }, t.arriveBy ? short(t.arriveBy) : "—", dd != null && status !== "arrived" ? h(`span.tx-sub${dd < 0 ? ".is-coral" : ""}`, inDays(dd)) : null),
        h("td.num.r.nowrap", { "data-label": "US$" }, h("strong", fM(t.usd)),
          t.planUsd != null && t.usd !== t.planUsd ? h("span.tx-sub", { title: diffRule(t) }, `plan ${fM(t.planUsd)}`) : null),
        showThb ? h("td.num.r", { "data-label": `Baht at ฿${fNum(fund.fx, 2)}` }, s.sentThb != null ? h("strong", fThb(s.sentThb)) : `≈ ${fThb(t.thb)}`) : null,
        h("td.tx-pays", { "data-label": "Pays for" }, h("span", t.pays), effect, howOf(t) ? disclosure("how-" + t.id, "How", h("p", howOf(t))) : null),
        h("td", { "data-label": "Status" }, h("div.seg", { role: "group", "aria-label": `${t.id} status` },
          STATUS_WORDS.map(([v, label]) => h("button.seg-btn", {
            type: "button", "aria-pressed": String(status === v), "data-fk": `tx-${t.id}-${v}`,
            on: { click: () => setTransferStatus(t, v) },
          }, label))), recorded));
    })));
}

async function setTransferStatus(t, target) {
  const s = S().funding[t.id] || {};
  const cur = s.status || "todo";
  if (target === cur && target !== "sent") return;
  if (target === "todo") {
    if (s.sentUsd != null || s.sentThb != null || s.arrivedAt) {
      const ok = await confirmDialog({ title: `Reset ${t.id}?`, text: "The amounts and dates you recorded for this transfer are cleared, and that month's VWRA order goes back to its planned amount.", ok: "Reset", danger: true });
      if (!ok) return;
    }
    commit((d) => { d.funding[t.id] = { status: "todo", sentUsd: null, sentThb: null, sentAt: null, arrivedAt: null }; });
    return;
  }
  openTransferDialog(t, target);
}

export function openTransferDialog(t, target) {
  const s = S().funding[t.id] || {};
  const f = fxInfo();
  const plan$ = t.planUsd ?? t.usd;
  const usdI = h("input", { name: "usd", inputmode: "decimal", autocomplete: "off", value: String(s.sentUsd ?? plan$ ?? ""), "aria-describedby": `tx-usd-hint-${t.id}` });
  const thbI = h("input", { name: "thb", inputmode: "decimal", autocomplete: "off", value: s.sentThb != null ? String(s.sentThb) : "", placeholder: `about ${fThb(t.thb)}` });
  const sentI = h("input", { name: "sentAt", type: "date", value: s.sentAt || today() });
  const arrI = h("input", { name: "arrivedAt", type: "date", value: s.arrivedAt || today() });
  const errId = `tx-err-${t.id}`;
  const err = h("p.form-error", { role: "alert", id: errId });
  // The dollars are what the plan counts; the baht are only the friend's own record of the cost. If baht are
  // typed but the dollars were left at the plan's figure and the two disagree, say so, and refuse to record
  // a short transfer as the full amount.
  let usdTouched = s.sentUsd != null;
  const usdHint = h("span.field-hint", { id: `tx-usd-hint-${t.id}` }, `The plan: ${fM(plan$)}. Type what your bank says was sent.`);
  const thbAsUsd = () => { const thb = parseNum(thbI.value); return thb > 0 && f.rate > 0 ? L.round2(thb / f.rate) : null; };
  const mismatch = () => {
    const est = thbAsUsd(), usd = parseNum(usdI.value);
    return !usdTouched && est != null && usd > 0 && Math.abs(est - usd) > Math.max(1, usd * 0.02) ? est : null;
  };
  const rehint = () => {
    const est = mismatch();
    usdHint.textContent = est != null
      ? `At ฿${fNum(f.rate, 2)}, ${fThb(parseNum(thbI.value))} is about ${fUsd(est, 2)}, not the plan's ${fM(plan$)}. Type the dollars your bank sent.`
      : `The plan: ${fM(plan$)}. Type what your bank says was sent.`;
    usdHint.classList.toggle("is-warn", est != null);
  };
  usdI.addEventListener("input", () => { usdTouched = true; rehint(); });
  thbI.addEventListener("input", rehint);
  modal({
    title: `${t.id}: mark ${target}`,
    lede: `${labelTo(t)} · ${t.pays}`,
    body: h("div.form-grid",
      h("label.field", h("span.field-label", "US dollars sent"), usdI, usdHint),
      field("Baht it cost (optional, for your records)", thbI, `About ${fThb(t.thb)} at ฿${fNum(f.rate, 2)}. The dollars above are what the plan counts.`),
      field("Sent on", sentI),
      target === "arrived" ? field("Arrived on", arrI) : null,
      h("p.field-hint.span-2", `${diffRule(t)} Sent two or three months together? Mark each month's transfer with its own share, so only a real difference changes anything.`),
      err),
    actions: [h("button.btn.btn-ghost", { type: "button", on: { click: (e) => e.target.closest("dialog").close() } }, "Cancel"), h("button.btn.btn-primary", { type: "submit" }, `Mark ${target}`)],
    onSubmit: () => {
      const usd = parseNum(usdI.value);
      const thbRaw = thbI.value.trim();
      const thb = thbRaw === "" ? null : parseNum(thbRaw);
      const bad = (msg, el) => { err.textContent = msg; el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-describedby", `${errId} tx-usd-hint-${t.id}`); el.focus(); return false; };
      usdI.removeAttribute("aria-invalid"); thbI.removeAttribute("aria-invalid");
      if (!(usd > 0)) return bad("Please type the US dollars sent.", usdI);
      if (thb != null && !(thb > 0)) return bad("The baht amount must be a number, or leave it empty.", thbI);
      const est = mismatch();
      if (est != null) { usdTouched = true; return bad(`The baht you typed come to about ${fUsd(est, 2)}, but the dollars still say the plan's ${fM(plan$)}. Type the dollars that were sent (your bank's confirmation shows them), then save.`, usdI); }
      const sentAt = /^\d{4}-\d{2}-\d{2}$/.test(sentI.value) ? sentI.value : today();
      const arrivedAt = target === "arrived" ? (/^\d{4}-\d{2}-\d{2}$/.test(arrI.value) ? arrI.value : today()) : null;
      commit((d) => {
        d.funding[t.id] = { ...(d.funding[t.id] || {}), status: target, sentUsd: L.round2(usd), sentThb: thb == null ? null : L.round2(thb), sentAt, arrivedAt };
      });
      toast(`${t.id} marked ${target}`, "success");
      return true;
    },
  });
}
