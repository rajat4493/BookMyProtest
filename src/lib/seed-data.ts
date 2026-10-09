/**
 * DEVELOPMENT SEED DATA — NOT VERIFIED.
 * Rules below are placeholders to exercise the engine. None has a source, so every one is
 * surfaced to users as "Needs verification". Before launch an admin must replace/verify them
 * (source URL + verification date) in /admin. Deadlines here are placeholders, not legal facts.
 */
import type { Category, Clause, Condition, Level, Severity } from "./engine/types";

export const VENDOR_CATEGORIES: [string, string][] = [
  ["tents", "Tents"],
  ["chairs", "Chairs"],
  ["stage", "Stage"],
  ["sound", "Sound"],
  ["generators", "Generators"],
  ["drinking-water", "Drinking water"],
  ["portable-toilets", "Portable toilets"],
  ["buses", "Buses"],
  ["printing", "Printing"],
  ["banners", "Banners"],
  ["medical", "Medical support"],
  ["stewards", "Event stewards"],
  ["cleanup", "Cleanup"],
];

const c = (field: Clause["field"], op: Clause["op"], value?: Clause["value"]): Clause => ({ field, op, value });
const cond = (all: Clause[] = [], any: Clause[] = []): Condition => ({ all, any });

interface SeedRule {
  title: string;
  description: string;
  category: Category;
  level: Level;
  severity: Severity;
  condition?: Condition;
  elseLevel?: Level;
  completeWhen?: Condition;
  assemblyType?: "any" | "static" | "march";
  deadlineDaysBefore?: number;
  deadlineNote?: string;
  requiredDocuments?: string[];
  vendorCategory?: string;
  sort: number;
}

