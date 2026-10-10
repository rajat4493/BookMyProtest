import { describe, expect, it } from "vitest";
import { addDays, clauseMatches, conditionMatches, evaluate, evidenceStatus } from "@/lib/engine/evaluate";
import { computeReadiness, headline } from "@/lib/engine/readiness";
import { baseAnswers as a, rule } from "./fixtures";

describe("clauses", () => {
  it("compares numbers", () => {
    expect(clauseMatches({ ...a, attendance: 501 }, { field: "attendance", op: "gt", value: 500 })).toBe(true);
    expect(clauseMatches({ ...a, attendance: 500 }, { field: "attendance", op: "gt", value: 500 })).toBe(false);
    expect(clauseMatches({ ...a, attendance: 500 }, { field: "attendance", op: "gte", value: 500 })).toBe(true);
    expect(clauseMatches({ ...a, attendance: 10 }, { field: "attendance", op: "lt", value: 11 })).toBe(true);
    expect(clauseMatches({ ...a, attendance: 11 }, { field: "attendance", op: "lte", value: 10 })).toBe(false);
  });
  it("derives march from kind", () => {
    expect(clauseMatches({ ...a, kind: "march" }, { field: "march", op: "eq", value: true })).toBe(true);
    expect(clauseMatches(a, { field: "march", op: "eq", value: true })).toBe(false);
  });
  it("handles booleans, in, present, neq", () => {
    expect(clauseMatches({ ...a, sound: true }, { field: "sound", op: "eq", value: true })).toBe(true);
    expect(clauseMatches(a, { field: "organizerType", op: "in", value: ["group", "ngo"] })).toBe(true);
    expect(clauseMatches(a, { field: "organizerType", op: "neq", value: "group" })).toBe(false);
    expect(clauseMatches(a, { field: "description", op: "present" })).toBe(false);
    expect(clauseMatches({ ...a, description: "  " }, { field: "description", op: "present" })).toBe(false);
    expect(clauseMatches({ ...a, description: "x" }, { field: "description", op: "present" })).toBe(true);
  });
  it("non-numeric comparisons are false, never throw", () => {
    expect(clauseMatches(a, { field: "attendance", op: "gt", value: "abc" })).toBe(false);
  });
});

describe("conditions", () => {
  const cond = { all: [{ field: "sound" as const, op: "eq" as const, value: true }], any: [{ field: "march" as const, op: "eq" as const, value: true }, { field: "attendance" as const, op: "gt" as const, value: 500 }] };
  it("requires all and at least one any", () => {
    expect(conditionMatches({ ...a, sound: true, kind: "march" }, cond)).toBe(true);
    expect(conditionMatches({ ...a, sound: true, attendance: 501 }, cond)).toBe(true);
    expect(conditionMatches({ ...a, sound: true }, cond)).toBe(false);
    expect(conditionMatches({ ...a, kind: "march" }, cond)).toBe(false);
  });
  it("empty condition always matches", () => expect(conditionMatches(a, { all: [], any: [] })).toBe(true));
});

