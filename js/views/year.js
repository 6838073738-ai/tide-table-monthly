// Year: the twelve order dates at a glance, each with what is bought, the money that pays for it
// (send by / arrive by), that month's amount (with "Change" while no record fixes it) and how far the
// friend has got.

import {
  app, h, S, L, today, ost, isDone, instById, schedule, funding, carry, autoDeskDate, fM, fB, fUsd, long, short, dayShort,
  inDays, plural, statusPill, pill, viewHead, card, progressNow, pre, isPreDate, skippedUsd, monthName, joinedBudgetUsd, dateNotesFor,
  monthOf, fixed, amountWords, mixIsOwn, tickerOf,
} from "../core.js?v=2.1.0";
import { openDesk, chapterPages } from "./today.js?v=2.1.0";
import { waitingWhy } from "../split.js?v=2.1.0";
import { fieldName } from "../fields-catalog.js?v=2.1.0";
import { openMonthDialog, monthWordOf, recordWords, listAnd } from "./amounts.js?v=2.1.0";
import { upcomingChecked } from "./fields.js?v=2.1.0";
import * as LK from "../lock.js?v=2.1.0";
import { nameEl, nameText, lockNow, lockMonthLine, lockShareWords } from "./naming.js?v=2.1.0";

const TX_PILL = { todo: ["To send", "neutral", "□"], sent: ["Sent", "sky", "↗"], arrived: ["Arrived", "kelp", "✓"] };
const ROLL_WORDS = { below_min: "Not bought at your amount", not_in_mix: "Not in your mix" };

/** A joined month's amount: "This month: $500" with "Change" while it can change, or "$500 · fixed by your
 *  records" once a record fixes it. A month set on its own says so; one typed in baht shows the baht. */
function amountLine(d) {
  const r = monthOf(d.id);
  if (!r || r.preJoin) return null;
  if (fixed().has(d.id)) return h("p.am-line.is-fixed", { "data-fk": "year-fixed-" + d.id, title: `Records: ${recordWords(fixed().get(d.id))}` }, `${fM(r.usd)} · fixed by your records`);
  const typed = (r.own || r.pinned) && r.input && r.input.currency === "THB" ? ` · you typed ${fB(r.input.amount)}` : "";
  return h("div.am-line",
    h("span.am-line-text", "This month: ", h("strong.num", fM(r.usd)), typed ? h("span.muted", typed) : null),
    r.own ? pill("Set on its own", "sky", "•") : null,
    h("button.btn.btn-small.btn-ghost", { type: "button", "data-fk": "year-amt-" + d.id, "aria-label": `Change ${monthWordOf(d.id)}'s amount`, on: { click: () => openMonthDialog(d.id) } }, "Change"));
}

/** For a field month: one line for each ticked company that is not trading yet (upcoming-api.md 6), with the
 *  date the open data last checked it (upcoming-api.md 4). */
function waitingLines(dateId) {
  const f = app.plan.scale && app.plan.scale.fields ? app.plan.scale.fields[dateId] : null;
  if (!f || !Array.isArray(f.W)) return [];
  return f.W.map((id) => {
    const w = waitingWhy(app.plan, dateId, id, fieldName);
    const checked = w ? upcomingChecked(id) : "";
    return w ? (checked ? `${w} ${checked}` : w) : null;
  }).filter(Boolean)
    .map((w, k) => h("p.mc-note", { "data-fk": `year-waiting-${dateId}-${k}` }, w));
}

