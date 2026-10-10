// Pure tests for venue date-conflict composition.
import { describe, expect, it } from "vitest";
import { composeAvailability, type Coverage, type Signal, type SchedulingMode } from "@/lib/engine/availability";

const now = new Date("2026-12-01T10:00:00Z");
const sig = (over: Partial<Signal> & { type: Signal["type"] }): Signal => ({ id: Math.random().toString(), status: "CONFIRMED", startTime: "09:00", endTime: "17:00", attendance: null, confidence: "high", checkedAt: now, sourceUrl: null, ...over });
const cov = (authority: Coverage["authority"], ageDays = 0): Coverage => ({ authority, outcome: "OK", checkedAt: new Date(now.getTime() - ageDays * 86_400_000) });
const run = (mode: SchedulingMode, signals: Signal[] = [], coverage: Coverage[] = [], extra: Record<string, unknown> = {}) =>
  composeAvailability({ mode, startTime: "10:00", endTime: "13:00", signals, coverage, now, ...extra });

describe("the state machine never produces 'available'", () => {
  it("every output state is one of the five, across modes and inputs, and no message claims availability", () => {
    const modes: SchedulingMode[] = ["EXCLUSIVE", "SHARED_CAPACITY", "AUTHORITY_MANAGED", "UNKNOWN"];
    const sets: [Signal[], Coverage[]][] = [[[], []], [[], [cov("BOOKING"), cov("POLICE")]], [[sig({ type: "OFFICIAL_BOOKING" })], []], [[sig({ type: "PUBLIC_EVENT_NOTICE", status: "REPORTED", confidence: "low" })], [cov("BOOKING"), cov("POLICE")]]];
    for (const m of modes) for (const [s, c] of sets) {
      const r = run(m, s, c);
      expect(["CONFLICT_CONFIRMED", "OTHER_EVENTS_KNOWN", "NO_CONFLICT_FOUND", "SHARED_CAPACITY", "OFFICIAL_STATUS_UNKNOWN"]).toContain(r.state);
      expect(`${r.headline} ${r.message}`).not.toMatch(/\bis available\b|\bavailable\b(?! to)|\bfree to book\b|\bgood to go\b/i);
    }
  });
  it("'No conflict found' says it is not confirmation that the date is free", () => {
    const r = run("EXCLUSIVE", [], [cov("BOOKING")]);
    expect(r.state).toBe("NO_CONFLICT_FOUND");
    expect(r.message).toMatch(/not confirmation that the date is free/i);
  });
  it("no checked official source means OFFICIAL_STATUS_UNKNOWN, never NO_CONFLICT_FOUND", () => {
    expect(run("EXCLUSIVE").state).toBe("OFFICIAL_STATUS_UNKNOWN");
    expect(run("UNKNOWN", [], [cov("BOOKING"), cov("POLICE")]).state).toBe("OFFICIAL_STATUS_UNKNOWN");
  });
  it("a stale or failed official check does not count as coverage", () => {
    expect(run("EXCLUSIVE", [], [cov("BOOKING", 8)]).state).toBe("OFFICIAL_STATUS_UNKNOWN");
    expect(run("EXCLUSIVE", [], [{ ...cov("BOOKING"), outcome: "FAILED" }]).state).toBe("OFFICIAL_STATUS_UNKNOWN");
  });
});

describe("exclusive venues", () => {
  it("an official confirmed booking overlapping the time is a confirmed conflict", () => {
    expect(run("EXCLUSIVE", [sig({ type: "OFFICIAL_BOOKING" })]).state).toBe("CONFLICT_CONFIRMED");
  });
  it("a booking that does not overlap the time window is not a conflict", () => {
    expect(run("EXCLUSIVE", [sig({ type: "OFFICIAL_BOOKING", startTime: "14:00", endTime: "18:00" })], [cov("BOOKING")]).state).toBe("NO_CONFLICT_FOUND");
  });
  it("an untimed signal is treated as the whole day", () => {
    expect(run("EXCLUSIVE", [sig({ type: "OFFICIAL_BOOKING", startTime: null, endTime: null })]).state).toBe("CONFLICT_CONFIRMED");
  });
  it("pending / unconfirmed entries are other events known, not a confirmed conflict", () => {
    expect(run("EXCLUSIVE", [sig({ type: "OFFICIAL_BOOKING", status: "PENDING" })], [cov("BOOKING")]).state).toBe("OTHER_EVENTS_KNOWN");
  });
  it("cancelled or rejected entries are ignored", () => {
    expect(run("EXCLUSIVE", [sig({ type: "OFFICIAL_BOOKING", status: "CANCELLED" }), sig({ type: "POLICE_APPLICATION", status: "REJECTED" })], [cov("BOOKING")]).state).toBe("NO_CONFLICT_FOUND");
  });
  it("a low-confidence 'official' signal cannot confirm a conflict", () => {
    expect(run("EXCLUSIVE", [sig({ type: "OFFICIAL_BOOKING", confidence: "low" })], [cov("BOOKING")]).state).toBe("OTHER_EVENTS_KNOWN");
  });
});

