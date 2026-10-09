import type { Answers, Rule } from "@/lib/engine/types";

export const baseAnswers: Answers = {
  name: "Test assembly", date: "2026-12-01", startTime: "10:00", endTime: "13:00", attendance: 150, kind: "static",
  startLocation: "Test Park", destination: "", description: "", stage: false, sound: false, vehicles: false, food: false,
  organizerType: "group", organizerName: "Asha Rao", organizerEmail: "asha@example.com", organizerPhone: "",
};

export function rule(over: Partial<Rule> & { id: string }): Rule {
  return {
    jurisdictionId: "j1", authorityName: null, assemblyType: "any", title: over.id, description: "", category: "permissions",
    requirementType: "general", level: "REQUIRED", elseLevel: null, severity: "REQUIRED", condition: { all: [], any: [] },
    completeWhen: null, deadlineDaysBefore: null, deadlineNote: "", officialLink: null, requiredDocuments: [], vendorCategory: null,
    lastVerifiedAt: null, needsReview: true, confidence: "low", ruleOwner: "", adminNotes: "", sources: [], sort: 100, ...over,
  };
}
