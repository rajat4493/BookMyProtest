# Acceptance test v0.9 (re-run as v0.9.2): Jantar Mantar, 500 people, first-time organizer

Run date: 2026-10-10. First run on v0.8.0 (text evidence in `evidence-initial-run/`); re-run after v0.9.1 (gap closure); **third run after v0.9.2 (final P0 closure), which is what `evidence/` and `images/` show now.** The scenario now also walks the whole permission lifecycle and the readiness states.
Evidence: `docs/acceptance/evidence/*.txt` (exactly what the organizer saw, as text) and `docs/acceptance/images/*.png` (full-page mobile screenshots).
Scripts: `scripts/acceptance-jm-500.mjs` (UI journey) and `scripts/acceptance-jm-500-part2.ts` (live-restriction states, T-72h/T-24h with an injected clock, "everything ticked" view).

## How to read this report (honest limits)
- **The Delhi rules are not published in the real database.** To run the journey I used the *test* database and loaded the corpus with the loader's `confirmVerified` switch, i.e. **as if the project owner had verified every rule**. Nothing was published or enabled anywhere real; no `--go-live`; the dev database still holds Delhi as drafts. The "Last verified: 1 October 2026" the organizer sees is the date of that simulated load, not an independent check.
- **No official page was read by me.** The Standing Order PDF, the Traffic Police page and the Notifications feed are all unreachable from this sandbox. Everything the product says about Delhi rests on the project owner's summary. So "Primary source verified" on screen means "the owner says the Standing Order says this", not "BookMyProtest read the clause" (no section references are recorded).
- The Notifications feed has **never been fetched** in any environment I have access to, so the live check's real-world behaviour is unproven. The restriction found in part 2 is **synthetic test data**, labelled as such.
- I judged as a first-time organizer would, from the screens and the downloaded pack, not from the code.

---

## What changed in the v0.9.2 re-run (final P0 closure)
| Blocker | v0.9.1 | v0.9.2 |
|---|---|---|
| Police contact source | stored without a URL | **CLOSED**: Delhi Police RTI Manual-16 (updated 17.04.2026) with URL and retrieval date 2026-10-10, DCP/NDD entry, 011-23747777. It is an RTI officers' list, not a district page, so a reviewer should confirm or replace it. |
| Notifications source existence | asserted | **CLOSED** as `SOURCE_VERIFIED`. Real fetch is `FETCH_IN_THIS_ENVIRONMENT_BLOCKED` and the parser is `PARSER_REAL_PAGE_VERIFICATION_PENDING`: three distinct flags. Not "production verified". |
| Land-owner issuer | UNKNOWN | **PARTIAL**: NDMC identified as issuer context; route UNKNOWN; no link. |
| Permission status | FAIL | **PASS**: eight-state lifecycle recorded by the organizer; APPROVED never inferred. |
| Event-day state | FAIL | **PASS**: deterministic READY / READY_WITH_WARNINGS / NOT_READY / STATUS_UNKNOWN with reasons; the percentage is relabelled "checklist progress, not permission". |
| T-72h / T-24h | restriction feed only | **PASS**: permission, restrictions and candidates, freshness, venue/date, material changes and critical items, stored as snapshots and shown to the organizer. |

Two things I could not confirm and the report does not pretend to: **(1)** a web search on 2026-10-10 found NDMC *named in* the NGT's October 2017 order as a respondent directed to remove structures, but no passage stating that NDMC *owns the land*; the NDMC statement is therefore recorded as owner-supplied judicial context, flagged "not independently corroborated", and needs a paragraph reference. **(2)** The email addresses listed for this office disagree between two Delhi Police lists (and one prefix looks like another district), so **no email is stored or displayed** until a reviewer confirms the right one. Even then it would be contact information only, never a submission channel.

