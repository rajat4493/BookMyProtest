// Venue scheduling modes and date signals against the test database (Delhi corpus loaded as drafts: scheduling does not depend on rule publication).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { createEvent } from "@/lib/store";
import { markApplicationSubmitted } from "@/lib/event-changes";
import { markApprovalRecorded } from "@/lib/event-changes";
import { recordOfficialCheck, saveVenueSignal, setSchedulingMode, venueAvailability, venueEvidence, isSocialUrl } from "@/lib/venue-signals";
import { ensureDefaultTemplates } from "@/lib/default-templates";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { baseAnswers } from "./fixtures";

let actor: { userId: string };
let jm: string, rm: string, district: string, soId: string, leadId: string, trafficId: string;
const D = "2026-12-10";

beforeEach(async () => {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories, events RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  actor = { userId: (await one<{ id: string }>("INSERT INTO users (email, password_hash, role) VALUES ('a@x.org','x','admin') RETURNING id"))!.id };
  const r = await loadDelhiCorpus({ actor, standingOrderUrl: "https://example.org/test-fixture/so.pdf", verifiedOn: "2026-10-01" });
  jm = r.places.JM; rm = r.places.RM; district = r.places.DIST;
  soId = (await one<{ id: string }>("SELECT id FROM sources WHERE source_code='DEL-SO-LNO-48-2022'"))!.id;
  trafficId = (await one<{ id: string }>("SELECT id FROM sources WHERE title LIKE 'Delhi Traffic Police%'"))!.id;
  leadId = (await one<{ id: string }>("SELECT id FROM sources WHERE source_type='SECONDARY_LEAD' LIMIT 1"))!.id;
});
beforeAll(async () => { await migrate(process.env.DATABASE_URL!); });
afterAll(async () => { await pool().end(); });

const avail = (venue: string, over: Record<string, unknown> = {}) => venueAvailability(venue, D, "10:00", "13:00", over as any);
const sigIn = (venueId: string, over: Record<string, unknown> = {}) => ({ venueId, date: D, startTime: "09:00", endTime: "17:00", type: "POLICE_APPROVAL" as const, status: "CONFIRMED" as const, attendance: 400, sourceId: soId, sourceUrl: null, confidence: "high" as const, ...over });

describe("scheduling modes", () => {
  it("Jantar Mantar is SHARED_CAPACITY (capacity 1,000) and Ramlila Maidan is AUTHORITY_MANAGED", async () => {
    const rows = await query("SELECT name, scheduling_mode, metadata FROM jurisdictions WHERE level='venue' ORDER BY name");
    expect(rows.map((r) => [r.name, r.scheduling_mode])).toEqual([["Jantar Mantar", "SHARED_CAPACITY"], ["Ramlila Maidan", "AUTHORITY_MANAGED"]]);
    expect(rows.find((r) => r.name === "Jantar Mantar")!.metadata.capacity).toBe(1000);
  });
  it("other venues default to UNKNOWN and the database refuses an invalid mode", async () => {
    await expect(query("UPDATE jurisdictions SET scheduling_mode='FREE_FOR_ALL' WHERE id=$1", [jm])).rejects.toThrow();
  });
  it("a human's later change survives a loader re-run", async () => {
    await setSchedulingMode(rm, "EXCLUSIVE", actor);
    await loadDelhiCorpus({ actor, standingOrderUrl: "https://example.org/test-fixture/so.pdf", verifiedOn: "2026-10-01" });
    expect((await one<{ scheduling_mode: string }>("SELECT scheduling_mode FROM jurisdictions WHERE id=$1", [rm]))!.scheduling_mode).toBe("EXCLUSIVE");
  });
  it("only a human, and only on venues", async () => {
    for (const bad of [null, { userId: "ai" }] as any[]) await expect(setSchedulingMode(rm, "EXCLUSIVE", bad)).rejects.toThrow(/human/i);
    await expect(setSchedulingMode(district, "EXCLUSIVE", actor)).rejects.toThrow(/venues only/i);
  });
});

