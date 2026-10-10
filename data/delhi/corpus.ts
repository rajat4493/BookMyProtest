/**
 * Delhi / Jantar Mantar corpus: DATA ONLY. No code anywhere branches on these values; the generic engine evaluates them.
 *
 * Provenance: facts below are the project owner's primary-source review of Delhi Police Standing Order L&O/48/2022
 * and the Delhi Traffic Police NOC page, supplied as a summary. The loader/assistant did NOT read the PDF (delhipolice.gov.in
 * is unreachable from the build sandbox), so section references and verbatim excerpts are NOT recorded and must be added by a reviewer.
 * Nothing here is invented beyond that summary. Where the workflow is not verified (Ramlila booking, land-owner NOC process,
 * submission method) the text says so and no steps are given.
 */
import type { Category, Clause, Condition, DeadlineDef, Level, LegalCertainty, Severity, SourceType } from "../../src/lib/engine/types";

export type PlaceKey = "IN" | "NCT" | "DIST" | "JM" | "RM";

export const PLACES: { key: PlaceKey; name: string; level: "country" | "region" | "district" | "venue"; parent: PlaceKey | null; code: string; supported: boolean; meta?: { timezone?: string; largeEventAbove?: number; capacity?: number }; schedulingMode?: "EXCLUSIVE" | "SHARED_CAPACITY" | "AUTHORITY_MANAGED" | "UNKNOWN" }[] = [
  { key: "IN", name: "India", level: "country", parent: null, code: "IN", supported: false },
  { key: "NCT", name: "NCT Delhi", level: "region", parent: "IN", code: "DL", supported: false, meta: { timezone: "Asia/Kolkata", largeEventAbove: 1000 } },
  { key: "DIST", name: "New Delhi District", level: "district", parent: "NCT", code: "DL-ND", supported: false /* set true by the loader only after rules are published */ },
  { key: "JM", name: "Jantar Mantar", level: "venue", parent: "DIST", code: "DL-ND-JM", supported: false, meta: { capacity: 1000 }, schedulingMode: "SHARED_CAPACITY" /* Standing Order L&O/48/2022 caps it at 1,000 and allows several gatherings */ },
  // Ramlila Maidan is AUTHORITY_MANAGED until its exact booking interface/status is verified (DEL-RAM-002). It carries no rules of its own: the NCT Ramlila rules apply above 1,000.
  { key: "RM", name: "Ramlila Maidan", level: "venue", parent: "DIST", code: "DL-ND-RM", supported: false, schedulingMode: "AUTHORITY_MANAGED" },
];

/** Exact URL supplied by the project owner. Not guessed; the PDF itself was not readable from the build sandbox (proxy 403). */
export const STANDING_ORDER_URL = "https://delhipolice.gov.in/StandingOrderFiles/83377_Law%20and%20Order-48-2022.pdf";

/** Official Delhi Police Standing Orders index (lists title, number and date; the PDFs are served separately). */
export const OFFICIAL_INDEX_URL = "https://kpkb.delhipolice.gov.in/standingorderNew";

export type SourceKey = "SO" | "SO_2018" | "SO_10_2022" | "SO_309" | "SC_RAMLILA" | "ACT_1978" | "CURRENT_PRACTICE" | "NEWS_ANI" | "NEWS_INDIATV" | "TRAFFIC" | "NOTIF" | "DCP_CONTACT" | "JUDICIAL_NDMC" | "LEAD_PTI" | "LEAD_LAWTREND" | "LEAD_LIVELAW";
export interface SourceSpec {
  key: SourceKey; title: string; type: SourceType; issuer: string; place: PlaceKey; url: string | null; monitoring: "DAILY" | "WEEKLY" | null; notes: string;
  lifecycle?: "CURRENT" | "HISTORICAL" | "PLACEHOLDER"; publicationDate?: string; supersededBy?: SourceKey;
  code?: string; orderNumber?: string; documentUrl?: string | null; indexUrl?: string | null; legacyTitles?: string[];
  /** Live-restriction feed settings (generic platform fields, not Delhi logic). */
  parser?: "ORDER_NOTICES"; feedRole?: "LIVE_RESTRICTIONS";
  /** Date the page/document was seen (defaults to the load's verification date). */ retrieved?: string;
  /** Explicit integration statuses, kept distinct (never collapsed into "unknown"). */ flags?: ("SOURCE_VERIFIED" | "FETCH_IN_THIS_ENVIRONMENT_BLOCKED" | "PARSER_REAL_PAGE_VERIFICATION_PENDING" | "PARSER_REAL_PAGE_VERIFIED")[];
}

