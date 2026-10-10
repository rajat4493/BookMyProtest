# Acceptance test v0.9 (re-run as v0.9.1): Jantar Mantar, 500 people, first-time organizer

Run date: 2026-10-10. First run on v0.8.0 (initial evidence kept in `evidence-initial-run/`); **re-run after the v0.9.1 gap closure on the same scenario** (current evidence in `evidence/`, `images/`). Two bus-count details changed in the scenario: it now enters **2 buses**, which the questionnaire can capture.
Evidence: `docs/acceptance/evidence/*.txt` (exactly what the organizer saw, as text) and `docs/acceptance/images/*.png` (full-page mobile screenshots).
Scripts: `scripts/acceptance-jm-500.mjs` (UI journey) and `scripts/acceptance-jm-500-part2.ts` (live-restriction states, T-72h/T-24h with an injected clock, "everything ticked" view).

## How to read this report (honest limits)
- **The Delhi rules are not published in the real database.** To run the journey I used the *test* database and loaded the corpus with the loader's `confirmVerified` switch, i.e. **as if the project owner had verified every rule**. Nothing was published or enabled anywhere real; no `--go-live`; the dev database still holds Delhi as drafts. The "Last verified: 1 October 2026" the organizer sees is the date of that simulated load, not an independent check.
- **No official page was read by me.** The Standing Order PDF, the Traffic Police page and the Notifications feed are all unreachable from this sandbox. Everything the product says about Delhi rests on the project owner's summary. So "Primary source verified" on screen means "the owner says the Standing Order says this", not "BookMyProtest read the clause" (no section references are recorded).
- The Notifications feed has **never been fetched** in any environment I have access to, so the live check's real-world behaviour is unproven. The restriction found in part 2 is **synthetic test data**, labelled as such.
- I judged as a first-time organizer would, from the screens and the downloaded pack, not from the code.

---

