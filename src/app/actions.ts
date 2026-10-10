"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { endSession, ensureAnonId, getUser, requireAdmin, startSession } from "@/lib/auth";
import { loadOwnedEvent } from "@/lib/access";
import { acknowledgeChanges, markApplicationSubmitted, markApprovalRecorded, updateEventDetails } from "@/lib/event-changes";
import { recordPermission } from "@/lib/permissions";
import { runChecks } from "@/lib/readiness-service";
import { recordOfficialCheck, saveVenueSignal, setSchedulingMode, venueAvailability } from "@/lib/venue-signals";
import { SCHEDULING_MODES, SIGNAL_TYPES, EVENT_STATUSES, type Availability } from "@/lib/engine/availability";
import { one } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { allow } from "@/lib/ratelimit";
import { DOC_KINDS } from "@/lib/documents";
import { parseAnswers, vendorRequestSchema, waitlistSchema } from "@/lib/validation";
import {
  addJurisdiction, addWaitlist, archiveJurisdiction, audit, createEvent, createVendorRequest, eventsFor, getEvent, getJurisdiction, setJurisdictionSupported,
  jurisdictionChain, metaForChain, recordDocument, setRequirementDone, track, updateVendorRequest, listVendorCategories, type JurisdictionLevel, JURISDICTION_LEVELS,
} from "@/lib/store";
import {
  archiveRule, checkSource, chainFor, cloneAsNewVersion, dismissChange, generateEvaluation, linkSource, publishRule, recheckEvent, recordSourceContent, saveAuthority,
  acceptCandidate, listRestrictions, parseOrderText, rejectCandidate, saveRestriction, saveRuleDraft, saveSource, saveTemplateVersion, selectTemplateMap, startReplacement, submitForReview, unlinkSource, type RuleInput,
} from "@/lib/knowledge";
import {
  ASSEMBLY_TYPES, CATEGORIES, CONDITION_FIELDS, CONFIDENCES, EVIDENCE_STRENGTHS, INHERITANCE_MODES, LEGAL_CERTAINTIES, LEVELS, OPS, SEVERITIES, SOURCE_TYPES, type Clause, type Condition, type DeadlineDef,
} from "@/lib/engine/types";

export type ActionResult = { ok: false; errors: Record<string, string> } | { ok: true };

const safeNext = (n: unknown) => (typeof n === "string" && /^\/(?!\/)[\w\-/?=&.%]*$/.test(n) ? n : "/account");

/* ---------- Planning ---------- */

/** Date-conflict check for a venue and date (public: composes what is known, reveals no names or contacts). */
export async function checkVenueDateAction(venueId: string, date: string, startTime: string, endTime: string, attendance?: number | null): Promise<{ ok: true; availability: Availability } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || !/^[0-9a-f-]{36}$/i.test(venueId)) return { ok: false, error: "Choose a venue and date first." };
  if (!allow(`dcc:${await clientKey()}`, 60, 10 * 60_000)) return { ok: false, error: "Too many checks. Try again shortly." };
  const a = await venueAvailability(venueId, date, startTime, endTime > startTime ? endTime : "23:59", { attendance: attendance && attendance > 0 ? attendance : null });
  return a ? { ok: true, availability: a } : { ok: false, error: "Choose a venue." };
}

export async function markApprovalAction(formData: FormData) {
  const event = await loadOwnedEvent(String(formData.get("eventId")));
  await markApprovalRecorded(event.id, formData.get("approved") !== "false");
  revalidatePath(`/plan/${event.id}`);
}

/** Larger events (above the place's own threshold, held as data) must state their purpose. */
async function largeEventErrors(cityId: string, a: { attendance: number; description: string }): Promise<Record<string, string> | null> {
  const meta = await metaForChain(await jurisdictionChain(cityId));
  if (typeof meta.largeEventAbove === "number" && a.attendance > meta.largeEventAbove && a.description.trim().length < 10) return { description: "Say in a sentence or two what the event is for" };
  return null;
}