export const SOURCES: SourceSpec[] = [
  {
    key: "SO", title: "Delhi Police Standing Order L&O/48/2022 — protests at Jantar Mantar", type: "OFFICIAL_ADMINISTRATIVE_RULE", issuer: "Delhi Police", place: "NCT",
    url: STANDING_ORDER_URL, monitoring: "WEEKLY", publicationDate: "2022-04-28", code: "DEL-SO-LNO-48-2022", orderNumber: "L&O/48/2022", documentUrl: STANDING_ORDER_URL, indexUrl: OFFICIAL_INDEX_URL,
    notes: "Governing instrument for Jantar Mantar. Order title and date are corroborated by the official Delhi Police Standing Orders index (per the project owner): \"Guidelines for organizing protests or demonstrations at or near Central Vista including Jantar Mantar and Boat Club\", order date 28 April 2022. Current Delhi Police reporting and Delhi High Court records cite this order number. URL supplied by the project owner. The PDF could not be read from the build sandbox, so section references and excerpts are still to be added by a reviewer. It supersedes Standing Order No. 10/2018 (kept as history). The 10-day lead time is evidenced separately (see the current-practice source). Reports mention Burari for gatherings above 50,000: not in the supplied summary and not loaded.",
  },
  {
    key: "SO_2018", title: "Delhi Police Standing Order No. 10/2018 — protests at Central Vista, Jantar Mantar and Boat Club (historical)", type: "OFFICIAL_ADMINISTRATIVE_RULE", issuer: "Delhi Police", place: "NCT",
    url: "https://delhipolice.gov.in/doc/standing-order/10.pdf", monitoring: null, lifecycle: "HISTORICAL", supersededBy: "SO", code: "DEL-SO-10-2018", orderNumber: "No. 10/2018", documentUrl: "https://delhipolice.gov.in/doc/standing-order/10.pdf",
    notes: "HISTORY ONLY. Governed Jantar Mantar after the 2018 Supreme Court judgment (Mazdoor Kisan Shakti Sangathan v. Union of India). Superseded by L&O/48/2022; later Delhi High Court proceedings refer to the 2022 order. Never evidence for a current rule, never monitored, and must not be used to derive the 10-day lead time or any other current requirement.",
  },
  {
    key: "SO_10_2022", title: "Guidelines for regulation of rallies/procession in Delhi", type: "OFFICIAL_ADMINISTRATIVE_RULE", issuer: "Commissioner of Police, Delhi", place: "NCT",
    url: OFFICIAL_INDEX_URL, monitoring: "WEEKLY", publicationDate: "2022-05-25", code: "DEL-SO-LNO-10-2022", orderNumber: "L&O/10/2022", documentUrl: null, indexUrl: OFFICIAL_INDEX_URL,
    legacyTitles: ["Delhi Police order dated 25 May 2022 — Guidelines for regulation of rallies/procession in Delhi (research placeholder)"],
    notes: "CURRENT generic framework for rallies, demonstrations and processions throughout Delhi (not only Jantar Mantar). The official Delhi Police Standing Orders index lists it at serial 70 with order date 25 May 2022; current legal reporting identifies it as Standing Order L&O/10/2022 and cites it in 2026 Delhi High Court-related reporting on rallies/processions and crowd-control videography (per the project owner). INDEX-ONLY EVIDENCE: the index establishes that the instrument exists and its title and date. It says nothing about the clauses. The document_url is deliberately EMPTY until the actual Delhi Police PDF is recovered; no URL is guessed. Clause-level organiser requirements stay UNDER_REVIEW (DEL-PROC-100). Much of the order is internal police operational instruction (barricading, use of force, announcements, videography, medical assistance): those are police duties, not organiser tasks, and are not turned into requirements. The weekly check watches the index so a review item opens when the document appears or changes; it flags no rule.",
  },
  {
    key: "SO_309", title: "Delhi Police Standing Order 309 — Regulation of Processions and Rallies (historical)", type: "OFFICIAL_ADMINISTRATIVE_RULE", issuer: "Delhi Police", place: "NCT",
    url: null, monitoring: null, lifecycle: "HISTORICAL", supersededBy: "SO_10_2022", code: "DEL-SO-309", orderNumber: "309",
    notes: "HISTORICAL CONTEXT. The older generic procession framework: the Supreme Court discussed it in the Ramlila Maidan judgment as laying down the procedure for permission applications, their acceptance/rejection and how demonstrations and processions are regulated; a 2015 Ministry of Home Affairs parliamentary answer says Delhi Police were granting permissions under it at that time. Superseded in practice by L&O/10/2022, but it must NOT be assumed that every clause of 309 survives unchanged into L&O/10/2022. No URL known; never evidence for a current rule.",
  },
  {
    key: "SC_RAMLILA", title: "In re Ramlila Maidan Incident, Supreme Court, 23 Feb 2012 — [2012] 4 S.C.R. 971; (2012) 5 SCC 1", type: "BINDING_CASE_LAW", issuer: "Supreme Court of India", place: "IN",
    url: "https://digiscr.sci.gov.in/admin/judgement_file/judgement_pdf/2012/volume%204/Part%20I/__971-%201152_1703914973.pdf", monitoring: null, publicationDate: "2012-02-23", code: "IN-SC-RAMLILA-2012", orderNumber: "Suo Motu Writ Petition (Crl.) No. 122 of 2011",
    documentUrl: "https://digiscr.sci.gov.in/admin/judgement_file/judgement_pdf/2012/volume%204/Part%20I/__971-%201152_1703914973.pdf",
    notes: "Official Supreme Court Reports PDF (link from a web search result; not read by the build assistant). The headnote lists Delhi Police Standing Order 309 among the provisions considered. Used here only as context for Standing Order 309 and as supporting evidence that Delhi Police regulate processions through a permission procedure. Not used for any specific clause.",
  },
  {
    key: "ACT_1978", title: "The Delhi Police Act, 1978 (Act 34 of 1978)", type: "PRIMARY_LAW", issuer: "Parliament of India", place: "NCT",
    url: "https://www.indiacode.nic.in/handle/123456789/1742?locale=en", monitoring: null, code: "IN-DL-POLICE-ACT-1978", orderNumber: "Act 34 of 1978",
    documentUrl: "https://www.indiacode.nic.in/bitstream/123456789/13669/1/delhi_police_act.pdf",
    notes: "Primary-law foundation for regulating processions: per search results, sections 28 and 29 let the police regulate the routes by which and the times at which processions may pass (and, for section 29, specify routes/times at which they may not pass); section 28 also touches licensing/controlling places of assembly and noisy activities; section 31 concerns disorder at places of public assembly and is NOT a licensing power. SUBSECTION LETTERS AND EXACT WORDING WERE NOT READ by the build assistant (India Code is unreachable from the sandbox) and must be confirmed against the Act text before a reviewer verifies any rule that cites it. India Code shows the text as current to 1 June 2026 and lists recent amendments (e.g. the Jan Vishwas (Amendment Provisions) Act, 2026): check whether they touch ss. 28-29. Not monitored automatically (the India Code page changes for unrelated reasons); review manually.",
  },
  {
    key: "CURRENT_PRACTICE", title: "Current Delhi Police statements and refusal letters confirming the 10-day application requirement", type: "OFFICIAL_CURRENT_PRACTICE", issuer: "Delhi Police", place: "NCT",
    url: null, monitoring: null,
    notes: "Confirmation of the CURRENT operational deadline, kept apart from the governing instrument. Per the project owner: Delhi Police have repeatedly stated in 2025–26 that applications must be submitted at least 10 days in advance under the current guidelines; statements on 7–9 October 2026 repeat it; a December 2025 refusal letter cited the 10-day requirement together with L&O/48/2022. The statements/letter themselves have not been attached (no URLs or documents supplied): attach them here when available. The event day is excluded from the count.",
  },
  {
    key: "NEWS_ANI", title: "ANI (7 Oct 2026): “Prior permission is mandatory for organizing demonstration, sit-in, or protest at Jantar Mantar”: Delhi Police", type: "SECONDARY_LEAD", issuer: "ANI", place: "NCT",
    url: "https://aninews.in/news/national/general-news/prior-permission-is-mandatory-for-organizing-demonstration-sit-in-or-protest-at-jantar-mantar-delhi-police20261007185435/", monitoring: null,
    notes: "News report of a Delhi Police statement. Seen only as a search result by the build assistant (not read in full). A LEAD: it can never verify a rule. Replace with the police statement itself.",
  },
  {
    key: "NEWS_INDIATV", title: "India TV (7 Oct 2026): ‘Permission must be sought 10 days before protest’: Delhi Police amid INDIA bloc stir at Jantar Mantar", type: "SECONDARY_LEAD", issuer: "India TV", place: "NCT",
    url: "https://www.indiatvnews.com/news/india/permission-must-be-sought-10-days-before-protest-delhi-police-amid-india-bloc-stir-at-jantar-mantar-latest-updates-2026-10-07-1056339", monitoring: null,
    notes: "News report of a Delhi Police statement. Seen only as a search result by the build assistant (not read in full). A LEAD: it can never verify a rule.",
  },
  {
    key: "TRAFFIC", title: "Delhi Traffic Police — NOC for processions, rallies, meetings and morchas", type: "OFFICIAL_CURRENT_PRACTICE", issuer: "Delhi Traffic Police", place: "NCT",
    url: "https://traffic.delhipolice.gov.in/node/80", monitoring: "WEEKLY",
    notes: "Official Delhi Traffic Police page on the NOC for public rallies, processions, meetings, morchas and protest gatherings. The project owner confirmed this is the official page and that it makes a Traffic NOC mandatory for such gatherings, so the Traffic NOC requirement is PRIMARY_VERIFIED from it. The page could not be fetched from the build sandbox, so no verbatim excerpt is recorded. The application procedure, fee and processing time were NOT found and are not asserted.",
  },
  {
    key: "NOTIF", title: "Delhi Police — Notifications (Section 163 BNSS orders)", type: "OFFICIAL_CURRENT_PRACTICE", issuer: "Delhi Police", place: "NCT",
    url: "https://delhipolice.gov.in/notification", monitoring: "DAILY", parser: "ORDER_NOTICES", feedRole: "LIVE_RESTRICTIONS",
    flags: ["SOURCE_VERIFIED", "FETCH_IN_THIS_ENVIRONMENT_BLOCKED", "PARSER_REAL_PAGE_VERIFICATION_PENDING"],
    notes: "CANONICAL LIVE-RESTRICTION FEED for Delhi. SOURCE_VERIFIED: the project owner confirms the listing is current and demonstrably publishes Section 163 BNSS orders. FETCH_IN_THIS_ENVIRONMENT_BLOCKED: the build sandbox's proxy returns 403 for delhipolice.gov.in, so the assistant never fetched it. PARSER_REAL_PAGE_VERIFICATION_PENDING: the order parser has only met synthetic wording; run `npm run probe:feed` outside the sandbox, then record PARSER_REAL_PAGE_VERIFIED. Until then the integration is NOT production verified. (Commissioner-level and district/ACP Section 163 BNSS orders). Checked daily. When new text appears, the Regulatory Watch order parser PROPOSES candidates (issuing authority, order date, legal basis, geographic scope, effective start/end where stated, prohibited or restricted activities); each field shows the text it came from and gaps stay blank. A human accepts a candidate as a DRAFT restriction and separately activates it with a source. Every Delhi event gets a restriction check at plan generation, recheck, document generation, T-72h and T-24h. The parser was written from order wording seen in reporting, not from this page's real markup (unreachable from the build sandbox): treat the first live runs as calibration. A change to the feed does NOT flag DEL-LIVE-001.",
  },
  {
    key: "DCP_CONTACT", title: "Delhi Police RTI Manual-16: List of APIO/PIO & FAA (updated 17.04.2026), DCP/New Delhi District entry", type: "OFFICIAL_CURRENT_PRACTICE", issuer: "Delhi Police", place: "DIST",
    url: "https://delhipolice.gov.in/RTImanualFiles/77308_Manual-16.pdf", documentUrl: "https://delhipolice.gov.in/RTImanualFiles/77308_Manual-16.pdf", monitoring: null, retrieved: "2026-10-10",
    notes: "Official current Delhi Police source for the DCP/New Delhi District office: Police Station Parliament Street / Office Complex, Sansad Marg, New Delhi 110001; telephone 011-23747777 (the project owner supplied the address and number; a search on 2026-10-10 returned this Delhi Police document, dated 17.04.2026, listing the same office and number; the document itself was NOT fetched here). RETRIEVED 2026-10-10. It is an RTI officers' list, not a district contact page: a reviewer should confirm the entry and, if one exists, attach the district's own contact page. EMAIL: lists disagree (this RTI list and another Delhi Police directory give different addresses, and one prefix looks like another district), so NO email is stored or displayed here until a reviewer confirms the right one. Even then an email would be contact information only. This source does not establish that email, or any other electronic route, is an accepted way to submit a permission application.",
  },
  {
    key: "JUDICIAL_NDMC", title: "Supreme Court (2018) and NGT (2017) material on Jantar Mantar: NDMC as the land-owning agency (judicial context)", type: "BINDING_CASE_LAW", issuer: "Supreme Court of India / National Green Tribunal", place: "NCT",
    url: null, monitoring: null,
    notes: "Owner-supplied judicial context: Supreme Court and NGT material identifies the New Delhi Municipal Council (NDMC) as the land-owning agency for the Jantar Mantar area. NOT independently corroborated by the build assistant: a web search on 2026-10-10 found NDMC named as a respondent in the NGT's October 2017 order (directed to remove makeshift structures and loudspeakers from the stretch) and the Supreme Court's July 2018 judgment lifting the blanket ban, but no passage that states land ownership. No URL or paragraph references were supplied, so none are invented: a reviewer should attach the order(s) and the paragraph. It supports ISSUER CONTEXT only. It says nothing about how an NOC is applied for.",
  },
  {
    key: "LEAD_PTI", title: "PTI via PSU Watch: Delhi HC asks authorities to respond to plea on permission for Ramlila Maidan meeting (2023)", type: "SECONDARY_LEAD", issuer: "PTI / PSU Watch", place: "NCT",
    url: "https://psuwatch.com/amp/story/newsupdates/pti/dl-hc-ramlila-maidan-meeting", monitoring: null,
    notes: "News report of a 2023 Delhi High Court matter. Per a search summary (page not read in full by the build assistant): the MCD Horticulture Department referred the applicant to Delhi Police for a no-objection certificate. A LEAD: it can never verify a rule. It is the only basis, with the other two leads, for the Ramlila 'separate approvals' warning, which therefore stays low confidence / Needs verification.",
  },
  {
    key: "LEAD_LAWTREND", title: "LawTrend: Delhi HC asks authorities to respond to plea on permission for Ramlila Maidan meeting", type: "SECONDARY_LEAD", issuer: "LawTrend", place: "NCT",
    url: "https://lawtrend.in/?p=178678", monitoring: null,
    notes: "Legal news report of the same 2023 matter. Seen only as a search result. A LEAD: never verifies a rule.",
  },
  {
    key: "LEAD_LIVELAW", title: "LiveLaw-hosted court filing (PDF) on Ramlila Maidan permission", type: "SECONDARY_LEAD", issuer: "LiveLaw (hosting)", place: "NCT",
    url: "https://livelaw.in/pdf_upload/1700976216521-506199.pdf", monitoring: null,
    notes: "A PDF hosted by LiveLaw that surfaced alongside the reports above, said in a search summary to record an MCD order allotting the ground subject to a police NOC. The build assistant did NOT read it. Treated as a LEAD only; a reviewer should open it and, if it is the court order, cite it properly. It can never verify a rule.",
  },
];

