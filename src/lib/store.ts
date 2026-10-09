import { one, query } from "./db";
import type { Answers, AssemblyType, Category, Condition, Confidence, Level, Rule, RuleSource, Severity } from "./engine/types";

/* ---------------- Jurisdictions ---------------- */

export interface Jurisdiction {
  id: string;
  parentId: string | null;
  level: "country" | "state" | "city";
  name: string;
  supported: boolean;
  isDevSeed: boolean;
}

const mapJ = (r: any): Jurisdiction => ({ id: r.id, parentId: r.parent_id, level: r.level, name: r.name, supported: r.supported, isDevSeed: r.is_dev_seed });

export async function listJurisdictions(): Promise<Jurisdiction[]> {
  return (await query("SELECT * FROM jurisdictions ORDER BY level, name")).map(mapJ);
}

export async function getJurisdiction(id: string): Promise<Jurisdiction | null> {
  const r = await one("SELECT * FROM jurisdictions WHERE id=$1", [id]);
  return r ? mapJ(r) : null;
}

/** Cities the planner is live for, with "City, State, Country" labels. */
export async function listSupportedCities(): Promise<{ id: string; label: string; city: string; state: string; country: string; isDevSeed: boolean }[]> {
  const rows = await query(
    `SELECT c.id, c.name AS city, s.name AS state, k.name AS country, c.is_dev_seed
       FROM jurisdictions c JOIN jurisdictions s ON s.id=c.parent_id JOIN jurisdictions k ON k.id=s.parent_id
      WHERE c.level='city' AND c.supported ORDER BY k.name, s.name, c.name`,
  );
  return rows.map((r: any) => ({ id: r.id, city: r.city, state: r.state, country: r.country, isDevSeed: r.is_dev_seed, label: `${r.city}, ${r.state}` }));
}

export async function addJurisdiction(input: { parentId: string | null; level: "country" | "state" | "city"; name: string; supported: boolean; isDevSeed?: boolean }) {
  const r = await one("INSERT INTO jurisdictions (parent_id, level, name, supported, is_dev_seed) VALUES ($1,$2,$3,$4,$5) RETURNING id", [
    input.parentId, input.level, input.name.trim(), input.supported, input.isDevSeed ?? false,
  ]);
  return r!.id as string;
}

export async function setJurisdictionSupported(id: string, supported: boolean) {
  await query("UPDATE jurisdictions SET supported=$2 WHERE id=$1", [id, supported]);
}

async function ancestorIds(id: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `WITH RECURSIVE up AS (
       SELECT id, parent_id FROM jurisdictions WHERE id=$1
       UNION ALL SELECT j.id, j.parent_id FROM jurisdictions j JOIN up ON j.id=up.parent_id
     ) SELECT id FROM up`, [id]);
  return rows.map((r) => r.id);
}

/* ---------------- Rules ---------------- */

const EMPTY: Condition = { all: [], any: [] };
const normCond = (c: any): Condition => ({ all: c?.all ?? [], any: c?.any ?? [] });

function mapRule(r: any, sources: RuleSource[]): Rule {
  return {
    id: r.id, jurisdictionId: r.jurisdiction_id, authorityName: r.authority_name ?? null,
    assemblyType: r.assembly_type as AssemblyType, title: r.title, description: r.description,
    category: r.category as Category, requirementType: r.requirement_type, level: r.level as Level,
    elseLevel: (r.else_level as Level) ?? null, severity: r.severity as Severity,
    condition: normCond(r.condition ?? EMPTY), completeWhen: r.complete_when ? normCond(r.complete_when) : null,
    deadlineDaysBefore: r.deadline_days_before, deadlineNote: r.deadline_note, officialLink: r.official_link,
    requiredDocuments: r.required_documents ?? [], vendorCategory: r.vendor_category,
    lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at).toISOString().slice(0, 10) : null,
    needsReview: r.needs_review, confidence: r.confidence as Confidence, ruleOwner: r.rule_owner,
    adminNotes: r.admin_notes, sources, sort: r.sort,
  };
}

const RULE_SELECT = `SELECT r.*, to_char(r.last_verified_at,'YYYY-MM-DD') AS last_verified_at, a.name AS authority_name
  FROM rules r LEFT JOIN authorities a ON a.id=r.authority_id`;

async function attachSources(rows: any[]): Promise<Rule[]> {
  if (rows.length === 0) return [];
  const src = await query(
    `SELECT id, rule_id, url, title, to_char(retrieved_at,'YYYY-MM-DD') AS retrieved_at, notes FROM rule_sources WHERE rule_id = ANY($1)`,
    [rows.map((r) => r.id)],
  );
  return rows.map((r) =>
    mapRule(r, src.filter((s: any) => s.rule_id === r.id).map((s: any) => ({ id: s.id, url: s.url, title: s.title, retrievedAt: s.retrieved_at, notes: s.notes }))),
  );
}

/** Active rules that apply to a city (its own plus those inherited from state and country). */
export async function rulesForJurisdiction(jurisdictionId: string): Promise<Rule[]> {
  const ids = await ancestorIds(jurisdictionId);
  const rows = await query(`${RULE_SELECT} WHERE r.jurisdiction_id = ANY($1) AND r.archived_at IS NULL ORDER BY r.sort`, [ids]);
  return attachSources(rows);
}

