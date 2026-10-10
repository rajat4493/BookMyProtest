import type { Answers } from "./types";

/** Fields whose change can alter what an authority approved, with the words we use for them. */
const LABELS: Record<string, string> = {
  attendance: "expected crowd", description: "purpose", speakers: "speakers or VIPs", startLocation: "route", destination: "route",
  trafficFootprint: "route or traffic footprint", kind: "the nature of the event (march or static)", sound: "sound", stage: "stage or structures", vehicles: "vehicles", buses: "vehicles",
};
const MATERIAL_FIELDS = ["description", "speakers", "startLocation", "destination", "trafficFootprint", "kind", "sound", "stage", "vehicles", "buses"] as const;
/** A relative change in expected attendance at or above this counts as material. */
export const ATTENDANCE_CHANGE_RATIO = 0.2;

const norm = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").toLowerCase() : v ?? "");

export interface ChangeSummary { changedFields: string[]; material: boolean; materialLabels: string[] }

export function detectChanges(before: Answers, after: Answers): ChangeSummary {
  const keys = ["attendance", ...MATERIAL_FIELDS, "promoStatus", "food", "organizerType", "organizerName", "organizerEmail", "organizerPhone"] as const;
  const changedFields = keys.filter((k) => norm((before as any)[k]) !== norm((after as any)[k]));
  const labels = new Set<string>();
  for (const k of changedFields) {
    if ((MATERIAL_FIELDS as readonly string[]).includes(k)) labels.add(LABELS[k]);
    if (k === "attendance") {
      const b = Number(before.attendance), a = Number(after.attendance);
      if (b > 0 && Math.abs(a - b) / b >= ATTENDANCE_CHANGE_RATIO) labels.add(LABELS.attendance);
    }
  }
  return { changedFields: [...changedFields], material: labels.size > 0, materialLabels: [...labels] };
}
