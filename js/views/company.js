// A company on its own (spec 8.2): the shared company page of fieldsui.js (#/company/<id>, from search), with
// Add to my list under each of its fields, or the not-addable line; an upcoming listing (upcoming-api.md 7)
// shows its two chips, the reported timing and both sides. The dock is the same as on Fields.

import { app, h } from "../core.js?v=2.0.0";
import * as FU from "../fieldsui.js?v=2.0.0";
import { fieldsDock } from "./fields.js?v=2.0.0";

export function renderCompany() {
  const r = app.route || {};
  return [h("div.ttm-fu", FU.companyPage(r.company, { headingId: "h-company" })), fieldsDock()];
}
