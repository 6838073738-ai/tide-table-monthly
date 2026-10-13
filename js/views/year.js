// Year: the twelve order dates at a glance, each with what is bought, the money that pays for it
// (send by / arrive by) and how far the friend has got.

import {
  app, h, S, L, today, ost, isDone, instById, schedule, funding, carry, autoDeskDate, fM, fUsd, long, short, dayShort,
  inDays, plural, statusPill, pill, viewHead, card, progressNow, pre, isPreDate, skippedUsd, monthName, joinedBudgetUsd, dateNotesFor,
} from "../core.js";
import { openDesk } from "./today.js";

const TX_PILL = { todo: ["To send", "neutral", "○"], sent: ["Sent", "sky", "↗"], arrived: ["Arrived", "kelp", "✓"] };

export function renderYear() {
  const plan = app.plan;
  const sch = schedule();
  const fund = funding();
  const cr = carry();
  const td = today();
  const auto = autoDeskDate(sch);
  const fs = S().funding || {};
  const pr = progressNow();
  const pj = pre();
  const joinNote = pj.dateIds.length
    ? ` You started on ${long(pj.joinedAt)}: ${pj.dateIds.map((id) => monthName(sch.dates.find((d) => d.id === id).effective, false, true)).join(", ")} ${pj.dateIds.length > 1 ? "are" : "is"} before you joined, so nothing is bought or sent for ${pj.dateIds.length > 1 ? "them" : "it"}.`
    : "";
  const out = [viewHead("year", plan.meta.subtitle, "Your year",
    `Twelve order dates, on the second Tuesday of each month. Each month's money is sent the week before and must arrive by the Friday before the order date.${joinNote} ${pr.done + pr.skipped} of ${pr.total} orders done so far.`)];

  out.push(h("ol.year-grid", { "aria-label": "The twelve order dates" }, sch.dates.map((d, k) => {
    const os = sch.orders.filter((o) => o.dateId === d.id).sort((a, b) => a.at - b.at);
    const before = isPreDate(d.id);
    const done = !before && os.every((o) => isDone(o.id));
    const overdue = !before && !done && d.effective < td;
    const isNext = auto && auto.id === d.id;
    const tx = fund.transfers.filter((t) => t.forDate === d.id);
    const rolled = ((plan.scale && plan.scale.rolled) || []).filter((r) => r.dateId === d.id);
    const notes = dateNotesFor(d.id);
    return h(`li.month-card${done ? ".is-done" : ""}${before ? ".is-pre" : ""}${isNext ? ".is-next" : ""}${overdue ? ".is-overdue" : ""}`, { "aria-labelledby": "ym-" + d.id },
      h("header.mc-head",
        h("p.eyebrow", `Month ${k + 1}${before ? " · before you joined" : isNext ? " · next" : done ? " · done" : overdue ? " · date passed" : ""}`),
        h("h2.mc-date#ym-" + d.id, long(d.effective)),
        h("p.mc-title", d.title.replace(/^Month \d+:\s*/, ""))),
      h("ul.mc-orders", os.map((o) => {
        const i = instById(o.instrument);
        const s = ost(o.id);
        const adj = isDone(o.id) ? null
          : o.carryTarget && cr.byOrder[o.id] && cr.byOrder[o.id].usd !== o.usd ? cr.byOrder[o.id].usd
            : o.cryptoWait && cr.coinUsd && Number.isFinite(cr.coinUsd[o.id]) && cr.coinUsd[o.id] !== o.usd ? cr.coinUsd[o.id] : null;
        // A skipped order shows the money it actually held (after carries and short transfers), not the plan's.
        const skipped = !before && s.status === "skipped" ? skippedUsd(o, cr) : null;
        return h("li.mc-order",
          h("span.mc-name", i.name, h("span.ticker.num", i.id)),
          before ? h("span.mc-amt.num", "—", h("span.mc-sub", " not bought"))
            : h("span.mc-amt.num", s.status === "filled" ? fUsd(s.costUsd, 2) : skipped != null ? fUsd(skipped, 2) : adj != null ? fUsd(adj, 2) : fM(o.usd),
              adj != null ? h("span.mc-sub", ` plan ${fM(o.usd)}`) : s.status === "filled" ? h("span.mc-sub", " paid") : skipped != null ? h("span.mc-sub", " not bought") : null),
          before ? pill("Before you joined", "muted", "–") : statusPill(s.status || "pending"));
      })),
      tx.length ? h("div.mc-money",
        tx.map((t) => {
          const st = (fs[t.id] && fs[t.id].status) || "todo";
          const [label, kind, glyph] = t.preJoin ? ["Not sent", "muted", "–"] : TX_PILL[st] || TX_PILL.todo;
          return h("p.mc-tx",
            h("span.mc-tx-what", h("strong.num", fM(t.usd)), ` to ${t.to === "IBKR" ? "Interactive Brokers" : t.to}`),
            h("span.mc-tx-when", t.preJoin ? "before you joined" : `send ${dayShort(t.send)} · arrive by ${dayShort(t.arriveBy)}`),
            h(`span.pill.pill-${kind}`, h("span.pill-ico", { "aria-hidden": "true" }, glyph), label));
        })) : h("div.mc-money", h("p.mc-tx.muted", "Paid from the money already in the SwissBorg wallet.")),
      rolled.length ? h("p.mc-note", `Not bought at your amount: ${rolled.map((r) => instById(r.instrument).name).join(", ")}. The share is in a VWRA order.`) : null,
      notes.length && !before ? h("details.disc.mc-notes", h("summary", { "data-fk": "year-notes-" + d.id }, plural(notes.length, "note") + " from the plan"), h("ul.disc-body", notes.map((n) => h("li", n)))) : null,
      h("div.mc-foot",
        h("span.mc-rel", before ? "Before you joined" : done ? "All done" : `${inDays(L.daysBetween(td, d.effective))}`),
        h("button.btn.btn-small", { type: "button", "data-fk": "year-" + d.id, on: { click: () => openDesk(d.id) } }, "Open on the desk")));
  })));

  out.push(card(".year-total", { "aria-label": "The year in numbers" },
    h("div.pv-stats",
      h("div.pv-stat", h("span.stat-label", "Each month"), h("span.pv-big.num-display", fM(plan.funding.monthlyUsd))),
      pj.dateIds.length
        ? h("div.pv-stat", h("span.stat-label", "From when you joined"), h("span.pv-big.num-display", fM(joinedBudgetUsd())))
        : h("div.pv-stat", h("span.stat-label", "Over the year"), h("span.pv-big.num-display", fM(plan.meta.budgetUsd))),
      h("div.pv-stat", h("span.stat-label", "First and last order"), h("span.pv-mid", `${short((sch.dates.find((d) => !isPreDate(d.id)) || sch.dates[0]).effective)} – ${short(sch.dates[sch.dates.length - 1].effective)}`))),
    h("p.fine", "Amounts to invest, not forecasts: the plan never says what they will be worth.")));
  return out;
}
