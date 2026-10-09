import { describe, expect, it } from "vitest";
import { selectRules, eligible, overlaysFor, restrictionsBearingOn } from "@/lib/engine/select";
import { computeDeadline, evaluate, freshnessOf, evidenceStatus } from "@/lib/engine/evaluate";
import { renderTemplate, selectTemplate, type DocTemplate } from "@/lib/engine/templates";
import { diffLines, hashText, heuristicAssistant } from "@/lib/engine/watch";
import { buildDocument } from "@/lib/documents";
import { computeReadiness } from "@/lib/engine/readiness";
import { baseAnswers as a, restriction, rule } from "./fixtures";

// Chain is general -> specific: country > region > city > venue
const CHAIN = ["country", "region", "city", "venue"];

describe("jurisdiction inheritance", () => {
  it("rules at every level of the chain apply downward; rules elsewhere do not", () => {
    const rules = [rule({ id: "c", jurisdictionId: "country" }), rule({ id: "r", jurisdictionId: "region" }), rule({ id: "v", jurisdictionId: "venue" }), rule({ id: "other", jurisdictionId: "elsewhere" })];
    expect(selectRules(rules, CHAIN, "2026-12-01").map((r) => r.id).sort()).toEqual(["c", "r", "v"]);
    expect(selectRules(rules, ["country"], "2026-12-01").map((r) => r.id)).toEqual(["c"]);
  });
  it("works for any depth and for countries with no regions", () => {
    const rules = [rule({ id: "c", jurisdictionId: "country" }), rule({ id: "city", jurisdictionId: "city" })];
    expect(selectRules(rules, ["country", "city"], "2026-12-01")).toHaveLength(2);
  });
  it("a venue rule OVERRIDES an inherited rule of the family it names", () => {
    const base = rule({ id: "base", ruleFamilyId: "NOISE-1", jurisdictionId: "city", title: "City noise limit" });
    const venue = rule({ id: "venue", ruleFamilyId: "VEN-NOISE-1", jurisdictionId: "venue", inheritanceMode: "OVERRIDE", overridesFamilyId: "NOISE-1", title: "Venue noise limit" });
    expect(selectRules([base, venue], CHAIN, "2026-12-01").map((r) => r.title)).toEqual(["Venue noise limit"]);
    // an event not at the venue still gets the city rule
    expect(selectRules([base, venue], ["country", "region", "city"], "2026-12-01").map((r) => r.title)).toEqual(["City noise limit"]);
  });
  it("a more specific rule can EXCLUDE an inherited one without adding anything", () => {
    const base = rule({ id: "base", ruleFamilyId: "SOUND-1", jurisdictionId: "country" });
    const excl = rule({ id: "ex", ruleFamilyId: "VEN-EX", jurisdictionId: "venue", inheritanceMode: "EXCLUDE", overridesFamilyId: "SOUND-1" });
    expect(selectRules([base, excl], CHAIN, "2026-12-01")).toEqual([]);
  });
  it("narrowing: a venue rule with tighter conditions coexists with the broader one", () => {
    const broad = rule({ id: "broad", ruleFamilyId: "A", jurisdictionId: "city" });
    const narrow = rule({ id: "narrow", ruleFamilyId: "B", jurisdictionId: "venue", condition: { all: [{ field: "attendance", op: "lte", value: 1000 }], any: [] } });
    const items = evaluate(selectRules([broad, narrow], CHAIN, "2026-12-01"), { ...a, attendance: 5000 });
    expect(items.map((i) => i.rule.id)).toEqual(["broad"]);
  });
});