/** A list of names as the end of a sentence: one full stop, and none added after a name that ends in one ("Apple Inc."). */
const sentenceEnd = (s) => (/[.!?]$/.test(s) ? s : s + ".");

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
  const mixFrom = S().plan && S().plan.mixFrom;
  const mixNote = mixIsOwn() && mixFrom ? ` Your orders follow your own mix from ${monthWordOf(mixFrom)}.` : "";
  // The locked 10% (addendum B.6, G): one sentence and the "as written" line in the page's own intro, with no
  // heading, chips or block of its own; each month card says where its 10% goes.
  const lock = lockNow(plan);
  const lockIntro = lock ? [" ", h("span", { "data-fk": "year-lock" }, `${lockShareWords(plan)} ${LK.LOCK_COPY.asWritten}`)] : null;
  const out = [viewHead("year", plan.meta.subtitle, "My year",
    [`Twelve order dates, on the second Tuesday of each month. Each month's money is sent the week before and must arrive by the Friday before the order date.${joinNote}${mixNote} ${pr.done + pr.skipped} of ${pr.total} orders done so far.`, lockIntro])];
  // The year as twelve larger chapter pages (brief 4.8.5); each opens its order date on Today's desk.
  out.push(h("div.bk-section.ttm-chapters", chapterPages({ large: true })));
  const more = h("p.bk-note.ttm-more-links", "Also: ",
    h("a", { href: "#/money", "data-fk": "year-money" }, "Money"), ", ",
    h("a", { href: "#/holdings", "data-fk": "year-holdings" }, "Holdings"), " and ",
    h("a", { href: "#/rules", "data-fk": "year-rules" }, "Rules"), ".");
  out.push(more);

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
          h("span.mc-name", nameEl(i, { masked: i.group === "fields" })),
          before ? h("span.mc-amt.num", "—", h("span.mc-sub", " not bought"))
            // A $0 VWRA order (an own mix that leaves it nothing) is there for leftovers and the rules' carries.
            : h("span.mc-amt.num", s.status === "filled" ? fUsd(s.costUsd, 2) : skipped != null ? fUsd(skipped, 2) : adj != null ? fUsd(adj, 2) : o.carryTarget && !(o.usd > 0) ? "takes any leftover" : fM(o.usd),
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
      Object.entries(ROLL_WORDS).map(([reason, words]) => {
        const rs = rolled.filter((r) => (r.reason || "below_min") === reason);
        return rs.length ? h("p.mc-note", `${words}: ${sentenceEnd(listAnd([...new Set(rs.map((r) => nameText(instById(r.instrument))))]))} The share is in a VWRA order.`) : null;
      }),
      // An upcoming listing the friend ticked that does not trade yet: where its part goes this month.
      ...waitingLines(d.id),
      // The locked 10%: where this month's goes, with its date line while it does not trade (lock-api.md 6).
      before ? null : lockMonthLine(plan, d.id, { fk: "year-lock-" + d.id, asWritten: false }),
      notes.length && !before ? h("details.disc.mc-notes", h("summary", { "data-fk": "year-notes-" + d.id }, plural(notes.length, "note") + " from the plan"), h("ul.disc-body", notes.map((n) => h("li", n)))) : null,
      amountLine(d),
      h("div.mc-foot",
        h("span.mc-rel", before ? "Before you joined" : done ? "All done" : `${inDays(L.daysBetween(td, d.effective))}`),
        h("button.btn.btn-small", { type: "button", "data-fk": "year-" + d.id, on: { click: () => openDesk(d.id) } }, "Open on the desk")));
  })));

  out.push(card(".year-total", { "aria-label": "The year in numbers" },
    h("div.pv-stats",
      h("div.pv-stat", h("span.stat-label", "Each month"), h("span.pv-big.num-display", amountWords().replace(/ a month$/, "") || fM(plan.funding.monthlyUsd))),
      pj.dateIds.length
        ? h("div.pv-stat", h("span.stat-label", "From when you joined"), h("span.pv-big.num-display", fM(joinedBudgetUsd())))
        : h("div.pv-stat", h("span.stat-label", "Over the year"), h("span.pv-big.num-display", fM(plan.meta.budgetUsd))),
      h("div.pv-stat", h("span.stat-label", "First and last order"), h("span.pv-mid", `${short((sch.dates.find((d) => !isPreDate(d.id)) || sch.dates[0]).effective)} – ${short(sch.dates[sch.dates.length - 1].effective)}`))),
    h("p.fine", "Amounts to invest, not forecasts: the plan never says what they will be worth.")));
  return out;
}
