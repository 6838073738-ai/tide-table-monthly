// My split (spec 8.2, brief 4.8.4 with the spec's 10.9 deviations): how much of each month goes to the friend's
// fields, and the rest to the all-world fund. The strip starts unset for a friend who has saved no split (Q10:
// no preset level); Save my split stays disabled until it is moved. The money split in words and the open-data
// line; no stat cards, no chart, no bumps strip (decision post-2). The fields chosen and the companies ticked in
// each are listed under it, and Save my split commits them (views/draft.js).

import {
  h, ui, toast, hooks, explain, monthOf, monthName, dateOfId, fM, fB, plural, onCleanup,
} from "../core.js?v=2.0.0";
import * as book from "../book.js?v=2.0.0";
import * as FU from "../fieldsui.js?v=2.0.0";
import { fieldName } from "../fields-catalog.js?v=2.0.0";
import * as draft from "./draft.js?v=2.0.0";
import { WORDS } from "./fields.js?v=2.0.0";

const TEXT = Object.freeze({
  lede: ["Choose how much of each month goes to your fields. The rest goes to the all-world fund, VWRA.",
    "Each field's part is split equally between the companies you tick in it."],
  openData: "This site uses open data only, so it has no share-price history, and the past swings and deepest dip of this mix are not shown.",
  unset: "Choose your split first.",
  noField: "Choose a field to mix it in.",
  allFixed: "Every month of your plan has records, so your fields cannot change.",
  save: "Save my split",
});

const pctOf = (v) => { const p = v / 10; return Number.isInteger(p) ? p : Math.round(p * 10) / 10; };

/** "In December that is $120 to your fields ($40 each) and $180 to the all-world fund." (the typed currency). */
export function moneyWords(fromId, s, nFields) {
  const r = fromId ? monthOf(fromId) : null;
  if (!r || s == null || !nFields) return "";
  const month = monthName(dateOfId(fromId), false, true);
  const thb = r.input && r.input.currency === "THB" && Number.isFinite(r.input.amount);
  const A = thb ? Math.round(r.input.amount * 100) : Math.round(r.usd * 100);
  const P = Math.floor((A * s) / 1000);
  const each = Math.floor(P / nFields);
  const fmt = (c) => (thb ? `about ${fB(Math.round(c / 100))}` : fM(c / 100));
  const fieldsPart = nFields > 1 ? `${fmt(P)} to your fields (${fmt(each)} each)` : `${fmt(P)} to your field`;
  return `In ${month} that is ${fieldsPart} and ${fmt(A - P)} to the all-world fund.`;
}

/**
 * "Take it off" for a ticked company. The page is drawn again without its row, so the focus first moves to where
 * the friend goes on (the next company's "Take it off" in that field, else the one before, else the field's "Add a
 * company" link), which the new page gives back (main.js keeps the focus by data-fk), and the change is spoken
 * once (spec 10.8).
 */
function takeOff(f, id, name) {
  const ids = draft.listOf(f);
  const k = ids.indexOf(id);
  const next = k >= 0 ? ids[k + 1] || ids[k - 1] || null : null;
  draft.setCompany({ id, fieldId: f }, false);
  const still = draft.listOf(f).includes(next) ? next : null;
  const target = document.querySelector(`[data-fk="${CSS.escape(still ? `off-${f}-${still}` : `add-${f}`)}"]`);
  if (target) target.focus({ preventScroll: true });
  hooks.renderView("split");
  ui.announce(`${name} is off your list in ${fieldName(f)}.`);
}

/** A ticked company in the list under the split: its name, ticker and venue, and "Take it off". */
function companyLine(f, id) {
  const n = draft.nameOf(id) || { n: id };
  const waiting = !!(n.w && !n.w.f);
  const take = book.textButton({ label: "Take it off", onClick: () => takeOff(f, id, n.n) });
  take.setAttribute("data-fk", `off-${f}-${id}`);
  take.setAttribute("aria-label", `Take ${n.n} off your list in ${fieldName(f)}`);
  return h("li.ttm-split-co", { "data-id": id },
    h("span.ttm-split-co-name", h("span", { "data-mask": "" }, n.n), n.t ? h("span.bk-soft", " · ", h("span", { "data-mask": "" }, n.t)) : null),
    waiting ? book.note(WORDS.tickHint) : null,
    take);
}

/** One chosen field: its picture, its name (a link to its page) and the companies ticked in it. */
function fieldBlock(f) {
  const ids = draft.listOf(f);
  return h("li.ttm-split-field", { "data-field": f },
    h("div.ttm-split-field-head", book.picture(f, { size: 48 }), h("h3.bk-h3", h("a", { href: FU.fieldHref(f) }, fieldName(f)))),
    ids.length
      ? [book.note(plural(ids.length, "company", "companies") + " ticked."), h("ul.bk-list.ttm-split-cos", ids.map((id) => companyLine(f, id)))]
      : book.note(`Your list in ${fieldName(f)} is empty. Add a company to ${fieldName(f)}, or take ${fieldName(f)} out of your fields.`, { tone: "ink" }),
    addLink(f, ids.length));
}

