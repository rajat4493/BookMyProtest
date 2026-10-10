// v0.9.2 against the test database: permission lifecycle, readiness engine on a real Jantar Mantar plan, scheduled rechecks as snapshots.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { recordSourceContent, saveRestriction, saveSource } from "@/lib/knowledge";
import { addJurisdiction, createEvent, getEvent, setRequirementDone } from "@/lib/store";
import { currentPermission, permissionHistory, recordPermission } from "@/lib/permissions";
import { assessReadiness, listReadinessSnapshots, recordReadiness, runChecks } from "@/lib/readiness-service";
import { runDueEventChecks } from "@/lib/restriction-checks";
import { generateEvaluation, latestEvaluation } from "@/lib/knowledge";
import { ensureDefaultTemplates } from "@/lib/default-templates";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { baseAnswers } from "./fixtures";

let actor: { userId: string }, district: string, jm: string, feed: string;
const DAY = "2026-12-10"; // 10:30 IST = 05:00Z
const T = { t72: new Date("2026-12-07T05:00:00Z"), t24: new Date("2026-12-09T05:00:00Z") };

async function jmEvent(over: Record<string, unknown> = {}) {
  const e = (await getEvent(await createEvent("anon", null, district, { ...baseAnswers, date: DAY, startTime: "10:30", endTime: "15:30", attendance: 500, ...over } as any, jm)))!;
  await generateEvaluation(e, "GENERATED"); // what createPlanAction does: pin the rule versions
  return e;
}
/** Marks every actionable requirement of the plan done, as an organizer ticking the whole checklist would. */
async function tickAll(eventId: string) {
  const ev = (await latestEvaluation(eventId))!;
  for (const id of ev.ruleIds) await setRequirementDone(eventId, id, true);
}
const state = async (e: Awaited<ReturnType<typeof jmEvent>>) => (await assessReadiness(e)).readiness;

beforeAll(async () => { await migrate(process.env.DATABASE_URL!); });
afterAll(async () => { await pool().end(); });
beforeEach(async () => {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories, events RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  actor = { userId: (await one<{ id: string }>("INSERT INTO users (email, password_hash, role) VALUES ('a@x.org','x','admin') RETURNING id"))!.id };
  const r = await loadDelhiCorpus({ actor, verifiedOn: "2026-10-01", confirmVerified: true });
  district = r.places.DIST; jm = r.places.JM;
  feed = (await one<{ id: string }>("SELECT id FROM sources WHERE feed_role='LIVE_RESTRICTIONS'"))!.id;
});

describe("recording the permission lifecycle", () => {
  it("starts NOT_STARTED and records each step with its details; history is append-only", async () => {
    const e = await jmEvent();
    expect((await currentPermission(e.id)).status).toBe("NOT_STARTED");
    await recordPermission(e, { status: "PREPARED" });
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z", method: "IN_PERSON", reference: "DIARY/123", evidenceRef: "photo in phone" });
    await recordPermission(e, { status: "ACKNOWLEDGED", occurredAt: "2026-11-21T10:00:00Z", reference: "ACK/77" });
    const ap = await recordPermission(e, { status: "APPROVED", approvalDate: "2026-11-25", conditions: "Finish by 17:00; no tents." }, new Date("2026-11-26T00:00:00Z"));
    expect(ap).toMatchObject({ status: "APPROVED", approvalDate: "2026-11-25", conditions: "Finish by 17:00; no tents." });
    const h = await permissionHistory(e.id);
    expect(h.map((x) => x.status)).toEqual(["APPROVED", "ACKNOWLEDGED", "SUBMITTED", "PREPARED"]);
    expect(h.find((x) => x.status === "SUBMITTED")).toMatchObject({ method: "IN_PERSON", reference: "DIARY/123", evidenceRef: "photo in phone" });
  });
  it("refuses an approval without a date, a future approval date, and skipping steps", async () => {
    const e = await jmEvent();
    await expect(recordPermission(e, { status: "APPROVED", approvalDate: "2026-11-25" })).rejects.toThrow(/you can record/i);
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" });
    await expect(recordPermission(e, { status: "APPROVED" })).rejects.toThrow(/approval date/i);
    await expect(recordPermission(e, { status: "APPROVED", approvalDate: "2099-01-01" })).rejects.toThrow(/future/i);
    expect((await currentPermission(e.id)).status).toBe("SUBMITTED");
  });
  it("keeps the older submitted/approved markers in step, and clears them when the application is withdrawn", async () => {
    const e = await jmEvent();
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" });
    expect((await one("SELECT application_submitted_at, approval_recorded_at FROM events WHERE id=$1", [e.id]))!.application_submitted_at).not.toBeNull();
    await recordPermission(e, { status: "WITHDRAWN" });
    expect(await one("SELECT application_submitted_at, approval_recorded_at FROM events WHERE id=$1", [e.id])).toEqual({ application_submitted_at: null, approval_recorded_at: null });
  });
});

