// The friend's unsaved choices on Fields, a field's page and My split (spec 8.5): the fields they chose, the
// companies they ticked in each, their split, and the names of those companies. They live in this tab's
// sessionStorage ("ttm:fields-draft") until Save my split commits them through core.commitPlanChange
// (months.setFieldsFrom). Nothing here leaves the browser, and none of it goes into a URL.

import { app, S, M, commitPlanChange, today, savedFields } from "../core.js?v=2.1.0";
import { nameSnapshot, fieldOrder, fieldsProblem, explainFieldsProblem, MAX_FIELD_COMPANIES, MAX_COMPANIES } from "../split.js?v=2.1.0";
import { fieldName } from "../fields-catalog.js?v=2.1.0";
import { isLockedListing, lockedInPlanWords } from "./naming.js?v=2.1.0";

const KEY = "ttm:fields-draft";
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const listeners = new Set();
let cur = null;

/**
 * The locked listing (addendum B.1) is in every plan at 10% of each month, so it is never a field pick: a draft never
 * holds it. A saved record that still lists it (a state made before 2.1's lock) shows "Not saved yet", and the next
 * Save my split leaves it out (review finding reg-lock-tickable-in-field).
 */
const lockedIn = (id, names) => isLockedListing(id) || isLockedListing(isObj(names) ? names[id] : null);
const dropLocked = (ids, names) => (Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && !lockedIn(id, names)) : []);

/** The saved fields as a draft starts from them: { chosen, split, lists, names } (raw: the saved lists as they are,
 *  for "Not saved yet"; else without the locked listing). */
function fromSaved({ raw = false } = {}) {
  const f = savedFields();
  const names = f && isObj(f.names) ? structuredClone(f.names) : {};
  if (!f || !f.from || !Array.isArray(f.chosen) || !f.chosen.length) return { chosen: [], split: null, lists: {}, names };
  const lists = {};
  for (const x of f.chosen) {
    const ids = Array.isArray(f.lists && f.lists[x]) ? [...f.lists[x]] : [];
    lists[x] = raw ? ids : dropLocked(ids, names);
  }
  return { chosen: fieldOrder(f.chosen), split: Number.isInteger(f.split) ? f.split : null, lists, names };
}

/** A text that says what a saved record holds, so a draft made before another save is not taken as current. */
const savedSig = () => JSON.stringify(savedFields() || null);

/** The spec the saved record and a draft are compared by: chosen fields, the split and the chosen fields' lists. */
function core(d) {
  const chosen = fieldOrder(d.chosen || []);
  return JSON.stringify([chosen, d.split ?? null, chosen.map((f) => [...new Set((d.lists || {})[f] || [])].sort())]);
}

function readStored() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!isObj(d) || d.sig !== savedSig() || !Array.isArray(d.chosen) || !isObj(d.lists) || !isObj(d.names)) return null;
    if (d.split != null && !(Number.isInteger(d.split) && d.split >= 0 && d.split <= 1000)) return null;
    const lists = Object.fromEntries(Object.entries(d.lists).map(([f, ids]) => [f, dropLocked(ids, d.names)]));
    return { chosen: d.chosen.filter((x) => typeof x === "string"), split: d.split ?? null, lists, names: d.names };
  } catch {
    return null;
  }
}

function write() {
  try {
    if (core(cur) === core(fromSaved({ raw: true }))) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify({ sig: savedSig(), ...cur }));
  } catch { /* storage blocked: the draft lives in this page only */ }
}

function changed() {
  write();
  for (const fn of listeners) { try { fn(cur); } catch (e) { console.warn(e); } }
}

/** The current draft (read it only). */
export function draft() {
  if (!cur) cur = readStored() || fromSaved();
  return cur;
}

/** Start again from what is saved (after a save, a load or Start over). */
export function resetDraft() {
  cur = fromSaved();
  try { sessionStorage.removeItem(KEY); } catch { /* blocked */ }
  for (const fn of listeners) { try { fn(cur); } catch (e) { console.warn(e); } }
}