## Earlier: what changed in the v0.9.1 re-run (before / after)
| Area | Before | After |
|---|---|---|
| Submission location | FAIL / UNKNOWN | **PASS** for location, branch and telephone; electronic submission remains **UNKNOWN** and is said to be unverified |
| Official undertaking | PARTIAL (no link) | **PASS**: "View official Annexure B" (PDF pages 11–14), our sheet labelled a preparation copy |
| Bus parking | UNKNOWN | **PASS / PARTIAL**: rule and Jai Singh Road verified; exact bay stays event-specific and is not promised |
| 2 buses | not capturable | **PASS**: "2 buses are within the venue maximum of 25" |
| Clause references | FAIL | **PASS**: exact section and page on every referenced rule (shown to the organizer) |
| Next action | FAIL | **PASS**: "Submit your Jantar Mantar permission application to the HAX Branch, DCP/New Delhi District, by 21 October 2026." |
| Multiple protests | PASS | PASS, now explicit that remaining capacity is never an entitlement |
| Land-owner NOC | REQUIRED, vague | REQUIRED (Annexure B), with the exact "route not yet verified" wording; no issuer named |
| Notifications feed | synthetic-only | **Still not verified against the real feed**: it is unreachable from this sandbox (HTTP 403 from the proxy). A page-to-candidate pipeline test on a clearly-labelled synthetic fixture now exists, it found and fixed two real parser defects, and `npm run probe:feed` will capture and check the live page on any networked machine. **I could not honestly mark this "real-source integration verified".** |

Facts supplied by the project owner and used as given (not read by me): the Standing Order sections and pages, the HAX Branch location, the DCP/NDD address and telephone, Annexure B's title and pages. The official contact page's URL was not supplied, so the contact **source is stored without a URL** (nothing invented).

## A. Scenario
| | |
|---|---|
| Organizer | Meera Nair, first-time, no Delhi permission experience |
| Event | "Parents for Safe Schools": static, peaceful protest about unsafe school buildings |
| Venue | Jantar Mantar, New Delhi |
| Attendance | 500 |
| Date | 31 Oct 2026 (21 days after the run) |
| Time | 10:30–15:30 (inside the 10:00–17:00 window) |
| Sound | none. Stage/tent: none. March: no. Food: no |
| Vehicles | 2 buses. **The questionnaire only has a yes/no "Vehicles" toggle, so "2" could not be entered** |

## B. User journey (what happened)
1. **Plan a protest.** Chose New Delhi District then venue Jantar Mantar (`01-where`). Entering name and date immediately showed the Date Conflict Check: "Shared venue … No other event is known to us" with a chip "POLICE: NOT CHECKED" (`02-when-with-date-check`). Then format, 500, vehicles = Yes, organizer details (`03`–`06`). Six steps, no large-event step (500 < 1,000), unchanged questionnaire.
2. **Dashboard** (`10-dashboard`). 0%, "You've got work to do. 5 blockers to clear." Live restriction check ("We could not confirm the latest orders"), date conflict check, an "Your application" box, **"Next action: Prior police permission: You need police permission before you gather at Jantar Mantar."**, a timeline with *two* dates (application target 17 Oct; critical deadline 21 Oct), then 5 critical, 18 required, 1 recommended items, each with authority, evidence line and a Details panel.
3. **Preparation pack** (`20-pack`, `21-pack-download`): six documents: event summary, organizer details, route sheet, document checklist, draft request letter, undertaking preparation sheet.
4. **Submission tracking** (`30`–`33`): marked submitted; edited organizer phone (non-material) then attendance 500 to 800 (material); then back to 500 and acknowledged.
5. **T-72h / T-24h** simulated with an injected clock (`52-restriction-and-schedule-facts.json`).
6. **Event-day view** with every item ticked (`51-dashboard-everything-ticked`).

