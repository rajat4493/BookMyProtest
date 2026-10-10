// The Notifications feed pipeline end to end (page HTML -> text -> change event -> parsed candidates -> human review), with an injected fetcher.
// The fixture is SYNTHETIC (see its header): it proves the pipeline, NOT that the live page parses. `npm run probe:feed` does that where the network allows.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { acceptCandidate, checkSource, htmlToText, listCandidates } from "@/lib/knowledge";
import { parseOrder, splitOrders } from "@/lib/engine/order-parser";
import { runRestrictionCheck } from "@/lib/restriction-checks";
import { createEvent, getEvent } from "@/lib/store";
import { ensureDefaultTemplates } from "@/lib/default-templates";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { baseAnswers } from "./fixtures";

const HTML = readFileSync("tests/fixtures/notifications-page.html", "utf8");
let actor: { userId: string }, feed: string, district: string;

beforeAll(async () => { await migrate(process.env.DATABASE_URL!); });
afterAll(async () => { await pool().end(); });
beforeEach(async () => {
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories, events RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  actor = { userId: (await one<{ id: string }>("INSERT INTO users (email, password_hash, role) VALUES ('a@x.org','x','admin') RETURNING id"))!.id };
  const r = await loadDelhiCorpus({ actor, verifiedOn: "2026-10-01" });
  district = r.places.DIST;
  feed = (await one<{ id: string }>("SELECT id FROM sources WHERE feed_role='LIVE_RESTRICTIONS'"))!.id;
});

describe("page to text", () => {
  const text = htmlToText(HTML);
  it("drops scripts, styles, comments and tags; keeps the notices", () => {
    expect(text).not.toMatch(/ignore me|display:none|<|SYNTHETIC FIXTURE/);
    expect(text).toMatch(/Section 163 of the Bharatiya Nagarik Suraksha Sanhita/);
  });
  it("finds the two orders on the page and ignores the housekeeping notice", () => {
    const orders = splitOrders(text);
    expect(orders).toHaveLength(2);
    expect(orders.join(" ")).not.toMatch(/grievance counter/);
  });
  it("reads the Commissioner's order completely and the district order's own fields", () => {
    const [cp, dcp] = splitOrders(text).map(parseOrder);
    expect(cp).toMatchObject({ completeness: "COMPLETE" });
    expect(cp.issuingAuthority.value).toBe("Commissioner of Police, Delhi");
    expect(cp.effectiveFrom.value).toBe("2026-12-08");
    expect(cp.effectiveTo.value).toBe("2026-12-12");
    expect(dcp.effectiveFrom.value).toBe("2026-12-07");
    expect(dcp.effectiveTo.value).toBe("2026-12-09");
    expect(dcp.issuingAuthority.value).toMatch(/Deputy Commissioner of Police/);
  });
});

describe("through the real watch path", () => {
  it("first fetch is a baseline; a later fetch with new orders opens a change event and PENDING candidates, never an ACTIVE restriction", async () => {
    const before = HTML.replace(/<li>[\s\S]*?<\/li>\s*(?=<li><div class="date">05)/, "").replace(/<li><div class="date">05[\s\S]*?<\/li>\s*<li><div class="date">06[\s\S]*?<\/li>/, "");
    expect((await checkSource(feed, async () => htmlToText(before))).kind).toBe("BASELINE");
    const r = await checkSource(feed, async () => htmlToText(HTML));
    expect(r.kind).toBe("CHANGED");
    const cands = await listCandidates("PENDING");
    expect(cands).toHaveLength(2);
    expect(await query("SELECT 1 FROM temporary_restrictions")).toHaveLength(0);
    expect(await query("SELECT 1 FROM temporary_restrictions WHERE status='ACTIVE'")).toHaveLength(0);
  });
  it("the unreviewed orders show up in a plan's check as REVIEW_PENDING, not as a restriction and not as 'clear'", async () => {
    const before = HTML.replace(/<li><div class="date">05[\s\S]*?<\/li>\s*<li><div class="date">06[\s\S]*?<\/li>/, "");
    await checkSource(feed, async () => htmlToText(before));
    await checkSource(feed, async () => htmlToText(HTML));
    const ev = (await getEvent(await createEvent("anon", null, district, { ...baseAnswers, date: "2026-12-10" } as any)))!;
    const c = (await runRestrictionCheck(ev, "PLAN_GENERATED"))!;
    expect(c.status).toBe("REVIEW_PENDING");
    expect(c.message).not.toMatch(/no restrictions? (are|is) in force|all clear/i);
  });
  it("accepting a candidate makes a DRAFT, and it overlays nothing until a human activates it with a source", async () => {
    await checkSource(feed, async () => htmlToText(HTML.replace(/<li><div class="date">05[\s\S]*?<\/li>\s*<li><div class="date">06[\s\S]*?<\/li>/, "")));
    await checkSource(feed, async () => htmlToText(HTML));
    const [c] = await listCandidates("PENDING");
    const id = await acceptCandidate(c.id, { jurisdictionId: district, title: "Order 301/Ord/2026", geographicScope: "New Delhi District", startsAt: "2026-12-08T00:00:00Z", endsAt: "2026-12-12T23:59:00Z", legalBasis: "Section 163 BNSS", affectedActivities: ["ASSEMBLY"], effect: "PROHIBITED", plainExplanation: "", issuingAuthority: "Commissioner of Police, Delhi", orderDate: "2026-12-05", orderReference: "301/Ord/2026" }, actor);
    expect((await one<{ status: string }>("SELECT status FROM temporary_restrictions WHERE id=$1", [id]))!.status).toBe("DRAFT");
  });
});

// If someone has captured the real page with `npm run probe:feed`, hold the parser to it too.
const LIVE = "tests/fixtures/live/notifications.txt";
describe.skipIf(!existsSync(LIVE))("captured live page", () => {
  it("parses without throwing and every candidate states what is missing", () => {
    const text = readFileSync(LIVE, "utf8");
    for (const o of splitOrders(text).map(parseOrder)) expect(Array.isArray(o.missing)).toBe(true);
  });
});