describe("versions and lifecycle windows", () => {
  const v1 = rule({ id: "v1", ruleFamilyId: "DEL-001", version: 1, status: "SUPERSEDED", effectiveUntil: "2026-07-01", title: "old" });
  const v2 = rule({ id: "v2", ruleFamilyId: "DEL-001", version: 2, status: "ACTIVE", effectiveFrom: "2026-07-01", supersedesRuleId: "v1", title: "new" });
  it("selects the version in force on the event date", () => {
    expect(selectRules([v1, v2], ["elsewhere"], "2026-06-30")).toEqual([]); // rules for other places never apply
    const chain = ["j1"];
    expect(selectRules([v1, v2], chain, "2026-06-30").map((r) => r.title)).toEqual(["old"]);
    expect(selectRules([v1, v2], chain, "2026-07-01").map((r) => r.title)).toEqual(["new"]);
    expect(selectRules([v1, v2], chain, "2027-01-01").map((r) => r.title)).toEqual(["new"]);
  });
  it("superseded rules do not fire once their window has closed, and never without an end date", () => {
    expect(eligible(v1, "2026-07-02")).toBe(false);
    expect(eligible(rule({ id: "x", status: "SUPERSEDED" }), "2026-01-01")).toBe(false);
  });
  it("expired rules are not evaluated as current", () => {
    const expired = rule({ id: "e", effectiveUntil: "2026-06-01" });
    expect(selectRules([expired], ["j1"], "2026-12-01")).toEqual([]);
    expect(selectRules([expired], ["j1"], "2026-05-31")).toHaveLength(1);
  });
  it("not-yet-effective rules do not fire early", () => {
    expect(selectRules([rule({ id: "f", effectiveFrom: "2027-01-01" })], ["j1"], "2026-12-01")).toEqual([]);
  });
  it("DRAFT, UNDER_REVIEW and ARCHIVED never fire; CHANGE_DETECTED still fires but is flagged", () => {
    for (const status of ["DRAFT", "UNDER_REVIEW", "ARCHIVED"] as const) expect(selectRules([rule({ id: "s", status })], ["j1"], "2026-12-01")).toEqual([]);
    const cd = evaluate(selectRules([rule({ id: "cd", status: "CHANGE_DETECTED" })], ["j1"], "2026-12-01"), a);
    expect(cd).toHaveLength(1);
    expect(cd[0].freshness).toBe("CHANGE_UNDER_REVIEW");
  });
  it("when two versions are eligible, the higher version wins", () => {
    const both = [rule({ id: "a", ruleFamilyId: "F", version: 1 }), rule({ id: "b", ruleFamilyId: "F", version: 2 })];
    expect(selectRules(both, ["j1"], "2026-12-01").map((r) => r.id)).toEqual(["b"]);
  });
});

describe("freshness states", () => {
  const verified = { sources: [{ url: "https://x.gov/a", title: "A", retrievedAt: "2026-01-01", notes: "", sourceType: "PRIMARY_LAW" as const, strength: "PRIMARY" as const }], lastVerifiedAt: "2026-01-01", needsReview: false, confidence: "high" as const };
  it("CURRENT / VERIFY_REQUIRED / CHANGE_UNDER_REVIEW / UNKNOWN / SUPERSEDED", () => {
    const f = (over: Parameters<typeof rule>[0]) => evaluate([rule(over)], a)[0].freshness;
    expect(f({ id: "1", ...verified })).toBe("CURRENT");
    expect(f({ id: "2" })).toBe("VERIFY_REQUIRED");
    expect(f({ id: "3", ...verified, status: "CHANGE_DETECTED" })).toBe("CHANGE_UNDER_REVIEW");
    expect(f({ id: "4", ...verified, level: "UNKNOWN" })).toBe("UNKNOWN");
    expect(f({ id: "5", ...verified, status: "SUPERSEDED", effectiveUntil: "2027-01-01" })).toBe("SUPERSEDED");
  });
  it("UNKNOWN stays UNKNOWN and is not scored", () => {
    const items = evaluate([rule({ id: "u", level: "UNKNOWN" })], a);
    expect(items[0].level).toBe("UNKNOWN");
    expect(computeReadiness(items).totalItems).toBe(0);
  });
  it("freshnessOf is derived, not stored", () => {
    expect(freshnessOf(rule({ id: "z" }), "REQUIRED", evidenceStatus(rule({ id: "z" })))).toBe("VERIFY_REQUIRED");
  });
});

