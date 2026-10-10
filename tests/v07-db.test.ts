// v0.7.0 integration tests (test database): live-restriction feed, candidates, checks, Ramlila workflow, change-after-application.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { evaluate } from "@/lib/engine/evaluate";
import { computeReadiness } from "@/lib/engine/readiness";
import { buildDocument } from "@/lib/documents";
import { acceptCandidate, applicableFor, chainFor, linkSource, listCandidates, parseOrderText, recordSourceContent, rejectCandidate, saveRestriction, saveRuleDraft, saveSource } from "@/lib/knowledge";
import { addJurisdiction, createEvent, getEvent, metaForChain } from "@/lib/store";
import { acknowledgeChanges, markApplicationSubmitted, openChangeNotices, updateEventDetails } from "@/lib/event-changes";
import { listChecks, runDueEventChecks, runRestrictionCheck } from "@/lib/restriction-checks";
import { ensureDefaultTemplates } from "@/lib/default-templates";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { RULES, SOURCES } from "../data/delhi/corpus";
import { baseAnswers } from "./fixtures";

const FIXTURE_URL = "https://example.org/test-fixture/standing-order-L&O-48-2022.pdf";
let actor: { userId: string };
let district: string, nct: string, feedId: string;

const ORDER = `ORDER
No. 55/Ord/2026
Dated: 05.12.2026
In exercise of the powers conferred under Section 163 of the Bharatiya Nagarik Suraksha Sanhita, 2023, I, Commissioner of Police, Delhi, hereby prohibit the assembly of five or more persons within the limits of New Delhi District, from 08.12.2026 to 12.12.2026.
Commissioner of Police, Delhi`;

async function resetDelhi() {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  actor = { userId: (await one<{ id: string }>("INSERT INTO users (email, password_hash, role) VALUES ('a@x.org','x','admin') RETURNING id"))!.id };
  const r = await loadDelhiCorpus({ actor, standingOrderUrl: FIXTURE_URL, verifiedOn: "2026-10-01", confirmVerified: true, goLive: true });
  district = r.places.DIST; nct = r.places.NCT;
  feedId = (await one<{ id: string }>("SELECT id FROM sources WHERE feed_role='LIVE_RESTRICTIONS'"))!.id;
}
async function delhiEvent(over: Record<string, unknown> = {}, venue: string | null = null) {
  const a = { ...baseAnswers, date: "2026-12-10", attendance: 2000, ...over } as typeof baseAnswers;
  return (await getEvent(await createEvent("anon", null, district, a, venue)))!;
}
async function plan(over: Record<string, unknown>) {
  const ev = await delhiEvent(over);
  const { rules, overlays } = await applicableFor(await chainFor(ev), ev.date, ev.answers);
  const items = evaluate(rules, ev.answers, new Set(), overlays);
  return { items, by: new Map(items.map((i) => [i.rule.ruleFamilyId, i])), readiness: computeReadiness(items) };
}

beforeAll(async () => { await migrate(process.env.DATABASE_URL!); });
afterAll(async () => { await pool().end(); });

describe("Delhi: Traffic NOC and the live-restriction feed", () => {
  beforeAll(resetDelhi);
  it("Traffic NOC for public rallies/processions/morchas/protest gatherings is PRIMARY_VERIFIED from the official Traffic Police page", async () => {
    const [r] = await query("SELECT rule_status, legal_certainty FROM rules WHERE rule_family_id='DEL-TRAFFIC-001'");
    expect(r).toMatchObject({ rule_status: "ACTIVE", legal_certainty: "PRIMARY_VERIFIED" });
    const [src] = await query("SELECT s.canonical_url, s.source_type, rs.evidence_strength FROM rule_sources rs JOIN sources s ON s.id=rs.source_id JOIN rules r ON r.id=rs.rule_id WHERE r.rule_family_id='DEL-TRAFFIC-001'");
    expect(src).toMatchObject({ canonical_url: "https://traffic.delhipolice.gov.in/node/80", source_type: "OFFICIAL_CURRENT_PRACTICE", evidence_strength: "PRIMARY" });
    expect((await plan({})).by.get("DEL-TRAFFIC-001")).toMatchObject({ evidence: "verified" });
  });
  it("Delhi Police Notifications is the canonical live-restriction feed with the order parser, monitored daily", async () => {
    const [s] = await query("SELECT title, parser, feed_role, monitoring_enabled, monitoring_frequency, canonical_url FROM sources WHERE id=$1", [feedId]);
    expect(s).toMatchObject({ parser: "ORDER_NOTICES", feed_role: "LIVE_RESTRICTIONS", monitoring_enabled: true, monitoring_frequency: "DAILY", canonical_url: "https://delhipolice.gov.in/notification" });
    expect((await query("SELECT 1 FROM sources WHERE feed_role='LIVE_RESTRICTIONS'"))).toHaveLength(1);
  });
  it("Delhi's timezone and large-event threshold are place data", async () => {
    expect(await metaForChain(await chainFor(await delhiEvent()))).toMatchObject({ timezone: "Asia/Kolkata", largeEventAbove: 1000 });
  });
});

