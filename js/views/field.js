// A field (spec 8.2, brief 4.8.3): the shared field page of fieldsui.js (#/field/<id>, and #/field/<id>/<company>
// with that company open in place). Its Choose toggle is the page's one main button; under the page, a quiet way
// on to My split. The words and actions are configured in views/fields.js.

import { app, h } from "../core.js?v=2.2.0";
import * as book from "../book.js?v=2.2.0";
import * as FU from "../fieldsui.js?v=2.2.0";
import { WORDS } from "./fields.js?v=2.2.0";

export function renderField() {
  const r = app.route || {};
  const page = FU.fieldPage(r.field, { company: r.company || null, headingId: "h-field" });
  const next = book.quietButton({ label: WORDS.next, href: "#/split" });
  next.setAttribute("data-fk", "field-next");
  return [h("div.ttm-fu", page), h("div.bk-section.ttm-next", next)];
}
