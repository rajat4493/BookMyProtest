# Delhi / Jantar Mantar rule corpus (v0.5.0)

Loaded as **data** through the generic rules platform. No code branches on Delhi, Jantar Mantar or Ramlila. See `data/delhi/corpus.ts` (the data), `data/delhi/loader.ts` (idempotent loader) and `tests/delhi-corpus.test.ts` (22 tests).

## Status (v0.5.0): evidence attached, rules staged, awaiting the admin's explicit verification

| | |
|---|---|
| Corpus | 29 requested families + 2 gap records (`DEL-RAM-002` Ramlila booking, `DEL-PROC-001` generic processions) |
| Standing Order URL | `https://delhipolice.gov.in/StandingOrderFiles/83377_Law%20and%20Order-48-2022.pdf`, exactly as supplied. Type `OFFICIAL_ADMINISTRATIVE_RULE`; order date **2022-04-28** and title recorded from the official Standing Orders index (per the project owner). **I still could not read the PDF**: the sandbox proxy returns 403 for `delhipolice.gov.in`. Section references and excerpts remain blank. |
| Dev database right now | `DEL-TRAFFIC-001`, `DEL-LIVE-001` ACTIVE (published earlier). **27 Standing Order / Ramlila-routing rules are DRAFT**, with the URL attached and evidence linked. 2 gap records UNDER_REVIEW. New Delhi District **not live**. |
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
| DEL-PROC-001 | Generic Delhi rallies/processions (marches outside Jantar Mantar). **Gap record, UNDER_REVIEW, no content**, waiting for extraction of the 25 May 2022 order. | march | UNVERIFIED | — |

## Sources and the evidence chain

| Source | Type | Lifecycle | Role |
|---|---|---|---|
| Standing Order L&O/48/2022 (order date 2022-04-28) | OFFICIAL_ADMINISTRATIVE_RULE | CURRENT | **Governing instrument** for all Jantar Mantar rules and the Ramlila routing. Monitored weekly. |
| Standing Order No. 10/2018 | OFFICIAL_ADMINISTRATIVE_RULE | **HISTORICAL**, superseded by L&O/48/2022 | History only. Never evidence, never monitored, never used to derive a requirement. |
| Delhi Police order dated 2022-05-25, "Guidelines for regulation of rallies/procession in Delhi" | OFFICIAL_ADMINISTRATIVE_RULE | **PLACEHOLDER** (no URL yet) | Research placeholder: becomes the governing source for generic Delhi procession/march logic once extracted. Cannot be attached to a rule yet. |
| Current Delhi Police statements and refusal letters (2025–26, incl. 7–9 Oct 2026; Dec 2025 letter) | OFFICIAL_CURRENT_PRACTICE | CURRENT, no URL yet | **Current deadline confirmation** for the 10-day rule. The statements/letter themselves still need to be attached. |
| ANI and India TV reports (7 Oct 2026) | SECONDARY_LEAD | CURRENT | Press leads for the same statement. Seen only as search results, not read in full. They can never verify a rule. |
| Delhi Traffic Police NOC page | OFFICIAL_CURRENT_PRACTICE | CURRENT | `DEL-TRAFFIC-001`. Monitored weekly. |
| Delhi Police Notifications | OFFICIAL_CURRENT_PRACTICE | CURRENT | `DEL-LIVE-001`; monitored daily; flags nothing, opens review items for new Section 163 orders. |

**The 10-day rule (`DEL-JM-002`)** keeps 10 calendar days, excluding the event day, as the current operational deadline. Its evidence is stored as separate links: Standing Order 48/2022 (PRIMARY, the governing instrument), current Delhi Police practice (SUPPORTING, current confirmation), and the two press reports (LEAD). Only the governing instrument can verify the rule; a test removes it and confirms the rule then falls back to "Needs verification". The deadline note says older 2018 material does not override it.

**Guards added with this delta:** a source has a lifecycle (`CURRENT` / `HISTORICAL` / `PLACEHOLDER`). Only CURRENT sources count as evidence anywhere (display, publish gate, monitoring); linking a historical or placeholder source to a rule is refused, and a row forced in by SQL is ignored.

## What changed in the platform to support this
- **`legal_certainty`** on rules (`PRIMARY_VERIFIED` / `OFFICIAL_GUIDANCE` / `UNVERIFIED`). Publishing needs a value other than UNVERIFIED; `PRIMARY_VERIFIED` additionally needs a source attached with **PRIMARY** evidence strength. A cloned version resets to UNVERIFIED until a human re-confirms it. Users see "Primary source verified" or "Official guidance".
- **`rule_sources.flag_on_change`.** The notifications feed is linked to DEL-LIVE-001 with this off: a feed change opens a review item (so a human can record new Section 163 orders under *Admin → Restrictions*) without flipping the rule to CHANGE_DETECTED every day.
- Planner places are any supported non-venue jurisdiction (not only "city"); venue picker; dashboard shows the venue.
- Two Jantar Mantar document templates (venue-level, versioned, selected automatically): a request letter addressed to the DCP, and an **undertaking preparation sheet** (programme date, venue, time, participants, volunteers, organizer details and the commitments). The sheet says it is not the official undertaking.
- Monitored: Standing Order (weekly, once its URL exists), Traffic Police NOC page (weekly), Delhi Police Notifications (daily).

## Tests (all pass; `npm test`: 106 total, 36 in the Delhi suite)
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
5. **March logic is only partly covered.** A march *at* Jantar Mantar is covered by DEL-JM-008/009 (from L&O/48/2022). A march elsewhere in Delhi currently gets only the Traffic NOC and the live-order check; no march rules are invented. Scenario 3 therefore reflects the Jantar Mantar order only until the 25 May 2022 order is extracted.
6. Above 50,000 (reports mention Burari): not loaded; DEL-RAM-001 says there is no verified guidance above 50,000.
7. The 10:00–17:00 window is stated but a plan outside it is not flagged yet.
8. Level/severity/category choices are mine; they are data, editable via clone → publish.
9. When you run step 2, rules are published as the admin with `last_verified_at` = that day. That date records the load, not an independent check.

## Next missing chunks
1. **Extract the 25 May 2022 "Guidelines for regulation of rallies/procession in Delhi" order**: supply its PDF URL, then convert it into generic Delhi procession/march rules (resolving `DEL-PROC-001`) and re-run the march scenario against it. This is the hole to close before Delhi goes live.
2. Ramlila Ground booking workflow and the land-owner authority/NOC process: not guessed. `DEL-RAM-002` stays UNDER_REVIEW until a clean official source exists.

## TheDuck learning capture
Added for this corpus: which Delhi rules triggered manual clarification, how often users hit the Ramlila routing, and how often the Traffic NOC / land-owner NOC items stayed incomplete (the two with no verified procedure). See [THEDUCK-LEARNING-CAPTURE.md](THEDUCK-LEARNING-CAPTURE.md).
