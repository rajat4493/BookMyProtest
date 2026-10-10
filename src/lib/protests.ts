/**
 * Public protest pages. Planning data stays private in `events`; a public protest is created only by an explicit organizer action
 * and stores its own snapshot of what the organizer chose to publish.
 *
 * Privacy rules enforced here: every public read selects an explicit whitelist of columns (never event_id, owner_user_id or any contact detail);
 * supporter identity (`protest_supports.user_id`) is only ever read for the signed-in viewer's own state; counts are aggregates.
 */
import { randomBytes } from "node:crypto";
import { one, query } from "./db";
import { evaluate } from "./engine/evaluate";
import { currentPermission } from "./permissions";
import { PERMISSION_LABEL } from "./engine/permission";
import { provenanceLabel, shortDate, type Provenance } from "./engine/provenance";
import {
  CATEGORIES, PUBLIC_PERMISSION_LABEL, SUPPORT_KINDS, SUPPORT_TYPES, VISIBILITIES, screenPublicText, slugify, toPublicPermission,
  type PublicPermission, type SupportKind, type SupportOption, type Visibility,
} from "./engine/public-protest";
import { overlaysFor } from "./engine/select";
import type { Guidance } from "./engine/toolkit";
import { chainFor, latestEvaluation, listRestrictions } from "./knowledge";
import { doneRuleIds, getJurisdiction, getRulesByIds, type EventRow } from "./store";

export interface PublicFields { organizerType: boolean; logistics: boolean; officialInfo: boolean }
export interface ProtestInput {
  title: string; summary: string; description: string; organizerDisplayName: string; organizerType?: string | null; category: string; logistics: string;
  visibility: Visibility; permissionMode: "SYNC" | "NOT_PROVIDED"; publicFields: PublicFields; supportOptions: SupportOption[];
}

/** What anyone may see. No ids that point into planning data, no owner, no contact details. */
export interface PublicProtest {
  slug: string; title: string; summary: string; description: string; organizerDisplayName: string; organizerType: string | null;
  city: string; state: string; venue: string; date: string; startTime: string; endTime: string; category: string; categoryLabel: string; expectedFormat: "static" | "march";
  logistics: string; visibility: Visibility; moderation: "OK" | "HIDDEN" | "REMOVED"; publicFields: PublicFields; supportOptions: SupportOption[]; updatedAt: string; publishedAt: string | null;
  permission: { status: PublicPermission; label: string; reportedAt: string | null; provenance: Provenance };
  counts: { following: number; interested: number; planning: number; offers: Record<string, number> };
}
const PUBLIC_COLUMNS = `p.slug, p.title, p.summary, p.description, p.organizer_display_name, p.organizer_type, p.city, p.state, p.venue_name, to_char(p.event_date,'YYYY-MM-DD') AS d, p.start_time, p.end_time,
  p.category, p.expected_format, p.logistics, p.visibility, p.moderation_status, p.permission_mode, p.public_fields, p.support_options, p.updated_at, p.published_at, p.id, p.event_id`;

const E_NOT_YOURS = "Sign in to the account that owns this plan to publish it.";

async function permissionFor(eventId: string, mode: string): Promise<PublicProtest["permission"]> {
  if (mode === "NOT_PROVIDED") return { status: "UNKNOWN", label: PUBLIC_PERMISSION_LABEL.UNKNOWN, reportedAt: null, provenance: { cls: "UNKNOWN" } };
  const cur = await currentPermission(eventId);
  const status = toPublicPermission(cur.status);
  const reportedAt = cur.status === "NOT_STARTED" ? null : cur.recordedAt;
  return { status, label: PUBLIC_PERMISSION_LABEL[status], reportedAt, provenance: { cls: "ORGANIZER_PROVIDED", reported: true, asOf: reportedAt } };
}

