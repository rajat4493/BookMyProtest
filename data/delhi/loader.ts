/**
 * Idempotent loader for the Delhi corpus. It only calls the generic knowledge-platform services (the same ones the admin uses).
 *
 * Three separate human decisions, none of them implied by another:
 *  1. Load      — create places, authorities, sources, and rules as DRAFTS (default). Drafts are synced to the corpus on every run.
 *  2. Verify    — `confirmVerified`: a named admin states they have verified the rules against the sources; only then are drafts published.
 *  3. Go live   — `goLive`: make the place selectable in the planner. Never implied by publishing.
 * Live (ACTIVE) rules are never edited here; change them via clone → publish.
 */
import { one, query } from "../../src/lib/db";
import { saveAuthority, saveRuleDraft, saveSource, saveTemplateVersion, linkSource, publishRule, submitForReview, type Actor, type RuleInput } from "../../src/lib/knowledge";
import { addJurisdiction, setJurisdictionSupported, setJurisdictionMetadata, audit } from "../../src/lib/store";
import { AUTHORITIES, PLACES, RULES, SOURCES, STANDING_ORDER_URL, TEMPLATES, type PlaceKey, type RuleSpec, type SourceKey, type AuthKey } from "./corpus";

export interface LoadReport {
  places: Record<string, string>;
  sources: Record<string, string>;
  rules: Record<string, string>; // family -> ACTIVE | DRAFT (reason) | UNDER_REVIEW
  published: number;
  drafted: number;
  heldForReview: number;
  districtLive: boolean;
  templates: string[];
  warnings: string[];
}

export interface LoadOptions {
  actor: Actor;
  /** undefined = the official Standing Order URL in the corpus; null = deliberately none (tests); string = override. */
  standingOrderUrl?: string | null;
  verifiedOn: string;
  /** Explicit statement by the admin that the rules were verified. Without it nothing is published. */
  confirmVerified?: boolean;
  /** Separate from publishing: make the place selectable in the planner. */
  goLive?: boolean;
}

