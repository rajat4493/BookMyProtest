# Acceptance test v0.9: Jantar Mantar, 500 people, first-time organizer

Run date: 2026-10-10. Build: v0.8.0 plus two wording fixes made during this run (see "Fixed during the run").
Evidence: `docs/acceptance/evidence/*.txt` (exactly what the organizer saw, as text) and `docs/acceptance/images/*.png` (full-page mobile screenshots).
Scripts: `scripts/acceptance-jm-500.mjs` (UI journey) and `scripts/acceptance-jm-500-part2.ts` (live-restriction states, T-72h/T-24h with an injected clock, "everything ticked" view).

## How to read this report (honest limits)
- **The Delhi rules are not published in the real database.** To run the journey I used the *test* database and loaded the corpus with the loader's `confirmVerified` switch, i.e. **as if the project owner had verified every rule**. Nothing was published or enabled anywhere real; no `--go-live`; the dev database still holds Delhi as drafts. The "Last verified: 1 October 2026" the organizer sees is the date of that simulated load, not an independent check.
- **No official page was read by me.** The Standing Order PDF, the Traffic Police page and the Notifications feed are all unreachable from this sandbox. Everything the product says about Delhi rests on the project owner's summary. So "Primary source verified" on screen means "the owner says the Standing Order says this", not "BookMyProtest read the clause" (no section references are recorded).
- The Notifications feed has **never been fetched** in any environment I have access to, so the live check's real-world behaviour is unproven. The restriction found in part 2 is **synthetic test data**, labelled as such.
- I judged as a first-time organizer would, from the screens and the downloaded pack, not from the code.