async function counts(protestId: string): Promise<PublicProtest["counts"]> {
  const k = await query<{ kind: string; n: number }>("SELECT kind, count(*)::int AS n FROM protest_supports WHERE protest_id=$1 GROUP BY kind", [protestId]);
  const o = await query<{ option_type: string; n: number }>("SELECT option_type, count(*)::int AS n FROM protest_support_offers WHERE protest_id=$1 GROUP BY option_type", [protestId]);
  const get = (x: string) => k.find((r) => r.kind === x)?.n ?? 0;
  return { following: get("FOLLOWING"), interested: get("INTERESTED"), planning: get("PLANNING_TO_ATTEND"), offers: Object.fromEntries(o.map((r) => [r.option_type, r.n])) };
}

async function shape(r: any): Promise<PublicProtest> {
  return {
    slug: r.slug, title: r.title, summary: r.summary, description: r.description, organizerDisplayName: r.organizer_display_name, organizerType: r.public_fields?.organizerType ? r.organizer_type : null,
    city: r.city, state: r.state, venue: r.venue_name, date: r.d, startTime: r.start_time, endTime: r.end_time, category: r.category, categoryLabel: CATEGORIES[r.category] ?? CATEGORIES.OTHER, expectedFormat: r.expected_format,
    logistics: r.public_fields?.logistics ? r.logistics : "", visibility: r.visibility, moderation: r.moderation_status, publicFields: r.public_fields, supportOptions: r.support_options ?? [],
    updatedAt: new Date(r.updated_at).toISOString(), publishedAt: r.published_at ? new Date(r.published_at).toISOString() : null,
    permission: await permissionFor(r.event_id, r.permission_mode), counts: await counts(r.id),
  };
}

/* ---------------- organizer: create / edit / visibility ---------------- */

export function validateProtestInput(i: ProtestInput): string | null {
  const t = (v: string, min: number, max: number, label: string) => (v.trim().length < min ? `${label} is required.` : v.length > max ? `${label} is too long.` : null);
  const err = t(i.title, 3, 120, "Title") ?? t(i.organizerDisplayName, 2, 80, "Organizer display name") ?? (i.summary.length > 280 ? "Summary is too long (280 characters)." : null)
    ?? (i.description.length > 4000 ? "Description is too long." : null) ?? (i.logistics.length > 1000 ? "Logistics is too long." : null);
  if (err) return err;
  if (!(VISIBILITIES as readonly string[]).includes(i.visibility)) return "Unknown visibility.";
  if (!CATEGORIES[i.category]) return "Choose a subject area.";
  for (const [label, text] of [["Title", i.title], ["Summary", i.summary], ["Description", i.description], ["Organizer name", i.organizerDisplayName], ["Logistics", i.logistics]] as const) {
    const s = screenPublicText(label, text); if (s) return s;
  }
  for (const o of i.supportOptions) {
    if (!SUPPORT_TYPES[o.type]) return "Unknown support option.";
    if (o.note.length > 200) return "A support note is too long.";
    if (o.link && !/^https:\/\/[^\s]+$/i.test(o.link)) return "Support links must start with https://";
  }
  return null;
}

export async function getOwnerProtest(eventId: string) {
  const r = (await query(`SELECT ${PUBLIC_COLUMNS}, p.owner_user_id FROM public_protests p WHERE p.event_id=$1`, [eventId]))[0];
  return r ? { protest: await shape(r), eventId: r.event_id as string, ownerUserId: r.owner_user_id as string, id: r.id as string } : null;
}