/** The field's "Add another company" (or "Add a company") link, which "Take it off" can hand the focus to. */
function addLink(f, n) {
  const a = book.textButton({ label: n ? `Add another company in ${fieldName(f)}` : `Add a company to ${fieldName(f)}`, href: FU.fieldHref(f) });
  a.setAttribute("data-fk", `add-${f}`);
  return a;
}

export function renderSplit() {
  const fromId = draft.saveFrom();
  const chosen = draft.chosen();
  const value = draft.split();
  const moneyId = "split-money";
  const money = h("p.bk-lede.ttm-split-money", { id: moneyId, "aria-live": "off" });
  const pics = h("div.ttm-split-pics", { "aria-hidden": "true" },
    h("span.ttm-split-pics-fields", chosen.length ? chosen.map((f) => book.picture(f, { size: 48, lazy: false })) : null),
    h("span.ttm-split-pics-world", book.picture("globe", { size: 48, lazy: false })));

  let dockEl = null;
  const saveBtn = book.button({ label: TEXT.save, disabled: true, onClick: () => save() });
  saveBtn.setAttribute("data-fk", "split-save");

  const summary = () => {
    if (!fromId) return TEXT.allFixed;
    if (!draft.chosen().length) return TEXT.noField;
    const v = draft.split();
    return v == null ? TEXT.unset : `${pctOf(v)}% to your fields`;
  };
  const note = () => (draft.isDirty() ? WORDS.notSaved : draft.hasSaved() ? "Saved." : null);
  const refresh = () => {
    const v = draft.split();
    money.textContent = moneyWords(fromId, v, draft.chosen().length);
    money.hidden = !money.textContent;
    if (dockEl) dockEl.bk.update({ summary: summary(), note: note(), disabled: !fromId || v == null || !draft.chosen().length });
  };

  const strip = book.splitStrip({
    id: "split-strip", value, describedBy: moneyId,
    disabled: !fromId || !chosen.length, disabledText: !fromId ? TEXT.allFixed : TEXT.noField,
    onInput: (v) => { draft.setSplit(v); refresh(); },
    onSettle: () => { if (money.textContent) ui.announce(money.textContent); },
  });

  const out = [];
  out.push(book.openingHead({ title: "My split", scale: "page", level: 1, id: "h-split", lines: TEXT.lede }));
  out.push(h("section.ttm-split-card.bk-section", { "data-fact-surface": "", "aria-label": "Your split" },
    pics, strip, money, book.note(TEXT.openData),
    fromId ? book.note(`Your orders follow this split from ${monthName(dateOfId(fromId), false, true)}. Months with records stay as they are.`) : null));

  const list = h("div.bk-section.bk-stack", { "data-fu": "split-fields" },
    book.sectionHead({ title: "Your fields", level: 2, intro: chosen.length ? null : TEXT.noField }),
    chosen.length ? h("ul.bk-list.ttm-split-fields", chosen.map(fieldBlock)) : null,
    book.quietButton({ label: chosen.length ? "Choose more fields" : "Choose your fields", href: "#/fields" }));
  out.push(list);

  dockEl = book.dock({ summary: summary(), note: note(), button: saveBtn });
  out.push(dockEl);
  refresh();
  const off = draft.onDraft(() => refresh());
  onCleanup(off);

  function save() {
    let from;
    try {
      from = draft.saveDraft();
    } catch (e) {
      const msg = e && e.plain ? e.message : explain(e);
      dockEl.bk.update({ note: msg });
      // one channel per event (spec 10.8): the alert toast is spoken, so no ui.announce() as well
      toast(msg, "alert", 6000);
      return;
    }
    toast(`Your split is saved. Your orders follow it from ${monthName(dateOfId(from), false, true)}.`, "success");
    hooks.go("today");
  }
  return out;
}

/** "Your split: 40% to your 3 fields, 60% to the all-world fund." for a month's spec (Today), or "". */
export function splitLine(spec) {
  if (!spec || !Number.isInteger(spec.split) || !Array.isArray(spec.chosen) || !spec.chosen.length) return "";
  const n = spec.chosen.length;
  const p = pctOf(spec.split);
  const fields = n === 1 ? `your field, ${fieldName(spec.chosen[0])}` : `your ${n} fields`;
  return `Your split: ${p}% to ${fields}, ${pctOf(1000 - spec.split)}% to the all-world fund.`;
}
