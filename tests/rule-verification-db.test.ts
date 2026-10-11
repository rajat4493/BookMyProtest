// The verification gate: only rules whose reviewer recorded reading the instrument are publishable; a load date is not verification.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { publishVerified, verificationReport } from "@/lib/rule-verification";
import { recordSourceContent, saveRestriction, saveSource } from "@/lib/knowledge";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { ensureDefaultTemplates } from "@/lib/default-templates";

let admin: { userId: string };
beforeAll(async () => { await migrate(process.env.DATABASE_URL!); });
afterAll(async () => { await pool().end(); });
beforeEach(async () => {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories, events RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  admin = { userId: (await one<{ id: string }>("INSERT INTO users (email, password_hash, role, email_verified_at) VALUES ('a@x.org','x','admin',now()) RETURNING id"))!.id };
  await loadDelhiCorpus({ actor: admin, verifiedOn: "2026-10-01" }); // drafts only: nobody has confirmed anything
});

const get = async (family: string) => (await verificationReport("DEL-")).find((x) => x.family === family)!;
const setEvidence = (family: string, section: string, excerpt: string) => query(`UPDATE rule_sources SET section_ref=$2, excerpt=$3 WHERE rule_id=(SELECT id FROM rules WHERE rule_family_id=$1 AND rule_status IN ('DRAFT','ACTIVE')) AND evidence_strength IN ('PRIMARY','SUPPORTING')`, [family, section, excerpt]);

describe("verification gate as loaded (nothing verified; nothing published by the gate)", () => {
  it("clause rules name exactly the clause evidence that is missing: where the corpus recorded a clause reference, only the excerpt is missing; where it recorded neither, both", async () => {
    const withRef = await get("DEL-JM-001"); // the corpus records a clause reference for this one, but nobody has recorded an excerpt
    expect(withRef.ready).toBe(false);
    expect(withRef.evidenceClass).toBe("CLAUSE_INSTRUMENT");
    expect(withRef.missing).toEqual(["clause-based legal instrument: missing supporting excerpt"]);
    const neither = (await verificationReport("DEL-")).find((r) => r.evidenceClass === "CLAUSE_INSTRUMENT" && r.missing.some((m) => /section \/ page \/ clause reference/.test(m)));
    expect(neither, "at least one clause rule has no recorded reference").toBeTruthy();
    expect(neither!.missing.join(" | ")).toMatch(/missing section \/ page \/ clause reference/);
    expect(neither!.missing.join(" | ")).toMatch(/missing supporting excerpt/);
    expect(withRef.missing.join(" ")).not.toMatch(/verified date|URL/); // those are present
  });
  it("DEL-TRAFFIC-001 is judged as an official webpage: only the verbatim excerpt is missing, and no section number is asked for", async () => {
    const r = await get("DEL-TRAFFIC-001");
    expect(r.evidenceClass).toBe("OFFICIAL_WEBPAGE");
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(["official webpage / current practice: missing supporting excerpt (verbatim text from the page)"]);
    expect(r.notes.join(" ")).toMatch(/optional for a webpage/);
  });
  it("DEL-LIVE-001 is judged as a live-feed monitoring requirement: real-page parser verification and a successful retrieval are missing; SOURCE_VERIFIED is already recorded", async () => {
    const r = await get("DEL-LIVE-001");
    expect(r.evidenceClass).toBe("LIVE_FEED");
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual([
      "live feed / regulatory watch source: missing PARSER_REAL_PAGE_VERIFIED (the parser has been shown to read the real page)",
      "live feed / regulatory watch source: missing a successful retrieval timestamp (no successful fetch or pasted snapshot is recorded)",
    ]);
    expect(r.missing.join(" ")).not.toMatch(/section|reference|excerpt/);
  });
  it("nothing is ready as loaded, held rules stay held, and the gate publishes nothing", async () => {
    const all = await verificationReport("DEL-");
    expect(all.filter((x) => x.ready)).toEqual([]);
    for (const h of all.filter((x) => x.family === "DEL-PROC-100")) expect(h.missing.join(" ")).toMatch(/held for review/);
    expect((await publishVerified(admin, "DEL-", "test")).published).toEqual([]);
    expect((await query("SELECT 1 FROM rules WHERE rule_family_id LIKE 'DEL-%' AND rule_status='ACTIVE'")).length).toBe(0);
  });
});