describe("event-day readiness on the Jantar Mantar / 500 plan", () => {
  it("fresh plan: NOT_READY because police permission is not approved", async () => {
    const r = await state(await jmEvent());
    expect(r.state).toBe("NOT_READY");
    expect(r.reasons[0]).toMatchObject({ code: "PERMISSION_NOT_APPROVED", kind: "BLOCKING" });
    expect(r.reasons[0].next).toMatch(/HAX Branch/);
  });
  it("ticking EVERY checklist item does not make it ready: only a recorded approval satisfies the gate", async () => {
    const e = await jmEvent();
    await tickAll(e.id);
    const r = await state(e);
    expect(r.state).toBe("NOT_READY");
    expect(r.headline).toMatch(/Police permission is not approved/);
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" });
    expect((await state(e)).state).toBe("NOT_READY");
  });
  it("approved + everything ticked, but the restriction feed has never been read: STATUS_UNKNOWN (not READY)", async () => {
    const e = await jmEvent();
    await tickAll(e.id);
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" });
    await recordPermission(e, { status: "APPROVED", approvalDate: "2026-11-25" }, new Date("2026-11-26T00:00:00Z"));
    await runChecks(e, "RECHECK");
    expect((await state(e)).state).toBe("STATUS_UNKNOWN");
  });
  it("approved + ticked + feed read and clear: READY; then an applicable restriction makes it NOT_READY; unreviewed notifications make it STATUS_UNKNOWN", async () => {
    const e = await jmEvent();
    await tickAll(e.id);
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" });
    await recordPermission(e, { status: "APPROVED", approvalDate: "2026-11-25" }, new Date("2026-11-26T00:00:00Z"));
    await recordSourceContent(feed, "Notifications\nnothing of note");
    await runChecks(e, "RECHECK");
    const ready = await state(e);
    expect(ready.state).toBe("READY");
    expect(ready.reasons).toEqual([]);

    const rid = await saveRestriction(null, { jurisdictionId: district, title: "Section 163 order (test)", geographicScope: "", startsAt: "2026-12-08T00:00:00Z", endsAt: "2026-12-12T23:59:00Z", legalBasis: "Section 163 BNSS", affectedActivities: ["ASSEMBLY"], effect: "PROHIBITED", plainExplanation: "", sourceId: feed, status: "ACTIVE" }, actor);
    const blocked = await state(e);
    expect(blocked.state).toBe("NOT_READY");
    expect(blocked.reasons.map((x) => x.code)).toContain("RESTRICTION");
    await query("UPDATE temporary_restrictions SET status='ARCHIVED' WHERE id=$1", [rid]);

    await query("INSERT INTO restriction_candidates (source_id, raw_text, parsed) VALUES ($1,'x','{}')", [feed]);
    await runChecks(e, "RECHECK");
    expect((await state(e)).state).toBe("STATUS_UNKNOWN");
  });
  it("approved, critical items done, a non-critical item open: READY_WITH_WARNINGS", async () => {
    const e = await jmEvent();
    await tickAll(e.id);
    const open = (await query("SELECT r.id FROM rules r WHERE r.rule_family_id='DEL-JM-016'"))[0].id;
    await setRequirementDone(e.id, open, false);
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" });
    await recordPermission(e, { status: "APPROVED", approvalDate: "2026-11-25" }, new Date("2026-11-26T00:00:00Z"));
    await recordSourceContent(feed, "Notifications\nnothing of note");
    await runChecks(e, "RECHECK");
    const r = await state(e);
    expect(r.state).toBe("READY_WITH_WARNINGS");
    expect(r.reasons.some((x) => /Banner, flag and stick size limits/.test(x.text))).toBe(true);
  });
  it("a critical item left undone blocks even an approved permission", async () => {
    const e = await jmEvent();
    await tickAll(e.id);
    const noc = (await query("SELECT id FROM rules WHERE rule_family_id='DEL-JM-022'"))[0].id;
    await setRequirementDone(e.id, noc, false);
    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" });
    await recordPermission(e, { status: "APPROVED", approvalDate: "2026-11-25" }, new Date("2026-11-26T00:00:00Z"));
    const r = await state(e);
    expect(r.state).toBe("NOT_READY");
    expect(r.headline).toMatch(/Land-owner NOC/);
  });
});