describe("temporary restrictions overlay baseline rules", () => {
  const base = rule({ id: "sound", jurisdictionId: "city", condition: { all: [{ field: "sound", op: "eq", value: true }], any: [] } });
  const day = { ...a, sound: true, date: "2026-12-01" };
  it("applies only inside the window, inside the chain, when active, and when activities overlap", () => {
    const r = restriction({ id: "r1", jurisdictionId: "city", affectedActivities: ["SOUND"] });
    expect(overlaysFor([r], CHAIN, "2026-12-01", day)).toHaveLength(1);
    expect(overlaysFor([r], CHAIN, "2026-12-03", day)).toHaveLength(0); // after end
    expect(overlaysFor([r], CHAIN, "2026-11-29", day)).toHaveLength(0); // before start
    expect(overlaysFor([{ ...r, status: "DRAFT" }], CHAIN, "2026-12-01", day)).toHaveLength(0);
    expect(overlaysFor([{ ...r, jurisdictionId: "elsewhere" }], CHAIN, "2026-12-01", day)).toHaveLength(0);
    expect(overlaysFor([r], CHAIN, "2026-12-01", { ...day, sound: false })).toHaveLength(0); // no sound planned
  });
  it("marks the rules it bears on without rewriting them", () => {
    const overlays = overlaysFor([restriction({ id: "r1", jurisdictionId: "city", affectedActivities: ["SOUND"] })], CHAIN, "2026-12-01", day);
    const items = evaluate([base, rule({ id: "water", jurisdictionId: "city" })], day, new Set(), overlays);
    expect(items.find((i) => i.rule.id === "sound")!.restrictedBy).toEqual(["r1"]);
    expect(items.find((i) => i.rule.id === "water")!.restrictedBy).toEqual([]);
    expect(items.find((i) => i.rule.id === "sound")!.level).toBe("REQUIRED"); // baseline outcome untouched
  });
  it("an ASSEMBLY-wide restriction bears on every rule", () => {
    const o = overlaysFor([restriction({ id: "all", jurisdictionId: "city", affectedActivities: ["ASSEMBLY"] })], CHAIN, "2026-12-01", a);
    expect(restrictionsBearingOn(rule({ id: "any" }), o)).toEqual(["all"]);
  });
});

describe("deadlines are structured and never invented", () => {
  it("calendar and business days", () => {
    expect(computeDeadline({ kind: "STRUCTURED", minimumDaysBeforeEvent: 7, dayType: "CALENDAR" }, "2026-12-14")).toBe("2026-12-07");
    // 2026-12-14 is a Monday; 3 business days back = Wed 2026-12-09
    expect(computeDeadline({ kind: "STRUCTURED", minimumDaysBeforeEvent: 3, dayType: "BUSINESS" }, "2026-12-14")).toBe("2026-12-09");
  });
  it("UNKNOWN and NO_PUBLISHED_DEADLINE_FOUND produce no date", () => {
    expect(computeDeadline({ kind: "UNKNOWN" }, "2026-12-14")).toBeNull();
    expect(computeDeadline({ kind: "NO_PUBLISHED_DEADLINE_FOUND", minimumDaysBeforeEvent: 5 }, "2026-12-14")).toBeNull();
    expect(computeDeadline({ kind: "STRUCTURED", minimumDaysBeforeEvent: null }, "2026-12-14")).toBeNull();
  });
});

