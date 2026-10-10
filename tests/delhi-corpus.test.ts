// Delhi / Jantar Mantar corpus + the three required scenarios, against the dedicated test database.
// The Standing Order URL below is a TEST FIXTURE; the real official URL is supplied by a human at load time.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { computeReadiness } from "@/lib/engine/readiness";
import { evaluate, evidenceStatus } from "@/lib/engine/evaluate";
import type { EvaluatedItem } from "@/lib/engine/types";
import { applicableFor, chainFor, linkSource, listChangeEvents, recordSourceContent, runDueChecks, selectTemplateMap } from "@/lib/knowledge";
import { createEvent, getEvent, getRulesByIds, listSupportedCities } from "@/lib/store";
import { ensureDefaultTemplates } from "@/lib/default-templates";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { OFFICIAL_INDEX_URL, RULES, SOURCES, STANDING_ORDER_URL } from "../data/delhi/corpus";
import { baseAnswers } from "./fixtures";

const TEST_FIXTURE_URL = "https://example.org/test-fixture/standing-order-L&O-48-2022.pdf";
let actor: { userId: string };
let district: string, jm: string;

async function wipe() {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  actor = { userId: (await one<{ id: string }>("INSERT INTO users (email, password_hash, role) VALUES ('a@x.org','x','admin') RETURNING id"))!.id };
}

/** Fully verified + live load using a test-fixture URL (so the suite never depends on the real PDF). */
async function reset(withUrl: boolean) {
  await wipe();
  const report = await loadDelhiCorpus({ actor, standingOrderUrl: withUrl ? TEST_FIXTURE_URL : null, verifiedOn: "2026-10-01", confirmVerified: true, goLive: true });
  district = report.places.DIST;
  jm = report.places.JM;
  return report;
}

/** Evaluates a plan exactly as the product does: chain -> select rules for the date -> evaluate. */
async function plan(over: Record<string, unknown>, venue: string | null = jm) {
  const answers = { ...baseAnswers, date: "2026-12-01", ...over } as typeof baseAnswers;
  const id = await createEvent("anon", null, district, answers, venue);
  const event = (await getEvent(id))!;
  const chain = await chainFor(event);
  const { rules, overlays } = await applicableFor(chain, event.date, answers);
  const items = evaluate(rules, answers, new Set(), overlays);
  const by = new Map<string, EvaluatedItem>(items.map((i) => [i.rule.ruleFamilyId, i]));
  return { items, by, families: [...by.keys()].sort(), readiness: computeReadiness(items), chain };
}

const JM_ALWAYS = ["DEL-JM-001", "DEL-JM-002", "DEL-JM-003", "DEL-JM-004", "DEL-JM-005", "DEL-JM-006", "DEL-JM-007", "DEL-JM-012", "DEL-JM-015", "DEL-JM-016", "DEL-JM-017", "DEL-JM-018", "DEL-JM-019", "DEL-JM-020", "DEL-JM-021", "DEL-JM-022", "DEL-JM-023", "DEL-JM-024", "DEL-JM-025", "DEL-JM-026"];

beforeAll(async () => { await migrate(process.env.DATABASE_URL!); });
afterAll(async () => { await pool().end(); });