describe("T-72h / T-24h rechecks are persisted and shown", () => {
  it("each scheduled recheck stores a snapshot with the state, the reasons and what was looked at; reruns add nothing", async () => {
    const e = await jmEvent();
    await recordSourceContent(feed, "Notifications\nnothing of note");
    expect(await runDueEventChecks(new Date(T.t72.getTime() - 3_600_000))).toEqual([]);
    const fresh = (at: Date) => query("UPDATE sources SET last_checked_at=$2 WHERE id=$1", [feed, new Date(at.getTime() - 3_600_000)]); // the daily job has read the feed an hour before each recheck
    await fresh(T.t72);
    const a = await runDueEventChecks(T.t72);
    expect(a.filter((x) => x.eventId === e.id)).toEqual([{ eventId: e.id, trigger: "T_72H", recorded: true }]);
    expect((await runDueEventChecks(T.t72)).filter((x) => x.eventId === e.id)).toEqual([]);

    await recordPermission(e, { status: "SUBMITTED", occurredAt: "2026-11-20T09:30:00Z" }); // the organizer applies between the two rechecks
    await fresh(T.t24);
    const b = await runDueEventChecks(T.t24);
    expect(b.filter((x) => x.eventId === e.id)).toEqual([{ eventId: e.id, trigger: "T_24H", recorded: true }]);

    const snaps = (await listReadinessSnapshots(e.id, true)).reverse();
    expect(snaps.map((s) => s.trigger)).toEqual(["T_72H", "T_24H"]);
    expect(snaps.map((s) => s.state)).toEqual(["NOT_READY", "NOT_READY"]);
    expect(snaps[0].inputs).toMatchObject({ permissionStatus: "NOT_STARTED", venueState: "SHARED_CAPACITY", unacknowledgedMaterialChanges: 0, rulesChanged: false });
    expect(snaps[1].inputs).toMatchObject({ permissionStatus: "SUBMITTED" }); // each snapshot keeps what was true at the time
    expect((snaps[0].inputs as any).restrictionCheck).toMatchObject({ status: "NO_RESTRICTION_RECORDED" });
    expect((snaps[0].inputs as any).unresolvedCritical.length).toBeGreaterThan(0);
    expect(snaps[0].reasons[0].code).toBe("PERMISSION_NOT_APPROVED");
    await expect(query("INSERT INTO readiness_snapshots (event_id, trigger_kind, state, reasons, inputs) VALUES ($1,'T_24H','READY','[]','{}')", [e.id])).rejects.toThrow();
  });
  it("the recheck sees an active restriction, a pending notification and a venue conflict that arrived since the plan was made", async () => {
    const e = await jmEvent();
    await recordSourceContent(feed, "Notifications\nnothing of note");
    await saveRestriction(null, { jurisdictionId: district, title: "Order X", geographicScope: "", startsAt: "2026-12-08T00:00:00Z", endsAt: "2026-12-12T23:59:00Z", legalBasis: "", affectedActivities: ["ASSEMBLY"], effect: "PROHIBITED", plainExplanation: "", sourceId: feed, status: "ACTIVE" }, actor);
    await query("UPDATE sources SET last_checked_at=$2 WHERE id=$1", [feed, new Date(T.t72.getTime() - 3_600_000)]);
    await runDueEventChecks(T.t72);
    const [s] = await listReadinessSnapshots(e.id, true);
    expect((s.inputs as any).activeRestrictions).toEqual(["Order X"]);
    expect((s.inputs as any).restrictionCheck.status).toBe("RESTRICTIONS_APPLY");
    expect(s.reasons.map((x) => x.code)).toContain("RESTRICTION");
  });
  it("a place with no restriction feed still gets a persisted readiness snapshot", async () => {
    const country = await addJurisdiction({ parentId: null, level: "country", name: "Elsewhere", supported: false });
    const city = await addJurisdiction({ parentId: country, level: "city", name: "Elsewhere City", supported: true });
    const ev = (await getEvent(await createEvent("anon", null, city, { ...baseAnswers, date: DAY, startTime: "10:30" } as any)))!;
    const out = await runChecks(ev, "RECHECK");
    expect(out.check).toBeNull();
    expect(out.snapshot).toMatchObject({ trigger: "RECHECK" });
    expect(["NOT_READY", "STATUS_UNKNOWN", "READY", "READY_WITH_WARNINGS"]).toContain(out.snapshot!.state);
    expect((await recordReadiness(ev, "T_72H", T.t72))!.trigger).toBe("T_72H");
  });
});

