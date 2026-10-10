// Pure tests for v1.0: provenance, public wording, toolkit safety, analytics dimensions, and a copy audit of the whole UI.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { provenanceLabel, shortDate } from "@/lib/engine/provenance";
import { CATEGORIES, MODERATION_REASONS, PUBLIC_PERMISSION_LABEL, screenPublicText, slugify, toPublicPermission } from "@/lib/engine/public-protest";
import { PERMISSION_STATUSES } from "@/lib/engine/permission";
import { READINESS_LABEL } from "@/lib/engine/event-readiness";
import { buildToolkit, toolkitViolations, type ToolkitInput } from "@/lib/engine/toolkit";
import { sanitizeProps } from "@/lib/store";

describe("provenance labels", () => {
  it("an organizer's status says 'Reported by organizer' with its date, never BookMyProtest-verified", () => {
    const l = provenanceLabel({ cls: "ORGANIZER_PROVIDED", reported: true, asOf: "2026-10-12" });
    expect(l).toBe("Reported by organizer · updated 12 Oct");
    expect(l).not.toMatch(/verified|checked|official/i);
  });
  it("organizer descriptions say 'Provided by organizer'", () => expect(provenanceLabel({ cls: "ORGANIZER_PROVIDED", asOf: "2026-10-12" })).toBe("Provided by organizer · updated 12 Oct"));
  it("a calculated date says what it was calculated from", () => {
    expect(provenanceLabel({ cls: "SYSTEM_DERIVED", source: { title: "Delhi Police Standing Order L&O/48/2022", section: "Section 3(i), PDF page 3" } })).toBe("Calculated from Delhi Police Standing Order L&O/48/2022, Section 3(i), PDF page 3");
  });
  it("source-checked information carries the date it was checked and the source", () => {
    expect(provenanceLabel({ cls: "BOOKMYPROTEST_SOURCE_CHECKED", asOf: "2026-10-01", source: { title: "Standing Order" } })).toBe("Official information checked on 1 Oct · Standing Order");
  });
  it("a link is a link, and an unknown origin is stated", () => {
    expect(provenanceLabel({ cls: "OFFICIAL_SOURCE_LINK", source: { title: "Standing Order" } })).toBe("Link to official source · Standing Order");
    expect(provenanceLabel({ cls: "UNKNOWN" })).toBe("Source not stated");
  });
  it("short dates", () => { expect(shortDate("2026-12-03")).toBe("3 Dec"); expect(shortDate(null)).toBe(""); });
});

describe("public permission wording", () => {
  it("every internal status maps to a public one; every public label says 'reported by organizer' except 'Status not provided'", () => {
    for (const s of PERMISSION_STATUSES) expect(PUBLIC_PERMISSION_LABEL[toPublicPermission(s)], s).toBeTruthy();
    for (const [k, v] of Object.entries(PUBLIC_PERMISSION_LABEL)) expect(k === "UNKNOWN" ? v === "Status not provided" : v.endsWith("— reported by organizer"), k).toBe(true);
    expect(PUBLIC_PERMISSION_LABEL.SUBMITTED).toBe("Submitted — reported by organizer");
  });
  it("PREPARED shows as Preparing; EXPIRED is not published as an inference", () => {
    expect(toPublicPermission("PREPARED")).toBe("PREPARING");
    expect(toPublicPermission("EXPIRED")).toBe("UNKNOWN");
  });
  it("no public label claims BookMyProtest approved anything", () => {
    for (const v of Object.values(PUBLIC_PERMISSION_LABEL)) expect(v).not.toMatch(/bookmyprotest|verified|certified|authori[sz]ed by/i);
  });
});

describe("preparation language is never an approval", () => {
  it("readiness states are named as preparation states", () => {
    expect(READINESS_LABEL).toEqual({ READY: "Preparation complete", READY_WITH_WARNINGS: "Preparation complete with warnings", NOT_READY: "Action required", STATUS_UNKNOWN: "Status unknown" });
    for (const v of Object.values(READINESS_LABEL)) expect(v).not.toMatch(/\bready\b|approved|legal/i);
  });
});