/** Creates or updates the public record for a plan. Never publishes by itself: the caller chooses the visibility, default DRAFT. */
export async function saveProtest(event: EventRow, user: { id: string }, input: ProtestInput): Promise<{ slug: string; created: boolean; becamePublic: boolean }> {
  if (event.userId !== user.id) throw new Error(E_NOT_YOURS);
  const u = await one<{ suspended_at: Date | null }>("SELECT suspended_at FROM users WHERE id=$1", [user.id]);
  if (u?.suspended_at) throw new Error("This account is suspended and cannot publish or edit public pages.");
  const err = validateProtestInput(input);
  if (err) throw new Error(err);
  const existing = await one<{ id: string; slug: string; visibility: string; moderation_status: string; published_at: Date | null }>("SELECT id, slug, visibility, moderation_status, published_at FROM public_protests WHERE event_id=$1", [event.id]);
  if (existing?.moderation_status === "REMOVED") throw new Error("This page was removed under the platform guidelines and cannot be edited.");
  const city = await getJurisdiction(event.jurisdictionId);
  const parent = city?.parentId ? await getJurisdiction(city.parentId) : null;
  const venue = event.venueJurisdictionId ? await getJurisdiction(event.venueJurisdictionId) : null;
  const venueName = venue?.name ?? event.answers.startLocation;
  const goingLive = input.visibility === "PUBLIC" || input.visibility === "UNLISTED";
  const opts = JSON.stringify(input.supportOptions.map((o) => ({ type: o.type, note: o.note.trim(), link: o.link.trim() })));
  if (existing) {
    await query(`UPDATE public_protests SET title=$2, summary=$3, description=$4, organizer_display_name=$5, organizer_type=$6, city=$7, state=$8, venue_name=$9, venue_jurisdiction_id=$10, event_date=$11, start_time=$12, end_time=$13,
      category=$14, expected_format=$15, logistics=$16, visibility=$17, permission_mode=$18, public_fields=$19, support_options=$20, published_at=CASE WHEN $21 THEN COALESCE(published_at, now()) ELSE published_at END, updated_at=now() WHERE id=$1`,
      [existing.id, input.title.trim(), input.summary.trim(), input.description.trim(), input.organizerDisplayName.trim(), input.organizerType ?? null, city?.name ?? "", parent?.name ?? "", venueName, event.venueJurisdictionId, event.date, event.answers.startTime, event.answers.endTime,
        input.category, event.answers.kind, input.logistics.trim(), input.visibility, input.permissionMode, JSON.stringify(input.publicFields), opts, goingLive]);
    return { slug: existing.slug, created: false, becamePublic: goingLive && !existing.published_at };
  }
  const slug = `${slugify(input.title)}-${randomBytes(3).toString("hex")}`;
  await query(`INSERT INTO public_protests (slug, event_id, owner_user_id, title, summary, description, organizer_display_name, organizer_type, city, state, venue_name, venue_jurisdiction_id, event_date, start_time, end_time,
    category, expected_format, logistics, visibility, permission_mode, public_fields, support_options, published_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22, CASE WHEN $23 THEN now() END)`,
    [slug, event.id, user.id, input.title.trim(), input.summary.trim(), input.description.trim(), input.organizerDisplayName.trim(), input.organizerType ?? null, city?.name ?? "", parent?.name ?? "", venueName, event.venueJurisdictionId, event.date, event.answers.startTime, event.answers.endTime,
      input.category, event.answers.kind, input.logistics.trim(), input.visibility, input.permissionMode, JSON.stringify(input.publicFields), opts, goingLive]);
  return { slug, created: true, becamePublic: goingLive };
}

/** Organizer-only visibility changes: unpublish (PRIVATE), cancel, archive, publish. */
export async function setVisibility(eventId: string, user: { id: string }, visibility: Visibility) {
  const p = await one<{ id: string; owner_user_id: string; moderation_status: string }>("SELECT id, owner_user_id, moderation_status FROM public_protests WHERE event_id=$1", [eventId]);
  if (!p || p.owner_user_id !== user.id) throw new Error(E_NOT_YOURS);
  if (p.moderation_status === "REMOVED") throw new Error("This page was removed under the platform guidelines.");
  if (!(VISIBILITIES as readonly string[]).includes(visibility)) throw new Error("Unknown visibility.");
  await query("UPDATE public_protests SET visibility=$2, published_at=CASE WHEN $3 THEN COALESCE(published_at, now()) ELSE published_at END, updated_at=now() WHERE id=$1", [p.id, visibility, visibility === "PUBLIC" || visibility === "UNLISTED"]);
}

export async function postUpdate(eventId: string, user: { id: string }, body: string) {
  const p = await one<{ id: string; owner_user_id: string; moderation_status: string }>("SELECT id, owner_user_id, moderation_status FROM public_protests WHERE event_id=$1", [eventId]);
  if (!p || p.owner_user_id !== user.id) throw new Error(E_NOT_YOURS);
  if (p.moderation_status !== "OK") throw new Error("This page is not open for updates.");
  const text = body.trim();
  if (text.length < 1 || text.length > 2000) throw new Error("An update must be between 1 and 2000 characters.");
  const s = screenPublicText("Update", text); if (s) throw new Error(s);
  await query("INSERT INTO protest_updates (protest_id, body) VALUES ($1,$2)", [p.id, text]);
  await query("UPDATE public_protests SET updated_at=now() WHERE id=$1", [p.id]);
}

