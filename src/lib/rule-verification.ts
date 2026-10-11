/**
 * Which rules have completed verification? The evidence a rule needs depends on what KIND of source backs it, because a statute, a webpage and a
 * live feed prove different things:
 *
 *  CLAUSE_INSTRUMENT  PRIMARY_LAW / BINDING_CASE_LAW / OFFICIAL_ADMINISTRATIVE_RULE
 *                     canonical URL · verified date · section/page/clause reference · supporting excerpt
 *  OFFICIAL_WEBPAGE   OFFICIAL_CURRENT_PRACTICE (not a feed)
 *                     canonical official URL · page title · supporting excerpt · retrieved/verified date · (heading/section identifier where available; never a statutory section number)
 *  LIVE_FEED          a source with a live-restriction feed role (Regulatory Watch)
 *                     canonical official feed URL · SOURCE_VERIFIED · PARSER_REAL_PAGE_VERIFIED · a successful retrieval timestamp
 *                     (no legal section reference: a feed rule says "perform a live check", not "the law says X"; each restriction extracted from the
 *                     feed carries its own order number, legal basis and source evidence before it can become ACTIVE: see saveRestriction)
 *
 * Nothing is relaxed: each class demands strong evidence of its own kind, and a load date is never treated as verification on its own.
 * Publishing stays a human act: `publishVerified` calls the same `publishRule` the admin UI uses.
 */
import { query } from "./db";
import { assertHuman, publishRule, type Actor } from "./knowledge";

export type EvidenceClass = "CLAUSE_INSTRUMENT" | "OFFICIAL_WEBPAGE" | "LIVE_FEED";
export const EVIDENCE_CLASS_LABEL: Record<EvidenceClass, string> = {
  CLAUSE_INSTRUMENT: "clause-based legal instrument",
  OFFICIAL_WEBPAGE: "official webpage / current practice",
  LIVE_FEED: "live feed / regulatory watch source",
};

export function evidenceClassOf(s: { sourceType: string; feedRole: string | null }): EvidenceClass {
  if (s.feedRole) return "LIVE_FEED";
  if (s.sourceType === "OFFICIAL_CURRENT_PRACTICE") return "OFFICIAL_WEBPAGE";
  return "CLAUSE_INSTRUMENT";
}

/** One source link as the gate sees it. */
export interface EvidenceLink {
  sourceTitle: string; sourceType: string; feedRole: string | null; url: string | null; strength: string;
  sectionRef: string; excerpt: string; sourceRetrievedAt: string | null; ruleVerifiedAt: string | null;
  flags: string[]; lastOkRetrievalAt: string | null;
}
export interface EvidenceCheck { evidenceClass: EvidenceClass; missing: string[]; notes: string[] }

const https = (u: string | null) => !!u && /^https:\/\/[^\s/]+\.[^\s/]+/i.test(u);

/** Pure: what is still missing for this one link, given its source type. */
export function checkEvidence(l: EvidenceLink): EvidenceCheck {
  const evidenceClass = evidenceClassOf({ sourceType: l.sourceType, feedRole: l.feedRole });
  const missing: string[] = [], notes: string[] = [];
  if (!https(l.url)) missing.push(evidenceClass === "LIVE_FEED" ? "canonical official feed URL (https)" : evidenceClass === "OFFICIAL_WEBPAGE" ? "canonical official URL (https)" : "canonical source URL (https)");
  if (evidenceClass === "CLAUSE_INSTRUMENT") {
    if (!l.ruleVerifiedAt) missing.push("verified date");
    if (!l.sectionRef.trim()) missing.push("section / page / clause reference");
    if (!l.excerpt.trim()) missing.push("supporting excerpt");
  } else if (evidenceClass === "OFFICIAL_WEBPAGE") {
    if (!l.sourceTitle.trim()) missing.push("page title");
    if (!l.excerpt.trim()) missing.push("supporting excerpt (verbatim text from the page)");
    if (!l.sourceRetrievedAt && !l.ruleVerifiedAt) missing.push("retrieved / verified date");
    if (!l.sectionRef.trim()) notes.push("no heading / section identifier recorded (optional for a webpage; a statutory section number is not expected)");
  } else {
    if (!l.flags.includes("SOURCE_VERIFIED")) missing.push("SOURCE_VERIFIED (a person confirms this is the official feed)");
    if (!l.flags.includes("PARSER_REAL_PAGE_VERIFIED")) missing.push("PARSER_REAL_PAGE_VERIFIED (the parser has been shown to read the real page)");
    if (l.flags.includes("PARSER_REAL_PAGE_VERIFIED") && l.flags.includes("PARSER_REAL_PAGE_VERIFICATION_PENDING")) missing.push("clear PARSER_REAL_PAGE_VERIFICATION_PENDING (it contradicts PARSER_REAL_PAGE_VERIFIED)");
    if (!l.lastOkRetrievalAt) missing.push("a successful retrieval timestamp (no successful fetch or pasted snapshot is recorded)");
    else notes.push(`latest successful retrieval ${l.lastOkRetrievalAt}`);
    notes.push("no legal section reference is required for a feed; each extracted restriction must carry its own order number, legal basis and source evidence before it becomes ACTIVE");
  }
  return { evidenceClass, missing, notes };
}

export interface RuleVerification {
  ruleId: string; family: string; title: string; status: string; ready: boolean; missing: string[];
  /** The class of the evidence link that was judged (the one closest to passing). */
  evidenceClass: EvidenceClass | null; evidenceSource: string | null; notes: string[];
}