describe("corpus shape", () => {
  let report: Awaited<ReturnType<typeof reset>>;
  beforeAll(async () => { report = await reset(true); });

  it("defines the 29 requested families, the conservative generic-march baseline (PROC-001…004) and two held gap records", () => {
    const wanted = [...Array.from({ length: 26 }, (_, i) => `DEL-JM-${String(i + 1).padStart(3, "0")}`), "DEL-TRAFFIC-001", "DEL-LIVE-001", "DEL-RAM-001"];
    const extra = ["DEL-PROC-001", "DEL-PROC-002", "DEL-PROC-003", "DEL-PROC-004", "DEL-RAM-101", "DEL-RAM-102", "DEL-RAM-103", "DEL-JM-027", "DEL-JM-028"];
    expect(RULES.map((r) => r.family).filter((f) => !["DEL-RAM-002", "DEL-PROC-100"].includes(f)).sort()).toEqual([...wanted, ...extra].sort());
    expect(RULES.filter((r) => r.holdForReview).map((r) => r.family).sort()).toEqual(["DEL-PROC-100", "DEL-RAM-002"]);
  });
  it("publishes all 29 with a named human reviewer, and keeps the Ramlila booking workflow UNDER_REVIEW", async () => {
    expect(report).toMatchObject({ published: 38, drafted: 0, heldForReview: 2, districtLive: true });
    const rows = await query("SELECT rule_family_id, rule_status, legal_certainty, reviewed_by FROM rules ORDER BY rule_family_id");
    const status = new Map(rows.map((r) => [r.rule_family_id, r]));
    expect(status.get("DEL-RAM-002")).toMatchObject({ rule_status: "UNDER_REVIEW", legal_certainty: "UNVERIFIED", reviewed_by: null });
    expect(status.get("DEL-PROC-100")).toMatchObject({ rule_status: "UNDER_REVIEW", legal_certainty: "UNVERIFIED", reviewed_by: null });
    for (const r of RULES.filter((x) => !x.holdForReview)) {
      expect(status.get(r.family)).toMatchObject({ rule_status: "ACTIVE", reviewed_by: actor.userId });
    }
  });
  it("marks Standing Order and Traffic Police rules PRIMARY_VERIFIED; the notifications check is OFFICIAL_GUIDANCE", async () => {
    const cert = Object.fromEntries((await query("SELECT rule_family_id, legal_certainty FROM rules")).map((r) => [r.rule_family_id, r.legal_certainty]));
    const guidance = ["DEL-LIVE-001", "DEL-PROC-002", "DEL-PROC-004", "DEL-RAM-101", "DEL-RAM-102", "DEL-RAM-103"]; // official current practice / hedged: never labelled primary-verified
    for (const r of RULES.filter((x) => !x.holdForReview && !guidance.includes(x.family))) expect(cert[r.family], r.family).toBe("PRIMARY_VERIFIED");
    for (const f of guidance) expect(cert[f], f).toBe("OFFICIAL_GUIDANCE");
  });
  it("does not invent Ramlila booking steps or the land-owner process", async () => {
    const [ram1] = await query("SELECT plain_text FROM (SELECT description AS plain_text FROM rules WHERE rule_family_id='DEL-RAM-001') x");
    expect(ram1.plain_text).toMatch(/not verified/i);
    const [ram2] = await query("SELECT legal_statement, user_action, (SELECT count(*) FROM rule_sources WHERE rule_id=rules.id)::int AS sources FROM rules WHERE rule_family_id='DEL-RAM-002'");
    expect(ram2).toMatchObject({ legal_statement: "", user_action: "", sources: 0 });
    const [noc] = await query("SELECT description FROM rules WHERE rule_family_id='DEL-JM-022'");
    expect(noc.description).toMatch(/not yet verified/i);
  });
  it("monitors exactly the L&O/48/2022 PDF, the L&O/10/2022 index entry, the Traffic Police NOC page and the notifications feed", async () => {
    const s = await query("SELECT title, source_type, monitoring_enabled, monitoring_frequency FROM sources ORDER BY title");
    expect(s).toHaveLength(SOURCES.length);
    const monitored = s.filter((x) => x.monitoring_enabled).map((x) => x.title);
    expect(monitored).toHaveLength(4);
    expect(monitored.some((t) => /L&O\/48\/2022/.test(t)) && monitored.some((t) => /Traffic Police/.test(t)) && monitored.some((t) => /Notifications/.test(t)) && monitored.some((t) => /rallies\/procession/.test(t))).toBe(true);
    expect(s.find((x) => /Notifications/.test(x.title))).toMatchObject({ monitoring_frequency: "DAILY", source_type: "OFFICIAL_CURRENT_PRACTICE" });
  });
  it("is idempotent: loading again changes nothing", async () => {
    const before = (await query("SELECT count(*)::int AS n FROM rules"))[0].n;
    const again = await loadDelhiCorpus({ actor, standingOrderUrl: TEST_FIXTURE_URL, verifiedOn: "2026-10-01", confirmVerified: true, goLive: true });
    expect(again.published).toBe(0);
    expect((await query("SELECT count(*)::int AS n FROM rules"))[0].n).toBe(before);
    expect((await query("SELECT count(*)::int AS n FROM sources"))[0].n).toBe(SOURCES.length);
  });
  it("makes New Delhi District selectable in the planner, with Jantar Mantar as its venue", async () => {
    expect((await listSupportedCities()).map((c) => c.label)).toEqual(["New Delhi District, NCT Delhi"]);
    expect((await query("SELECT level, parent_id FROM jurisdictions WHERE id=$1", [jm]))[0]).toMatchObject({ level: "venue", parent_id: district });
  });
});

describe("scenario 1: 300-person static protest at Jantar Mantar", () => {
  beforeAll(async () => { await reset(true); });
  it("gets the permission, lead-time, venue, conduct and paperwork rules, and none of the march/sound/vehicle ones", async () => {
    const p = await plan({ attendance: 300, kind: "static", sound: false, vehicles: false, stage: false, food: false });
    expect(p.families).toEqual([...JM_ALWAYS, "DEL-LIVE-001", "DEL-TRAFFIC-001"].sort());
    expect(p.by.get("DEL-JM-001")).toMatchObject({ level: "REQUIRED", freshness: "CURRENT" });
    expect(p.by.get("DEL-JM-001")!.rule.authorityName).toMatch(/New Delhi District/);
    expect(p.by.get("DEL-TRAFFIC-001")!.rule.severity).toBe("CRITICAL");
  });
  it("computes the application deadline as 10 days before the event, and invents no other deadline", async () => {
    const p = await plan({ attendance: 300 });
    expect(p.by.get("DEL-JM-002")!.deadline).toBe("2026-11-21");
    expect(p.items.filter((i) => i.deadline).map((i) => i.rule.ruleFamilyId)).toEqual(["DEL-JM-002"]);
    expect(p.by.get("DEL-TRAFFIC-001")!.deadline).toBeNull();
  });
  it("surfaces the critical blockers first", async () => {
    const p = await plan({ attendance: 300 });
    expect(p.readiness.blockers.map((b) => b.rule.ruleFamilyId).sort()).toEqual(["DEL-JM-001", "DEL-JM-002", "DEL-JM-021", "DEL-JM-022", "DEL-TRAFFIC-001"]);
    expect(p.readiness.pct).toBe(0);
  });
});

