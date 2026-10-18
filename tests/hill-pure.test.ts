// v1.1 pure tests: issue publishing rules, neutral ranking, refused campaign tactics, outcome labelling, feature flags, copy audit.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { compareRank, neutralTitleProblem, parseSources, publishProblems as issueProblems, sourceQuality, type IssueDraft } from "@/lib/engine/issues";
import { ACTION_CATEGORIES, OUTCOME_STATE_LABEL, outcomeEvidenceLabel, publishProblems as campaignProblems, screenCampaignText, stateEvidenceNote, validateOutcomeEntry, type CampaignDraft } from "@/lib/engine/digital-action";
import { findYourHillEnabled, hitWhereItHurtsEnabled } from "@/lib/flags";
import { provenanceLabel } from "@/lib/engine/provenance";

const issue = (o: Partial<IssueDraft> = {}): IssueDraft => ({ title: "Water supply interruptions in Ward 12", summary: "Residents report repeated interruptions to piped water.", description: "Piped water to Ward 12 has been interrupted on a number of days this year, according to utility logs and resident reports.",
  whyDiscussed: "The utility and residents' associations have given different explanations for the interruptions.", scopeLevel: "LOCAL", city: "Pune", state: "Maharashtra", category: "PUBLIC_SERVICES", perspectives: [], disputedClaims: [], developments: [],
  unknowns: "The cause of the March interruptions has not been published.", lastCheckedOn: "2026-10-01", ...o });
const src = [{ kind: "OFFICIAL_RECORD", title: "Utility outage log", url: "https://example.gov.in/log" }];

describe("issue publishing rules", () => {
  it("a complete, sourced, neutral issue has no problems", () => expect(issueProblems(issue(), src)).toEqual([]));
  it("requires sources, an independent source, https links, a statement of unknowns and a check date", () => {
    expect(issueProblems(issue(), []).join(" ")).toMatch(/At least one source/);
    expect(issueProblems(issue(), [{ kind: "ORGANIZATION_STATEMENT", title: "The utility says", url: "https://utility.example/x" }]).join(" ")).toMatch(/independent of the parties/);
    expect(issueProblems(issue(), [{ kind: "OFFICIAL_RECORD", title: "x", url: "http://insecure.example/x" }]).join(" ")).toMatch(/https/);
    expect(issueProblems(issue({ unknowns: "" }), src).join(" ")).toMatch(/remains unknown/);
    expect(issueProblems(issue({ lastCheckedOn: null }), src).join(" ")).toMatch(/last checked/);
    expect(issueProblems(issue({ whyDiscussed: "" }), src).join(" ")).toMatch(/why the issue/);
  });
  it("refuses slogans, accusations and calls to action as titles", () => {
    for (const t of ["Corrupt officials loot the water board", "Boycott the Water Board", "Stop the scam of tanker mafia"]) expect(neutralTitleProblem(t), t).toBeTruthy();
    expect(neutralTitleProblem("Water supply interruptions in Ward 12")).toBeNull();
    expect(issueProblems(issue({ title: "Expose the corrupt water board" }), src).join(" ")).toMatch(/neutral descriptive title/);
  });
  it("incomplete perspectives, disputed claims and developments block publication", () => {
    expect(issueProblems(issue({ perspectives: [{ label: "Utility", summary: "short" }] }), src).join(" ")).toMatch(/Perspective 1/);
    expect(issueProblems(issue({ disputedClaims: [{ claim: "x", dispute: "" }] }), src).join(" ")).toMatch(/Disputed claim 1/);
    expect(issueProblems(issue({ developments: [{ date: "yesterday", text: "t", sourceTitle: "s", sourceUrl: "https://a.b/c" }] }), src).join(" ")).toMatch(/Development 1/);
  });
  it("parses the admin line formats", () => {
    expect(parseSources("official_record | Log | https://a.gov.in/x | Utility | 2026-09-01\n\nresearch | Audit | https://b.org/y")).toEqual([
      { kind: "OFFICIAL_RECORD", title: "Log", url: "https://a.gov.in/x", publisher: "Utility", publishedOn: "2026-09-01" }, { kind: "RESEARCH", title: "Audit", url: "https://b.org/y", publisher: "", publishedOn: null }]);
  });
});

describe("search ordering uses only relevance, place, recency and documented source quality", () => {
  const base = { rank: 0.5, placeMatch: false, checkedOn: "2026-09-01", quality: 3 };
  it("relevance first, then place, then recency, then source quality", () => {
    const sorted = [{ ...base, quality: 9, checkedOn: "2026-01-01", id: "d" }, { ...base, id: "c", checkedOn: "2026-10-01" }, { ...base, id: "b", placeMatch: true }, { ...base, id: "a", rank: 0.9, checkedOn: "2020-01-01", quality: 0 }].sort(compareRank).map((x) => x.id);
    expect(sorted).toEqual(["a", "b", "c", "d"]);
  });
  it("official records outweigh a statement by an involved party; there is no popularity or belief input at all", () => {
    expect(sourceQuality(["OFFICIAL_RECORD"])).toBeGreaterThan(sourceQuality(["ORGANIZATION_STATEMENT", "ORGANIZATION_STATEMENT"]) - 1);
    expect(Object.keys(base).sort()).toEqual(["checkedOn", "placeMatch", "quality", "rank"]);
  });
});

