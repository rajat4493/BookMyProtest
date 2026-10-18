/**
 * Find Your Hill: issue catalogue rules. Pure.
 * An issue page informs; it never takes a side. Publishing needs evidence, a statement of what is unknown, and a check date, and only a human publishes.
 */
export const ISSUE_CATEGORIES: Record<string, string> = {
  ENVIRONMENT: "Environment", TRANSPORT: "Transport", EDUCATION: "Education", HEALTHCARE: "Healthcare", CONSUMER_RIGHTS: "Consumer rights",
  CIVIC_INFRASTRUCTURE: "Civic infrastructure", EMPLOYMENT: "Employment", PUBLIC_SERVICES: "Public services", ECONOMY: "Economy", OTHER: "Other",
};
export const SCOPE_LEVELS = { LOCAL: "Local", STATE: "State", NATIONAL: "Nationwide" } as const;
export type ScopeLevel = keyof typeof SCOPE_LEVELS;

export const SOURCE_KINDS: Record<string, { label: string; weight: number }> = {
  OFFICIAL_RECORD: { label: "Official record", weight: 3 },
  RESEARCH: { label: "Research or audit", weight: 2 },
  INDEPENDENT_REPORTING: { label: "Independent reporting", weight: 2 },
  ORGANIZATION_STATEMENT: { label: "Statement by an involved party", weight: 1 },
};
/** Documented source quality: used for ordering and nothing else. Never a measure of whether the issue is "right". */
export const sourceQuality = (kinds: string[]): number => kinds.reduce((n, k) => n + (SOURCE_KINDS[k]?.weight ?? 0), 0);

export interface IssueSourceIn { kind: string; title: string; url: string; publisher?: string; publishedOn?: string | null; note?: string }
export interface PerspectiveIn { label: string; summary: string; sourceUrl?: string }
export interface DisputedClaimIn { claim: string; dispute: string; sourceUrl?: string }
export interface DevelopmentIn { date: string; text: string; sourceTitle: string; sourceUrl: string }
export interface IssueDraft {
  title: string; summary: string; description: string; whyDiscussed: string; scopeLevel: string; city: string; state: string; category: string;
  perspectives: PerspectiveIn[]; disputedClaims: DisputedClaimIn[]; developments: DevelopmentIn[]; unknowns: string; lastCheckedOn: string | null;
}

export const isHttps = (u: string | null | undefined) => !!u && /^https:\/\/[^\s/]+\.[^\s/]+/i.test(u);
const iso = /^\d{4}-\d{2}-\d{2}$/;

/** Words that make a title an advocacy slogan or an accusation rather than a neutral description. */
const LOADED_TITLE = /\b(scam|corrupt(ion)?|criminal|fraudster|thieves|shameful|disgrace|exposed|betray(al|ed)?|crooks?|murderers?|evil|stop the|boycott|ban the|down with)\b/i;
export function neutralTitleProblem(title: string): string | null {
  return LOADED_TITLE.test(title) ? "Use a neutral descriptive title (what the issue is), not a slogan, accusation or call to action." : null;
}

/** What still blocks publication. Empty = may be published by a human reviewer. */
export function publishProblems(i: IssueDraft, sources: IssueSourceIn[]): string[] {
  const p: string[] = [];
  if (i.title.trim().length < 8) p.push("A descriptive title is required.");
  const t = neutralTitleProblem(i.title); if (t) p.push(t);
  if (i.summary.trim().length < 20) p.push("A short factual summary is required.");
  if (i.description.trim().length < 40) p.push("A factual description is required.");
  if (i.whyDiscussed.trim().length < 20) p.push("Say why the issue is being discussed.");
  if (!ISSUE_CATEGORIES[i.category]) p.push("Choose a category.");
  if (i.scopeLevel === "LOCAL" && !i.city.trim()) p.push("A local issue needs a city.");
  if (i.scopeLevel !== "NATIONAL" && !i.state.trim()) p.push("A local or state issue needs a state.");
  if (!sources.length) p.push("At least one source with an https link is required.");
  sources.forEach((s, n) => {
    if (!SOURCE_KINDS[s.kind]) p.push(`Source ${n + 1}: choose a source type.`);
    if (!s.title.trim()) p.push(`Source ${n + 1}: add the title of the document or article.`);
    if (!isHttps(s.url)) p.push(`Source ${n + 1}: the link must be an https URL.`);
  });
  if (sources.length && !sources.some((s) => s.kind !== "ORGANIZATION_STATEMENT")) p.push("At least one source must be independent of the parties involved (an official record, research or independent reporting).");
  if (i.unknowns.trim().length < 10) p.push("State what remains unknown or unestablished.");
  if (!i.lastCheckedOn || !iso.test(i.lastCheckedOn)) p.push("Record the date the information was last checked.");
  i.perspectives.forEach((x, n) => { if (!x.label.trim() || x.summary.trim().length < 10) p.push(`Perspective ${n + 1}: needs a label and a summary.`); if (x.sourceUrl && !isHttps(x.sourceUrl)) p.push(`Perspective ${n + 1}: the source link must be https.`); });
  i.disputedClaims.forEach((x, n) => { if (!x.claim.trim() || !x.dispute.trim()) p.push(`Disputed claim ${n + 1}: state the claim and what is disputed.`); if (x.sourceUrl && !isHttps(x.sourceUrl)) p.push(`Disputed claim ${n + 1}: the source link must be https.`); });
  i.developments.forEach((x, n) => { if (!iso.test(x.date) || !x.text.trim() || !isHttps(x.sourceUrl) || !x.sourceTitle.trim()) p.push(`Development ${n + 1}: needs a date, text, and a titled https source.`); });
  return p;
}

/** Admin editor line formats (compact, human-edited): "a | b | c". */
const cut = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split("|").map((x) => x.trim()));
export const parseSources = (text: string): IssueSourceIn[] => cut(text).map(([kind, title, url, publisher, publishedOn]) => ({ kind: (kind ?? "").toUpperCase(), title: title ?? "", url: url ?? "", publisher: publisher ?? "", publishedOn: iso.test(publishedOn ?? "") ? publishedOn : null }));
export const parsePerspectives = (text: string): PerspectiveIn[] => cut(text).map(([label, summary, sourceUrl]) => ({ label: label ?? "", summary: summary ?? "", sourceUrl: sourceUrl ?? "" }));
export const parseDisputed = (text: string): DisputedClaimIn[] => cut(text).map(([claim, dispute, sourceUrl]) => ({ claim: claim ?? "", dispute: dispute ?? "", sourceUrl: sourceUrl ?? "" }));
export const parseDevelopments = (text: string): DevelopmentIn[] => cut(text).map(([date, t, sourceTitle, sourceUrl]) => ({ date: date ?? "", text: t ?? "", sourceTitle: sourceTitle ?? "", sourceUrl: sourceUrl ?? "" }));

export const slugifyIssue = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "issue";

/** Pure ranking for search results: relevance, then place match, then recency, then documented source quality. No personalisation, no popularity, no belief signal. */
export interface RankInput { rank: number; placeMatch: boolean; checkedOn: string | null; quality: number }
export function compareRank(a: RankInput, b: RankInput): number {
  return (b.rank - a.rank) || (Number(b.placeMatch) - Number(a.placeMatch)) || ((b.checkedOn ?? "").localeCompare(a.checkedOn ?? "")) || (b.quality - a.quality);
}