describe("templates", () => {
  const t = (over: Partial<DocTemplate> & { id: string }): DocTemplate => ({ templateKey: "request-letter", name: "L", jurisdictionId: null, authorityId: null, version: 1, content: "x", disclaimer: "d", active: true, effectiveFrom: null, effectiveUntil: null, sourceId: null, ...over });
  it("most specific jurisdiction wins, then highest version", () => {
    const all = [t({ id: "g1" }), t({ id: "g2", version: 2 }), t({ id: "city1", jurisdictionId: "city" }), t({ id: "venue1", jurisdictionId: "venue", version: 1 })];
    expect(selectTemplate(all, "request-letter", CHAIN, "2026-12-01")!.id).toBe("venue1");
    expect(selectTemplate(all, "request-letter", ["country", "region", "city"], "2026-12-01")!.id).toBe("city1");
    expect(selectTemplate(all, "request-letter", ["country"], "2026-12-01")!.id).toBe("g2");
  });
  it("respects effective windows and active flag", () => {
    const all = [t({ id: "v1", version: 1, effectiveUntil: "2026-07-01" }), t({ id: "v2", version: 2, effectiveFrom: "2026-07-01" }), t({ id: "off", version: 3, active: false })];
    expect(selectTemplate(all, "request-letter", [], "2026-06-30")!.id).toBe("v1");
    expect(selectTemplate(all, "request-letter", [], "2026-07-01")!.id).toBe("v2");
    expect(selectTemplate(all, "other-key", [], "2026-07-01")).toBeNull();
  });
  it("renders variables, defaults, conditionals, rows and bullets", () => {
    const blocks = renderTemplate("# Who\n| Name | {{organizer_name}}\n| Phone | {{contact_number}}\n{{#if march}}\nGoing to {{destination}}\n{{/if}}\n{{#unless march}}\nStatic\n{{/unless}}\n- {{event_name|Unnamed}}", { organizer_name: "Asha", contact_number: "", march: "", event_name: "" });
    expect(blocks[0].heading).toBe("Who");
    expect(blocks[0].rows).toEqual([["Name", "Asha"]]); // empty row value dropped
    expect(JSON.stringify(blocks)).toContain("Static");
    expect(JSON.stringify(blocks)).not.toContain("Going to");
    expect(JSON.stringify(blocks)).toContain("Unnamed");
  });
  it("a jurisdiction template changes generated paperwork without code changes", () => {
    const ctx = { answers: a, cityLabel: "X", items: [], readiness: computeReadiness([]), generatedOn: "2026-10-09" };
    const custom = t({ id: "tpl-9", version: 4, content: "Dear {{authority_name|Sir}}, {{organizer_name}} requests permission for {{event_name}}.", disclaimer: "Custom disclaimer" });
    const doc = buildDocument("request-letter", { ...ctx, templates: { "request-letter": custom } });
    expect(JSON.stringify(doc.blocks)).toContain("Asha Rao requests permission for Test assembly");
    expect(doc).toMatchObject({ disclaimer: "Custom disclaimer", templateId: "tpl-9", templateVersion: 4 });
  });
});

describe("regulatory watch (pure parts)", () => {
  it("hash ignores whitespace-only changes", () => {
    expect(hashText("A  b\n c")).toBe(hashText("A b c"));
    expect(hashText("A b c")).not.toBe(hashText("A b d"));
  });
  it("diff and heuristic suggestion flag requirement-like changes as potentially material", async () => {
    const prev = "Notice is required 7 days before.\nOffice hours 10 to 5.";
    const curr = "Notice is required 14 days before.\nOffice hours 10 to 5.";
    expect(diffLines(prev, curr)).toEqual({ added: ["Notice is required 14 days before."], removed: ["Notice is required 7 days before."] });
    const s = await heuristicAssistant({ sourceTitle: "Order", previousText: prev, currentText: curr });
    expect(s).toMatchObject({ materiality: "POTENTIALLY_MATERIAL", priority: "HIGH", origin: "SYSTEM" });
    expect(s.summary).toContain("not a legal finding");
  });
  it("a suggestion is plain data and carries no way to alter a rule", async () => {
    const s = await heuristicAssistant({ sourceTitle: "T", previousText: "a", currentText: "b" });
    expect(Object.keys(s).sort()).toEqual(["diffExcerpt", "materiality", "origin", "priority", "summary"]);
  });
});