export type AuthKey = "DCP_ND" | "TRAFFIC_HQ";
export const AUTHORITIES: { key: AuthKey; name: string; place: PlaceKey; type: string; address: string; website: string | null; notes: string; phone?: string; method?: "ONLINE" | "EMAIL" | "IN_PERSON" | "POST" | "UNKNOWN" }[] = [
  { key: "DCP_ND", name: "DCP, New Delhi District (Delhi Police)", place: "DIST", type: "POLICE", address: "Office Complex, Police Station Parliament Street, Sansad Marg, New Delhi 110001", phone: "011-23747777", website: null, method: "IN_PERSON",
    notes: "Receives Jantar Mantar permission applications per Standing Order L&O/48/2022: the application is addressed to the DCP/New Delhi District and submitted at the HAX Branch of the DCP/NDD office. Address and telephone are the current official Delhi Police district details (source: DCP_CONTACT; supplied by the project owner). Whether email or any online route is an ACCEPTED submission channel is NOT verified: no email is stored, and none may be presented as sufficient." },
  { key: "TRAFFIC_HQ", name: "Delhi Traffic Police — DCP (Headquarters)", place: "NCT", type: "TRAFFIC", address: "Delhi Traffic Police Headquarters, Todapur", website: "https://traffic.delhipolice.gov.in", notes: "Receives Traffic NOC applications for rallies, meetings, morchas and protest gatherings. Submission method not verified." },
];

/** Annexure B of L&O/48/2022 ("Undertaking by the organizer for Jantar Mantar"): PDF pages 11–14. #page= is a standard PDF open parameter on the same official URL, not a new address. */
export const ANNEXURE_B_URL = `${STANDING_ORDER_URL}#page=11`;
export const ANNEXURE_B_LABEL = "View official Annexure B";

const c = (field: Clause["field"], op: Clause["op"], value?: Clause["value"]): Clause => ({ field, op, value });
const cond = (...all: Clause[]): Condition => ({ all, any: [] });
const JM_CAP = c("attendance", "lte", 1000);