/* ---------------- public reads ---------------- */

export interface Viewer { userId: string | null }
const OPEN = "p.moderation_status='OK' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=p.owner_user_id AND u.suspended_at IS NOT NULL)";

/** A page by slug. Anyone sees PUBLIC / UNLISTED / CANCELLED pages that are not moderated; the owner can also preview DRAFT / PRIVATE / ARCHIVED and moderated pages. */
export async function getPublicProtest(slug: string, viewer: Viewer = { userId: null }): Promise<{ protest: PublicProtest; isOwner: boolean; hiddenNotice: string | null } | null> {
  const r = (await query(`SELECT ${PUBLIC_COLUMNS}, p.owner_user_id, (SELECT u.suspended_at IS NOT NULL FROM users u WHERE u.id=p.owner_user_id) AS owner_suspended FROM public_protests p WHERE p.slug=$1`, [slug]))[0];
  if (!r) return null;
  const isOwner = !!viewer.userId && viewer.userId === r.owner_user_id;
  const openToAll = r.moderation_status === "OK" && !r.owner_suspended && ["PUBLIC", "UNLISTED", "CANCELLED"].includes(r.visibility);
  if (!openToAll && !isOwner) return null;
  let hiddenNotice: string | null = null;
  if (isOwner) {
    if (r.moderation_status !== "OK") hiddenNotice = `This page is ${r.moderation_status === "HIDDEN" ? "hidden" : "removed"} under the platform guidelines and is not visible to others.`;
    else if (r.owner_suspended) hiddenNotice = "Your account is suspended, so this page is not visible to others.";
    else if (!openToAll) hiddenNotice = `Preview: this page is ${r.visibility.toLowerCase()} and not visible to others.`;
  }
  return { protest: await shape(r), isOwner, hiddenNotice };
}

export interface ListFilters { city?: string; state?: string; category?: string; from?: string; to?: string; upcoming?: boolean; sort?: "upcoming" | "updated" | "newest"; today?: string }
export async function listProtests(f: ListFilters = {}): Promise<PublicProtest[]> {
  const where = [`p.visibility='PUBLIC'`, OPEN]; const args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };
  if (f.city) add("lower(p.city) = lower(?)", f.city);
  if (f.state) add("lower(p.state) = lower(?)", f.state);
  if (f.category && CATEGORIES[f.category]) add("p.category = ?", f.category);
  if (f.from) add("p.event_date >= ?", f.from);
  if (f.to) add("p.event_date <= ?", f.to);
  if (f.upcoming) add("p.event_date >= ?", f.today ?? new Date().toISOString().slice(0, 10));
  // "Upcoming first" really is: events still to come, soonest first, then past events (most recent first).
  const order = f.sort === "updated" ? "p.updated_at DESC" : f.sort === "newest" ? "p.published_at DESC NULLS LAST" : "(p.event_date < CURRENT_DATE), CASE WHEN p.event_date >= CURRENT_DATE THEN p.event_date END ASC, p.event_date DESC, p.start_time ASC";
  const rows = await query(`SELECT ${PUBLIC_COLUMNS} FROM public_protests p WHERE ${where.join(" AND ")} ORDER BY ${order}, p.slug LIMIT 60`, args);
  return Promise.all(rows.map(shape));
}
export async function listPlaces(): Promise<{ cities: string[]; states: string[] }> {
  const rows = await query<{ city: string; state: string }>(`SELECT DISTINCT p.city, p.state FROM public_protests p WHERE p.visibility='PUBLIC' AND ${OPEN} ORDER BY 2, 1`);
  return { cities: [...new Set(rows.map((r) => r.city).filter(Boolean))], states: [...new Set(rows.map((r) => r.state).filter(Boolean))] };
}

