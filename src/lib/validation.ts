import { z } from "zod";
import { PROMO_STATUSES, type Answers } from "./engine/types";

const text = (max: number) => z.string().trim().max(max);
const bool = z.preprocess((v) => v === true || v === "true" || v === "on" || v === "1", z.boolean());
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 16:30");

export const answersSchema = z
  .object({
    name: text(120).min(2, "Give your event a name"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    startTime: time,
    endTime: time,
    attendance: z.coerce.number().int().min(1, "Enter at least 1").max(1_000_000),
    kind: z.enum(["static", "march"]),
    startLocation: text(300).min(3, "Where does it start?"),
    destination: text(300).default(""),
    description: text(1000).default(""),
    stage: bool,
    sound: bool,
    vehicles: bool,
    food: bool,
    organizerType: z.enum(["individual", "group", "student", "ngo", "union", "other"]),
    organizerName: text(120).min(2, "Organizer name is required"),
    organizerEmail: z.string().trim().email("Enter a valid email").max(200),
    organizerPhone: text(40).default(""),
    speakers: text(500).default(""),
    promoStatus: z.enum(PROMO_STATUSES).default("NONE"),
    trafficFootprint: text(500).default(""),
    buses: z.coerce.number().int().min(0).max(1000).default(0),
  })
  .superRefine((a, ctx) => {
    if (a.kind === "march" && a.destination.length < 3) ctx.addIssue({ code: "custom", path: ["destination"], message: "Where does the march end?" });
    if (a.endTime <= a.startTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after start time" });
  });

export type AnswersInput = z.input<typeof answersSchema>;

export function parseAnswers(raw: unknown): { ok: true; answers: Answers } | { ok: false; errors: Record<string, string> } {
  const r = answersSchema.safeParse(raw);
  if (r.success) return { ok: true, answers: r.data as Answers };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
  return { ok: false, errors };
}

export const vendorRequestSchema = z.object({
  category: z.string().min(1),
  quantity: text(100).default(""),
  notes: text(1000).default(""),
  contactName: text(120).min(2, "Name is required"),
  contactEmail: z.string().trim().email("Enter a valid email").max(200),
  contactPhone: text(40).default(""),
});

export const waitlistSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(200),
  country: text(80).default(""),
  state: text(80).default(""),
  city: text(80).min(2, "Which city?"),
});
