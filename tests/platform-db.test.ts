// Integration tests against the dedicated test database (never the dev DB).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { evaluate } from "@/lib/engine/evaluate";
import { addJurisdiction, createEvent, getRulesByIds, jurisdictionChain, rulesForChain, setRequirementDone, getEvent } from "@/lib/store";
import {
  applicableFor, archiveRule, assertHuman, cloneAsNewVersion, currentFingerprint, dismissChange, generateEvaluation, latestEvaluation, linkSource, listChangeEvents,
  listEvaluations, publishRule, recheckEvent, recordSourceContent, saveRestriction, saveRuleDraft, saveSource, saveTemplateVersion, selectTemplateMap, startReplacement,
  submitForReview, type RuleInput,
} from "@/lib/knowledge";
import { ensureDefaultTemplates } from "@/lib/default-templates";
import { baseAnswers } from "./fixtures";
import type { ChangeAssistant } from "@/lib/engine/watch";

let admin: { userId: string };
let country: string, region: string, city: string, venue: string;

beforeAll(async () => {
  await migrate(process.env.DATABASE_URL!);
});
afterAll(async () => { await pool().end(); });

beforeEach(async () => {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  admin = { userId: (await one<{ id: string }>("INSERT INTO users (email, password_hash, role) VALUES ('a@x.org','x','admin') RETURNING id"))!.id };
  country = await addJurisdiction({ parentId: null, level: "country", name: "Testland", supported: false });
  region = await addJurisdiction({ parentId: country, level: "region", name: "Testregion", supported: false });
  city = await addJurisdiction({ parentId: region, level: "city", name: "Testville", supported: true });
  venue = await addJurisdiction({ parentId: city, level: "venue", name: "Test Square", supported: false });
});

const input = (over: Partial<RuleInput> = {}): RuleInput => ({
  jurisdictionId: city, authorityId: null, assemblyType: "any", title: "Sound approval", description: "plain", legalStatement: "legal", userAction: "act", category: "permissions",
  requirementType: "permission", level: "REQUIRED", elseLevel: null, severity: "CRITICAL", legalCertainty: "PRIMARY_VERIFIED", condition: { all: [], any: [] }, completeWhen: null, deadline: { kind: "UNKNOWN" },
  submissionMethod: "", officialLink: null, documents: [], vendorCategory: null, effectiveFrom: "2026-01-01", effectiveUntil: null, lastVerifiedAt: "2026-09-01", needsReview: false,
  confidence: "high", ruleOwner: "ops", adminNotes: "", sort: 10, inheritanceMode: "ADD", overridesFamilyId: null, ...over,
});

const officialSource = (title = "Official order", over = {}) =>
  saveSource(null, { title, sourceType: "OFFICIAL_ADMINISTRATIVE_RULE", issuingAuthority: "Authority", jurisdictionId: city, canonicalUrl: "https://example.org/order", publicationDate: null, effectiveDate: null, retrievedAt: "2026-09-01", active: true, monitoringEnabled: true, monitoringFrequency: "WEEKLY", notes: "", ...over }, admin);

async function liveRule(over: Partial<RuleInput> = {}, sourceId?: string) {
  const id = await saveRuleDraft(null, input(over), admin);
  await linkSource(id, sourceId ?? (await officialSource()), { strength: "PRIMARY", sectionRef: "s.1" }, admin);
  await publishRule(id, admin);
  return id;
}

const eventFor = async (jurisdiction = city, over = {}) => {
  const id = await createEvent("anon-1", null, jurisdiction, { ...baseAnswers, ...over });
  return (await getEvent(id))!;
};