/** fn(draft) after every change; returns an unsubscribe function. */
export function onDraft(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** True while the draft differs from what is saved: the dock says "Not saved yet". */
export const isDirty = () => core(draft()) !== core(fromSaved({ raw: true }));
/** True once the friend has saved a split with fields. */
export const hasSaved = () => fromSaved().chosen.length > 0;

export const isChosen = (f) => draft().chosen.includes(f);
export const listOf = (f) => (draft().lists[f] || []).slice();
export const isListed = (f, id) => !!f && listOf(f).includes(id);
/** The chosen fields in catalogue order. */
export const chosen = () => fieldOrder(draft().chosen);
/** Every company on the chosen fields' lists, once. */
export const listedIds = () => [...new Set(chosen().flatMap((f) => listOf(f)))];
export const nameOf = (id) => (isObj(draft().names[id]) ? draft().names[id] : null);
export const split = () => draft().split;

/** Choose a field, or take it out (its list is kept in the draft, so choosing it again brings it back). */
export function setField(f, on) {
  const d = draft();
  const has = d.chosen.includes(f);
  if (on && !has) d.chosen = fieldOrder([...d.chosen, f]);
  else if (!on && has) d.chosen = d.chosen.filter((x) => x !== f);
  else return;
  changed();
}

/**
 * Tick a company in a field's list, or take it off. info is fieldsui's company info (with w for an upcoming
 * listing). Returns { ok, fieldAdded, refused } : refused is a plain sentence when a list is full.
 */
export function setCompany(info, on) {
  const d = draft();
  const f = info && info.fieldId;
  if (!f || !info.id) return { ok: false, refused: "Open a field to add this company to its list." };
  const list = d.lists[f] || [];
  if (!on) {
    d.lists[f] = list.filter((x) => x !== info.id);
    changed();
    return { ok: true };
  }
  if (list.includes(info.id)) return { ok: true };
  if (lockedIn(info.id, d.names) || isLockedListing(info)) return { ok: false, refused: lockedInPlanWords() };
  if (list.length >= MAX_FIELD_COMPANIES) return { ok: false, refused: explainFieldsProblem({ code: "field_cap", field: f }, fieldName) };
  const total = new Set(Object.entries(d.lists).filter(([x]) => d.chosen.includes(x) || x === f).flatMap(([, ids]) => ids));
  if (!total.has(info.id) && total.size >= MAX_COMPANIES) return { ok: false, refused: explainFieldsProblem({ code: "total_cap" }, fieldName) };
  d.lists[f] = [...list, info.id];
  d.names[info.id] = nameSnapshot(info);
  let fieldAdded = false;
  if (!d.chosen.includes(f)) { d.chosen = fieldOrder([...d.chosen, f]); fieldAdded = true; }
  changed();
  return { ok: true, fieldAdded };
}

/** The split strip's value (tenths, 0 to 1000), or null while it is unset. */
export function setSplit(v) {
  const d = draft();
  const n = v == null ? null : Math.max(0, Math.min(1000, Math.round(v)));
  if (d.split === n) return;
  d.split = n;
  changed();
}

/** What Save my split sends: { chosen, split, lists (the chosen fields' only), names (the ones listed) }. */
export function specOfDraft() {
  const d = draft();
  const ch = chosen();
  const lists = Object.fromEntries(ch.map((f) => [f, [...new Set(d.lists[f] || [])]]));
  const names = {};
  for (const id of new Set(Object.values(lists).flat())) if (isObj(d.names[id])) names[id] = d.names[id];
  return { chosen: ch, split: d.split, lists, names };
}

/** The first problem with saving the draft, as a plain sentence, or "" when it can be saved. */
export function draftProblem() {
  const spec = specOfDraft();
  const saved = savedFields();
  const names = { ...(saved && isObj(saved.names) ? saved.names : {}), ...spec.names };
  return explainFieldsProblem(fieldsProblem(spec, { names }), fieldName);
}

/** The month Save my split starts from: the first open month whose order date is today or later. */
export const saveFrom = () => (app.base && S().plan ? M.defaultFrom(app.base, S(), today()) : null);

/**
 * Save the draft from saveFrom() on (months.setFieldsFrom through core.commitPlanChange). Returns the month id it
 * starts from; throws a plain-sentence Error (or what commitPlanChange throws) and saves nothing on a refusal.
 */
export function saveDraft() {
  const plain = (msg) => Object.assign(new Error(msg), { plain: true });
  const problem = draftProblem();
  if (problem) throw plain(problem);
  const fromId = saveFrom();
  if (!fromId) throw plain("Every month of your plan has records, so your fields cannot change.");
  const fields = specOfDraft();
  commitPlanChange((d) => M.setFieldsFrom(d, app.base, { fromId, fields }));
  resetDraft();
  return fromId;
}
