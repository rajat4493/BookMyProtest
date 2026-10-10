import { one, query } from "./db";
import type { Answers, AssemblyType, Category, Condition, Confidence, DeadlineDef, Level, Rule, RuleSource, RuleStatus, Severity } from "./engine/types";

/* ---------------- Jurisdictions ---------------- */

export const JURISDICTION_LEVELS = ["country", "state", "region", "district", "city", "zone", "venue"] as const;
export type JurisdictionLevel = (typeof JURISDICTION_LEVELS)[number];

export interface Jurisdiction {
  id: string;
  parentId: string | null;
  level: JurisdictionLevel;
  name: string;
  supported: boolean;
  isDevSeed: boolean;
  code: string | null;
  archived: boolean;
}

const mapJ = (r: any): Jurisdiction => ({ id: r.id, parentId: r.parent_id, level: r.level, name: r.name, supported: r.supported, isDevSeed: r.is_dev_seed, code: r.code ?? null, archived: !!r.archived_at });

export async function listJurisdictions(includeArchived = false): Promise<Jurisdiction[]> {
  return (await query(`SELECT * FROM jurisdictions WHERE ($1 OR archived_at IS NULL) ORDER BY level, name`, [includeArchived])).map(mapJ);
}

export async function getJurisdiction(id: string): Promise<Jurisdiction | null> {
  const r = await one("SELECT * FROM jurisdictions WHERE id=$1", [id]);
  return r ? mapJ(r) : null;
}

/** Places the planner is live for (any non-venue jurisdiction flagged supported), labelled "Name, Parent". */
export async function listSupportedCities(): Promise<{ id: string; label: string; isDevSeed: boolean }[]> {
  const rows = await query(
    `SELECT j.id, j.name, p.name AS parent, j.is_dev_seed FROM jurisdictions j LEFT JOIN jurisdictions p ON p.id=j.parent_id
      WHERE j.supported AND j.archived_at IS NULL AND j.level <> 'venue' ORDER BY p.name NULLS LAST, j.name`,
  );
  return rows.map((r: any) => ({ id: r.id, isDevSeed: r.is_dev_seed, label: r.parent ? `${r.name}, ${r.parent}` : r.name }));
}

/** Venues (direct children at level 'venue') per place, for the optional venue question. */
export async function listVenuesByPlace(): Promise<Record<string, { id: string; label: string }[]>> {
  const rows = await query(`SELECT id, name, parent_id FROM jurisdictions WHERE level='venue' AND archived_at IS NULL ORDER BY name`);
  const out: Record<string, { id: string; label: string }[]> = {};
  for (const r of rows as any[]) (out[r.parent_id] ??= []).push({ id: r.id, label: r.name });
  return out;
}

export async function addJurisdiction(input: { parentId: string | null; level: JurisdictionLevel; name: string; supported: boolean; isDevSeed?: boolean; code?: string }) {
  const r = await one("INSERT INTO jurisdictions (parent_id, level, name, supported, is_dev_seed, code) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [
    input.parentId, input.level, input.name.trim(), input.supported, input.isDevSeed ?? false, input.code ?? null,
  ]);
  return r!.id as string;
}

export async function setJurisdictionSupported(id: string, supported: boolean) {
  await query("UPDATE jurisdictions SET supported=$2 WHERE id=$1", [id, supported]);
}

export async function archiveJurisdiction(id: string, archived: boolean) {
  await query("UPDATE jurisdictions SET archived_at = CASE WHEN $2 THEN now() ELSE NULL END, supported = supported AND NOT $2 WHERE id=$1", [id, archived]);
}

/** Ordered general -> specific: [country, region, ..., this]. Works for any depth; nothing assumes states or districts exist. */
export async function jurisdictionChain(id: string): Promise<string[]> {
  const rows = await query<{ id: string; depth: number }>(
    `WITH RECURSIVE up AS (
       SELECT id, parent_id, 0 AS depth FROM jurisdictions WHERE id=$1
       UNION ALL SELECT j.id, j.parent_id, up.depth+1 FROM jurisdictions j JOIN up ON j.id=up.parent_id
     ) SELECT id, depth FROM up ORDER BY depth DESC`, [id]);
  return rows.map((r) => r.id);
}

/* ---------------- Rules ---------------- */

const EMPTY: Condition = { all: [], any: [] };
const normCond = (c: any): Condition => ({ all: c?.all ?? [], any: c?.any ?? [] });
const normDeadline = (d: any): DeadlineDef => ({ kind: d?.kind ?? "UNKNOWN", ...(d ?? {}) });