describe("shared-capacity venues (Jantar Mantar pattern)", () => {
  it("other known events inform and warn but never block", () => {
    const r = run("SHARED_CAPACITY", [sig({ type: "POLICE_APPROVAL", attendance: 300 }), sig({ type: "PUBLIC_EVENT_NOTICE", status: "REPORTED", confidence: "low" })]);
    expect(r.state).toBe("SHARED_CAPACITY");
    expect(r.tone).toBe("warn");
    expect(r.message).toMatch(/does not block/i);
  });
  it("with nothing known it is still SHARED_CAPACITY (informational), not 'no conflict' or 'available'", () => {
    const r = run("SHARED_CAPACITY");
    expect(r.state).toBe("SHARED_CAPACITY");
    expect(r.tone).toBe("info");
  });
  it("warns when known attendance plus yours may exceed the stated capacity, without blocking", () => {
    const r = run("SHARED_CAPACITY", [sig({ type: "POLICE_APPROVAL", attendance: 700 })], [], { attendance: 500, capacity: 1000 });
    expect(r.state).toBe("SHARED_CAPACITY");
    expect(r.notes.join(" ")).toMatch(/may exceed the venue's stated limit of 1000/);
  });
});

describe("authority-managed venues (Ramlila pattern): both authorities count", () => {
  it("a conflict in the booking authority alone prevents any clear state", () => {
    const r = run("AUTHORITY_MANAGED", [sig({ type: "OFFICIAL_BOOKING" })], [cov("POLICE")]);
    expect(r.state).toBe("CONFLICT_CONFIRMED");
    expect(r.authorities.find((a) => a.authority === "BOOKING")!.status).toBe("CONFLICT");
  });
  it("a conflict in the police signals alone prevents any clear state", () => {
    expect(run("AUTHORITY_MANAGED", [sig({ type: "POLICE_APPROVAL" })], [cov("BOOKING")]).state).toBe("CONFLICT_CONFIRMED");
  });
  it("a police application (unconfirmed) alone is other events known", () => {
    expect(run("AUTHORITY_MANAGED", [sig({ type: "POLICE_APPLICATION", status: "PENDING" })], [cov("BOOKING"), cov("POLICE")]).state).toBe("OTHER_EVENTS_KNOWN");
  });
  it("only one authority checked: status stays unknown, never 'no conflict'", () => {
    const r = run("AUTHORITY_MANAGED", [], [cov("BOOKING")]);
    expect(r.state).toBe("OFFICIAL_STATUS_UNKNOWN");
    expect(r.message).toMatch(/the police/);
  });
  it("both checked and nothing found: NO_CONFLICT_FOUND, and still not 'available'", () => {
    const r = run("AUTHORITY_MANAGED", [], [cov("BOOKING"), cov("POLICE")]);
    expect(r.state).toBe("NO_CONFLICT_FOUND");
    expect(r.message).toMatch(/not confirmation/i);
  });
  it("notes when the two authorities diverge, and carries supplied operational-learning evidence", () => {
    const r = run("AUTHORITY_MANAGED", [sig({ type: "POLICE_APPROVAL" })], [cov("BOOKING")], { learning: ["Lesson: they can diverge."] });
    expect(r.notes.join(" ")).toMatch(/different pictures/);
    expect(r.notes).toContain("Lesson: they can diverge.");
  });
});

describe("provenance labels", () => {
  it("BookMyProtest's own plans are labelled 'Known to BookMyProtest' and never imply complete government data", () => {
    const r = run("EXCLUSIVE", [sig({ type: "BMP_APPLICATION", status: "PENDING", confidence: "medium" }), sig({ type: "BMP_APPROVAL", status: "REPORTED", confidence: "low" })], [cov("BOOKING")]);
    expect(r.state).toBe("OTHER_EVENTS_KNOWN");
    expect(r.others.every((o) => o.origin === "Known to BookMyProtest")).toBe(true);
    expect(r.notes.join(" ")).toMatch(/not complete government data/i);
  });
  it("a BookMyProtest approval can never confirm a conflict", () => {
    expect(run("EXCLUSIVE", [sig({ type: "BMP_APPROVAL", status: "CONFIRMED", confidence: "high" })], [cov("BOOKING")]).state).toBe("OTHER_EVENTS_KNOWN");
  });
  it("public reports are low-confidence leads and can never confirm a conflict", () => {
    const r = run("EXCLUSIVE", [sig({ type: "PUBLIC_EVENT_NOTICE", status: "CONFIRMED", confidence: "high" })], [cov("BOOKING")]);
    expect(r.state).toBe("OTHER_EVENTS_KNOWN");
    expect(r.others[0].origin).toMatch(/unverified/);
  });
  it("a public report never counts as official coverage or NO_CONFLICT", () => {
    expect(run("EXCLUSIVE", [sig({ type: "PUBLIC_EVENT_NOTICE", status: "REPORTED", confidence: "low" })]).state).toBe("OTHER_EVENTS_KNOWN");
  });
});
