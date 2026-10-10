/** Venue scheduling modes, date signals, official-check records and the date-conflict check. Humans record official/public signals; BookMyProtest's own are derived. */
import { one, query } from "./db";
import { composeAvailability, EVENT_STATUSES, SCHEDULING_MODES, SIGNAL_TYPES, type Authority, type Availability, type Coverage, type SchedulingMode, type Signal, type SignalStatus, type SignalType } from "./engine/availability";
import { assertHuman, type Actor } from "./knowledge";
import { audit } from "./store";

const SOCIAL = /(^|\.)(facebook|fb|instagram|x|twitter|t|telegram|whatsapp|youtube|youtu|tiktok|threads|reddit|linkedin)\.(com|me|be|co)$|(^|\.)t\.me$/i;
const HTTPS = /^https:\/\//i;
export const isSocialUrl = (u: string) => { try { return SOCIAL.test(new URL(u).hostname); } catch { return false; } };
const MANUAL_TYPES: SignalType[] = ["OFFICIAL_BOOKING", "POLICE_APPROVAL", "POLICE_APPLICATION", "PUBLIC_EVENT_NOTICE"];

export async function setSchedulingMode(venueId: string, mode: SchedulingMode, actor: Actor) {
  assertHuman(actor);
  if (!(SCHEDULING_MODES as readonly string[]).includes(mode)) throw new Error("Unknown scheduling mode");
  const v = await one<{ level: string; scheduling_mode: string }>("SELECT level, scheduling_mode FROM jurisdictions WHERE id=$1", [venueId]);
  if (!v || v.level !== "venue") throw new Error("Scheduling mode applies to venues only");
  await query("UPDATE jurisdictions SET scheduling_mode=$2 WHERE id=$1", [venueId, mode]);
  await audit(actor.userId, "venue.scheduling_mode", "jurisdiction", venueId, { before: { mode: v.scheduling_mode }, after: { mode } });
}