describe("jurisdiction model", () => {
  it("builds a general->specific chain of any depth and inherits rules downward", async () => {
    expect(await jurisdictionChain(venue)).toEqual([country, region, city, venue]);
    await liveRule({ jurisdictionId: country, title: "National rule" });
    await liveRule({ jurisdictionId: venue, title: "Venue rule" });
    const { rules } = await applicableFor(await jurisdictionChain(venue), "2026-12-01", baseAnswers);
    expect(rules.map((r) => r.title).sort()).toEqual(["National rule", "Venue rule"]);
    const cityOnly = await applicableFor(await jurisdictionChain(city), "2026-12-01", baseAnswers);
    expect(cityOnly.rules.map((r) => r.title)).toEqual(["National rule"]);
  });
  it("a venue event uses the venue rules; the dev flow with only a city keeps working", async () => {
    await liveRule({ jurisdictionId: venue, title: "Venue rule" });
    const e = await eventFor(city);
    expect((await generateEvaluation(e)).rules.map((r) => r.title)).toEqual([]);
    const v = await eventFor(city); // venue-specific events carry venue_jurisdiction_id
    await query("UPDATE events SET venue_jurisdiction_id=$2 WHERE id=$1", [v.id, venue]);
    expect((await generateEvaluation((await getEvent(v.id))!)).rules.map((r) => r.title)).toEqual(["Venue rule"]);
  });
});

describe("rule lifecycle", () => {
  it("only a human can publish; AI/system actors are rejected", async () => {
    const id = await saveRuleDraft(null, input(), admin);
    await linkSource(id, await officialSource(), { strength: "PRIMARY" }, admin);
    for (const bad of [null, undefined, { userId: "ai" }, { userId: "" }, { userId: "system" }] as any[]) {
      await expect(publishRule(id, bad)).rejects.toThrow(/human reviewer/);
    }
    expect(() => assertHuman({ userId: "ai-agent" })).toThrow();
    expect((await query("SELECT rule_status FROM rules WHERE id=$1", [id]))[0].rule_status).toBe("DRAFT");
  });
  it("cannot publish without an official source, or with only secondary reporting, or without a verified date", async () => {
    const id = await saveRuleDraft(null, input(), admin);
    await expect(publishRule(id, admin)).rejects.toThrow(/official source/);
    const news = await officialSource("News report", { sourceType: "SECONDARY_LEAD" });
    await linkSource(id, news, { strength: "LEAD" }, admin);
    await expect(publishRule(id, admin)).rejects.toThrow(/official source/);
    const unc = await saveRuleDraft(null, input({ legalCertainty: "UNVERIFIED" }), admin);
    await linkSource(unc, await officialSource("Order 0"), { strength: "PRIMARY" }, admin);
    await expect(publishRule(unc, admin)).rejects.toThrow(/legal certainty/);
    const sup = await saveRuleDraft(null, input(), admin);
    await linkSource(sup, await officialSource("Order S"), { strength: "SUPPORTING" }, admin);
    await expect(publishRule(sup, admin)).rejects.toThrow(/PRIMARY evidence/); // PRIMARY_VERIFIED needs primary-strength evidence
    const id2 = await saveRuleDraft(null, input({ lastVerifiedAt: null }), admin);
    await linkSource(id2, await officialSource("Order 2"), { strength: "PRIMARY" }, admin);
    await expect(publishRule(id2, admin)).rejects.toThrow(/last-verified/);
  });
  it("DRAFT -> UNDER_REVIEW -> ACTIVE, and live rules are not editable in place", async () => {
    const id = await saveRuleDraft(null, input(), admin);
    await linkSource(id, await officialSource(), { strength: "PRIMARY" }, admin);
    await submitForReview(id, admin);
    expect((await query("SELECT rule_status FROM rules WHERE id=$1", [id]))[0].rule_status).toBe("UNDER_REVIEW");
    await publishRule(id, admin, "initial publication");
    expect((await query("SELECT rule_status, reviewed_by FROM rules WHERE id=$1", [id]))[0]).toMatchObject({ rule_status: "ACTIVE", reviewed_by: admin.userId });
    await expect(saveRuleDraft(id, input({ title: "sneaky edit" }), admin)).rejects.toThrow(/Clone/);
    await expect(linkSource(id, await officialSource("x"), { strength: "PRIMARY" }, admin)).rejects.toThrow(/draft/);
  });
  it("only ACTIVE rules with real evidence render as verified; a draft never reaches users", async () => {
    const draft = await saveRuleDraft(null, input({ title: "Draft only" }), admin);
    const live = await liveRule({ title: "Live" });
    const { rules } = await applicableFor([country, region, city], "2026-12-01", baseAnswers);
    expect(rules.map((r) => r.id)).toEqual([live]);
    expect(rules.find((r) => r.id === draft)).toBeUndefined();
    expect(evaluate(rules, baseAnswers)[0].freshness).toBe("CURRENT");
  });
  it("audit log records before/after for publish and supersede", async () => {
    const v1 = await liveRule();
    const v2 = await cloneAsNewVersion(v1, admin);
    await expect(publishRule(v2, admin)).rejects.toThrow(/legal certainty/); // a clone loses its certainty until a human re-confirms it
    await saveRuleDraft(v2, input({ lastVerifiedAt: null }), admin);
    await expect(publishRule(v2, admin)).rejects.toThrow(/last-verified/); // ...and must be re-verified
    await saveRuleDraft(v2, input({ lastVerifiedAt: "2026-10-01" }), admin);
    await publishRule(v2, admin, "deadline changed");
    const rows = await query("SELECT action, before, after, reason, actor_user_id FROM audit_log WHERE entity='rule' ORDER BY id");
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["rule.create", "rule.publish", "rule.clone_version", "rule.supersede"]));
    const sup = rows.find((r) => r.action === "rule.supersede")!;
    expect(sup.before).toMatchObject({ status: "ACTIVE" });
    expect(sup.after).toMatchObject({ status: "SUPERSEDED" });
    expect(rows.find((r) => r.action === "rule.publish" && r.reason === "deadline changed")).toBeTruthy();
    expect(rows.every((r) => r.actor_user_id === admin.userId)).toBe(true);
  });
});