function mapRule(r: any, sources: RuleSource[], docs: string[]): Rule {
  const deadline = normDeadline(r.deadline_definition);
  return {
    id: r.id, ruleFamilyId: r.rule_family_id, version: r.version, status: r.rule_status as RuleStatus, legalCertainty: r.legal_certainty,
    effectiveFrom: r.effective_from ?? null, effectiveUntil: r.effective_until ?? null, supersedesRuleId: r.supersedes_rule_id,
    inheritanceMode: r.inheritance_mode, overridesFamilyId: r.overrides_family_id,
    legalStatement: r.legal_statement, userAction: r.user_action, submissionMethod: r.submission_method, deadline,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
    jurisdictionId: r.jurisdiction_id, authorityName: r.authority_name ?? null,
    assemblyType: r.assembly_type as AssemblyType, title: r.title, description: r.description,
    category: r.category as Category, requirementType: r.requirement_type, level: r.level as Level,
    elseLevel: (r.else_level as Level) ?? null, severity: r.severity as Severity,
    condition: normCond(r.condition ?? EMPTY), completeWhen: r.complete_when ? normCond(r.complete_when) : null,
    deadlineDaysBefore: deadline.kind === "STRUCTURED" ? deadline.minimumDaysBeforeEvent ?? null : null, deadlineNote: deadline.specialNotes ?? "",
    officialLink: r.official_link, requiredDocuments: docs, vendorCategory: r.vendor_category,
    lastVerifiedAt: r.last_verified_at ?? null,
    needsReview: r.needs_review, confidence: r.confidence as Confidence, ruleOwner: r.rule_owner,
    adminNotes: r.admin_notes, sources, sort: r.sort,
  };
}

const RULE_SELECT = `SELECT r.*, to_char(r.last_verified_at,'YYYY-MM-DD') AS last_verified_at, to_char(r.effective_from,'YYYY-MM-DD') AS effective_from,
  to_char(r.effective_until,'YYYY-MM-DD') AS effective_until, a.name AS authority_name
  FROM rules r LEFT JOIN authorities a ON a.id=r.authority_id`;

async function attachRelations(rows: any[]): Promise<Rule[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const src = await query(
    `SELECT rs.rule_id, rs.flag_on_change, rs.evidence_strength, rs.interpretation_note, rs.excerpt, rs.section_ref, s.id AS source_id, s.title, s.source_type, s.canonical_url, (s.document_url IS NULL AND s.index_url IS NOT NULL) AS index_only,
            to_char(s.retrieved_at,'YYYY-MM-DD') AS retrieved_at
       FROM rule_sources rs JOIN sources s ON s.id=rs.source_id WHERE rs.rule_id = ANY($1) AND s.active AND s.lifecycle = 'CURRENT' ORDER BY s.title`, [ids]);
  const docs = await query("SELECT rule_id, name FROM rule_documents WHERE rule_id = ANY($1) AND required ORDER BY name", [ids]);
  return rows.map((r) =>
    mapRule(
      r,
      src.filter((s: any) => s.rule_id === r.id).map((s: any): RuleSource => ({
        sourceId: s.source_id, sourceType: s.source_type, strength: s.evidence_strength, url: s.canonical_url, title: s.title,
        retrievedAt: s.retrieved_at, notes: s.interpretation_note, excerpt: s.excerpt, sectionRef: s.section_ref, flagOnChange: s.flag_on_change, indexOnly: s.index_only,
      })),
      docs.filter((d: any) => d.rule_id === r.id).map((d: any) => d.name),
    ),
  );
}

/** Every rule row attached to jurisdictions in the chain, in any lifecycle status. Selection by status/date is the engine's job (selectRules). */
export async function rulesForChain(chain: string[]): Promise<Rule[]> {
  if (chain.length === 0) return [];
  return attachRelations(await query(`${RULE_SELECT} WHERE r.jurisdiction_id = ANY($1) ORDER BY r.sort`, [chain]));
}

export async function getRulesByIds(ids: string[]): Promise<Rule[]> {
  if (ids.length === 0) return [];
  return attachRelations(await query(`${RULE_SELECT} WHERE r.id = ANY($1) ORDER BY r.sort`, [ids]));
}

export async function listRulesAdmin(opts: { jurisdictionId?: string; status?: string } = {}): Promise<Rule[]> {
  return attachRelations(await query(
    `${RULE_SELECT} WHERE ($1::uuid IS NULL OR r.jurisdiction_id=$1) AND ($2::text IS NULL OR r.rule_status=$2)
      ORDER BY r.rule_family_id, r.version DESC`, [opts.jurisdictionId ?? null, opts.status ?? null]));
}