describe("Ramlila Maidan: MCD-side booking and police signals are combined", () => {
  it("with no official check recorded the status is unknown (the booking interface is unverified), never 'no conflict'", async () => {
    expect((await avail(rm))!.state).toBe("OFFICIAL_STATUS_UNKNOWN");
  });
  it("both authorities checked and empty: NO_CONFLICT_FOUND, which is not availability", async () => {
    await recordOfficialCheck({ venueId: rm, authority: "BOOKING", sourceId: soId, from: "2026-12-01", to: "2026-12-31", outcome: "OK" }, actor);
    expect((await avail(rm))!.state).toBe("OFFICIAL_STATUS_UNKNOWN"); // police not checked yet
    await recordOfficialCheck({ venueId: rm, authority: "POLICE", sourceId: trafficId, from: "2026-12-01", to: "2026-12-31", outcome: "OK" }, actor);
    const a = (await avail(rm))!;
    expect(a.state).toBe("NO_CONFLICT_FOUND");
    expect(a.message).toMatch(/not confirmation/i);
  });
  it("a police approval conflicts even when the booking side is clear, and vice versa", async () => {
    await recordOfficialCheck({ venueId: rm, authority: "BOOKING", sourceId: soId, from: "2026-12-01", to: "2026-12-31", outcome: "OK" }, actor);
    await recordOfficialCheck({ venueId: rm, authority: "POLICE", sourceId: trafficId, from: "2026-12-01", to: "2026-12-31", outcome: "OK" }, actor);
    const id = await saveVenueSignal(sigIn(rm, { type: "POLICE_APPROVAL" }), actor);
    const a = (await avail(rm))!;
    expect(a.state).toBe("CONFLICT_CONFIRMED");
    expect(a.notes.join(" ")).toMatch(/different pictures/);
    await query("DELETE FROM venue_date_signals WHERE id=$1", [id]);
    await saveVenueSignal(sigIn(rm, { type: "OFFICIAL_BOOKING" }), actor);
    expect((await avail(rm))!.state).toBe("CONFLICT_CONFIRMED");
  });
  it("carries the 2023 case as CASE_LAW / operational-learning evidence from lead sources, shown with the result", async () => {
    const ev = await venueEvidence(rm);
    expect(ev.map((e) => e.kind).sort()).toEqual(["CASE_LAW", "OPERATIONAL_LEARNING", "OPERATIONAL_LEARNING"]);
    expect(ev.every((e) => e.source_type === "SECONDARY_LEAD")).toBe(true); // reported, not read: never presented as verified
    expect(ev[0].lesson).toMatch(/can diverge/);
    expect((await avail(rm))!.notes.join(" ")).toMatch(/can diverge/);
  });
  it("Jantar Mantar has no such evidence", async () => expect(await venueEvidence(jm)).toEqual([]));
});