describe("versioning and event snapshots", () => {
  it("clone -> edit -> publish supersedes the old version on the new effective date", async () => {
    const v1 = await liveRule({ deadline: { kind: "STRUCTURED", minimumDaysBeforeEvent: 7, dayType: "CALENDAR" } });
    const v2 = await cloneAsNewVersion(v1, admin);
    await saveRuleDraft(v2, input({ deadline: { kind: "STRUCTURED", minimumDaysBeforeEvent: 14, dayType: "CALENDAR" }, effectiveFrom: "2027-01-01", lastVerifiedAt: "2026-12-20" }), admin);
    await publishRule(v2, admin, "deadline moved to 14 days");
    const [a, b] = await getRulesByIds([v1, v2]);
    const old = a.id === v1 ? a : b, neu = a.id === v1 ? b : a;
    expect(old).toMatchObject({ status: "SUPERSEDED", effectiveUntil: "2027-01-01", version: 1 });
    expect(neu).toMatchObject({ status: "ACTIVE", effectiveFrom: "2027-01-01", version: 2, supersedesRuleId: v1 });
    expect(neu.ruleFamilyId).toBe(old.ruleFamilyId);
    const chain = [country, region, city];
    expect((await applicableFor(chain, "2026-12-31", baseAnswers)).rules[0].version).toBe(1);
    expect((await applicableFor(chain, "2027-01-01", baseAnswers)).rules[0].version).toBe(2);
    expect(evaluate((await applicableFor(chain, "2027-01-20", baseAnswers)).rules, { ...baseAnswers, date: "2027-01-20" })[0].deadline).toBe("2027-01-06");
  });
  it("refuses a second concurrent draft of the same family", async () => {
    const v1 = await liveRule();
    await cloneAsNewVersion(v1, admin);
    await expect(cloneAsNewVersion(v1, admin)).rejects.toThrow(/draft version/);
  });
  it("an event keeps the version it was generated with, and a recheck appends a new snapshot", async () => {
    const v1 = await liveRule({ effectiveFrom: "2026-01-01" });
    const e = await eventFor(city, { date: "2027-03-01" });
    const first = await generateEvaluation(e);
    expect(first.ruleIds).toEqual([v1]);
    await setRequirementDone(e.id, v1, true);

    const v2 = await cloneAsNewVersion(v1, admin);
    await saveRuleDraft(v2, input({ effectiveFrom: "2027-01-01", lastVerifiedAt: "2026-12-30" }), admin);
    await publishRule(v2, admin);

    // Yesterday's snapshot is untouched and still pins v1.
    const still = await latestEvaluation(e.id);
    expect(still!.id).toBe(first.id);
    expect(still!.ruleIds).toEqual([v1]);
    expect((await getRulesByIds(still!.ruleIds))[0].version).toBe(1);
    // ...but the plan can tell that the rules have moved on.
    expect(await currentFingerprint(e)).not.toBe(first.fingerprint);

    const second = await recheckEvent(e);
    expect(second.ruleIds).toEqual([v2]);
    expect(second.reason).toBe("RECHECK");
    expect((await listEvaluations(e.id)).map((x) => x.id)).toEqual([second.id, first.id]);
    // done ticks carry over by rule family
    expect((await query("SELECT done FROM event_requirements WHERE event_id=$1 AND rule_id=$2", [e.id, v2]))[0].done).toBe(true);
    expect(await currentFingerprint(e)).toBe(second.fingerprint);
  });
  it("event_evaluations rows are immutable", async () => {
    await liveRule();
    const snap = await generateEvaluation(await eventFor());
    await expect(query("UPDATE event_evaluations SET readiness_pct=99 WHERE id=$1", [snap.id])).rejects.toThrow(/immutable/);
    expect((await latestEvaluation(snap.eventId))!.readinessPct).toBe(snap.readinessPct);
  });
  it("the snapshot records answers, rules, sources, requirements and restrictions", async () => {
    await liveRule();
    const snap = await generateEvaluation(await eventFor());
    expect(snap.answers.name).toBe("Test assembly");
    expect(snap.rules[0]).toMatchObject({ title: "Sound approval", freshness: "CURRENT", version: 1 });
    expect(snap.sources).toHaveLength(1);
    expect(snap.requirements[0]).toMatchObject({ title: "Sound approval", severity: "CRITICAL" });
    expect(snap.asOfDate).toBe("2026-12-01");
  });
  it("archived rules leave new evaluations but old snapshots still reference them", async () => {
    const id = await liveRule();
    const e = await eventFor();
    await generateEvaluation(e);
    await archiveRule(id, admin, "retired");
    expect((await recheckEvent(e)).ruleIds).toEqual([]);
    expect((await listEvaluations(e.id))[1].ruleIds).toEqual([id]);
  });
});