export async function createPlanAction(cityId: string, raw: unknown, venueId: string | null = null): Promise<ActionResult> {
  const city = await getJurisdiction(cityId);
  if (!city || city.level === "venue" || !city.supported) return { ok: false, errors: { city: "We're not live here yet. Join the waitlist." } };
  let venue: string | null = null;
  if (venueId) {
    const v = await getJurisdiction(venueId);
    if (!v || v.level !== "venue" || !(await jurisdictionChain(v.id)).includes(city.id)) return { ok: false, errors: { city: "Choose a venue in this place" } };
    venue = v.id;
  }
  const parsed = parseAnswers(raw);
  if (!parsed.ok) return parsed;
  const large = await largeEventErrors(city.id, parsed.answers);
  if (large) return { ok: false, errors: large };
  const anon = await ensureAnonId();
  const user = await getUser();
  const id = await createEvent(anon, user?.id ?? null, city.id, parsed.answers, venue);
  const created = (await getEvent(id))!;
  await generateEvaluation(created, "GENERATED"); // immutable record of the rule versions this plan was built on
  await runChecks(created, "PLAN_GENERATED");
  await track("complete_questionnaire", anon, { eventId: id, city: city.name, attendance: parsed.answers.attendance, kind: parsed.answers.kind });
  redirect(`/plan/${id}`);
}

export async function toggleRequirementAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const ruleId = String(formData.get("ruleId"));
  const done = formData.get("done") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(ruleId)) return;
  await loadOwnedEvent(eventId);
  await setRequirementDone(eventId, ruleId, done);
  revalidatePath(`/plan/${eventId}`);
}

export async function recheckPlanAction(formData: FormData) {
  const event = await loadOwnedEvent(String(formData.get("eventId")));
  await recheckEvent(event);
  await runChecks(event, "RECHECK");
  revalidatePath(`/plan/${event.id}`);
  redirect(`/plan/${event.id}?rechecked=1`);
}

export async function generatePackAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  const event = await loadOwnedEvent(eventId);
  const templates = await selectTemplateMap(await chainFor(event), event.date);
  for (const d of DOC_KINDS) await recordDocument(eventId, d.slug, templates[d.slug]?.id.startsWith("builtin:") ? null : templates[d.slug]?.id ?? null, templates[d.slug]?.version ?? null);
  await runChecks(event, "DOCUMENT_GENERATION");
  await track("generate_document", await ensureAnonId(), { eventId, kinds: DOC_KINDS.length });
  redirect(`/plan/${eventId}/pack?ready=1`);
}

