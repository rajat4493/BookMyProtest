/**
 * Provenance: where a publicly shown fact comes from. Pure.
 * An organizer's claim is never presented as BookMyProtest-verified; a calculated date always says what it was calculated from.
 */
export const PROVENANCE_CLASSES = ["ORGANIZER_PROVIDED", "BOOKMYPROTEST_SOURCE_CHECKED", "OFFICIAL_SOURCE_LINK", "SYSTEM_DERIVED", "UNKNOWN"] as const;
export type ProvenanceClass = (typeof PROVENANCE_CLASSES)[number];

export interface Provenance {
  cls: ProvenanceClass;
  /** YYYY-MM-DD or ISO: when the organizer last updated it / when we last checked the source. */
  asOf?: string | null;
  /** Wording for ORGANIZER_PROVIDED: "Reported by organizer" (a status) vs "Provided by organizer" (a description). */
  reported?: boolean;
  source?: { title: string; url?: string | null; section?: string | null } | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const shortDate = (d?: string | null): string => {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]}` : "";
};

/** The small label shown under a fact. Deterministic; the text is the contract, tests pin it. */
export function provenanceLabel(p: Provenance): string {
  const when = shortDate(p.asOf);
  switch (p.cls) {
    case "ORGANIZER_PROVIDED": return `${p.reported ? "Reported by organizer" : "Provided by organizer"}${when ? ` · updated ${when}` : ""}`;
    case "BOOKMYPROTEST_SOURCE_CHECKED": return `Official information checked on ${when || "an earlier date"}${p.source ? ` · ${p.source.title}${p.source.section ? `, ${p.source.section}` : ""}` : ""}`;
    case "OFFICIAL_SOURCE_LINK": return `Link to official source${p.source ? ` · ${p.source.title}` : ""}`;
    case "SYSTEM_DERIVED": return `Calculated${p.source ? ` from ${p.source.title}${p.source.section ? `, ${p.source.section}` : ""}` : " by BookMyProtest"}`;
    default: return "Source not stated";
  }
}
/** Only these classes may ever be described as checked by BookMyProtest. */
export const isBmpChecked = (p: Provenance) => p.cls === "BOOKMYPROTEST_SOURCE_CHECKED" || p.cls === "SYSTEM_DERIVED";