export interface RuleSpec {
  family: string; title: string; place: PlaceKey; authority: AuthKey | null; category: Category; level: Level; severity: Severity; certainty: LegalCertainty;
  /** How to submit (shown under Details). */ submit?: string; /** A labelled official link for the rule. */ link?: { url: string; label: string };
  legal: string; plain: string; action: string; condition: Condition; deadline?: DeadlineDef; docs?: string[]; vendor?: string;
  sources: { key: SourceKey; strength: "PRIMARY" | "SUPPORTING" | "LEAD"; flagOnChange?: boolean; note?: string; section?: string; relevance?: string }[]; confidence: "low" | "medium" | "high";
  /** Rule type; "warning" is informational (a heads-up), not an action: it is never scored. "permission_gate" marks the police permission an event cannot be READY without. Defaults to "permission". */
  type?: "permission" | "warning" | "permission_gate";
  /** Labelled facts shown under Details. */ facts?: { label: string; value: string }[];
  /** Leave in UNDER_REVIEW: never shown to users. */
  holdForReview?: boolean; note?: string;
}

const SO_NOTE = "Loaded from the project owner's primary-source review of Standing Order L&O/48/2022; section reference and excerpt not recorded — reviewer to add.";
const SO = [{ key: "SO" as const, strength: "PRIMARY" as const }];
const base = { place: "JM" as const, authority: "DCP_ND" as const, certainty: "PRIMARY_VERIFIED" as const, sources: SO, confidence: "high" as const, note: SO_NOTE };