export async function recordPermissionAction(eventId: string, raw: { status?: string; occurredAt?: string | null; method?: string | null; reference?: string; evidenceRef?: string; approvalDate?: string | null; conditions?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const event = await loadOwnedEvent(eventId);
  try {
    await recordPermission(event, { status: raw.status as any, occurredAt: raw.occurredAt ?? null, method: (raw.method || null) as any, reference: raw.reference, evidenceRef: raw.evidenceRef, approvalDate: raw.approvalDate || null, conditions: raw.conditions });
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Could not record that." }; }
  await runChecks((await getEvent(event.id))!, "RECHECK");
  revalidatePath(`/plan/${event.id}`);
  return { ok: true };
}

export async function markApplicationAction(formData: FormData) {
  const event = await loadOwnedEvent(String(formData.get("eventId")));
  await markApplicationSubmitted(event.id, formData.get("submitted") !== "false");
  revalidatePath(`/plan/${event.id}`);
}

export async function acknowledgeChangesAction(formData: FormData) {
  const event = await loadOwnedEvent(String(formData.get("eventId")));
  await acknowledgeChanges(event.id);
  revalidatePath(`/plan/${event.id}`);
}

export async function updatePlanDetailsAction(eventId: string, raw: unknown): Promise<ActionResult> {
  const event = await loadOwnedEvent(eventId);
  const parsed = parseAnswers(raw);
  if (!parsed.ok) return parsed;
  const large = await largeEventErrors(event.jurisdictionId, parsed.answers);
  if (large) return { ok: false, errors: large };
  await updateEventDetails(event, parsed.answers);
  revalidatePath(`/plan/${event.id}`);
  redirect(`/plan/${event.id}?updated=1`);
}

/* ---------- Vendors ---------- */

export async function requestQuoteAction(eventId: string, raw: unknown): Promise<ActionResult> {
  const e = await loadOwnedEvent(eventId);
  const p = vendorRequestSchema.safeParse(raw);
  if (!p.success) return { ok: false, errors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  if (!(await listVendorCategories()).some((c) => c.slug === p.data.category)) return { ok: false, errors: { category: "Choose a category" } };
  const anon = await ensureAnonId();
  if (!allow(`vendor:${anon}`, 20, 60 * 60_000)) return { ok: false, errors: { form: "Too many requests. Try again later." } };
  const id = await createVendorRequest({ eventId: e.id, ...p.data });
  await track("request_vendor_quote", anon, { eventId: e.id, category: p.data.category, requestId: id });
  redirect(`/plan/${e.id}/vendors?sent=${encodeURIComponent(p.data.category)}`);
}

/* ---------- Waitlist ---------- */

export async function joinWaitlistAction(raw: unknown): Promise<ActionResult> {
  const p = waitlistSchema.safeParse(raw);
  if (!p.success) return { ok: false, errors: Object.fromEntries(p.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const anon = await ensureAnonId();
  if (!allow(`waitlist:${anon}`, 5, 60 * 60_000)) return { ok: false, errors: { form: "Too many attempts. Try again later." } };
  await addWaitlist(p.data.email.toLowerCase(), p.data.country, p.data.state, p.data.city);
  await track("city_waitlist_signup", anon, { city: p.data.city, state: p.data.state, country: p.data.country });
  return { ok: true };
}

/* ---------- Auth ---------- */

const credSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email").max(200), password: z.string().min(8, "Use at least 8 characters").max(200) });

async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function signupAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const p = credSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!p.success) return { error: p.error.issues[0].message };
  if (!allow(`signup:${await clientKey()}`, 10, 60 * 60_000)) return { error: "Too many attempts. Try again later." };
  if (await one("SELECT 1 FROM users WHERE email=$1", [p.data.email])) return { error: "That email already has an account. Sign in instead." };
  const u = await one<{ id: string }>("INSERT INTO users (email,password_hash) VALUES ($1,$2) RETURNING id", [p.data.email, await hashPassword(p.data.password)]);
  await startSession(u!.id);
  const anon = await ensureAnonId();
  const plans = await eventsFor(anon, u!.id);
  await track("save_plan", anon, { plans: plans.length });
  redirect(safeNext(fd.get("next")));
}

export async function loginAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const p = credSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!p.success) return { error: "Check your email and password." };
  if (!allow(`login:${p.data.email}`, 8, 10 * 60_000) || !allow(`loginip:${await clientKey()}`, 30, 10 * 60_000)) return { error: "Too many attempts. Try again in a few minutes." };
  const u = await one<{ id: string; password_hash: string }>("SELECT id, password_hash FROM users WHERE email=$1", [p.data.email]);
  if (!u || !(await verifyPassword(p.data.password, u.password_hash))) return { error: "Email or password is incorrect." };
  await startSession(u.id);
  redirect(safeNext(fd.get("next")));
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

/* ---------- Admin ---------- */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const oneOf = <T extends string>(v: string, list: readonly T[], fallback: T): T => ((list as readonly string[]).includes(v) ? (v as T) : fallback);
const nullable = (s: string) => (s === "" ? null : s);
const dateOrNull = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const httpOrNull = (s: string) => (/^https?:\/\//i.test(s) ? s : null);
const uuidOrNull = (s: string) => (/^[0-9a-f-]{36}$/i.test(s) ? s : null);

/** Runs an admin operation; domain errors (e.g. "needs an official source") come back to the page as a message instead of a crash. */
async function guarded(back: string, fn: (actor: { userId: string }) => Promise<string | void>) {
  const admin = await requireAdmin();
  let target: string;
  try {
    target = (await fn({ userId: admin.id })) ?? back;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong";
    target = `${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg.slice(0, 300))}`;
  }
  redirect(target);
}

const BOOL_FIELDS = new Set(["march", "sound", "vehicles", "stage", "food"]);
const NUM_FIELDS = new Set(["attendance", "buses"]);

function parseClauses(fd: FormData, prefix: string): Clause[] {
  const out: Clause[] = [];
  for (let i = 0; i < 5; i++) {
    const field = str(fd, `${prefix}_field_${i}`);
    if (!field || !(CONDITION_FIELDS as readonly string[]).includes(field)) continue;
    const op = oneOf(str(fd, `${prefix}_op_${i}`), OPS, "eq");
    const raw = str(fd, `${prefix}_value_${i}`);
    let value: Clause["value"];
    if (op === "present") value = undefined;
    else if (op === "in") value = raw.split(",").map((s) => s.trim()).filter(Boolean);
    else if (BOOL_FIELDS.has(field)) value = raw !== "false";
    else if (NUM_FIELDS.has(field) || ["gt", "gte", "lt", "lte"].includes(op)) value = Number(raw);
    else value = raw;
    out.push({ field: field as Clause["field"], op, ...(value !== undefined ? { value } : {}) });
  }
  return out;
}
const parseCondition = (fd: FormData, p: string): Condition => ({ all: parseClauses(fd, `${p}_all`), any: parseClauses(fd, `${p}_any`) });

function parseDeadline(fd: FormData): DeadlineDef {
  const kind = oneOf(str(fd, "deadlineKind"), ["STRUCTURED", "UNKNOWN", "NO_PUBLISHED_DEADLINE_FOUND"] as const, "UNKNOWN");
  const num = (k: string) => (str(fd, k) !== "" && Number(str(fd, k)) >= 0 ? Math.floor(Number(str(fd, k))) : null);
  const min = num("deadlineMin");
  if (kind !== "STRUCTURED" || min === null) return { kind: kind === "STRUCTURED" ? "UNKNOWN" : kind, specialNotes: str(fd, "deadlineNotes") };
  return { kind, minimumDaysBeforeEvent: min, maximumDaysBeforeEvent: num("deadlineMax"), dayType: str(fd, "deadlineDayType") === "BUSINESS" ? "BUSINESS" : "CALENDAR", cutoffTime: nullable(str(fd, "deadlineCutoff")), specialNotes: str(fd, "deadlineNotes") };
}

function parseDocs(fd: FormData): RuleInput["documents"] {
  return str(fd, "documents").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, mode, tpl, notes] = l.split("|").map((x) => x.trim());
    return { name, required: (mode ?? "REQUIRED").toUpperCase() !== "CONDITIONAL", conditional: (mode ?? "").toUpperCase() === "CONDITIONAL", templateKey: tpl || null, notes: notes ?? "" };
  });
}

