/**
 * Organizer identity signals. BookMyProtest does not verify who an organizer is. These signals do two things only:
 *  - stop a page from presenting itself as the platform, and
 *  - queue look-alike or authority-like names for a human to review.
 * A flag is never an automatic penalty and is never shown to the public as an accusation.
 */
export type IdentityFlag = "AUTHORITY_LIKE_NAME" | "LOOKALIKE_NAME";

export const IDENTITY_FLAG_LABEL: Record<IdentityFlag, string> = {
  AUTHORITY_LIKE_NAME: "The name contains a word that a government body, court or police force would use",
  LOOKALIKE_NAME: "The name is the same as, or very close to, another organizer's name",
};

const CONFUSABLE: Record<string, string> = { "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };
/** Lower-case, fold look-alike characters and accents, drop punctuation and spacing. */
export function normalizeName(s: string): string {
  const folded = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return [...folded].map((c) => CONFUSABLE[c] ?? c).join("").replace(/[^a-zऀ-ॿ]/g, "");
}

/** A name that presents the page as the platform itself. These are refused outright. */
export function claimsToBePlatform(name: string): boolean {
  const n = normalizeName(name);
  return /bookmyprotest|bmpteam|bmpofficial|bookmyprotestteam|bookmyprotestofficial/.test(n);
}

const AUTHORITY_WORDS = /\b(police|commissioner|ministry|government|govt|high court|supreme court|election commission|magistrate|municipal|corporation|official|authority|sarkar|\bpm\b|\bcm\b)\b/i;
export function looksLikeAuthority(name: string): boolean {
  return AUTHORITY_WORDS.test(name.normalize("NFKD").replace(/[̀-ͯ]/g, ""));
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** `others` = display names used by OTHER accounts. Short names are only compared for equality (too many false matches otherwise). */
export function identityFlags(name: string, others: string[]): IdentityFlag[] {
  const flags: IdentityFlag[] = [];
  if (looksLikeAuthority(name)) flags.push("AUTHORITY_LIKE_NAME");
  const n = normalizeName(name);
  if (n && others.some((o) => { const m = normalizeName(o); return m === n || (n.length >= 8 && m.length >= 8 && editDistanceAtMostOne(n, m)); })) flags.push("LOOKALIKE_NAME");
  return flags;
}

/** What the public page may say about the organizer. Self-declared name, whether the contact email was confirmed, and the month the account began. */
export interface OrganizerSignals { nameSelfDeclared: true; emailConfirmed: boolean; memberSince: string }
export function signalLines(s: OrganizerSignals): string[] {
  return [
    "Organizer name is self-declared; BookMyProtest has not checked who they are",
    s.emailConfirmed ? "Contact email confirmed" : "Contact email not confirmed",
    `On BookMyProtest since ${new Date(`${s.memberSince}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`,
  ];
}