describe("parsed-order candidates are suggestions only", () => {
  beforeEach(resetDelhi);
  it("a changed feed produces PENDING candidates and creates no restriction", async () => {
    await recordSourceContent(feedId, "Notifications\nOld notice about office timings, nothing else.");
    const r = await recordSourceContent(feedId, `Notifications\nOld notice about office timings, nothing else.\n${ORDER}`);
    expect(r.kind).toBe("CHANGED");
    const c = await listCandidates("PENDING");
    expect(c).toHaveLength(1);
    expect(c[0].parsed.effectiveFrom.value).toBe("2026-12-08");
    expect(c[0].parsed.issuingAuthority.value).toBe("Commissioner of Police, Delhi");
    expect((await query("SELECT 1 FROM temporary_restrictions"))).toHaveLength(0);
  });
  it("accepting creates a DRAFT, never ACTIVE, restriction with the order metadata, and a draft does not overlay any plan", async () => {
    await parseOrderText(feedId, ORDER, actor);
    const [cand] = await listCandidates("PENDING");
    const id = await acceptCandidate(cand.id, {
      jurisdictionId: district, title: "Order 55/Ord/2026", geographicScope: "New Delhi District", startsAt: "2026-12-08T00:00:00Z", endsAt: "2026-12-12T23:59:00Z", legalBasis: "Section 163 BNSS",
      affectedActivities: ["ASSEMBLY"], effect: "PROHIBITED", plainExplanation: "", issuingAuthority: "Commissioner of Police, Delhi", orderDate: "2026-12-05", orderReference: "55/Ord/2026",
    }, actor);
    const [r] = await query("SELECT status, issuing_authority, order_date::text AS od, order_reference, source_id, source_excerpt FROM temporary_restrictions WHERE id=$1", [id]);
    expect(r).toMatchObject({ status: "DRAFT", issuing_authority: "Commissioner of Police, Delhi", od: "2026-12-05", order_reference: "55/Ord/2026", source_id: feedId });
    expect(r.source_excerpt).toMatch(/Section 163/);
    expect((await plan({})).by.size).toBeGreaterThan(0);
    const ev = await delhiEvent();
    expect((await runRestrictionCheck(ev, "RECHECK"))!.status).not.toBe("RESTRICTIONS_APPLY");
  });
  it("AI / system actors cannot parse, accept or reject", async () => {
    await parseOrderText(feedId, ORDER, actor);
    const [cand] = await listCandidates("PENDING");
    for (const bad of [null, undefined, { userId: "ai" }, { userId: "system" }] as any[]) {
      await expect(parseOrderText(feedId, ORDER, bad)).rejects.toThrow(/human/i);
      await expect(acceptCandidate(cand.id, {} as any, bad)).rejects.toThrow(/human/i);
      await expect(rejectCandidate(cand.id, "x", bad)).rejects.toThrow(/human/i);
    }
    expect((await listCandidates("PENDING"))).toHaveLength(1);
  });
  it("rejecting records the decision and a candidate cannot be decided twice", async () => {
    await parseOrderText(feedId, ORDER, actor);
    const [cand] = await listCandidates("PENDING");
    await rejectCandidate(cand.id, "not relevant", actor);
    expect((await listCandidates("REJECTED"))).toHaveLength(1);
    await expect(rejectCandidate(cand.id, "again", actor)).rejects.toThrow(/pending/i);
  });
  it("activating a restriction without a source is refused (human-only, evidence required)", async () => {
    await expect(saveRestriction(null, { jurisdictionId: district, title: "t", geographicScope: "", startsAt: "2026-12-08T00:00:00Z", endsAt: "2026-12-12T00:00:00Z", legalBasis: "", affectedActivities: ["ASSEMBLY"], effect: "RESTRICTED", plainExplanation: "", sourceId: null, status: "ACTIVE" }, actor)).rejects.toThrow(/source/i);
  });
});

