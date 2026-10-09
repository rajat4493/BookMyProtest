export const LEVELS = ["REQUIRED", "LIKELY_REQUIRED", "RECOMMENDED", "NOT_REQUIRED", "UNKNOWN"] as const;
export type Level = (typeof LEVELS)[number];

export const SEVERITIES = ["CRITICAL", "REQUIRED", "RECOMMENDED"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = ["permissions", "documents", "logistics", "safety"] as const;
export type Category = (typeof CATEGORIES)[number];

export const ASSEMBLY_TYPES = ["any", "static", "march"] as const;
export type AssemblyType = (typeof ASSEMBLY_TYPES)[number];

export const CONFIDENCES = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** Everything the questionnaire collects. Rule conditions read from this, never from UI code. */
export interface Answers {
  name: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  attendance: number;
  kind: "static" | "march";
  startLocation: string;
  destination: string;
  description: string;
  stage: boolean;
  sound: boolean;
  vehicles: boolean;
  food: boolean;
  organizerType: "individual" | "group" | "student" | "ngo" | "union" | "other";
  organizerName: string;
  organizerEmail: string;
  organizerPhone: string;
}

export const OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "present"] as const;
export type Op = (typeof OPS)[number];

/** Fields rules may reference. `march` is derived from `kind`. */
export const CONDITION_FIELDS = [
  "attendance",
  "march",
  "sound",
  "vehicles",
  "stage",
  "food",
  "organizerType",
  "description",
  "organizerName",
  "organizerEmail",
  "organizerPhone",
  "destination",
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export type ClauseValue = string | number | boolean | string[];
export interface Clause {
  field: ConditionField;
  op: Op;
  value?: ClauseValue;
}

/** `all` clauses must all hold, and (if `any` is non-empty) at least one `any` clause must hold. Empty = always. */
export interface Condition {
  all: Clause[];
  any: Clause[];
}

export interface RuleSource {
  id?: string;
  url: string | null;
  title: string;
  retrievedAt: string | null; // YYYY-MM-DD
  notes: string;
}

export interface Rule {
  id: string;
  jurisdictionId: string;
  authorityName: string | null;
  assemblyType: AssemblyType;
  title: string;
  description: string;
  category: Category;
  requirementType: string;
  level: Level;
  elseLevel: Level | null;
  severity: Severity;
  condition: Condition;
  completeWhen: Condition | null;
  deadlineDaysBefore: number | null;
  deadlineNote: string;
  officialLink: string | null;
  requiredDocuments: string[];
  vendorCategory: string | null;
  lastVerifiedAt: string | null;
  needsReview: boolean;
  confidence: Confidence;
  ruleOwner: string;
  adminNotes: string;
  sources: RuleSource[];
  sort: number;
}

export type EvidenceStatus = "verified" | "needs_verification";

export interface EvaluatedItem {
  rule: Rule;
  level: Level;
  evidence: EvidenceStatus;
  autoComplete: boolean;
  done: boolean;
  deadline: string | null; // YYYY-MM-DD, when the rule configures one
}