export const RULES: RuleSpec[] = [
  { ...base, family: "DEL-JM-001", title: "Prior police permission", type: "permission_gate", category: "permissions", level: "REQUIRED", severity: "CRITICAL", condition: cond(JM_CAP),
    legal: "A protest, demonstration or sit-in at Jantar Mantar requires prior permission from Delhi Police under Standing Order L&O/48/2022.",
    plain: "You need police permission before you gather at Jantar Mantar.", action: "Submit your Jantar Mantar permission application to the HAX Branch, DCP/New Delhi District, by {deadline}.", docs: ["Permission application"],
    submit: "Submit at the HAX Branch of the DCP/New Delhi District office: Office Complex, Police Station Parliament Street, Sansad Marg, New Delhi 110001. Telephone 011-23747777. The application is addressed to the DCP/New Delhi District. Whether email or an online route is accepted is NOT verified: do not rely on it." },
  { ...base, family: "DEL-JM-002", title: "Apply at least 10 days ahead", category: "permissions", level: "REQUIRED", severity: "CRITICAL", condition: cond(JM_CAP),
    legal: "The application must reach the DCP, New Delhi District at least 10 days in advance, excluding the day of the event. A late application may still be considered depending on space and the time available to make arrangements.",
    plain: "Apply at least 10 days before your event, not counting the event day. A late application might still be considered, but only if space and time allow.", action: "Work back from your event date and submit well before the deadline shown.",
    deadline: { kind: "STRUCTURED", minimumDaysBeforeEvent: 10, dayType: "CALENDAR", specialNotes: "Excluding the event day. Late applications may be considered subject to space and time for arrangements. Confirmed as the current requirement by Delhi Police practice in 2025–26; older 2018 material does not override it." },
    // Evidence chain, kept separate: governing instrument + current-practice confirmation + press leads (which can never verify anything).
    sources: [
      { key: "SO", strength: "PRIMARY", note: "Governing instrument (L&O/48/2022): 10 days in advance, excluding the event day." },
      { key: "CURRENT_PRACTICE", strength: "SUPPORTING", flagOnChange: false, note: "Current deadline confirmation: Delhi Police statements and a Dec 2025 refusal letter. Documents not yet attached." },
      { key: "NEWS_ANI", strength: "LEAD", flagOnChange: false, note: "Press report of the 7 Oct 2026 police statement. Lead only." },
      { key: "NEWS_INDIATV", strength: "LEAD", flagOnChange: false, note: "Press report of the 7 Oct 2026 police statement. Lead only." },
    ],
    note: "10 calendar days, excluding the event day, as the CURRENT operational deadline. Governing instrument = Standing Order L&O/48/2022; current confirmation = Delhi Police statements/refusal letters (stored as a separate source). Do NOT derive the 10 days from Standing Order No. 10/2018 (historical). Section reference not recorded — reviewer to add." },
  { ...base, family: "DEL-JM-003", title: "Applications go to the DCP, New Delhi District", category: "permissions", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP),
    legal: "Jantar Mantar permission applications are made to the Deputy Commissioner of Police (DCP), New Delhi District.",
    plain: "Your application is addressed to the DCP/New Delhi District and submitted at the HAX Branch of the DCP/NDD office (Office Complex, Police Station Parliament Street, Sansad Marg, New Delhi 110001; telephone 011-23747777). We have not verified that email or any online route is accepted, so do not assume it is.", action: "Take or send your application to the HAX Branch, DCP/New Delhi District, and call 011-23747777 if you need to confirm anything.",
    submit: "In person at the HAX Branch of the DCP/NDD office, Office Complex, Police Station Parliament Street, Sansad Marg, New Delhi 110001 (telephone 011-23747777). Email / online submission: NOT verified." },
  { ...base, family: "DEL-JM-004", title: "First come, first served, subject to police assessment", category: "permissions", level: "RECOMMENDED", severity: "RECOMMENDED", condition: cond(JM_CAP),
    legal: "Permission is granted on a first-come-first-served basis, subject to assessment by Special Branch, Traffic Police and New Delhi District Police.",
    plain: "Permission is not automatic. It is first come, first served, and the police assess each application.", action: "Apply as early as you can." },
  { ...base, family: "DEL-JM-005", title: "Maximum 1,000 participants", category: "permissions", level: "REQUIRED", severity: "REQUIRED", condition: cond(),
    legal: "Jantar Mantar is limited to a maximum of 1,000 participants in total. More than one protest may take place on the same day, subject to space, appropriate time gaps between them and the total cap. Larger gatherings are directed elsewhere (see Ramlila Ground).",
    plain: "Jantar Mantar can host up to 1,000 people in total. Several protests can take place on the same day if there is space and enough time between them. Any space left is for the police to allot: it is not guaranteed to you. If you expect more than 1,000, plan another venue.", action: "Keep attendance within 1,000, or choose a larger venue." },
  { ...base, family: "DEL-JM-006", title: "Protest window 10:00–17:00", category: "logistics", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP),
    legal: "Protests at Jantar Mantar are permitted between 10:00 and 17:00.", plain: "Plan to be finished by 5 pm, and not start before 10 am.", action: "Set your programme within 10:00–17:00." },
  { ...base, family: "DEL-JM-007", title: "No continuous multi-day programme", category: "logistics", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP),
    legal: "A continuous programme running over multiple days is not permitted at Jantar Mantar.", plain: "Each day needs to stand on its own. No round-the-clock or overnight sit-ins.", action: "Plan single-day programmes." },
  { ...base, family: "DEL-JM-008", title: "No march to or from Jantar Mantar", category: "permissions", level: "REQUIRED", severity: "CRITICAL", condition: cond(JM_CAP, c("march", "eq", true)),
    legal: "No march to or from Jantar Mantar is permitted, other than a separately permitted symbolic march.", plain: "You can't march to or from Jantar Mantar. Your plan includes a march, so this needs to change.", action: "Remove the march, or see the symbolic march requirement." },
  { ...base, family: "DEL-JM-009", title: "Symbolic march only with separate police permission", category: "permissions", level: "REQUIRED", severity: "CRITICAL", condition: cond(JM_CAP, c("march", "eq", true)),
    legal: "A symbolic march is permitted only with separate permission from the police.", plain: "A symbolic march needs its own police permission, on top of the protest permission.", action: "If you still want a symbolic march, request separate permission and do not proceed without it." },
  { ...base, family: "DEL-JM-010", title: "Loudspeaker only with specific permission", category: "permissions", level: "REQUIRED", severity: "CRITICAL", condition: cond(JM_CAP, c("sound", "eq", true)),
    legal: "A loudspeaker may be used only with specific permission. If permitted, its use is limited to 10:00–17:00.", plain: "You planned a loudspeaker. It needs specific permission, and if allowed it can only be used between 10 am and 5 pm.", action: "Request loudspeaker permission, or drop the loudspeaker from your plan." },
  { ...base, family: "DEL-JM-011", title: "No vehicle-mounted PA system", category: "logistics", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP, c("sound", "eq", true)),
    legal: "A vehicle-mounted public address system is not permitted.", plain: "Any sound system can't be mounted on a vehicle.", action: "Use a ground-based setup, and only if permitted." },
  { ...base, family: "DEL-JM-012", title: "No tents, shamiana or temporary structures", category: "logistics", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP),
    legal: "Tents, shamiana and other temporary structures are not permitted at Jantar Mantar.", plain: "No tents or temporary structures. If you were planning a stage or canopy, ask the police first.", action: "Do not plan tents or temporary structures." },
  { ...base, family: "DEL-JM-013", title: "Maximum 25 protester buses", category: "logistics", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP, c("vehicles", "eq", true)), vendor: "buses",
    legal: "A maximum of 25 protester buses is permitted in New Delhi District.", plain: "No more than 25 protester buses are allowed in New Delhi District.", action: "Plan for 25 buses or fewer." },
  { ...base, family: "DEL-JM-027", title: "Your buses are within the venue maximum", type: "warning", category: "logistics", level: "RECOMMENDED", severity: "RECOMMENDED", condition: cond(JM_CAP, c("vehicles", "eq", true), c("buses", "gt", 0), c("buses", "lte", 25)), vendor: undefined,
    legal: "A maximum of 25 protester buses is permitted in New Delhi District.", plain: "{buses} buses are within the venue maximum of 25. Your issued permission should specify the designated Jai Singh Road parking point or an alternative location.", action: "" },
  { ...base, family: "DEL-JM-028", title: "Too many buses for Jantar Mantar", category: "logistics", level: "REQUIRED", severity: "CRITICAL", condition: cond(JM_CAP, c("vehicles", "eq", true), c("buses", "gt", 25)),
    legal: "A maximum of 25 protester buses is permitted in New Delhi District.", plain: "You entered {buses} buses. No more than 25 protester buses are allowed in New Delhi District.", action: "Reduce your plan to 25 buses or fewer." },
  { ...base, family: "DEL-JM-014", title: "Designated parking only", category: "logistics", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP, c("vehicles", "eq", true)),
    legal: "Protester buses and permitted vehicles may park only at the designated location on Jai Singh Road specified in the permission, or at another location directed by the police.", plain: "Buses and permitted vehicles must park at the designated parking location on Jai Singh Road that is specified in your permission, or at another location the police direct. Your issued permission should specify the designated Jai Singh Road parking point or an alternative location. We do not know, and do not promise, an exact parking bay: it is set for your event.", action: "When your permission is issued, check which parking point it names. If it names none, ask the DCP/NDD office (011-23747777)." },
  { ...base, family: "DEL-JM-015", title: "Prohibited vehicles and animals", category: "logistics", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP),
    legal: "Tractors, trolleys, bullock carts, cycle-rickshaws, hand carts and animals are not permitted.", plain: "No tractors, trolleys, bullock carts, cycle-rickshaws, hand carts or animals.", action: "Do not bring these." },
  { ...base, family: "DEL-JM-016", title: "Banner, flag and stick size limits", category: "logistics", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP), vendor: "banners",
    legal: "Flags and banners may be at most 9 ft × 6 ft; sticks may be at most 2 ft.", plain: "Banners and flags up to 9 × 6 feet; sticks no longer than 2 feet.", action: "Check banner and flag sizes before printing." },
  { ...base, family: "DEL-JM-017", title: "No weapons", category: "safety", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP),
    legal: "Weapons are prohibited.", plain: "No weapons of any kind.", action: "Brief your volunteers and participants." },
  { ...base, family: "DEL-JM-018", title: "No provocative or incendiary speech", category: "safety", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP),
    legal: "Provocative speech is prohibited.", plain: "Speeches must not be provocative or incendiary.", action: "Brief your speakers." },
  { ...base, family: "DEL-JM-019", title: "No damage to property", category: "safety", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP),
    legal: "Damage to property is prohibited.", plain: "Don't damage property.", action: "Brief your volunteers and participants." },
  { ...base, family: "DEL-JM-020", title: "No burning, cooking or littering", category: "safety", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP),
    legal: "Burning effigies or documents, cooking, and littering are prohibited.", plain: "No burning of effigies or documents, no cooking, and no littering.", action: "Plan a cleanup, and brief participants.", vendor: "cleanup" },
  { ...base, family: "DEL-JM-021", title: "Organizer undertaking", category: "documents", level: "REQUIRED", severity: "CRITICAL", condition: cond(JM_CAP), docs: ["Organizer undertaking"],
    legal: "The organizer must give the undertaking contained in Standing Order L&O/48/2022, recording the programme date, venue, time, number of participants, number of volunteers and the organizer or organization details.",
    plain: "You give an undertaking with your application: Annexure B of the Standing Order, \"Undertaking by the organizer for Jantar Mantar\". Use our preparation copy to gather what it asks for, then complete and sign the official Annexure B.", action: "Open the official Annexure B, gather the details it asks for, and sign it for your application.",
    link: { url: ANNEXURE_B_URL, label: ANNEXURE_B_LABEL } },
  { ...base, family: "DEL-JM-022", title: "Land-owner NOC", category: "documents", level: "REQUIRED", severity: "CRITICAL", condition: cond(JM_CAP), docs: ["Land-owner NOC"],
    legal: "Annexure B (the organizer's undertaking) requires a no-objection certificate (NOC) from the land-owner. Judicial material identifies NDMC as the land-owning agency for the Jantar Mantar area. The current NDMC application route is UNDER REVIEW.",
    plain: "Annexure B requires a land-owner NOC. NDMC is identified in judicial material as the land-owning agency for the Jantar Mantar area. BookMyProtest has not yet verified the current NDMC application channel for obtaining this NOC.", action: "Plan for the NDMC land-owner NOC as a required enclosure and allow time to obtain it. The application channel is not verified: do not assume one.",
    facts: [{ label: "Requirement", value: "REQUIRED (Annexure B)" }, { label: "Issuer context", value: "NDMC (per judicial material)" }, { label: "Submission route", value: "UNKNOWN: not yet verified" }, { label: "Certainty", value: "COURT_VERIFIED_CONTEXT + OPERATIONAL_ROUTE_UNVERIFIED" }] },
  { ...base, family: "DEL-JM-023", title: "Carry the original permission", category: "documents", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP), docs: ["Original permission"],
    legal: "The organizer undertakes to carry the original permission to the venue.", plain: "Bring the original permission on the day.", action: "Keep the original permission with the organizer." },
  { ...base, family: "DEL-JM-024", title: "Name a police liaison", category: "safety", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP),
    legal: "The organizer undertakes to name a police liaison.", plain: "Name one person who will liaise with the police.", action: "Choose a liaison and share their details." },
  { ...base, family: "DEL-JM-025", title: "Drinking water and first aid", category: "safety", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP), vendor: "drinking-water",
    legal: "The organizer undertakes to arrange drinking water and first aid or medical aid.", plain: "Arrange drinking water and first aid or medical help for participants.", action: "Book water and first aid support." },
  { ...base, family: "DEL-JM-026", title: "Volunteers and contact list", category: "safety", level: "REQUIRED", severity: "REQUIRED", condition: cond(JM_CAP), vendor: "stewards", docs: ["Volunteer deployment and contact list"],
    legal: "The organizer undertakes to deploy sufficient volunteers and records their number in the undertaking.", plain: "Have enough volunteers, and keep a list of who is where and how to reach them.", action: "Prepare a volunteer deployment and contact list." },

  { family: "DEL-TRAFFIC-001", title: "Traffic NOC for rallies, meetings and protest gatherings", place: "NCT", authority: "TRAFFIC_HQ", category: "permissions", level: "REQUIRED", severity: "CRITICAL", certainty: "PRIMARY_VERIFIED",
    legal: "Delhi Traffic Police state that a Traffic NOC is mandatory for public rallies and meetings, morchas and protest gatherings, and direct applicants to DCP (Headquarters), Delhi Traffic Police Headquarters, Todapur.",
    plain: "You need a Traffic NOC from Delhi Traffic Police. We have not verified the application steps, fee or processing time.", action: "Contact DCP (Headquarters), Delhi Traffic Police HQ, Todapur, to apply.",
    condition: cond(), docs: ["Traffic NOC application"], sources: [{ key: "TRAFFIC", strength: "PRIMARY" }], confidence: "high",
    note: "PRIMARY_VERIFIED from the official Delhi Traffic Police NOC page (confirmed by the project owner). Applies to every Delhi plan, including Ramlila Maidan gatherings. Procedure, fee and timeline not found; not asserted." },
  { family: "DEL-LIVE-001", title: "Check for current Section 163 or other temporary orders", place: "NCT", authority: null, category: "permissions", level: "RECOMMENDED", severity: "REQUIRED", certainty: "OFFICIAL_GUIDANCE",
    legal: "Delhi Police publish Section 163 BNSS orders, including Commissioner-level and district or ACP orders, on their Notifications page. An order in force for your date and place can change what is allowed.",
    plain: "Temporary orders can override the usual rules for a few days. Check the Delhi Police notifications for your date and place, and again just before the event.", action: "Check the Delhi Police notifications page now and again the day before.",
    condition: cond(), sources: [{ key: "NOTIF", strength: "SUPPORTING", flagOnChange: false }], confidence: "medium",
    note: "The feed changes constantly, so a change to it opens a review item but does not flag this rule. Reviewers record orders as Admin → Restrictions." },
  { family: "DEL-RAM-001", title: "Larger gatherings: Ramlila Ground is the Standing Order's venue", place: "NCT", authority: null, category: "permissions", level: "RECOMMENDED", severity: "CRITICAL", certainty: "PRIMARY_VERIFIED",
    legal: "Standing Order L&O/48/2022 limits Jantar Mantar to 1,000 participants and identifies Ramlila Ground as able to accommodate up to 50,000.",
    plain: "Above 1,000 people, Jantar Mantar is not an option. The Standing Order points to Ramlila Ground, which can hold up to 50,000. This is venue guidance only: we have not verified how Ramlila Ground is booked or who grants land-owner permission, so confirm that with the relevant authority. For more than 50,000 we have no verified guidance.",
    action: "Plan your gathering for Ramlila Ground or another suitable venue, and confirm the booking and land-owner process with the relevant authority.",
    condition: cond(c("attendance", "gt", 1000)), sources: SO, confidence: "high", note: `${SO_NOTE} Venue-routing guidance ONLY; not a booking workflow (see DEL-RAM-002).` },
  { family: "DEL-RAM-101", title: "Police NOC for a gathering at Ramlila Maidan", type: "permission_gate", place: "NCT", authority: null, category: "permissions", level: "LIKELY_REQUIRED", severity: "CRITICAL", certainty: "OFFICIAL_GUIDANCE",
    legal: "Reporting on a 2023 Delhi High Court matter indicates that Delhi Police issue a no-objection certificate (NOC) for events at Ramlila Maidan, separately from the allotment of the ground. The governing Delhi Police order for this has not been read.",
    plain: "Expect to need a police NOC for a large gathering at Ramlila Maidan, in addition to the ground allotment. We have not verified the application steps, the office or the timeline.",
    action: "Ask Delhi Police how to apply for a police NOC for your gathering at Ramlila Maidan, and apply early.",
    condition: cond(c("attendance", "gt", 1000)), docs: ["Police NOC application"], deadline: { kind: "UNKNOWN", specialNotes: "No published deadline verified for Ramlila Maidan." },
    sources: [
      { key: "SO", strength: "SUPPORTING", flagOnChange: false, relevance: "Identifies Ramlila Ground as the venue for larger gatherings; says nothing about its NOC process." },
      { key: "LEAD_PTI", strength: "LEAD" }, { key: "LEAD_LAWTREND", strength: "LEAD" }, { key: "LEAD_LIVELAW", strength: "LEAD" },
    ], confidence: "low",
    note: "Hedged on purpose: LIKELY_REQUIRED, OFFICIAL_GUIDANCE, LOW confidence, so users see 'Needs verification'. The only support for a separate police NOC is press and court-filing leads (secondary, never verifying). Raise confidence only after a reviewer attaches the actual order or police page." },
  { family: "DEL-RAM-102", title: "Ground allotment and land-owner permission for Ramlila Maidan", place: "NCT", authority: null, category: "permissions", level: "LIKELY_REQUIRED", severity: "CRITICAL", certainty: "OFFICIAL_GUIDANCE",
    legal: "Reporting indicates that the ground is allotted by its land-owning body, understood to be the Municipal Corporation of Delhi (MCD), and that a police NOC is a separate step. The allotting authority and its process have not been verified from an official page.",
    plain: "Using Ramlila Maidan needs the ground to be allotted to you by whoever controls it (understood to be the MCD). This is separate from police permission. We have not verified how to apply, so we give no booking steps or link.",
    action: "Confirm with the land-owning authority how to request an allotment of Ramlila Maidan for your date.",
    condition: cond(c("attendance", "gt", 1000)), docs: ["Ground allotment request"], deadline: { kind: "UNKNOWN", specialNotes: "No published deadline verified for Ramlila Maidan allotment." },
    sources: [
      { key: "SO", strength: "SUPPORTING", flagOnChange: false, relevance: "Identifies Ramlila Ground as the venue for larger gatherings; says nothing about who allots it." },
      { key: "LEAD_PTI", strength: "LEAD" }, { key: "LEAD_LAWTREND", strength: "LEAD" }, { key: "LEAD_LIVELAW", strength: "LEAD" },
    ], confidence: "low",
    note: "LAND_OWNER_PERMISSION step. The exact booking endpoint is UNDER_REVIEW (DEL-RAM-002): NO MCD booking link and no steps are exposed. The owner being the MCD is reporting only." },
  { family: "DEL-RAM-103", title: "Ramlila Maidan is not a one-step police-permission venue", type: "warning", place: "NCT", authority: null, category: "permissions", level: "RECOMMENDED", severity: "RECOMMENDED", certainty: "OFFICIAL_GUIDANCE",
    legal: "Ramlila Maidan is not a one-step police-permission venue. Ground allotment and police NOC are separate requirements.",
    plain: "Ramlila Maidan is not a one-step police-permission venue. Ground allotment and police NOC are separate requirements. Plan for three separate approvals: ground allotment, police NOC and the Traffic NOC.",
    action: "", condition: cond(c("attendance", "gt", 1000)),
    sources: [
      { key: "SO", strength: "SUPPORTING", flagOnChange: false, relevance: "Identifies Ramlila Ground as the venue for larger gatherings." },
      { key: "LEAD_PTI", strength: "LEAD" }, { key: "LEAD_LAWTREND", strength: "LEAD" }, { key: "LEAD_LIVELAW", strength: "LEAD" },
    ], confidence: "low",
    note: "Informational heads-up, not a task: never scored and never a to-do. LOW confidence so it is shown as 'Needs verification'. Based on the same leads as DEL-RAM-101/102." },
  { family: "DEL-RAM-002", title: "Exact Ramlila Ground booking endpoint (under review)", place: "NCT", authority: null, category: "permissions", level: "UNKNOWN", severity: "RECOMMENDED", certainty: "UNVERIFIED",
    legal: "", plain: "Not yet verified. No steps are given.", action: "", condition: cond(c("attendance", "gt", 1000)), sources: [], confidence: "low", holdForReview: true,
    note: "GAP RECORD: the exact booking endpoint is UNDER_REVIEW. No clean current official page was found for the Ramlila Ground booking or land-owner form, so NO direct MCD booking link is exposed anywhere (a test enforces this). Kept UNDER_REVIEW so it never reaches users. Do not guess steps or URLs." },
  // ---- Generic Delhi procession/march baseline (conservative). Applies to any plan with a march, anywhere in NCT Delhi.
  // Everything here is deliberately limited to what the sources support; clause-level L&O/10/2022 content is held (DEL-PROC-100).
  { family: "DEL-PROC-001", title: "A current Delhi Police order governs rallies and processions", place: "NCT", authority: null, category: "permissions", level: "UNKNOWN", severity: "RECOMMENDED", certainty: "PRIMARY_VERIFIED",
    legal: "Delhi Police Standing Order L&O/10/2022, \"Guidelines for regulation of rallies/procession in Delhi\", order date 25 May 2022, issued by the Commissioner of Police, Delhi, is listed in the official Delhi Police Standing Orders index.",
    plain: "Marches and processions anywhere in Delhi are covered by a current Delhi Police standing order. We have not yet extracted what it asks of organisers, so we can't tell you its requirements. Please verify with Delhi Police.",
    action: "Ask Delhi Police for the current rally and procession guidelines before you finalise your route.",
    condition: cond(c("march", "eq", true)), sources: [{ key: "SO_10_2022", strength: "PRIMARY", flagOnChange: false, relevance: "Existence, title, number and date of the instrument only; not its clauses.", section: "Official index, serial 70" }], confidence: "high",
    note: "Existence notice only (index-only evidence: it cannot support any requirement). Level UNKNOWN on purpose: it is shown as 'unknown, please verify' and is not scored." },
  { family: "DEL-PROC-002", title: "Police permission process for processions", type: "permission_gate", place: "NCT", authority: null, category: "permissions", level: "LIKELY_REQUIRED", severity: "REQUIRED", certainty: "OFFICIAL_GUIDANCE",
    legal: "Delhi Police regulate rallies and processions in Delhi under the Delhi Police Act, 1978 and Standing Order L&O/10/2022, and assess permission applications. (The detailed procedure in L&O/10/2022 has not been extracted.)",
    plain: "Delhi Police regulate processions and assess permission applications. We haven't extracted the application steps or timelines for general processions, so we don't give a deadline here, and the Jantar Mantar rules don't automatically apply to other routes.",
    action: "Contact Delhi Police about permission for your procession and apply early.",
    condition: cond(c("march", "eq", true)), deadline: { kind: "UNKNOWN", specialNotes: "No published deadline verified for general processions. The 10-day rule is specific to Jantar Mantar." },
    sources: [
      { key: "ACT_1978", strength: "SUPPORTING", flagOnChange: true, relevance: "Statutory basis for regulating processions.", section: "ss. 28-29 (subsection letters to be confirmed)" },
      { key: "SO_10_2022", strength: "SUPPORTING", flagOnChange: false, relevance: "Existence of the current framework only." },
      { key: "SC_RAMLILA", strength: "SUPPORTING", flagOnChange: false, relevance: "Supreme Court context on the permission procedure (Standing Order 309, now historical)." },
    ], confidence: "medium",
    note: "Hedged on purpose (LIKELY_REQUIRED, OFFICIAL_GUIDANCE): the supporting sources show the power to regulate and that a permission procedure exists, but the current procedure's text is not extracted. Never carries a deadline." },
  { family: "DEL-PROC-003", title: "Route and timing are set by Delhi Police", place: "NCT", authority: null, category: "permissions", level: "LIKELY_REQUIRED", severity: "REQUIRED", certainty: "PRIMARY_VERIFIED",
    legal: "Under the Delhi Police Act, 1978 (sections 28 and 29; subsection references to be confirmed against the Act), the police may regulate the routes by which and the times at which processions pass, and may specify routes and times at which they may not pass.",
    plain: "Delhi Police can decide which route a procession takes and when. Give them your proposed route and timing, and follow what is permitted.",
    action: "Prepare your proposed route and timing to submit, and stay on the permitted route.", docs: ["Proposed route and timing"],
    condition: cond(c("march", "eq", true)),
    sources: [
      { key: "ACT_1978", strength: "PRIMARY", flagOnChange: true, relevance: "Power to regulate routes and times of processions.", section: "ss. 28 and 29 (subsection letters to be confirmed)" },
      { key: "SO_10_2022", strength: "SUPPORTING", flagOnChange: false, relevance: "Existence of the current framework only." },
    ], confidence: "medium",
    note: "REVIEWER MUST READ ss. 28-29 of the Act before verifying: the build assistant could not read the text (India Code unreachable) and took the sections from search results. Confidence is MEDIUM so users see 'please verify with the authority'." },
  { family: "DEL-PROC-004", title: "Sound permission for processions and large gatherings that use sound", place: "NCT", authority: null, category: "permissions", level: "LIKELY_REQUIRED", severity: "REQUIRED", certainty: "OFFICIAL_GUIDANCE",
    legal: "Use of music or loudspeakers in public places is subject to police regulation under the Delhi Police Act, 1978. (Basis not yet confirmed; see notes.)",
    plain: "If your procession uses a sound system or loudspeaker, expect to need permission for it. We haven't confirmed the exact basis or procedure, so please verify with Delhi Police.",
    action: "Ask Delhi Police whether your sound set-up needs permission, and apply with your route and timing.",
    condition: { all: [c("sound", "eq", true)], any: [c("march", "eq", true), c("attendance", "gt", 1000)] },
    sources: [{ key: "ACT_1978", strength: "SUPPORTING", flagOnChange: true, relevance: "Section 28 touches control of noisy activities and music in public places (per search results, unread).", section: "s. 28 (to be confirmed)" }], confidence: "low",
    note: "The project owner reports sound permission as an independently verified generic requirement but did not supply the basis, and none could be found. Surfaced with LOW confidence so users see 'Needs verification' rather than a fact. Attach the actual provision/order and raise confidence to promote it. At Jantar Mantar the verified DEL-JM-010 applies instead/in addition." },
  { family: "DEL-PROC-100", title: "L&O/10/2022 clause-level requirements for organisers", place: "NCT", authority: null, category: "permissions", level: "UNKNOWN", severity: "RECOMMENDED", certainty: "UNVERIFIED",
    legal: "", plain: "Not yet extracted. No rules are given.", action: "", condition: cond(c("march", "eq", true)), sources: [], confidence: "low", holdForReview: true,
    note: "GAP RECORD. Everything specific to L&O/10/2022 stays UNDER_REVIEW until its text is extracted from the actual PDF, including: how permission applications are made and assessed (reporting says assessment can consider the nature of the demand, participating leaders/members and other intelligence including social-media information: do not present that as an organiser requirement without the text), required documents, deadlines, route and timing conditions. NOT organiser tasks and never to be turned into any: the police's own operating instructions (three-tier barricading, senior-officer control over use of force, repeated PA announcements, videography, the minimum-injury principle, medical assistance)." },
];

