// v0.9.1: the verified P0 gaps from the Delhi/Jantar Mantar acceptance test.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../scripts/migrate";
import { one, pool, query } from "@/lib/db";
import { evaluate } from "@/lib/engine/evaluate";
import { composeAvailability } from "@/lib/engine/availability";
import { applicableFor, chainFor, selectTemplateMap } from "@/lib/knowledge";
import { buildDocument } from "@/lib/documents";
import { computeReadiness } from "@/lib/engine/readiness";
import { fillText } from "@/lib/plan";
import { createEvent, getEvent } from "@/lib/store";
import { ensureDefaultTemplates } from "@/lib/default-templates";
import { loadDelhiCorpus } from "../data/delhi/loader";
import { ANNEXURE_B_LABEL, ANNEXURE_B_URL, AUTHORITIES, RULES, SOURCES, STANDING_ORDER_URL, TEMPLATES } from "../data/delhi/corpus";
import { baseAnswers } from "./fixtures";

let actor: { userId: string }, district: string, jm: string;
async function plan(over: Record<string, unknown> = {}) {
  const a = { ...baseAnswers, date: "2026-10-31", attendance: 500, ...over } as typeof baseAnswers;
  const ev = (await getEvent(await createEvent("anon", null, district, a, jm)))!;
  const { rules, overlays } = await applicableFor(await chainFor(ev), ev.date, a);
  const items = evaluate(rules, a, new Set(), overlays);
  return { ev, items, by: new Map(items.map((i) => [i.rule.ruleFamilyId, i])) };
}
const sectionOf = async (family: string) => (await one<{ section_ref: string }>("SELECT rs.section_ref FROM rule_sources rs JOIN rules r ON r.id=rs.rule_id JOIN sources s ON s.id=rs.source_id WHERE r.rule_family_id=$1 AND s.source_code='DEL-SO-LNO-48-2022'", [family]))?.section_ref;

beforeAll(async () => {
  await migrate(process.env.DATABASE_URL!);
  await query("TRUNCATE users, jurisdictions, sources, document_templates, audit_log, vendor_categories, events RESTART IDENTITY CASCADE");
  await ensureDefaultTemplates((q, p) => pool().query(q, p));
  actor = { userId: (await one<{ id: string }>("INSERT INTO users (email, password_hash, role) VALUES ('a@x.org','x','admin') RETURNING id"))!.id };
  const r = await loadDelhiCorpus({ actor, verifiedOn: "2026-10-01", confirmVerified: true });
  district = r.places.DIST; jm = r.places.JM;
});
afterAll(async () => { await pool().end(); });

describe("1. submission: HAX Branch, DCP/New Delhi District", () => {
  it("stores the official address and telephone, and an in-person submission method", async () => {
    const a = await one("SELECT office_address, contact_phone, submission_method, contact_email, submission_url FROM authorities WHERE name LIKE 'DCP, New Delhi District%'");
    expect(a).toEqual({ office_address: "Office Complex, Police Station Parliament Street, Sansad Marg, New Delhi 110001", contact_phone: "011-23747777", submission_method: "IN_PERSON", contact_email: "", submission_url: null });
  });
  it("stores the official Delhi Police contact source, without inventing a URL for it", async () => {
    const s = await one("SELECT source_type, canonical_url, notes, lifecycle FROM sources WHERE title LIKE 'Delhi Police — DCP/New Delhi District: official district details%'");
    expect(s).toMatchObject({ source_type: "OFFICIAL_CURRENT_PRACTICE", canonical_url: null, lifecycle: "CURRENT" });
    expect(s!.notes).toMatch(/URL was NOT supplied and none is invented/);
    expect(s!.notes).toMatch(/does not establish that email/);
  });
  it("the dashboard row tells the organizer where and how to submit, with the telephone number", async () => {
    const p = await plan();
    const jm1 = p.by.get("DEL-JM-001")!.rule, jm3 = p.by.get("DEL-JM-003")!.rule;
    for (const r of [jm1, jm3]) {
      expect(r.submissionMethod).toMatch(/HAX Branch/);
      expect(r.submissionMethod).toMatch(/Office Complex, Police Station Parliament Street, Sansad Marg, New Delhi 110001/);
      expect(r.submissionMethod).toMatch(/011-23747777/);
    }
  });
  it("never says email is sufficient: every mention of email/online is hedged as unverified", () => {
    const text = [...RULES.flatMap((r) => [r.legal, r.plain, r.action, r.submit ?? "", r.note ?? ""]), ...AUTHORITIES.map((a) => a.notes), ...SOURCES.map((s) => s.notes)].join("\n");
    expect(text).not.toMatch(/email (is|are) (accepted|sufficient|enough)|can be (sent|submitted) by email|submit(ted)? (by|via|through) email/i);
    for (const sentence of text.split(/(?<=[.!?])\s+/).filter((x) => /\bemail\b|\bonline\b/i.test(x) && /submi|accept|application/i.test(x))) {
      expect(sentence, sentence).toMatch(/not verified|NOT verified|not accepted|do not (rely|assume)|not establish|none (is|may)|no email|nor|cannot|never/i);
    }
  });
  it("the next action names the HAX Branch and the calculated deadline (event 31 Oct: apply by 21 Oct 2026)", async () => {
    const p = await plan();
    const lead = p.items.filter((i) => i.deadline).map((i) => i.deadline!).sort()[0];
    expect(lead).toBe("2026-10-21");
    const action = fillText(p.by.get("DEL-JM-001")!.rule.userAction, { deadline: lead });
    expect(action).toBe("Submit your Jantar Mantar permission application to the HAX Branch, DCP/New Delhi District, by 21 October 2026.");
    expect(p.items.filter((i) => i.rule.severity === "CRITICAL" && !i.done)[0].rule.ruleFamilyId).toBe("DEL-JM-001"); // it is the first blocker, so it is the next action
  });
});