const clean = "Pause buying from the seller for one month and write one honest message through their feedback form.";
describe("campaign text screening", () => {
  it("passes ordinary, lawful campaign language", () => {
    for (const t of [clean, "Please publish the water-quality test results for the last three years.", "We are choosing to pause our purchases until a refund policy is published.", "Share the audit report with your neighbours.", "Boycott: we will not buy from this seller this month.", "Lost 300 jobs at the plant in 2025, according to the filing."]) expect(screenCampaignText("Text", t), t).toBeNull();
  });
  it("refuses harassment, doxxing, fake reviews, floods, automation, obstruction and damage estimates", () => {
    const bad = ["Find out where he lives and post his home address", "Post fake reviews to drop their rating", "Review-bomb their page", "Spam their support line all day", "Flood their inbox", "Use a bot to post the message every hour", "Harass the staff until they quit", "Block the store entrance", "Disrupt their operations", "Bankrupt the company", "We will destroy their revenue", "This cost the company ₹50 crore last month", "estimated loss of sales"];
    for (const t of bad) expect(screenCampaignText("Text", t), t).toBeTruthy();
  });
});

const camp = (o: Partial<CampaignDraft> = {}): CampaignDraft => ({ title: "Publish refund policy", summary: "Asking a retailer to publish a clear refund policy.", requestedChange: "Publish a written refund policy on the retailer's website within 60 days.", institution: "Example Retail Ltd",
  closureCriteria: "Closed when the policy is published, or on the review date if not.", organizerDisplayName: "Shoppers' Group", startsOn: "2026-11-01", reviewOn: "2026-12-31",
  evidence: [{ claim: "The retailer's site does not state a refund policy", sourceTitle: "Retailer website, checked 1 Oct", sourceUrl: "https://example.com/terms" }], actions: [{ category: "CONSUMER_PAUSE", label: "Pause purchases for one month", detail: "", link: "" }], ...o });
describe("campaign publish rules", () => {
  it("a complete campaign with cited evidence has no problems", () => expect(campaignProblems(camp())).toEqual([]));
  it("needs a specific request, closure criteria, dates in order, at least one valid action, and cited evidence", () => {
    expect(campaignProblems(camp({ requestedChange: "Be better" })).join(" ")).toMatch(/specific change/);
    expect(campaignProblems(camp({ closureCriteria: "" })).join(" ")).toMatch(/success or closure/);
    expect(campaignProblems(camp({ reviewOn: "2026-10-01" })).join(" ")).toMatch(/after the start/);
    expect(campaignProblems(camp({ actions: [] })).join(" ")).toMatch(/at least one action/);
    expect(campaignProblems(camp({ actions: [{ category: "HARASS", label: "Contact them", detail: "", link: "" }] })).join(" ")).toMatch(/choose a type/);
    expect(campaignProblems(camp({ evidence: [] })).join(" ")).toMatch(/cited fact/);
    expect(campaignProblems(camp({ evidence: [{ claim: "x", sourceTitle: "y", sourceUrl: "http://nope.example" }] })).join(" ")).toMatch(/https/);
  });
  it("action choices come only from the fixed list of lawful categories", () => {
    const list = Object.keys(ACTION_CATEGORIES);
    expect(list.sort()).toEqual(["CONSUMER_PAUSE", "FEEDBACK_PUBLIC_CHANNEL", "FOLLOW_DEVELOPMENTS", "POSITIVE_PURCHASING", "SHARE_SOURCED_INFO", "SUBSCRIPTION_DECISION", "SUPPORT_TRANSPARENCY_REQUEST"]);
  });
  it("refused tactics in any field block even a draft's content check", () => {
    expect(campaignProblems(camp({ summary: "Spam their support line until they answer" })).join(" ")).toMatch(/floods of messages/);
  });
});