describe("public text screening", () => {
  it("rejects email addresses and phone numbers in public text", () => {
    expect(screenPublicText("Summary", "write to asha@example.com")).toMatch(/email/);
    expect(screenPublicText("Summary", "call +91 98100 00000 now")).toMatch(/phone/);
    expect(screenPublicText("Summary", "A peaceful gathering of 500 parents at 10:30 on 31 October")).toBeNull();
  });
  it("slugs are lowercase and safe", () => expect(slugify("Parents for Safe Schools!! / ‘Jantar Mantar’")).toBe("parents-for-safe-schools-jantar-mantar"));
});

describe("moderation reasons and categories are neutral", () => {
  it("only conduct/content reasons exist: nothing about viewpoint, party or ideology", () => {
    expect(Object.keys(MODERATION_REASONS).sort()).toEqual(["DOXXING", "FRAUD", "HARASSMENT", "ILLEGAL_CONTENT", "IMPERSONATION", "OTHER", "SPAM", "VIOLENCE_OR_THREAT"]);
  });
  it("subject areas describe topics, not sides", () => {
    for (const v of Object.values(CATEGORIES)) expect(v).not.toMatch(/\b(left|right[- ]wing|party|religio\w*|caste|ideolog\w*|nationalis\w*|liberal|conservative)\b/i);
  });
});

describe("analytics carry no ideology or identity", () => {
  it("public events keep only whitelisted dimensions", () => {
    const out = sanitizeProps("PUBLIC_PAGE_VIEWED", { city: "Delhi", state: "NCT Delhi", category: "EDUCATION", date: "2026-10-31", organizerType: "group", visibility: "PUBLIC", permissionStatus: "SUBMITTED", supportType: "WATER_HELP", email: "a@b.org", politicalView: "x", userId: "u1", cause: "free text", nested: { a: 1 } });
    expect(Object.keys(out).sort()).toEqual(["category", "city", "date", "organizerType", "permissionStatus", "state", "supportType", "visibility"]);
  });
  it("older events are untouched", () => expect(sanitizeProps("start_plan", { anything: 1 })).toEqual({ anything: 1 }));
});

