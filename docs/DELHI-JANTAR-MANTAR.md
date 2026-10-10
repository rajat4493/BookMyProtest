# Delhi / Jantar Mantar rule corpus (v0.6.0)

Loaded as **data** through the generic rules platform. No code branches on Delhi, Jantar Mantar or Ramlila. See `data/delhi/corpus.ts` (the data), `data/delhi/loader.ts` (idempotent loader) and `tests/delhi-corpus.test.ts` (22 tests).

## Status (v0.6.0): evidence attached, rules staged, awaiting the admin's explicit verification

| | |
|---|---|
| Corpus | 29 requested families + a conservative generic-march baseline (`DEL-PROC-001…004`) + 2 held gap records (`DEL-RAM-002` Ramlila booking, `DEL-PROC-100` clause-level L&O/10/2022) |
| Standing Order URL | `https://delhipolice.gov.in/StandingOrderFiles/83377_Law%20and%20Order-48-2022.pdf`, exactly as supplied. Type `OFFICIAL_ADMINISTRATIVE_RULE`; order date **2022-04-28** and title recorded from the official Standing Orders index (per the project owner). **I still could not read the PDF**: the sandbox proxy returns 403 for `delhipolice.gov.in`. Section references and excerpts remain blank. |
| Dev database right now | `DEL-TRAFFIC-001`, `DEL-LIVE-001` ACTIVE (published earlier). **27 Standing Order / Ramlila-routing rules + `DEL-PROC-002…004` are DRAFT** with evidence linked; `DEL-PROC-001` (existence notice) is UNDER_REVIEW; the 2 gap records are UNDER_REVIEW. New Delhi District **not live**. |
| Why not published | Publishing needs the admin's explicit verification. That is a separate flag, not implied by loading. |

### Three separate decisions (all human, none implied by another)
```
npm run db:load-delhi                                   # 1. load / sync as DRAFTS (safe, repeatable; never edits a live rule)
npm run db:load-delhi -- --confirm-verified             # 2. the admin states the rules were verified -> publish the drafts
npm run db:load-delhi -- --confirm-verified --go-live   # 3. separately: make New Delhi District selectable in the planner
```
Per your instruction, Delhi is **not** being enabled publicly now.

## Model
`India › NCT Delhi (region) › New Delhi District (district, the planner "place") › Jantar Mantar (venue)`.
The questionnaire gained **one** conditional field: a venue picker that appears only for places that have venues (Bengaluru and everything else are unchanged).

| Rule scope | Where it lives |
|---|---|
| Jantar Mantar rules (DEL-JM-001…026) | venue jurisdiction. All except the cap carry `attendance ≤ 1000`, so a 2,000-person plan does **not** get permission/time/vehicle rules that cannot apply; it gets DEL-JM-005 (cap) and the Ramlila routing. |
| DEL-TRAFFIC-001, DEL-LIVE-001, DEL-RAM-001 | NCT Delhi (apply to any Delhi plan) |

## The rules
`PV` = PRIMARY_VERIFIED, `OG` = OFFICIAL_GUIDANCE. Severity is my classification; please review.