export async function saveRuleDraftAction(fd: FormData) {
  const id = str(fd, "id") || null;
  await guarded(id ? `/admin/rules/${id}` : "/admin/rules/new", async (actor) => {
    const input: RuleInput = {
      ruleFamilyId: str(fd, "ruleFamilyId"),
      jurisdictionId: str(fd, "jurisdictionId"),
      authorityId: uuidOrNull(str(fd, "authorityId")),
      assemblyType: oneOf(str(fd, "assemblyType"), ASSEMBLY_TYPES, "any"),
      title: str(fd, "title") || "Untitled requirement",
      description: str(fd, "description"),
      legalStatement: str(fd, "legalStatement"),
      userAction: str(fd, "userAction"),
      category: oneOf(str(fd, "category"), CATEGORIES, "permissions"),
      requirementType: str(fd, "requirementType") || "general",
      level: oneOf(str(fd, "level"), LEVELS, "UNKNOWN"),
      elseLevel: str(fd, "elseLevel") ? oneOf(str(fd, "elseLevel"), LEVELS, "NOT_REQUIRED") : null,
      severity: oneOf(str(fd, "severity"), SEVERITIES, "REQUIRED"),
      legalCertainty: oneOf(str(fd, "legalCertainty"), LEGAL_CERTAINTIES, "UNVERIFIED"),
      condition: parseCondition(fd, "cond"),
      completeWhen: (() => { const c = parseCondition(fd, "done"); return c.all.length + c.any.length > 0 ? c : null; })(),
      deadline: parseDeadline(fd),
      submissionMethod: str(fd, "submissionMethod"),
      officialLink: httpOrNull(str(fd, "officialLink")), officialLinkLabel: str(fd, "officialLinkLabel"),
      documents: parseDocs(fd),
      vendorCategory: nullable(str(fd, "vendorCategory")),
      effectiveFrom: dateOrNull(str(fd, "effectiveFrom")),
      effectiveUntil: dateOrNull(str(fd, "effectiveUntil")),
      lastVerifiedAt: dateOrNull(str(fd, "lastVerifiedAt")),
      needsReview: fd.get("needsReview") === "on",
      confidence: oneOf(str(fd, "confidence"), CONFIDENCES, "low"),
      ruleOwner: str(fd, "ruleOwner"),
      adminNotes: str(fd, "adminNotes"),
      sort: Number.isFinite(Number(str(fd, "sort"))) ? Math.floor(Number(str(fd, "sort"))) : 100,
      inheritanceMode: oneOf(str(fd, "inheritanceMode"), INHERITANCE_MODES, "ADD"),
      overridesFamilyId: nullable(str(fd, "overridesFamilyId").toUpperCase()),
    };
    if (!(await getJurisdiction(input.jurisdictionId))) throw new Error("Choose a jurisdiction");
    return `/admin/rules/${await saveRuleDraft(id, input, actor)}?saved=1`;
  });
}