const input: ToolkitInput = {
  title: "Parents for Safe Schools", summary: "Parents asking the Education Department to fix unsafe school buildings.", city: "New Delhi District", state: "NCT Delhi", venue: "Jantar Mantar",
  dateLabel: "31 October 2026", startTime: "10:30", endTime: "15:30", organizerName: "Parents for Safe Schools group", permissionLine: "Permission status (reported by the organizer): Submitted",
  url: "http://localhost/protests/x-1", officialCheckedOn: "1 October 2026",
  guidance: [{ title: "Banner, flag and stick size limits", text: "Banners and flags up to 9 × 6 feet; sticks no longer than 2 feet.", source: "Delhi Police Standing Order L&O/48/2022" }, { title: "No weapons", text: "No weapons of any kind.", source: "Delhi Police Standing Order L&O/48/2022" }],
};
describe("social toolkit", () => {
  const items = buildToolkit(input);
  it("generates every draft kind, each labelled as generated from organizer-provided information and held logistics", () => {
    expect(items.map((i) => i.key)).toEqual(["instagram", "x_post", "x_thread", "whatsapp", "facebook_linkedin", "blurb", "faq", "know_before", "bring"]);
    for (const it of items) expect(it.note).toContain("Generated from organizer-provided event information and BookMyProtest-held event logistics.");
  });
  it("uses the event's own data", () => {
    const ig = items.find((i) => i.key === "instagram")!.texts[0];
    for (const bit of ["Parents for Safe Schools", "Jantar Mantar", "31 October 2026", "10:30–15:30", "http://localhost/protests/x-1"]) expect(ig).toContain(bit);
  });
  it("the permission status stays the organizer's claim, never a BookMyProtest one", () => {
    const all = items.flatMap((i) => i.texts).join("\n");
    expect(all).toContain("reported by the organizer");
    expect(toolkitViolations(items)).toEqual([]);
    expect(all.replace(/does not [^.]*\./gi, "")).not.toMatch(/verified|endors|certif/i);
  });
  it("never claims approval, verification, endorsement or availability, even if the organizer reports 'Approved'", () => {
    const approved = buildToolkit({ ...input, permissionLine: "Permission status (reported by the organizer): Approved" });
    expect(toolkitViolations(approved)).toEqual([]);
    const text = approved.flatMap((i) => i.texts).join("\n");
    expect(text).toMatch(/reported by the organizer/);
    expect(text).not.toMatch(/bookmyprotest (has )?(approved|verified|endorses|supports)/i);
  });
  it("X posts fit the limit", () => { for (const t of [...items.find((i) => i.key === "x_post")!.texts, ...items.find((i) => i.key === "x_thread")!.texts]) expect(t.length).toBeLessThanOrEqual(280); });
  it("'what to bring' lists only held official guidance; with none it says it holds none", () => {
    const bring = items.find((i) => i.key === "bring")!.texts.join(" ");
    expect(bring).toMatch(/9 × 6 feet/);
    expect(bring).toMatch(/weapons/i);
    const none = buildToolkit({ ...input, guidance: [] }).find((i) => i.key === "bring")!.texts.join(" ");
    expect(none).toMatch(/holds no venue rules/);
  });
  it("omits the permission line when the organizer provides no status", () => {
    const t = buildToolkit({ ...input, permissionLine: null });
    expect(t.flatMap((i) => i.texts).join("\n")).not.toMatch(/Permission status \(reported/);
    expect(t.find((i) => i.key === "faq")!.texts.join(" ")).toMatch(/has not provided a permission status/);
  });
  it("contains no calls to confront, harass or intimidate anyone", () => {
    expect(items.flatMap((i) => i.texts).join("\n")).not.toMatch(/\b(confront|expose|name and shame|burn|attack|storm|shut down|fight)\b/i);
  });
});

/* ---- copy audit: the whole UI must not claim approval, certification, endorsement or availability ---- */
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(tsx?|md)$/.test(f)) out.push(p); }
  return out;
}
describe("copy audit", () => {
  const files = walk("src/app").concat(walk("src/components"), ["src/lib/default-templates.ts", "src/lib/engine/event-readiness.ts", "src/lib/engine/readiness.ts", "src/lib/engine/public-protest.ts", "src/lib/engine/availability.ts"]);
  const BANNED: [RegExp, string][] = [
    [/Get approved/i, "Get approved"], [/Book your protest/i, "Book your protest"], [/Your protest is approved/i, "Your protest is approved"], [/You['’]re ready/i, "You're ready"],
    [/Venue available/i, "Venue available"], [/Verified protest/i, "Verified protest"], [/You['’]re prepared/i, "You're prepared"], [/Approved by BookMyProtest/i, "Approved by BookMyProtest"],
    [/verified by BookMyProtest/i, "verified by BookMyProtest"], [/BookMyProtest (approves|authorizes|certifies|guarantees)\b/i, "BookMyProtest approves/authorizes/certifies/guarantees"],
  ];
  for (const [re, name] of BANNED) it(`no UI string says "${name}"`, () => {
    const hits = files.filter((f) => re.test(readFileSync(f, "utf8").replace(/does not (organi[sz]e, )?(authori[sz]e|approve|certify|guarantee)[^"`<]*/gi, "")));
    expect(hits, hits.join(", ")).toEqual([]);
  });
  it("every public page template carries the transparency statements", () => {
    const t = readFileSync("src/components/transparency.tsx", "utf8");
    for (const s of ["does not organize, authorize, endorse or guarantee this event", "Details may be supplied by the organizer", "Check current official information"]) expect(t).toContain(s);
    expect(readFileSync("src/app/protests/[slug]/page.tsx", "utf8")).toContain("<TransparencyFooter />");
  });
  it("legal pages are clearly marked as drafts needing legal review", () => {
    for (const f of ["src/app/terms/page.tsx", "src/app/privacy/page.tsx", "src/app/platform-guidelines/page.tsx"]) expect(readFileSync(f, "utf8")).toContain("LEGAL REVIEW REQUIRED BEFORE PUBLIC LAUNCH");
    expect(readFileSync("src/components/legal-draft.tsx", "utf8")).toContain("Legal review is required before public launch");
  });
});
