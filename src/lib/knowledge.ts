/**
 * Regulatory Knowledge Platform services: authorities, sources, rule lifecycle, Regulatory Watch,
 * templates, temporary restrictions and event-evaluation snapshots. No UI code, no jurisdiction-specific logic.
 */
import { randomBytes } from "node:crypto";
import { one, query, tx, type Q } from "./db";
import { evaluate } from "./engine/evaluate";
import { computeReadiness } from "./engine/readiness";
import { overlaysFor, selectRules } from "./engine/select";
import { selectTemplate, type DocTemplate } from "./engine/templates";
import { hashText, heuristicAssistant, normalizeText, type ChangeAssistant, type ChangeSuggestion } from "./engine/watch";
import type {
  Answers, AssemblyType, Category, LegalCertainty, Condition, Confidence, DeadlineDef, EvidenceStrength, InheritanceMode, Level, Rule, RestrictionOverlay,
  RuleStatus, Severity, SourceType, TemporaryRestriction,
} from "./engine/types";
import { doneRuleIds, getRule, getRulesByIds, jurisdictionChain, rulesForChain, type EventRow } from "./store";

/* ---------------- Actors & audit ---------------- */

/** Only a signed-in human may change what counts as current guidance. AI/system actors are rejected here, not just in the UI. */
export interface Actor { userId: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function assertHuman(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || typeof actor.userId !== "string" || !UUID.test(actor.userId)) throw new Error("A human reviewer is required. AI and system processes cannot publish or approve.");
}

async function auditQ(q: Q, actor: string | null, action: string, entity: string, entityId: string, d: { before?: unknown; after?: unknown; reason?: string; [k: string]: unknown } = {}) {
  const { before, after, reason, ...rest } = d;
  await q("INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail, before, after, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    actor, action, entity, entityId, JSON.stringify(rest), before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after), reason ?? "",
  ]);
}

/* ---------------- Authorities ---------------- */

export interface Authority {
  id: string; name: string; jurisdictionId: string; authorityType: string; website: string | null; contactEmail: string; contactPhone: string;
  submissionUrl: string | null; submissionMethod: string; officeAddress: string; active: boolean; notes: string; lastVerifiedAt: string | null;
}
const mapAuth = (r: any): Authority => ({
  id: r.id, name: r.name, jurisdictionId: r.jurisdiction_id, authorityType: r.authority_type, website: r.website, contactEmail: r.contact_email, contactPhone: r.contact_phone,
  submissionUrl: r.submission_url, submissionMethod: r.submission_method, officeAddress: r.office_address, active: r.active, notes: r.notes, lastVerifiedAt: r.last_verified_at,
});
const AUTH_SELECT = "SELECT *, to_char(last_verified_at,'YYYY-MM-DD') AS last_verified_at FROM authorities";

