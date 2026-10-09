"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { endSession, ensureAnonId, getUser, requireAdmin, startSession } from "@/lib/auth";
import { loadOwnedEvent } from "@/lib/access";
import { one } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { allow } from "@/lib/ratelimit";
import { DOC_KINDS } from "@/lib/documents";
import { parseAnswers, vendorRequestSchema, waitlistSchema } from "@/lib/validation";
import {
  addJurisdiction, addWaitlist, audit, createEvent, createVendorRequest, eventsFor, getJurisdiction, recordDocument, saveRule,
  setJurisdictionSupported, setRequirementDone, setRuleArchived, track, updateVendorRequest, listVendorCategories, type RuleInput,
} from "@/lib/store";
import { ASSEMBLY_TYPES, CATEGORIES, CONDITION_FIELDS, CONFIDENCES, LEVELS, OPS, SEVERITIES, type Clause, type Condition } from "@/lib/engine/types";

export type ActionResult = { ok: false; errors: Record<string, string> } | { ok: true };

const safeNext = (n: unknown) => (typeof n === "string" && /^\/(?!\/)[\w\-/?=&.%]*$/.test(n) ? n : "/account");

/* ---------- Planning ---------- */

export async function createPlanAction(cityId: string, raw: unknown): Promise<ActionResult> {
  const city = await getJurisdiction(cityId);
  if (!city || city.level !== "city" || !city.supported) return { ok: false, errors: { city: "We're not live here yet. Join the waitlist." } };
  const parsed = parseAnswers(raw);
  if (!parsed.ok) return parsed;
  const anon = await ensureAnonId();
  const user = await getUser();
  const id = await createEvent(anon, user?.id ?? null, city.id, parsed.answers);
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

export async function generatePackAction(formData: FormData) {
  const eventId = String(formData.get("eventId"));
  await loadOwnedEvent(eventId);
  for (const d of DOC_KINDS) await recordDocument(eventId, d.slug);
  await track("generate_document", await ensureAnonId(), { eventId, kinds: DOC_KINDS.length });
  redirect(`/plan/${eventId}/pack?ready=1`);
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

const BOOL_FIELDS = new Set(["march", "sound", "vehicles", "stage", "food"]);
const NUM_FIELDS = new Set(["attendance"]);

function parseClauses(fd: FormData, prefix: string): Clause[] {
  const out: Clause[] = [];
  for (let i = 0; i < 5; i++) {
    const field = str(fd, `${prefix}_field_${i}`);
    if (!field) continue;
    if (!(CONDITION_FIELDS as readonly string[]).includes(field)) continue;
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

export async function saveRuleAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id") || null;
  const sources = [0, 1, 2].map((i) => ({
    url: nullable(str(fd, `src_url_${i}`)), title: str(fd, `src_title_${i}`), retrievedAt: dateOrNull(str(fd, `src_date_${i}`)), notes: str(fd, `src_notes_${i}`),
  })).filter((s) => s.url || s.title || s.notes);
  const cw = parseCondition(fd, "done");
  const url = (s: string) => (s && /^https?:\/\//i.test(s) ? s : null);
  for (const s of sources) s.url = s.url && /^https?:\/\//i.test(s.url) ? s.url : null;
  const input: RuleInput = {
    jurisdictionId: str(fd, "jurisdictionId"),
    assemblyType: oneOf(str(fd, "assemblyType"), ASSEMBLY_TYPES, "any"),
    title: str(fd, "title") || "Untitled requirement",
    description: str(fd, "description"),
    category: oneOf(str(fd, "category"), CATEGORIES, "permissions"),
    requirementType: str(fd, "requirementType") || "general",
    level: oneOf(str(fd, "level"), LEVELS, "UNKNOWN"),
    elseLevel: str(fd, "elseLevel") ? oneOf(str(fd, "elseLevel"), LEVELS, "NOT_REQUIRED") : null,
    severity: oneOf(str(fd, "severity"), SEVERITIES, "REQUIRED"),
    condition: parseCondition(fd, "cond"),
    completeWhen: cw.all.length + cw.any.length > 0 ? cw : null,
    deadlineDaysBefore: str(fd, "deadlineDaysBefore") !== "" && Number(str(fd, "deadlineDaysBefore")) >= 0 ? Math.floor(Number(str(fd, "deadlineDaysBefore"))) : null,
    deadlineNote: str(fd, "deadlineNote"),
    officialLink: url(str(fd, "officialLink")),
    requiredDocuments: str(fd, "requiredDocuments").split("\n").map((s) => s.trim()).filter(Boolean),
    vendorCategory: nullable(str(fd, "vendorCategory")),
    lastVerifiedAt: dateOrNull(str(fd, "lastVerifiedAt")),
    needsReview: fd.get("needsReview") === "on",
    confidence: oneOf(str(fd, "confidence"), CONFIDENCES, "low"),
    ruleOwner: str(fd, "ruleOwner"),
    adminNotes: str(fd, "adminNotes"),
    sort: Number.isFinite(Number(str(fd, "sort"))) ? Math.floor(Number(str(fd, "sort"))) : 100,
    sources,
  };
  if (!(await getJurisdiction(input.jurisdictionId))) throw new Error("Unknown jurisdiction");
  const ruleId = await saveRule(id, input);
  await audit(admin.id, id ? "rule.update" : "rule.create", "rule", ruleId, { title: input.title });
  revalidatePath("/admin/rules");
  redirect(`/admin/rules/${ruleId}?saved=1`);
}

export async function archiveRuleAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const archive = str(fd, "archive") === "true";
  await setRuleArchived(id, archive);
  await audit(admin.id, archive ? "rule.archive" : "rule.restore", "rule", id);
  revalidatePath("/admin/rules");
  redirect("/admin/rules");
}

export async function addJurisdictionAction(fd: FormData) {
  const admin = await requireAdmin();
  const level = oneOf(str(fd, "level"), ["country", "state", "city"] as const, "city");
  const parentId = nullable(str(fd, "parentId"));
  const name = str(fd, "name");
  if (!name) return;
  if (level !== "country" && !parentId) return;
  const id = await addJurisdiction({ parentId: level === "country" ? null : parentId, level, name, supported: fd.get("supported") === "on" });
  await audit(admin.id, "jurisdiction.create", "jurisdiction", id, { name, level });
  revalidatePath("/admin/jurisdictions");
}

export async function toggleSupportedAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const supported = str(fd, "supported") === "true";
  await setJurisdictionSupported(id, supported);
  await audit(admin.id, "jurisdiction.supported", "jurisdiction", id, { supported });
  revalidatePath("/admin/jurisdictions");
}

export async function updateVendorRequestAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const status = oneOf(str(fd, "status"), ["new", "matching", "matched", "closed"] as const, "new");
  await updateVendorRequest(id, status, str(fd, "adminNotes"));
  await audit(admin.id, "vendor_request.update", "vendor_request", id, { status });
  revalidatePath("/admin/vendor-requests");
}