---

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
| 1b | Can several protests happen there? | **PASS** | "Shared venue … not reserved to one organiser." |
| 1c | Known conflict on the day | **PARTIAL** | Only BookMyProtest's own knowledge exists. The police side reads "NOT CHECKED"; nobody is recording official checks yet. |
| 1d | "No conflict found" is not availability | **PASS** | Wording is explicit; no "available" state exists. |
| 2 | Deadline | **PASS** | "Apply at least 10 days ahead … 21 October 2026", event day excluded, late-application caveat. *UX note:* a second date (17 Oct, our 14-day buffer) is shown above it and can confuse. |
| 3a | Which authority | **PASS** | "DCP, New Delhi District (Delhi Police)" on every row. |
| 3b | Where/how to submit | **UNKNOWN** | Product says plainly "we have not verified how it is submitted". No office address, contact, or portal is known. |
| 4a | Online / physical / email | **UNKNOWN** | Honestly stated as unverified. |
| 4b | Form vs letter vs undertaking | **PARTIAL** | Tells you to submit "the official form from the Standing Order" but **gives no link to it**, and the pack's draft letter is separate. |
| 4c | Who signs | **PARTIAL** | The organizer gives the undertaking (stated); who signs the application is not. |
| 4d | Keep the acknowledgement | **FAIL** | Not mentioned anywhere. |
| 4e | Status to track afterwards | **FAIL** | Only "I've submitted" and "I've received an approval" buttons; no status concept, no date or reference field. |
| 5a | Consolidated preparation list | **PARTIAL** | A "Document checklist" exists but is the full rules list (limits, prohibitions, documents, commitments mixed). |
| 5b | REQUIRED / CONDITIONAL / RECOMMENDED / UNKNOWN separation | **FAIL** | 22 of 24 rows say "REQUIRED"; no CONDITIONAL or UNKNOWN grouping; limits ("No weapons") sit beside documents to produce. Land-owner NOC is "REQUIRED" yet issuer unknown. |
| 5c | Items present | **PARTIAL** | Organizer, estimate, date/time, venue, purpose, undertaking, NOC, original permission, police liaison, volunteers, water/first aid all listed. But liaison, volunteer count, water and first-aid arrangements have **nowhere to enter details**, so the pack shows blanks. |
| 6a | Traffic NOC applies to 2 buses | **PASS** | Shown (CRITICAL) with the authority DCP (Headquarters), Delhi Traffic Police HQ. |
| 6b | Traffic NOC steps | **UNKNOWN** | "We have not verified the application steps, fee or processing time." |
| 6c | Bus parking | **UNKNOWN (clearly flagged)** | "Designated parking only … We have not verified where that is." Correctly shown as a gap. |
| 6d | Extra bus information to submit | **FAIL** | Unknown, and the product cannot even record the number of buses. |
| 7 | Live restrictions | **PARTIAL** | Wording is safe in all four states (below). Not shown: geographic scope, effective period, review status. Feed never actually fetched. |
| 8 | Date conflict intelligence | **PASS** | Shared capacity; others inform not block; BMP-only data labelled; no "available". |
| 9a | Event brief | **PASS** | Accurate, includes purpose. |
| 9b | Police request draft | **PARTIAL** | Usable, but dates are ISO ("2026-10-31"), it never lists enclosures (undertaking, land-owner NOC), never mentions buses (count), and does not tell the organizer to apply by 21 Oct. |
| 9c | Undertaking preparation sheet | **PARTIAL** | Useful collection sheet; the official form is not linked; several blanks the product could have asked earlier. |
| 9d | Submission checklist | **FAIL** | None. The "Document checklist" is a rules tick-list, not "what to put in the envelope". |
| 9e | Traffic-related item | **FAIL** | Rule lists "Traffic NOC application" as a document but no template or checklist item is produced. |
| 9f | Event-day checklist | **FAIL** | None generated. |
| 10 | Exact next action | **FAIL** | Dashboard says "Next action: Prior police permission", i.e. the "bad" example. Dates, authority and the first concrete step are not stated. |
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
| 1 | Where/how exactly is the application submitted (in person, email, portal)? office address, hours, contact? | UNKNOWN | Owner's summary says "DCP, New Delhi District" only; Standing Order PDF not read; no official contact recorded | Call/visit DCP New Delhi District office | Likely yes: Standing Order text, Delhi Police directory, current practice pages | **Very high**: it is the one step every organizer must do | **P0** |
| 2 | Where is the official undertaking form? | PARTIAL | We tell the organizer it is "in the Standing Order" without linking it. The URL is in our own source registry | Search for the PDF | **Yes, already have it** (`STANDING_ORDER_URL`) | High, zero research cost | **P0** |
| 3 | Who is the land-owner and how is the NOC obtained? | UNKNOWN | Not in the owner's summary; `DEL-JM-022` says ask the police | Ask police / land-owning agency | Possibly (Standing Order undertaking text, past permissions) | High: a CRITICAL blocker with no route to resolve it | **P0** |
| 4 | Traffic NOC: how, where, fee, time, what to attach for 2 buses | UNKNOWN | Page confirms mandatory only; procedure not found | Call Traffic HQ, Todapur | Maybe (page may list a form or portal) | High | **P1** |
| 5 | Designated parking for the buses | UNKNOWN | Not in owner's summary | Ask police/traffic | Maybe (Standing Order annex) | Medium | **P1** |
| 6 | Is the Section 163 notification feed clear today? | PARTIAL | Feed never fetched; parser calibrated on press wording | Open delhipolice.gov.in/notification | **Yes**: public daily feed | High: removes a daily manual check | **P0** (to prove the fetch/parse end to end) |
| 7 | Does the police office hold another application for 31 Oct? | UNKNOWN | No official check is ever recorded; BMP knows only its own users | Ask the police | No (not published) | Low-medium; shared venue, informational | P2 |
| 8 | What to keep as proof and what status to expect | FAIL | No acknowledgement/status model | Common sense, ask the office | Partly (practice) | Medium | **P1** |
| 9 | Police liaison / volunteer count / water / first aid arrangements | PARTIAL | No fields to capture; sheet shows blanks | Organizer decides | n/a (organizer data) | Medium | P1 |
| 10 | Whether to apply before 21 Oct or 17 Oct | PARTIAL | Two dates shown | None, but confusing | n/a | Low, cheap fix | P1 |
| 11 | Whether the time window and bus cap apply to this plan | PARTIAL | Shown only as tick-list items; no check against the entered time or bus count | Self-check | n/a | Medium | P1 |
| 12 | What is actually in the Standing Order (clause numbers) | UNKNOWN | PDF never read; no section references | Read the PDF | Yes | Medium (trust) | **P0 for pilot**: a reviewer must add references |

## F. Legal / evidence gaps
1. **Nothing in this scenario is independently verified by BookMyProtest.** All Jantar Mantar and Traffic NOC content comes from the owner's summary; section references and excerpts are absent. "Primary source verified" and "Last verified: <load date>" overstate what has been checked. Fix: record clause references and a reviewer-entered verification date before any pilot.
2. The **10-day rule's current-practice evidence** (police statements, December 2025 refusal letter) has no attached documents; the on-screen "Sources" list for that rule includes two press reports. (Fixed: press reports are now labelled "lead only: not evidence".)
3. **Land-owner NOC** is CRITICAL/REQUIRED on the strength of the undertaking text, but who issues it is unknown. Showing it as flatly REQUIRED may overstate; it is better as CONDITIONAL/UNKNOWN until the issuer is known.
4. **Window 10:00–17:00 and 25-bus cap** are stated but never compared with the plan's own inputs (time, number of buses).
5. The **live-restriction parser** has only been tested on synthetic wording; the feed's real markup is unseen.
6. L&O/10/2022 remains metadata only (correct and intentional): it does not apply to this static scenario.