## What changed in the v0.9.1 re-run (before / after)
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
| 4a | Online / physical / email | **PARTIAL** | Physical submission known; online/email explicitly unverified, which is the honest answer. (was UNKNOWN) |
| 4b | Form vs letter vs undertaking | **PASS** | The undertaking is Annexure B (pages 11–14), linked as "View official Annexure B"; our sheet is labelled "Prepared from official Annexure B — verify against the current official form before submission" and says it is not the official form. The request letter lists the undertaking and the land-owner NOC as enclosures. (was PARTIAL) |
| 4c | Who signs | **PARTIAL** | The organizer gives the undertaking (stated); who signs the application is not. |
| 4d | Keep the acknowledgement | **FAIL** | Not mentioned anywhere. |
| 4e | Status to track afterwards | **FAIL** | Only "I've submitted" and "I've received an approval" buttons; no status concept, no date or reference field. |
| 5a | Consolidated preparation list | **PARTIAL** | A "Document checklist" exists but is the full rules list (limits, prohibitions, documents, commitments mixed). |
| 5b | REQUIRED / CONDITIONAL / RECOMMENDED / UNKNOWN separation | **FAIL** | 22 of 24 rows say "REQUIRED"; no CONDITIONAL or UNKNOWN grouping; limits ("No weapons") sit beside documents to produce. Land-owner NOC is "REQUIRED" yet issuer unknown. |
| 5c | Items present | **PARTIAL** | Everything is listed, each with its exact Standing Order section and page. Liaison, volunteer count, water and first-aid arrangements still have nowhere to enter details. |
| 6a | Traffic NOC applies to 2 buses | **PASS** | Shown (CRITICAL) with the authority DCP (Headquarters), Delhi Traffic Police HQ. |
| 6b | Traffic NOC steps | **UNKNOWN** | "We have not verified the application steps, fee or processing time." |
| 6c | Bus parking | **PASS / PARTIAL** | Rule and road verified (Section 4(ii), PDF p. 4: designated Jai Singh Road location specified in the permission, or another place the police direct). We state we do not promise an exact bay. The precise point stays event-specific. (was UNKNOWN) |
| 6d | Extra bus information to submit | **PARTIAL** | The plan now captures the number of buses and shows "2 buses are within the venue maximum of 25"; whether the application must carry bus details is still not established. (was FAIL) |
| 7 | Live restrictions | **PARTIAL** | Wording is safe in all four states (below). Not shown: geographic scope, effective period, review status. Feed never actually fetched. |
| 8 | Date conflict intelligence | **PASS** | Shared capacity; others inform not block; BMP-only data labelled; no "available". |
| 9a | Event brief | **PASS** | Accurate, includes purpose. |
| 9b | Police request draft | **PARTIAL** | Usable, but dates are ISO ("2026-10-31"), it never lists enclosures (undertaking, land-owner NOC), never mentions buses (count), and does not tell the organizer to apply by 21 Oct. |
| 9c | Undertaking preparation copy | **PASS** | Linked to the official Annexure B, labelled as a preparation copy, explains what to sign. (was PARTIAL) |
| 9d | Submission checklist | **FAIL** | None. The "Document checklist" is a rules tick-list, not "what to put in the envelope". |
| 9e | Traffic-related item | **FAIL** | Rule lists "Traffic NOC application" as a document but no template or checklist item is produced. |
| 9f | Event-day checklist | **FAIL** | None generated. |
| 10 | Exact next action | **PASS** | "Submit your Jantar Mantar permission application to the HAX Branch, DCP/New Delhi District, by 21 October 2026." (was FAIL) |
| 11a | Marked submitted | **PARTIAL** | Works; the date is "now", not the real submission date; no acknowledgement/reference field. |
| 11b | Non-material edit | **PASS** | Phone change recorded, **no** warning. |
| 11c | Material edit | **PASS** | Crowd 500 to 800 raised the re-confirm banner naming "expected crowd". |
| 11d | New snapshot, history intact | **PASS** | Snapshots 1 to 3; first evaluation byte-identical afterwards. |
| 12a | T-72h / T-24h live restrictions + feed freshness | **PASS** | Both ran once at the right instant (31 Oct 10:30 IST), recorded `RESTRICTIONS_APPLY`. |
| 12b | …venue conflicts, material changes, permission status, unresolved critical items | **FAIL** | Scheduled checks only re-check the restriction feed. |
| 12c | Organizer is told | **FAIL** | No email/notification exists. A result is only visible if the organizer opens the dashboard. |
| 13 | Event-day readiness (READY / READY WITH WARNINGS / NOT READY / UNKNOWN) | **FAIL** | A percentage and a mood headline only. With everything ticked it said "You're prepared." beside a live restriction warning (**fixed to wording only, below**). Ticking "Prior police permission" does not require permission to exist. |

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
| 3 | Who is the land-owner and how is the NOC obtained? | UNKNOWN | Not in the owner's summary; `DEL-JM-022` says ask the police | Ask police / land-owning agency | Possibly (Standing Order undertaking text, past permissions) | High: a CRITICAL blocker with no route to resolve it | **P0** |
| 4 | Traffic NOC: how, where, fee, time, what to attach for 2 buses | UNKNOWN | Page confirms mandatory only; procedure not found | Call Traffic HQ, Todapur | Maybe (page may list a form or portal) | High | **P1** |
| 5 | Which exact parking point for the buses? | PARTIAL (road known) | Jai Singh Road designated location is specified in the issued permission; exact point is event-specific | Read the issued permission; ask the DCP/NDD office if it names none | No (set per event) | Low | P2 |
| 6 | Is the Section 163 notification feed clear today? | PARTIAL | Feed publicly accessible per the owner but **unreachable from this sandbox**, so the live fetch and parser are still unverified against the real page; fixture + probe script added | Run `npm run probe:feed` once on a networked machine | **Yes** | High | **P0** |
| 7 | Does the police office hold another application for 31 Oct? | UNKNOWN | No official check is ever recorded; BMP knows only its own users | Ask the police | No (not published) | Low-medium; shared venue, informational | P2 |
| 8 | What to keep as proof and what status to expect | FAIL | No acknowledgement/status model | Common sense, ask the office | Partly (practice) | Medium | **P1** |
| 9 | Police liaison / volunteer count / water / first aid arrangements | PARTIAL | No fields to capture; sheet shows blanks | Organizer decides | n/a (organizer data) | Medium | P1 |
| 10 | Whether to apply before 21 Oct or 17 Oct | PARTIAL | Two dates shown | None, but confusing | n/a | Low, cheap fix | P1 |
| 11 | Whether the time window and bus cap apply to this plan | PARTIAL | Shown only as tick-list items; no check against the entered time or bus count | Self-check | n/a | Medium | P1 |
| 12 | What is actually in the Standing Order (clause numbers) | PARTIAL (references now recorded) | References come from the owner's review, not from our reading of the PDF | Reviewer confirms the references against the PDF | Yes | Medium (trust) | P1 |

