/**
 * Heuristic parser for police/administrative order notices (e.g. Section 163 BNSS orders).
 *
 * It only PROPOSES: every field carries the text it was read from, anything it cannot find stays null and is listed
 * in `missing` (UNKNOWN stays UNKNOWN), and nothing here can create or activate a restriction. A human reviews each candidate.
 * Dates are read at day level (times of day are not interpreted).
 * It was written against order wording seen in public reporting, not against the live feed's real markup (that feed was
 * unreachable from the build sandbox): treat the first real-world runs as calibration.
 */
export interface Field<T> { value: T | null; evidence: string | null }

export type OrderEffect = "PROHIBITED" | "RESTRICTED";
export interface ParsedOrder {
  issuingAuthority: Field<string>;
  orderNumber: Field<string>;
  orderDate: Field<string>; // YYYY-MM-DD
  legalBasis: Field<string>;
  geographicScope: Field<string>;
  effectiveFrom: Field<string>; // YYYY-MM-DD
  effectiveTo: Field<string>; // YYYY-MM-DD
  /** Engine activity tags: ASSEMBLY, MARCH, SOUND, STAGE, VEHICLES */
  activities: Field<string[]>;
  effect: Field<OrderEffect>;
  missing: string[];
  completeness: "COMPLETE" | "PARTIAL" | "MINIMAL";
  summary: string;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);

const NUMERIC = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g;
const DMY_TEXT = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+(\d{4})\b/gi;
const MDY_TEXT = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi;

export interface FoundDate { iso: string; index: number; end: number }
export function findDates(text: string): FoundDate[] {
  const out: FoundDate[] = [];
  for (const m of text.matchAll(NUMERIC)) { const v = iso(+m[3], +m[2], +m[1]); if (v) out.push({ iso: v, index: m.index!, end: m.index! + m[0].length }); }
  for (const m of text.matchAll(DMY_TEXT)) { const v = iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]); if (v) out.push({ iso: v, index: m.index!, end: m.index! + m[0].length }); }
  for (const m of text.matchAll(MDY_TEXT)) { const v = iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]); if (v) out.push({ iso: v, index: m.index!, end: m.index! + m[0].length }); }
  return out.sort((a, b) => a.index - b.index);
}

const snip = (text: string, from: number, to: number) => text.slice(Math.max(0, from), Math.min(text.length, to)).replace(/\s+/g, " ").trim().slice(0, 220);
const none = <T>(): Field<T> => ({ value: null, evidence: null });

const ACTIVITY_PATTERNS: [string, RegExp][] = [
  ["ASSEMBLY", /assembl(?:y|ies)|public meeting|dharna|demonstration|sit-?in|gathering|protest/i],
  ["MARCH", /procession|\bmarch(?:es)?\b|\brall(?:y|ies)\b|morcha/i],
  ["SOUND", /loud\s?speaker|public address|\bPA system|amplif|sound system/i],
  ["STAGE", /\bstage\b|\btents?\b|shamiana|pandal/i],
  ["VEHICLES", /\bvehicles?\b|\bbuses\b|\btractors?\b|\btrolleys?\b/i],
];
const DESIGNATION = /(Special Commissioner of Police|Joint Commissioner of Police|Additional Commissioner of Police|Deputy Commissioner of Police|Assistant Commissioner of Police|Commissioner of Police|Police Commissioner|\bDCP\b|\bACP\b|Addl\.?\s*CP)/i;
const LEGAL = /\b(?:section|sec\.?|s\.)\s*(\d+[A-Za-z]?(?:\(\d+\))?)\s*(?:of\s+)?(?:the\s+)?(BNSS|Bharatiya Nagarik Suraksha Sanhita(?:,?\s*2023)?|BNS|Bharatiya Nyaya Sanhita(?:,?\s*2023)?|Cr\.?P\.?C\.?|Code of Criminal Procedure(?:,?\s*1973)?|Delhi Police Act(?:,?\s*1978)?)/i;

export function looksLikeOrder(block: string): boolean {
  return /section\s*163|BNSS|prohibitory|hereby (?:prohibit|order)|it is (?:hereby )?ordered|prohibited/i.test(block) && (DESIGNATION.test(block) || ACTIVITY_PATTERNS.some(([, r]) => r.test(block)));
}

/** Splits a pasted page or a diff of added lines into candidate order blocks. */
export function splitOrders(text: string): string[] {
  const blocks: string[][] = [[]];
  for (const line of text.split(/\r?\n/)) {
    const startsNew = /^\s*(?:ORDER\b|NOTIFICATION\b|OFFICE OF THE\b)/.test(line) && blocks[blocks.length - 1].join(" ").trim().length > 80;
    if (startsNew) blocks.push([]);
    blocks[blocks.length - 1].push(line);
  }
  return blocks.map((b) => b.join("\n").trim()).filter((b) => b.length >= 60 && looksLikeOrder(b)).slice(0, 20);
}