describe("temporary restrictions through the stack", () => {
  it("is stored per jurisdiction and applies to events in its window", async () => {
    await liveRule({ condition: { all: [{ field: "sound", op: "eq", value: true }], any: [] } });
    const src = await officialSource("Public order notification", { sourceType: "OFFICIAL_ADMINISTRATIVE_RULE", canonicalUrl: "https://example.org/notice" });
    await saveRestriction(null, { jurisdictionId: region, title: "Temporary order", geographicScope: "Central district", startsAt: "2026-11-30T00:00:00Z", endsAt: "2026-12-02T00:00:00Z", legalBasis: "Test order 1", affectedActivities: ["SOUND"], effect: "PROHIBITED", plainExplanation: "No amplified sound", sourceId: src, status: "ACTIVE" }, admin);
    const ans = { ...baseAnswers, sound: true };
    expect((await applicableFor([country, region, city], "2026-12-01", ans)).overlays).toHaveLength(1);
    expect((await applicableFor([country, region, city], "2026-12-05", ans)).overlays).toHaveLength(0);
    await expect(saveRestriction(null, { jurisdictionId: region, title: "No source", geographicScope: "", startsAt: "2026-11-30T00:00:00Z", endsAt: "2026-12-02T00:00:00Z", legalBasis: "", affectedActivities: ["ALL"], effect: "RESTRICTED", plainExplanation: "", sourceId: null, status: "ACTIVE" }, admin)).rejects.toThrow(/needs a source/);
  });
});