describe("evaluate", () => {
  it("drops non-applicable rules and keeps else_level outputs", () => {
    const rules = [
      rule({ id: "sound", condition: { all: [{ field: "sound", op: "eq", value: true }], any: [] } }),
      rule({ id: "sound-not", condition: { all: [{ field: "sound", op: "eq", value: true }], any: [] }, elseLevel: "NOT_REQUIRED" }),
    ];
    const items = evaluate(rules, a);
    expect(items.map((i) => i.rule.id)).toEqual(["sound-not"]);
    expect(items[0].level).toBe("NOT_REQUIRED");
    expect(evaluate(rules, { ...a, sound: true }).map((i) => i.level)).toEqual(["REQUIRED", "REQUIRED"]);
  });
  it("respects assembly type", () => {
    const r = rule({ id: "route", assemblyType: "march" });
    expect(evaluate([r], a)).toHaveLength(0);
    expect(evaluate([r], { ...a, kind: "march" })).toHaveLength(1);
  });
  it("auto-completes from answers and honours manual done", () => {
    const r = rule({ id: "desc", completeWhen: { all: [{ field: "description", op: "present" }], any: [] } });
    expect(evaluate([r], a)[0].done).toBe(false);
    expect(evaluate([r], { ...a, description: "Hello" })[0].done).toBe(true);
    expect(evaluate([r], a, new Set(["desc"]))[0].done).toBe(true);
  });
  it("computes deadlines from event date", () => {
    expect(evaluate([rule({ id: "d", deadline: { kind: "STRUCTURED", minimumDaysBeforeEvent: 14, dayType: "CALENDAR" } })], a)[0].deadline).toBe("2026-11-17");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("UNKNOWN stays UNKNOWN", () => {
    expect(evaluate([rule({ id: "u", level: "UNKNOWN" })], a)[0].level).toBe("UNKNOWN");
  });
});

describe("evidence ledger", () => {
  const src = { url: "https://example.gov/rule", title: "T", retrievedAt: "2026-01-01", notes: "", sourceType: "OFFICIAL_ADMINISTRATIVE_RULE" as const, strength: "PRIMARY" as const };
  const good = { sources: [src], lastVerifiedAt: "2026-01-01", needsReview: false, confidence: "high" as const, legalCertainty: "PRIMARY_VERIFIED" as const };
  it("verified only with url + date + not review + not low confidence", () => {
    expect(evidenceStatus(rule({ id: "x", ...good }))).toBe("verified");
    expect(evidenceStatus(rule({ id: "x", ...good, sources: [] }))).toBe("needs_verification");
    expect(evidenceStatus(rule({ id: "x", ...good, sources: [{ ...src, url: null }] }))).toBe("needs_verification");
    expect(evidenceStatus(rule({ id: "x", ...good, lastVerifiedAt: null }))).toBe("needs_verification");
    expect(evidenceStatus(rule({ id: "x", ...good, needsReview: true }))).toBe("needs_verification");
    expect(evidenceStatus(rule({ id: "x", ...good, confidence: "low" }))).toBe("needs_verification");
    // secondary reporting alone never verifies a rule
    expect(evidenceStatus(rule({ id: "x", ...good, sources: [{ ...src, sourceType: "SECONDARY_LEAD" }] }))).toBe("needs_verification");
    expect(evidenceStatus(rule({ id: "x", ...good, sources: [{ ...src, strength: "LEAD" }] }))).toBe("needs_verification");
    expect(evidenceStatus(rule({ id: "x", ...good, legalCertainty: "UNVERIFIED" }))).toBe("needs_verification");
    expect(evidenceStatus(rule({ id: "x", ...good, legalCertainty: "OFFICIAL_GUIDANCE" }))).toBe("verified");
    // only ACTIVE rules are verified guidance
    expect(evidenceStatus(rule({ id: "x", ...good, status: "CHANGE_DETECTED" }))).toBe("needs_verification");
    expect(evidenceStatus(rule({ id: "x", ...good, status: "DRAFT" }))).toBe("needs_verification");
  });
});

describe("readiness", () => {
  const items = evaluate(
    [
      rule({ id: "p1", severity: "CRITICAL", category: "permissions" }),
      rule({ id: "p2", severity: "REQUIRED", category: "permissions" }),
      rule({ id: "d1", severity: "RECOMMENDED", category: "documents", level: "RECOMMENDED" }),
      rule({ id: "n", level: "NOT_REQUIRED", category: "logistics" }),
      rule({ id: "u", level: "UNKNOWN", category: "logistics" }),
    ],
    a,
    new Set(["p2"]),
  );
  const r = computeReadiness(items);
  it("weights by severity and ignores NOT_REQUIRED/UNKNOWN", () => {
    expect(r.totalItems).toBe(3);
    expect(r.doneItems).toBe(1);
    expect(r.pct).toBe(Math.round((2 / 6) * 100)); // p2 weight 2 of 3+2+1
  });
  it("per-category and blockers", () => {
    const perm = r.categories.find((c) => c.category === "permissions")!;
    expect(perm).toMatchObject({ done: 1, total: 2, pct: 40 });
    expect(r.categories.find((c) => c.category === "logistics")!.pct).toBeNull();
    expect(r.blockers.map((b) => b.rule.id)).toEqual(["p1"]);
    expect(r.recommended.map((b) => b.rule.id)).toEqual(["d1"]);
  });
  it("headline copy reflects state", () => {
    expect(headline(r).sub).toContain("1 ");
    const all = computeReadiness(items.map((i) => ({ ...i, done: true })));
    expect(all.pct).toBe(100);
    expect(headline(all).title).toBe("Checklist complete.");
    expect(headline(all).sub).toMatch(/not permission/i);
    expect(headline(computeReadiness([])).title).toBe("Nothing configured yet.");
  });
});
