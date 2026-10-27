// Rules: the plan's getting-ready checklist, its written rules (if this, then that), what it never does,
// the thesis checks per holding with a check log, the journal, the maintenance calendar and a short
// list of the words the plan uses. A getting-ready item the friend's plan does not need (SwissBorg, when
// their mix has no coins; the thesis checks and the 27 Nov closes, when their fields buy none of those
// holdings) is shown muted and left out of the count; a holding their mix leaves out, or that is too small
// at their amounts, says so on its thesis card.
//
// With field months (spec 8.3) the example plan's written reasons describe only the holdings the friend's
// own months still buy: a thesis card is shown only for a holding the plan buys in a month they joined, and
// the rebalancing targets (the example plan's split) are not shown at all. The friend's own companies get no
// written reason here: they chose them, and the journal is the place for their own words (spec 12.1, 6 and 8).

import {
  app, h, icon, toast, svg, L, S, now, today, ost, isDone, instById, rule, schedule, fM, long, short, monthName, bkkTime,
  pill, card, cardHead, viewHead, field, ruleQuote, commit, confirmDialog, plural, prepNotNeeded, fieldMonthsOn, joinedPlan, tickerOf,
} from "../core.js?v=2.0.0";
import { notBought, notBoughtMonth } from "./mix.js?v=2.0.0";

const WORDS = [
  ["Index fund", "A fund that holds many companies at once by following a market index. VWRA holds thousands of companies around the world; XDEW, EIMI and the quantum fund (QNTM) are narrower ones."],
  ["ETF", "A fund you buy on a stock exchange, like a share. The plan's four funds are listed in London and priced in US dollars."],
  ["Share", "One unit of a company or fund. The funds are bought in whole shares; the US stocks in dollar amounts (fractional shares)."],
  ["Limit order", "An order with the most you will pay per share. It fills at that price or lower, or not at all."],
  ["Ask", "The lowest price a seller will take right now; your broker's app shows it next to the bid (what buyers offer). “Limit at the current ask” means you set your limit to that price."],
  ["Acc", "Short for accumulating: the fund keeps its dividends and reinvests them, so nothing is paid out to you. The plan's funds are the “Acc” listings in US dollars."],
  ["Ceiling", "The most the plan pays for one share of a stock or fund. Above it, rule r1 applies. Five ceilings come from the 27 Nov 2026 closing prices."],
  ["Fill", "Your order went through. The confirmation shows the shares, the price and the fee: log those here."],
  ["Thesis check", "One line on why the plan holds a stock, checked after its quarterly report. A failed check, not the price, stops its next order."],
  ["Leftover rule", "Cash left over from whole shares or a skipped order joins the next VWRA order. Until it is enough for a whole share, it waits as cash at Interactive Brokers."],
  ["Interactive Brokers", "The broker the plan uses for the funds and the US stocks (IBKR for short)."],
  ["Cash account", "A broker account that only uses your own money: you cannot borrow from the broker. The plan asks for this kind."],
  ["W-8BEN", "A short US tax form for people who are not US residents. Your broker asks for it; it can lower the US tax taken from dividends where your country has a tax treaty with the US."],
  ["Deposit notification", "At Interactive Brokers you first tell them a transfer is coming (amount and bank), then send it from your bank, so they can match it to your account."],
  ["Dividend reinvestment", "A broker setting: dividends from the stocks buy more of the same stock instead of waiting as cash."],
  ["SwissBorg", "The app the plan uses for bitcoin, ether and solana. USDC is a digital dollar some people use to move money into it."],
  ["Network", "The blockchain a coin is sent on. When you send USDC to SwissBorg, choose the exact network SwissBorg shows: coins sent on a different network can be lost."],
  ["Earn, staking, margin, leverage, options", "Ways to lend out coins for a yield, borrow money to buy more, or bet on price moves. The plan never uses any of them."],
  ["Equal-weight", "An index fund that holds the same amount of each company, instead of more of the biggest ones (XDEW does this for the S&P 500)."],
];