export async function ruleLifecycleAction(fd: FormData) {
  const id = str(fd, "id");
  const op = str(fd, "op");
  await guarded(`/admin/rules/${id}`, async (actor) => {
    const reason = str(fd, "reason");
    if (op === "clone") return `/admin/rules/${await cloneAsNewVersion(id, actor)}?saved=1`;
    if (op === "submit") await submitForReview(id, actor);
    else if (op === "publish") await publishRule(id, actor, reason);
    else if (op === "archive") await archiveRule(id, actor, reason);
    revalidatePath("/admin/rules");
    return `/admin/rules/${id}?saved=1`;
  });
}

export async function linkSourceAction(fd: FormData) {
  const ruleId = str(fd, "ruleId");
  await guarded(`/admin/rules/${ruleId}`, async (actor) => {
    const sourceId = uuidOrNull(str(fd, "sourceId"));
    if (!sourceId) throw new Error("Choose a source");
    await linkSource(ruleId, sourceId, { strength: oneOf(str(fd, "strength"), EVIDENCE_STRENGTHS, "PRIMARY"), excerpt: str(fd, "excerpt"), sectionRef: str(fd, "sectionRef"), note: str(fd, "note"), relevance: str(fd, "relevance"), flagOnChange: fd.get("flagOnChange") === "on" }, actor);
    return `/admin/rules/${ruleId}?saved=1`;
  });
}
export async function unlinkSourceAction(fd: FormData) {
  const ruleId = str(fd, "ruleId");
  await guarded(`/admin/rules/${ruleId}`, async (actor) => { await unlinkSource(ruleId, str(fd, "sourceId"), actor); });
}

export async function saveAuthorityAction(fd: FormData) {
  const id = str(fd, "id") || null;
  await guarded("/admin/authorities", async (actor) => {
    await saveAuthority(id, {
      name: str(fd, "name"), jurisdictionId: str(fd, "jurisdictionId"), authorityType: str(fd, "authorityType") || "OTHER", website: httpOrNull(str(fd, "website")),
      contactEmail: str(fd, "contactEmail"), contactPhone: str(fd, "contactPhone"), submissionUrl: httpOrNull(str(fd, "submissionUrl")),
      submissionMethod: oneOf(str(fd, "submissionMethod"), ["ONLINE", "EMAIL", "IN_PERSON", "POST", "UNKNOWN"] as const, "UNKNOWN"), officeAddress: str(fd, "officeAddress"),
      active: fd.get("active") === "on", notes: str(fd, "notes"), lastVerifiedAt: dateOrNull(str(fd, "lastVerifiedAt")),
    }, actor);
    revalidatePath("/admin/authorities");
  });
}