export interface SignalInput {
  venueId: string; date: string; startTime: string | null; endTime: string | null; type: SignalType; status: SignalStatus; attendance: number | null;
  sourceId: string | null; sourceUrl: string | null; confidence: "low" | "medium" | "high"; label?: string; checkedAt?: Date;
}
/** Official and public signals are entered by a person. Public/social reports are forced to low confidence and can never be confirmed. */
export async function saveVenueSignal(i: SignalInput, actor: Actor): Promise<string> {
  assertHuman(actor);
  if (!MANUAL_TYPES.includes(i.type)) throw new Error("BookMyProtest application and approval signals are derived from its own plans, not entered by hand.");
  if (!(EVENT_STATUSES as readonly string[]).includes(i.status)) throw new Error("Unknown status");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) throw new Error("A date is required");
  const url = i.sourceUrl && HTTPS.test(i.sourceUrl) ? i.sourceUrl : null;
  let confidence = i.confidence, status = i.status;
  if (i.type === "PUBLIC_EVENT_NOTICE") { confidence = "low"; if (status === "CONFIRMED") status = "REPORTED"; }
  else {
    if (!i.sourceId) throw new Error("An official signal must cite a registered source.");
    const s = await one<{ source_type: string; lifecycle: string; canonical_url: string | null }>("SELECT source_type, lifecycle, canonical_url FROM sources WHERE id=$1", [i.sourceId]);
    if (!s || s.source_type === "SECONDARY_LEAD" || s.lifecycle !== "CURRENT") throw new Error("An official signal needs a current official source (not a news lead).");
    if ((url && isSocialUrl(url)) || (s.canonical_url && isSocialUrl(s.canonical_url))) throw new Error("Social media is never an official source of availability. Record it as a public report instead.");
  }
  if (url && isSocialUrl(url) && i.type !== "PUBLIC_EVENT_NOTICE") throw new Error("Social media can only be a low-confidence public report.");
  const id = (await one<{ id: string }>(
    `INSERT INTO venue_date_signals (venue_id, signal_date, start_time, end_time, signal_type, event_status, expected_attendance, source_id, source_url, confidence, checked_at, label, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [i.venueId, i.date, i.startTime || null, i.endTime || null, i.type, status, i.attendance, i.sourceId, url, confidence, i.checkedAt ?? new Date(), i.label ?? "", actor.userId]))!.id;
  await audit(actor.userId, "venue.signal", "venue_date_signal", id, { after: { ...i, status, confidence } });
  return id;
}

/** Records that an official calendar/register was actually looked at. Without such a record, that authority's status is UNKNOWN. */
export async function recordOfficialCheck(i: { venueId: string; authority: Authority; sourceId: string; from: string; to: string; outcome: "OK" | "FAILED"; notes?: string; checkedAt?: Date }, actor: Actor): Promise<string> {
  assertHuman(actor);
  if (!(["BOOKING", "POLICE"] as string[]).includes(i.authority)) throw new Error("Unknown authority");
  const s = await one<{ source_type: string; lifecycle: string }>("SELECT source_type, lifecycle FROM sources WHERE id=$1", [i.sourceId]);
  if (!s || s.source_type === "SECONDARY_LEAD" || s.lifecycle !== "CURRENT") throw new Error("An official check needs a current official source.");
  if (i.to < i.from) throw new Error("The covered range ends before it starts.");
  const id = (await one<{ id: string }>("INSERT INTO venue_official_checks (venue_id, authority, source_id, covers_from, covers_to, checked_at, outcome, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
    [i.venueId, i.authority, i.sourceId, i.from, i.to, i.checkedAt ?? new Date(), i.outcome, i.notes ?? "", actor.userId]))!.id;
  await audit(actor.userId, "venue.official_check", "venue_official_check", id, { after: i });
  return id;
}

export async function addVenueEvidence(venueId: string, sourceId: string, kind: "CASE_LAW" | "OPERATIONAL_LEARNING", lesson: string, actor: Actor) {
  assertHuman(actor);
  await query("INSERT INTO venue_evidence (venue_id, source_id, kind, lesson) VALUES ($1,$2,$3,$4) ON CONFLICT (venue_id, source_id, kind) DO UPDATE SET lesson=$4", [venueId, sourceId, kind, lesson]);
  await audit(actor.userId, "venue.evidence", "jurisdiction", venueId, { after: { sourceId, kind, lesson } });
}
export async function venueEvidence(venueId: string) {
  return query<{ kind: string; lesson: string; title: string; url: string | null; source_type: string }>(
    "SELECT e.kind, e.lesson, s.title, s.canonical_url AS url, s.source_type FROM venue_evidence e JOIN sources s ON s.id=e.source_id WHERE e.venue_id=$1 ORDER BY e.kind, s.title", [venueId]);
}

const t5 = (t: string | null) => (t ? String(t).slice(0, 5) : null);

/** The date-conflict check for a venue and date. BookMyProtest's own users are included only as plans "known to BookMyProtest" (no names or contacts). */
export async function venueAvailability(venueId: string, date: string, startTime: string, endTime: string, opts: { attendance?: number | null; excludeEventId?: string | null; now?: Date } = {}): Promise<Availability | null> {
  const v = await one<{ level: string; scheduling_mode: SchedulingMode; metadata: { capacity?: number } }>("SELECT level, scheduling_mode, metadata FROM jurisdictions WHERE id=$1", [venueId]);
  if (!v || v.level !== "venue") return null;
  const rows = await query("SELECT *, signal_date::text AS d FROM venue_date_signals WHERE venue_id=$1 AND signal_date=$2", [venueId, date]);
  const signals: Signal[] = rows.map((r: any) => ({
    id: r.id, type: r.signal_type, status: r.event_status, startTime: t5(r.start_time), endTime: t5(r.end_time), attendance: r.expected_attendance, confidence: r.confidence,
    checkedAt: new Date(r.checked_at), sourceUrl: r.source_url, label: r.label,
  }));
  const own = await query<{ id: string; answers: any; applied: Date | null; approved: Date | null }>(
    "SELECT id, answers, application_submitted_at AS applied, approval_recorded_at AS approved FROM events WHERE venue_jurisdiction_id=$1 AND event_date=$2 AND application_submitted_at IS NOT NULL AND ($3::uuid IS NULL OR id<>$3)", [venueId, date, opts.excludeEventId ?? null]);
  for (const e of own) {
    const base = { startTime: t5(e.answers?.startTime ?? null), endTime: t5(e.answers?.endTime ?? null), attendance: Number(e.answers?.attendance) || null, sourceUrl: null };
    if (e.approved) signals.push({ id: `bmp-a-${e.id}`, type: "BMP_APPROVAL", status: "REPORTED", confidence: "low", checkedAt: new Date(e.approved), ...base });
    else signals.push({ id: `bmp-p-${e.id}`, type: "BMP_APPLICATION", status: "PENDING", confidence: "medium", checkedAt: new Date(e.applied!), ...base });
  }
  const cov = await query<{ authority: Authority; checked_at: Date; outcome: "OK" | "FAILED" }>("SELECT authority, checked_at, outcome FROM venue_official_checks WHERE venue_id=$1 AND covers_from <= $2 AND covers_to >= $2", [venueId, date]);
  const learning = (await venueEvidence(venueId)).filter((e) => e.kind === "OPERATIONAL_LEARNING" || e.kind === "CASE_LAW").map((e) => e.lesson);
  return composeAvailability({
    mode: v.scheduling_mode, startTime, endTime, attendance: opts.attendance ?? null, capacity: v.metadata?.capacity ?? null, signals,
    coverage: cov.map((c): Coverage => ({ authority: c.authority, checkedAt: new Date(c.checked_at), outcome: c.outcome })), now: opts.now ?? new Date(), learning: [...new Set(learning)],
  });
}

export async function listVenueSignals(venueId?: string) {
  return query(`SELECT s.*, s.signal_date::text AS d, j.name AS venue FROM venue_date_signals s JOIN jurisdictions j ON j.id=s.venue_id WHERE ($1::uuid IS NULL OR s.venue_id=$1) ORDER BY s.signal_date DESC, s.created_at DESC LIMIT 200`, [venueId ?? null]);
}
export async function listOfficialChecks() {
  return query(`SELECT c.*, c.covers_from::text AS f, c.covers_to::text AS t, j.name AS venue, s.title AS source FROM venue_official_checks c JOIN jurisdictions j ON j.id=c.venue_id JOIN sources s ON s.id=c.source_id ORDER BY c.checked_at DESC LIMIT 100`);
}
export async function listVenues() {
  return query<{ id: string; name: string; scheduling_mode: SchedulingMode }>("SELECT id, name, scheduling_mode FROM jurisdictions WHERE level='venue' AND archived_at IS NULL ORDER BY name");
}