describe("2. official undertaking = Annexure B", () => {
  it("links the official Standing Order PDF at the Annexure B pages, with its own label", async () => {
    expect(ANNEXURE_B_URL).toBe(`${STANDING_ORDER_URL}#page=11`);
    const r = (await plan()).by.get("DEL-JM-021")!.rule;
    expect(r.officialLink).toBe(ANNEXURE_B_URL);
    expect(r.officialLinkLabel).toBe("View official Annexure B");
    expect(ANNEXURE_B_LABEL).toBe("View official Annexure B");
    expect(r.description).toMatch(/Annexure B/);
    expect(r.description).toMatch(/Undertaking by the organizer for Jantar Mantar/);
  });
  it("our generated sheet is labelled a preparation copy and never called the official form", async () => {
    const ev = (await plan()).ev;
    const { rules, overlays } = await applicableFor(await chainFor(ev), ev.date, ev.answers);
    const items = evaluate(rules, ev.answers, new Set(), overlays);
    const templates = await selectTemplateMap(await chainFor(ev), ev.date);
    const doc = buildDocument("undertaking", { answers: ev.answers, cityLabel: "Delhi", items, readiness: computeReadiness(items), generatedOn: "2026-10-10", templates });
    const text = JSON.stringify(doc.blocks);
    expect(text).toContain("Prepared from official Annexure B — verify against the current official form before submission.");
    expect(text).toContain(ANNEXURE_B_URL);
    expect(doc.title).toMatch(/preparation copy/i);
    expect(text).toMatch(/NOT the official undertaking/);
    expect(doc.disclaimer).toMatch(/not the official undertaking form/i);
    expect(text).toContain("Number of participants");
  });
  it("the request letter lists the Annexure B undertaking and the land-owner NOC as enclosures, and mentions buses", async () => {
    const ev = (await plan({ vehicles: true, buses: 2 })).ev;
    const { rules, overlays } = await applicableFor(await chainFor(ev), ev.date, ev.answers);
    const items = evaluate(rules, ev.answers, new Set(), overlays);
    const t = await selectTemplateMap(await chainFor(ev), ev.date);
    const letter = JSON.stringify(buildDocument("request-letter", { answers: ev.answers, cityLabel: "Delhi", items, readiness: computeReadiness(items), generatedOn: "2026-10-10", templates: t }).blocks);
    expect(letter).toMatch(/Annexure B/);
    expect(letter).toMatch(/land-owner no-objection certificate/);
    expect(letter).toMatch(/vehicles — yes \(2 buses\)/);
  });
});

describe("3. clause-level evidence", () => {
  it("every verified Jantar Mantar rule the owner referenced carries its exact section and page", async () => {
    const want: Record<string, RegExp> = {
      "DEL-JM-001": /^Section 3\(i\), PDF page 3/, "DEL-JM-002": /^Section 3\(i\), PDF page 3/, "DEL-JM-003": /^Section 3\(i\), PDF page 3/,
      "DEL-JM-004": /Section 3\(ii\).*Section 3\(iii\)-\(vi\)/, "DEL-JM-013": /^Section 4\(i\), PDF page 4/, "DEL-JM-014": /^Section 4\(ii\), PDF page 4/,
      "DEL-JM-005": /^Section 5\(i\)-\(ii\)/, "DEL-JM-008": /^Section 6/, "DEL-JM-009": /^Section 6/, "DEL-JM-010": /^Section 7, PDF page 5/, "DEL-JM-006": /^Section 9/,
      "DEL-JM-021": /^Annexure B, PDF pages 11–14/, "DEL-JM-022": /^Annexure B, PDF pages 11–14/,
    };
    for (const [family, re] of Object.entries(want)) expect(await sectionOf(family), family).toMatch(re);
  });
  it("the section reference is shown to the organizer (rule source carries it)", async () => {
    const src = (await plan()).by.get("DEL-JM-002")!.rule.sources.find((s) => s.title?.includes("L&O/48/2022"))!;
    expect(src.sectionRef).toBe("Section 3(i), PDF page 3");
  });
  it("sections not supplied stay blank rather than guessed", async () => {
    expect(await sectionOf("DEL-JM-007")).toBe("");
    expect(await sectionOf("DEL-JM-016")).toBe("");
  });
});