export async function listUpdates(slug: string): Promise<{ body: string; createdAt: string }[]> {
  return (await query("SELECT u.body, u.created_at FROM protest_updates u JOIN public_protests p ON p.id=u.protest_id WHERE p.slug=$1 ORDER BY u.created_at DESC LIMIT 30", [slug])).map((r: any) => ({ body: r.body, createdAt: new Date(r.created_at).toISOString() }));
}

/** Other PUBLIC listings for the same venue and date. Says nothing about capacity or availability: a listing is not an approval. */
export async function otherListedSameDate(slug: string): Promise<{ slug: string; title: string; startTime: string; endTime: string }[]> {
  const rows = await query(`SELECT o.slug, o.title, o.start_time, o.end_time FROM public_protests p JOIN public_protests o ON o.id<>p.id AND o.event_date=p.event_date
    AND ((p.venue_jurisdiction_id IS NOT NULL AND o.venue_jurisdiction_id=p.venue_jurisdiction_id) OR (p.venue_jurisdiction_id IS NULL AND o.venue_jurisdiction_id IS NULL AND lower(o.venue_name)=lower(p.venue_name) AND o.city=p.city))
    WHERE p.slug=$1 AND o.visibility='PUBLIC' AND ${OPEN.replace(/p\./g, "o.")} ORDER BY o.start_time, o.slug`, [slug]);
  return rows.map((r: any) => ({ slug: r.slug, title: r.title, startTime: r.start_time, endTime: r.end_time }));
}

/* ---------------- supporters: login-gated, aggregate-only ---------------- */

async function openProtest(slug: string) {
  const r = await one<{ id: string; visibility: string; moderation_status: string; owner_suspended: boolean; options: SupportOption[] }>(
    "SELECT p.id, p.visibility, p.moderation_status, (SELECT u.suspended_at IS NOT NULL FROM users u WHERE u.id=p.owner_user_id) AS owner_suspended, p.support_options AS options FROM public_protests p WHERE p.slug=$1", [slug]);
  if (!r || r.moderation_status !== "OK" || r.owner_suspended || !["PUBLIC", "UNLISTED"].includes(r.visibility)) throw new Error("This page is not open for support actions.");
  return r;
}