export const TEMPLATES = [
  {
    key: "request-letter", name: "Draft request letter (Jantar Mantar)",
    content: `Date: {{generated_on}}

To,
The Deputy Commissioner of Police
New Delhi District, Delhi Police

Subject: Application for permission to hold a demonstration at Jantar Mantar — {{event_name}}

Sir/Madam,

I, {{organizer_name}}, writing as {{organizer_type_lower}} organizer, request permission to hold a demonstration at Jantar Mantar, New Delhi, on {{event_date}} between {{start_time}} and {{end_time}}, with approximately {{expected_attendance}} participants.

Purpose: {{purpose|______________________}}

Arrangements: loudspeaker/sound — {{sound_yn_lower}}; vehicles — {{vehicles_yn_lower}}{{buses_text}}; food or water distribution — {{food_yn_lower}}.

Enclosures: the undertaking by the organizer (Annexure B of Standing Order L&O/48/2022) and the land-owner no-objection certificate required by it.

I will follow the conditions of any permission granted and the applicable Delhi Police Standing Order. I can be reached using the details below.

Yours faithfully,

______________________
{{organizer_name}}
{{organizer_email}}
{{#if contact_number}}
{{contact_number}}
{{/if}}`,
    disclaimer: "Draft generated by BookMyProtest. Verify requirements with the relevant authority before submission.",
  },
  {
    key: "undertaking", name: "Undertaking preparation copy (Jantar Mantar)",
    content: `Prepared from official Annexure B — verify against the current official form before submission.

Official Annexure B, "Undertaking by the organizer for Jantar Mantar" (Standing Order L&O/48/2022, PDF pages 11–14): ${ANNEXURE_B_URL}

# Information the Jantar Mantar undertaking asks for
| Programme date | {{event_date}}
| Venue | Jantar Mantar
| Time | {{start_time}}–{{end_time}}
| Number of participants | {{expected_attendance}}
| Number of volunteers | ______________________
| Organizer / organization | {{organizer_name}} ({{organizer_type_label}})
| Email | {{organizer_email}}
| Phone | {{contact_number|______________________}}

# Commitments the undertaking covers
- Land-owner NOC obtained
- Original permission carried to the venue
- Police liaison named: ______________________
- Drinking water and first aid or medical aid arranged
- Sufficient volunteers deployed
- Participants within the 1,000 limit
- Venue and time rules followed (10:00–17:00)
- No unauthorised march, no loudspeaker without specific permission, no tents or temporary structures

This copy only helps you collect the information. It is NOT the official undertaking. Complete and sign the official Annexure B (link above) and submit it with your application to the HAX Branch, DCP/New Delhi District.`,
    disclaimer: "Draft generated by BookMyProtest. Verify requirements with the relevant authority before submission. This is a preparation copy, not the official undertaking form.",
  },
] as const;