export function renderRules() {
  const plan = app.plan, st = S();
  const td = today();
  // With field months, the thesis cards are only those of the holdings the friend's own months still buy.
  const withFields = fieldMonthsOn();
  const bought = new Set(joinedPlan().orders.map((o) => o.instrument));
  const theses = withFields ? plan.thesis.filter((t) => bought.has(t.instrument)) : plan.thesis;
  const out = [viewHead("rules", "Written in advance", "Rules",
    `The plan's own rules: getting ready, when to skip, wait or change an order, ${theses.length ? "the thesis checks, " : ""}and what to do after the last order. These are the only actions Tide Table ever shows.`)];

  // getting ready + the rules table; an item the plan does not need counts for nothing
  const needed = plan.prep.filter((p) => !prepNotNeeded(p.id));
  const done = needed.filter((p) => st.prep[p.id]).length;
  const dd = L.daysBetween(td, plan.prepDeadline);
  const ringC = 2 * Math.PI * 22;
  out.push(h("div.rules-top",
    card(".prep-card", { "aria-labelledby": "prep-h" },
      h("header.card-head",
        h("div.card-head-text", h("p.eyebrow", "Step 1 · October"), h("h2.card-title#prep-h", { tabindex: "-1" }, "Getting ready"), h("p.card-sub", `Finish these by ${long(plan.prepDeadline)}, before any money moves.`)),
        h("div.prep-count",
          svg("svg.mini-ring", { viewBox: "0 0 56 56", "aria-hidden": "true" }, svg("circle.mr-track", { cx: 28, cy: 28, r: 22 }), svg("circle.mr-arc", { cx: 28, cy: 28, r: 22, transform: "rotate(-90 28 28)", "stroke-dasharray": `${((needed.length ? done / needed.length : 1) * ringC).toFixed(1)} ${ringC.toFixed(1)}` })),
          h("p.prep-num", h("span.num-display", String(done)), h("span.stat-of", `/${needed.length}`)),
          h(`p.prep-due${dd < 0 && done < needed.length ? ".is-coral" : ""}`, dd >= 0 ? `${plural(dd, "day")} left` : done === needed.length ? "done" : "date passed"))),
      h("ul.checklist", plan.prep.map((p) => {
        const na = prepNotNeeded(p.id);
        if (na) {
          return h("li.mx-na", h("div.check",
            h("span.check-box", { "aria-hidden": "true" }, "–"),
            h("span.check-text", p.text, h("span.check-note", { "data-fk": "prep-na-" + p.id }, ` ${na}`))));
        }
        return h(`li${st.prep[p.id] ? ".is-done" : ""}`,
          h("label.check",
            h("input", { type: "checkbox", checked: !!st.prep[p.id], "data-fk": "prep-" + p.id, on: { change: (e) => { const v = e.target.checked; commit((d) => { d.prep[p.id] = v; }); } } }),
            h("span.check-box", { "aria-hidden": "true" }, icon("check")),
            h("span.check-text", p.text, p.appNote ? h("span.check-note", ` ${p.appNote}`) : null)));
      }))),
    card(".rules-card", { "aria-labelledby": "rt-h" },
      cardHead(h("span#rt-h", "When to skip, wait or change an order"), (rule("r7") || {}).if + ": " + (rule("r7") || {}).then),
      h("div.table-wrap", h("table.data-table.rules-table",
        h("thead", h("tr", h("th", { scope: "col" }, "If"), h("th", { scope: "col" }, "Then"))),
        h("tbody", plan.rules.filter((r) => r.id !== "r7").map((r) => h("tr", h("th", { scope: "row" }, h("span.rule-id.num", r.id), r.if), h("td", r.then)))))),
      h("div.never", h("p.never-line", icon("alert"), h("span", plan.never)), h("p.never-line", icon("info"), h("span", plan.cryptoRule))))));

  // thesis checks: with field months, only for the holdings the friend's own months still buy
  out.push(h("section.thesis-sec", { "aria-labelledby": "th-h", "data-fk": "thesis-sec" },
    h("header.sec-head.rise", h("h2.sec-title#th-h", "Thesis checks"), h("p.sec-sub", withFields
      ? (theses.length
        ? "These are the example plan's written reasons, for the holdings your months on the example plan buy. A failed check, not the price, stops an order or starts a review. Check after every quarterly report."
        : "Your field months buy the companies you chose and VWRA. The example plan's written reasons are for holdings your months do not buy, so none is shown here.")
      : "Each growth stock, the quantum fund and the two smaller coins are held for one written reason. A failed check, not the price, stops an order or starts a review. Check after every quarterly report.")),
    theses.length ? h("div.thesis-grid", theses.map((t) => thesisCard(t))) : null,
    withFields ? h("p.fine", { "data-fk": "thesis-own" }, "Tide Table writes no reason for the companies you chose. If you want to keep your own reasons, the journal below is the place for them.") : null));

  // journal + words
  out.push(h("div.rules-pair", journalCard(), wordsCard()));

  // maintenance: the example plan's rebalancing check is about its own split, so it is left out with field months
  const maint = plan.maintenance.filter((m) => !(withFields && /Rebalancing/i.test(m.what)));
  out.push(card(".maint-card", { "aria-labelledby": "mt-h" },
    cardHead(h("span#mt-h", `After ${monthName(plan.orderDates[plan.orderDates.length - 1].date)}: the maintenance calendar`),
      withFields ? "One short look a month. Your split is yours to keep or change on My split." : "One short look a month and two balance checks a year."),
    h("div.table-wrap", h("table.data-table.maint-table",
      h("thead", h("tr", h("th", { scope: "col" }, "When"), h("th", { scope: "col" }, "What"), h("th", { scope: "col" }, "Exactly"))),
      h("tbody", maint.map((m) => h("tr", h("td", { "data-label": "When" }, m.when), h("th", { scope: "row", "data-label": "What" }, m.what), h("td", { "data-label": "Exactly" }, m.detail))))))));
  return out;
}