export async function loadDelhiCorpus(opts: LoadOptions): Promise<LoadReport> {
  const { actor } = opts;
  const warnings: string[] = [];
  const soUrl = opts.standingOrderUrl === undefined ? STANDING_ORDER_URL : opts.standingOrderUrl && /^https:\/\//i.test(opts.standingOrderUrl) ? opts.standingOrderUrl : null;
  if (!soUrl) warnings.push("No Standing Order URL: Standing Order rules stay DRAFT. Nothing is guessed.");
  if (!opts.confirmVerified) warnings.push("Admin verification not confirmed (--confirm-verified): rules are loaded/synced as DRAFT and NOT published.");

  // 1. jurisdictions
  const place: Partial<Record<PlaceKey, string>> = {};
  for (const p of PLACES) {
    const parent = p.parent ? place[p.parent]! : null;
    const found = await one<{ id: string }>("SELECT id FROM jurisdictions WHERE name=$1 AND level=$2 AND parent_id IS NOT DISTINCT FROM $3", [p.name, p.level, parent]);
    place[p.key] = found?.id ?? (await addJurisdiction({ parentId: parent, level: p.level, name: p.name, supported: false, code: p.code }));
    if (p.meta) await setJurisdictionMetadata(place[p.key]!, p.meta); // timezone and large-event threshold are data
  }

  // 2. authorities
  const auth: Partial<Record<AuthKey, string>> = {};
  for (const a of AUTHORITIES) {
    const found = await one<{ id: string }>("SELECT id FROM authorities WHERE name=$1 AND jurisdiction_id=$2", [a.name, place[a.place]]);
    auth[a.key] = found?.id ?? (await saveAuthority(null, {
      name: a.name, jurisdictionId: place[a.place]!, authorityType: a.type, website: a.website, contactEmail: "", contactPhone: "", submissionUrl: null, submissionMethod: "UNKNOWN",
      officeAddress: a.address, active: true, notes: a.notes, lastVerifiedAt: null,
    }, actor));
  }

  // 3. sources (order matters: a source is created before the one that supersedes it is referenced)
  const src: Partial<Record<SourceKey, { id: string; current: boolean; hasUrl: boolean }>> = {};
  const srcReport: Record<string, string> = {};
  for (const s of SOURCES) {
    const url = s.key === "SO" ? soUrl : s.url;
    const lifecycle = s.lifecycle ?? "CURRENT";
    const supersededBy = s.supersededBy ? src[s.supersededBy]?.id ?? null : null;
    const found = await one<{ id: string; canonical_url: string | null; lifecycle: string; superseded_by_source_id: string | null; pd: string | null; monitoring_enabled: boolean; source_code: string | null; order_number: string; document_url: string | null; index_url: string | null; title: string; notes: string; parser: string | null; feed_role: string | null }>(
      "SELECT id, title, canonical_url, lifecycle, superseded_by_source_id, to_char(publication_date,'YYYY-MM-DD') AS pd, monitoring_enabled, source_code, order_number, document_url, index_url, notes, parser, feed_role FROM sources WHERE source_code=$1 OR title = ANY($2)",
      [s.code ?? null, [s.title, ...(s.legacyTitles ?? [])]]);
    const wantMonitoring = !!url && !!s.monitoring && lifecycle === "CURRENT";
    const docUrl = s.key === "SO" ? soUrl : s.documentUrl ?? null;
    const stale = !found || found.title !== s.title || found.canonical_url !== url || found.lifecycle !== lifecycle || found.superseded_by_source_id !== supersededBy || found.pd !== (s.publicationDate ?? null)
      || found.monitoring_enabled !== wantMonitoring || found.source_code !== (s.code ?? null) || found.order_number !== (s.orderNumber ?? "") || found.document_url !== docUrl || found.index_url !== (s.indexUrl ?? null)
      || found.notes !== s.notes || found.parser !== (s.parser ?? null) || found.feed_role !== (s.feedRole ?? null);
    let id = found?.id;
    if (stale) {
      id = await saveSource(id ?? null, {
        title: s.title, sourceType: s.type, issuingAuthority: s.issuer, jurisdictionId: place[s.place]!, canonicalUrl: url, publicationDate: s.publicationDate ?? null, effectiveDate: null,
        retrievedAt: opts.verifiedOn, active: true, monitoringEnabled: wantMonitoring, monitoringFrequency: s.monitoring ?? "WEEKLY", notes: s.notes, lifecycle, supersededBySourceId: supersededBy,
        sourceCode: s.code ?? null, orderNumber: s.orderNumber ?? "", documentUrl: docUrl, indexUrl: s.indexUrl ?? null, parser: s.parser ?? null, feedRole: s.feedRole ?? null,
      }, actor);
    }
    src[s.key] = { id: id!, current: lifecycle === "CURRENT", hasUrl: !!url };
    srcReport[s.key] = `${lifecycle}${url ? "" : ", no URL"}${stale ? (found ? " (updated)" : " (created)") : ""}`;
  }

  const inputFor = (r: RuleSpec): RuleInput => ({
    ruleFamilyId: r.family, jurisdictionId: place[r.place]!, authorityId: r.authority ? auth[r.authority]! : null, assemblyType: "any", title: r.title, description: r.plain,
    legalStatement: r.legal, userAction: r.action, category: r.category, requirementType: r.type ?? "permission", level: r.level, elseLevel: null, severity: r.severity, legalCertainty: r.certainty,
    condition: r.condition, completeWhen: null, deadline: r.deadline ?? { kind: "UNKNOWN" }, submissionMethod: "", officialLink: null,
    documents: (r.docs ?? []).map((name) => ({ name, required: true, conditional: false, templateKey: name === "Organizer undertaking" ? "undertaking" : name === "Permission application" ? "request-letter" : null, notes: "" })),
    vendorCategory: r.vendor ?? null, effectiveFrom: null, effectiveUntil: null, lastVerifiedAt: r.holdForReview ? null : opts.verifiedOn, needsReview: !!r.holdForReview,
    confidence: r.confidence, ruleOwner: "Project owner (primary-source corpus review)", adminNotes: r.note ?? "", sort: 1000 + RULES.indexOf(r) * 10, inheritanceMode: "ADD", overridesFamilyId: null,
  });

  // 4. rules
  const report: LoadReport = { places: Object.fromEntries(Object.entries(place) as [string, string][]), sources: srcReport, rules: {}, published: 0, drafted: 0, heldForReview: 0, districtLive: false, templates: [], warnings };
  for (const r of RULES) {
    const existing = await one<{ id: string; rule_status: string }>("SELECT id, rule_status FROM rules WHERE rule_family_id=$1 AND version=1", [r.family]);
    let id = existing?.id;
    const status = existing?.rule_status ?? "NEW";
    if (status === "ACTIVE") { report.rules[r.family] = "ACTIVE (unchanged)"; continue; } // live rules are never touched here
    if (!id) id = await saveRuleDraft(null, inputFor(r), actor);
    else if (status === "DRAFT" || status === "UNDER_REVIEW") await saveRuleDraft(id, inputFor(r), actor); // keep drafts in sync with the corpus
    else { report.rules[r.family] = status; continue; }
    let evidencePending = false;
    for (const s of r.sources) {
      try {
        await linkSource(id, src[s.key]!.id, { strength: s.strength, flagOnChange: s.flagOnChange ?? true, note: s.note ?? "Per project-owner source review; section reference not recorded.", sectionRef: s.section ?? "", relevance: s.relevance ?? "" }, actor);
      } catch (e) {
        // e.g. the Standing Order has no document URL yet, so it is index-only and cannot be primary evidence: stay DRAFT, retry next run.
        if (/index-only/.test((e as Error).message)) { evidencePending = true; continue; }
        throw e;
      }
    }


    if (r.holdForReview) {
      if (status === "NEW" || status === "DRAFT") await submitForReview(id, actor);
      report.rules[r.family] = "UNDER_REVIEW";
      report.heldForReview++;
      continue;
    }
    const sourcesReady = r.sources.some((s) => s.strength !== "LEAD" && src[s.key]!.hasUrl && src[s.key]!.current) && r.sources.filter((s) => s.strength === "PRIMARY").every((s) => src[s.key]!.hasUrl);
    if (evidencePending) { report.rules[r.family] = "DRAFT (document URL missing: evidence not yet attachable)"; report.drafted++; continue; }
    if (!sourcesReady) { report.rules[r.family] = "DRAFT (source URL missing)"; report.drafted++; continue; }
    if (!opts.confirmVerified) { report.rules[r.family] = "DRAFT (awaiting explicit admin verification)"; report.drafted++; continue; }
    try {
      await publishRule(id, actor, "Verified by the admin against the cited sources (Delhi corpus load)");
      report.rules[r.family] = "ACTIVE"; report.published++;
    } catch (e) { report.rules[r.family] = `DRAFT (${(e as Error).message})`; report.drafted++; warnings.push(`${r.family}: ${(e as Error).message}`); }
  }

  // 5. going live is its own decision, and only possible when every non-held rule is ACTIVE
  const open = await query("SELECT 1 FROM rules WHERE rule_family_id = ANY($1) AND rule_status <> 'ACTIVE'", [RULES.filter((r) => !r.holdForReview).map((r) => r.family)]);
  if (opts.goLive) {
    if (open.length === 0) {
      await setJurisdictionSupported(place.DIST!, true);
      await audit(actor.userId, "jurisdiction.supported", "jurisdiction", place.DIST!, { after: { supported: true }, reason: "Delhi corpus fully published; go-live requested explicitly" });
      report.districtLive = true;
    } else warnings.push("Go-live refused: not every Delhi rule is ACTIVE.");
  } else if (open.length === 0) warnings.push("All Delhi rules are ACTIVE but New Delhi District is NOT enabled in the planner (go-live is a separate step: --go-live).");

  // 6. venue-level templates (Jantar Mantar), one version each, only if none exist
  for (const t of TEMPLATES) {
    const has = await one("SELECT 1 FROM document_templates WHERE template_key=$1 AND jurisdiction_id=$2", [t.key, place.JM]);
    if (!has) {
      const v = await saveTemplateVersion({ templateKey: t.key, name: t.name, jurisdictionId: place.JM!, authorityId: auth.DCP_ND!, content: t.content, disclaimer: t.disclaimer, effectiveFrom: null, effectiveUntil: null, sourceId: src.SO!.id }, actor);
      report.templates.push(`${t.key} v${v.version}`);
    }
  }
  return report;
}
