/** Constants and pure helpers for public protest pages. No jurisdiction logic; no political categories. */
import type { PermissionStatus } from "./permission";

export const VISIBILITIES = ["DRAFT", "PRIVATE", "UNLISTED", "PUBLIC", "ARCHIVED", "CANCELLED"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const VISIBILITY_HELP: Record<Visibility, string> = {
  DRAFT: "Only you can see it. Not yet published.", PRIVATE: "Only you can see it.", UNLISTED: "Anyone with the link can open it. It is not listed in discovery.",
  PUBLIC: "Listed in discovery and open to everyone.", ARCHIVED: "Hidden. Kept in your account.", CANCELLED: "Open by link with a clear 'cancelled' notice. Not listed.",
};

/** Neutral subject areas. Deliberately not ideological: they describe the topic of a gathering, not a side. */
export const CATEGORIES: Record<string, string> = {
  CIVIL_RIGHTS: "Civil rights", EDUCATION: "Education", ENVIRONMENT: "Environment", LABOUR: "Labour and workers", HEALTH: "Health", HOUSING: "Housing and land",
  GOVERNANCE: "Governance and accountability", PUBLIC_SAFETY: "Public safety", TRANSPORT: "Transport and roads", OTHER: "Other",
};

export type PublicPermission = "NOT_STARTED" | "PREPARING" | "SUBMITTED" | "ACKNOWLEDGED" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "UNKNOWN";
export const PUBLIC_PERMISSION_LABEL: Record<PublicPermission, string> = {
  NOT_STARTED: "Not started — reported by organizer", PREPARING: "Preparing — reported by organizer", SUBMITTED: "Submitted — reported by organizer", ACKNOWLEDGED: "Acknowledged — reported by organizer",
  APPROVED: "Approved — reported by organizer", REJECTED: "Rejected — reported by organizer", WITHDRAWN: "Withdrawn — reported by organizer", UNKNOWN: "Status not provided",
};
export function toPublicPermission(internal: PermissionStatus): PublicPermission {
  switch (internal) {
    case "PREPARED": return "PREPARING";
    case "EXPIRED": return "UNKNOWN"; // we do not publish an inference about an expired permission
    default: return internal as PublicPermission;
  }
}

export const SUPPORT_TYPES: Record<string, string> = {
  ATTEND: "Attend", SHARE: "Share", VOLUNTEER: "Volunteer", TRANSPORT_HELP: "Transport help", WATER_HELP: "Water help", PRINTING_HELP: "Printing help", FIRST_AID_HELP: "First-aid help", OTHER: "Other help",
};
export interface SupportOption { type: string; note: string; link: string }

export const SUPPORT_KINDS = ["FOLLOWING", "INTERESTED", "PLANNING_TO_ATTEND"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];
export const SUPPORT_KIND_LABEL: Record<SupportKind, { off: string; on: string; count: string }> = {
  FOLLOWING: { off: "Follow", on: "Following", count: "following" },
  INTERESTED: { off: "Interested", on: "Interested", count: "interested" },
  PLANNING_TO_ATTEND: { off: "Planning to attend", on: "Planning to attend", count: "planning to attend" },
};

export const MODERATION_REASONS: Record<string, string> = {
  VIOLENCE_OR_THREAT: "Violence or threat", HARASSMENT: "Harassment", DOXXING: "Doxxing or exposing private information", IMPERSONATION: "Impersonation", FRAUD: "Fraud",
  ILLEGAL_CONTENT: "Illegal content", SPAM: "Spam", OTHER: "Other platform-rule reason",
};

/** Personal contact details must not appear in public text. Support-option contact fields are the one place an organizer may choose to publish one. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?\d[\s().-]?){10,}/;
export function screenPublicText(label: string, text: string): string | null {
  if (EMAIL.test(text)) return `${label}: remove email addresses. Public pages never show personal contact details.`;
  if (PHONE.test(text)) return `${label}: remove phone numbers. Public pages never show personal contact details.`;
  return null;
}

export function slugify(title: string): string {
  return title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "protest";
}
export const isListable = (v: Visibility, moderation: string, ownerSuspended: boolean) => v === "PUBLIC" && moderation === "OK" && !ownerSuspended;