export async function getRule(id: string): Promise<Rule | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [rule] = await attachRelations(await query(`${RULE_SELECT} WHERE r.id=$1`, [id]));
  return rule ?? null;
}

export async function ruleVersions(familyId: string): Promise<{ id: string; version: number; status: RuleStatus; effectiveFrom: string | null; effectiveUntil: string | null }[]> {
  return (await query(
    `SELECT id, version, rule_status, to_char(effective_from,'YYYY-MM-DD') AS ef, to_char(effective_until,'YYYY-MM-DD') AS eu FROM rules WHERE rule_family_id=$1 ORDER BY version DESC`, [familyId]))
    .map((r: any) => ({ id: r.id, version: r.version, status: r.rule_status, effectiveFrom: r.ef, effectiveUntil: r.eu }));
}

/* ---------------- Events ---------------- */

export interface EventRow {
  id: string;
  userId: string | null;
  anonId: string;
  jurisdictionId: string;
  venueJurisdictionId: string | null;
  name: string;
  date: string;
  answers: Answers;
  createdAt: string;
}

const mapEvent = (r: any): EventRow => ({
  id: r.id, userId: r.user_id, anonId: r.anon_id, jurisdictionId: r.jurisdiction_id, venueJurisdictionId: r.venue_jurisdiction_id ?? null, name: r.name, date: r.date,
  answers: r.answers, createdAt: new Date(r.created_at).toISOString(),
});
const EVENT_SELECT = "SELECT *, to_char(event_date,'YYYY-MM-DD') AS date FROM events";

export async function createEvent(anonId: string, userId: string | null, jurisdictionId: string, a: Answers, venueJurisdictionId: string | null = null): Promise<string> {
  const r = await one(
    "INSERT INTO events (user_id, anon_id, jurisdiction_id, venue_jurisdiction_id, name, event_date, answers) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [userId, anonId, jurisdictionId, venueJurisdictionId, a.name, a.date, JSON.stringify(a)],
  );
  return r!.id as string;
}

export async function getEvent(id: string): Promise<EventRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await one(`${EVENT_SELECT} WHERE id=$1`, [id]);
  return r ? mapEvent(r) : null;
}

export async function updateEventAnswers(id: string, a: Answers) {
  await query("UPDATE events SET answers=$2, name=$3, event_date=$4, updated_at=now() WHERE id=$1", [id, JSON.stringify(a), a.name, a.date]);
}

export async function eventsFor(anonId: string | null, userId: string | null): Promise<EventRow[]> {
  const rows = await query(`${EVENT_SELECT} WHERE ($1::uuid IS NOT NULL AND user_id=$1) OR ($2::text IS NOT NULL AND anon_id=$2 AND user_id IS NULL) ORDER BY created_at DESC`, [userId, anonId]);
  return rows.map(mapEvent);
}

/** Attach anonymous plans to a newly signed-up/in account. */
export async function claimAnonEvents(anonId: string, userId: string) {
  await query("UPDATE events SET user_id=$2 WHERE anon_id=$1 AND user_id IS NULL", [anonId, userId]);
}

export async function doneRuleIds(eventId: string): Promise<Set<string>> {
  const rows = await query<{ rule_id: string }>("SELECT rule_id FROM event_requirements WHERE event_id=$1 AND done", [eventId]);
  return new Set(rows.map((r) => r.rule_id));
}

export async function setRequirementDone(eventId: string, ruleId: string, done: boolean) {
  await query(
    `INSERT INTO event_requirements (event_id, rule_id, done) VALUES ($1,$2,$3)
     ON CONFLICT (event_id, rule_id) DO UPDATE SET done=$3, updated_at=now()`,
    [eventId, ruleId, done],
  );
}

/* ---------------- Documents ---------------- */

export async function recordDocument(eventId: string, kind: string, templateId: string | null = null, templateVersion: number | null = null) {
  await query("INSERT INTO documents (event_id, kind, template_id, template_version) VALUES ($1,$2,$3,$4)", [eventId, kind, templateId, templateVersion]);
}

/* ---------------- Vendors ---------------- */

export interface VendorCategory { slug: string; label: string }
export async function listVendorCategories(): Promise<VendorCategory[]> {
  return query<VendorCategory>("SELECT slug, label FROM vendor_categories ORDER BY sort");
}

