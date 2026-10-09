export const LEVELS = ["REQUIRED", "LIKELY_REQUIRED", "RECOMMENDED", "NOT_REQUIRED", "UNKNOWN"] as const;
export type Level = (typeof LEVELS)[number];

export const SEVERITIES = ["CRITICAL", "REQUIRED", "RECOMMENDED"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = ["permissions", "documents", "logistics", "safety"] as const;
export type Category = (typeof CATEGORIES)[number];

export const RULE_STATUSES = ["DRAFT", "UNDER_REVIEW", "ACTIVE", "CHANGE_DETECTED", "SUPERSEDED", "ARCHIVED"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const INHERITANCE_MODES = ["ADD", "OVERRIDE", "EXCLUDE"] as const;
export type InheritanceMode = (typeof INHERITANCE_MODES)[number];

/** Evidence hierarchy, strongest first. SECONDARY_LEAD can never verify a rule on its own. */
export const SOURCE_TYPES = ["PRIMARY_LAW", "BINDING_CASE_LAW", "OFFICIAL_ADMINISTRATIVE_RULE", "OFFICIAL_CURRENT_PRACTICE", "SECONDARY_LEAD"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const EVIDENCE_STRENGTHS = ["PRIMARY", "SUPPORTING", "LEAD"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

/** What the user is told about how fresh/trustworthy a requirement is. */
export type Freshness = "CURRENT" | "VERIFY_REQUIRED" | "CHANGE_UNDER_REVIEW" | "UNKNOWN" | "SUPERSEDED";

export interface DeadlineDef {
  kind: "STRUCTURED" | "UNKNOWN" | "NO_PUBLISHED_DEADLINE_FOUND";
  minimumDaysBeforeEvent?: number | null;
  maximumDaysBeforeEvent?: number | null;
  dayType?: "CALENDAR" | "BUSINESS";
  cutoffTime?: string | null;
  specialNotes?: string;
}

/**
 * How firmly the rule's content is established:
 * PRIMARY_VERIFIED = taken directly from a primary/official instrument (a human has checked it against the source);
 * OFFICIAL_GUIDANCE = official current practice/guidance, not a binding instrument;
 * UNVERIFIED = anything else. Only the first two can ever render as current verified guidance.
 */
export const LEGAL_CERTAINTIES = ["PRIMARY_VERIFIED", "OFFICIAL_GUIDANCE", "UNVERIFIED"] as const;
export type LegalCertainty = (typeof LEGAL_CERTAINTIES)[number];

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
  sourceId?: string;
  sourceType?: SourceType;
  strength?: EvidenceStrength;
  url: string | null;
  title: string;
  retrievedAt: string | null; // YYYY-MM-DD
  notes: string;
  excerpt?: string;
  sectionRef?: string;
  flagOnChange?: boolean;
}

export interface Rule {
  id: string;
  /** Stable across versions, e.g. DEL-JM-001. */
  ruleFamilyId: string;
  version: number;
  status: RuleStatus;
  legalCertainty: LegalCertainty;
  effectiveFrom: string | null;
  effectiveUntil: string | null; // exclusive
  supersedesRuleId: string | null;
  inheritanceMode: InheritanceMode;
  overridesFamilyId: string | null;
  /** Legal fact, kept separate from the plain-English explanation (`description`) and the product action. */
  legalStatement: string;
  userAction: string;
  submissionMethod: string;
  deadline: DeadlineDef;
  reviewedAt: string | null;
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
  deadline: string | null; // YYYY-MM-DD, when the rule configures a structured one
  freshness: Freshness;
  /** Temporary restrictions overlaying this item (ids). */
  restrictedBy: string[];
}

export type RestrictionEffect = "PROHIBITED" | "RESTRICTED" | "CONDITIONAL";
export interface TemporaryRestriction {
  id: string;
  jurisdictionId: string;
  title: string;
  geographicScope: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  legalBasis: string;
  affectedActivities: string[]; // ASSEMBLY, MARCH, SOUND, STAGE, VEHICLES, FOOD, ALL
  effect: RestrictionEffect;
  plainExplanation: string;
  sourceId: string | null;
  status: "DRAFT" | "ACTIVE" | "EXPIRED" | "ARCHIVED";
}
export interface RestrictionOverlay {
  restriction: TemporaryRestriction;
  matchedActivities: string[];
}