| Family | Rule | When | Cert | Severity |
|---|---|---|---|---|
| DEL-JM-001 | Prior police permission | JM, ≤1,000 | PV | Critical |
| DEL-JM-002 | Apply ≥10 days ahead (excl. event day; late may be considered). Structured deadline = event − 10. **Evidence chain below** | JM, ≤1,000 | PV | Critical |
| DEL-JM-003 | Applications go to DCP, New Delhi District | JM, ≤1,000 | PV | Required |
| DEL-JM-004 | First come first served; Special Branch, Traffic and District Police assess | JM, ≤1,000 | PV | Recommended |
| DEL-JM-005 | Maximum 1,000 participants | JM | PV | Required |
| DEL-JM-006 | Protest window 10:00–17:00 | JM, ≤1,000 | PV | Required |
| DEL-JM-007 | No continuous multi-day programme | JM, ≤1,000 | PV | Required |
| DEL-JM-008 | No march to/from the venue | march | PV | Critical |
| DEL-JM-009 | Symbolic march only with separate police permission | march | PV | Critical |
| DEL-JM-010 | Loudspeaker only with specific permission (10:00–17:00 if allowed) | sound | PV | Critical |
| DEL-JM-011 | No vehicle-mounted PA | sound | PV | Required |
| DEL-JM-012 | No tents / shamiana / temporary structures | JM, ≤1,000 | PV | Required |
| DEL-JM-013 | Max 25 protester buses (New Delhi District) | vehicles | PV | Required |
| DEL-JM-014 | Designated parking only | vehicles | PV | Required |
| DEL-JM-015 | No tractors, trolleys, bullock carts, cycle-rickshaws, hand carts, animals | JM, ≤1,000 | PV | Required |
| DEL-JM-016 | Flags/banners ≤ 9×6 ft; sticks ≤ 2 ft | JM, ≤1,000 | PV | Required |
| DEL-JM-017 | No weapons | JM, ≤1,000 | PV | Required |
| DEL-JM-018 | No provocative speech | JM, ≤1,000 | PV | Required |
| DEL-JM-019 | No damage to property | JM, ≤1,000 | PV | Required |
| DEL-JM-020 | No burning effigies/documents, cooking or littering | JM, ≤1,000 | PV | Required |
| DEL-JM-021 | Organizer undertaking | JM, ≤1,000 | PV | Critical |
| DEL-JM-022 | Land-owner NOC (**how to obtain it is not verified and says so**) | JM, ≤1,000 | PV | Critical |
| DEL-JM-023 | Carry the original permission | JM, ≤1,000 | PV | Required |
| DEL-JM-024 | Name a police liaison | JM, ≤1,000 | PV | Required |
| DEL-JM-025 | Drinking water and first aid / medical aid | JM, ≤1,000 | PV | Required |
| DEL-JM-026 | Volunteers; deployment and contact list | JM, ≤1,000 | PV | Required |
| DEL-TRAFFIC-001 | Traffic NOC for rallies, meetings, morchas, protest gatherings (DCP Headquarters, Todapur) | any Delhi plan | PV | Critical |
| DEL-LIVE-001 | Check for current Section 163 / temporary orders | any Delhi plan | **OG** | Required (level: recommended) |
| DEL-RAM-001 | Ramlila Ground as the venue above 1,000, up to 50,000. **Venue routing only; says booking and land-owner process are not verified.** | attendance > 1,000 | PV | Critical (level: recommended) |
| DEL-RAM-002 | Ramlila booking + land-owner authority workflow. **Gap record, UNDER_REVIEW, no content, never shown to users. Not marked complete.** | — | UNVERIFIED | — |
| DEL-PROC-001 | **Existence notice**: a current Delhi Police order (L&O/10/2022) governs rallies and processions; its organiser requirements are not yet extracted. Level UNKNOWN: shown as "unknown, please verify", never scored. | march | PV (existence only) | Recommended |
| DEL-PROC-002 | Police permission process for processions (hedged: *may be required*; **no deadline**: the 10-day rule is Jantar Mantar-specific) | march | OG, medium confidence | Required |
| DEL-PROC-003 | Route and timing can be set by Delhi Police (Delhi Police Act, ss. 28-29; subsection letters unconfirmed) | march | PV, medium confidence | Required |
| DEL-PROC-004 | Sound permission for processions that use sound. **Low confidence → users see "Needs verification"**: the owner reports it as verified but the basis was not supplied and I could not find it | march + sound | OG, low confidence | Required |
| DEL-PROC-100 | Clause-level organiser requirements of L&O/10/2022. **Held, UNDER_REVIEW, no content**, until the PDF text is extracted | march | UNVERIFIED | — |

## Sources and the evidence chain