describe("scenario 2: 2,000-person rally is routed away from Jantar Mantar", () => {
  beforeAll(async () => { await reset(true); });
  it("with Jantar Mantar selected: shows the cap breach and Ramlila guidance, and none of the Jantar Mantar permission rules", async () => {
    const p = await plan({ attendance: 2000 });
    expect(p.families).toEqual(["DEL-JM-005", "DEL-LIVE-001", "DEL-RAM-001", "DEL-RAM-101", "DEL-RAM-102", "DEL-RAM-103", "DEL-TRAFFIC-001"]);
    expect(p.by.get("DEL-RAM-001")).toMatchObject({ level: "RECOMMENDED", freshness: "CURRENT" });
    expect(p.by.get("DEL-RAM-001")!.rule.severity).toBe("CRITICAL");
    expect(p.readiness.blockers.map((b) => b.rule.ruleFamilyId)).toContain("DEL-RAM-001");
  });
  it("with no venue chosen: Ramlila guidance and the Delhi-wide rules, nothing Jantar Mantar-specific", async () => {
    const p = await plan({ attendance: 2000 }, null);
    expect(p.families).toEqual(["DEL-LIVE-001", "DEL-RAM-001", "DEL-RAM-101", "DEL-RAM-102", "DEL-RAM-103", "DEL-TRAFFIC-001"]);
  });
  it("the threshold is exact: 1,000 stays at Jantar Mantar, 1,001 is routed away", async () => {
    expect((await plan({ attendance: 1000 })).by.has("DEL-RAM-001")).toBe(false);
    expect((await plan({ attendance: 1000 })).by.has("DEL-JM-001")).toBe(true);
    expect((await plan({ attendance: 1001 })).by.has("DEL-RAM-001")).toBe(true);
    expect((await plan({ attendance: 1001 })).by.has("DEL-JM-001")).toBe(false);
  });
  it("never shows the held Ramlila booking-workflow record", async () => {
    for (const a of [1500, 2000, 50000, 60000]) expect((await plan({ attendance: a }, null)).by.has("DEL-RAM-002")).toBe(false);
  });
});

describe("scenario 3: 500-person Jantar Mantar protest with a march and a loudspeaker", () => {
  beforeAll(async () => { await reset(true); });
  it("triggers the separate march rules, the loudspeaker rules and a traffic review", async () => {
    const p = await plan({ attendance: 500, kind: "march", destination: "Parliament Street", sound: true });
    for (const f of ["DEL-JM-008", "DEL-JM-009", "DEL-JM-010", "DEL-JM-011", "DEL-TRAFFIC-001"]) expect(p.by.has(f), f).toBe(true);
    expect(p.by.get("DEL-JM-008")).toMatchObject({ level: "REQUIRED" });
    for (const f of ["DEL-JM-008", "DEL-JM-009", "DEL-JM-010", "DEL-TRAFFIC-001"]) expect(p.by.get(f)!.rule.severity, f).toBe("CRITICAL");
    expect(p.by.get("DEL-JM-010")!.rule.description).toMatch(/specific permission/i);
    expect(p.by.get("DEL-JM-009")!.rule.description).toMatch(/own police permission/i);
    // the generic Delhi march baseline applies on top (conservatively worded, hedged)
    for (const f of ["DEL-PROC-001", "DEL-PROC-002", "DEL-PROC-003", "DEL-PROC-004"]) expect(p.by.has(f), f).toBe(true);
    // still no vehicle rules, still not routed to Ramlila, and the held clause-level record never shows
    for (const f of ["DEL-JM-013", "DEL-JM-014", "DEL-RAM-001", "DEL-PROC-100"]) expect(p.by.has(f), f).toBe(false);
  });
  it("treats those as blockers alongside the base permission", async () => {
    const p = await plan({ attendance: 500, kind: "march", destination: "Parliament Street", sound: true });
    expect(p.readiness.blockers.map((b) => b.rule.ruleFamilyId)).toEqual(expect.arrayContaining(["DEL-JM-001", "DEL-JM-008", "DEL-JM-009", "DEL-JM-010", "DEL-TRAFFIC-001"]));
  });
  it("adds the vehicle rules only when vehicles are planned", async () => {
    const p = await plan({ attendance: 500, vehicles: true });
    expect(p.by.has("DEL-JM-013") && p.by.has("DEL-JM-014")).toBe(true);
    expect(p.by.get("DEL-JM-013")!.rule.vendorCategory).toBe("buses");
  });
});