describe("regulatory watch", () => {
  it("baseline, unchanged, changed -> review item, flagged rules, user-facing freshness", async () => {
    const src = await officialSource();
    const id = await liveRule({}, src);
    expect((await recordSourceContent(src, "Notice required 7 days before.")).kind).toBe("BASELINE");
    expect((await recordSourceContent(src, "Notice   required 7 days before.")).kind).toBe("UNCHANGED"); // whitespace only
    const r = await recordSourceContent(src, "Notice required 14 days before.");
    expect(r.kind).toBe("CHANGED");
    if (r.kind !== "CHANGED") return;
    expect(r.affectedRuleIds).toEqual([id]);
    const [ev] = await listChangeEvents("PENDING");
    expect(ev).toMatchObject({ reviewStatus: "PENDING", materiality: "POTENTIALLY_MATERIAL", sourceTitle: "Official order" });
    expect(ev.affectedRules[0]).toMatchObject({ id, status: "CHANGE_DETECTED" });
    // The old rule is no longer presented as unquestionably current.
    const { rules } = await applicableFor([country, region, city], "2026-12-01", baseAnswers);
    expect(evaluate(rules, baseAnswers)[0].freshness).toBe("CHANGE_UNDER_REVIEW");
    expect(rules[0].status).toBe("CHANGE_DETECTED");
    expect((await query("SELECT count(*)::int AS n FROM source_snapshots WHERE source_id=$1", [src]))[0].n).toBe(2);
  });
  it("dismissing a change returns the rule to ACTIVE and records the review", async () => {
    const src = await officialSource();
    const id = await liveRule({}, src);
    await recordSourceContent(src, "v1 text here");
    await recordSourceContent(src, "v2 text here changed");
    const [ev] = await listChangeEvents("PENDING");
    await dismissChange(ev.id, admin, "Typo fix only");
    expect((await query("SELECT rule_status FROM rules WHERE id=$1", [id]))[0].rule_status).toBe("ACTIVE");
    expect((await listChangeEvents())[0]).toMatchObject({ reviewStatus: "DISMISSED", reviewNotes: "Typo fix only" });
    await expect(dismissChange(ev.id, admin, "again")).rejects.toThrow(/pending/);
  });
  it("approving a new version: change -> replacement draft -> publish -> change event closes, old rule superseded", async () => {
    const src = await officialSource();
    const v1 = await liveRule({}, src);
    await recordSourceContent(src, "Notice required 7 days before.");
    await recordSourceContent(src, "Notice required 14 days before.");
    const [ev] = await listChangeEvents("PENDING");
    const v2 = await startReplacement(ev.id, v1, admin);
    await saveRuleDraft(v2, input({ deadline: { kind: "STRUCTURED", minimumDaysBeforeEvent: 14, dayType: "CALENDAR" }, lastVerifiedAt: "2026-10-01" }), admin);
    await publishRule(v2, admin, "Source now says 14 days");
    expect((await query("SELECT rule_status FROM rules WHERE id=$1", [v1]))[0].rule_status).toBe("SUPERSEDED");
    expect((await query("SELECT rule_status FROM rules WHERE id=$1", [v2]))[0].rule_status).toBe("ACTIVE");
    expect((await listChangeEvents())[0]).toMatchObject({ reviewStatus: "APPROVED_UPDATE" });
    expect((await query("SELECT replacement_rule_id FROM change_event_rules WHERE rule_id=$1", [v1]))[0].replacement_rule_id).toBe(v2);
  });
  it("AI cannot publish: even a confident 'cosmetic' suggestion leaves the rule flagged for a human", async () => {
    const src = await officialSource();
    const id = await liveRule({}, src);
    await recordSourceContent(src, "original text of the order");
    const overconfidentAi: ChangeAssistant = () => ({ summary: "Nothing to see, mark it current.", materiality: "COSMETIC", priority: "LOW", origin: "AI", diffExcerpt: "" });
    const r = await recordSourceContent(src, "completely different text now", overconfidentAi);
    expect(r.kind).toBe("CHANGED");
    expect((await query("SELECT rule_status, reviewed_by FROM rules WHERE id=$1", [id]))[0]).toMatchObject({ rule_status: "CHANGE_DETECTED" });
    const [ev] = await listChangeEvents("PENDING");
    expect(ev).toMatchObject({ summaryOrigin: "AI", reviewStatus: "PENDING" });
    // and the only publish/approve paths demand a human actor
    await expect(dismissChange(ev.id, { userId: "ai" }, "auto")).rejects.toThrow(/human reviewer/);
    await expect(startReplacement(ev.id, id, undefined as any)).rejects.toThrow(/human reviewer/);
  });
  it("a source with no linked rules still creates a review item", async () => {
    const src = await officialSource();
    await recordSourceContent(src, "first");
    await recordSourceContent(src, "second, different");
    const [ev] = await listChangeEvents("PENDING");
    expect(ev.affectedRules).toEqual([]);
  });
  it("secondary-lead sources never verify a rule, so a news story cannot upgrade guidance", async () => {
    const lead = await officialSource("Newspaper", { sourceType: "SECONDARY_LEAD" });
    const id = await saveRuleDraft(null, input(), admin);
    await linkSource(id, lead, { strength: "LEAD" }, admin);
    await expect(publishRule(id, admin)).rejects.toThrow();
  });
});