## B2. v0.9.2 journey additions (screens `41`–`44`, `50`, `51`)
After the earlier steps the organizer records the real lifecycle in the "Police permission" panel: submitted (in person, reference DIARY/001), acknowledged (ACK/NDD/0457, stamped copy on phone), then **ticks all 25 checklist items**. The dashboard still says **NOT READY** ("Police permission is not approved (status: Acknowledged)"). Only after the organizer records **Approved** (date from the permission, reference, conditions) does the permission gate clear, and with the restriction feed still unread the state is **STATUS UNKNOWN**. Part 2 then reads the feed (clear → READY WITH WARNINGS because the permission records conditions), adds a pending notification (STATUS UNKNOWN) and an active restriction (NOT READY), and runs T-72h and T-24h rechecks with an injected clock; both appear on the dashboard under "Scheduled rechecks". Facts: `evidence/44-lifecycle.json`, `evidence/52-restriction-and-schedule-facts.json`.

## C. PASS / PARTIAL / FAIL / UNKNOWN
| # | Area | Result | Why (one line) |
|---|---|---|---|
| 1a | Is Jantar Mantar right for 500? | **PASS** | "Maximum 1,000 participants" shown; 500 is inside it. (It is presented as a to-do, not as "you're fine".) |
| 1b | Can several protests happen there? | **PASS** | "Several protests can take place on the same day if there is space and enough time between them … 1,000 in total. Any space left is for the police to allot: it is not guaranteed to you." |
| 1c | Known conflict on the day | **PARTIAL** | Only BookMyProtest's own knowledge exists. The police side reads "NOT CHECKED"; nobody is recording official checks yet. |
| 1d | "No conflict found" is not availability | **PASS** | Wording is explicit; no "available" state exists. |
| 2 | Deadline | **PASS** | "Apply at least 10 days ahead … 21 October 2026", event day excluded, late-application caveat. *UX note:* a second date (17 Oct, our 14-day buffer) is shown above it and can confuse. |
| 3a | Which authority | **PASS** | "DCP, New Delhi District (Delhi Police)" on every row. |
| 3b | Where/how to submit | **PASS** (location, branch, telephone) / **UNKNOWN** (electronic) | "Submit at the HAX Branch of the DCP/NDD office, Office Complex, Police Station Parliament Street, Sansad Marg, New Delhi 110001, tel. 011-23747777." Email/online is stated as NOT verified; no email is stored or implied. (was UNKNOWN) |
| 3c | Clause-level evidence | **PASS** | Every cited rule shows its exact section/page (e.g. "Section 3(i), PDF page 3"; "Section 4(ii), PDF page 4"; "Annexure B, PDF pages 11–14"). Sections the owner did not supply are left blank, not guessed. (was FAIL) |
| 3d | Police contact source | **PASS** | DCP/NDD office, Parliament Street / Sansad Marg, 011-23747777, stored with its URL (Delhi Police RTI Manual-16, 17.04.2026) and retrieval date (2026-10-10). No email shown: see Legal gaps. |
| 3e | Land-owner NOC | **PARTIAL** | REQUIRED (Annexure B). Issuer context NDMC; submission route UNKNOWN; certainty COURT_VERIFIED_CONTEXT + OPERATIONAL_ROUTE_UNVERIFIED, shown as labelled facts. No NDMC link is offered. |
| 3f | Notifications feed status | **PASS** (distinction) / **PENDING** (real page) | SOURCE_VERIFIED, FETCH_IN_THIS_ENVIRONMENT_BLOCKED and PARSER_REAL_PAGE_VERIFICATION_PENDING are separate, stored flags; PARSER_REAL_PAGE_VERIFIED does not exist for this source. |
| 4a | Online / physical / email | **PARTIAL** | Physical submission known; online/email explicitly unverified, which is the honest answer. (was UNKNOWN) |
| 4b | Form vs letter vs undertaking | **PASS** | The undertaking is Annexure B (pages 11–14), linked as "View official Annexure B"; our sheet is labelled "Prepared from official Annexure B — verify against the current official form before submission" and says it is not the official form. The request letter lists the undertaking and the land-owner NOC as enclosures. (was PARTIAL) |
| 4c | Who signs | **PARTIAL** | The organizer gives the undertaking (stated); who signs the application is not. |
| 4d | Keep the acknowledgement | **PASS** | The permission panel asks for the acknowledgement/reference number and where the stamped copy is kept, and stores both. (was FAIL) |
| 4e | Status to track afterwards | **PASS** | Eight explicit states (NOT_STARTED, PREPARED, SUBMITTED, ACKNOWLEDGED, APPROVED, REJECTED, WITHDRAWN, EXPIRED), each recorded by the organizer with date/time, method, reference, evidence reference, approval date and conditions. Only valid next steps are offered; APPROVED needs the date from the permission. (was FAIL) |
| 5a | Consolidated preparation list | **PARTIAL** | A "Document checklist" exists but is the full rules list (limits, prohibitions, documents, commitments mixed). |
| 5b | REQUIRED / CONDITIONAL / RECOMMENDED / UNKNOWN separation | **FAIL** | 22 of 24 rows say "REQUIRED"; no CONDITIONAL or UNKNOWN grouping; limits ("No weapons") sit beside documents to produce. Land-owner NOC is "REQUIRED" yet issuer unknown. |
| 5c | Items present | **PARTIAL** | Everything is listed, each with its exact Standing Order section and page. Liaison, volunteer count, water and first-aid arrangements still have nowhere to enter details. |
| 6a | Traffic NOC applies to 2 buses | **PASS** | Shown (CRITICAL) with the authority DCP (Headquarters), Delhi Traffic Police HQ. |
| 6b | Traffic NOC steps | **UNKNOWN** | "We have not verified the application steps, fee or processing time." |
| 6c | Bus parking | **PASS / PARTIAL** | Rule and road verified (Section 4(ii), PDF p. 4: designated Jai Singh Road location specified in the permission, or another place the police direct). We state we do not promise an exact bay. The precise point stays event-specific. (was UNKNOWN) |
| 6d | Extra bus information to submit | **PARTIAL** | The plan now captures the number of buses and shows "2 buses are within the venue maximum of 25"; whether the application must carry bus details is still not established. (was FAIL) |
| 7 | Live restrictions | **PARTIAL** | Wording is safe in all four states. The panel now also says the automatic reading of the feed is not yet verified against the live page. Still not shown on the restriction card: effective period, geographic scope, issuer, review status (P1). |
| 8 | Date conflict intelligence | **PASS** | Shared capacity; others inform not block; BMP-only data labelled; no "available". |
| 9a | Event brief | **PASS** | Accurate, includes purpose. |
| 9b | Police request draft | **PARTIAL** | Usable, but dates are ISO ("2026-10-31"), it never lists enclosures (undertaking, land-owner NOC), never mentions buses (count), and does not tell the organizer to apply by 21 Oct. |
| 9c | Undertaking preparation copy | **PASS** | Linked to the official Annexure B, labelled as a preparation copy, explains what to sign. (was PARTIAL) |
| 9d | Submission checklist | **FAIL** | None. The "Document checklist" is a rules tick-list, not "what to put in the envelope". |
| 9e | Traffic-related item | **FAIL** | Rule lists "Traffic NOC application" as a document but no template or checklist item is produced. |
| 9f | Event-day checklist | **FAIL** | None generated. |
| 10 | Exact next action | **PASS** | "Submit your Jantar Mantar permission application to the HAX Branch, DCP/New Delhi District, by 21 October 2026." (was FAIL) |
| 11a | Recording submission | **PASS** | Real date/time, method (in person / post / email / online / other) and acknowledgement reference are stored; history is append-only. (was PARTIAL) |
| 11b | Non-material edit | **PASS** | Phone change recorded, **no** warning. |
| 11c | Material edit | **PASS** | Crowd 500 to 800 raised the re-confirm banner naming "expected crowd". |
| 11d | New snapshot, history intact | **PASS** | Snapshots 1 to 3; first evaluation byte-identical afterwards. |
| 12a | T-72h / T-24h live restrictions + feed freshness | **PASS** | Both ran once at the right instant (31 Oct 10:30 IST), recorded `RESTRICTIONS_APPLY`. |
| 12b | …permission status, restrictions and unreviewed candidates, source freshness, venue/date conflict, material changes, unresolved critical items | **PASS** | Each scheduled recheck evaluates all six and stores a snapshot (`readiness_snapshots`: state, reasons, inputs). Verified for T-72h and T-24h with an injected clock, idempotently. (was FAIL) |
| 12c | Organizer is told | **PARTIAL** | The dashboard shows "Scheduled rechecks: what we found at 72 and 24 hours before" with the state and reasons. It is not pushed: there is no email or notification channel, so the organizer sees it when they open the plan. (was FAIL) |
| 13 | Event-day readiness (READY / READY WITH WARNINGS / NOT READY / STATUS UNKNOWN) | **PASS** | A deterministic engine, never the percentage. Walked through the UI: fresh plan NOT_READY; submitted NOT_READY; acknowledged NOT_READY; **every checklist item ticked without approval: still NOT_READY** ("Police permission is not approved"); approved but the feed unread: STATUS_UNKNOWN; feed read and clear: READY_WITH_WARNINGS (the approval's own conditions are a warning); an applicable restriction: NOT_READY; unreviewed notification: STATUS_UNKNOWN. (was FAIL) |

### Live restriction wording across the four states (`52-…json`, part 2)
| State | What the product said | Verdict |
|---|---|---|
| Feed never read | "We could not confirm the latest orders … has not been checked yet." | PASS |
| Feed read, nothing recorded | "No temporary restriction is recorded for your date and place as of …, based on the Delhi Police Notifications (last checked …). New orders can be issued at short notice." | PASS (never "no restrictions apply") |
| Unreviewed notification | "No temporary restriction is recorded … but 1 new notification is awaiting review." | PASS |
| Restriction recorded | "1 temporary restriction may affect your event: <title>. Please verify." plus a separate card with explanation and basis | PARTIAL: no effective dates, scope, issuing authority, source link or review status on the card |

## D. Screens that evidence the failures
*(Initial-run observations. Items marked fixed no longer reproduce in the re-run; the initial text evidence is kept in `evidence-initial-run/`.)*
| Failure | Where to look |
|---|---|
| Generic "next action" | `images/10-dashboard.png`, top, "Next action" |
| Two competing dates (17 Oct vs 21 Oct) | `images/10-dashboard.png`, "Timeline" |
| Everything "REQUIRED"; no CONDITIONAL/UNKNOWN grouping | `images/10-dashboard.png`, "What needs doing" |
| No bus count, stage/food toggles change nothing | `images/05-use.png` |
| "Police: not checked" | `images/02-when-with-date-check.png`, `10-dashboard.png` |
| Restriction card lacks period/scope/source/status | `images/50-dashboard-restriction-in-force.png` |
| "You're prepared." with a live restriction (old wording) | `images/51-dashboard-everything-ticked.png` |
| No submission/traffic/event-day documents; undertaking form not linked | `evidence/21-pack-download.txt` |
| Hero "GET QUOTES" before compliance is established | `images/10-dashboard.png`, hero |

## E. External-dependency ledger
Every point the organizer must leave the product. "Solvable" = answerable from public data if a current official source can be found.

| # | Question | State | Why BookMyProtest could not answer | External action required | Solvable via public data? | Reduces effort? | Priority |
|---|---|---|---|---|---|---|---|
| 1 | Is email or an online route accepted for submission? | PARTIAL (in-person route now known) | Standing Order and district details give a physical HAX Branch address and telephone; no authoritative source says email/online is accepted | Call 011-23747777 only if the organizer wants to use email | Maybe | Medium (most organizers will submit in person) | P1 |
| 2 | Where is the official undertaking form? | **SOLVED** | Annexure B, PDF pages 11–14, linked from the row and the pack | none | n/a | n/a | done |
| 3 | How is the land-owner (NDMC) NOC obtained? | PARTIAL (issuer context known, route UNKNOWN) | NDMC is identified in judicial material (owner-supplied) as the land-owning agency; no current NDMC application channel is sourced; we offer none | A concierge call to NDMC, or the Standing Order / NDMC notice if one is found | Maybe | High: it is a critical required enclosure | **P0 for self-serve; acceptable for a concierge pilot** |
| 4 | Traffic NOC: how, where, fee, time, what to attach for 2 buses | UNKNOWN | Page confirms mandatory only; procedure not found | Call Traffic HQ, Todapur | Maybe (page may list a form or portal) | High | **P1** |
| 5 | Which exact parking point for the buses? | PARTIAL (road known) | Jai Singh Road designated location is specified in the issued permission; exact point is event-specific | Read the issued permission; ask the DCP/NDD office if it names none | No (set per event) | Low | P2 |
| 6 | Is the Section 163 notification feed clear today? | PARTIAL | Feed publicly accessible per the owner but **unreachable from this sandbox**, so the live fetch and parser are still unverified against the real page; fixture + probe script added | Run `npm run probe:feed` once on a networked machine | **Yes** | High | **P0** |
| 7 | Does the police office hold another application for 31 Oct? | UNKNOWN | No official check is ever recorded; BMP knows only its own users | Ask the police | No (not published) | Low-medium; shared venue, informational | P2 |
| 8 | What to keep as proof and what status to expect | **SOLVED** | Permission panel: status, reference, stamped-copy location, conditions | none | n/a | n/a | done |
| 9 | Police liaison / volunteer count / water / first aid arrangements | PARTIAL | No fields to capture; sheet shows blanks | Organizer decides | n/a (organizer data) | Medium | P1 |
| 10 | Whether to apply before 21 Oct or 17 Oct | PARTIAL | Two dates shown | None, but confusing | n/a | Low, cheap fix | P1 |
| 11 | Whether the time window and bus cap apply to this plan | PARTIAL | Shown only as tick-list items; no check against the entered time or bus count | Self-check | n/a | Medium | P1 |
| 12 | What is actually in the Standing Order (clause numbers) | PARTIAL (references now recorded) | References come from the owner's review, not from our reading of the PDF | Reviewer confirms the references against the PDF | Yes | Medium (trust) | P1 |

## F. Legal / evidence gaps
1. **Clause references and the Delhi rules are the owner's, not independently read by BookMyProtest.** "Primary source verified · Last verified: <date>" reports the owner's verification (in this run, a simulated load). Before the pilot a person confirms each reference against the PDF and publishes. (Pilot precondition, not a product gap.)
2. **NDMC as land-owning agency is owner-supplied and uncorroborated by my search** (the NGT order names NDMC as a respondent; I found no passage about ownership). It is labelled that way in the source notes; a paragraph reference is needed. If it is wrong, the row would point organizers at the wrong body, so a concierge must confirm it with the first organizer.
3. **NDMC NOC submission route: UNKNOWN.** No channel is offered and no generic NDMC page is linked.
4. **Contact source is an RTI officers' list**, not a district contact page, and was seen through a search result, not fetched. The address and number match what the owner supplied. **Email**: two Delhi Police lists disagree (and one prefix looks like another district), so none is shown. Email is never a submission channel.
5. **Notifications integration**: `SOURCE_VERIFIED`, `FETCH_IN_THIS_ENVIRONMENT_BLOCKED`, `PARSER_REAL_PAGE_VERIFICATION_PENDING`. Not production verified until `npm run probe:feed` succeeds outside the sandbox and a person records `PARSER_REAL_PAGE_VERIFIED`.
6. The HAX Branch clause is cited under Section 3(i) with a note that its exact clause is not separately recorded.
7. L&O/10/2022 remains metadata only (intentional); not applicable to this static scenario.

## G. UX gaps
1. ~~"Next action" is a rule title~~ **Fixed in v0.9.1**: it now names the branch and the calculated date.
2. Two deadline dates (17 Oct buffer, 21 Oct legal) compete (P1).
3. All rows are "REQUIRED"; no grouping into must-do-before-applying, must-do-before-the-day, limits to respect, unknown (P0/P1).
4. The percentage ring is large, and for this scenario meaningless at 0% until permission exists; no READY/NOT READY statement (P0).
5. The restriction card hides scope/effective dates/source/review status (P1).
6. (Buses are now captured.) Questions that change nothing: *Stage*, *Food or water*, *organizer type*, *end time* alter no requirement for Delhi. *Vehicles* is yes/no, but the one thing that matters (how many buses) cannot be entered (P1).
7. Hero "GET QUOTES" sits above the compliance list (P2, see I).
8. Letter dates are ISO (2026-10-31) for a police office (P2).

## H. Product gaps
*Closed in v0.9.2:* permission lifecycle and evidence-based event-day state; scheduled rechecks that cover permission, restrictions, freshness, venue, changes and critical items, persisted and shown.
*Closed earlier:* undertaking link, submission location/contact, bus count and parking wording, clause references, next action.
Remaining:
1. Rechecks are **pulled, not pushed**: there is no email/notification channel, so the organizer sees a T-72h/T-24h result only when they open the plan. (P1)
2. No **submission checklist / event-day checklist / traffic NOC** documents. (P1)
3. The restriction card still omits effective period, scope, issuer and review status. (P1)
4. Venue conflict intelligence depends on recorded official checks; the police side reads "not checked". (P2)
5. Checklist ticks are still self-asserted (by design); only the permission gate and critical items affect readiness.

## I. Monetization signals (no payments implemented; none should appear before the compliance need is established)
| Need | Mark | Natural moment |
|---|---|---|
| Buses (2 buses) | **NEEDED** (the organizer said so) | On "Maximum 25 buses" / "Designated parking" rows, **after** the Traffic NOC item is understood. The row-level "Get quotes" that exists is in the right place |
| Drinking water | **NEEDED** (a listed commitment) | On the "Drinking water and first aid" row |
| First aid / medical | **NEEDED** (same row) | Same row |
| Volunteers / stewards | **NEEDED** ("Volunteers and contact list") | Same row |
| Printing (banners) | **POSSIBLY NEEDED** | "Banner size limits" row, after the size rule is read |
| Printing of application / pack | **POSSIBLY NEEDED** | After pack generation |
| Clean-up | **POSSIBLY NEEDED** | "No littering" row |
| Legal review | **POSSIBLY NEEDED** | Only after submission-method and NOC gaps are shown; never as a substitute for answering them |
| Sound, stage, tent, food stall | **NOT NEEDED** | none; do not prompt |

The header "Get quotes" button (top of the dashboard, next to "Generate my preparation pack") appears **before** the organizer has seen any requirement. That violates the trust rule and should be removed or demoted once the per-row prompts carry the load.

## J. Calls and searches eliminated (qualitative, not precise)
**Without BookMyProtest**: roughly **10–12** independent searches or calls.

**With BookMyProtest after v0.9.2**, still needed: how the NDMC land-owner NOC is obtained (1 call; unresolvable from our data), the Traffic NOC procedure (1 call, to Traffic HQ), the live notifications page until the parser is proven (0–1), and optionally one call to 011-23747777 about email. About **2–4 contacts, realistically 2 phone calls**, both of which a concierge can make with the organizer.

**External effort eliminated ≈ 8 of ~11**, unchanged from v0.9.1: v0.9.2 did not remove calls so much as remove the *risk of a silent wrong answer* (tick-box readiness) and make the application trackable.

## K. Fixes
**Done in v0.9.2:** contact source with URL and retrieval date; Notifications integration statuses kept distinct; NDMC issuer context with route UNKNOWN; permission lifecycle (eight states, dates, method, reference, evidence reference, conditions); deterministic readiness engine replacing the percentage as the headline; T-72h/T-24h rechecks of six inputs stored as snapshots and shown. The number is relabelled "checklist progress, not permission".

**Pilot preconditions (people, before the first organizer; nothing here is code)**
1. The owner confirms each clause reference against the Standing Order PDF, sets a real verification date, and publishes the Delhi rules. (Do not run `--go-live` until then.)
2. Someone with network access runs `npm run probe:feed`, calibrates the parser if needed, commits the captured fixture, and records `PARSER_REAL_PAGE_VERIFIED`. Until then the concierge reads the Notifications page by hand each day (the product already says so).
3. The concierge confirms the NDMC attribution and the NOC route with the first organizer, and tells them email is not a verified submission channel.
4. A reviewer confirms the DCP/NDD contact entry or attaches the district's own contact page.

**P1:** push notifications for rechecks; submission / traffic-NOC / event-day documents; richer restriction card; one deadline only; group the checklist; capture liaison / volunteer / water / first-aid details.
**P2:** remove the hero "Get quotes"; drop questions that change nothing; Jantar Mantar official venue checks.

## L. Final verdict
**READY FOR PRIVATE PILOT**

Scope and condition, stated plainly: **a concierge-assisted private pilot, not self-serve**, and only after the four pilot preconditions above. Every P0 product blocker from the earlier runs is closed: the organizer knows where to go, what to sign, which road the buses use and what to do next; the permission is tracked as a lifecycle that only a person can advance; "ready" can no longer be reached by ticking boxes; and the system re-checks its own position at 72 and 24 hours and says what it found.

Judgement on the remaining unknown, the NDMC NOC route: it is **survivable for a concierge pilot** because (a) the product states exactly what is and is not known (issuer context NDMC, route UNKNOWN, no link), so the organizer is not misled; (b) it is a single, bounded question that an operator can resolve with one call and then record for every later organizer; and (c) the NOC is already a CRITICAL required item, so event-day readiness cannot be reached without it. It would **not** be survivable for self-serve use: an organizer alone would still have to find the route, and the NDMC attribution itself still needs a paragraph reference.

I would flip this back to NOT READY if any precondition fails, in particular if the pilot is self-serve, if the Delhi rules are published without a person confirming the clause references, or if the NDMC attribution turns out to be wrong.

---

## TheDuck challenge pass
| Question | Finding |
|---|---|
| Legal information vs operational help? | We mostly give the first. The organizer's hardest question ("where do I physically send this and who do I call?") is unanswered. The product explains *what the rules are* better than *what to do on Monday*. |
| "Verified" where only a source's existence is verified? | **Yes.** "Primary source verified · Last verified 1 October" appears with no clause reference, and the PDF was never read by the product's builder. The label reports the owner's say-so and the load date. Needs reviewer-entered references. |
| Making users interpret legal language? | Largely not: plain-English rows. But the undertaking is left as "submit the official form" without the form, which pushes interpretation back to the user. |
| Hiding uncertainty behind a score? | **Fixed in v0.9.2.** Readiness is a deterministic state with stated reasons; ticking every item still reads NOT READY until the organizer records an approval; the number is labelled "checklist progress, not permission". Residual risk: ticks remain self-asserted, so the land-owner NOC is only as sound as the organizer's tick. |
| Questions that do not change output? | **Yes**: stage, food/water, organizer type and end time change nothing for this Delhi plan; "vehicles" cannot take the number that matters. |
| Vendor demand created artificially? | Mostly responsive (rows tied to listed commitments), but the hero "Get quotes" precedes understanding. |
| Features present because they sound impressive? | The percentage ring and "Shared venue/conflict intelligence" elaborate machinery out-weigh the missing basics (submission details, form link, status). Conflict intelligence is correct but, with no official checks recorded, mostly answers "not checked". |
