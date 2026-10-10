/**
 * Venue date-conflict composition. Pure: no database, no venue- or city-specific logic.
 *
 * It can say "conflict confirmed", "other events known", "no conflict found", "shared venue" or "official status unknown".
 * It can NEVER say "available": absence of a record is not evidence of availability, so that state does not exist here.
 */
export const SCHEDULING_MODES = ["EXCLUSIVE", "SHARED_CAPACITY", "AUTHORITY_MANAGED", "UNKNOWN"] as const;
export type SchedulingMode = (typeof SCHEDULING_MODES)[number];

export const SIGNAL_TYPES = ["OFFICIAL_BOOKING", "POLICE_APPROVAL", "POLICE_APPLICATION", "PUBLIC_EVENT_NOTICE", "BMP_APPLICATION", "BMP_APPROVAL"] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];
export const EVENT_STATUSES = ["CONFIRMED", "PENDING", "REPORTED", "CANCELLED", "REJECTED"] as const;
export type SignalStatus = (typeof EVENT_STATUSES)[number];

export type AvailabilityState = "CONFLICT_CONFIRMED" | "OTHER_EVENTS_KNOWN" | "NO_CONFLICT_FOUND" | "SHARED_CAPACITY" | "OFFICIAL_STATUS_UNKNOWN";
export type Authority = "BOOKING" | "POLICE";

export interface Signal {
  id: string; type: SignalType; status: SignalStatus; startTime: string | null; endTime: string | null; attendance: number | null;
  confidence: "low" | "medium" | "high"; checkedAt: Date; sourceUrl: string | null; label?: string;
}
export interface Coverage { authority: Authority; checkedAt: Date; outcome: "OK" | "FAILED" }

export const COVERAGE_MAX_AGE_DAYS = 7;
export const MODE_AUTHORITIES: Record<SchedulingMode, Authority[]> = { EXCLUSIVE: ["BOOKING"], AUTHORITY_MANAGED: ["BOOKING", "POLICE"], SHARED_CAPACITY: ["POLICE"], UNKNOWN: [] };
const AUTHORITY_OF: Partial<Record<SignalType, Authority>> = { OFFICIAL_BOOKING: "BOOKING", POLICE_APPROVAL: "POLICE", POLICE_APPLICATION: "POLICE" };
const AUTHORITY_LABEL: Record<Authority, string> = { BOOKING: "the booking authority", POLICE: "the police" };

export const SIGNAL_LABEL: Record<SignalType, string> = {
  OFFICIAL_BOOKING: "Official booking", POLICE_APPROVAL: "Police approval", POLICE_APPLICATION: "Police application", PUBLIC_EVENT_NOTICE: "Public report", BMP_APPLICATION: "Application", BMP_APPROVAL: "Approval reported",
};

/** Where a signal came from, in words the user can weigh. BookMyProtest's own knowledge is never presented as government data. */
export function originOf(s: Pick<Signal, "type" | "confidence">): string {
  if (s.type === "BMP_APPLICATION" || s.type === "BMP_APPROVAL") return "Known to BookMyProtest";
  if (s.type === "PUBLIC_EVENT_NOTICE") return "Public report (unverified, low confidence)";
  return "Official source";
}

export interface SignalView { type: SignalType; label: string; status: SignalStatus; origin: string; window: string; attendance: number | null; confidence: string; sourceUrl: string | null }
export interface AuthorityStatus { authority: Authority; status: "CONFLICT" | "ENTRIES" | "NONE_FOUND" | "UNKNOWN"; checkedAt: string | null }
export interface Availability {
  state: AvailabilityState; tone: "warn" | "info"; headline: string; message: string; mode: SchedulingMode;
  confirmed: SignalView[]; others: SignalView[]; authorities: AuthorityStatus[]; notes: string[];
}

const hm = (t: string | null) => (t ? t.slice(0, 5) : null);
function overlaps(a: { s: string | null; e: string | null }, b: { s: string | null; e: string | null }): boolean {
  if (!a.s || !a.e || !b.s || !b.e) return true; // an untimed signal is treated as the whole day
  return a.s < b.e && b.s < a.e;
}
const view = (s: Signal): SignalView => ({
  type: s.type, label: SIGNAL_LABEL[s.type], status: s.status, origin: originOf(s), attendance: s.attendance, confidence: s.confidence, sourceUrl: s.sourceUrl,
  window: hm(s.startTime) && hm(s.endTime) ? `${hm(s.startTime)}–${hm(s.endTime)}` : "time not stated",
});
/** Only an official booking or police approval, marked confirmed and not low-confidence, can confirm a conflict. */
export const isConfirmedConflict = (s: Signal) => (s.type === "OFFICIAL_BOOKING" || s.type === "POLICE_APPROVAL") && s.status === "CONFIRMED" && s.confidence !== "low";

