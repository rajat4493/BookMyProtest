/**
 * Which rules have completed verification? A rule is ready for a human's publish decision only when every check below holds.
 * The checks look for evidence that a reviewer actually read the instrument (section reference + excerpt on the PRIMARY source link);
 * a load date alone is not verification. Publishing stays a human act: `publishVerified` calls the same `publishRule` the admin UI uses.
 */
import { query } from "./db";
import { assertHuman, publishRule, type Actor } from "./knowledge";

export interface RuleVerification {
  ruleId: string; family: string; title: string; status: string; ready: boolean; missing: string[];
}

export async function verificationReport(familyPrefix: string): Promise<RuleVerification[]> {
  const rows = await query(`SELECT r.id, r.rule_family_id, r.title, r.rule_status, r.legal_certainty, r.needs_review, r.last_verified_at FROM rules r
    WHERE r.rule_family_id LIKE $1 AND r.rule_status IN ('DRAFT','UNDER_REVIEW','ACTIVE') ORDER BY r.rule_family_id`, [`${familyPrefix}%`]);
  const out: RuleVerification[] = [];
  for (const r of rows) {
    const src = await query(`SELECT rs.evidence_strength, rs.section_ref, rs.excerpt, s.canonical_url, s.source_type, s.lifecycle, s.active,
        (SELECT count(*)::int FROM source_snapshots sn WHERE sn.source_id=s.id AND sn.status NOT IN ('FETCH_FAILED')) AS snapshots
      FROM rule_sources rs JOIN sources s ON s.id=rs.source_id WHERE rs.rule_id=$1`, [r.id]);
    const official = src.filter((s: any) => s.active && s.lifecycle === "CURRENT" && s.canonical_url && s.source_type !== "SECONDARY_LEAD" && s.evidence_strength !== "LEAD");
    const primary = official.filter((s: any) => s.evidence_strength === "PRIMARY");
    const missing: string[] = [];
    if (r.needs_review || r.rule_status === "UNDER_REVIEW") missing.push("held for review: clause-level content not yet established");
    if (!official.length) missing.push("no current official source with a URL");
    if (r.legal_certainty === "UNVERIFIED") missing.push("legal certainty not set");
    if (r.legal_certainty === "PRIMARY_VERIFIED" && !primary.length) missing.push("PRIMARY_VERIFIED without a PRIMARY source link");
    const read = primary.length ? primary : official;
    if (!read.some((s: any) => s.section_ref.trim() && s.excerpt.trim())) missing.push("no section reference and excerpt recorded: nobody has recorded reading the instrument");
    out.push({ ruleId: r.id, family: r.rule_family_id, title: r.title, status: r.rule_status, ready: missing.length === 0, missing });
  }
  return out;
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