describe("document templates are data", () => {
  it("each save creates the next version; selection honours jurisdiction specificity and effective dates", async () => {
    const base = { templateKey: "request-letter", name: "Letter", authorityId: null, disclaimer: "d", sourceId: null };
    const g2 = await saveTemplateVersion({ ...base, jurisdictionId: null, content: "global v2", effectiveFrom: null, effectiveUntil: null }, admin);
    expect(g2.version).toBe(2); // v1 is the seeded default
    const c1 = await saveTemplateVersion({ ...base, jurisdictionId: city, content: "city v1 early", effectiveFrom: null, effectiveUntil: "2027-01-01" }, admin);
    const c2 = await saveTemplateVersion({ ...base, jurisdictionId: city, content: "city v2 from 2027", effectiveFrom: "2027-01-01", effectiveUntil: null }, admin);
    expect([c1.version, c2.version]).toEqual([1, 2]);
    const chain = [country, region, city];
    expect((await selectTemplateMap(chain, "2026-06-01"))["request-letter"]!.content).toBe("city v1 early");
    expect((await selectTemplateMap(chain, "2027-06-01"))["request-letter"]!.content).toBe("city v2 from 2027");
    expect((await selectTemplateMap([country], "2027-06-01"))["request-letter"]!.content).toBe("global v2");
    expect(Object.keys(await selectTemplateMap(chain, "2026-06-01")).sort()).toEqual(["document-checklist", "event-summary", "organizer-details", "request-letter", "route-details", "undertaking"]);
  });
});

describe("migration of V0-shaped data", () => {
  it("rules table keeps the V0 columns and the new model coexists", async () => {
    const cols = (await query("SELECT column_name FROM information_schema.columns WHERE table_name='rules'")).map((r) => r.column_name);
    expect(cols).toEqual(expect.arrayContaining(["description", "required_documents", "deadline_days_before", "rule_family_id", "version", "rule_status", "supersedes_rule_id", "deadline_definition", "legal_certainty"]));
    expect((await query("SELECT name FROM schema_migrations ORDER BY name")).map((r) => r.name)).toEqual(["db/migrations/002_rules_platform.sql", "db/migrations/003_legal_certainty.sql", "db/schema.sql"]);
    expect(await rulesForChain([city])).toEqual([]);
  });
});
