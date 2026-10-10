/** Police-permission lifecycle. Pure. APPROVED is only ever reached by a person recording it: nothing here (or anywhere) infers it. */
export const PERMISSION_STATUSES = ["NOT_STARTED", "PREPARED", "SUBMITTED", "ACKNOWLEDGED", "APPROVED", "REJECTED", "WITHDRAWN", "EXPIRED"] as const;
export type PermissionStatus = (typeof PERMISSION_STATUSES)[number];
export const SUBMISSION_METHODS = ["IN_PERSON", "POST", "EMAIL", "ONLINE", "OTHER"] as const;
export type SubmissionMethod = (typeof SUBMISSION_METHODS)[number];

export const PERMISSION_LABEL: Record<PermissionStatus, string> = {
  NOT_STARTED: "Not started", PREPARED: "Application prepared", SUBMITTED: "Submitted", ACKNOWLEDGED: "Acknowledged", APPROVED: "Approved", REJECTED: "Rejected", WITHDRAWN: "Withdrawn", EXPIRED: "Expired",
};
export const METHOD_LABEL: Record<SubmissionMethod, string> = { IN_PERSON: "In person", POST: "By post", EMAIL: "By email", ONLINE: "Online", OTHER: "Other" };

const NEXT: Record<PermissionStatus, PermissionStatus[]> = {
  NOT_STARTED: ["PREPARED", "SUBMITTED"],
  PREPARED: ["SUBMITTED", "WITHDRAWN", "NOT_STARTED"],
  SUBMITTED: ["ACKNOWLEDGED", "APPROVED", "REJECTED", "WITHDRAWN", "EXPIRED", "PREPARED"],
  ACKNOWLEDGED: ["APPROVED", "REJECTED", "WITHDRAWN", "EXPIRED"],
  APPROVED: ["WITHDRAWN", "EXPIRED"],
  REJECTED: ["PREPARED", "SUBMITTED"],
  WITHDRAWN: ["PREPARED", "SUBMITTED"],
  EXPIRED: ["PREPARED", "SUBMITTED"],
};
export const nextStatuses = (from: PermissionStatus): PermissionStatus[] => NEXT[from];
/** Statuses that mean "the application is with the authority". */
export const IS_APPLIED: ReadonlySet<PermissionStatus> = new Set(["SUBMITTED", "ACKNOWLEDGED", "APPROVED"]);

export interface PermissionRecord {
  status: PermissionStatus; occurredAt: string | null; method: SubmissionMethod | null; reference: string; evidenceRef: string; approvalDate: string | null; conditions: string; recordedAt: string;
}

/** Returns an error message, or null if recording `to` (with these details) after `from` is acceptable. */
export function validateTransition(from: PermissionStatus, to: PermissionStatus, d: { occurredAt?: string | null; approvalDate?: string | null; today: string }): string | null {
  if (from === to) return `The application is already "${PERMISSION_LABEL[to]}".`;
  if (!NEXT[from].includes(to)) return `From "${PERMISSION_LABEL[from]}" you can record: ${NEXT[from].map((s) => PERMISSION_LABEL[s]).join(", ")}.`;
  if (to === "SUBMITTED" && !d.occurredAt) return "Enter when you submitted the application.";
  if (to === "APPROVED") {
    if (!d.approvalDate) return "Enter the approval date from the permission itself. We never mark permission approved for you.";
    if (d.approvalDate > d.today) return "The approval date cannot be in the future.";
  }
  return null;
}
