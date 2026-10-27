// Fields (spec 8.2, brief 4.8.2): the shared Fields page of fieldsui.js, configured with the friends' words and
// actions, and a dock with "N fields chosen" and Next: set my split. This file also configures fieldsui for
// the field and company pages (views/field.js, views/company.js): the Choose toggle, Add to my list / On my
// list (into this tab's draft, views/draft.js), the not-addable line, and the notes of spec Appendix C.

import { app, h, ui, toast, onCleanup, hooks, universeOn } from "../core.js?v=2.0.0";
import * as book from "../book.js?v=2.0.0";
import * as FU from "../fieldsui.js?v=2.0.0";
import * as D from "../datafiles.js?v=2.0.0";
import { fieldName } from "../fields-catalog.js?v=2.0.0";
import * as draft from "./draft.js?v=2.0.0";

/** Appendix C and upcoming-api.md 9: the friends' own fixed copy. */
export const WORDS = Object.freeze({
  notAddable: "Tide Table places these orders in US dollars at Interactive Brokers on US exchanges, so you can read about this company here but not add it to a list.",
  // a main listing on the Texas Stock Exchange, a US exchange that is not one of the four a friend's orders use (G4
  // fix of review finding ibkr-otc-txse; new copy for the main session to approve, docs/HANDOFF.md)
  notAddableTxse: "Tide Table places these orders in US dollars at Interactive Brokers on NYSE, Nasdaq, NYSE American or Cboe. This company's main listing is on the Texas Stock Exchange, so you can read about it here but not add it to a list.",
  notSorted: "This company is not sorted into a field, so it cannot go on a list.",
  tickHint: "It counts in your orders from the first month after its first trading day.",
  fieldAdded: (name) => `${name} is now in your fields.`,
  sorting: "Fields follow the usual sector names. Tide Table sorts companies into them by the industry code each company gives the SEC, so a few companies sit differently than in commercial sector lists.",
  notSortedN: ({ n }) => (n === "1"
    ? "1 more company passed but is not sorted into a field, because no open source gives its industry. Search finds it."
    : `${n} more companies passed but are not sorted into a field, because no open source gives their industry. Search finds them.`),
  notCovered: {
    TH: "Thai companies are not listed here yet: no open source of their names and yearly reports is cleared for this site.",
    JP: "Tide Table has no open list of Japanese companies cleared for this site yet. Japanese companies that file with the US SEC are listed.",
  },
  stale: "These facts were rebuilt on {date}, {days} days ago. Tide Table rebuilds them every morning when its sources answer.",
  newer: "A newer Tide Table is out. Reload the page.",
  delisted: "SEC's list shows no listing for {name} since {date}. Your order stays as you set it.",
  next: "Next: set my split",
  notSaved: "Not saved yet",
});

/** "44 companies in 14 fields on Tue 27 Oct 2026: …" (Appendix C, friends). */
function coverageWords(v) {
  const c = (app.data && app.data.index && app.data.index.coverage) || {};
  const bl = c.byLabel || {};
  const n = (bl.y5 || 0) + (bl.y4ttm || 0);
  const na = bl.na || 0;
  const more = na > 0 ? ` ${FU.intWords(na)} more ${na === 1 ? "is" : "are"} listed with no open profit history.` : "";
  return `${FU.intWords(n)} companies in 14 fields on ${v.date}: ${v.a} with 5 fiscal years checked and ${v.b} with 4 fiscal years `
    + `and the latest 12 months checked, from yearly reports filed with the US SEC and Europe's ESEF filings.${more}`;
}

/** The upcoming listings of the public set (upcoming-api.md 4): data/upcoming.json when index.json names it. */
async function loadUpcoming() {
  if (typeof D.loadUpcoming === "function") return D.loadUpcoming();
  const st = await D.loadIndex();
  if (!st || st.status !== "ok") return null;
  const name = st.index && st.index.files ? st.index.files.upcoming : null;
  if (name !== "upcoming.json") return null;
  const v = new URL(import.meta.url).search;
  const res = await fetch("data/upcoming.json" + v, { cache: "no-cache" });
  if (!res.ok) return null;
  const doc = await res.json();
  return FU.isUpcomingDoc(doc) && doc.licence === "open" ? doc : null;
}

let upcomingMemo = null;
/** The upcoming listings once per page load (null when there are none); a failure is tried again next time. */
export function upcomingDoc() {
  if (!upcomingMemo) upcomingMemo = loadUpcoming().catch((e) => { console.warn("upcoming.json did not load", e); return null; })
    .then((d) => { if (!d) upcomingMemo = null; app.upcoming = d; return d; });
  return upcomingMemo;
}

let checkedAsked = false;
/**
 * When the open data last checked an upcoming listing on the friend's list, in words ("Checked by hand on Tue
 * 27 Oct 2026."), so a line that says it is not trading yet always carries its date (upcoming-api.md 4: with SEC
 * skipped, the status stays as curated). "" while the listings are not read yet (they are asked for once, and
 * the views that show this draw again), and when the data has no date for it.
 */