describe("4. buses", () => {
  it("2 buses: 'within the venue maximum', with the Jai Singh Road permission wording and no guaranteed bay", async () => {
    const p = await plan({ vehicles: true, buses: 2 });
    const ok = p.by.get("DEL-JM-027")!;
    expect(ok.rule.requirementType).toBe("warning");
    expect(fillText(ok.rule.description, { buses: 2 })).toContain("2 buses are within the venue maximum of 25.");
    expect(ok.rule.description).toContain("Your issued permission should specify the designated Jai Singh Road parking point or an alternative location.");
    expect(p.by.has("DEL-JM-028")).toBe(false);
    const parking = p.by.get("DEL-JM-014")!.rule;
    expect(parking.description).toMatch(/Jai Singh Road/);
    expect(parking.description).toMatch(/should specify the designated Jai Singh Road parking point or an alternative location/);
    expect(parking.description).toMatch(/do not promise, an exact parking bay/);
    expect(parking.description).not.toMatch(/guaranteed to you|your bay is/i);
  });
  it("more than 25 buses is a critical problem; no count entered shows neither", async () => {
    const many = await plan({ vehicles: true, buses: 30 });
    expect(many.by.get("DEL-JM-028")).toMatchObject({ level: "REQUIRED" });
    expect(many.by.get("DEL-JM-028")!.rule.severity).toBe("CRITICAL");
    expect(many.by.has("DEL-JM-027")).toBe(false);
    const none = await plan({ vehicles: true });
    expect(none.by.has("DEL-JM-027")).toBe(false);
    expect(none.by.has("DEL-JM-028")).toBe(false);
    expect((await plan({ vehicles: false, buses: 2 })).by.has("DEL-JM-027")).toBe(false);
  });
  it("the max-25 and parking rules still apply to a 2-bus plan", async () => {
    const p = await plan({ vehicles: true, buses: 2 });
    expect(p.by.has("DEL-JM-013") && p.by.has("DEL-JM-014")).toBe(true);
  });
});

describe("5. multiple protests: capacity is not an entitlement", () => {
  it("the 1,000 rule says several protests can share a day, subject to space, time gaps and the total cap", async () => {
    const d = (await plan()).by.get("DEL-JM-005")!.rule.description;
    expect(d).toMatch(/Several protests can take place on the same day if there is space and enough time between them/);
    expect(d).toMatch(/in total/);
    expect(d).toMatch(/not guaranteed to you/);
  });
  it("the shared-venue result never presents remaining capacity as an entitlement", () => {
    const sig = { id: "x", type: "POLICE_APPROVAL" as const, status: "CONFIRMED" as const, startTime: null, endTime: null, attendance: 300, confidence: "high" as const, checkedAt: new Date(), sourceUrl: null };
    for (const signals of [[sig], []]) {
      const a = composeAvailability({ mode: "SHARED_CAPACITY", startTime: "10:00", endTime: "13:00", attendance: 500, capacity: 1000, signals, coverage: [], now: new Date() });
      expect(a.state).toBe("SHARED_CAPACITY");
      expect(a.message).toMatch(/not an entitlement|for the authority to decide/);
      expect(a.message).not.toMatch(/\b\d+ (spaces?|places?|seats?|slots?) (left|remaining)|remaining (capacity|police capacity) (is|of) \d/i);
    }
  });
});

describe("7. land-owner NOC", () => {
  it("stays REQUIRED / CRITICAL (Annexure B requires it) with the exact unverified-route wording", async () => {
    const i = (await plan()).by.get("DEL-JM-022")!;
    expect(i).toMatchObject({ level: "REQUIRED" });
    expect(i.rule.severity).toBe("CRITICAL");
    expect(i.rule.description).toBe("Land-owner NOC is required by Annexure B. We have not yet verified the current submission route for obtaining it.");
    expect(await sectionOf("DEL-JM-022")).toMatch(/Annexure B/);
  });
  it("names no issuer and offers no application route anywhere in the corpus", () => {
    const text = [...RULES.flatMap((r) => [r.legal, r.plain, r.action, r.submit ?? "", r.note ?? ""]), ...SOURCES.map((s) => s.notes), ...TEMPLATES.map((t) => t.content)].join("\n");
    expect(text).not.toMatch(/NDMC/);
    expect(text).not.toMatch(/NOC application (is )?available|apply for the (land-owner )?NOC (here|online)/i);
  });
});