## G. UX gaps
1. "Next action" is a rule title, not an instruction with a date and an authority (P0).
2. Two deadline dates (17 Oct buffer, 21 Oct legal) compete (P1).
3. All rows are "REQUIRED"; no grouping into must-do-before-applying, must-do-before-the-day, limits to respect, unknown (P0/P1).
4. The percentage ring is large, and for this scenario meaningless at 0% until permission exists; no READY/NOT READY statement (P0).
5. The restriction card hides scope/effective dates/source/review status (P1).
6. Questions that change nothing: *Stage*, *Food or water*, *organizer type*, *end time* alter no requirement for Delhi. *Vehicles* is yes/no, but the one thing that matters (how many buses) cannot be entered (P1).
7. Hero "GET QUOTES" sits above the compliance list (P2, see I).
8. Letter dates are ISO (2026-10-31) for a police office (P2).

## H. Product gaps
1. No **permission status** (not applied / applied / acknowledged / granted / refused) and no real submission date or acknowledgement reference.
2. Scheduled T-72h/T-24h checks are restriction-only and **silent**: there is no way to tell the organizer.
3. No **event-day readiness** state; "done" ticks are self-asserted and unconnected to evidence.
4. No **submission checklist / event-day checklist / traffic NOC** documents.
5. No official **undertaking form** link in pack or dashboard.
6. Scope of "conflict intelligence" depends on someone recording official checks: today the police side is always "not checked".

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
**Without BookMyProtest**, a first-time organizer would likely need roughly **10–12** independent searches or calls: find the governing order; find the deadline; find which office; find how to submit; find the undertaking form; find who gives the land-owner NOC; find the Traffic NOC and its office; ask about bus parking; check the Section 163 notifications; check for clashing events; check the allowed hours and sound/stage rules; learn what to do about water, medical and volunteers.

**With BookMyProtest today**, still needed: how/where to submit (1 call), land-owner NOC (usually the same call), the undertaking form (0 if the link is added, 1 now), Traffic NOC procedure (1 call), designated parking (usually asked on that call), checking the live notifications page (0–1 once the feed is proven), confirming no clash (same call). That is about **4–6 contacts, realistically 2–3 phone calls** (DCP office, Traffic HQ).

**External effort eliminated ≈ 6 of ~11**: about half, concentrated in *understanding the rules, the deadline and the correct authority*. None of the *operational* "how do I physically submit" effort is eliminated yet; that is the part that matters most.

## K. Fixes
**Fixed during the run (obvious / misleading wording only)**
- Readiness headline at 100% said "You're prepared." even beside an unconfirmed permission or live restriction. Now: "Checklist complete. Ticking items is not permission. Confirm your permission and the latest orders with the authority before the day." (test updated)
- The Sources line mixed press reports with official sources. Press leads are now labelled "(press report, lead only: not evidence)".

**P0 (needed before any private pilot)**
1. Reviewer adds Standing Order clause references and a real verification date; the owner verifies, then (separately) publishes. Without this nothing on screen should be called "Primary source verified".
2. Source and show the **application submission method, office and contact** (or state "unpublished: call this number" with a source). Smallest delta: a data field on the authority plus display on the rule row.
3. **Link the official undertaking form** (the Standing Order URL) from the dashboard row and the pack.
4. **Concrete next action** that names the authority and the date ("Prepare the undertaking and apply to the DCP, New Delhi District by 21 Oct 2026").
5. **Permission status + real submission date + acknowledgement reference**, and an event-day state (NOT READY because police permission is not confirmed) derived from it. A tick must not equal permission.
6. Prove the Notifications fetch/parse against the live page once (run `npm run watch` where network allows).

**P1**
7. Group the list: *Apply with* (permission application, undertaking, land-owner NOC), *Before the day*, *Limits to respect*, *Unknown*. Show CONDITIONAL/UNKNOWN honestly (land-owner NOC).
8. Capture **number of buses**; check time against 10:00–17:00 and buses against 25.
9. Restriction card: effective period, scope, issuer, source, review status.
10. Source Traffic NOC steps and designated parking, or keep them as flagged unknowns with the right office.
11. T-72h/T-24h: also compare venue signals and permission status, and **tell the organizer**.
12. Pack: a submission checklist (enclosures), traffic-NOC item, event-day checklist; real date format in the letter.
13. Show one deadline (legal), hide the 14-day buffer unless the deadline has passed.

**P2**
14. Remove the hero "Get quotes"; keep per-row prompts.
15. Drop questions that change nothing (Stage, Food) or make them change the output.
16. Official venue check records for Jantar Mantar police-side so "Police: not checked" can become a real answer.

## L. Final verdict
**NOT READY FOR PRIVATE PILOT**

Why: the product is honest and gets the *rules, deadline and authority* right (PASS), and its change tracking and live-restriction wording are sound. But a first-time organizer still cannot learn **how and where to submit**, cannot find the **official form**, gets **no concrete next action**, cannot record or track **permission status**, and the event-day view cannot say NOT READY for the right reason. In addition, none of the Delhi content has been verified or published by a human against the source documents. The smallest delta that would change this verdict is items 1 to 6 in P0. Items 2 and 3 may be solvable in a day each if the Standing Order text is read; item 1 needs a human.

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