export const SEED_RULES: SeedRule[] = [
  // ---- Permissions
  { title: "Police intimation", category: "permissions", level: "REQUIRED", severity: "CRITICAL", sort: 10,
    description: "Inform the local police authority about your gathering. Ask them what format, lead time and supporting documents they expect.",
    requiredDocuments: ["Draft request letter", "Organizer ID", "Event summary"], deadlineDaysBefore: 14,
    deadlineNote: "Placeholder lead time. Confirm the actual notice period with the authority." },
  { title: "Route approval", category: "permissions", level: "REQUIRED", severity: "CRITICAL", sort: 20,
    assemblyType: "march", condition: cond([c("march", "eq", true)]),
    description: "A march moves through public space. The authority may need to approve the route, timing and end point.",
    requiredDocuments: ["Route plan"], deadlineDaysBefore: 14 },
  { title: "Sound / loudspeaker approval", category: "permissions", level: "REQUIRED", severity: "CRITICAL", sort: 30,
    condition: cond([c("sound", "eq", true)]),
    description: "Amplified sound is commonly regulated by time of day and permitted volume. Ask what approval, if any, covers your setup.",
    requiredDocuments: ["Sound system details"], deadlineDaysBefore: 10 },
  { title: "Traffic permission", category: "permissions", level: "LIKELY_REQUIRED", severity: "REQUIRED", sort: 40,
    condition: cond([], [c("march", "eq", true), c("vehicles", "eq", true), c("attendance", "gt", 500)]),
    description: "Marches, vehicles and large crowds can affect traffic. The traffic authority may need to be consulted.", deadlineDaysBefore: 10 },
  { title: "Stage or structure permission", category: "permissions", level: "LIKELY_REQUIRED", severity: "REQUIRED", sort: 50,
    condition: cond([c("stage", "eq", true)]),
    description: "Temporary stages and structures may need permission from the venue owner or local body." },
  { title: "Venue owner consent", category: "permissions", level: "LIKELY_REQUIRED", severity: "REQUIRED", sort: 60,
    assemblyType: "static", description: "If your gathering is on private or managed ground, confirm the owner or manager is aware and consents." },
  { title: "Food distribution check", category: "permissions", level: "RECOMMENDED", severity: "RECOMMENDED", sort: 70,
    condition: cond([c("food", "eq", true)]),
    description: "If you plan to hand out food, check whether any local food-safety expectations apply." },

  // ---- Documents
  { title: "Organizer ID", category: "documents", level: "REQUIRED", severity: "CRITICAL", sort: 110,
    description: "A copy of a government-issued photo ID for the named organizer. Applications usually ask for one.",
    requiredDocuments: ["Organizer ID copy"] },
  { title: "Event description", category: "documents", level: "REQUIRED", severity: "REQUIRED", sort: 120,
    condition: cond(), completeWhen: cond([c("description", "present")]),
    description: "A short, plain-language description of the purpose and format of the gathering." },
  { title: "Route plan", category: "documents", level: "REQUIRED", severity: "CRITICAL", sort: 130,
    assemblyType: "march", condition: cond([c("march", "eq", true)]),
    description: "Start point, destination, route and timings. Use the route details sheet as a starting point.",
    requiredDocuments: ["Route details sheet"] },
  { title: "Written request letter", category: "documents", level: "REQUIRED", severity: "REQUIRED", sort: 140,
    description: "A signed request addressed to the relevant authority. Generate a draft, then review and sign it yourself." },
  { title: "Undertaking", category: "documents", level: "LIKELY_REQUIRED", severity: "REQUIRED", sort: 150,
    description: "Some authorities ask organizers for a written undertaking about conduct and responsibility. Check their format." },
  { title: "Volunteer / steward list", category: "documents", level: "RECOMMENDED", severity: "RECOMMENDED", sort: 160,
    condition: cond([c("attendance", "gte", 200)]), description: "Names and contact numbers of the people helping you run the day." },

  // ---- Logistics
  { title: "Drinking water", category: "logistics", level: "RECOMMENDED", severity: "RECOMMENDED", sort: 210,
    condition: cond([c("attendance", "gte", 50)]), vendorCategory: "drinking-water",
    description: "Arrange enough drinking water for the expected attendance and duration." },
  { title: "Sound system", category: "logistics", level: "REQUIRED", severity: "REQUIRED", sort: 220,
    condition: cond([c("sound", "eq", true)]), vendorCategory: "sound",
    description: "Source and book the sound system, and confirm it matches what you tell the authority." },
  { title: "Stage", category: "logistics", level: "REQUIRED", severity: "REQUIRED", sort: 230,
    condition: cond([c("stage", "eq", true)]), vendorCategory: "stage", description: "Source a stage that fits your venue and safety needs." },
  { title: "Portable toilets", category: "logistics", level: "RECOMMENDED", severity: "RECOMMENDED", sort: 240,
    condition: cond([c("attendance", "gte", 300)]), vendorCategory: "portable-toilets",
    description: "Larger or longer gatherings need accessible toilets nearby." },
  { title: "Generator / power", category: "logistics", level: "RECOMMENDED", severity: "RECOMMENDED", sort: 250,
    condition: cond([c("sound", "eq", true), c("stage", "eq", true)]), vendorCategory: "generators",
    description: "Stage and sound need power. Plan for a source and a fuel-safe location." },
  { title: "Transport for participants", category: "logistics", level: "RECOMMENDED", severity: "RECOMMENDED", sort: 260,
    condition: cond([c("vehicles", "eq", true)]), vendorCategory: "buses", description: "Book vehicles and plan parking and drop-off points." },
  { title: "Cleanup plan", category: "logistics", level: "RECOMMENDED", severity: "RECOMMENDED", sort: 270,
    condition: cond([c("attendance", "gte", 100)]), vendorCategory: "cleanup", description: "Leave the space as you found it. Arrange bags, people and disposal." },

  // ---- Safety
  { title: "Medical support", category: "safety", level: "RECOMMENDED", severity: "RECOMMENDED", sort: 310,
    condition: cond([c("attendance", "gte", 100)]), vendorCategory: "medical",
    description: "A first-aid point and a named person who knows the nearest hospital." },
  { title: "Event stewards", category: "safety", level: "RECOMMENDED", severity: "RECOMMENDED", sort: 320,
    condition: cond([c("attendance", "gte", 100)]), vendorCategory: "stewards",
    description: "Trained volunteers or staff who guide people and keep entrances and exits clear." },
  { title: "Emergency contacts sheet", category: "safety", level: "RECOMMENDED", severity: "RECOMMENDED", sort: 330,
    description: "One page with organizer, steward, medical and local emergency numbers, shared with your team." },
  { title: "Exit and dispersal plan", category: "safety", level: "RECOMMENDED", severity: "RECOMMENDED", sort: 340,
    assemblyType: "march", condition: cond([c("march", "eq", true)]), description: "How people leave the route safely, including those who need to leave early." },
];