| Source | Type | Lifecycle | Role |
|---|---|---|---|
| Standing Order L&O/48/2022 (order date 2022-04-28) | OFFICIAL_ADMINISTRATIVE_RULE | CURRENT | **Governing instrument** for all Jantar Mantar rules and the Ramlila routing. Monitored weekly. |
| Standing Order No. 10/2018 | OFFICIAL_ADMINISTRATIVE_RULE | **HISTORICAL**, superseded by L&O/48/2022 | History only. Never evidence, never monitored, never used to derive a requirement. |
| **L&O/10/2022**, "Guidelines for regulation of rallies/procession in Delhi", Commissioner of Police, Delhi, order date 2022-05-25 (code `DEL-SO-LNO-10-2022`) | OFFICIAL_ADMINISTRATIVE_RULE | **CURRENT**, **index-only** | The current generic framework for rallies/processions across Delhi. Evidence is the official Standing Orders index (serial 70, `https://kpkb.delhipolice.gov.in/standingorderNew`): it proves the instrument **exists** (title, number, date), not what it says. `document_url` is **empty**: no PDF URL is guessed. Watched weekly via the index; a change opens a review item and flags no rule. |
| Delhi Police Standing Order 309, "Regulation of Processions and Rallies" (`DEL-SO-309`) | OFFICIAL_ADMINISTRATIVE_RULE | **HISTORICAL**, superseded in practice by L&O/10/2022 | Older generic framework (discussed by the Supreme Court; cited by MHA in 2015). It must **not** be assumed that every clause of 309 survives into L&O/10/2022. No URL known; never evidence. |
| *In re Ramlila Maidan Incident*, Supreme Court, 23 Feb 2012, [2012] 4 S.C.R. 971; (2012) 5 SCC 1 (`IN-SC-RAMLILA-2012`) | BINDING_CASE_LAW | CURRENT | Official SCR PDF. Context for Standing Order 309; supporting evidence only for `DEL-PROC-002`. Not read in full by the build assistant. |
| The Delhi Police Act, 1978 (`IN-DL-POLICE-ACT-1978`) | PRIMARY_LAW | CURRENT | Statutory basis for regulating processions (ss. 28-29 per search results; **section text was not read**: confirm before verifying). Not auto-monitored. |
| Current Delhi Police statements and refusal letters (2025–26, incl. 7–9 Oct 2026; Dec 2025 letter) | OFFICIAL_CURRENT_PRACTICE | CURRENT, no URL yet | **Current deadline confirmation** for the 10-day rule. The statements/letter themselves still need to be attached. |
| ANI and India TV reports (7 Oct 2026) | SECONDARY_LEAD | CURRENT | Press leads for the same statement. Seen only as search results, not read in full. They can never verify a rule. |
| Delhi Traffic Police NOC page | OFFICIAL_CURRENT_PRACTICE | CURRENT | `DEL-TRAFFIC-001`. Monitored weekly. |
| Delhi Police Notifications | OFFICIAL_CURRENT_PRACTICE | CURRENT | `DEL-LIVE-001`; monitored daily; flags nothing, opens review items for new Section 163 orders. |

**The 10-day rule (`DEL-JM-002`)** keeps 10 calendar days, excluding the event day, as the current operational deadline. Its evidence is stored as separate links: Standing Order 48/2022 (PRIMARY, the governing instrument), current Delhi Police practice (SUPPORTING, current confirmation), and the two press reports (LEAD). Only the governing instrument can verify the rule; a test removes it and confirms the rule then falls back to "Needs verification". The deadline note says older 2018 material does not override it.

**Guards added with this delta:** a source has a lifecycle (`CURRENT` / `HISTORICAL` / `PLACEHOLDER`). Only CURRENT sources count as evidence anywhere (display, publish gate, monitoring); linking a historical or placeholder source to a rule is refused, and a row forced in by SQL is ignored.

**Index-only evidence.** A source with an index URL but no document URL proves an instrument *exists*. It cannot be PRIMARY evidence for a requirement (refused at link time); it may be primary only for an informational UNKNOWN-level rule like `DEL-PROC-001`. The citation shown to users is chosen by strength, with index-only entries last, so a claim is attributed to the source that actually carries it.