describe("live-restriction checks", () => {
  beforeEach(resetDelhi);
  it("a place with no live-restriction feed gets no check and no claim", async () => {
    const country = await addJurisdiction({ parentId: null, level: "country", name: "Elsewhere", supported: false });
    const city = await addJurisdiction({ parentId: country, level: "city", name: "Elsewhere City", supported: true });
    const ev = (await getEvent(await createEvent("anon", null, city, { ...baseAnswers, date: "2026-12-10" })))!;
    expect(await runRestrictionCheck(ev, "PLAN_GENERATED")).toBeNull();
    expect(await listChecks(ev.id)).toEqual([]);
  });
  it("never-checked feed is FEED_STALE; once checked it says only 'no restriction recorded'; pending candidates downgrade it; an active order is reported", async () => {
    const ev = await delhiEvent();
    expect((await runRestrictionCheck(ev, "PLAN_GENERATED"))!.status).toBe("FEED_STALE");

    await recordSourceContent(feedId, "Notifications\nnothing yet");
    const clear = (await runRestrictionCheck(ev, "RECHECK"))!;
    expect(clear.status).toBe("NO_RESTRICTION_RECORDED");
    expect(clear.message).not.toMatch(/no restrictions? (are|is) in force|all clear/i);

    await recordSourceContent(feedId, `Notifications\nnothing yet\n${ORDER}`);
    expect((await runRestrictionCheck(ev, "DOCUMENT_GENERATION"))!.status).toBe("REVIEW_PENDING");

    const [cand] = await listCandidates("PENDING");
    const rid = await acceptCandidate(cand.id, { jurisdictionId: district, title: "Order 55/Ord/2026", geographicScope: "", startsAt: "2026-12-08T00:00:00Z", endsAt: "2026-12-12T23:59:00Z", legalBasis: "Section 163 BNSS", affectedActivities: ["ASSEMBLY"], effect: "PROHIBITED", plainExplanation: "", issuingAuthority: "CP Delhi", orderDate: "2026-12-05", orderReference: "55" }, actor);
    await saveRestriction(rid, { jurisdictionId: district, title: "Order 55/Ord/2026", geographicScope: "", startsAt: "2026-12-08T00:00:00Z", endsAt: "2026-12-12T23:59:00Z", legalBasis: "Section 163 BNSS", affectedActivities: ["ASSEMBLY"], effect: "PROHIBITED", plainExplanation: "", sourceId: feedId, status: "ACTIVE" }, actor);
    const hit = (await runRestrictionCheck(ev, "RECHECK"))!;
    expect(hit.status).toBe("RESTRICTIONS_APPLY");
    expect(hit.overlayIds).toEqual([rid]);
    expect((await listChecks(ev.id)).map((c) => c.trigger)).toEqual(expect.arrayContaining(["PLAN_GENERATED", "RECHECK", "DOCUMENT_GENERATION"]));
  });
  it("T-72h and T-24h run once each, at the right moment, in the place's timezone (injected clock)", async () => {
    const ev = await delhiEvent({ date: "2026-12-10", startTime: "10:00" }); // 10:00 IST = 04:30Z
    const start = Date.parse("2026-12-10T04:30:00Z");
    const at = (h: number) => new Date(start - h * 3_600_000);
    expect(await runDueEventChecks(at(73))).toEqual([]);
    expect((await runDueEventChecks(at(72))).filter((r) => r.eventId === ev.id)).toEqual([{ eventId: ev.id, trigger: "T_72H", recorded: true }]);
    expect((await runDueEventChecks(at(71))).filter((r) => r.eventId === ev.id)).toEqual([]);
    expect((await runDueEventChecks(at(24))).filter((r) => r.eventId === ev.id)).toEqual([{ eventId: ev.id, trigger: "T_24H", recorded: true }]);
    expect((await runDueEventChecks(at(23))).filter((r) => r.eventId === ev.id)).toEqual([]);
    expect((await listChecks(ev.id)).map((c) => c.trigger).sort()).toEqual(["T_24H", "T_72H"]);
    // the database itself refuses a duplicate scheduled check
    await expect(query("INSERT INTO restriction_checks (event_id, trigger_kind, status) VALUES ($1,'T_24H','FEED_STALE')", [ev.id])).rejects.toThrow();
  });
});