export async function saveSourceAction(fd: FormData) {
  const id = str(fd, "id") || null;
  await guarded("/admin/sources", async (actor) => {
    const sid = await saveSource(id, {
      title: str(fd, "title"), sourceType: oneOf(str(fd, "sourceType"), SOURCE_TYPES, "SECONDARY_LEAD"), issuingAuthority: str(fd, "issuingAuthority"),
      jurisdictionId: uuidOrNull(str(fd, "jurisdictionId")), canonicalUrl: httpOrNull(str(fd, "canonicalUrl")), publicationDate: dateOrNull(str(fd, "publicationDate")),
      effectiveDate: dateOrNull(str(fd, "effectiveDate")), retrievedAt: dateOrNull(str(fd, "retrievedAt")), active: fd.get("active") === "on",
      sourceCode: nullable(str(fd, "sourceCode")), orderNumber: str(fd, "orderNumber"), documentUrl: httpOrNull(str(fd, "documentUrl")), indexUrl: httpOrNull(str(fd, "indexUrl")),
      lifecycle: oneOf(str(fd, "lifecycle"), ["CURRENT", "HISTORICAL", "PLACEHOLDER"] as const, "CURRENT"), supersededBySourceId: uuidOrNull(str(fd, "supersededBySourceId")),
      monitoringEnabled: fd.get("monitoringEnabled") === "on", monitoringFrequency: oneOf(str(fd, "monitoringFrequency"), ["DAILY", "WEEKLY", "MONTHLY", "MANUAL"] as const, "WEEKLY"), notes: str(fd, "notes"),
      ...(fd.has("flagsPresent") ? { verificationFlags: fd.getAll("verificationFlags").map(String).filter((f) => ["SOURCE_VERIFIED", "FETCH_IN_THIS_ENVIRONMENT_BLOCKED", "PARSER_REAL_PAGE_VERIFICATION_PENDING", "PARSER_REAL_PAGE_VERIFIED"].includes(f)) } : {}),
    }, actor);
    return `/admin/sources/${sid}?saved=1`;
  });
}

export async function checkSourceAction(fd: FormData) {
  const id = str(fd, "id");
  await guarded(`/admin/sources/${id}`, async () => {
    const r = await checkSource(id);
    return `/admin/sources/${id}?result=${r.kind}${r.kind === "FETCH_FAILED" ? `&error=${encodeURIComponent(r.error)}` : ""}`;
  });
}

/** Manual content entry (paste the current text of the source). Used when a source cannot be fetched, and to demonstrate the review flow offline. */
export async function recordContentAction(fd: FormData) {
  const id = str(fd, "id");
  await guarded(`/admin/sources/${id}`, async () => {
    const text = String(fd.get("content") ?? "");
    if (text.trim().length < 5) throw new Error("Paste the source text");
    const r = await recordSourceContent(id, text, undefined, "manual entry");
    return r.kind === "CHANGED" ? `/admin/review?highlight=${r.changeEventId}` : `/admin/sources/${id}?result=${r.kind}`;
  });
}

export async function reviewChangeAction(fd: FormData) {
  const id = str(fd, "id");
  await guarded("/admin/review", async (actor) => {
    const op = str(fd, "op");
    if (op === "dismiss") await dismissChange(id, actor, str(fd, "notes") || "No change to the requirement.");
    else if (op === "replace") return `/admin/rules/${await startReplacement(id, str(fd, "ruleId"), actor)}?saved=1`;
    revalidatePath("/admin/review");
  });
}

