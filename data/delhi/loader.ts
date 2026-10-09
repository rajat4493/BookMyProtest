/**
 * Idempotent loader for the Delhi corpus. It only calls the generic knowledge-platform services (the same ones the admin uses):
 * drafts a rule, attaches evidence, and publishes ONLY if every source it cites has a real URL. It never edits a live rule.
 */
import { one, query } from "../../src/lib/db";
import { saveAuthority, saveRuleDraft, saveSource, saveTemplateVersion, linkSource, publishRule, submitForReview, type Actor } from "../../src/lib/knowledge";
import { addJurisdiction, setJurisdictionSupported, audit } from "../../src/lib/store";
import { AUTHORITIES, PLACES, RULES, SOURCES, TEMPLATES, type PlaceKey, type SourceKey, type AuthKey } from "./corpus";

export interface LoadReport {
  places: Record<string, string>;
  rules: Record<string, string>; // family -> ACTIVE | DRAFT (reason) | UNDER_REVIEW | skipped
  published: number;
  drafted: number;
  heldForReview: number;
  districtLive: boolean;
  templates: string[];
  warnings: string[];
}

export async function loadDelhiCorpus(opts: { actor: Actor; standingOrderUrl?: string | null; verifiedOn: string }): Promise<LoadReport> {
  const { actor } = opts;
  const warnings: string[] = [];
  const url = opts.standingOrderUrl && /^https:\/\//i.test(opts.standingOrderUrl) ? opts.standingOrderUrl : null;
  if (!url) warnings.push("DELHI_STANDING_ORDER_URL not set: Standing Order rules are loaded as DRAFT and NOT published. Nothing is guessed.");

  // 1. jurisdictions
  const place: Partial<Record<PlaceKey, string>> = {};
  for (const p of PLACES) {
    const parent = p.parent ? place[p.parent]! : null;
    const found = await one<{ id: string }>("SELECT id FROM jurisdictions WHERE name=$1 AND level=$2 AND parent_id IS NOT DISTINCT FROM $3", [p.name, p.level, parent]);
    place[p.key] = found?.id ?? (await addJurisdiction({ parentId: parent, level: p.level, name: p.name, supported: false, code: p.code }));
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

  // 3. sources (the Standing Order URL is supplied, never guessed)
  const src: Partial<Record<SourceKey, { id: string; hasUrl: boolean }>> = {};
  for (const s of SOURCES) {
    const sourceUrl = s.key === "SO" ? url : s.url;
    const found = await one<{ id: string; canonical_url: string | null }>("SELECT id, canonical_url FROM sources WHERE title=$1", [s.title]);
    let id = found?.id;
    if (!id || (sourceUrl && found?.canonical_url !== sourceUrl)) {
      id = await saveSource(id ?? null, {
        title: s.title, sourceType: s.type, issuingAuthority: s.issuer, jurisdictionId: place[s.place]!, canonicalUrl: sourceUrl, publicationDate: null, effectiveDate: null,
        retrievedAt: opts.verifiedOn, active: true, monitoringEnabled: !!sourceUrl, monitoringFrequency: s.monitoring, notes: s.notes,
      }, actor);
    }
    src[s.key] = { id, hasUrl: !!sourceUrl };
  }

  // 4. rules
  const report: LoadReport = { places: Object.fromEntries(Object.entries(place) as [string, string][]), rules: {}, published: 0, drafted: 0, heldForReview: 0, districtLive: false, templates: [], warnings };
  for (const r of RULES) {
    const existing = await one<{ id: string; rule_status: string }>("SELECT id, rule_status FROM rules WHERE rule_family_id=$1 AND version=1", [r.family]);
    let id = existing?.id;
    if (!id) {
      id = await saveRuleDraft(null, {
        ruleFamilyId: r.family, jurisdictionId: place[r.place]!, authorityId: r.authority ? auth[r.authority]! : null, assemblyType: "any", title: r.title, description: r.plain,
        legalStatement: r.legal, userAction: r.action, category: r.category, requirementType: "permission", level: r.level, elseLevel: null, severity: r.severity, legalCertainty: r.certainty,
        condition: r.condition, completeWhen: null, deadline: r.deadline ?? { kind: "UNKNOWN" }, submissionMethod: "", officialLink: null,
        documents: (r.docs ?? []).map((name) => ({ name, required: true, conditional: false, templateKey: name === "Organizer undertaking" ? "undertaking" : name === "Permission application" ? "request-letter" : null, notes: "" })),
        vendorCategory: r.vendor ?? null, effectiveFrom: null, effectiveUntil: null, lastVerifiedAt: r.holdForReview ? null : opts.verifiedOn, needsReview: !!r.holdForReview,
        confidence: r.confidence, ruleOwner: "Project owner (primary-source corpus review)", adminNotes: r.note ?? "", sort: 1000 + RULES.indexOf(r) * 10, inheritanceMode: "ADD", overridesFamilyId: null,
      }, actor);
      for (const s of r.sources) await linkSource(id, src[s.key]!.id, { strength: s.strength, flagOnChange: s.flagOnChange ?? true, note: "Per project-owner source review; section reference not recorded." }, actor);
    }
    const status = existing?.rule_status ?? "DRAFT";
    if (r.holdForReview) {
      if (status === "DRAFT") await submitForReview(id, actor);
      report.rules[r.family] = "UNDER_REVIEW";
      report.heldForReview++;
      continue;
    }
    if (status === "ACTIVE") { report.rules[r.family] = "ACTIVE (unchanged)"; continue; }
    if (status === "DRAFT" || status === "UNDER_REVIEW") {
      if (r.sources.every((s) => src[s.key]!.hasUrl)) {
        try {
          await publishRule(id, actor, "Loaded from the project owner's primary-source review (Delhi corpus)");
          report.rules[r.family] = "ACTIVE"; report.published++;
        } catch (e) { report.rules[r.family] = `DRAFT (${(e as Error).message})`; report.drafted++; warnings.push(`${r.family}: ${(e as Error).message}`); }
      } else { report.rules[r.family] = "DRAFT (source URL missing)"; report.drafted++; }
    } else report.rules[r.family] = status;
  }

  // 5. go live only when every non-held rule is ACTIVE
  const open = await query("SELECT 1 FROM rules WHERE rule_family_id = ANY($1) AND rule_status <> 'ACTIVE'", [RULES.filter((r) => !r.holdForReview).map((r) => r.family)]);
  report.districtLive = open.length === 0;
  if (report.districtLive) {
    await setJurisdictionSupported(place.DIST!, true);
    await audit(actor.userId, "jurisdiction.supported", "jurisdiction", place.DIST!, { after: { supported: true }, reason: "Delhi corpus fully published" });
  }

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