## What changed in the platform to support this
- **`legal_certainty`** on rules (`PRIMARY_VERIFIED` / `OFFICIAL_GUIDANCE` / `UNVERIFIED`). Publishing needs a value other than UNVERIFIED; `PRIMARY_VERIFIED` additionally needs a source attached with **PRIMARY** evidence strength. A cloned version resets to UNVERIFIED until a human re-confirms it. Users see "Primary source verified" or "Official guidance".
- **`rule_sources.flag_on_change`.** The notifications feed is linked to DEL-LIVE-001 with this off: a feed change opens a review item (so a human can record new Section 163 orders under *Admin → Restrictions*) without flipping the rule to CHANGE_DETECTED every day.
- Planner places are any supported non-venue jurisdiction (not only "city"); venue picker; dashboard shows the venue.
- Two Jantar Mantar document templates (venue-level, versioned, selected automatically): a request letter addressed to the DCP, and an **undertaking preparation sheet** (programme date, venue, time, participants, volunteers, organizer details and the commitments). The sheet says it is not the official undertaking.
- Monitored: Standing Order (weekly, once its URL exists), Traffic Police NOC page (weekly), Delhi Police Notifications (daily).

## Tests (all pass; `npm test`: 123 total, 51 in the Delhi suite)
Scenario 1, 300 static at Jantar Mantar → 22 families; deadline = event − 10 days; the five blockers; no march/sound/vehicle/Ramlila rules.
Scenario 2, 2,000 → only DEL-JM-005 + Ramlila routing + Traffic NOC + live check (also with no venue: no Jantar Mantar rules); exact boundary 1,000 vs 1,001; the held Ramlila record never appears at 1,500 / 2,000 / 50,000 / 60,000.
Scenario 3, 500 + march + loudspeaker → DEL-JM-008/009/010/011 + Traffic NOC, all four permission items critical; no vehicle rules.
Plus: corpus shape, human-reviewer attribution, certainty marking, no invented Ramlila steps, idempotent reload, feed-vs-rule flagging, venue templates, and "no URL → nothing published, then supplying it completes the load". A mutation check (changing the cap in the data) made the scenario tests fail, as it should. The same three scenarios were also exercised through the real UI (`scripts/e2e-delhi.mjs`, screenshots in `docs/previews/v0.4.0/`).

## Reviewer checklist

**Resolved by you (recorded in the source notes, not independently verified by me)**
- Citation and date: the official Standing Orders index lists the title with order date 28 April 2022. The "2023" reports are not treated as a different version.
- 7 vs 10 days: 10 is current practice; the 7-day figure belongs to the older 2018 framework (now historical).

**Still open**
1. **I have not read the Standing Order PDF** (proxy 403). Everything rests on your review. Add section references/excerpts in Admin → Rules → Evidence before publishing, ideally by the person who verifies it.
2. **Attach the current-practice documents** (the Oct 2026 police statements, the Dec 2025 refusal letter) to the "current Delhi Police statements" source. Today that source has no URL, so it supports but cannot verify.
3. **Traffic NOC URL** (`traffic.delhipolice.gov.in/node/80`) came from a search result; confirm it is the NOC page. Procedure, fee and timeline are not asserted.
4. **Live Section 163 orders matter right now.** Search results (Oct 2026) report orders in New Delhi district prohibiting assemblies of five or more except at the designated Jantar Mantar site with prior permission. None are entered as temporary restrictions because I could not read the notifications. Do this before enabling Delhi.
5. **Generic march logic is now a conservative baseline, not the full order.** Anywhere in Delhi a march gets: the existence notice (UNKNOWN), a hedged permission-process item, route/timing from the Delhi Police Act, the Traffic NOC and the live-order check; plus sound permission (low confidence) when sound is used. No deadline and no clause of L&O/10/2022 is asserted. Police operating instructions in that order (three-tier barricading, control over use of force, repeated PA announcements, videography, minimum-injury principle, medical assistance) are **police duties and are never turned into organiser tasks** (a test enforces this). The reported assessment criteria (nature of the demand, participating leaders/members, other intelligence incl. social media) are not presented as organiser requirements either.
   - *Open:* confirm ss. 28-29 against the Act text (subsection letters, current amendments incl. the Jan Vishwas (Amendment Provisions) Act, 2026) before verifying `DEL-PROC-002/003`; supply the basis for `DEL-PROC-004`; static rallies at venues other than Jantar Mantar have no generic rule yet (the baseline is march-triggered).