/** The words on a thesis card for a holding with no order, or one left out from some month on (mix.notBought). */
function notBoughtWords(why) {
  if (!why) return null;
  switch (why.kind) {
    case "mix": return "not in your mix";
    case "fields": return "not in your fields";
    case "mix-from": return `not in your mix from ${notBoughtMonth(why)}`;
    case "fields-from": return `not in your fields from ${notBoughtMonth(why)}`;
    default: return "not bought at your amounts";
  }
}

function thesisCard(t) {
  const i = instById(t.instrument);
  const ts = S().thesis[i.id] || {};
  const checks = (Array.isArray(ts.checks) ? ts.checks : []).map((c, idx) => ({ ...c, idx })).filter((c) => c && c.date).sort((a, b) => (a.date < b.date ? 1 : -1));
  const latest = checks[0];
  const slices = schedule().orders.filter((o) => o.instrument === i.id).sort((a, b) => a.at - b.at);
  // Rule r2 stops the next slice; a later one (July's quantum slice) waits for its own check.
  const gatedOpen = slices.filter((o) => o.thesisGate && !isDone(o.id)).slice(0, 1);
  // No order at all: the friend's mix or fields leave it out, or each order would be too small at their
  // amounts. Bought earlier but left out of their mix or fields from a month on: that month is named after the
  // dates.
  const why = notBought(i.id);
  const sell = h("textarea", { rows: 2, "data-fk": "sell-" + i.id, "data-keep": "", maxlength: 300, placeholder: "One line, written before you buy", text: ts.sellIf || "", "aria-label": `What would make you sell ${i.name}` });
  sell.addEventListener("change", () => { const v = sell.value.trim().slice(0, 300); commit((d) => { d.thesis[i.id] = { checks: [], ...(d.thesis[i.id] || {}), sellIf: v }; }); });
  const dateI = h("input", { type: "date", "data-fk": "chkd-" + i.id, "data-keep": "", value: today(), "aria-label": `${i.name} check date` });
  const passI = h("select", { "data-fk": "chkp-" + i.id, "data-keep": "", "aria-label": `${i.name} check result` }, h("option", { value: "pass" }, "Passes"), h("option", { value: "fail" }, "Fails"));
  const noteI = h("input", { "data-fk": "chkn-" + i.id, "data-keep": "", maxlength: 200, placeholder: "e.g. Q3 report: revenue up 40% on last year", "aria-label": `${i.name} check note` });
  const addCheck = () => {
    if (!dateI.value) { toast("Pick a date for the check", "alert"); return; }
    const entry = { date: dateI.value, pass: passI.value === "pass", note: noteI.value.trim().slice(0, 200) };
    noteI.value = "";
    commit((d) => { const cur = d.thesis[i.id] || { sellIf: "", checks: [] }; d.thesis[i.id] = { ...cur, checks: [...(cur.checks || []), entry] }; });
    toast(`Logged: ${i.name} thesis check ${entry.pass ? "passes" : "fails"}`, entry.pass ? "success" : "info");
  };
  const failed = latest && !latest.pass;
  return card(`.thesis-card${failed ? ".is-failed" : ""}`, { "aria-labelledby": "th-" + i.id },
    h("header.thesis-head",
      h("div", h("h3.thesis-name#th-" + i.id, i.name), h("p.pc-meta", h("span.ticker.num", tickerOf(i)),
        slices.length ? slices.map((o) => h(`span.od.is-${ost(o.id).status || "pending"}`, { title: `${long(o.date)}${o.thesisGate ? " · thesis check first" : ""}` }, short(o.date)))
          : h("span.od", notBoughtWords(why || { kind: "amount" })),
        slices.length && why && /-from$/.test(why.kind) ? h("span.od", notBoughtWords(why)) : null)),
      latest ? (latest.pass ? pill(`Passed ${short(latest.date)}`, "kelp", "✓") : pill(`Failed ${short(latest.date)}`, "coral", "✕")) : pill("No check yet", "neutral", "□")),
    h("dl.thesis-dl", h("dt", "Held because"), h("dd", t.heldBecause), h("dt", "Still holds if"), h("dd", t.holdsIf)),
    field("What would make you sell", sell),
    failed && gatedOpen.length ? h("div.r2-box",
      ruleQuote(rule("r2"), "Plan rule 2"),
      h("p.small", `The next slice this applies to: ${gatedOpen.map((o) => `${short(o.date)} (${fM(o.usd)})`).join(", ")}.`),
      h("button.btn.btn-small", { type: "button", "data-fk": "r2-" + i.id, on: { click: async () => {
        const ok = await confirmDialog({ title: `Skip the ${short(gatedOpen[0].date)} slice of ${i.name}?`, text: `Rule r2: the slice is marked skipped and its money goes into the next VWRA order. You can undo this on the order desk.`, ok: "Mark skipped → VWRA" });
        if (!ok) return;
        commit((d) => { for (const o of gatedOpen) d.orders[o.id] = { ...(d.orders[o.id] || {}), status: "skipped", redirect: "VWRA", note: `Thesis check failed ${latest.date}${latest.note ? ": " + latest.note : ""}`.slice(0, 200) }; });
        toast("Slice marked skipped → VWRA", "info");
      } } }, "Mark this slice skipped → VWRA")) : null,
    h("div.check-log",
      h("p.eyebrow", "Quarterly check log"),
      checks.length ? h("ul.checks", checks.map((c) => h(`li.${c.pass ? "is-pass" : "is-fail"}`,
        h("span.num.chk-date", short(c.date)), c.pass ? pill("Pass", "kelp", "✓") : pill("Fail", "coral", "✕"), h("span.chk-note", c.note || ""),
        h("button.icon-btn.is-small", { type: "button", "aria-label": `Delete the ${short(c.date)} check`, "data-fk": `chkdel-${i.id}-${c.idx}`, on: { click: () => commit((d) => {
          // by content, not position: another tab may have changed the list
          const cur = d.thesis[i.id];
          if (!cur || !Array.isArray(cur.checks)) return;
          const k = cur.checks.findIndex((x) => x && x.date === c.date && x.pass === c.pass && (x.note || "") === (c.note || ""));
          if (k >= 0) cur.checks.splice(k, 1);
        }) } }, "×")))) : h("p.muted.small", "No checks logged yet."),
      h("div.check-add", dateI, passI, noteI, h("button.btn.btn-small", { type: "button", "data-fk": "chkadd-" + i.id, on: { click: addCheck } }, "Log check"))));
}