describe("evidence recorded per source type turns exactly that rule ready", () => {
  it("clause rule: section alone or excerpt alone is not enough; both are", async () => {
    await setEvidence("DEL-JM-001", "para 4", "");
    expect((await get("DEL-JM-001")).ready).toBe(false); // reference alone
    await setEvidence("DEL-JM-001", "", "Prior permission of the DCP is required.");
    expect((await get("DEL-JM-001")).ready).toBe(false);
    await setEvidence("DEL-JM-001", "para 4", "Prior permission of the DCP is required.");
    expect((await get("DEL-JM-001")).ready).toBe(true);
  });
  it("webpage rule: a verbatim excerpt is enough (no section number); a section number without an excerpt is not", async () => {
    await setEvidence("DEL-TRAFFIC-001", "Heading: Traffic NOC", "");
    expect((await get("DEL-TRAFFIC-001")).ready).toBe(false);
    await setEvidence("DEL-TRAFFIC-001", "", "A Traffic NOC is mandatory for rallies and protest gatherings.");
    const r = await get("DEL-TRAFFIC-001");
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
  });
  it("feed rule: needs the real-page flag AND a successful retrieval, and nothing about sections", async () => {
    const feed = (await one<{ id: string; flags: string[] }>("SELECT id, verification_flags AS flags FROM sources WHERE feed_role='LIVE_RESTRICTIONS'"))!;
    await query("UPDATE sources SET verification_flags=ARRAY['SOURCE_VERIFIED','PARSER_REAL_PAGE_VERIFIED'] WHERE id=$1", [feed.id]);
    expect((await get("DEL-LIVE-001")).missing.join(" ")).toMatch(/successful retrieval timestamp/);
    await query("INSERT INTO source_snapshots (source_id, content_hash, status, reference) VALUES ($1,'fetch-failed','FETCH_FAILED','HTTP 403')", [feed.id]);
    expect((await get("DEL-LIVE-001")).ready).toBe(false); // a failed fetch is not a retrieval
    await recordSourceContent(feed.id, "Notifications\nnothing yet", undefined, "https://delhipolice.gov.in/notification");
    const r = await get("DEL-LIVE-001");
    expect(r.ready).toBe(true);
    expect(r.notes.join(" ")).toMatch(/latest successful retrieval/);
  });
  it("only the rules whose evidence is complete are published, each for its own reason; going live is not implied", async () => {
    await setEvidence("DEL-JM-001", "para 4", "Prior permission of the DCP is required.");
    await setEvidence("DEL-TRAFFIC-001", "", "A Traffic NOC is mandatory.");
    const dry = await publishVerified(admin, "DEL-", "dry", true);
    expect(dry.published.sort()).toEqual(["DEL-JM-001", "DEL-TRAFFIC-001"]);
    expect((await query("SELECT 1 FROM rules WHERE rule_status='ACTIVE' AND rule_family_id LIKE 'DEL-%'")).length).toBe(0);
    const out = await publishVerified(admin, "DEL-", "Reviewed");
    expect(out.published.sort()).toEqual(["DEL-JM-001", "DEL-TRAFFIC-001"]);
    expect((await get("DEL-LIVE-001")).status).toBe("DRAFT"); // feed evidence not complete: stays unpublished
    expect(await one("SELECT 1 FROM jurisdictions WHERE name ILIKE '%New Delhi%' AND supported")).toBeNull();
  });
  it("a non-human actor cannot publish", async () => {
    await expect(publishVerified({ userId: "" } as any, "DEL-", "x")).rejects.toThrow();
  });
});

describe("restrictions extracted from a feed carry their own evidence before they can be ACTIVE", () => {
  const input = (over: Record<string, unknown> = {}) => ({
    jurisdictionId: "", title: "Order 55/Ord/2026", geographicScope: "", startsAt: "2026-12-08T00:00:00Z", endsAt: "2026-12-12T23:59:00Z", legalBasis: "Section 163 BNSS", affectedActivities: ["ASSEMBLY"],
    effect: "PROHIBITED", plainExplanation: "", sourceId: "", status: "ACTIVE", orderReference: "55/Ord/2026", sourceExcerpt: "No assembly of five or more persons.", ...over,
  }) as any;
  it("an ACTIVE restriction needs its order number, legal basis and a supporting excerpt, on top of a source; a DRAFT does not", async () => {
    const feed = (await one<{ id: string }>("SELECT id FROM sources WHERE feed_role='LIVE_RESTRICTIONS'"))!.id;
    const dist = (await one<{ id: string }>("SELECT id FROM jurisdictions WHERE name='New Delhi District'"))!.id;
    const base = input({ jurisdictionId: dist, sourceId: feed });
    await expect(saveRestriction(null, { ...base, orderReference: "" }, admin)).rejects.toThrow(/order number/);
    await expect(saveRestriction(null, { ...base, legalBasis: " " }, admin)).rejects.toThrow(/legal basis/);
    await expect(saveRestriction(null, { ...base, sourceExcerpt: "" }, admin)).rejects.toThrow(/supporting excerpt/);
    await expect(saveRestriction(null, { ...base, sourceId: null }, admin)).rejects.toThrow(/needs a source/);
    await expect(saveRestriction(null, { ...base, orderReference: "", legalBasis: "", sourceExcerpt: "" }, admin)).rejects.toThrow(/order number, legal basis, supporting excerpt/);
    await saveRestriction(null, { ...base, status: "DRAFT", orderReference: "", legalBasis: "", sourceExcerpt: "" }, admin); // a draft is a work in progress
    await saveRestriction(null, base, admin); // complete evidence: accepted
  });
});