export async function saveTemplateAction(fd: FormData) {
  await guarded("/admin/templates", async (actor) => {
    const r = await saveTemplateVersion({
      templateKey: str(fd, "templateKey"), name: str(fd, "name"), jurisdictionId: uuidOrNull(str(fd, "jurisdictionId")), authorityId: uuidOrNull(str(fd, "authorityId")),
      content: String(fd.get("content") ?? ""), disclaimer: str(fd, "disclaimer"), effectiveFrom: dateOrNull(str(fd, "effectiveFrom")), effectiveUntil: dateOrNull(str(fd, "effectiveUntil")),
      sourceId: uuidOrNull(str(fd, "sourceId")),
    }, actor);
    return `/admin/templates?saved=${r.version}`;
  });
}

export async function saveRestrictionAction(fd: FormData) {
  const id = str(fd, "id") || null;
  await guarded("/admin/restrictions", async (actor) => {
    await saveRestriction(id, {
      jurisdictionId: str(fd, "jurisdictionId"), title: str(fd, "title"), geographicScope: str(fd, "geographicScope"), startsAt: new Date(str(fd, "startsAt")).toISOString(),
      endsAt: new Date(str(fd, "endsAt")).toISOString(), legalBasis: str(fd, "legalBasis"), affectedActivities: str(fd, "affectedActivities").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean),
      effect: oneOf(str(fd, "effect"), ["PROHIBITED", "RESTRICTED", "CONDITIONAL"] as const, "RESTRICTED"), plainExplanation: str(fd, "plainExplanation"), sourceId: uuidOrNull(str(fd, "sourceId")),
      status: oneOf(str(fd, "status"), ["DRAFT", "ACTIVE", "EXPIRED", "ARCHIVED"] as const, "DRAFT"),
      issuingAuthority: str(fd, "issuingAuthority"), orderDate: dateOrNull(str(fd, "orderDate")), orderReference: str(fd, "orderReference"), sourceExcerpt: str(fd, "sourceExcerpt"),
    }, actor);
    revalidatePath("/admin/restrictions");
  });
}

/** Human step: a DRAFT restriction becomes ACTIVE only with a source (saveRestriction enforces it). */
export async function activateRestrictionAction(fd: FormData) {
  const id = str(fd, "id");
  await guarded("/admin/restrictions", async (actor) => {
    const r = (await listRestrictions()).find((x) => x.id === id);
    if (!r) throw new Error("Restriction not found");
    await saveRestriction(id, { ...r, sourceId: uuidOrNull(str(fd, "sourceId")) ?? r.sourceId, status: "ACTIVE" }, actor);
    revalidatePath("/admin/restrictions");
  });
}

export async function parseOrderAction(fd: FormData) {
  await guarded("/admin/restrictions", async (actor) => {
    const n = await parseOrderText(str(fd, "sourceId"), String(fd.get("text") ?? ""), actor);
    return `/admin/restrictions?saved=1&parsed=${n}`;
  });
}

export async function reviewCandidateAction(fd: FormData) {
  const id = str(fd, "id");
  await guarded("/admin/restrictions", async (actor) => {
    if (str(fd, "op") === "reject") { await rejectCandidate(id, str(fd, "notes") || "Not a restriction that applies.", actor); return; }
    const from = new Date(str(fd, "startsAt")), to = new Date(str(fd, "endsAt"));
    if (isNaN(+from) || isNaN(+to)) throw new Error("Enter the start and end of the order: the parser does not guess missing dates.");
    await acceptCandidate(id, {
      jurisdictionId: str(fd, "jurisdictionId"), title: str(fd, "title"), geographicScope: str(fd, "geographicScope"), startsAt: from.toISOString(), endsAt: to.toISOString(),
      legalBasis: str(fd, "legalBasis"), affectedActivities: str(fd, "affectedActivities").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean),
      effect: oneOf(str(fd, "effect"), ["PROHIBITED", "RESTRICTED", "CONDITIONAL"] as const, "RESTRICTED"), plainExplanation: str(fd, "plainExplanation"),
      issuingAuthority: str(fd, "issuingAuthority"), orderDate: dateOrNull(str(fd, "orderDate")), orderReference: str(fd, "orderReference"),
    }, actor);
    return "/admin/restrictions?saved=1";
  });
}