describe("Jantar Mantar: other known events inform, they do not block", () => {
  it("a confirmed police approval for another gathering is information/warning only", async () => {
    await saveVenueSignal(sigIn(jm), actor);
    const a = (await avail(jm, { attendance: 300 }))!;
    expect(a.state).toBe("SHARED_CAPACITY");
    expect(a.tone).toBe("warn");
    expect(a.confirmed).toHaveLength(1);
  });
  it("combined attendance above the 1,000 limit is flagged, not blocked", async () => {
    await saveVenueSignal(sigIn(jm, { attendance: 800 }), actor);
    const a = (await avail(jm, { attendance: 500 }))!;
    expect(a.state).toBe("SHARED_CAPACITY");
    expect(a.notes.join(" ")).toMatch(/exceed the venue's stated limit of 1000/);
  });
});

describe("signal guardrails", () => {
  it("only a human can record signals and checks", async () => {
    await expect(saveVenueSignal(sigIn(jm), { userId: "ai" } as any)).rejects.toThrow(/human/i);
    await expect(recordOfficialCheck({ venueId: jm, authority: "POLICE", sourceId: soId, from: D, to: D, outcome: "OK" }, null as any)).rejects.toThrow(/human/i);
  });
  it("BookMyProtest signal types cannot be typed in: they are derived", async () => {
    await expect(saveVenueSignal(sigIn(jm, { type: "BMP_APPLICATION" }), actor)).rejects.toThrow(/derived/i);
    await expect(saveVenueSignal(sigIn(jm, { type: "BMP_APPROVAL" }), actor)).rejects.toThrow(/derived/i);
  });
  it("an official signal needs a registered, current, non-news source", async () => {
    await expect(saveVenueSignal(sigIn(jm, { sourceId: null }), actor)).rejects.toThrow(/registered source/i);
    await expect(saveVenueSignal(sigIn(jm, { sourceId: leadId }), actor)).rejects.toThrow(/official source/i);
    await expect(recordOfficialCheck({ venueId: jm, authority: "POLICE", sourceId: leadId, from: D, to: D, outcome: "OK" }, actor)).rejects.toThrow(/official source/i);
  });
  it("public reports are forced to low confidence and cannot be confirmed", async () => {
    const id = await saveVenueSignal(sigIn(jm, { type: "PUBLIC_EVENT_NOTICE", status: "CONFIRMED", confidence: "high", sourceId: null, sourceUrl: "https://example.org/notice" }), actor);
    expect(await one("SELECT confidence, event_status FROM venue_date_signals WHERE id=$1", [id])).toEqual({ confidence: "low", event_status: "REPORTED" });
    await expect(query("INSERT INTO venue_date_signals (venue_id, signal_date, signal_type, event_status, confidence) VALUES ($1,$2,'PUBLIC_EVENT_NOTICE','CONFIRMED','high')", [jm, D])).rejects.toThrow();
  });
  it("social media is never authoritative: it can only be a low-confidence public report", async () => {
    for (const u of ["https://twitter.com/x/status/1", "https://x.com/a", "https://www.facebook.com/e/1", "https://instagram.com/p/1", "https://t.me/chan", "https://youtu.be/abc"]) expect(isSocialUrl(u), u).toBe(true);
    expect(isSocialUrl("https://delhipolice.gov.in/notification")).toBe(false);
    await expect(saveVenueSignal(sigIn(jm, { sourceUrl: "https://x.com/someone/status/1" }), actor)).rejects.toThrow(/social media/i);
    const id = await saveVenueSignal(sigIn(jm, { type: "PUBLIC_EVENT_NOTICE", status: "REPORTED", sourceId: null, sourceUrl: "https://x.com/someone/status/1" }), actor);
    const a = (await avail(rm))!; // different venue: unaffected
    expect(a.others).toEqual([]);
    const own = (await venueAvailability(jm, D, "10:00", "13:00"))!;
    expect(own.others[0]).toMatchObject({ confidence: "low", origin: expect.stringMatching(/unverified/) });
    expect(id).toBeTruthy();
  });
  it("a social-media report at an exclusive venue is other-events-known, never a confirmed conflict or coverage", async () => {
    await setSchedulingMode(rm, "EXCLUSIVE", actor);
    await saveVenueSignal(sigIn(rm, { type: "PUBLIC_EVENT_NOTICE", status: "REPORTED", sourceId: null, sourceUrl: "https://x.com/a/status/2" }), actor);
    expect((await avail(rm))!.state).toBe("OTHER_EVENTS_KNOWN");
  });
});

describe("Known to BookMyProtest", () => {
  const mkEvent = async (venue: string, over: Record<string, unknown> = {}) => createEvent("anon", null, district, { ...baseAnswers, date: D, attendance: 250, organizerName: "Secret Person", organizerEmail: "secret@example.com", ...over } as any, venue);
  it("applications of BookMyProtest users appear labelled as such, without names or contacts, and only once submitted", async () => {
    const other = await mkEvent(rm);
    expect((await avail(rm))!.others).toEqual([]); // planned but not applied: not a signal
    await markApplicationSubmitted(other, true);
    const a = (await avail(rm))!;
    expect(a.state).toBe("OTHER_EVENTS_KNOWN");
    expect(a.others[0]).toMatchObject({ origin: "Known to BookMyProtest", label: "Application", attendance: 250 });
    expect(JSON.stringify(a)).not.toMatch(/Secret Person|secret@example\.com/);
    expect(a.notes.join(" ")).toMatch(/not complete government data/i);
  });
  it("a user-reported approval is labelled too, and never becomes a confirmed conflict", async () => {
    const other = await mkEvent(rm);
    await markApplicationSubmitted(other, true);
    await markApprovalRecorded(other, true);
    const a = (await avail(rm))!;
    expect(a.others[0]).toMatchObject({ label: "Approval reported", origin: "Known to BookMyProtest" });
    expect(a.state).not.toBe("CONFLICT_CONFIRMED");
  });
  it("your own plan is excluded from its own check, and approvals need an application first", async () => {
    const mine = await mkEvent(rm);
    await markApplicationSubmitted(mine, true);
    expect((await avail(rm, { excludeEventId: mine }))!.others).toEqual([]);
    const fresh = await mkEvent(rm);
    await markApprovalRecorded(fresh, true);
    expect((await one("SELECT approval_recorded_at FROM events WHERE id=$1", [fresh]))!.approval_recorded_at).toBeNull();
  });
  it("a venue check is null for a non-venue", async () => expect(await venueAvailability(district, D, "10:00", "13:00")).toBeNull());
});
