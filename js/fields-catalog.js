// The 14 fields of Tide Table 2.0 (spec 6.1), shared by both apps. Pure data, no side effects at import.
//
// The table between the two comment markers below is strict JSON. The pipeline's own copy of this table
// (pipeline/fields.py) is checked against it id for id and name for name, so a change here needs the same change
// there. Keys of each entry: id, name (the plain name on the tile), also (the usual sector name, or for a close-up
// the field it sits inside), kind ("sector" or "close-up"), picture (what its spot picture shows).
//
// Order on screen: the 11 big fields A to Z by plain name, then the close-ups A to Z (brief 4.10). Fields follow
// the usual sector names; Tide Table never calls them by the licensed taxonomy's own name (spec 6.6).

export const CATALOG = Object.freeze(/* catalog:begin */ [
  {"id": "financials", "name": "Banks and insurance", "also": "Financials", "kind": "sector", "picture": "piggy bank and coin"},
  {"id": "energy", "name": "Energy", "also": "Energy", "kind": "sector", "picture": "flame"},
  {"id": "staples", "name": "Everyday needs", "also": "Consumer Staples", "kind": "sector", "picture": "bowl of rice"},
  {"id": "health", "name": "Health care", "also": "Health Care", "kind": "sector", "picture": "doctor's bag"},
  {"id": "realestate", "name": "Homes and buildings", "also": "Real Estate", "kind": "sector", "picture": "house on stilts"},
  {"id": "industrials", "name": "Industry and transport", "also": "Industrials", "kind": "sector", "picture": "two gears"},
  {"id": "materials", "name": "Materials", "also": "Materials", "kind": "sector", "picture": "stones and pickaxe"},
  {"id": "communication", "name": "Media and communication", "also": "Communication Services", "kind": "sector", "picture": "speech bubbles"},
  {"id": "utilities", "name": "Power and water", "also": "Utilities", "kind": "sector", "picture": "bulb and drop"},
  {"id": "discretionary", "name": "Spending and leisure", "also": "Consumer Discretionary", "kind": "sector", "picture": "kite"},
  {"id": "technology", "name": "Technology", "also": "Information Technology", "kind": "sector", "picture": "computer screen"},
  {"id": "cars", "name": "Cars", "also": "close-up inside Spending and leisure", "kind": "close-up", "picture": "red car"},
  {"id": "retail", "name": "Retail", "also": "close-up inside Spending and leisure, and Everyday needs", "kind": "close-up", "picture": "shop with awning"},
  {"id": "telecom", "name": "Telecom", "also": "close-up inside Media and communication", "kind": "close-up", "picture": "radio mast"}
] /* catalog:end */.map((f) => Object.freeze(f)));

/** A field id has this shape (spec 6.1); only the 14 ids above are fields. */
export const FIELD_ID_RE = /^[a-z]{3,16}$/;

/** The field ids in screen order. */
export const FIELD_IDS = Object.freeze(CATALOG.map((f) => f.id));

/** The 11 big fields and the 3 close-ups, each in screen order. */
export const SECTORS = Object.freeze(CATALOG.filter((f) => f.kind === "sector"));
export const CLOSEUPS = Object.freeze(CATALOG.filter((f) => f.kind === "close-up"));

/** The big fields a close-up sits inside (a close-up company stays in its big field too, spec 6.1). */
export const INSIDE_OF = Object.freeze({
  cars: Object.freeze(["discretionary"]),
  retail: Object.freeze(["discretionary", "staples"]),
  telecom: Object.freeze(["communication"]),
});

/** One line of what is inside each field, for its tile (brief 4.8). */
export const INSIDE = Object.freeze({
  financials: "Banks, insurers and payments",
  energy: "Oil, gas and coal",
  staples: "Food, drinks and things for the home",
  health: "Medicines, hospitals and care",
  realestate: "Property and land",
  industrials: "Machines, transport and building work",
  materials: "Metals, chemicals and paper",
  communication: "TV, games, apps and phone networks",
  utilities: "Electricity, gas and water supply",
  discretionary: "Cars, clothes, travel and fun",
  technology: "Computers, chips and software",
  cars: "Car makers, parts and dealers",
  retail: "Shops and online stores",
  telecom: "Phone and internet networks",
});

/** The blot wash behind each field's picture (brief 4.10). */
export const WASH = Object.freeze({
  financials: "marigold", energy: "lilac", staples: "meadow", health: "rose", realestate: "marigold",
  industrials: "sky", materials: "sand", communication: "rose", utilities: "meadow", discretionary: "sky",
  technology: "lilac", cars: "sky", retail: "meadow", telecom: "lilac",
});

const BY_ID = new Map(CATALOG.map((f) => [f.id, f]));

/** True for one of the 14 field ids. */
export function isFieldId(id) {
  return typeof id === "string" && FIELD_ID_RE.test(id) && BY_ID.has(id);
}

/** The catalogue entry for a field id, or null. */
export function fieldById(id) {
  return (typeof id === "string" && BY_ID.get(id)) || null;
}

/** The plain name of a field; an id the catalogue does not know reads "this field" (spec 8.5). */
export function fieldName(id) {
  const f = fieldById(id);
  return f ? f.name : "this field";
}

/**
 * The words under a field's title: "Also called: Consumer Discretionary" for a big field whose usual name differs
 * from its plain name, "A close-up inside Spending and leisure" for a close-up, and null when the two names are the
 * same (Energy, Materials).
 */
export function alsoWords(id) {
  const f = fieldById(id);
  if (!f) return null;
  if (f.kind === "close-up") {
    const parents = (INSIDE_OF[f.id] || []).map((p) => fieldName(p));
    return parents.length ? `A close-up inside ${joinAnd(parents)}` : null;
  }
  return f.also && f.also !== f.name ? `Also called: ${f.also}` : null;
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(items) {
  const xs = items.filter((x) => x != null && x !== "");
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/**
 * Fields whose plain name or usual sector name contains the words typed (case and accents ignored), in screen
 * order. Every word typed must appear (spec: search matches plain and also-called names).
 */
export function matchFields(query) {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return CATALOG.filter((f) => {
    const hay = foldText(`${f.name} ${f.kind === "sector" ? f.also : ""}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Lower case, accents removed, so "Societe" finds "Société". */
export function foldText(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
