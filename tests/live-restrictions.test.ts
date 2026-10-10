// Pure-engine tests for v0.7.0: order parser, scheduling, material-change detection and the check wording. No database.
import { describe, expect, it } from "vitest";
import { parseOrder, splitOrders } from "@/lib/engine/order-parser";
import { dueTriggers, zonedToUtc } from "@/lib/engine/schedule";
import { detectChanges } from "@/lib/engine/material-change";
import { composeCheck, FEED_MAX_AGE_HOURS } from "@/lib/engine/restriction-check";
import { isActionable, isWarning } from "@/lib/engine/evaluate";
import { evaluate } from "@/lib/engine/evaluate";
import { computeReadiness } from "@/lib/engine/readiness";
import { answersSchema } from "@/lib/validation";
import { baseAnswers, rule } from "./fixtures";

// Synthetic fixtures written for these tests (not copies of real orders).
const FULL = `ORDER
No. 123/Ord/2026
Dated: 05.10.2026
In exercise of the powers conferred under Section 163 of the Bharatiya Nagarik Suraksha Sanhita, 2023, I, Commissioner of Police, Delhi, hereby prohibit the assembly of five or more persons, processions and the use of loudspeakers within the limits of New Delhi District, from 08.10.2026 to 12.10.2026 (both days inclusive).
Commissioner of Police, Delhi`;

describe("order parser: parses what is there, leaves the rest null", () => {
  it("reads issuer, date, legal basis, scope, effective range and activities, each with its evidence text", () => {
    const o = parseOrder(FULL);
    expect(o.issuingAuthority.value).toBe("Commissioner of Police, Delhi");
    expect(o.orderDate.value).toBe("2026-10-05");
    expect(o.orderNumber.value).toBe("123/Ord/2026");
    expect(o.legalBasis.value).toBe("Section 163 BNSS");
    expect(o.geographicScope.value).toBe("New Delhi District");
    expect(o.effectiveFrom.value).toBe("2026-10-08");
    expect(o.effectiveTo.value).toBe("2026-10-12");
    expect(o.activities.value).toEqual(expect.arrayContaining(["ASSEMBLY", "MARCH", "SOUND"]));
    expect(o.effect.value).toBe("PROHIBITED");
    expect(o.completeness).toBe("COMPLETE");
    for (const f of [o.issuingAuthority, o.orderDate, o.legalBasis, o.geographicScope, o.effectiveFrom, o.effectiveTo]) expect(f.evidence).toBeTruthy();
  });
  it("UNKNOWN stays UNKNOWN: an order with no dates or scope yields nulls and lists them as missing", () => {
    const o = parseOrder("ORDER\nUnder Section 163 BNSS the Deputy Commissioner of Police hereby prohibits assembly of five or more persons in the area as a precaution.");
    expect(o.effectiveFrom.value).toBeNull();
    expect(o.effectiveTo.value).toBeNull();
    expect(o.orderDate.value).toBeNull();
    expect(o.geographicScope.value).toBeNull();
    expect(o.missing).toEqual(expect.arrayContaining(["order date", "effective start", "effective end", "geographic scope"]));
    expect(o.completeness).not.toBe("COMPLETE");
  });
  it("does not treat an unrelated notice as an order", () => {
    expect(splitOrders("Notice: the public grievance counter is closed on Saturday for maintenance. Thank you for your patience while we upgrade.")).toEqual([]);
  });
  it("splits a page holding two orders into two candidates", () => {
    expect(splitOrders(`${FULL}\n\n${FULL.replace("123", "124")}`)).toHaveLength(2);
  });
  it("never decides legality: the summary says it is an automatic reading", () => {
    expect(parseOrder(FULL).summary).toMatch(/automatic reading, not a legal finding/i);
  });
});

describe("T-72h / T-24h scheduling", () => {
  it("converts local wall-clock time in an IANA zone to UTC (Asia/Kolkata is UTC+5:30)", () => {
    expect(zonedToUtc("2026-12-01", "10:00", "Asia/Kolkata").toISOString()).toBe("2026-12-01T04:30:00.000Z");
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(zonedToUtc("2026-12-01", "10:00", "Not/AZone").toISOString()).toBe("2026-12-01T10:00:00.000Z");
  });
  const start = zonedToUtc("2026-12-10", "10:00", "Asia/Kolkata");
  const at = (h: number) => new Date(start.getTime() - h * 3_600_000);
  it("nothing is due earlier than 72h before", () => expect(dueTriggers(at(73), start, new Set())).toEqual([]));
  it("T-72h falls due at 72h", () => expect(dueTriggers(at(72), start, new Set())).toEqual(["T_72H"]));
  it("both are due once inside 24h and neither has run", () => expect(dueTriggers(at(10), start, new Set())).toEqual(["T_72H", "T_24H"]));
  it("a trigger already recorded is not repeated", () => expect(dueTriggers(at(24), start, new Set(["T_72H"]))).toEqual(["T_24H"]));
  it("nothing runs once the event has started", () => expect(dueTriggers(new Date(start.getTime() + 1), start, new Set())).toEqual([]));
});