6. Above 50,000 (reports mention Burari): not loaded; DEL-RAM-001 says there is no verified guidance above 50,000.
7. The 10:00–17:00 window is stated but a plan outside it is not flagged yet.
8. Level/severity/category choices are mine; they are data, editable via clone → publish.
9. When you run step 2, rules are published as the admin with `last_verified_at` = that day. That date records the load, not an independent check.

## Next missing chunks
1. **Recover the actual L&O/10/2022 PDF** (put its URL in `document_url`, never guess), extract the clauses organisers must act on, and promote them one by one from `DEL-PROC-100` into sourced rules. Separate organiser obligations from police operating instructions.
2. Confirm the Delhi Police Act ss. 28-29 text and record the exact subsection references; give `DEL-PROC-004` a real basis or remove it.
3. Ramlila Ground booking workflow and land-owner authority/NOC process: not guessed. `DEL-RAM-002` stays UNDER_REVIEW until a clean official source exists.

## TheDuck learning capture
Added for this corpus: which Delhi rules triggered manual clarification, how often users hit the Ramlila routing, and how often the Traffic NOC / land-owner NOC items stayed incomplete (the two with no verified procedure). See [THEDUCK-LEARNING-CAPTURE.md](THEDUCK-LEARNING-CAPTURE.md).

## v0.7.0 additions (live restrictions, Ramlila workflow, large events)
- **Traffic NOC** (`DEL-TRAFFIC-001`) is PRIMARY_VERIFIED from the official Delhi Traffic Police NOC page, as confirmed by the project owner. Procedure, fee and timeline are still not asserted.
- **Delhi Police Notifications** is the canonical live-restriction feed (`parser=ORDER_NOTICES`, `feed_role=LIVE_RESTRICTIONS`, daily). New text is parsed into *candidates* (issuing authority, order date/number, legal basis, geographic scope, effective start/end where stated, prohibited/restricted activities). Every field shows its source text; gaps stay blank. A human accepts a candidate as a **DRAFT** restriction and separately activates it with a source. The parser was written from order wording seen in reporting, not the live markup: treat first live runs as calibration. The first fetch of a feed is a baseline and produces no candidates; paste older orders in Admin → Restrictions.
- **Checks** run for every event whose place has a live-restriction feed: at plan generation, recheck, document generation, T-72h and T-24h (`npm run watch:events`, run hourly; event-local time via the place's `timezone` metadata). A check says what is recorded and how fresh the feed is; it never says "no restrictions in force". Stale feed (>36h) and unreviewed notifications are reported as such.
- **Ramlila Maidan** (attendance > 1,000): `DEL-RAM-101` police NOC, `DEL-RAM-102` ground allotment / land-owner permission, `DEL-TRAFFIC-001`, plus the sound permission overlay (`DEL-PROC-004`, now for sound with a march or > 1,000) and the live-order check. All low confidence / OFFICIAL_GUIDANCE ("Needs verification"): the only support for the separate approvals is press and court-filing leads (PTI/PSU Watch, LawTrend, a LiveLaw-hosted PDF that was not read).
- **Heads-up** `DEL-RAM-103` (a warning, never scored): "Ramlila Maidan is not a one-step police-permission venue. Ground allotment and police NOC are separate requirements."
- **No MCD booking link.** `DEL-RAM-002` is now titled "Exact Ramlila Ground booking endpoint (under review)" and stays UNDER_REVIEW; a test scans every URL and rule text for an MCD link.
- **L&O/10/2022** remains current-instrument metadata (index-only, no document URL); `DEL-PROC-100` clause-level content stays held. A test enforces both.
- **Large events**: above the place's `largeEventAbove` (Delhi 1,000) the questionnaire adds purpose (required), speakers/VIPs, promotional material status and route/traffic footprint. Existing databases need an admin template version for the new event-summary rows only if they customised that template.
- **Change after application**: mark "I've submitted my application"; later material changes (crowd ±20%, purpose, speakers, route, traffic footprint, event nature, sound/stage/vehicles) show a banner advising re-confirmation with the issuing authority, append a RECHECK snapshot and run a restriction check.
- Still open: Delhi is **not** published or enabled; the 36 rules remain drafts until you run the loader with `--confirm-verified`, then `--go-live`.
