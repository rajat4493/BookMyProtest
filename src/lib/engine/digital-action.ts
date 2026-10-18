/**
 * Digital actions: what a campaign may offer, how outcomes are labelled, and which tactics the platform refuses. Pure.
 * No participation count is ever converted into money, damage or impact; no outcome is ever described as verified.
 */
export const ACTION_CATEGORIES: Record<string, { label: string; help: string }> = {
  CONSUMER_PAUSE: { label: "Voluntary purchasing pause", help: "Choosing, for yourself, to pause buying from a named seller for a stated period." },
  POSITIVE_PURCHASING: { label: "Support an alternative", help: "Choosing to buy from or support an alternative provider." },
  SUBSCRIPTION_DECISION: { label: "Subscription or membership decision", help: "Reviewing, pausing or ending a subscription or membership of your own." },
  FEEDBACK_PUBLIC_CHANNEL: { label: "Give feedback through an official channel", help: "One honest message through the organisation's own feedback or grievance route, in your own words." },
  SHARE_SOURCED_INFO: { label: "Share the sourced information", help: "Passing on the cited facts, with the sources, to people who may want them." },
  FOLLOW_DEVELOPMENTS: { label: "Follow developments", help: "Keeping an eye on official responses and updates." },
  SUPPORT_TRANSPARENCY_REQUEST: { label: "Support a transparency request", help: "Backing a public-information or accountability request made through a lawful route." },
};

export const OUTCOME_STATES = ["ACTIVE", "RESPONSE_RECORDED", "PARTIALLY_RESOLVED", "RESOLVED_REPORTED", "DISPUTED", "CLOSED_WITHOUT_RESOLUTION", "ARCHIVED"] as const;
export type OutcomeState = (typeof OUTCOME_STATES)[number];
export const OUTCOME_STATE_LABEL: Record<OutcomeState, string> = {
  ACTIVE: "Active", RESPONSE_RECORDED: "Response recorded", PARTIALLY_RESOLVED: "Partially resolved: reported by organizer", RESOLVED_REPORTED: "Resolved: reported by organizer",
  DISPUTED: "Disputed", CLOSED_WITHOUT_RESOLUTION: "Closed without resolution", ARCHIVED: "Archived",
};
export const OUTCOME_KINDS = { DOCUMENTED_RESPONSE: "Documented response", OBSERVED_OUTCOME: "Observed outcome", UNVERIFIED_CLAIM: "Organizer claim (unverified)" } as const;
export type OutcomeKind = keyof typeof OUTCOME_KINDS;

export interface OutcomeEntry { kind: OutcomeKind; sourceUrl: string; sourceTitle: string }
/** What the page may say about one outcome entry. "Verified" does not exist: no independent verification method is available. */
export function outcomeEvidenceLabel(e: OutcomeEntry): string {
  if (e.kind === "UNVERIFIED_CLAIM") return "Claimed by the organizer. Not independently established.";
  return `Source linked${e.sourceTitle ? `: ${e.sourceTitle}` : ""}. BookMyProtest has not independently verified this.`;
}
/** The line under the state badge. */
export function stateEvidenceNote(state: OutcomeState, entries: OutcomeEntry[]): string {
  const backed = (k: OutcomeKind) => entries.some((e) => e.kind === k && e.sourceUrl);
  switch (state) {
    case "RESPONSE_RECORDED": return backed("DOCUMENTED_RESPONSE") ? "A source-backed response is recorded below. A response is not a change." : "No source-backed response is recorded.";
    case "PARTIALLY_RESOLVED": case "RESOLVED_REPORTED":
      return backed("OBSERVED_OUTCOME") ? "Reported by the organizer; a source for the observed change is linked below. BookMyProtest has not independently verified it." : "Reported by the organizer. No independent evidence has been recorded.";
    case "DISPUTED": return "Claims on this page are disputed. See the corrections and sources below.";
    case "CLOSED_WITHOUT_RESOLUTION": return "The organizer closed this campaign without a recorded resolution.";
    default: return "";
  }
}
export function validateOutcomeEntry(e: { kind: string; body: string; sourceUrl: string; sourceTitle: string }): string | null {
  if (!(e.kind in OUTCOME_KINDS)) return "Choose what kind of entry this is.";
  if (e.body.trim().length < 10 || e.body.length > 1000) return "Describe it in 10 to 1000 characters.";
  if (e.kind !== "UNVERIFIED_CLAIM") {
    if (!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(e.sourceUrl)) return "A documented response or observed outcome needs an https link to its source.";
    if (!e.sourceTitle.trim()) return "Name the source.";
  }
  return null;
}

/**
 * Tactics the platform does not host. A text screen is a first line only: moderation by people is the backstop.
 * It also refuses estimates of financial harm, because participation counts cannot establish impact.
 */
