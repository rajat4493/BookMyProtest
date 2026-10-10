/**
 * Social toolkit: drafts built ONLY from the organizer's public fields and event guidance BookMyProtest holds from official sources.
 * Pure and deterministic. Nothing is published: the organizer reviews, copies or downloads. It never claims approval, verification or endorsement,
 * keeps the organizer's claims as the organizer's, and contains no calls to action beyond attending, sharing and following the page.
 */
export const TOOLKIT_NOTE = "Generated from organizer-provided event information and BookMyProtest-held event logistics.";

export interface Guidance { title: string; text: string; source: string }
export interface ToolkitInput {
  title: string; summary: string; city: string; state: string; venue: string; dateLabel: string; startTime: string; endTime: string; organizerName: string;
  /** e.g. "Permission status (reported by the organizer): Submitted"; null when not provided. */
  permissionLine: string | null; url: string; guidance: Guidance[]; officialCheckedOn?: string | null;
}
export interface ToolkitItem { key: string; title: string; texts: string[]; note: string }

const where = (i: ToolkitInput) => [i.venue, i.city].filter(Boolean).join(", ");
const when = (i: ToolkitInput) => `${i.dateLabel}, ${i.startTime}–${i.endTime}`;
const clip = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`);
const LISTED_BY = "Listed on BookMyProtest. Details are provided by the organizer.";
const CHECK = "Please check current official information where relevant.";

export function buildToolkit(i: ToolkitInput): ToolkitItem[] {
  const status = i.permissionLine ? `${i.permissionLine}.` : "";
  const dos = i.guidance.filter((g) => !/^no\b|prohibited/i.test(g.title));
  const donts = i.guidance.filter((g) => /^no\b|prohibited/i.test(g.title));
  const g = (x: Guidance) => `${x.title}: ${x.text}`;
  const items: ToolkitItem[] = [
    { key: "instagram", title: "Instagram caption", note: TOOLKIT_NOTE, texts: [[i.title, "", i.summary, "", `Where: ${where(i)}`, `When: ${when(i)}`, `Organizer: ${i.organizerName}`, status, "", `Details and updates: ${i.url}`, LISTED_BY].filter((l, idx, a) => l !== "" || a[idx - 1] !== "").join("\n").trim()] },
    { key: "x_post", title: "X post", note: TOOLKIT_NOTE, texts: [clip(`${i.title}. ${when(i)}, ${where(i)}. ${i.summary}`, 280 - i.url.length - 12) + ` Details: ${i.url}`] },
    {
      key: "x_thread", title: "X thread", note: TOOLKIT_NOTE, texts: [
        clip(`${i.title} (1/5)`, 280),
        clip(`Why: ${i.summary} (2/5)`, 280),
        clip(`When and where: ${when(i)}, ${where(i)}. Organizer: ${i.organizerName}. (3/5)`, 280),
        clip(`${i.guidance.length ? `What to know, from official information: ${i.guidance.slice(0, 2).map(g).join(" ")}` : `What to know: details may change. ${CHECK}`} (4/5)`, 280),
        clip(`${status ? status + " " : ""}${CHECK} Updates: ${i.url} (5/5)`, 280),
      ],
    },
    { key: "whatsapp", title: "WhatsApp message", note: TOOLKIT_NOTE, texts: [[`*${i.title}*`, i.summary, `${when(i)}`, `${where(i)}`, `Organizer: ${i.organizerName}`, status, `Details: ${i.url}`, LISTED_BY].filter(Boolean).join("\n")] },
    { key: "facebook_linkedin", title: "Facebook / LinkedIn", note: TOOLKIT_NOTE, texts: [[`${i.title}`, "", `${i.summary} It takes place on ${when(i)} at ${where(i)}, organized by ${i.organizerName}.${status ? " " + status : ""} ${CHECK}`, "", `Details and updates: ${i.url}`, LISTED_BY].join("\n")] },
    { key: "blurb", title: "Short event blurb", note: TOOLKIT_NOTE, texts: [clip(`${i.title}: ${i.summary} ${when(i)}, ${where(i)}. Organized by ${i.organizerName}.`, 300)] },
    {
      key: "faq", title: "FAQ", note: TOOLKIT_NOTE, texts: [
        `What is this? A public gathering listed by ${i.organizerName}. The details are provided by the organizer.`,
        `When and where? ${when(i)}, ${where(i)}.`,
        `Is it permitted? ${i.permissionLine ? `${i.permissionLine}.` : "The organizer has not provided a permission status."} BookMyProtest does not grant, confirm or guarantee permission. ${CHECK}`,
        "Do I need to register? No registration happens on BookMyProtest. 'Planning to attend' is only an indication of interest.",
        `Who is responsible for the event? The organizer, ${i.organizerName}. BookMyProtest does not organize, authorize, endorse or guarantee the event.`,
      ],
    },
    {
      key: "know_before", title: "What to know before attending", note: `${TOOLKIT_NOTE} Venue points come from official information held by BookMyProtest${i.officialCheckedOn ? `, checked on ${i.officialCheckedOn}` : ""}.`, texts: [
        ...i.guidance.map((x) => `${g(x)} (source: ${x.source})`),
        "Details may change. Check the event page for updates from the organizer.",
        "Follow the instructions of the authorities on the day.",
      ],
    },
    {
      key: "bring", title: "What to bring / not bring", note: `${TOOLKIT_NOTE} Only items covered by official information held by BookMyProtest are listed.`, texts: i.guidance.length === 0
        ? ["BookMyProtest holds no venue rules for this place yet, so it does not suggest what to bring. Ask the organizer."]
        : [...(dos.length ? [`Limits to respect: ${dos.map(g).join(" ")}`] : []), ...(donts.length ? [`Not permitted at this venue: ${donts.map((x) => x.title.replace(/^No\s+/i, "").replace(/^Prohibited\s+/i, "")).join("; ")}.`] : [])],
    },
  ];
  return items;
}

/** Phrases a generated draft must never contain: approval, verification or endorsement claims by BookMyProtest. */
export const FORBIDDEN_CLAIMS = [/approved by bookmyprotest/i, /verified by bookmyprotest/i, /bookmyprotest (has )?(approved|verified|certified|endorses?|supports?|organi[sz]es|guarantees)/i, /officially (approved|permitted|authori[sz]ed)/i, /legally (approved|cleared|certified)/i, /guaranteed (permission|venue|safe)/i, /venue (is )?available/i];
export const toolkitViolations = (items: ToolkitItem[]): string[] => items.flatMap((it) => it.texts.flatMap((t) => FORBIDDEN_CLAIMS.filter((r) => r.test(t)).map((r) => `${it.key}: ${r}`)));
