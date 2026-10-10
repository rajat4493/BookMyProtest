/**
 * Live-restriction checks for an event. Jurisdiction-agnostic: it looks for sources flagged `feed_role = LIVE_RESTRICTIONS`
 * anywhere in the event's jurisdiction chain. A place with no such feed gets no check (and no claim).
 * A check records what was found and how fresh the feed was; it never asserts that nothing is in force.
 */
import { query } from "./db";
import { composeCheck, type CheckStatus } from "./engine/restriction-check";
import { dueTriggers, zonedToUtc, type ScheduledTrigger } from "./engine/schedule";
import { overlaysFor } from "./engine/select";
import { chainFor, listRestrictions, pendingCandidateCount } from "./knowledge";
import { eventsInWindow, metaForChain, type EventRow } from "./store";

export type TriggerKind = "PLAN_GENERATED" | "RECHECK" | "DOCUMENT_GENERATION" | "T_72H" | "T_24H";

export interface RestrictionCheck {
  id: string; eventId: string; trigger: TriggerKind; checkedAt: string; status: CheckStatus; overlayIds: string[];
  feedTitle: string | null; feedLastCheckedAt: string | null; pendingReview: number; message: string;
}
const map = (r: any): RestrictionCheck => ({
  id: r.id, eventId: r.event_id, trigger: r.trigger_kind, checkedAt: new Date(r.checked_at).toISOString(), status: r.status, overlayIds: r.overlay_ids,
  feedTitle: r.feed_title ?? null, feedLastCheckedAt: r.feed_last_checked_at ? new Date(r.feed_last_checked_at).toISOString() : null, pendingReview: r.pending_review, message: r.message,
});

/** Runs and records one check. Returns null when no live-restriction feed covers the event's place. */
export async function runRestrictionCheck(event: EventRow, trigger: TriggerKind, now = new Date()): Promise<RestrictionCheck | null> {
  const chain = await chainFor(event);
  const feeds = await query<{ id: string; title: string; last_checked_at: Date | null }>(
    "SELECT id, title, last_checked_at FROM sources WHERE feed_role='LIVE_RESTRICTIONS' AND active AND lifecycle='CURRENT' AND jurisdiction_id = ANY($1) ORDER BY last_checked_at DESC NULLS LAST", [chain]);
  if (!feeds.length) return null;
  const feed = feeds[0];
  const overlays = overlaysFor(await listRestrictions(chain), chain, event.date, event.answers);
  const [{ n: openChanges }] = await query<{ n: number }>("SELECT count(*)::int AS n FROM change_events WHERE review_status='PENDING' AND source_id = ANY($1)", [feeds.map((f) => f.id)]);
  const pendingReview = Math.max(openChanges, await pendingCandidateCount(feeds.map((f) => f.id)));
  const { status, message } = composeCheck({ overlayTitles: overlays.map((o) => o.restriction.title), feedTitle: feed.title, feedLastChecked: feed.last_checked_at ? new Date(feed.last_checked_at) : null, pendingReview, now });
  const row = (await query(
    `INSERT INTO restriction_checks (event_id, trigger_kind, checked_at, status, overlay_ids, feed_source_id, feed_last_checked_at, pending_review, message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING *`,
    [event.id, trigger, now, status, overlays.map((o) => o.restriction.id), feed.id, feed.last_checked_at, pendingReview, message]))[0];
  return row ? { ...map(row), feedTitle: feed.title } : null;
}

export async function listChecks(eventId: string, limit = 20): Promise<RestrictionCheck[]> {
  return (await query(`SELECT c.*, s.title AS feed_title FROM restriction_checks c LEFT JOIN sources s ON s.id=c.feed_source_id WHERE c.event_id=$1 ORDER BY c.checked_at DESC, c.id LIMIT $2`, [eventId, limit])).map(map);
}

/** Job entry point: runs T-72h / T-24h checks that have come due. Idempotent (a unique index allows one of each per event). */
export async function runDueEventChecks(now = new Date()): Promise<{ eventId: string; trigger: ScheduledTrigger; recorded: boolean }[]> {
  const out: { eventId: string; trigger: ScheduledTrigger; recorded: boolean }[] = [];
  const horizon = new Date(now.getTime() + 4 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  for (const ev of await eventsInWindow(today, horizon)) {
    const meta = await metaForChain(await chainFor(ev));
    const start = zonedToUtc(ev.date, ev.answers.startTime || "00:00", meta.timezone ?? "UTC");
    const done = new Set((await query<{ t: string }>("SELECT trigger_kind AS t FROM restriction_checks WHERE event_id=$1 AND trigger_kind IN ('T_72H','T_24H')", [ev.id])).map((r) => r.t));
    for (const t of dueTriggers(now, start, done)) {
      const c = await runRestrictionCheck(ev, t, now);
      out.push({ eventId: ev.id, trigger: t, recorded: !!c });
    }
  }
  return out;
}