async function linksFor(ruleId: string, ruleVerifiedAt: string | null): Promise<(EvidenceLink & { official: boolean })[]> {
  const rows = await query(`SELECT rs.evidence_strength, rs.section_ref, rs.excerpt, s.title, s.source_type, s.feed_role, s.canonical_url, s.active, s.lifecycle, s.verification_flags,
      to_char(s.retrieved_at,'YYYY-MM-DD') AS retrieved_on,
      (SELECT to_char(max(sn.retrieved_at),'YYYY-MM-DD"T"HH24:MI"Z"') FROM source_snapshots sn WHERE sn.source_id=s.id AND sn.status='OK') AS last_ok
    FROM rule_sources rs JOIN sources s ON s.id=rs.source_id WHERE rs.rule_id=$1`, [ruleId]);
  return rows.map((s: any) => ({
    official: s.active && s.lifecycle === "CURRENT" && !!s.canonical_url && s.source_type !== "SECONDARY_LEAD" && s.evidence_strength !== "LEAD",
    sourceTitle: s.title ?? "", sourceType: s.source_type, feedRole: s.feed_role ?? null, url: s.canonical_url, strength: s.evidence_strength, sectionRef: s.section_ref ?? "", excerpt: s.excerpt ?? "",
    sourceRetrievedAt: s.retrieved_on, ruleVerifiedAt, flags: s.verification_flags ?? [], lastOkRetrievalAt: s.last_ok,
  }));
}

export async function verificationReport(familyPrefix: string): Promise<RuleVerification[]> {
  const rows = await query(`SELECT r.id, r.rule_family_id, r.title, r.rule_status, r.legal_certainty, r.needs_review, to_char(r.last_verified_at,'YYYY-MM-DD') AS verified_on FROM rules r
    WHERE r.rule_family_id LIKE $1 AND r.rule_status IN ('DRAFT','UNDER_REVIEW','ACTIVE') ORDER BY r.rule_family_id`, [`${familyPrefix}%`]);
  const out: RuleVerification[] = [];
  for (const r of rows) {
    const links = await linksFor(r.id, r.verified_on);
    const official = links.filter((l) => l.official);
    const primary = official.filter((l) => l.strength === "PRIMARY");
    const missing: string[] = [];
    if (r.needs_review || r.rule_status === "UNDER_REVIEW") missing.push("held for review: clause-level content not yet established");
    if (!official.length) missing.push("no current official source with a URL");
    if (r.legal_certainty === "UNVERIFIED") missing.push("legal certainty not set");
    if (r.legal_certainty === "PRIMARY_VERIFIED" && !primary.length) missing.push("PRIMARY_VERIFIED without a PRIMARY source link");
    // Judge the preferred links (PRIMARY if there are any); the rule passes if any one of them has complete evidence for its own source type.
    const judged = (primary.length ? primary : official).map((l) => ({ l, c: checkEvidence(l) }));
    judged.sort((a, b) => a.c.missing.length - b.c.missing.length);
    const best = judged[0];
    if (best && best.c.missing.length) missing.push(...best.c.missing.map((m) => `${EVIDENCE_CLASS_LABEL[best.c.evidenceClass]}: missing ${m}`));
    out.push({
      ruleId: r.id, family: r.rule_family_id, title: r.title, status: r.rule_status, ready: missing.length === 0, missing,
      evidenceClass: best?.c.evidenceClass ?? null, evidenceSource: best?.l.sourceTitle ?? null, notes: best?.c.notes ?? [],
    });
  }
  return out;
}

/** Feed-class evidence for one source (used by the release-candidate check). */
export async function feedEvidence(sourceId: string): Promise<EvidenceCheck | null> {
  const s = await query(`SELECT title, source_type, feed_role, canonical_url, verification_flags, to_char(retrieved_at,'YYYY-MM-DD') AS retrieved_on,
      (SELECT to_char(max(sn.retrieved_at),'YYYY-MM-DD"T"HH24:MI"Z"') FROM source_snapshots sn WHERE sn.source_id=sources.id AND sn.status='OK') AS last_ok FROM sources WHERE id=$1`, [sourceId]);
  if (!s[0]) return null;
  const x: any = s[0];
  return checkEvidence({ sourceTitle: x.title, sourceType: x.source_type, feedRole: x.feed_role ?? "LIVE_RESTRICTIONS", url: x.canonical_url, strength: "SUPPORTING", sectionRef: "", excerpt: "", sourceRetrievedAt: x.retrieved_on, ruleVerifiedAt: null, flags: x.verification_flags ?? [], lastOkRetrievalAt: x.last_ok });
}

/** Publishes only the DRAFT rules whose verification is complete. Returns what was published and what was held back, with reasons. */
export async function publishVerified(actor: Actor, familyPrefix: string, reason: string, dryRun = false) {
  assertHuman(actor);
  const report = await verificationReport(familyPrefix);
  const published: string[] = [];
  for (const r of report) {
    if (r.status === "ACTIVE" || !r.ready) continue;
    if (!dryRun) await publishRule(r.ruleId, actor, reason);
    published.push(r.family);
  }
  return { published, heldBack: report.filter((r) => r.status !== "ACTIVE" && !r.ready), alreadyActive: report.filter((r) => r.status === "ACTIVE").map((r) => r.family), dryRun };
}