describe("regulatory watch on the Delhi sources", () => {
  beforeEach(async () => { await reset(true); });
  const src = async (like: string) => (await one<{ id: string }>("SELECT id FROM sources WHERE title ILIKE $1", [like]))!.id;

  it("a change in the notifications feed opens a review item but does NOT flag DEL-LIVE-001", async () => {
    const id = await src("%Notifications%");
    await recordSourceContent(id, "Order 1: Section 163 in force 1-3 Oct");
    const r = await recordSourceContent(id, "Order 1: Section 163 in force 1-3 Oct\nOrder 2: Section 163 in force 8-12 Oct for New Delhi District");
    expect(r.kind).toBe("CHANGED");
    expect((await query("SELECT rule_status FROM rules WHERE rule_family_id='DEL-LIVE-001'"))[0].rule_status).toBe("ACTIVE");
    const [ev] = await listChangeEvents("PENDING");
    expect(ev.sourceTitle).toMatch(/Notifications/);
    expect(ev.affectedRules).toEqual([]);
  });
  it("a change to the Traffic Police NOC page flags DEL-TRAFFIC-001 for human review", async () => {
    const id = await src("%Traffic Police%");
    await recordSourceContent(id, "NOC is required for processions, public rallies and meetings, morchas.");
    await recordSourceContent(id, "NOC is required for processions, public rallies and meetings, morchas. Apply 7 days before.");
    expect((await query("SELECT rule_status FROM rules WHERE rule_family_id='DEL-TRAFFIC-001'"))[0].rule_status).toBe("CHANGE_DETECTED");
  });
  it("a change to the Standing Order flags every rule that cites it, except none are auto-published", async () => {
    const id = await src("%L&O/48/2022%");
    await recordSourceContent(id, "10 days in advance");
    await recordSourceContent(id, "7 days in advance");
    const flagged = await query("SELECT rule_family_id FROM rules WHERE rule_status='CHANGE_DETECTED'");
    expect(flagged).toHaveLength(RULES.filter((r) => r.sources.some((s) => s.key === "SO" && (s.flagOnChange ?? true)) && !r.holdForReview).length);
    expect(flagged.map((f) => f.rule_family_id)).toContain("DEL-JM-002");
    expect((await query("SELECT count(*)::int AS n FROM rules WHERE rule_status='ACTIVE' AND reviewed_at > now()")).at(0)!.n).toBe(0);
  });
});

describe("venue-specific documents", () => {
  beforeAll(async () => { await reset(true); });
  it("a Jantar Mantar event gets the venue templates; a district-only event keeps the global ones", async () => {
    const jmChain = [(await one<{ id: string }>("SELECT id FROM jurisdictions WHERE name='India'"))!.id];
    void jmChain;
    const e = await getEvent(await createEvent("a", null, district, baseAnswers, jm));
    const t = await selectTemplateMap(await chainFor(e!), "2026-12-01");
    expect(t["request-letter"]!.name).toMatch(/Jantar Mantar/);
    expect(t["undertaking"]!.content).toMatch(/Land-owner NOC/);
    expect(t["undertaking"]!.disclaimer).toMatch(/not the official undertaking/i);
    const e2 = await getEvent(await createEvent("a", null, district, baseAnswers, null));
    expect((await selectTemplateMap(await chainFor(e2!), "2026-12-01"))["request-letter"]!.jurisdictionId).toBeNull();
  });
});

describe("without the Standing Order URL nothing is published or guessed", () => {
  it("loads drafts, keeps Delhi non-live, and Traffic/Notifications rules still publish from their own real URLs", async () => {
    const r = await reset(false);
    expect(r.warnings[0]).toMatch(/No Standing Order URL/);
    expect(r.districtLive).toBe(false);
    expect(await listSupportedCities()).toEqual([]);
    const so = RULES.filter((x) => x.sources.some((s) => s.key === "SO") && !x.holdForReview).map((x) => x.family);
    const st = Object.fromEntries((await query("SELECT rule_family_id, rule_status FROM rules")).map((x) => [x.rule_family_id, x.rule_status]));
    for (const f of so) expect(st[f], f).toBe("DRAFT");
    expect(st["DEL-TRAFFIC-001"]).toBe("ACTIVE");
    expect(st["DEL-LIVE-001"]).toBe("ACTIVE");
    expect((await query("SELECT canonical_url FROM sources WHERE title ILIKE '%L&O/48/2022%'"))[0].canonical_url).toBeNull();
    // Supplying the URL later completes the load without duplicating anything.
    const again = await loadDelhiCorpus({ actor: { userId: (await one<{ id: string }>("SELECT id FROM users LIMIT 1"))!.id }, standingOrderUrl: TEST_FIXTURE_URL, verifiedOn: "2026-10-01", confirmVerified: true, goLive: true });
    expect(again.districtLive).toBe(true);
    expect((await query("SELECT count(*)::int AS n FROM rules WHERE rule_family_id='DEL-JM-001'"))[0].n).toBe(1);
    expect((await query("SELECT rule_status FROM rules WHERE rule_family_id='DEL-JM-001'"))[0].rule_status).toBe("ACTIVE");
  });
});