describe("integration statuses stay distinct", () => {
  it("the Notifications feed is SOURCE_VERIFIED, FETCH_IN_THIS_ENVIRONMENT_BLOCKED and PARSER_REAL_PAGE_VERIFICATION_PENDING, and never claims the parser is verified", async () => {
    const s = await one("SELECT canonical_url, source_type, feed_role, verification_flags, notes FROM sources WHERE id=$1", [feed]);
    expect(s!.canonical_url).toBe("https://delhipolice.gov.in/notification");
    expect(s!.source_type).toBe("OFFICIAL_CURRENT_PRACTICE");
    expect([...s!.verification_flags].sort()).toEqual(["FETCH_IN_THIS_ENVIRONMENT_BLOCKED", "PARSER_REAL_PAGE_VERIFICATION_PENDING", "SOURCE_VERIFIED"]);
    expect(s!.verification_flags).not.toContain("PARSER_REAL_PAGE_VERIFIED");
    expect(s!.notes).toMatch(/NOT production verified/);
  });
  it("editing the source without mentioning the flags keeps them; the database refuses an invented flag", async () => {
    const s = (await one("SELECT * FROM sources WHERE id=$1", [feed]))!;
    await saveSource(feed, { title: s.title, sourceType: s.source_type, issuingAuthority: s.issuing_authority, jurisdictionId: s.jurisdiction_id, canonicalUrl: s.canonical_url, publicationDate: null, effectiveDate: null, retrievedAt: null, active: true, monitoringEnabled: true, monitoringFrequency: "DAILY", notes: "edited" }, actor);
    expect((await one("SELECT verification_flags FROM sources WHERE id=$1", [feed]))!.verification_flags).toHaveLength(3);
    await expect(query("UPDATE sources SET verification_flags='{LOOKS_GOOD}' WHERE id=$1", [feed])).rejects.toThrow();
  });
});