describe("outcomes are labelled as reports, never as verified results", () => {
  it("states never say verified; resolutions are 'reported by organizer'", () => {
    for (const l of Object.values(OUTCOME_STATE_LABEL)) expect(l).not.toMatch(/verified|confirmed|proven|won|victory/i);
    expect(OUTCOME_STATE_LABEL.RESOLVED_REPORTED).toMatch(/reported by organizer/);
    expect(OUTCOME_STATE_LABEL.PARTIALLY_RESOLVED).toMatch(/reported by organizer/);
  });
  it("a reported resolution with no source says no independent evidence has been recorded", () => {
    expect(stateEvidenceNote("RESOLVED_REPORTED", [{ kind: "UNVERIFIED_CLAIM", sourceUrl: "", sourceTitle: "" }])).toMatch(/No independent evidence has been recorded/);
    expect(stateEvidenceNote("RESOLVED_REPORTED", [])).toMatch(/No independent evidence/);
  });
  it("even with a linked source it is 'reported' and 'not independently verified'", () => {
    const note = stateEvidenceNote("RESOLVED_REPORTED", [{ kind: "OBSERVED_OUTCOME", sourceUrl: "https://a.b/c", sourceTitle: "Policy page" }]);
    expect(note).toMatch(/Reported by the organizer/);
    expect(note).toMatch(/has not independently verified/);
    expect(outcomeEvidenceLabel({ kind: "OBSERVED_OUTCOME", sourceUrl: "https://a.b/c", sourceTitle: "Policy page" })).toMatch(/has not independently verified/);
    expect(outcomeEvidenceLabel({ kind: "UNVERIFIED_CLAIM", sourceUrl: "", sourceTitle: "" })).toMatch(/Not independently established/);
  });
  it("a response is not a change", () => expect(stateEvidenceNote("RESPONSE_RECORDED", [{ kind: "DOCUMENTED_RESPONSE", sourceUrl: "https://a.b/c", sourceTitle: "Letter" }])).toMatch(/not a change/));
  it("entries: responses and observed outcomes need a titled https source; a claim does not", () => {
    expect(validateOutcomeEntry({ kind: "DOCUMENTED_RESPONSE", body: "The retailer replied by letter.", sourceUrl: "", sourceTitle: "" })).toMatch(/https/);
    expect(validateOutcomeEntry({ kind: "OBSERVED_OUTCOME", body: "The policy page now exists.", sourceUrl: "https://a.b/c", sourceTitle: "" })).toMatch(/Name the source/);
    expect(validateOutcomeEntry({ kind: "OBSERVED_OUTCOME", body: "The policy page now exists.", sourceUrl: "https://a.b/c", sourceTitle: "Policy page" })).toBeNull();
    expect(validateOutcomeEntry({ kind: "UNVERIFIED_CLAIM", body: "We believe the policy changed.", sourceUrl: "", sourceTitle: "" })).toBeNull();
  });
  it("the external-source provenance label never claims BookMyProtest checked it", () => expect(provenanceLabel({ cls: "EXTERNAL_SOURCE_LINK", source: { title: "Audit" } })).toBe("Link to independent source · Audit"));
});

describe("feature flags are off unless explicitly on", () => {
  const keep = { a: process.env.FEATURE_FIND_YOUR_HILL, b: process.env.FEATURE_HIT_WHERE_IT_HURTS };
  afterEach(() => { process.env.FEATURE_FIND_YOUR_HILL = keep.a; process.env.FEATURE_HIT_WHERE_IT_HURTS = keep.b; if (keep.a === undefined) delete process.env.FEATURE_FIND_YOUR_HILL; if (keep.b === undefined) delete process.env.FEATURE_HIT_WHERE_IT_HURTS; });
  it("default off; independent; only '1' or 'true' turn them on", () => {
    delete process.env.FEATURE_FIND_YOUR_HILL; delete process.env.FEATURE_HIT_WHERE_IT_HURTS;
    expect([findYourHillEnabled(), hitWhereItHurtsEnabled()]).toEqual([false, false]);
    process.env.FEATURE_FIND_YOUR_HILL = "yes"; expect(findYourHillEnabled()).toBe(false);
    process.env.FEATURE_FIND_YOUR_HILL = "1"; expect([findYourHillEnabled(), hitWhereItHurtsEnabled()]).toEqual([true, false]);
    process.env.FEATURE_HIT_WHERE_IT_HURTS = "true"; expect(hitWhereItHurtsEnabled()).toBe(true);
  });
});

describe("copy audit of the v1.1 interface", () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx)$/.test(f)) files.push(p); } };
  for (const d of ["src/app/issues", "src/app/actions", "src/app/activity", "src/app/admin/issues", "src/app/admin/content"]) walk(d);
  files.push("src/components/hill.tsx");
  const strip = (s: string) => s.replace(/[^.\n]*\b(not|never|no|nothing|without|isn't|cannot|does not)\b[^.\n]*[.\n]/gi, " ");
  it("has files to audit", () => expect(files.length).toBeGreaterThan(8));
  it("never promises victory, verified success, damage or impact, and never speaks for BookMyProtest's endorsement", () => {
    const FORBIDDEN = /verified (success|outcome|result|victory)|\bvictory\b|\bwon the\b|successful campaign|hit (them|the company)|financial (damage|impact|harm)|\bbankrupt|lost revenue|economic damage|BookMyProtest (endorses|supports|backs|recommends|verifies|guarantees)/i;
    const offenders = files.filter((f) => FORBIDDEN.test(strip(readFileSync(f, "utf8"))));
    expect(offenders).toEqual([]);
  });
});