export async function addJurisdictionAction(fd: FormData) {
  await guarded("/admin/jurisdictions", async (actor) => {
    const level = oneOf(str(fd, "level"), JURISDICTION_LEVELS, "city") as JurisdictionLevel;
    const parentId = uuidOrNull(str(fd, "parentId"));
    const name = str(fd, "name");
    if (!name) throw new Error("Name is required");
    if (level !== "country" && !parentId) throw new Error("Choose a parent jurisdiction");
    const id = await addJurisdiction({ parentId: level === "country" ? null : parentId, level, name, supported: fd.get("supported") === "on", code: str(fd, "code") || undefined });
    await audit(actor.userId, "jurisdiction.create", "jurisdiction", id, { after: { name, level, parentId } });
    revalidatePath("/admin/jurisdictions");
  });
}

export async function toggleSupportedAction(fd: FormData) {
  await guarded("/admin/jurisdictions", async (actor) => {
    const id = str(fd, "id");
    const supported = str(fd, "supported") === "true";
    await setJurisdictionSupported(id, supported);
    await audit(actor.userId, "jurisdiction.supported", "jurisdiction", id, { after: { supported } });
    revalidatePath("/admin/jurisdictions");
  });
}

export async function archiveJurisdictionAction(fd: FormData) {
  await guarded("/admin/jurisdictions", async (actor) => {
    const id = str(fd, "id");
    const archived = str(fd, "archived") === "true";
    await archiveJurisdiction(id, archived);
    await audit(actor.userId, archived ? "jurisdiction.archive" : "jurisdiction.restore", "jurisdiction", id);
  });
}

export async function updateVendorRequestAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const status = oneOf(str(fd, "status"), ["new", "matching", "matched", "closed"] as const, "new");
  await updateVendorRequest(id, status, str(fd, "adminNotes"));
  await audit(admin.id, "vendor_request.update", "vendor_request", id, { after: { status } });
  revalidatePath("/admin/vendor-requests");
}


/* ---------- Venues: scheduling mode, date signals, official checks ---------- */

export async function setSchedulingModeAction(fd: FormData) {
  await guarded("/admin/venues", async (actor) => {
    await setSchedulingMode(str(fd, "venueId"), oneOf(str(fd, "mode"), SCHEDULING_MODES, "UNKNOWN"), actor);
    revalidatePath("/admin/venues");
  });
}

export async function saveVenueSignalAction(fd: FormData) {
  await guarded("/admin/venues", async (actor) => {
    const att = parseInt(str(fd, "attendance"), 10);
    await saveVenueSignal({
      venueId: str(fd, "venueId"), date: str(fd, "date"), startTime: str(fd, "startTime") || null, endTime: str(fd, "endTime") || null,
      type: oneOf(str(fd, "type"), SIGNAL_TYPES, "PUBLIC_EVENT_NOTICE"), status: oneOf(str(fd, "status"), EVENT_STATUSES, "REPORTED"), attendance: Number.isFinite(att) ? att : null,
      sourceId: uuidOrNull(str(fd, "sourceId")), sourceUrl: str(fd, "sourceUrl") || null, confidence: oneOf(str(fd, "confidence"), ["low", "medium", "high"] as const, "low"), label: str(fd, "label"),
    }, actor);
    revalidatePath("/admin/venues");
    return "/admin/venues?saved=1";
  });
}

export async function recordOfficialCheckAction(fd: FormData) {
  await guarded("/admin/venues", async (actor) => {
    await recordOfficialCheck({
      venueId: str(fd, "venueId"), authority: oneOf(str(fd, "authority"), ["BOOKING", "POLICE"] as const, "BOOKING"), sourceId: str(fd, "sourceId"), from: str(fd, "from"), to: str(fd, "to"),
      outcome: oneOf(str(fd, "outcome"), ["OK", "FAILED"] as const, "OK"), notes: str(fd, "notes"),
    }, actor);
    revalidatePath("/admin/venues");
    return "/admin/venues?saved=1";
  });
}