describe("material change detection", () => {
  const a = baseAnswers;
  it("purpose, speakers, route, traffic footprint, event nature, sound, stage and vehicles are material", () => {
    for (const patch of [{ description: "new purpose" }, { speakers: "A VIP" }, { startLocation: "Elsewhere" }, { destination: "X Y Z" }, { trafficFootprint: "Closes road" }, { kind: "march" as const }, { sound: true }, { stage: true }, { vehicles: true }]) {
      expect(detectChanges(a, { ...a, ...patch }).material, JSON.stringify(patch)).toBe(true);
    }
  });
  it("crowd is material from a 20% change; smaller changes are not", () => {
    expect(detectChanges({ ...a, attendance: 1000 }, { ...a, attendance: 1190 }).material).toBe(false);
    expect(detectChanges({ ...a, attendance: 1000 }, { ...a, attendance: 1200 }).material).toBe(true);
    expect(detectChanges({ ...a, attendance: 1000 }, { ...a, attendance: 800 }).material).toBe(true);
  });
  it("promotional status, food and organizer details are recorded but not material", () => {
    const d = detectChanges(a, { ...a, promoStatus: "PRINTED", food: true, organizerPhone: "123" });
    expect(d.material).toBe(false);
    expect(d.changedFields).toEqual(expect.arrayContaining(["promoStatus", "food", "organizerPhone"]));
  });
  it("whitespace and case are not changes", () => expect(detectChanges(a, { ...a, startLocation: `  ${a.startLocation.toUpperCase()} ` }).changedFields).toEqual([]));
  it("names which of the user's words changed", () => expect(detectChanges(a, { ...a, speakers: "x", description: "y" }).materialLabels).toEqual(expect.arrayContaining(["speakers or VIPs", "purpose"])));
});

describe("restriction check wording never claims 'no restrictions in force'", () => {
  const now = new Date("2026-12-01T10:00:00Z");
  const fresh = new Date("2026-12-01T06:00:00Z");
  it("restrictions apply", () => {
    const r = composeCheck({ overlayTitles: ["Order A"], feedTitle: "Feed", feedLastChecked: fresh, pendingReview: 0, now });
    expect(r.status).toBe("RESTRICTIONS_APPLY");
    expect(r.message).toMatch(/Order A/);
    expect(r.message).toMatch(/verify with the relevant authority/i);
  });
  it("a stale feed is reported as stale, not as clear", () => {
    const r = composeCheck({ overlayTitles: [], feedTitle: "Feed", feedLastChecked: new Date(now.getTime() - (FEED_MAX_AGE_HOURS + 1) * 3_600_000), pendingReview: 0, now });
    expect(r.status).toBe("FEED_STALE");
    expect(composeCheck({ overlayTitles: [], feedTitle: "Feed", feedLastChecked: null, pendingReview: 0, now }).status).toBe("FEED_STALE");
  });
  it("unreviewed notifications downgrade 'nothing recorded'", () => {
    expect(composeCheck({ overlayTitles: [], feedTitle: "Feed", feedLastChecked: fresh, pendingReview: 2, now }).status).toBe("REVIEW_PENDING");
  });
  it("fresh feed with nothing recorded says only that nothing is recorded", () => {
    const r = composeCheck({ overlayTitles: [], feedTitle: "Feed", feedLastChecked: fresh, pendingReview: 0, now });
    expect(r.status).toBe("NO_RESTRICTION_RECORDED");
    expect(r.message).toMatch(/no temporary restriction is recorded/i);
    expect(r.message).not.toMatch(/no restrictions? (are|is) in force|all clear|safe to/i);
    expect(r.message).toMatch(/short notice/i);
  });
});

describe("warnings are informational", () => {
  const w = rule({ id: "WARN", requirementType: "warning", level: "RECOMMENDED", severity: "RECOMMENDED" });
  const t = rule({ id: "TASK", level: "REQUIRED", severity: "CRITICAL" });
  it("a warning rule is shown but is not actionable and is not scored", () => {
    const items = evaluate([w, t], baseAnswers, new Set(), []);
    const iw = items.find((i) => i.rule.id === "WARN")!;
    expect(isWarning(iw)).toBe(true);
    expect(isActionable(iw)).toBe(false);
    expect(computeReadiness(items).blockers.map((b) => b.rule.id)).toEqual(["TASK"]);
    expect(computeReadiness(evaluate([w], baseAnswers, new Set(), [])).pct).toBe(computeReadiness([]).pct);
  });
});

describe("large-event fields", () => {
  const ok = { ...baseAnswers, attendance: "5000", speakers: "Dr A (keynote)", promoStatus: "PRINTED", trafficFootprint: "Two roads", description: "A rally about X" };
  it("accepts purpose, speakers, promotional status and traffic footprint", () => {
    const r = answersSchema.safeParse(ok);
    expect(r.success).toBe(true);
    expect(r.success && r.data).toMatchObject({ speakers: "Dr A (keynote)", promoStatus: "PRINTED", trafficFootprint: "Two roads" });
  });
  it("they are optional: existing small-event payloads still validate with defaults", () => {
    const r = answersSchema.safeParse(baseAnswers);
    expect(r.success && r.data).toMatchObject({ speakers: "", promoStatus: "NONE", trafficFootprint: "" });
  });
  it("rejects an unknown promotional status", () => expect(answersSchema.safeParse({ ...ok, promoStatus: "VIRAL" }).success).toBe(false));
});