export async function listAuthorities(jurisdictionId?: string): Promise<Authority[]> {
  return (await query(`${AUTH_SELECT} WHERE ($1::uuid IS NULL OR jurisdiction_id=$1) ORDER BY active DESC, name`, [jurisdictionId ?? null])).map(mapAuth);
}
export async function getAuthority(id: string): Promise<Authority | null> {
  const r = await one(`${AUTH_SELECT} WHERE id=$1`, [id]);
  return r ? mapAuth(r) : null;
}
export type AuthorityInput = Omit<Authority, "id">;
export async function saveAuthority(id: string | null, i: AuthorityInput, actor: Actor): Promise<string> {
  assertHuman(actor);
  const p = [i.name, i.jurisdictionId, i.authorityType, i.website, i.contactEmail, i.contactPhone, i.submissionUrl, i.submissionMethod, i.officeAddress, i.active, i.notes, i.lastVerifiedAt];
  return tx(async (q) => {
    const before = id ? (await q(`${AUTH_SELECT} WHERE id=$1`, [id]))[0] : null;
    let aid = id;
    if (id) {
      await q(`UPDATE authorities SET name=$2, jurisdiction_id=$3, authority_type=$4, website=$5, contact_email=$6, contact_phone=$7, submission_url=$8, submission_method=$9,
        office_address=$10, active=$11, notes=$12, last_verified_at=$13 WHERE id=$1`, [id, ...p]);
    } else {
      aid = (await q(`INSERT INTO authorities (name, jurisdiction_id, authority_type, website, contact_email, contact_phone, submission_url, submission_method, office_address, active, notes, last_verified_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, p))[0].id;
    }
    await auditQ(q, actor.userId, id ? "authority.update" : "authority.create", "authority", aid!, { before, after: i });
    return aid!;
  });
}

/* ---------------- Sources (evidence registry) ---------------- */

export interface Source {
  id: string; title: string; sourceType: SourceType; issuingAuthority: string; jurisdictionId: string | null; canonicalUrl: string | null;
  publicationDate: string | null; effectiveDate: string | null; retrievedAt: string | null; lastCheckedAt: string | null; contentHash: string | null;
  active: boolean; monitoringEnabled: boolean; monitoringFrequency: "DAILY" | "WEEKLY" | "MONTHLY" | "MANUAL"; notes: string;
  lifecycle: "CURRENT" | "HISTORICAL" | "PLACEHOLDER"; supersededBySourceId: string | null;
}
const mapSource = (r: any): Source => ({
  id: r.id, title: r.title, sourceType: r.source_type, issuingAuthority: r.issuing_authority, jurisdictionId: r.jurisdiction_id, canonicalUrl: r.canonical_url,
  publicationDate: r.pd, effectiveDate: r.ed, retrievedAt: r.ra, lastCheckedAt: r.last_checked_at ? new Date(r.last_checked_at).toISOString() : null, contentHash: r.content_hash,
  active: r.active, monitoringEnabled: r.monitoring_enabled, monitoringFrequency: r.monitoring_frequency, notes: r.notes,
  lifecycle: r.lifecycle, supersededBySourceId: r.superseded_by_source_id,
});
const SRC_SELECT = `SELECT *, to_char(publication_date,'YYYY-MM-DD') AS pd, to_char(effective_date,'YYYY-MM-DD') AS ed, to_char(retrieved_at,'YYYY-MM-DD') AS ra FROM sources`;

export async function listSources(): Promise<Source[]> {
  return (await query(`${SRC_SELECT} ORDER BY active DESC, title`)).map(mapSource);
}
export async function getSource(id: string): Promise<Source | null> {
  if (!UUID.test(id)) return null;
  const r = await one(`${SRC_SELECT} WHERE id=$1`, [id]);
  return r ? mapSource(r) : null;
}
export type SourceInput = Omit<Source, "id" | "lastCheckedAt" | "contentHash" | "lifecycle" | "supersededBySourceId"> & { lifecycle?: Source["lifecycle"]; supersededBySourceId?: string | null };
export async function saveSource(id: string | null, i: SourceInput, actor: Actor): Promise<string> {
  assertHuman(actor);
  const url = i.canonicalUrl && /^https?:\/\//i.test(i.canonicalUrl) ? i.canonicalUrl : null;
  const lifecycle = i.lifecycle ?? "CURRENT";
  // History and placeholders are never monitored: nothing downstream may depend on them.
  const p = [i.title, i.sourceType, i.issuingAuthority, i.jurisdictionId, url, i.publicationDate, i.effectiveDate, i.retrievedAt, i.active, i.monitoringEnabled && !!url && lifecycle === "CURRENT", i.monitoringFrequency, i.notes, lifecycle, i.supersededBySourceId ?? null];
  return tx(async (q) => {
    const before = id ? (await q(`${SRC_SELECT} WHERE id=$1`, [id]))[0] : null;
    let sid = id;
    if (id) {
      await q(`UPDATE sources SET title=$2, source_type=$3, issuing_authority=$4, jurisdiction_id=$5, canonical_url=$6, publication_date=$7, effective_date=$8, retrieved_at=$9,
        active=$10, monitoring_enabled=$11, monitoring_frequency=$12, notes=$13, lifecycle=$14, superseded_by_source_id=$15 WHERE id=$1`, [id, ...p]);
    } else {
      sid = (await q(`INSERT INTO sources (title, source_type, issuing_authority, jurisdiction_id, canonical_url, publication_date, effective_date, retrieved_at, active, monitoring_enabled, monitoring_frequency, notes, lifecycle, superseded_by_source_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`, p))[0].id;
    }
    await auditQ(q, actor.userId, id ? "source.update" : "source.create", "source", sid!, { before, after: i });
    return sid!;
  });
}

export async function listSnapshots(sourceId: string) {
  return query(`SELECT id, retrieved_at, content_hash, status, reference, length(coalesce(raw_text,''))::int AS chars FROM source_snapshots WHERE source_id=$1 ORDER BY retrieved_at DESC LIMIT 50`, [sourceId]);
}

/** Link evidence to a rule. Only draft/under-review rules can gain evidence; live rules change via a new version. */
export async function linkSource(ruleId: string, sourceId: string, link: { strength: EvidenceStrength; relevance?: string; excerpt?: string; sectionRef?: string; note?: string; flagOnChange?: boolean }, actor: Actor) {
  assertHuman(actor);
  await tx(async (q) => {
    const [rule] = await q("SELECT rule_status FROM rules WHERE id=$1", [ruleId]);
    if (!rule || !["DRAFT", "UNDER_REVIEW"].includes(rule.rule_status)) throw new Error("Evidence can only be changed on a draft. Clone the rule as a new version first.");
    const [src] = await q("SELECT lifecycle FROM sources WHERE id=$1", [sourceId]);
    if (!src) throw new Error("Source not found");
    if (src.lifecycle !== "CURRENT") throw new Error(`A ${src.lifecycle.toLowerCase()} source cannot be evidence for a current rule.`);
    await q(`INSERT INTO rule_sources (rule_id, source_id, evidence_strength, relevance, excerpt, section_ref, interpretation_note, flag_on_change) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (rule_id, source_id) DO UPDATE SET evidence_strength=$3, relevance=$4, excerpt=$5, section_ref=$6, interpretation_note=$7, flag_on_change=$8`,
      [ruleId, sourceId, link.strength, link.relevance ?? "", link.excerpt ?? "", link.sectionRef ?? "", link.note ?? "", link.flagOnChange ?? true]);
    await auditQ(q, actor.userId, "rule.evidence.link", "rule", ruleId, { after: { sourceId, ...link } });
  });
}
export async function unlinkSource(ruleId: string, sourceId: string, actor: Actor) {
  assertHuman(actor);
  await tx(async (q) => {
    const [rule] = await q("SELECT rule_status FROM rules WHERE id=$1", [ruleId]);
    if (!rule || !["DRAFT", "UNDER_REVIEW"].includes(rule.rule_status)) throw new Error("Evidence can only be changed on a draft.");
    await q("DELETE FROM rule_sources WHERE rule_id=$1 AND source_id=$2", [ruleId, sourceId]);
    await auditQ(q, actor.userId, "rule.evidence.unlink", "rule", ruleId, { before: { sourceId } });
  });
}

/* ---------------- Rule lifecycle ---------------- */

export interface RuleInput {
  ruleFamilyId?: string;
  jurisdictionId: string;
  authorityId: string | null;
  assemblyType: AssemblyType;
  title: string;
  description: string; // plain-English explanation
  legalStatement: string;
  userAction: string;
  category: Category;
  requirementType: string;
  level: Level;
  elseLevel: Level | null;
  severity: Severity;
  legalCertainty: LegalCertainty;
  condition: Condition;
  completeWhen: Condition | null;
  deadline: DeadlineDef;
  submissionMethod: string;
  officialLink: string | null;
  documents: { name: string; required: boolean; conditional: boolean; templateKey: string | null; notes: string }[];
  vendorCategory: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  lastVerifiedAt: string | null;
  needsReview: boolean;
  confidence: Confidence;
  ruleOwner: string;
  adminNotes: string;
  sort: number;
  inheritanceMode: InheritanceMode;
  overridesFamilyId: string | null;
}

const newFamilyId = () => `RULE-${randomBytes(3).toString("hex").toUpperCase()}`;

async function replaceDocs(q: Q, ruleId: string, docs: RuleInput["documents"]) {
  await q("DELETE FROM rule_documents WHERE rule_id=$1", [ruleId]);
  for (const d of docs) await q("INSERT INTO rule_documents (rule_id, name, required, conditional, template_key, notes) VALUES ($1,$2,$3,$4,$5,$6)", [ruleId, d.name, d.required, d.conditional, d.templateKey, d.notes]);
}

/** Creates a DRAFT, or edits an existing DRAFT / UNDER_REVIEW rule. Live rules are never edited in place. */
export async function saveRuleDraft(id: string | null, i: RuleInput, actor: Actor): Promise<string> {
  assertHuman(actor);
  return tx(async (q) => {
    const params = [i.jurisdictionId, i.authorityId, i.assemblyType, i.title, i.description, i.legalStatement, i.userAction, i.category, i.requirementType, i.level, i.elseLevel, i.severity,
      JSON.stringify(i.condition), i.completeWhen ? JSON.stringify(i.completeWhen) : null, JSON.stringify(i.deadline), i.submissionMethod, i.officialLink, i.vendorCategory,
      i.effectiveFrom, i.effectiveUntil, i.lastVerifiedAt, i.needsReview, i.confidence, i.ruleOwner, i.adminNotes, i.sort, i.inheritanceMode, i.overridesFamilyId, i.legalCertainty];
    let ruleId = id;
    let before: unknown = null;
    if (id) {
      const [cur] = await q("SELECT * FROM rules WHERE id=$1 FOR UPDATE", [id]);
      if (!cur) throw new Error("Rule not found");
      if (!["DRAFT", "UNDER_REVIEW"].includes(cur.rule_status)) throw new Error("Only draft rules can be edited. Clone this rule as a new version instead.");
      before = cur;
      await q(`UPDATE rules SET jurisdiction_id=$2, authority_id=$3, assembly_type=$4, title=$5, description=$6, legal_statement=$7, user_action=$8, category=$9, requirement_type=$10,
        level=$11, else_level=$12, severity=$13, condition=$14, complete_when=$15, deadline_definition=$16, submission_method=$17, official_link=$18, vendor_category=$19,
        effective_from=$20, effective_until=$21, last_verified_at=$22, needs_review=$23, confidence=$24, rule_owner=$25, admin_notes=$26, sort=$27, inheritance_mode=$28,
        overrides_family_id=$29, legal_certainty=$30, updated_at=now() WHERE id=$1`, [id, ...params]);
    } else {
      const family = (i.ruleFamilyId ?? "").trim().toUpperCase() || newFamilyId();
      if ((await q("SELECT 1 FROM rules WHERE rule_family_id=$1", [family])).length) throw new Error(`Rule family ${family} already exists. Clone it as a new version instead.`);
      ruleId = (await q(`INSERT INTO rules (rule_family_id, version, rule_status, jurisdiction_id, authority_id, assembly_type, title, description, legal_statement, user_action, category,
        requirement_type, level, else_level, severity, condition, complete_when, deadline_definition, submission_method, official_link, vendor_category, effective_from, effective_until,
        last_verified_at, needs_review, confidence, rule_owner, admin_notes, sort, inheritance_mode, overrides_family_id, legal_certainty)
        VALUES ($30,1,'DRAFT',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) RETURNING id`, [...params.slice(0, 28), i.legalCertainty, family]))[0].id;
    }
    await replaceDocs(q, ruleId!, i.documents);
    await auditQ(q, actor.userId, id ? "rule.update_draft" : "rule.create", "rule", ruleId!, { before, after: { title: i.title, jurisdictionId: i.jurisdictionId } });
    return ruleId!;
  });
}

export async function submitForReview(ruleId: string, actor: Actor) {
  assertHuman(actor);
  await tx(async (q) => {
    const r = await q("UPDATE rules SET rule_status='UNDER_REVIEW', updated_at=now() WHERE id=$1 AND rule_status='DRAFT' RETURNING id", [ruleId]);
    if (!r.length) throw new Error("Only a draft can be submitted for review.");
    await auditQ(q, actor.userId, "rule.submit_review", "rule", ruleId, { before: { status: "DRAFT" }, after: { status: "UNDER_REVIEW" } });
  });
}

/** Copies a rule to the next version of its family as a DRAFT that supersedes it. The old version stays untouched until the new one is published. */
export async function cloneAsNewVersion(ruleId: string, actor: Actor): Promise<string> {
  assertHuman(actor);
  return tx(async (q) => {
    const [src] = await q("SELECT * FROM rules WHERE id=$1", [ruleId]);
    if (!src) throw new Error("Rule not found");
    const [{ v }] = await q("SELECT max(version)::int AS v FROM rules WHERE rule_family_id=$1", [src.rule_family_id]);
    const [{ open }] = await q("SELECT count(*)::int AS open FROM rules WHERE rule_family_id=$1 AND rule_status IN ('DRAFT','UNDER_REVIEW')", [src.rule_family_id]);
    if (open > 0) throw new Error("This family already has a draft version in progress.");
    const id = (await q(`INSERT INTO rules (rule_family_id, version, rule_status, jurisdiction_id, authority_id, assembly_type, title, description, legal_statement, user_action, category,
        requirement_type, level, else_level, severity, condition, complete_when, deadline_definition, submission_method, official_link, vendor_category, needs_review, confidence,
        rule_owner, admin_notes, sort, inheritance_mode, overrides_family_id, supersedes_rule_id)
      SELECT rule_family_id, $2, 'DRAFT', jurisdiction_id, authority_id, assembly_type, title, description, legal_statement, user_action, category, requirement_type, level, else_level,
        severity, condition, complete_when, deadline_definition, submission_method, official_link, vendor_category, true, confidence, rule_owner, admin_notes, sort, inheritance_mode,
        overrides_family_id, id FROM rules WHERE id=$1 RETURNING id`, [ruleId, v + 1]))[0].id;
    await q(`INSERT INTO rule_sources (rule_id, source_id, evidence_strength, relevance, excerpt, section_ref, interpretation_note)
             SELECT $2, source_id, evidence_strength, relevance, excerpt, section_ref, interpretation_note FROM rule_sources WHERE rule_id=$1`, [ruleId, id]);
    await q(`INSERT INTO rule_documents (rule_id, name, required, conditional, template_key, authority_id, notes, source_reference)
             SELECT $2, name, required, conditional, template_key, authority_id, notes, source_reference FROM rule_documents WHERE rule_id=$1`, [ruleId, id]);
    await auditQ(q, actor.userId, "rule.clone_version", "rule", id, { after: { family: src.rule_family_id, version: v + 1, supersedes: ruleId } });
    return id;
  });
}

/**
 * Publishes a draft: the only path to ACTIVE. Requires a human actor, an official (non-secondary) source with a URL
 * and a verification date. If the rule supersedes another, the old version is closed on the new version's effective date.
 */
export async function publishRule(ruleId: string, actor: Actor, reason = ""): Promise<void> {
  assertHuman(actor);
  await tx(async (q) => {
    const [r] = await q("SELECT * FROM rules WHERE id=$1 FOR UPDATE", [ruleId]);
    if (!r) throw new Error("Rule not found");
    if (!["DRAFT", "UNDER_REVIEW"].includes(r.rule_status)) throw new Error("Only a draft or rule under review can be published.");
    const [{ n }] = await q(`SELECT count(*)::int AS n FROM rule_sources rs JOIN sources s ON s.id=rs.source_id
      WHERE rs.rule_id=$1 AND s.active AND s.lifecycle='CURRENT' AND s.canonical_url IS NOT NULL AND s.source_type <> 'SECONDARY_LEAD' AND rs.evidence_strength <> 'LEAD'`, [ruleId]);
    if (n < 1) throw new Error("Attach at least one official source with a URL (secondary reporting alone cannot support a rule).");
    if (r.legal_certainty === "UNVERIFIED") throw new Error("Set the legal certainty (primary-verified or official guidance) before publishing.");
    if (r.legal_certainty === "PRIMARY_VERIFIED") {
      const [{ p }] = await q(`SELECT count(*)::int AS p FROM rule_sources rs JOIN sources s ON s.id=rs.source_id
        WHERE rs.rule_id=$1 AND s.active AND s.lifecycle='CURRENT' AND s.canonical_url IS NOT NULL AND s.source_type <> 'SECONDARY_LEAD' AND rs.evidence_strength = 'PRIMARY'`, [ruleId]);
      if (p < 1) throw new Error("PRIMARY_VERIFIED needs at least one source attached with PRIMARY evidence strength.");
    }
    if (!r.last_verified_at) throw new Error("Record the last-verified date before publishing.");
    const [{ eff }] = await q("SELECT COALESCE($1::date, current_date)::text AS eff", [r.effective_from]);
    await q("UPDATE rules SET rule_status='ACTIVE', needs_review=false, effective_from=$2, reviewed_by=$3, reviewed_at=now(), updated_at=now() WHERE id=$1", [ruleId, eff, actor.userId]);
    if (r.supersedes_rule_id) {
      await q(`UPDATE rules SET rule_status='SUPERSEDED', effective_until=$2, updated_at=now() WHERE id=$1 AND rule_status IN ('ACTIVE','CHANGE_DETECTED')`, [r.supersedes_rule_id, eff]);
      await q(`UPDATE change_event_rules SET replacement_rule_id=$2 WHERE rule_id=$1 AND replacement_rule_id IS NULL`, [r.supersedes_rule_id, ruleId]);
      await resolveChangeEventsFor(q, r.supersedes_rule_id, actor.userId);
      await auditQ(q, actor.userId, "rule.supersede", "rule", r.supersedes_rule_id, { before: { status: "ACTIVE" }, after: { status: "SUPERSEDED", effectiveUntil: eff, supersededBy: ruleId }, reason });
    }
    await auditQ(q, actor.userId, "rule.publish", "rule", ruleId, { before: { status: r.rule_status }, after: { status: "ACTIVE", effectiveFrom: eff }, reason });
  });
}

export async function archiveRule(ruleId: string, actor: Actor, reason = "") {
  assertHuman(actor);
  await tx(async (q) => {
    const [r] = await q("SELECT rule_status FROM rules WHERE id=$1 FOR UPDATE", [ruleId]);
    if (!r) throw new Error("Rule not found");
    await q("UPDATE rules SET rule_status='ARCHIVED', archived_at=now(), updated_at=now() WHERE id=$1", [ruleId]);
    await auditQ(q, actor.userId, "rule.archive", "rule", ruleId, { before: { status: r.rule_status }, after: { status: "ARCHIVED" }, reason });
  });
}

/* ---------------- Regulatory Watch ---------------- */

export type CheckResult =
  | { kind: "BASELINE"; snapshotId: string }
  | { kind: "UNCHANGED" }
  | { kind: "CHANGED"; changeEventId: string; affectedRuleIds: string[]; suggestion: ChangeSuggestion }
  | { kind: "FETCH_FAILED"; error: string };

/**
 * Records fetched/pasted content for a source. First content is the baseline; identical hash is a no-op;
 * a different hash creates a change event, asks the assistant for a SUGGESTION, and moves every ACTIVE rule that cites the source
 * to CHANGE_DETECTED so users stop seeing it as unquestionably current. Nothing is ever published or edited here.
 */
export async function recordSourceContent(sourceId: string, text: string, assistant: ChangeAssistant = heuristicAssistant, reference = ""): Promise<CheckResult> {
  const src = await getSource(sourceId);
  if (!src) throw new Error("Source not found");
  const hash = hashText(text);
  const [prev] = await query<{ id: string; content_hash: string; raw_text: string | null }>(
    "SELECT id, content_hash, raw_text FROM source_snapshots WHERE source_id=$1 AND status='OK' ORDER BY retrieved_at DESC, id LIMIT 1", [sourceId]);
  if (prev && prev.content_hash === hash) {
    await query("UPDATE sources SET last_checked_at=now() WHERE id=$1", [sourceId]);
    return { kind: "UNCHANGED" };
  }
  const suggestion = prev ? await assistant({ sourceTitle: src.title, previousText: prev.raw_text ?? "", currentText: text }) : null;
  return tx(async (q) => {
    const snap = (await q("INSERT INTO source_snapshots (source_id, content_hash, raw_text, reference) VALUES ($1,$2,$3,$4) RETURNING id", [sourceId, hash, text.slice(0, 500_000), reference]))[0].id as string;
    await q("UPDATE sources SET last_checked_at=now(), content_hash=$2 WHERE id=$1", [sourceId, hash]);
    if (!prev || !suggestion) return { kind: "BASELINE" as const, snapshotId: snap };

    const linked = await q(`SELECT r.id, r.rule_status FROM rules r JOIN rule_sources rs ON rs.rule_id=r.id WHERE rs.source_id=$1 AND rs.flag_on_change AND r.rule_status IN ('ACTIVE','CHANGE_DETECTED')`, [sourceId]);
    const affected = linked.map((r) => r.id as string);
    const ev = (await q(
      `INSERT INTO change_events (source_id, previous_snapshot_id, current_snapshot_id, change_summary, summary_origin, diff_excerpt, materiality, review_priority, affected_rule_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [sourceId, prev.id, snap, suggestion.summary, suggestion.origin, suggestion.diffExcerpt, suggestion.materiality, suggestion.priority, affected]))[0].id as string;
    for (const r of linked) {
      await q("INSERT INTO change_event_rules (change_event_id, rule_id) VALUES ($1,$2)", [ev, r.id]);
      if (r.rule_status === "ACTIVE") {
        await q("UPDATE rules SET rule_status='CHANGE_DETECTED', updated_at=now() WHERE id=$1", [r.id]);
        await auditQ(q, null, "rule.change_detected", "rule", r.id, { before: { status: "ACTIVE" }, after: { status: "CHANGE_DETECTED" }, changeEventId: ev, reason: "Monitored source content changed" });
      }
    }
    await auditQ(q, null, "source.change_detected", "source", sourceId, { changeEventId: ev, materiality: suggestion.materiality, origin: suggestion.origin });
    return { kind: "CHANGED" as const, changeEventId: ev, affectedRuleIds: affected, suggestion };
  });
}

export type Fetcher = (url: string) => Promise<string>;

function isPublicHttpUrl(u: string): boolean {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return false;
    const h = x.hostname.toLowerCase();
    return !(h === "localhost" || h.endsWith(".internal") || h.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/.test(h));
  } catch { return false; }
}

export const defaultFetcher: Fetcher = async (url) => {
  if (!isPublicHttpUrl(url)) throw new Error("Refusing to fetch a non-public URL");
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "BookMyProtest-RegulatoryWatch/0.1" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = (await res.text()).slice(0, 2_000_000);
  return normalizeText(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " "));
};

export async function checkSource(sourceId: string, fetcher: Fetcher = defaultFetcher, assistant: ChangeAssistant = heuristicAssistant): Promise<CheckResult> {
  const src = await getSource(sourceId);
  if (!src?.canonicalUrl) throw new Error("This source has no URL to check. Paste content manually instead.");
  try {
    return await recordSourceContent(sourceId, await fetcher(src.canonicalUrl), assistant, src.canonicalUrl);
  } catch (e) {
    await query("INSERT INTO source_snapshots (source_id, content_hash, status, reference) VALUES ($1,'fetch-failed','FETCH_FAILED',$2)", [sourceId, String((e as Error).message).slice(0, 300)]);
    await query("UPDATE sources SET last_checked_at=now() WHERE id=$1", [sourceId]);
    return { kind: "FETCH_FAILED", error: (e as Error).message };
  }
}

const EVERY_MS = { DAILY: 864e5, WEEKLY: 7 * 864e5, MONTHLY: 30 * 864e5 } as const;
/** For a cron/job runner: checks every monitored source whose frequency has elapsed. */
export async function runDueChecks(fetcher: Fetcher = defaultFetcher, now = Date.now()) {
  const results: { sourceId: string; result: CheckResult }[] = [];
  for (const s of await listSources()) {
    if (!s.active || s.lifecycle !== "CURRENT" || !s.monitoringEnabled || !s.canonicalUrl || s.monitoringFrequency === "MANUAL") continue;
    if (s.lastCheckedAt && now - Date.parse(s.lastCheckedAt) < EVERY_MS[s.monitoringFrequency]) continue;
    results.push({ sourceId: s.id, result: await checkSource(s.id, fetcher) });
  }
  return results;
}

export interface ChangeEventRow {
  id: string; sourceId: string; sourceTitle: string; detectedAt: string; summary: string; summaryOrigin: string; diffExcerpt: string; materiality: string; priority: string;
  affectedRules: { id: string; title: string; familyId: string; version: number; status: RuleStatus; replacementId: string | null }[];
  reviewStatus: string; reviewNotes: string; reviewedAt: string | null;
}
export async function listChangeEvents(status?: string): Promise<ChangeEventRow[]> {
  const evs = await query(`SELECT c.*, s.title AS source_title FROM change_events c JOIN sources s ON s.id=c.source_id WHERE ($1::text IS NULL OR c.review_status=$1)
    ORDER BY (c.review_status='PENDING') DESC, c.detected_at DESC LIMIT 100`, [status ?? null]);
  const rules = evs.length ? await query(`SELECT cr.change_event_id, cr.replacement_rule_id, r.id, r.title, r.rule_family_id, r.version, r.rule_status FROM change_event_rules cr JOIN rules r ON r.id=cr.rule_id WHERE cr.change_event_id = ANY($1)`, [evs.map((e: any) => e.id)]) : [];
  return evs.map((e: any) => ({
    id: e.id, sourceId: e.source_id, sourceTitle: e.source_title, detectedAt: new Date(e.detected_at).toISOString(), summary: e.change_summary, summaryOrigin: e.summary_origin,
    diffExcerpt: e.diff_excerpt, materiality: e.materiality, priority: e.review_priority, reviewStatus: e.review_status, reviewNotes: e.review_notes,
    reviewedAt: e.reviewed_at ? new Date(e.reviewed_at).toISOString() : null,
    affectedRules: rules.filter((r: any) => r.change_event_id === e.id).map((r: any) => ({ id: r.id, title: r.title, familyId: r.rule_family_id, version: r.version, status: r.rule_status, replacementId: r.replacement_rule_id })),
  }));
}

/** After a human resolves the rules, close the change event if nothing it flagged is still CHANGE_DETECTED. */
async function resolveChangeEventsFor(q: Q, ruleId: string, reviewer: string) {
  const evs = await q(`SELECT DISTINCT cr.change_event_id AS id FROM change_event_rules cr JOIN change_events c ON c.id=cr.change_event_id WHERE cr.rule_id=$1 AND c.review_status='PENDING'`, [ruleId]);
  for (const e of evs) {
    const [{ open }] = await q(`SELECT count(*)::int AS open FROM change_event_rules cr JOIN rules r ON r.id=cr.rule_id WHERE cr.change_event_id=$1 AND r.rule_status='CHANGE_DETECTED'`, [e.id]);
    if (open === 0) {
      await q("UPDATE change_events SET review_status='APPROVED_UPDATE', reviewed_by=$2, reviewed_at=now(), review_notes=CASE WHEN review_notes='' THEN 'Replacement version published.' ELSE review_notes END WHERE id=$1", [e.id, reviewer]);
      await auditQ(q, reviewer, "change_event.approved_update", "change_event", e.id, { reason: "All affected rules resolved by publishing new versions" });
    }
  }
}

/** Human decision: the change does not alter the requirement. Flagged rules return to ACTIVE (unless another pending change still holds them). */
export async function dismissChange(changeEventId: string, actor: Actor, notes: string) {
  assertHuman(actor);
  await tx(async (q) => {
    const [ev] = await q("SELECT * FROM change_events WHERE id=$1 FOR UPDATE", [changeEventId]);
    if (!ev || ev.review_status !== "PENDING") throw new Error("Only a pending change can be dismissed.");
    const rules = await q("SELECT rule_id FROM change_event_rules WHERE change_event_id=$1", [changeEventId]);
    for (const { rule_id } of rules) {
      const [{ other }] = await q(`SELECT count(*)::int AS other FROM change_event_rules cr JOIN change_events c ON c.id=cr.change_event_id WHERE cr.rule_id=$1 AND c.review_status='PENDING' AND c.id<>$2`, [rule_id, changeEventId]);
      if (other === 0) {
        const done = await q("UPDATE rules SET rule_status='ACTIVE', updated_at=now() WHERE id=$1 AND rule_status='CHANGE_DETECTED' RETURNING id", [rule_id]);
        if (done.length) await auditQ(q, actor.userId, "rule.change_dismissed", "rule", rule_id, { before: { status: "CHANGE_DETECTED" }, after: { status: "ACTIVE" }, reason: notes });
      }
    }
    await q("UPDATE change_events SET review_status='DISMISSED', review_notes=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$1", [changeEventId, notes, actor.userId]);
    await auditQ(q, actor.userId, "change_event.dismiss", "change_event", changeEventId, { reason: notes });
  });
}

/** Human decision: the change matters. Creates a draft next version of the affected rule, linked to this change. */
export async function startReplacement(changeEventId: string, ruleId: string, actor: Actor): Promise<string> {
  assertHuman(actor);
  const newId = await cloneAsNewVersion(ruleId, actor);
  await query("UPDATE change_event_rules SET replacement_rule_id=$3 WHERE change_event_id=$1 AND rule_id=$2", [changeEventId, ruleId, newId]);
  return newId;
}

/* ---------------- Temporary restrictions ---------------- */

const mapRestriction = (r: any): TemporaryRestriction => ({
  id: r.id, jurisdictionId: r.jurisdiction_id, title: r.title, geographicScope: r.geographic_scope, startsAt: new Date(r.starts_at).toISOString(), endsAt: new Date(r.ends_at).toISOString(),
  legalBasis: r.legal_basis, affectedActivities: r.affected_activities, effect: r.effect, plainExplanation: r.plain_explanation, sourceId: r.source_id, status: r.status,
});
export async function listRestrictions(chain?: string[]): Promise<TemporaryRestriction[]> {
  return (await query("SELECT * FROM temporary_restrictions WHERE ($1::uuid[] IS NULL OR jurisdiction_id = ANY($1)) ORDER BY starts_at DESC", [chain ?? null])).map(mapRestriction);
}
export type RestrictionInput = Omit<TemporaryRestriction, "id">;
export async function saveRestriction(id: string | null, i: RestrictionInput, actor: Actor): Promise<string> {
  assertHuman(actor);
  if (i.status === "ACTIVE" && !i.sourceId) throw new Error("An active restriction needs a source.");
  const p = [i.jurisdictionId, i.title, i.geographicScope, i.startsAt, i.endsAt, i.legalBasis, i.affectedActivities, i.effect, i.plainExplanation, i.sourceId, i.status];
  return tx(async (q) => {
    let rid = id;
    if (id) await q(`UPDATE temporary_restrictions SET jurisdiction_id=$2, title=$3, geographic_scope=$4, starts_at=$5, ends_at=$6, legal_basis=$7, affected_activities=$8, effect=$9,
      plain_explanation=$10, source_id=$11, status=$12 WHERE id=$1`, [id, ...p]);
    else rid = (await q(`INSERT INTO temporary_restrictions (jurisdiction_id, title, geographic_scope, starts_at, ends_at, legal_basis, affected_activities, effect, plain_explanation, source_id, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, p))[0].id;
    await auditQ(q, actor.userId, id ? "restriction.update" : "restriction.create", "temporary_restriction", rid!, { after: i });
    return rid!;
  });
}

/* ---------------- Document templates ---------------- */

const mapTemplate = (r: any): DocTemplate => ({
  id: r.id, templateKey: r.template_key, name: r.name, jurisdictionId: r.jurisdiction_id, authorityId: r.authority_id, authorityName: r.authority_name ?? null, version: r.version,
  content: r.content, disclaimer: r.disclaimer, active: r.active, effectiveFrom: r.ef, effectiveUntil: r.eu, sourceId: r.source_id,
});
const TPL_SELECT = `SELECT t.*, to_char(t.effective_from,'YYYY-MM-DD') AS ef, to_char(t.effective_until,'YYYY-MM-DD') AS eu, a.name AS authority_name FROM document_templates t LEFT JOIN authorities a ON a.id=t.authority_id`;

export async function listTemplates(): Promise<DocTemplate[]> {
  return (await query(`${TPL_SELECT} ORDER BY t.template_key, t.jurisdiction_id NULLS FIRST, t.version DESC`)).map(mapTemplate);
}
export async function getTemplate(id: string): Promise<DocTemplate | null> {
  if (!UUID.test(id)) return null;
  const r = await one(`${TPL_SELECT} WHERE t.id=$1`, [id]);
  return r ? mapTemplate(r) : null;
}
export async function templatesForChain(chain: string[]): Promise<DocTemplate[]> {
  return (await query(`${TPL_SELECT} WHERE t.active AND (t.jurisdiction_id IS NULL OR t.jurisdiction_id = ANY($1))`, [chain])).map(mapTemplate);
}

export interface TemplateInput { templateKey: string; name: string; jurisdictionId: string | null; authorityId: string | null; content: string; disclaimer: string; effectiveFrom: string | null; effectiveUntil: string | null; sourceId: string | null }
/** Every save creates the next version for (key, jurisdiction). Older versions are kept for history and for plans generated with them. */
export async function saveTemplateVersion(i: TemplateInput, actor: Actor): Promise<{ id: string; version: number }> {
  assertHuman(actor);
  return tx(async (q) => {
    const [{ v }] = await q(`SELECT COALESCE(max(version),0)::int AS v FROM document_templates WHERE template_key=$1 AND jurisdiction_id IS NOT DISTINCT FROM $2`, [i.templateKey, i.jurisdictionId]);
    const id = (await q(`INSERT INTO document_templates (template_key, name, jurisdiction_id, authority_id, version, content, disclaimer, effective_from, effective_until, source_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [i.templateKey, i.name, i.jurisdictionId, i.authorityId, v + 1, i.content, i.disclaimer, i.effectiveFrom, i.effectiveUntil, i.sourceId]))[0].id as string;
    await auditQ(q, actor.userId, "template.version", "document_template", id, { after: { key: i.templateKey, version: v + 1, jurisdictionId: i.jurisdictionId } });
    return { id, version: v + 1 };
  });
}
export async function setTemplateActive(id: string, active: boolean, actor: Actor) {
  assertHuman(actor);
  await tx(async (q) => {
    await q("UPDATE document_templates SET active=$2 WHERE id=$1", [id, active]);
    await auditQ(q, actor.userId, "template.active", "document_template", id, { after: { active } });
  });
}
export { selectTemplate };

/** One selected template per document kind for this place and date (most specific jurisdiction, highest in-window version). */
export async function selectTemplateMap(chain: string[], asOf: string): Promise<Partial<Record<string, DocTemplate>>> {
  const all = await templatesForChain(chain);
  const out: Partial<Record<string, DocTemplate>> = {};
  for (const key of new Set(all.map((t) => t.templateKey))) {
    const t = selectTemplate(all, key, chain, asOf);
    if (t) out[key] = t;
  }
  return out;
}

/* ---------------- Applicable rules & evaluation snapshots ---------------- */

export function chainFor(e: Pick<EventRow, "jurisdictionId" | "venueJurisdictionId">) {
  return jurisdictionChain(e.venueJurisdictionId ?? e.jurisdictionId);
}

export async function applicableFor(chain: string[], asOf: string, answers: Answers): Promise<{ rules: Rule[]; overlays: RestrictionOverlay[] }> {
  const rules = selectRules(await rulesForChain(chain), chain, asOf);
  const overlays = overlaysFor(await listRestrictions(chain), chain, asOf, answers);
  return { rules, overlays };
}

export interface EvaluationRow {
  id: string; eventId: string; evaluatedAt: string; asOfDate: string; answers: Answers; ruleIds: string[]; fingerprint: string;
  rules: { ruleId: string; familyId: string; version: number; title: string; level: Level; status: RuleStatus; evidence: string; freshness: string; sourceIds: string[]; lastVerifiedAt: string | null }[];
  sources: { id: string; title: string; type: string | null; url: string | null }[];
  requirements: { ruleId: string; title: string; category: string; severity: string; level: string; evidence: string; freshness: string; done: boolean; deadline: string | null }[];
  restrictions: { id: string; title: string; effect: string; matchedActivities: string[] }[];
  readinessPct: number; reason: string;
}
const mapEval = (r: any): EvaluationRow => ({
  id: r.id, eventId: r.event_id, evaluatedAt: new Date(r.evaluated_at).toISOString(), asOfDate: r.aod, answers: r.answers, ruleIds: r.rule_ids, fingerprint: r.ruleset_fingerprint,
  rules: r.rules, sources: r.sources, requirements: r.requirements, restrictions: r.restrictions, readinessPct: r.readiness_pct, reason: r.reason,
});
const EVAL_SELECT = "SELECT *, to_char(as_of_date,'YYYY-MM-DD') AS aod FROM event_evaluations";

export const fingerprintOf = (rules: Pick<Rule, "ruleFamilyId" | "version">[]) => rules.map((r) => `${r.ruleFamilyId}@${r.version}`).sort().join(",");

export async function latestEvaluation(eventId: string): Promise<EvaluationRow | null> {
  const r = await one(`${EVAL_SELECT} WHERE event_id=$1 ORDER BY evaluated_at DESC, id LIMIT 1`, [eventId]);
  return r ? mapEval(r) : null;
}
export async function listEvaluations(eventId: string): Promise<EvaluationRow[]> {
  return (await query(`${EVAL_SELECT} WHERE event_id=$1 ORDER BY evaluated_at DESC`, [eventId])).map(mapEval);
}

/**
 * Records exactly what the user is shown: answers, rule versions, sources, requirements, restrictions. Append-only
 * (a DB trigger rejects UPDATEs), so tomorrow's law change never rewrites yesterday's plan.
 */
export async function generateEvaluation(event: EventRow, reason: "GENERATED" | "RECHECK" | "BACKFILL" = "GENERATED", carryDoneFamilies?: Set<string>): Promise<EvaluationRow> {
  const chain = await chainFor(event);
  const { rules, overlays } = await applicableFor(chain, event.date, event.answers);
  if (carryDoneFamilies) {
    for (const r of rules) if (carryDoneFamilies.has(r.ruleFamilyId)) {
      await query(`INSERT INTO event_requirements (event_id, rule_id, done) VALUES ($1,$2,true) ON CONFLICT (event_id, rule_id) DO UPDATE SET done=true, updated_at=now()`, [event.id, r.id]);
    }
  }
  const items = evaluate(rules, event.answers, await doneRuleIds(event.id), overlays);
  const readiness = computeReadiness(items);
  const srcMap = new Map<string, EvaluationRow["sources"][number]>();
  for (const r of rules) for (const s of r.sources) if (s.sourceId) srcMap.set(s.sourceId, { id: s.sourceId, title: s.title, type: s.sourceType ?? null, url: s.url });
  const row = await one(
    `INSERT INTO event_evaluations (event_id, as_of_date, answers, rule_ids, ruleset_fingerprint, rules, sources, requirements, restrictions, readiness_pct, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [event.id, event.date, JSON.stringify(event.answers), rules.map((r) => r.id), fingerprintOf(rules),
      JSON.stringify(items.map((i) => ({ ruleId: i.rule.id, familyId: i.rule.ruleFamilyId, version: i.rule.version, title: i.rule.title, level: i.level, status: i.rule.status, evidence: i.evidence, freshness: i.freshness, sourceIds: i.rule.sources.map((s) => s.sourceId).filter(Boolean), lastVerifiedAt: i.rule.lastVerifiedAt }))),
      JSON.stringify([...srcMap.values()]),
      JSON.stringify(items.map((i) => ({ ruleId: i.rule.id, title: i.rule.title, category: i.rule.category, severity: i.rule.severity, level: i.level, evidence: i.evidence, freshness: i.freshness, done: i.done, deadline: i.deadline }))),
      JSON.stringify(overlays.map((o) => ({ id: o.restriction.id, title: o.restriction.title, effect: o.restriction.effect, matchedActivities: o.matchedActivities }))),
      readiness.pct, reason]);
  return (await latestEvaluationById(row!.id))!;
}
async function latestEvaluationById(id: string): Promise<EvaluationRow | null> {
  const r = await one(`${EVAL_SELECT} WHERE id=$1`, [id]);
  return r ? mapEval(r) : null;
}

/** Re-evaluates against today's rules, carrying "done" ticks over by rule family, and appends a new snapshot. */
export async function recheckEvent(event: EventRow): Promise<EvaluationRow> {
  const prev = await latestEvaluation(event.id);
  const families = new Set<string>();
  if (prev) {
    const done = await doneRuleIds(event.id);
    for (const r of await getRulesByIds(prev.ruleIds)) if (done.has(r.id)) families.add(r.ruleFamilyId);
  }
  return generateEvaluation(event, "RECHECK", families);
}

export async function currentFingerprint(event: EventRow): Promise<string> {
  const chain = await chainFor(event);
  return fingerprintOf((await applicableFor(chain, event.date, event.answers)).rules);
}

export { getRule };