export function parseOrder(block: string): ParsedOrder {
  const text = block;
  const dates = findDates(text);

  // order date: a date right after a label
  let orderDate = none<string>();
  for (const label of text.matchAll(/(?:dated?|date of order|order date|issued on)\s*[:\-]?\s*/gi)) {
    const at = label.index! + label[0].length;
    const d = dates.find((x) => x.index >= at && x.index - at <= 12);
    if (d) { orderDate = { value: d.iso, evidence: snip(text, label.index!, d.end + 4) }; break; }
  }

  // effective range: "from <date> ... to/till <date>"
  let effectiveFrom = none<string>();
  let effectiveTo = none<string>();
  const START_CTX = /(?:from|w\.e\.f\.?|effective(?:\s+from)?|with effect from)\W*(?:\d{3,4}\s*hrs?\W*(?:on\W*)?)?$/i;
  const END_CTX = /(?:till|until|up\s*to|upto|\bto|through)\W*(?:\d{3,4}\s*hrs?\W*(?:on\W*)?)?$/i;
  for (const d of dates) {
    const before = text.slice(Math.max(0, d.index - 45), d.index);
    if (!effectiveFrom.value && START_CTX.test(before)) effectiveFrom = { value: d.iso, evidence: snip(text, d.index - 40, d.end + 4) };
    else if (!effectiveTo.value && END_CTX.test(before) && (!effectiveFrom.value || d.iso >= effectiveFrom.value)) effectiveTo = { value: d.iso, evidence: snip(text, d.index - 40, d.end + 4) };
  }

  const lb = text.match(LEGAL);
  const basisName = (n: string) => (/^(BNSS|Bharatiya Nagarik)/i.test(n) ? "BNSS" : /^(BNS|Bharatiya Nyaya)/i.test(n) ? "BNS" : /^Cr/i.test(n) || /Criminal Procedure/i.test(n) ? "CrPC" : "Delhi Police Act, 1978");
  const legalBasis: Field<string> = lb ? { value: `Section ${lb[1]} ${basisName(lb[2])}`, evidence: snip(text, lb.index!, lb.index! + lb[0].length + 10) } : none();

  // Issuer: prefer a short signature-style line ("Commissioner of Police, Delhi"); otherwise the designation inside a longer sentence.
  let issuingAuthority = none<string>();
  const WHO = new RegExp(`(${DESIGNATION.source})(?:\\s*,?\\s*(Delhi|[A-Z][A-Za-z]+(?:\\s+[A-Z][A-Za-z]+){0,2}\\s+District))?`, "i");
  const lines = text.split(/\r?\n/).filter((l) => DESIGNATION.test(l) && !/^\s*(?:copy|forwarded|to\b)/i.test(l));
  const pick = lines.find((l) => l.trim().length <= 90) ?? lines[0];
  if (pick) {
    const m = pick.match(WHO);
    if (m) issuingAuthority = { value: m[0].replace(/^\s*office of the\s*/i, "").replace(/\s+/g, " ").trim(), evidence: pick.trim().slice(0, 200) };
  }

  let geographicScope = none<string>();
  const sc = text.match(/(?:within|in|over|throughout|across)\s+(?:the\s+)?(?:entire\s+|whole\s+)?(?:jurisdiction|limits|area|territory|territorial\s+limits)\s+of\s+([^.;\n]{3,200})/i);
  if (sc) {
    const cut = sc[1].split(/\s*,?\s+(?:from|w\.e\.f|with effect|effective|till|until|upto|up to|for a period|during|with immediate|and\s+\d)\b/i)[0].replace(/[\s,]+$/, "").trim();
    if (cut.length >= 3) geographicScope = { value: cut.replace(/\s+/g, " "), evidence: snip(text, sc.index!, sc.index! + sc[0].length) };
  }
  if (!geographicScope.value) {
    const names = [...new Set([...text.matchAll(/([A-Z][A-Za-z.\-]*(?:\s+[A-Z][A-Za-z.\-]*){0,3}\s+(?:District|Sub[- ]?Division|Police Station|Range|Zone))/g)].map((m) => m[1].trim()))];
    if (names.length) geographicScope = { value: names.join(", "), evidence: names.join(", ") };
  }

  const tags: string[] = [];
  let actEvidence: string | null = null;
  for (const [tag, re] of ACTIVITY_PATTERNS) { const m = text.match(re); if (m) { tags.push(tag); actEvidence ??= snip(text, m.index! - 40, m.index! + 100); } }
  const activities: Field<string[]> = tags.length ? { value: tags, evidence: actEvidence } : none();

  let effect = none<OrderEffect>();
  const pm = text.match(/prohibit|\bban(?:ned|s)?\b|not\s+(?:be\s+)?permitted|forbid|restrained/i);
  if (pm) effect = { value: "PROHIBITED", evidence: snip(text, pm.index! - 30, pm.index! + 60) };
  else { const rm = text.match(/regulat|restrict|subject to|permission/i); if (rm) effect = { value: "RESTRICTED", evidence: snip(text, rm.index! - 30, rm.index! + 60) }; }

  const on = text.match(/(?:order\s+no\.?|no\.|f\.\s*no\.?)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\/\-.()]{3,40})/i);
  const orderNumber: Field<string> = on ? { value: on[1].replace(/[.,;]$/, ""), evidence: snip(text, on.index!, on.index! + on[0].length) } : none();

  const checks: [string, Field<unknown>][] = [["issuing authority", issuingAuthority], ["order date", orderDate], ["legal basis", legalBasis], ["geographic scope", geographicScope], ["effective start", effectiveFrom], ["effective end", effectiveTo], ["prohibited/restricted activities", activities]];
  const missing = checks.filter(([, f]) => f.value === null).map(([n]) => n);
  const completeness = missing.length === 0 ? "COMPLETE" : missing.length <= 3 ? "PARTIAL" : "MINIMAL";
  const summary = `${issuingAuthority.value ?? "Unknown issuer"}: ${effect.value ? effect.value.toLowerCase() : "restricts"} ${tags.length ? tags.join("/").toLowerCase() : "unspecified activities"}${geographicScope.value ? ` in ${geographicScope.value}` : ""}${effectiveFrom.value ? ` from ${effectiveFrom.value}` : ""}${effectiveTo.value ? ` to ${effectiveTo.value}` : ""}. Automatic reading, not a legal finding.`;
  return { issuingAuthority, orderNumber, orderDate, legalBasis, geographicScope, effectiveFrom, effectiveTo, activities, effect, missing, completeness, summary };
}