describe("evidence chain for the 10-day lead time", () => {
  beforeAll(async () => { await reset(true); });
  const jm2 = async () => (await getRulesByIds([(await one<{ id: string }>("SELECT id FROM rules WHERE rule_family_id='DEL-JM-002'"))!.id]))[0];

  it("stores the governing instrument, the current-practice confirmation and the press leads as separate sources with different strengths", async () => {
    const r = await jm2();
    const by = Object.fromEntries(r.sources.map((x) => [x.sourceType + ":" + x.strength, x.title]));
    expect(Object.keys(by).sort()).toEqual(["OFFICIAL_ADMINISTRATIVE_RULE:PRIMARY", "OFFICIAL_CURRENT_PRACTICE:SUPPORTING", "SECONDARY_LEAD:LEAD"].sort());
    expect(r.sources).toHaveLength(4);
    expect(by["OFFICIAL_ADMINISTRATIVE_RULE:PRIMARY"]).toMatch(/L&O\/48\/2022/);
    expect(by["OFFICIAL_CURRENT_PRACTICE:SUPPORTING"]).toMatch(/statements and refusal letters/);
  });
  it("keeps 10 calendar days excluding the event day, and says older 2018 material must not override it", async () => {
    const r = await jm2();
    expect(r.deadline).toMatchObject({ kind: "STRUCTURED", minimumDaysBeforeEvent: 10, dayType: "CALENDAR" });
    expect(r.deadline.specialNotes).toMatch(/Excluding the event day/);
    expect(r.deadline.specialNotes).toMatch(/2018 material does not override/);
    expect(r.adminNotes).toMatch(/Do NOT derive the 10 days from Standing Order No\. 10\/2018/);
  });
  it("only the governing instrument verifies the rule: current-practice (no URL) and press leads cannot", async () => {
    const r = await jm2();
    expect(evidenceStatus(r)).toBe("verified");
    expect(evidenceStatus({ ...r, sources: r.sources.filter((x) => x.sourceType !== "OFFICIAL_ADMINISTRATIVE_RULE") })).toBe("needs_verification");
    expect(evidenceStatus({ ...r, sources: r.sources.filter((x) => x.sourceType === "SECONDARY_LEAD") })).toBe("needs_verification");
  });
  it("the press leads and current-practice link never flag the rule when they change", async () => {
    const rows = await query("SELECT s.source_type, rs.flag_on_change FROM rule_sources rs JOIN sources s ON s.id=rs.source_id JOIN rules r ON r.id=rs.rule_id WHERE r.rule_family_id='DEL-JM-002'");
    expect(rows.filter((x) => x.source_type !== "OFFICIAL_ADMINISTRATIVE_RULE").every((x) => x.flag_on_change === false)).toBe(true);
  });
});

