// A company on its own (spec 8.2): the shared company page of fieldsui.js (#/company/<id>, from search), with
// Add to my list under each of its fields, or the not-addable line; an upcoming listing (upcoming-api.md 7)
// shows its two chips, the reported timing and both sides. The dock is the same as on Fields.
//
// The locked listing's own page (addendum B.6) also says, in one plain line under the page, that this friend's plan
// holds it at 10% of each month and where this month's 10% goes, with the "as written" line: no chips (the page
// shows them already) and no heading of its own.

import { app, h, schedule, autoDeskDate } from "../core.js?v=2.1.0";
import * as FU from "../fieldsui.js?v=2.1.0";
import * as book from "../book.js?v=2.1.0";
import { fieldsDock } from "./fields.js?v=2.1.0";
import { isLockedListing, lockNow, lockMonthLine, lockShareWords } from "./naming.js?v=2.1.0";
import * as LK from "../lock.js?v=2.1.0";

/** The month the line speaks of: the order date the desk opens on (the next one with open orders), else the last. */
function focusDate() {
  const sch = schedule();
  return autoDeskDate(sch) || sch.dates[sch.dates.length - 1] || null;
}

/** "10% of each month is locked in this plan for Anthropic." and this month's line (or the "as written" line). */
export function lockLine(companyId) {
  if (!lockNow() || !isLockedListing(companyId)) return null;
  const d = focusDate();
  const month = d ? lockMonthLine(app.plan, d.id, { fk: "company-lock-month", asWritten: true, cls: "span" }) : null;
  return book.note([lockShareWords(), " ", month || LK.LOCK_COPY.asWritten], { id: "company-lock" });
}

export function renderCompany() {
  const r = app.route || {};
  const line = lockLine(r.company);
  if (line) line.setAttribute("data-fk", "company-lock");
  return [h("div.ttm-fu", FU.companyPage(r.company, { headingId: "h-company" }), line), fieldsDock()];
}