export function composeAvailability(i: {
  mode: SchedulingMode; startTime: string; endTime: string; attendance?: number | null; capacity?: number | null;
  signals: Signal[]; coverage: Coverage[]; now: Date; learning?: string[];
}): Availability {
  const live = i.signals.filter((s) => s.status !== "CANCELLED" && s.status !== "REJECTED" && overlaps({ s: i.startTime, e: i.endTime }, { s: hm(s.startTime), e: hm(s.endTime) }));
  const confirmed = live.filter(isConfirmedConflict);
  const others = live.filter((s) => !isConfirmedConflict(s));
  const fresh = (c: Coverage) => c.outcome === "OK" && (i.now.getTime() - c.checkedAt.getTime()) / 86_400_000 <= COVERAGE_MAX_AGE_DAYS;
  const required = MODE_AUTHORITIES[i.mode];

  const authorities: AuthorityStatus[] = required.map((a) => {
    const mine = live.filter((s) => AUTHORITY_OF[s.type] === a);
    const cov = i.coverage.filter((c) => c.authority === a && fresh(c)).sort((x, y) => y.checkedAt.getTime() - x.checkedAt.getTime())[0];
    const status = mine.some(isConfirmedConflict) ? "CONFLICT" : mine.length ? "ENTRIES" : cov ? "NONE_FOUND" : "UNKNOWN";
    return { authority: a, status, checkedAt: cov ? cov.checkedAt.toISOString() : null };
  });
  const base = { mode: i.mode, confirmed: confirmed.map(view), others: others.map(view), authorities, notes: [] as string[] };
  const notes = base.notes;
  if (i.learning?.length) notes.push(...i.learning);
  if (i.mode === "AUTHORITY_MANAGED") {
    const hasHit = authorities.some((a) => a.status === "CONFLICT" || a.status === "ENTRIES");
    const hasClear = authorities.some((a) => a.status === "NONE_FOUND");
    if (hasHit && (hasClear || authorities.some((a) => a.status === "UNKNOWN"))) notes.push("The authorities show different pictures for this date. A clear position from one does not establish it for the other.");
  }
  if (others.some((s) => s.type === "BMP_APPLICATION" || s.type === "BMP_APPROVAL")) notes.push("“Known to BookMyProtest” means plans of BookMyProtest users only. It is not complete government data.");
  if (others.some((s) => s.type === "PUBLIC_EVENT_NOTICE")) notes.push("Public reports are low-confidence leads, not official availability.");

  if (i.mode === "SHARED_CAPACITY") {
    const known = [...confirmed, ...others];
    const total = known.reduce((n, s) => n + (s.attendance ?? 0), 0) + (i.attendance ?? 0);
    if (known.length && i.capacity && total > i.capacity) notes.push(`Together, the expected attendance known for this date (${total}) may exceed the venue's stated limit of ${i.capacity}.`);
    return {
      ...base, state: "SHARED_CAPACITY", tone: known.length ? "warn" : "info", headline: "Shared venue",
      message: known.length
        ? `This venue is shared. ${known.length} other event${known.length > 1 ? "s are" : " is"} known for this date. That does not block your date, but your permission still depends on the authority and any capacity limit.`
        : "This venue is shared between events, so a date is not reserved to one organiser. No other event is known to us for this date. That is not confirmation of anything: your permission still comes from the authority.",
    };
  }
  if (confirmed.length) {
    return { ...base, state: "CONFLICT_CONFIRMED", tone: "warn", headline: "Conflict confirmed", message: `An official source shows another confirmed booking or approval for this venue on this date${confirmed.length > 1 ? " (several)" : ""}. Consider another date, or ask the authority directly.` };
  }
  if (others.length) {
    return { ...base, state: "OTHER_EVENTS_KNOWN", tone: "warn", headline: "Other events known", message: `${others.length} other event${others.length > 1 ? "s are" : " is"} known for this venue on this date, none confirmed by an official source. This is not a confirmed conflict, and not a confirmation that the date is free. Check with the authority.` };
  }
  const unknown = authorities.filter((a) => a.status === "UNKNOWN");
  if (i.mode === "UNKNOWN" || unknown.length) {
    const who = i.mode === "UNKNOWN" ? "this venue's booking arrangement is not known to us" : `we have not checked an official source for ${unknown.map((a) => AUTHORITY_LABEL[a.authority]).join(" and ")}`;
    return { ...base, state: "OFFICIAL_STATUS_UNKNOWN", tone: "info", headline: "Official status unknown", message: `We cannot tell whether this date is taken: ${who}. Please confirm with the relevant authority before you plan around this date.` };
  }
  const when = authorities.map((a) => a.checkedAt).filter((x): x is string => !!x).sort()[0]!;
  return { ...base, state: "NO_CONFLICT_FOUND", tone: "info", headline: "No conflict found", message: `No conflict was found in the official sources we checked (oldest check ${when.slice(0, 10)}). This is not confirmation that the date is free: only the authority can confirm that.` };
}