export function upcomingChecked(id) {
  const doc = app.upcoming;
  if (!doc) {
    if (!checkedAsked && universeOn()) {
      checkedAsked = true;
      upcomingDoc().then((d) => { if (d) hooks.invalidate("data"); }, () => {});
    }
    return "";
  }
  const e = (Array.isArray(doc.entries) ? doc.entries : []).find((x) => x && x.id === id);
  return e ? FU.upcomingCheckedWords(e) : "";
}

const say = (msg) => { try { ui.announce(msg); } catch { /* no live region */ } };

/** Point fieldsui at the friends' words, actions and data (main.js calls it once). */
export function configureFieldsUi() {
  FU.configure({
    labels: { fieldsTitle: "Choose your fields", fieldsLede: "Choose the fields you want in your months, then tick companies in each one. Their part of each month is split equally between the companies you tick." },
    notes: {
      coverage: coverageWords, sorting: WORDS.sorting, notSorted: WORDS.notSortedN, notCovered: WORDS.notCovered,
      stale: WORDS.stale, newer: WORDS.newer, delisted: WORDS.delisted,
    },
    prefs: { orderKey: "ttm:list-order" },
    upcoming: upcomingDoc,
    actions: {
      field: {
        tile: { off: "Choose", on: "Chosen" },
        page: { off: "Choose {name}", on: "{name} is in my fields", hintOn: "Press again to take {name} out of your fields." },
        isOn: (f) => draft.isChosen(f),
        onChange: (f, on) => {
          draft.setField(f, on);
          say(on ? WORDS.fieldAdded(fieldName(f)) : `${fieldName(f)} is out of your fields.`);
          return true;
        },
      },
      company: {
        off: "Add to my list", on: "On my list",
        hintOff: (info) => (pending(info) ? WORDS.tickHint : null),
        hintOn: (info) => (pending(info) ? WORDS.tickHint : null),
        isOn: (id, info) => draft.isListed(info && info.fieldId, id),
        canAdd: (info) => !!info && info.addable === true && (!!info.fieldId || (Array.isArray(info.fields) && info.fields.length > 0)),
        // An upcoming listing that withdrew its filing: its row and page already say so ("It withdrew its filing
        // with the US SEC on …", upcoming-api.md 9), and that is why it cannot go on a list, so no other reason is
        // given. A company already on the list keeps "On my list" (fieldsui's "keep"), and this line is its hint
        // once it is taken off.
        notAddable: (info) => (info && info.upcoming && info.upcoming.status === "withdrawn" ? null
          : info && info.addable === true ? WORDS.notSorted : info && info.venue === "TXSE" ? WORDS.notAddableTxse : WORDS.notAddable),
        perField: true,
        onChange: (info, on) => {
          const r = draft.setCompany(info, on);
          if (!r.ok) { toast(r.refused, "alert", 5000); return false; }
          if (r.fieldAdded) { syncFieldToggle(info.fieldId); say(WORDS.fieldAdded(fieldName(info.fieldId))); }
          return true;
        },
      },
      open: (fieldId, companyId) => {
        const hash = companyId ? FU.companyHref(companyId, fieldId) : FU.fieldHref(fieldId);
        try { history.replaceState(history.state, "", hash); } catch { /* old browsers */ }
        app.routeKey = hash.replace(/^#\//, "");
      },
    },
  });
}

/** An upcoming listing that does not trade yet: ticking it counts only from the first month after its first day. */
const pending = (info) => !!(info && info.upcoming && info.upcoming.status !== "listed");

/** A field chosen by adding a company: the field page's toggle (built by fieldsui) shows it at once. */
function syncFieldToggle(f) {
  const b = document.getElementById(`fu-toggle-${f}`);
  const t = b && b.closest('[data-bk="toggle-words"]');
  if (t && t.bk && typeof t.bk.set === "function") t.bk.set(true);
  const tile = document.querySelector(`[data-bk="field-tile"][data-field="${f}"]`);
  if (tile && tile.bk && typeof tile.bk.set === "function") tile.bk.set(true);
}

/** "3 fields chosen" (spec 8.2, brief 4.8.2). */
export function chosenWords(n = draft.chosen().length) {
  return n === 0 ? "No field chosen yet" : n === 1 ? "1 field chosen" : `${n} fields chosen`;
}

/** The dock of Fields and a company page: "N fields chosen", "Not saved yet", and Next: set my split. */
export function fieldsDock() {
  const btn = book.button({ label: WORDS.next, href: "#/split" });
  btn.setAttribute("data-fk", "next-split");
  const d = book.dock({ summary: chosenWords(), note: draft.isDirty() ? WORDS.notSaved : null, button: btn });
  const off = draft.onDraft(() => d.bk.update({ summary: chosenWords(), note: draft.isDirty() ? WORDS.notSaved : null }));
  onCleanup(off);
  return d;
}

export function renderFields() {
  return [h("div.ttm-fu", FU.fieldsPage({ headingId: "h-fields" })), fieldsDock()];
}
