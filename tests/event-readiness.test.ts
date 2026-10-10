// Pure tests: the permission lifecycle and the deterministic readiness engine.
import { describe, expect, it } from "vitest";
import { evaluate } from "@/lib/engine/evaluate";
import { computeEventReadiness, GATE_TYPE, type ReadinessInput } from "@/lib/engine/event-readiness";
import { PERMISSION_STATUSES, nextStatuses, validateTransition } from "@/lib/engine/permission";
import { baseAnswers, restriction, rule } from "./fixtures";

/** A rule that evidenceStatus() counts as verified. */
const V = { confidence: "high" as const, needsReview: false, lastVerifiedAt: "2026-10-01", legalCertainty: "PRIMARY_VERIFIED" as const, sources: [{ url: "https://example.org/x", title: "Source", retrievedAt: null, notes: "", sourceType: "OFFICIAL_ADMINISTRATIVE_RULE" as const, strength: "PRIMARY" as const }] };
const gate = rule({ ...V, id: "GATE", requirementType: GATE_TYPE, level: "REQUIRED", severity: "CRITICAL", userAction: "Submit the application." });
const critical = rule({ ...V, id: "CRIT", level: "REQUIRED", severity: "CRITICAL", title: "Land-owner NOC" });
const required = rule({ ...V, id: "REQ", level: "REQUIRED", severity: "REQUIRED", title: "No banners over 9 ft" });
const done = (ids: string[]) => new Set(ids);
const input = (over: Partial<ReadinessInput> & { rules?: ReturnType<typeof rule>[]; doneIds?: string[]; overlays?: ReadinessInput["overlays"] } = {}): ReadinessInput => {
  const overlays = over.overlays ?? [];
  return { items: evaluate(over.rules ?? [gate, critical, required], baseAnswers, done(over.doneIds ?? []), overlays), permission: "NOT_STARTED", overlays, restrictionCheck: { status: "NO_RESTRICTION_RECORDED" }, venue: null, ...over, } as ReadinessInput;
};
const ALL = ["GATE", "CRIT", "REQ"];

describe("permission lifecycle", () => {
  it("has exactly the eight statuses", () => expect([...PERMISSION_STATUSES]).toEqual(["NOT_STARTED", "PREPARED", "SUBMITTED", "ACKNOWLEDGED", "APPROVED", "REJECTED", "WITHDRAWN", "EXPIRED"]));
  const ok = { today: "2026-10-10" };
  it("APPROVED needs an approval date from the permission and cannot be in the future", () => {
    expect(validateTransition("SUBMITTED", "APPROVED", { ...ok })).toMatch(/approval date/i);
    expect(validateTransition("SUBMITTED", "APPROVED", { ...ok, approvalDate: "2026-10-20" })).toMatch(/future/i);
    expect(validateTransition("SUBMITTED", "APPROVED", { ...ok, approvalDate: "2026-10-09" })).toBeNull();
  });
  it("SUBMITTED needs a date and time", () => {
    expect(validateTransition("NOT_STARTED", "SUBMITTED", { ...ok })).toMatch(/when you submitted/i);
    expect(validateTransition("NOT_STARTED", "SUBMITTED", { ...ok, occurredAt: "2026-10-09T10:00:00Z" })).toBeNull();
  });
  it("cannot jump from not-started to approved, or repeat a status", () => {
    expect(validateTransition("NOT_STARTED", "APPROVED", { ...ok, approvalDate: "2026-10-09" })).toMatch(/you can record/i);
    expect(validateTransition("SUBMITTED", "SUBMITTED", { ...ok, occurredAt: "x" })).toMatch(/already/i);
    expect(nextStatuses("NOT_STARTED")).not.toContain("APPROVED");
  });
  it("a rejected, withdrawn or expired application can be started again", () => {
    for (const s of ["REJECTED", "WITHDRAWN", "EXPIRED"] as const) expect(nextStatuses(s)).toEqual(expect.arrayContaining(["PREPARED", "SUBMITTED"]));
  });
});