describe("Standing Order 10/2018 is history, never a current rule", () => {
  beforeAll(async () => { await reset(true); });
  const old = async () => (await one<{ id: string; lifecycle: string; superseded_by_source_id: string; monitoring_enabled: boolean; canonical_url: string }>("SELECT * FROM sources WHERE title ILIKE '%No. 10/2018%'"))!;

  it("is registered as HISTORICAL, superseded by L&O/48/2022, unmonitored", async () => {
    const o = await old();
    const so = (await one<{ id: string }>("SELECT id FROM sources WHERE title ILIKE '%L&O/48/2022%'"))!;
    expect(o).toMatchObject({ lifecycle: "HISTORICAL", superseded_by_source_id: so.id, monitoring_enabled: false });
    expect(o.canonical_url).toBe("https://delhipolice.gov.in/doc/standing-order/10.pdf");
  });
  it("cannot be attached to a rule as evidence", async () => {
    const draft = await one<{ id: string }>("INSERT INTO rules (rule_family_id, jurisdiction_id, title, category, level, severity) SELECT 'TEST-HIST', jurisdiction_id, 'x','permissions','REQUIRED','REQUIRED' FROM rules LIMIT 1 RETURNING id");
    await expect(linkSource(draft!.id, (await old()).id, { strength: "PRIMARY" }, actor)).rejects.toThrow(/historical source cannot be evidence/);
    expect((await query("SELECT count(*)::int AS n FROM rule_sources WHERE source_id=$1", [(await old()).id]))[0].n).toBe(0);
  });
  it("is ignored even if a row is forced in: it never appears as a rule's evidence", async () => {
    const id = (await one<{ id: string }>("SELECT id FROM rules WHERE rule_family_id='DEL-JM-002'"))!.id;
    await query("INSERT INTO rule_sources (rule_id, source_id, evidence_strength) VALUES ($1,$2,'PRIMARY')", [id, (await old()).id]);
    const [r] = await getRulesByIds([id]);
    expect(r.sources.some((s) => /10\/2018/.test(s.title))).toBe(false);
    await query("DELETE FROM rule_sources WHERE rule_id=$1 AND source_id=$2", [id, (await old()).id]);
  });
  it("is never checked by the watch job", async () => {
    await query("UPDATE sources SET monitoring_enabled=true WHERE lifecycle='HISTORICAL'"); // even if someone forces it on
    const calls: string[] = [];
    await query("UPDATE sources SET last_checked_at = now() - interval '400 days'");
    await runDueChecks(async (u) => { calls.push(u); return "x"; });
    expect(calls.some((u) => u.includes("standing-order/10.pdf"))).toBe(false);
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe("L&O/10/2022: the current generic rallies/processions order (identity known, text not yet extracted)", () => {
  beforeAll(async () => { await reset(true); });
  const src = async () => (await one<Record<string, any>>("SELECT *, to_char(publication_date,'YYYY-MM-DD') AS pd FROM sources WHERE source_code='DEL-SO-LNO-10-2022'"))!;

  it("records the exact identity metadata", async () => {
    expect(await src()).toMatchObject({
      source_code: "DEL-SO-LNO-10-2022", title: "Guidelines for regulation of rallies/procession in Delhi", order_number: "L&O/10/2022", issuing_authority: "Commissioner of Police, Delhi",
      pd: "2022-05-25", source_type: "OFFICIAL_ADMINISTRATIVE_RULE", lifecycle: "CURRENT", index_url: "https://kpkb.delhipolice.gov.in/standingorderNew",
    });
    expect(OFFICIAL_INDEX_URL).toBe("https://kpkb.delhipolice.gov.in/standingorderNew");
  });
  it("has NO document URL, and no StandingOrderFiles URL is invented anywhere for it", async () => {
    const s = await src();
    expect(s.document_url).toBeNull();
    expect(s.canonical_url).toBe(OFFICIAL_INDEX_URL); // what we cite and watch is the index entry
    const all = await query("SELECT canonical_url, document_url FROM sources WHERE source_code <> 'DEL-SO-LNO-48-2022' OR source_code IS NULL");
    expect(all.some((x) => /StandingOrderFiles/.test(`${x.canonical_url} ${x.document_url}`))).toBe(false);
  });
  it("the index is primary evidence for existence only: it is PRIMARY on exactly one rule (the informational existence notice)", async () => {
    const rows = await query("SELECT r.rule_family_id, r.level, rs.evidence_strength, rs.flag_on_change FROM rule_sources rs JOIN rules r ON r.id=rs.rule_id WHERE rs.source_id=$1", [(await src()).id]);
    expect(rows.filter((x) => x.evidence_strength === "PRIMARY").map((x) => x.rule_family_id)).toEqual(["DEL-PROC-001"]);
    expect(rows.find((x) => x.rule_family_id === "DEL-PROC-001")!.level).toBe("UNKNOWN");
    expect(rows.every((x) => x.flag_on_change === false)).toBe(true); // the index changing opens a review item but never flags a rule
  });
  it("structurally refuses an index-only source as primary evidence for a real requirement", async () => {
    const draft = await one<{ id: string }>("INSERT INTO rules (rule_family_id, jurisdiction_id, title, category, level, severity) SELECT 'TEST-IDX', jurisdiction_id, 'x','permissions','REQUIRED','REQUIRED' FROM rules LIMIT 1 RETURNING id");
    await expect(linkSource(draft!.id, (await src()).id, { strength: "PRIMARY" }, actor)).rejects.toThrow(/index-only source establishes that the instrument exists/);
    await expect(linkSource(draft!.id, (await src()).id, { strength: "SUPPORTING" }, actor)).resolves.toBeUndefined();
  });
  it("the existence notice is shown as UNKNOWN and is not scored", async () => {
    const p = await plan({ attendance: 500, kind: "march", destination: "India Gate" }, null);
    const n = p.by.get("DEL-PROC-001")!;
    expect(n).toMatchObject({ level: "UNKNOWN", freshness: "UNKNOWN" });
    expect(n.rule.description).toMatch(/not yet extracted/);
    expect(p.readiness.totalItems).toBe(p.items.filter((i) => i.level !== "UNKNOWN" && i.level !== "NOT_REQUIRED").length);
  });
  it("is watched via its index entry; a change opens a review item and flags no rule", async () => {
    const id = (await src()).id;
    await recordSourceContent(id, "Serial 69 ...\nSerial 70 Guidelines for regulation of rallies/procession in Delhi 25 May 2022");
    await recordSourceContent(id, "Serial 69 ...\nSerial 70 Guidelines for regulation of rallies/procession in Delhi 25 May 2022 [PDF]");
    const [ev] = await listChangeEvents("PENDING");
    expect(ev.sourceTitle).toMatch(/rallies\/procession/);
    expect(ev.affectedRules).toEqual([]);
    expect((await query("SELECT count(*)::int AS n FROM rules WHERE rule_status='CHANGE_DETECTED'"))[0].n).toBe(0);
  });
});

describe("Standing Order 309 and the Ramlila Maidan judgment are context, not current rules", () => {
  beforeAll(async () => { await reset(true); });
  it("309 is HISTORICAL context, superseded in practice by L&O/10/2022, with no URL guessed", async () => {
    const o = (await one<Record<string, any>>("SELECT * FROM sources WHERE source_code='DEL-SO-309'"))!;
    const cur = (await one<{ id: string }>("SELECT id FROM sources WHERE source_code='DEL-SO-LNO-10-2022'"))!;
    expect(o).toMatchObject({ lifecycle: "HISTORICAL", superseded_by_source_id: cur.id, canonical_url: null, document_url: null, monitoring_enabled: false, order_number: "309" });
    expect(o.notes).toMatch(/must NOT be assumed that every clause of 309 survives/);
  });
  it("cannot be evidence for any rule", async () => {
    const o = (await one<{ id: string }>("SELECT id FROM sources WHERE source_code='DEL-SO-309'"))!;
    expect((await query("SELECT count(*)::int AS n FROM rule_sources WHERE source_id=$1", [o.id]))[0].n).toBe(0);
    const draft = await one<{ id: string }>("INSERT INTO rules (rule_family_id, jurisdiction_id, title, category, level, severity) SELECT 'TEST-309', jurisdiction_id, 'x','permissions','REQUIRED','REQUIRED' FROM rules LIMIT 1 RETURNING id");
    await expect(linkSource(draft!.id, o.id, { strength: "SUPPORTING" }, actor)).rejects.toThrow(/historical source cannot be evidence/);
  });
  it("the Supreme Court judgment is binding case law, only supports the procedure rule, and never anything clause-level", async () => {
    const j = (await one<Record<string, any>>("SELECT * FROM sources WHERE source_code='IN-SC-RAMLILA-2012'"))!;
    expect(j).toMatchObject({ source_type: "BINDING_CASE_LAW", lifecycle: "CURRENT" });
    expect(j.canonical_url).toMatch(/^https:\/\/digiscr\.sci\.gov\.in\//);
    const links = await query("SELECT r.rule_family_id, rs.evidence_strength FROM rule_sources rs JOIN rules r ON r.id=rs.rule_id WHERE rs.source_id=$1", [j.id]);
    expect(links).toEqual([{ rule_family_id: "DEL-PROC-002", evidence_strength: "SUPPORTING" }]);
  });
});

describe("generic Delhi marches: conservative, sourced, and never borrowed from Jantar Mantar", () => {
  beforeAll(async () => { await reset(true); });
  const march = (over: Record<string, unknown> = {}, venue: string | null = null) => plan({ attendance: 500, kind: "march", destination: "India Gate", ...over }, venue);

  it("a march elsewhere in Delhi gets the baseline, the Traffic NOC and the live-order check, and no Jantar Mantar rule", async () => {
    const p = await march();
    expect(p.families).toEqual(["DEL-LIVE-001", "DEL-PROC-001", "DEL-PROC-002", "DEL-PROC-003", "DEL-TRAFFIC-001"]);
    expect(p.by.get("DEL-PROC-002")).toMatchObject({ level: "LIKELY_REQUIRED" }); // hedged, not REQUIRED
    expect(p.by.get("DEL-PROC-003")).toMatchObject({ level: "LIKELY_REQUIRED", freshness: "CURRENT" });
  });
  it("sound adds a sound-permission item, honestly labelled as needing verification", async () => {
    const p = await march({ sound: true });
    expect(p.families).toContain("DEL-PROC-004");
    expect(p.by.get("DEL-PROC-004")).toMatchObject({ freshness: "VERIFY_REQUIRED", evidence: "needs_verification" });
    expect(p.by.get("DEL-PROC-004")!.rule.confidence).toBe("low");
  });
  it("never carries the Jantar Mantar 10-day deadline, or any other invented deadline", async () => {
    const p = await march({ sound: true });
    expect(p.items.every((i) => i.deadline === null)).toBe(true);
    expect(p.by.get("DEL-PROC-002")!.rule.deadline.kind).toBe("UNKNOWN");
  });
  it("the route-and-timing rule rests on the Delhi Police Act as primary law, and says the subsection letters are unconfirmed", async () => {
    const r = (await getRulesByIds([(await one<{ id: string }>("SELECT id FROM rules WHERE rule_family_id='DEL-PROC-003'"))!.id]))[0];
    const act = r.sources.find((x) => x.sourceType === "PRIMARY_LAW")!;
    expect(act).toMatchObject({ strength: "PRIMARY", url: "https://www.indiacode.nic.in/handle/123456789/1742?locale=en" });
    expect(act.sectionRef).toMatch(/ss\. 28 and 29/);
    expect(act.sectionRef).toMatch(/to be confirmed/);
    expect(r.confidence).toBe("medium"); // users are told to verify with the authority
    expect(r.legalStatement).toMatch(/to be confirmed against the Act/);
  });
  it("a march at Jantar Mantar still gets the Jantar Mantar rules plus the baseline", async () => {
    const p = await march({}, jm);
    for (const f of ["DEL-JM-008", "DEL-JM-009", "DEL-PROC-002", "DEL-PROC-003"]) expect(p.by.has(f), f).toBe(true);
  });
  it("police operating instructions are never turned into organiser tasks", async () => {
    const rows = await query("SELECT rule_family_id, title, description, user_action, legal_statement FROM rules WHERE rule_family_id LIKE 'DEL-%'");
    const police = /barricad|use of force|videograph|minimum[- ]injury|PA announcement/i;
    for (const r of rows.filter((x) => x.rule_family_id !== "DEL-PROC-100")) expect(police.test(`${r.title} ${r.description} ${r.user_action} ${r.legal_statement}`), r.rule_family_id).toBe(false);
    const held = (await query("SELECT admin_notes, rule_status, legal_statement FROM rules WHERE rule_family_id='DEL-PROC-100'"))[0];
    expect(held).toMatchObject({ rule_status: "UNDER_REVIEW", legal_statement: "" });
    expect(held.admin_notes).toMatch(/NOT organiser tasks/);
  });
  it("clause-level L&O/10/2022 content stays UNDER_REVIEW and never reaches users", async () => {
    for (const a of [100, 500, 5000]) expect((await march({ attendance: a })).by.has("DEL-PROC-100")).toBe(false);
  });
});

describe("the old placeholder row is adopted, not duplicated", () => {
  it("a database loaded by the previous version gets its 25 May 2022 source upgraded in place", async () => {
    await wipe();
    await loadDelhiCorpus({ actor, standingOrderUrl: TEST_FIXTURE_URL, verifiedOn: "2026-10-01" });
    await query("UPDATE sources SET title='Delhi Police order dated 25 May 2022 — Guidelines for regulation of rallies/procession in Delhi (research placeholder)', lifecycle='PLACEHOLDER', source_code=NULL, order_number='', canonical_url=NULL, index_url=NULL, monitoring_enabled=false WHERE source_code='DEL-SO-LNO-10-2022'");
    const before = (await query("SELECT count(*)::int AS n FROM sources"))[0].n;
    await loadDelhiCorpus({ actor, standingOrderUrl: TEST_FIXTURE_URL, verifiedOn: "2026-10-01" });
    expect((await query("SELECT count(*)::int AS n FROM sources"))[0].n).toBe(before);
    expect((await query("SELECT lifecycle, source_code, order_number, canonical_url FROM sources WHERE source_code='DEL-SO-LNO-10-2022'"))[0]).toMatchObject({ lifecycle: "CURRENT", order_number: "L&O/10/2022", canonical_url: OFFICIAL_INDEX_URL });
  });
});

describe("loading, verifying and going live are three separate decisions", () => {
  it("loads the exact official Standing Order URL as the default, with the index date, as DRAFTS", async () => {
    await wipe();
    expect(STANDING_ORDER_URL).toBe("https://delhipolice.gov.in/StandingOrderFiles/83377_Law%20and%20Order-48-2022.pdf");
    const r = await loadDelhiCorpus({ actor, verifiedOn: "2026-10-01" }); // defaults: official URL, no verification, no go-live
    const so = (await query("SELECT canonical_url, source_type, monitoring_enabled, lifecycle, to_char(publication_date,'YYYY-MM-DD') AS pd FROM sources WHERE title ILIKE '%L&O/48/2022%'"))[0];
    expect(so).toMatchObject({ canonical_url: STANDING_ORDER_URL, source_type: "OFFICIAL_ADMINISTRATIVE_RULE", monitoring_enabled: true, lifecycle: "CURRENT", pd: "2022-04-28" });
    expect(r.published).toBe(0);
    expect((await query("SELECT count(*)::int AS n FROM rules WHERE rule_status='ACTIVE'"))[0].n).toBe(0);
    expect((await query("SELECT count(*)::int AS n FROM rules WHERE rule_status='DRAFT'"))[0].n).toBe(38);
    expect(r.warnings.join(" ")).toMatch(/not confirmed/);
    expect(await listSupportedCities()).toEqual([]);
  });
  it("publishing needs the admin's explicit confirmation; it still does not make Delhi selectable", async () => {
    const r = await loadDelhiCorpus({ actor, verifiedOn: "2026-10-01", confirmVerified: true });
    expect(r).toMatchObject({ published: 38, districtLive: false, heldForReview: 2 });
    expect(r.warnings.join(" ")).toMatch(/NOT enabled in the planner/);
    expect(await listSupportedCities()).toEqual([]);
    expect((await query("SELECT count(DISTINCT reviewed_by)::int AS n FROM rules WHERE rule_status='ACTIVE' AND reviewed_by IS NOT NULL"))[0].n).toBe(1);
  });
  it("going live is a third, explicit step", async () => {
    const r = await loadDelhiCorpus({ actor, verifiedOn: "2026-10-01", confirmVerified: true, goLive: true });
    expect(r.districtLive).toBe(true);
    expect((await listSupportedCities()).map((c) => c.label)).toEqual(["New Delhi District, NCT Delhi"]);
  });
  it("re-running never edits a live rule", async () => {
    const before = (await query("SELECT id, updated_at FROM rules WHERE rule_family_id='DEL-JM-002'"))[0];
    await loadDelhiCorpus({ actor, verifiedOn: "2027-01-01", confirmVerified: true, goLive: true });
    const after = (await query("SELECT id, updated_at FROM rules WHERE rule_family_id='DEL-JM-002'"))[0];
    expect(after).toEqual(before);
  });
});