## F. Legal / evidence gaps
1. **Clause references are now recorded and shown, but they are the owner's, not independently read by BookMyProtest.** "Primary source verified · Last verified: <date>" still reports the owner's verification and the (simulated) load date. A reviewer should open the PDF and confirm each reference, then set a real verification date. (P1; was P0)
2. The 10-day rule's *current-practice* evidence (police statements, December 2025 refusal letter) still has no attached documents; press reports are labelled "lead only".
3. **Land-owner NOC**: REQUIRED by Annexure B; issuer and submission route UNKNOWN / UNDER REVIEW. This is stated in plain words, and no issuer is named.
4. **HAX Branch**: the clause that states the location is not separately recorded (cited under Section 3(i)); the owner should supply it.
5. **Email / online submission**: not established by any source. We say so and store no email.
6. The Notifications **parser has never met the real page**. Two defects were found and fixed by the fixture pipeline test (newlines flattened, so several orders on one page merged into one candidate; an order number such as "12/DCP/NW/2026" was read as the issuing authority "DCP").
7. L&O/10/2022 remains metadata only (intentional); it does not apply to this static scenario.

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
1. No **permission status** (not applied / applied / acknowledged / granted / refused) and no real submission date or acknowledgement reference. (P0)
2. No **event-day readiness** state (READY / READY WITH WARNINGS / NOT READY / UNKNOWN); ticks are self-asserted. (P0)
3. T-72h/T-24h checks are restriction-only and silent. (P1)
4. No **submission checklist / event-day checklist / traffic NOC** documents. (P1)
5. Venue conflict intelligence depends on recorded official checks; the police side reads "not checked". (P2)
*Closed in v0.9.1:* undertaking link, submission location/contact, bus count and parking wording, exact clause references, next action.

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
**Without BookMyProtest**: roughly **10–12** independent searches or calls (governing order, deadline, which office, how to submit, the form, land-owner NOC, Traffic NOC, bus parking, live Section 163 orders, clashing events, allowed hours and limits, water/medical/volunteers).

**With BookMyProtest after v0.9.1**, still needed: land-owner NOC route (1 call, unresolvable from our data), Traffic NOC procedure (1 call, to Traffic HQ), the live notifications page (0–1 once the feed is proven), and optionally one call to 011-23747777 to ask whether email is accepted. That is about **2–4 contacts, realistically 2 phone calls**.

**External effort eliminated ≈ 8 of ~11** (was ≈ 6). The gain came from the *operational* answers: where to go, which form, which road for the buses, and what to do next.

## K. Fixes
**Done earlier in v0.9 (wording):** the 100% headline now reads "Checklist complete. Ticking items is not permission…" and press reports are labelled "lead only".