/** Why a venue is scheduled the way it is: evidence the availability check shows alongside its result. Reported, not read by the build assistant. */
export const VENUE_EVIDENCE: { place: PlaceKey; source: SourceKey; kind: "CASE_LAW" | "OPERATIONAL_LEARNING"; lesson: string }[] = (["LEAD_PTI", "LEAD_LAWTREND", "LEAD_LIVELAW"] as const).map((source) => ({
  place: "RM" as const, source, kind: source === "LEAD_LIVELAW" ? "CASE_LAW" as const : "OPERATIONAL_LEARNING" as const,
  lesson: "A reported 2023 Delhi High Court matter indicates that the ground-allotting body's availability and the police NOC status can diverge: an applicant was referred to the police for a NOC. Check both, and treat a clear position from one as no evidence about the other.",
}));

/** Clause-level evidence for the Jantar Mantar rules (Standing Order L&O/48/2022), as supplied by the project owner's review. Sub-clause references not supplied stay blank rather than guessed. */
export const SO_SECTIONS: Record<string, string> = {
  "DEL-JM-001": "Section 3(i), PDF page 3", "DEL-JM-002": "Section 3(i), PDF page 3", "DEL-JM-003": "Section 3(i), PDF page 3 (addressee DCP/NDD; the clause for the HAX Branch location is not separately recorded)",
  "DEL-JM-004": "Section 3(ii) (first come, first served; assessment); Section 3(iii)-(vi) (DCP/NDD decision), PDF page 3",
  "DEL-JM-005": "Section 5(i)-(ii)", "DEL-JM-006": "Section 9", "DEL-JM-008": "Section 6", "DEL-JM-009": "Section 6",
  "DEL-JM-010": "Section 7, PDF page 5", "DEL-JM-011": "Section 7, PDF page 5",
  "DEL-JM-013": "Section 4(i), PDF page 4", "DEL-JM-014": "Section 4(ii), PDF page 4", "DEL-JM-027": "Section 4(i), PDF page 4", "DEL-JM-028": "Section 4(i), PDF page 4",
  "DEL-JM-021": "Annexure B, PDF pages 11–14", "DEL-JM-022": "Annexure B, PDF pages 11–14", "DEL-JM-023": "Annexure B, PDF pages 11–14", "DEL-JM-024": "Annexure B, PDF pages 11–14",
  "DEL-JM-025": "Annexure B, PDF pages 11–14", "DEL-JM-026": "Annexure B, PDF pages 11–14",
};
for (const r of RULES) {
  const sec = SO_SECTIONS[r.family];
  if (sec) r.sources = r.sources.map((x) => (x.key === "SO" ? { ...x, section: sec } : x)); // copies: the shared `SO` array is never mutated
}
// Contact details source supports the submission rules (contact details only).
{ const r = RULES.find((x) => x.family === "DEL-JM-022")!; r.sources = [...r.sources, { key: "JUDICIAL_NDMC", strength: "SUPPORTING", flagOnChange: false, relevance: "Judicial context identifying NDMC as the land-owning agency (issuer context only; not an application route)." }]; }
for (const f of ["DEL-JM-001", "DEL-JM-003"]) {
  const r = RULES.find((x) => x.family === f)!;
  r.sources = [...r.sources, { key: "DCP_CONTACT", strength: "SUPPORTING", flagOnChange: false, relevance: "Official address and telephone of the DCP/New Delhi District office. Does not establish an accepted electronic submission channel." }];
}