function journalCard() {
  const st = S();
  const ta = h("textarea", { rows: 3, "data-fk": "jr-text", "data-keep": "", maxlength: 2000, placeholder: "A note to your future self: what you did, and why", "aria-label": "Journal entry" });
  const add = () => {
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    ta.value = "";
    commit((d) => { d.journal.push({ at: new Date(now()).toISOString(), text: text.slice(0, 2000) }); });
    toast("Journal entry saved", "success");
  };
  const fmtAt = (iso) => { const ms = Date.parse(iso); return Number.isFinite(ms) ? `${short(L.bkkDate(ms))} · ${bkkTime(ms)}` : "—"; };
  const items = st.journal.map((j, idx) => ({ ...j, idx })).filter((j) => j && typeof j.text === "string").sort((a, b) => (a.at < b.at ? 1 : -1));
  return card(".journal-card", { "aria-labelledby": "jr-h" },
    cardHead(h("span#jr-h", "Journal"), "Free text, kept in this browser only."),
    h("div.jr-form", ta, h("button.btn.btn-small.btn-primary", { type: "button", "data-fk": "jr-add", on: { click: add } }, "Add entry")),
    items.length ? h("ol.jr-list", items.map((j) => h("li.jr-item",
      h("p.jr-at.num", fmtAt(j.at)),
      h("p.jr-text", j.text),
      h("button.icon-btn.is-small", { type: "button", "aria-label": "Delete this entry", "data-fk": "jr-del-" + j.idx, on: { click: async () => {
        if (await confirmDialog({ title: "Delete this journal entry?", text: j.text.slice(0, 160), ok: "Delete", danger: true })) {
          commit((d) => { const k = d.journal.findIndex((x) => x && x.at === j.at && x.text === j.text); if (k >= 0) d.journal.splice(k, 1); });
        }
      } } }, "×")))) : h("p.muted.small", "No entries yet."));
}

function wordsCard() {
  return card(".words-card", { "aria-labelledby": "words-h" },
    cardHead(h("span#words-h", "Words the plan uses"), "Short meanings of the main words the plan uses."),
    h("dl.words", WORDS.map(([w, m]) => [h("dt", w), h("dd", m)])));
}