export async function listRulesAdmin(jurisdictionId?: string, includeArchived = true): Promise<Rule[]> {
  const rows = await query(
    `${RULE_SELECT} WHERE ($1::uuid IS NULL OR r.jurisdiction_id=$1) AND ($2 OR r.archived_at IS NULL) ORDER BY r.archived_at NULLS FIRST, r.category, r.sort`,
    [jurisdictionId ?? null, includeArchived],
  );
  return attachSources(rows);
}

export async function getRule(id: string): Promise<(Rule & { archived: boolean }) | null> {
  const rows = await query(`${RULE_SELECT} WHERE r.id=$1`, [id]);
  if (!rows[0]) return null;
  const [rule] = await attachSources(rows);
  return { ...rule, archived: !!rows[0].archived_at };
}

export interface RuleInput {
  jurisdictionId: string;
  assemblyType: AssemblyType;
  title: string;
  description: string;
  category: Category;
  requirementType: string;
  level: Level;
  elseLevel: Level | null;
  severity: Severity;
  condition: Condition;
  completeWhen: Condition | null;
  deadlineDaysBefore: number | null;
  deadlineNote: string;
  officialLink: string | null;
  requiredDocuments: string[];
  vendorCategory: string | null;
  lastVerifiedAt: string | null;
  needsReview: boolean;
  confidence: Confidence;
  ruleOwner: string;
  adminNotes: string;
  sort: number;
  sources: { url: string | null; title: string; retrievedAt: string | null; notes: string }[];
}

export async function saveRule(id: string | null, i: RuleInput): Promise<string> {
  const params = [i.jurisdictionId, i.assemblyType, i.title, i.description, i.category, i.requirementType, i.level, i.elseLevel, i.severity,
    JSON.stringify(i.condition), i.completeWhen ? JSON.stringify(i.completeWhen) : null, i.deadlineDaysBefore, i.deadlineNote, i.officialLink,
    i.requiredDocuments, i.vendorCategory, i.lastVerifiedAt, i.needsReview, i.confidence, i.ruleOwner, i.adminNotes, i.sort];
  let ruleId = id;
  if (id) {
    await query(
      `UPDATE rules SET jurisdiction_id=$2, assembly_type=$3, title=$4, description=$5, category=$6, requirement_type=$7, level=$8, else_level=$9,
        severity=$10, condition=$11, complete_when=$12, deadline_days_before=$13, deadline_note=$14, official_link=$15, required_documents=$16,
        vendor_category=$17, last_verified_at=$18, needs_review=$19, confidence=$20, rule_owner=$21, admin_notes=$22, sort=$23, updated_at=now() WHERE id=$1`,
      [id, ...params],
    );
  } else {
    const r = await one(
      `INSERT INTO rules (jurisdiction_id, assembly_type, title, description, category, requirement_type, level, else_level, severity, condition,
        complete_when, deadline_days_before, deadline_note, official_link, required_documents, vendor_category, last_verified_at, needs_review,
        confidence, rule_owner, admin_notes, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
      params,
    );
    ruleId = r!.id as string;
  }
  await query("DELETE FROM rule_sources WHERE rule_id=$1", [ruleId]);
  for (const s of i.sources) {
    await query("INSERT INTO rule_sources (rule_id,url,title,retrieved_at,notes) VALUES ($1,$2,$3,$4,$5)", [ruleId, s.url, s.title, s.retrievedAt, s.notes]);
  }
  return ruleId!;
}

export async function setRuleArchived(id: string, archived: boolean) {
  await query("UPDATE rules SET archived_at = CASE WHEN $2 THEN now() ELSE NULL END, updated_at=now() WHERE id=$1", [id, archived]);
}

/* ---------------- Events ---------------- */

export interface EventRow {
  id: string;
  userId: string | null;
  anonId: string;
  jurisdictionId: string;
  name: string;
  date: string;
  answers: Answers;
  createdAt: string;
}

const mapEvent = (r: any): EventRow => ({
  id: r.id, userId: r.user_id, anonId: r.anon_id, jurisdictionId: r.jurisdiction_id, name: r.name, date: r.date,
  answers: r.answers, createdAt: new Date(r.created_at).toISOString(),
});
const EVENT_SELECT = "SELECT *, to_char(event_date,'YYYY-MM-DD') AS date FROM events";

export async function createEvent(anonId: string, userId: string | null, jurisdictionId: string, a: Answers): Promise<string> {
  const r = await one(
    "INSERT INTO events (user_id, anon_id, jurisdiction_id, name, event_date, answers) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [userId, anonId, jurisdictionId, a.name, a.date, JSON.stringify(a)],
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

export async function recordDocument(eventId: string, kind: string) {
  await query("INSERT INTO documents (event_id, kind) VALUES ($1,$2)", [eventId, kind]);
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

export async function audit(actorUserId: string | null, action: string, entity: string, entityId: string, detail: Record<string, unknown> = {}) {
  await query("INSERT INTO audit_log (actor_user_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5)", [actorUserId, action, entity, entityId, JSON.stringify(detail)]);
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
