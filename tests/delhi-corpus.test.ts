// Delhi / Jantar Mantar corpus + the three required scenarios, against the dedicated test database.
// The Standing Order URL below is a TEST FIXTURE; the real official URL is supplied by a human at load time.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { computeReadiness } from "@/lib/engine/readiness";
import { evaluate } from "@/lib/engine/evaluate";
import type { EvaluatedItem } from "@/lib/engine/types";
import { applicableFor, chainFor, listChangeEvents, recordSourceContent, selectTemplateMap } from "@/lib/knowledge";
import { createEvent, getEvent, listSupportedCities } from "@/lib/store";
import { ensureDefaultTemplates } from "@/lib/default-templates";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { RULES } from "../data/delhi/corpus";
import { baseAnswers } from "./fixtures";

const TEST_FIXTURE_URL = "https://example.org/test-fixture/standing-order-L&O-48-2022.pdf";
let actor: { userId: string };
let district: string, jm: string;

async function reset(withUrl: boolean) {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  actor = { userId: (await one<{ id: string }>("INSERT INTO users (email, password_hash, role) VALUES ('a@x.org','x','admin') RETURNING id"))!.id };
  const report = await loadDelhiCorpus({ actor, standingOrderUrl: withUrl ? TEST_FIXTURE_URL : null, verifiedOn: "2026-10-01" });
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

  it("defines exactly the 29 requested rule families plus the Ramlila gap record", () => {
    const wanted = [...Array.from({ length: 26 }, (_, i) => `DEL-JM-${String(i + 1).padStart(3, "0")}`), "DEL-TRAFFIC-001", "DEL-LIVE-001", "DEL-RAM-001"];
    expect(RULES.map((r) => r.family).filter((f) => f !== "DEL-RAM-002").sort()).toEqual(wanted.sort());
    expect(RULES.filter((r) => r.holdForReview).map((r) => r.family)).toEqual(["DEL-RAM-002"]);
  });
  it("publishes all 29 with a named human reviewer, and keeps the Ramlila booking workflow UNDER_REVIEW", async () => {
    expect(report).toMatchObject({ published: 29, drafted: 0, heldForReview: 1, districtLive: true });
    const rows = await query("SELECT rule_family_id, rule_status, legal_certainty, reviewed_by FROM rules ORDER BY rule_family_id");
    const status = new Map(rows.map((r) => [r.rule_family_id, r]));
    expect(status.get("DEL-RAM-002")).toMatchObject({ rule_status: "UNDER_REVIEW", legal_certainty: "UNVERIFIED", reviewed_by: null });
    for (const r of RULES.filter((x) => !x.holdForReview)) {
      expect(status.get(r.family)).toMatchObject({ rule_status: "ACTIVE", reviewed_by: actor.userId });
    }
  });
  it("marks Standing Order and Traffic Police rules PRIMARY_VERIFIED; the notifications check is OFFICIAL_GUIDANCE", async () => {
    const cert = Object.fromEntries((await query("SELECT rule_family_id, legal_certainty FROM rules")).map((r) => [r.rule_family_id, r.legal_certainty]));
    for (const r of RULES.filter((x) => !x.holdForReview && x.family !== "DEL-LIVE-001")) expect(cert[r.family]).toBe("PRIMARY_VERIFIED");
    expect(cert["DEL-LIVE-001"]).toBe("OFFICIAL_GUIDANCE");
  });
  it("does not invent Ramlila booking steps or the land-owner process", async () => {
    const [ram1] = await query("SELECT plain_text FROM (SELECT description AS plain_text FROM rules WHERE rule_family_id='DEL-RAM-001') x");
    expect(ram1.plain_text).toMatch(/not verified/i);
    const [ram2] = await query("SELECT legal_statement, user_action, (SELECT count(*) FROM rule_sources WHERE rule_id=rules.id)::int AS sources FROM rules WHERE rule_family_id='DEL-RAM-002'");
    expect(ram2).toMatchObject({ legal_statement: "", user_action: "", sources: 0 });
    const [noc] = await query("SELECT description FROM rules WHERE rule_family_id='DEL-JM-022'");
    expect(noc.description).toMatch(/not yet verified/i);
  });
  it("monitors the Standing Order, the Traffic Police NOC page and the Police notifications feed", async () => {
    const s = await query("SELECT title, source_type, monitoring_enabled, monitoring_frequency FROM sources ORDER BY title");
    expect(s).toHaveLength(3);
    expect(s.every((x) => x.monitoring_enabled)).toBe(true);
    expect(s.find((x) => /Notifications/.test(x.title))).toMatchObject({ monitoring_frequency: "DAILY", source_type: "OFFICIAL_CURRENT_PRACTICE" });
  });
  it("is idempotent: loading again changes nothing", async () => {
    const before = (await query("SELECT count(*)::int AS n FROM rules"))[0].n;
    const again = await loadDelhiCorpus({ actor, standingOrderUrl: TEST_FIXTURE_URL, verifiedOn: "2026-10-01" });
    expect(again.published).toBe(0);
    expect((await query("SELECT count(*)::int AS n FROM rules"))[0].n).toBe(before);
    expect((await query("SELECT count(*)::int AS n FROM sources"))[0].n).toBe(3);
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
    expect(p.families).toEqual(["DEL-JM-005", "DEL-LIVE-001", "DEL-RAM-001", "DEL-TRAFFIC-001"]);
    expect(p.by.get("DEL-RAM-001")).toMatchObject({ level: "RECOMMENDED", freshness: "CURRENT" });
    expect(p.by.get("DEL-RAM-001")!.rule.severity).toBe("CRITICAL");
    expect(p.readiness.blockers.map((b) => b.rule.ruleFamilyId)).toContain("DEL-RAM-001");
  });
  it("with no venue chosen: Ramlila guidance and the Delhi-wide rules, nothing Jantar Mantar-specific", async () => {
    const p = await plan({ attendance: 2000 }, null);
    expect(p.families).toEqual(["DEL-LIVE-001", "DEL-RAM-001", "DEL-TRAFFIC-001"]);
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
    // still no vehicle rules, still not routed to Ramlila
    for (const f of ["DEL-JM-013", "DEL-JM-014", "DEL-RAM-001"]) expect(p.by.has(f), f).toBe(false);
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
    const id = await src("%Standing Order%");
    await recordSourceContent(id, "10 days in advance");
    await recordSourceContent(id, "7 days in advance");
    const flagged = await query("SELECT rule_family_id FROM rules WHERE rule_status='CHANGE_DETECTED'");
    expect(flagged).toHaveLength(RULES.filter((r) => r.sources.some((s) => s.key === "SO") && !r.holdForReview).length);
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
    expect(r.warnings[0]).toMatch(/DELHI_STANDING_ORDER_URL/);
    expect(r.districtLive).toBe(false);
    expect(await listSupportedCities()).toEqual([]);
    const so = RULES.filter((x) => x.sources.some((s) => s.key === "SO") && !x.holdForReview).map((x) => x.family);
    const st = Object.fromEntries((await query("SELECT rule_family_id, rule_status FROM rules")).map((x) => [x.rule_family_id, x.rule_status]));
    for (const f of so) expect(st[f], f).toBe("DRAFT");
    expect(st["DEL-TRAFFIC-001"]).toBe("ACTIVE");
    expect(st["DEL-LIVE-001"]).toBe("ACTIVE");
    expect((await query("SELECT canonical_url FROM sources WHERE title ILIKE '%Standing Order%'"))[0].canonical_url).toBeNull();
    // Supplying the URL later completes the load without duplicating anything.
    const again = await loadDelhiCorpus({ actor: { userId: (await one<{ id: string }>("SELECT id FROM users LIMIT 1"))!.id }, standingOrderUrl: TEST_FIXTURE_URL, verifiedOn: "2026-10-01" });
    expect(again.districtLive).toBe(true);
    expect((await query("SELECT count(*)::int AS n FROM rules WHERE rule_family_id='DEL-JM-001'"))[0].n).toBe(1);
    expect((await query("SELECT rule_status FROM rules WHERE rule_family_id='DEL-JM-001'"))[0].rule_status).toBe("ACTIVE");
  });
});