**Done in v0.9.1 (the verified P0 gaps)**
- Submission: HAX Branch, address and telephone shown on the rows and in the next action; official contact source stored (no URL invented); no email stored or implied.
- Annexure B linked ("View official Annexure B", PDF pages 11–14); generated sheet labelled "Prepared from official Annexure B — verify against the current official form before submission".
- Exact section and page references on the Jantar Mantar rules, displayed in the evidence line and the Sources list.
- Bus count captured; 2 buses within the maximum of 25; over 25 is critical; Jai Singh Road parking wording without guaranteeing a bay.
- Shared-capacity wording: remaining capacity is never an entitlement.
- Land-owner NOC wording per Annexure B with no route claimed.
- Notifications pipeline fixture, two parser fixes, `npm run probe:feed`.
- Next action is now data (`{deadline}` is filled from the plan).

**Still P0 before any private pilot**
1. **Permission status + real submission date + acknowledgement reference**, and an event-day state derived from evidence (e.g. "NOT READY because police permission is not confirmed"). A tick must not equal permission.
2. **Run `npm run probe:feed` against the real Notifications page**, calibrate the parser to its markup, and commit the captured fixture. Until then the live check is unproven.
3. **Human verification and publication of the Delhi rules** (clause references confirmed against the PDF; a real verification date). The Delhi rules are still drafts in the real database, and nothing here changes that.
4. **Land-owner NOC route** (required, unresolved): either sourced or accepted by pilot organizers as a known "ask the DCP/NDD office" step.

**P1**: group the list (apply-with / before the day / limits / unknown); one deadline only; restriction card with period, scope, source and review status; Traffic NOC steps; scheduled checks that also look at venue signals and permission status **and tell the organizer**; submission, traffic and event-day documents; date format in the letter; check time and bus count against the venue's limits.

**P2**: remove the hero "Get quotes"; drop questions that change nothing (Stage, Food); official venue-check records for Jantar Mantar's police side.

## L. Final verdict
**NOT READY FOR PRIVATE PILOT**

The v0.9.1 closure removed the biggest *operational* gaps: the organizer now knows where to go, what to sign, which road the buses use, and what to do next, with clause-level references. It is not enough to flip the verdict, because the remaining P0 blockers are real: (1) there is no permission status or evidence-based event-day state, so "Checklist complete" can still sit beside an unconfirmed permission; (2) the live-restriction feed and parser have never touched the real page; (3) the Delhi rules are unpublished and their references have not been confirmed by a person against the PDF; (4) the land-owner NOC, a critical required item, has no verified route. Items 2 and 3 are small and need a person with network access; item 1 is the one piece of product work left. When those four are done the verdict can be reconsidered.

---

## TheDuck challenge pass
| Question | Finding |
|---|---|
| Legal information vs operational help? | We mostly give the first. The organizer's hardest question ("where do I physically send this and who do I call?") is unanswered. The product explains *what the rules are* better than *what to do on Monday*. |
| "Verified" where only a source's existence is verified? | **Yes.** "Primary source verified · Last verified 1 October" appears with no clause reference, and the PDF was never read by the product's builder. The label reports the owner's say-so and the load date. Needs reviewer-entered references. |
| Making users interpret legal language? | Largely not: plain-English rows. But the undertaking is left as "submit the official form" without the form, which pushes interpretation back to the user. |
| Hiding uncertainty behind a score? | **Yes.** 0% to 100% with an "unknown" NOC and a live restriction could show "You're prepared." (fixed in wording, structurally still open: readiness has no UNKNOWN state). |
| Questions that do not change output? | **Yes**: stage, food/water, organizer type and end time change nothing for this Delhi plan; "vehicles" cannot take the number that matters. |
| Vendor demand created artificially? | Mostly responsive (rows tied to listed commitments), but the hero "Get quotes" precedes understanding. |
| Features present because they sound impressive? | The percentage ring and "Shared venue/conflict intelligence" elaborate machinery out-weigh the missing basics (submission details, form link, status). Conflict intelligence is correct but, with no official checks recorded, mostly answers "not checked". |