describe("Ramlila Maidan workflow", () => {
  beforeAll(resetDelhi);
  it("above 1,000: police NOC + ground allotment/land-owner permission + Traffic NOC, with the sound/current-orders overlays", async () => {
    const p = await plan({ attendance: 2000, sound: true });
    for (const f of ["DEL-RAM-101", "DEL-RAM-102", "DEL-TRAFFIC-001", "DEL-LIVE-001", "DEL-PROC-004"]) expect(p.by.has(f), f).toBe(true);
    expect(p.by.get("DEL-RAM-101")!.rule.severity).toBe("CRITICAL");
    expect(p.by.get("DEL-RAM-102")!.rule.severity).toBe("CRITICAL");
  });
  it("the sound overlay does not apply to a small, static gathering", async () => {
    expect((await plan({ attendance: 500, sound: true })).by.has("DEL-PROC-004")).toBe(false);
    expect((await plan({ attendance: 500, sound: true, kind: "march", destination: "India Gate area" })).by.has("DEL-PROC-004")).toBe(true);
    expect((await plan({ attendance: 2000, sound: false })).by.has("DEL-PROC-004")).toBe(false);
  });
  it("the Ramlila approvals are shown as unverified, never as established fact", async () => {
    const p = await plan({ attendance: 2000 });
    for (const f of ["DEL-RAM-101", "DEL-RAM-102", "DEL-RAM-103"]) {
      expect(p.by.get(f)!.evidence, f).toBe("needs_verification");
      expect(p.by.get(f)!.rule.confidence, f).toBe("low");
    }
    expect((await query("SELECT legal_certainty FROM rules WHERE rule_family_id IN ('DEL-RAM-101','DEL-RAM-102','DEL-RAM-103')")).every((r) => r.legal_certainty === "OFFICIAL_GUIDANCE")).toBe(true);
  });
  it("the not-one-step warning carries the exact wording, is a warning (not a task) and is not scored", async () => {
    const p = await plan({ attendance: 2000 });
    const w = p.by.get("DEL-RAM-103")!;
    expect(w.rule.requirementType).toBe("warning");
    expect(w.rule.description).toContain("Ramlila Maidan is not a one-step police-permission venue. Ground allotment and police NOC are separate requirements.");
    expect(w.rule.description).toMatch(/three separate approvals/i);
    expect(p.readiness.blockers.map((b) => b.rule.ruleFamilyId)).not.toContain("DEL-RAM-103");
    expect([...p.readiness.required, ...p.readiness.recommended, ...p.readiness.blockers].map((i) => i.rule.ruleFamilyId)).not.toContain("DEL-RAM-103");
    expect((await plan({ attendance: 800 })).by.has("DEL-RAM-103")).toBe(false);
  });
  it("the ground-allotment and police-NOC claims rest on leads only; no official source says they are separate", async () => {
    const rows = await query("SELECT r.rule_family_id, s.source_type, rs.evidence_strength FROM rule_sources rs JOIN rules r ON r.id=rs.rule_id JOIN sources s ON s.id=rs.source_id WHERE r.rule_family_id IN ('DEL-RAM-101','DEL-RAM-102','DEL-RAM-103')");
    expect(rows.filter((x) => x.source_type === "SECONDARY_LEAD").every((x) => x.evidence_strength === "LEAD")).toBe(true);
    expect(rows.filter((x) => x.evidence_strength === "PRIMARY")).toEqual([]);
  });
  it("exposes NO direct MCD booking link anywhere; the exact booking endpoint is UNDER_REVIEW", async () => {
    const [ram2] = await query("SELECT rule_status, title, official_link, user_action FROM rules WHERE rule_family_id='DEL-RAM-002'");
    expect(ram2).toMatchObject({ rule_status: "UNDER_REVIEW", user_action: "" });
    expect(ram2.title).toMatch(/booking endpoint/i);
    const urls = [
      ...(await query("SELECT canonical_url AS u FROM sources UNION ALL SELECT document_url FROM sources UNION ALL SELECT index_url FROM sources UNION ALL SELECT submission_url FROM authorities UNION ALL SELECT official_link FROM rules")).map((r) => r.u),
      ...RULES.flatMap((r) => [r.legal, r.plain, r.action]), ...SOURCES.flatMap((s) => [s.url, s.documentUrl, s.indexUrl]),
    ].filter((x): x is string => !!x);
    const hosts = urls.flatMap((u) => u.match(/https?:\/\/[^\s"')]+/g) ?? []);
    expect(hosts.filter((h) => /mcd|mcdonline|mcdonline\.nic|delhi\.gov\.in.*ramlila|ramlila.*book/i.test(h))).toEqual([]);
    expect((await plan({ attendance: 2000 })).by.has("DEL-RAM-002")).toBe(false);
  });
});

describe("L&O/10/2022 stays current-instrument metadata only", () => {
  beforeAll(resetDelhi);
  it("is a CURRENT, index-only source with no document URL", async () => {
    const [s] = await query("SELECT lifecycle, order_number, document_url, index_url, issuing_authority, publication_date::text AS pd FROM sources WHERE source_code='DEL-SO-LNO-10-2022'");
    expect(s).toMatchObject({ lifecycle: "CURRENT", order_number: "L&O/10/2022", document_url: null, index_url: "https://kpkb.delhipolice.gov.in/standingorderNew", issuing_authority: "Commissioner of Police, Delhi", pd: "2022-05-25" });
  });
  it("only an existence notice is primary-evidenced by it; clause-level requirements stay held and are never shown", async () => {
    const primary = await query("SELECT r.rule_family_id, r.level FROM rule_sources rs JOIN rules r ON r.id=rs.rule_id JOIN sources s ON s.id=rs.source_id WHERE s.source_code='DEL-SO-LNO-10-2022' AND rs.evidence_strength='PRIMARY'");
    expect(primary).toEqual([{ rule_family_id: "DEL-PROC-001", level: "UNKNOWN" }]);
    const [held] = await query("SELECT rule_status, legal_statement, user_action, (SELECT count(*) FROM rule_sources WHERE rule_id=rules.id)::int AS n FROM rules WHERE rule_family_id='DEL-PROC-100'");
    expect(held).toMatchObject({ rule_status: "UNDER_REVIEW", legal_statement: "", user_action: "", n: 0 });
    const p = await plan({ kind: "march", destination: "India Gate area" });
    expect(p.by.has("DEL-PROC-100")).toBe(false);
  });
  it("cannot be attached as primary evidence for a requirement", async () => {
    const id = await saveRuleDraft(null, {
      jurisdictionId: nct, authorityId: null, assemblyType: "any", title: "Clause", description: "d", legalStatement: "l", userAction: "a", category: "permissions", requirementType: "permission", level: "REQUIRED", elseLevel: null,
      severity: "REQUIRED", legalCertainty: "UNVERIFIED", condition: { all: [], any: [] }, completeWhen: null, deadline: { kind: "UNKNOWN" }, submissionMethod: "", officialLink: null, documents: [], vendorCategory: null,
      effectiveFrom: null, effectiveUntil: null, lastVerifiedAt: null, needsReview: true, confidence: "low", ruleOwner: "", adminNotes: "", sort: 1, inheritanceMode: "ADD", overridesFamilyId: null,
    }, actor);
    const so = (await one<{ id: string }>("SELECT id FROM sources WHERE source_code='DEL-SO-LNO-10-2022'"))!.id;
    await expect(linkSource(id, so, { strength: "PRIMARY" }, actor)).rejects.toThrow(/index-only/i);
  });
});

describe("large-event documents", () => {
  beforeAll(resetDelhi);
  const render = async (over: Record<string, unknown>) => {
    const ev = await delhiEvent(over);
    const { rules, overlays } = await applicableFor(await chainFor(ev), ev.date, ev.answers);
    const items = evaluate(rules, ev.answers, new Set(), overlays);
    const doc = buildDocument("event-summary", { answers: ev.answers, cityLabel: "Delhi", items, readiness: computeReadiness(items), generatedOn: "2026-10-10" });
    return doc.blocks.flatMap((b) => b.rows ?? []);
  };
  it("the event summary lists speakers, promotional status and traffic footprint when given", async () => {
    const rows = await render({ speakers: "Dr A (keynote)", promoStatus: "PRINTED", trafficFootprint: "Two roads", description: "A rally" });
    const m = new Map(rows);
    expect(m.get("Speakers / VIPs")).toBe("Dr A (keynote)");
    expect(m.get("Promotional material")).toBe("Printed");
    expect(m.get("Route and traffic footprint")).toBe("Two roads");
  });
  it("they are omitted when empty", async () => {
    const labels = (await render({})).map(([k]) => k);
    expect(labels).not.toContain("Speakers / VIPs");
    expect(labels).not.toContain("Promotional material");
  });
});

describe("change after application", () => {
  beforeEach(resetDelhi);
  const small = { attendance: 500, description: "Original purpose of the event" };
  it("a material change BEFORE applying is recorded without a re-confirm warning", async () => {
    const ev = await delhiEvent(small);
    const r = await updateEventDetails(ev, { ...ev.answers, speakers: "A new VIP" });
    expect(r).toMatchObject({ changed: true, material: true, afterApplication: false });
    expect(await openChangeNotices(ev.id)).toEqual([]);
  });
  it("a material change AFTER applying raises the re-confirm notice, appends a RECHECK snapshot and runs a restriction check", async () => {
    const ev = await delhiEvent(small);
    const before = (await query("SELECT count(*)::int AS n FROM event_evaluations WHERE event_id=$1", [ev.id]))[0].n;
    await markApplicationSubmitted(ev.id, true);
    const r = await updateEventDetails(ev, { ...ev.answers, description: "A different purpose entirely", attendance: 900 });
    expect(r).toMatchObject({ material: true, afterApplication: true });
    expect(r.materialLabels).toEqual(expect.arrayContaining(["purpose", "expected crowd"]));
    const notes = await openChangeNotices(ev.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].materialLabels).toEqual(expect.arrayContaining(["purpose"]));
    expect((await query("SELECT count(*)::int AS n FROM event_evaluations WHERE event_id=$1", [ev.id]))[0].n).toBe(before + 1);
    expect((await query("SELECT reason FROM event_evaluations WHERE event_id=$1 ORDER BY evaluated_at DESC LIMIT 1", [ev.id]))[0].reason).toBe("RECHECK");
    expect((await listChecks(ev.id)).map((c) => c.trigger)).toContain("RECHECK");
    await acknowledgeChanges(ev.id);
    expect(await openChangeNotices(ev.id)).toEqual([]);
  });
  it("route, speakers, nature of event: each triggers the notice after applying; organizer phone does not", async () => {
    const ev = await delhiEvent(small);
    await markApplicationSubmitted(ev.id, true);
    let cur = ev;
    for (const patch of [{ startLocation: "Somewhere else" }, { trafficFootprint: "Closes Ring Road" }, { kind: "march" as const, destination: "India Gate area" }]) {
      const r = await updateEventDetails(cur, { ...cur.answers, ...patch });
      expect(r.afterApplication, JSON.stringify(patch)).toBe(true);
      cur = (await getEvent(ev.id))!;
    }
    await acknowledgeChanges(ev.id);
    const r = await updateEventDetails(cur, { ...cur.answers, organizerPhone: "99999 99999" });
    expect(r).toMatchObject({ changed: true, material: false, afterApplication: false });
    expect(await openChangeNotices(ev.id)).toEqual([]);
  });
  it("saving with no changes does nothing", async () => {
    const ev = await delhiEvent(small);
    expect(await updateEventDetails(ev, ev.answers)).toMatchObject({ changed: false });
  });
});

describe("sources keep feed settings when saved from a form that does not mention them", () => {
  beforeEach(resetDelhi);
  it("editing the feed source without parser/feedRole preserves them", async () => {
    const [s] = await query("SELECT * FROM sources WHERE id=$1", [feedId]);
    await saveSource(feedId, {
      title: s.title, sourceType: s.source_type, issuingAuthority: s.issuing_authority, jurisdictionId: s.jurisdiction_id, canonicalUrl: s.canonical_url, publicationDate: null, effectiveDate: null, retrievedAt: null,
      active: true, monitoringEnabled: true, monitoringFrequency: "DAILY", notes: "edited by an admin",
    }, actor);
    const [after] = await query("SELECT parser, feed_role, notes FROM sources WHERE id=$1", [feedId]);
    expect(after).toMatchObject({ parser: "ORDER_NOTICES", feed_role: "LIVE_RESTRICTIONS", notes: "edited by an admin" });
  });
});