export interface VendorRequestInput {
  eventId: string; category: string; quantity: string; notes: string;
  contactName: string; contactEmail: string; contactPhone: string;
}
export async function createVendorRequest(i: VendorRequestInput): Promise<string> {
  const r = await one(
    "INSERT INTO vendor_requests (event_id, category, quantity, notes, contact_name, contact_email, contact_phone) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [i.eventId, i.category, i.quantity, i.notes, i.contactName, i.contactEmail, i.contactPhone],
  );
  return r!.id as string;
}

export interface VendorRequestRow {
  id: string; eventId: string; eventName: string; eventDate: string; city: string; attendance: number; category: string; categoryLabel: string;
  quantity: string; notes: string; contactName: string; contactEmail: string; contactPhone: string; status: string; adminNotes: string; createdAt: string;
}
const VR_SELECT = `SELECT v.*, e.name AS event_name, to_char(e.event_date,'YYYY-MM-DD') AS event_date, (e.answers->>'attendance')::int AS attendance,
  j.name AS city, c.label AS category_label FROM vendor_requests v JOIN events e ON e.id=v.event_id JOIN jurisdictions j ON j.id=e.jurisdiction_id
  JOIN vendor_categories c ON c.slug=v.category`;
const mapVR = (r: any): VendorRequestRow => ({
  id: r.id, eventId: r.event_id, eventName: r.event_name, eventDate: r.event_date, city: r.city, attendance: r.attendance, category: r.category,
  categoryLabel: r.category_label, quantity: r.quantity, notes: r.notes, contactName: r.contact_name, contactEmail: r.contact_email,
  contactPhone: r.contact_phone, status: r.status, adminNotes: r.admin_notes, createdAt: new Date(r.created_at).toISOString(),
});
export async function listVendorRequests(eventId?: string): Promise<VendorRequestRow[]> {
  return (await query(`${VR_SELECT} WHERE ($1::uuid IS NULL OR v.event_id=$1) ORDER BY v.created_at DESC`, [eventId ?? null])).map(mapVR);
}
export async function updateVendorRequest(id: string, status: string, adminNotes: string) {
  await query("UPDATE vendor_requests SET status=$2, admin_notes=$3 WHERE id=$1", [id, status, adminNotes]);
}

/* ---------------- Waitlist, audit, analytics ---------------- */

export async function addWaitlist(email: string, country: string, state: string, city: string) {
  await query("INSERT INTO waitlist (email,country,state,city) VALUES ($1,$2,$3,$4)", [email, country, state, city]);
}

/** Audit entry. `detail.before` / `detail.after` / `detail.reason` are promoted to their own columns. */
export async function audit(actorUserId: string | null, action: string, entity: string, entityId: string, detail: Record<string, unknown> & { before?: unknown; after?: unknown; reason?: string } = {}) {
  const { before, after, reason, ...rest } = detail;
  await query("INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail, before, after, reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    actorUserId, action, entity, entityId, JSON.stringify(rest), before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after), reason ?? "",
  ]);
}

export async function listAudit(limit = 200) {
  return query(`SELECT a.*, u.email AS actor_email FROM audit_log a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT $1`, [limit]);
}

export const ANALYTICS_EVENTS = [
  "landing_page_view", "start_plan", "complete_questionnaire", "view_requirements", "save_plan",
  "generate_document", "request_vendor_quote", "return_visit", "city_waitlist_signup",
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export async function track(name: AnalyticsEvent, anonId: string | null, props: Record<string, unknown> = {}) {
  try {
    await query("INSERT INTO analytics_events (name, anon_id, props) VALUES ($1,$2,$3)", [name, anonId, JSON.stringify(props)]);
  } catch (e) {
    console.error("analytics failed", e); // never break a user flow for analytics
  }
}

export async function funnel(): Promise<{ name: string; people: number; total: number }[]> {
  return (await query(`SELECT name, count(DISTINCT anon_id)::int AS people, count(*)::int AS total FROM analytics_events GROUP BY name`)) as any;
}

export async function adminEvents() {
  return query(
    `SELECT e.id, e.name, to_char(e.event_date,'YYYY-MM-DD') AS date, j.name AS city, (e.answers->>'attendance')::int AS attendance, e.user_id IS NOT NULL AS saved,
       e.created_at, (SELECT count(*)::int FROM vendor_requests v WHERE v.event_id=e.id) AS vendor_requests,
       (SELECT count(*)::int FROM documents d WHERE d.event_id=e.id) AS documents
     FROM events e JOIN jurisdictions j ON j.id=e.jurisdiction_id ORDER BY e.created_at DESC LIMIT 200`,
  );
}

export async function adminWaitlist() {
  return query("SELECT city, state, country, count(*)::int AS signups FROM waitlist GROUP BY 1,2,3 ORDER BY signups DESC");
}