describe("event readiness: deterministic and explainable", () => {
  it("permission not approved is NOT_READY, whatever the checklist says", () => {
    for (const permission of ["NOT_STARTED", "PREPARED", "SUBMITTED", "ACKNOWLEDGED", "REJECTED", "WITHDRAWN", "EXPIRED"] as const) {
      const r = computeEventReadiness(input({ permission, doneIds: ALL }));
      expect(r.state, permission).toBe("NOT_READY");
      expect(r.reasons[0].code).toBe("PERMISSION_NOT_APPROVED");
      expect(r.headline).toMatch(/^Action required: Police permission is not recorded as approved/);
    }
  });
  it("a 100% checklist alone is never READY (no inference of approval)", () => {
    expect(computeEventReadiness(input({ doneIds: ALL, permission: "SUBMITTED" })).state).toBe("NOT_READY");
  });
  it("an applicable restriction is NOT_READY even with permission approved", () => {
    const o = [{ restriction: restriction({ id: "R", title: "Section 163 order" }), matchedActivities: ["ASSEMBLY"] }];
    const r = computeEventReadiness(input({ permission: "APPROVED", doneIds: ALL, overlays: o }));
    expect(r.state).toBe("NOT_READY");
    expect(r.reasons.map((x) => x.code)).toContain("RESTRICTION");
  });
  it("an unresolved critical item is NOT_READY even with permission approved", () => {
    const r = computeEventReadiness(input({ permission: "APPROVED", doneIds: ["GATE", "REQ"] }));
    expect(r.state).toBe("NOT_READY");
    expect(r.headline).toMatch(/Land-owner NOC/);
  });
  it("a confirmed venue conflict is NOT_READY", () => {
    expect(computeEventReadiness(input({ permission: "APPROVED", doneIds: ALL, venue: { state: "CONFLICT_CONFIRMED", hasOthers: true } })).state).toBe("NOT_READY");
  });
  it("approved with only non-blocking items open is READY_WITH_WARNINGS", () => {
    const r = computeEventReadiness(input({ permission: "APPROVED", doneIds: ["GATE", "CRIT"] }));
    expect(r.state).toBe("READY_WITH_WARNINGS");
    expect(r.reasons.every((x) => x.kind === "WARNING")).toBe(true);
  });
  it("READY only when approved, every critical item done, nothing else open", () => {
    const r = computeEventReadiness(input({ permission: "APPROVED", doneIds: ALL }));
    expect(r.state).toBe("READY");
    expect(r.reasons).toEqual([]);
  });
  it("recorded permission conditions, other known events, or unconfirmed changes downgrade READY to warnings", () => {
    expect(computeEventReadiness(input({ permission: "APPROVED", doneIds: ALL, permissionConditions: "Finish by 17:00." })).state).toBe("READY_WITH_WARNINGS");
    expect(computeEventReadiness(input({ permission: "APPROVED", doneIds: ALL, venue: { state: "SHARED_CAPACITY", hasOthers: true } })).state).toBe("READY_WITH_WARNINGS");
    expect(computeEventReadiness(input({ permission: "APPROVED", doneIds: ALL, unacknowledgedMaterialChanges: 1 })).state).toBe("READY_WITH_WARNINGS");
    expect(computeEventReadiness(input({ permission: "APPROVED", doneIds: ALL, rulesChanged: true })).state).toBe("READY_WITH_WARNINGS");
  });
  it("a stale feed or unreviewed notifications is STATUS_UNKNOWN, not READY and not 'clear'", () => {
    expect(computeEventReadiness(input({ permission: "APPROVED", doneIds: ALL, restrictionCheck: { status: "FEED_STALE" } })).state).toBe("STATUS_UNKNOWN");
    expect(computeEventReadiness(input({ permission: "APPROVED", doneIds: ALL, restrictionCheck: { status: "REVIEW_PENDING" } })).state).toBe("STATUS_UNKNOWN");
  });
  it("blocking beats unknown: NOT_READY is reported first", () => {
    expect(computeEventReadiness(input({ permission: "NOT_STARTED", restrictionCheck: { status: "FEED_STALE" } })).state).toBe("NOT_READY");
  });
  it("a plan with no configured requirements is STATUS_UNKNOWN", () => {
    expect(computeEventReadiness(input({ rules: [], permission: "APPROVED" })).state).toBe("STATUS_UNKNOWN");
  });
  it("a done item whose requirement still needs verification is a warning", () => {
    const shaky = rule({ id: "SHAKY", level: "REQUIRED", severity: "REQUIRED", title: "Shaky", confidence: "low" });
    const r = computeEventReadiness(input({ rules: [gate, shaky], permission: "APPROVED", doneIds: ["GATE", "SHAKY"] }));
    expect(r.state).toBe("READY_WITH_WARNINGS");
    expect(r.reasons[0].code).toBe("NEEDS_VERIFICATION");
  });
  it("is deterministic: the same inputs give the same result", () => {
    const i = input({ permission: "APPROVED", doneIds: ["GATE"] });
    expect(computeEventReadiness(i)).toEqual(computeEventReadiness(i));
  });
  it("without a permission-gate rule, permission status does not block (no invented requirement)", () => {
    expect(computeEventReadiness(input({ rules: [critical, required], doneIds: ["CRIT", "REQ"] })).state).toBe("READY");
  });
});