/** Toggles one supporter intent for the signed-in user (undo = toggle again). Returns whether it is now on. */
export async function toggleSupport(slug: string, userId: string, kind: SupportKind): Promise<boolean> {
  if (!(SUPPORT_KINDS as readonly string[]).includes(kind)) throw new Error("Unknown action.");
  const u = await one<{ suspended_at: Date | null }>("SELECT suspended_at FROM users WHERE id=$1", [userId]);
  if (u?.suspended_at) throw new Error("This account is suspended.");
  const p = await openProtest(slug);
  const del = await query("DELETE FROM protest_supports WHERE protest_id=$1 AND user_id=$2 AND kind=$3 RETURNING 1", [p.id, userId, kind]);
  if (del.length) return false;
  await query("INSERT INTO protest_supports (protest_id, user_id, kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [p.id, userId, kind]);
  return true;
}
export async function toggleOffer(slug: string, userId: string, type: string): Promise<boolean> {
  const p = await openProtest(slug);
  if (!SUPPORT_TYPES[type] || !p.options.some((o) => o.type === type)) throw new Error("The organizer has not enabled that option.");
  const del = await query("DELETE FROM protest_support_offers WHERE protest_id=$1 AND user_id=$2 AND option_type=$3 RETURNING 1", [p.id, userId, type]);
  if (del.length) return false;
  await query("INSERT INTO protest_support_offers (protest_id, user_id, option_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [p.id, userId, type]);
  return true;
}
/** The signed-in viewer's OWN intents only. */
export async function viewerState(slug: string, userId: string | null): Promise<{ kinds: SupportKind[]; offers: string[] }> {
  if (!userId) return { kinds: [], offers: [] };
  const kinds = await query<{ kind: SupportKind }>("SELECT s.kind FROM protest_supports s JOIN public_protests p ON p.id=s.protest_id WHERE p.slug=$1 AND s.user_id=$2", [slug, userId]);
  const offers = await query<{ option_type: string }>("SELECT s.option_type FROM protest_support_offers s JOIN public_protests p ON p.id=s.protest_id WHERE p.slug=$1 AND s.user_id=$2", [slug, userId]);
  return { kinds: kinds.map((k) => k.kind), offers: offers.map((o) => o.option_type) };
}

/* ---------------- official information held by BookMyProtest ---------------- */

export interface OfficialInfo { checkedOn: string | null; links: { title: string; url: string; section: string; label: string }[]; guidance: Guidance[] }
const LEAD = (s: { sourceType?: string; strength?: string }) => s.sourceType === "SECONDARY_LEAD" || s.strength === "LEAD";

/** Official-source information for a plan's rules: links and venue guidance. It is information, never an authorization. */
export async function officialInfoForEvent(event: EventRow): Promise<OfficialInfo> {
  const ev = await latestEvaluation(event.id);
  if (!ev) return { checkedOn: null, links: [], guidance: [] };
  const chain = await chainFor(event);
  const overlays = overlaysFor(await listRestrictions(chain), chain, event.date, event.answers);
  const items = evaluate(await getRulesByIds(ev.ruleIds), event.answers, await doneRuleIds(event.id), overlays).filter((i) => i.freshness === "CURRENT" && i.evidence === "verified" && i.rule.requirementType !== "warning");
  const links = new Map<string, OfficialInfo["links"][number]>();
  for (const i of items) {
    for (const s of i.rule.sources) if (s.url && !LEAD(s) && !s.indexOnly && !links.has(s.url)) links.set(s.url, { title: s.title, url: s.url, section: s.sectionRef ?? "", label: "Official source" });
    if (i.rule.officialLink) links.set(i.rule.officialLink, { title: i.rule.officialLinkLabel || i.rule.title, url: i.rule.officialLink, section: "", label: i.rule.officialLinkLabel || "Official document" });
  }
  const guidance: Guidance[] = items.filter((i) => (i.rule.category === "logistics" || i.rule.category === "safety") && i.level === "REQUIRED" && i.rule.requirementType !== "permission_gate" && !/liaison|volunteer|water|undertaking/i.test(i.rule.title))
    .map((i) => ({ title: i.rule.title, text: i.rule.description.replace(/\{buses\}/g, "your").replace(/\s+/g, " "), source: i.rule.sources.find((s) => !LEAD(s))?.title ?? "official source" }));
  const dates = items.map((i) => i.rule.lastVerifiedAt).filter((d): d is string => !!d).sort();
  return { checkedOn: dates.length ? dates[dates.length - 1] : null, links: [...links.values()], guidance };
}


/** Official information for a published page, looked up by slug (the plan id never leaves the server). Empty when the organizer switched it off. */
export async function officialInfoForSlug(slug: string): Promise<OfficialInfo | null> {
  const r = await one<{ event_id: string; public_fields: PublicFields }>("SELECT event_id, public_fields FROM public_protests WHERE slug=$1", [slug]);
  if (!r || !r.public_fields?.officialInfo) return null;
  const { getEvent } = await import("./store");
  const ev = await getEvent(r.event_id);
  return ev ? officialInfoForEvent(ev) : null;
}

/** Social-toolkit drafts for the organizer's own page. Nothing is posted anywhere. */
export async function toolkitForEvent(event: EventRow, origin: string) {
  const { buildToolkit } = await import("./engine/toolkit");
  const o = await getOwnerProtest(event.id);
  if (!o) return null;
  const p = o.protest;
  const info = p.publicFields.officialInfo ? await officialInfoForEvent(event) : { checkedOn: null, links: [], guidance: [] as Guidance[] };
  const { formatDate } = await import("./plan");
  return buildToolkit({
    title: p.title, summary: p.summary || p.description.slice(0, 200), city: p.city, state: p.state, venue: p.venue, dateLabel: formatDate(p.date), startTime: p.startTime, endTime: p.endTime, organizerName: p.organizerDisplayName,
    permissionLine: p.permission.status === "UNKNOWN" ? null : `Permission status (reported by the organizer): ${p.permission.label.replace(" — reported by organizer", "")}`,
    url: `${origin}/protests/${p.slug}`, guidance: info.guidance, officialCheckedOn: info.checkedOn ? formatDate(info.checkedOn) : null,
  });
}
