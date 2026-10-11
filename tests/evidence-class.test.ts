import { describe, expect, it } from "vitest";
import { checkEvidence, evidenceClassOf, type EvidenceLink } from "@/lib/rule-verification";

const base: EvidenceLink = { sourceTitle: "Some page", sourceType: "OFFICIAL_ADMINISTRATIVE_RULE", feedRole: null, url: "https://example.gov.in/x", strength: "PRIMARY", sectionRef: "", excerpt: "", sourceRetrievedAt: "2026-10-01", ruleVerifiedAt: "2026-10-01", flags: [], lastOkRetrievalAt: null };
const clause = (o: Partial<EvidenceLink> = {}) => checkEvidence({ ...base, ...o });
const page = (o: Partial<EvidenceLink> = {}) => checkEvidence({ ...base, sourceType: "OFFICIAL_CURRENT_PRACTICE", ...o });
const feed = (o: Partial<EvidenceLink> = {}) => checkEvidence({ ...base, sourceType: "OFFICIAL_CURRENT_PRACTICE", feedRole: "LIVE_RESTRICTIONS", strength: "SUPPORTING", ...o });

describe("evidence class follows the source, not the rule", () => {
  it("classifies sources", () => {
    expect(evidenceClassOf({ sourceType: "PRIMARY_LAW", feedRole: null })).toBe("CLAUSE_INSTRUMENT");
    expect(evidenceClassOf({ sourceType: "BINDING_CASE_LAW", feedRole: null })).toBe("CLAUSE_INSTRUMENT");
    expect(evidenceClassOf({ sourceType: "OFFICIAL_ADMINISTRATIVE_RULE", feedRole: null })).toBe("CLAUSE_INSTRUMENT");
    expect(evidenceClassOf({ sourceType: "OFFICIAL_CURRENT_PRACTICE", feedRole: null })).toBe("OFFICIAL_WEBPAGE");
    expect(evidenceClassOf({ sourceType: "OFFICIAL_CURRENT_PRACTICE", feedRole: "LIVE_RESTRICTIONS" })).toBe("LIVE_FEED"); // the feed role wins
  });
});

describe("clause-based instruments (law, administrative rule, case law)", () => {
  it("need URL, verified date, section/page/clause reference AND excerpt: each one is required", () => {
    expect(clause().missing).toEqual(["section / page / clause reference", "supporting excerpt"]);
    expect(clause({ sectionRef: "para 4" }).missing).toEqual(["supporting excerpt"]);
    expect(clause({ excerpt: "text" }).missing).toEqual(["section / page / clause reference"]);
    expect(clause({ sectionRef: "para 4", excerpt: "text" }).missing).toEqual([]);
    expect(clause({ sectionRef: "p", excerpt: "t", url: null }).missing).toEqual(["canonical source URL (https)"]);
    expect(clause({ sectionRef: "p", excerpt: "t", url: "http://insecure.example/x" }).missing).toEqual(["canonical source URL (https)"]);
    expect(clause({ sectionRef: "p", excerpt: "t", ruleVerifiedAt: null }).missing).toEqual(["verified date"]);
    expect(clause({ sectionRef: "p", excerpt: "t", sourceType: "BINDING_CASE_LAW" }).missing).toEqual([]);
  });
  it("flags and a retrieval timestamp do not substitute for the clause evidence", () => {
    expect(clause({ flags: ["SOURCE_VERIFIED", "PARSER_REAL_PAGE_VERIFIED"], lastOkRetrievalAt: "2026-10-10T10:00Z" }).missing).toEqual(["section / page / clause reference", "supporting excerpt"]);
  });
});

describe("official webpages / current practice", () => {
  it("need URL, page title, excerpt and a retrieved/verified date; no statutory section number", () => {
    expect(page().missing).toEqual(["supporting excerpt (verbatim text from the page)"]);
    expect(page({ excerpt: "A Traffic NOC is mandatory for rallies." }).missing).toEqual([]);
    expect(page({ excerpt: "x", sourceTitle: "  " }).missing).toEqual(["page title"]);
    expect(page({ excerpt: "x", url: null }).missing).toEqual(["canonical official URL (https)"]);
    expect(page({ excerpt: "x", sourceRetrievedAt: null }).missing).toEqual([]); // the rule's verified date covers it
    expect(page({ excerpt: "x", sourceRetrievedAt: null, ruleVerifiedAt: null }).missing).toEqual(["retrieved / verified date"]);
  });
  it("a section identifier is optional and merely noted when absent; it is never demanded", () => {
    const c = page({ excerpt: "x" });
    expect(c.missing).toEqual([]);
    expect(c.notes.join(" ")).toMatch(/optional for a webpage/);
    expect(page({ excerpt: "x", sectionRef: "Heading: Traffic NOC" }).notes).toEqual([]);
  });
  it("an excerpt is still mandatory: a webpage cannot pass on its URL and a load date alone", () => {
    expect(page({ sectionRef: "Heading", sourceRetrievedAt: "2026-10-01" }).missing).toContain("supporting excerpt (verbatim text from the page)");
  });
});

describe("live feeds / regulatory-watch sources", () => {
  it("need feed URL, SOURCE_VERIFIED, PARSER_REAL_PAGE_VERIFIED and a successful retrieval; no legal section reference", () => {
    const ok = feed({ flags: ["SOURCE_VERIFIED", "PARSER_REAL_PAGE_VERIFIED"], lastOkRetrievalAt: "2026-10-10T10:00Z" });
    expect(ok.missing).toEqual([]);
    expect(ok.notes.join(" ")).toMatch(/each extracted restriction must carry its own order number, legal basis and source evidence/);
    expect(feed({ flags: ["PARSER_REAL_PAGE_VERIFIED"], lastOkRetrievalAt: "t" }).missing).toEqual(["SOURCE_VERIFIED (a person confirms this is the official feed)"]);
    expect(feed({ flags: ["SOURCE_VERIFIED"], lastOkRetrievalAt: "t" }).missing).toEqual(["PARSER_REAL_PAGE_VERIFIED (the parser has been shown to read the real page)"]);
    expect(feed({ flags: ["SOURCE_VERIFIED", "PARSER_REAL_PAGE_VERIFIED"] }).missing).toEqual(["a successful retrieval timestamp (no successful fetch or pasted snapshot is recorded)"]);
    expect(feed({ flags: ["SOURCE_VERIFIED", "PARSER_REAL_PAGE_VERIFIED"], lastOkRetrievalAt: "t", url: null }).missing).toEqual(["canonical official feed URL (https)"]);
  });
  it("PENDING alongside VERIFIED is a contradiction, not a pass", () => {
    expect(feed({ flags: ["SOURCE_VERIFIED", "PARSER_REAL_PAGE_VERIFIED", "PARSER_REAL_PAGE_VERIFICATION_PENDING"], lastOkRetrievalAt: "t" }).missing[0]).toMatch(/clear PARSER_REAL_PAGE_VERIFICATION_PENDING/);
  });
  it("does not accept section or excerpt in place of the real-page verification", () => {
    expect(feed({ sectionRef: "§163", excerpt: "text", flags: ["SOURCE_VERIFIED"], lastOkRetrievalAt: "t" }).missing).toEqual(["PARSER_REAL_PAGE_VERIFIED (the parser has been shown to read the real page)"]);
  });
});