const REFUSED: [RegExp, string][] = [
  [/\bdox+(ing|ed|x)?\b|home address|where (he|she|they) live/i, "Do not publish or hunt for anyone's private details."],
  [/fake (reviews?|ratings?)|review[- ]?bomb|rating bomb|paid reviews?/i, "Fake or coordinated reviews are not allowed."],
  [/\bspam\b|flood(ing)? (their|the|his|her)|bombard|mass[- ]?(email|message|call|tweet|dm|report)s?|(call|email|message|tweet) (them|him|her) (all day|nonstop|repeatedly)/i, "Do not encourage floods of messages or calls."],
  [/harass|threat(en|s)\b|intimidat|stalk|abuse (the )?(staff|employees|workers)/i, "Do not encourage harassment, threats or intimidation."],
  [/(block(ade)?|obstruct|disrupt|occupy|shut ?down|picket)\s+((the|their|its|his|her)\s+)?(store|shop|outlet|office|branch|operations|workers?|employees?|staff)/i, "Do not encourage obstruction or interference with a business or its staff."],
  [/\b(bots?|automated|auto-?post|script(ed)?)\b[^.]{0,40}\b(post|message|review|vote|report|email|tweet)/i, "Automated or scripted participation is not allowed."],
  [/(bankrupt|ruin|destroy|cripple|crash|drain)\b[^.]{0,30}\b(company|business|brand|revenue|profit|sales|stock|share ?price)/i, "Campaigns here ask for a specific change; they are not designed to damage a business."],
  [/(cost|costing|lost|loss of|wiped)[^.]{0,20}(₹|\brs\.?|\binr\b|\$|\busd\b|\d[\d,.]*\s*(crore|lakh|million|billion))|\b(estimated|projected)\s+(loss|damage|revenue)/i, "Do not estimate financial impact from participation. If an impact is externally documented, cite the source in an update."],
];
export function screenCampaignText(label: string, text: string): string | null {
  for (const [re, msg] of REFUSED) if (re.test(text)) return `${label}: ${msg}`;
  return null;
}

export interface CampaignDraft {
  title: string; summary: string; requestedChange: string; institution: string; closureCriteria: string; organizerDisplayName: string;
  startsOn: string | null; reviewOn: string | null; evidence: { claim: string; sourceTitle: string; sourceUrl: string }[];
  actions: { category: string; label: string; detail: string; link: string }[];
}
const https = (u: string | null | undefined) => !!u && /^https:\/\/[^\s/]+\.[^\s/]+/i.test(u);
const iso = /^\d{4}-\d{2}-\d{2}$/;

/** Problems that block saving at all (content rules). */
export function contentProblems(c: CampaignDraft): string[] {
  const p: string[] = [];
  const texts: [string, string][] = [["Title", c.title], ["Summary", c.summary], ["Requested change", c.requestedChange], ["Closure criteria", c.closureCriteria], ["Institution", c.institution],
    ...c.evidence.map((e, n): [string, string] => [`Evidence ${n + 1}`, e.claim]), ...c.actions.flatMap((a, n): [string, string][] => [[`Action ${n + 1}`, a.label], [`Action ${n + 1} detail`, a.detail]])];
  for (const [l, t] of texts) { const m = screenCampaignText(l, t); if (m) p.push(m); }
  return p;
}
/** Problems that block publishing (completeness rules). A draft may be incomplete. */
export function publishProblems(c: CampaignDraft): string[] {
  const p = [...contentProblems(c)];
  if (c.title.trim().length < 8) p.push("A descriptive title is required.");
  if (c.summary.trim().length < 20) p.push("A short summary is required.");
  if (c.requestedChange.trim().length < 20) p.push("State the specific change being requested.");
  if (!c.closureCriteria.trim() || c.closureCriteria.trim().length < 20) p.push("State what would count as success or closure.");
  if (!c.startsOn || !iso.test(c.startsOn)) p.push("Choose a start date.");
  if (!c.reviewOn || !iso.test(c.reviewOn)) p.push("Choose a review date.");
  else if (c.startsOn && c.reviewOn <= c.startsOn) p.push("The review date must be after the start date.");
  if (!c.actions.length) p.push("Offer at least one action from the list.");
  c.actions.forEach((a, n) => { if (!ACTION_CATEGORIES[a.category]) p.push(`Action ${n + 1}: choose a type.`); if (a.label.trim().length < 5) p.push(`Action ${n + 1}: describe the action.`); if (a.link && !https(a.link)) p.push(`Action ${n + 1}: the link must be https.`); });
  if (!c.evidence.length) p.push("Add at least one cited fact the campaign relies on.");
  c.evidence.forEach((e, n) => { if (!e.claim.trim() || !e.sourceTitle.trim() || !https(e.sourceUrl)) p.push(`Evidence ${n + 1}: needs the claim, a source title and an https link.`); });
  if (c.institution.trim() && !c.evidence.length) p.push("A campaign that names an institution must cite the facts it states about it.");
  return p;
}
