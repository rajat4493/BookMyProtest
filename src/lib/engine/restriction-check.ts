export type CheckStatus = "RESTRICTIONS_APPLY" | "FEED_STALE" | "REVIEW_PENDING" | "NO_RESTRICTION_RECORDED";

export const TRIGGER_LABEL: Record<string, string> = {
  PLAN_GENERATED: "Plan generated", RECHECK: "Plan rechecked", DOCUMENT_GENERATION: "Documents generated", T_72H: "72 hours before", T_24H: "24 hours before",
};

/** How long a daily feed may go unchecked before we stop vouching for it. */
export const FEED_MAX_AGE_HOURS = 36;

const when = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never");

/**
 * Composes the user-facing result of a live-restriction check. Deliberately never says "no restrictions are in force":
 * it says what was recorded, from which feed, when, and that orders can be issued at short notice.
 */
export function composeCheck(i: { overlayTitles: string[]; feedTitle: string; feedLastChecked: Date | null; pendingReview: number; now: Date }): { status: CheckStatus; message: string } {
  if (i.overlayTitles.length > 0) {
    return { status: "RESTRICTIONS_APPLY", message: `${i.overlayTitles.length} temporary restriction${i.overlayTitles.length > 1 ? "s" : ""} may affect your event: ${i.overlayTitles.join("; ")}. Please verify with the relevant authority.` };
  }
  const stale = !i.feedLastChecked || (i.now.getTime() - i.feedLastChecked.getTime()) / 3_600_000 > FEED_MAX_AGE_HOURS;
  if (stale) return { status: "FEED_STALE", message: `We could not confirm the latest orders: the ${i.feedTitle} ${i.feedLastChecked ? `was last checked ${when(i.feedLastChecked)}` : "has not been checked yet"}. Please check it yourself before the event.` };
  if (i.pendingReview > 0) return { status: "REVIEW_PENDING", message: `No temporary restriction is recorded for your date and place, but ${i.pendingReview} new notification${i.pendingReview > 1 ? "s are" : " is"} awaiting review. Please check the ${i.feedTitle} yourself.` };
  return { status: "NO_RESTRICTION_RECORDED", message: `No temporary restriction is recorded for your date and place as of ${when(i.now)}, based on the ${i.feedTitle} (last checked ${when(i.feedLastChecked)}). New orders can be issued at short notice: check again before the event.` };
}
