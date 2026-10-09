# Delhi / Jantar Mantar rule corpus (v0.4.0)

Loaded as **data** through the generic rules platform. No code branches on Delhi, Jantar Mantar or Ramlila. See `data/delhi/corpus.ts` (the data), `data/delhi/loader.ts` (idempotent loader) and `tests/delhi-corpus.test.ts` (22 tests).

## Status: complete in code and tests, NOT yet published in the dev database

| | |
|---|---|
| Corpus | 29 requested families + 1 gap record |
| Dev database right now | `DEL-TRAFFIC-001`, `DEL-LIVE-001` **ACTIVE** (real URLs). 27 Standing Order rules **DRAFT** (no source URL). `DEL-RAM-002` **UNDER_REVIEW**. New Delhi District **not live** in the planner. |
| Why | The Standing Order PDF URL was not supplied and I will not guess it. `delhipolice.gov.in` is also unreachable from the build sandbox, so I could not read the PDF to check the summary. |
| To finish | `DELHI_STANDING_ORDER_URL=<official PDF URL> npm run db:load-delhi` (as the admin). It attaches the URL, publishes the 27 drafts with that admin as reviewer, and only then makes New Delhi District selectable. Re-running is safe. |

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
| DEL-JM-002 | Apply ≥10 days ahead (excl. event day; late may be considered). Structured deadline = event − 10 | JM, ≤1,000 | PV | Critical |
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
| DEL-RAM-002 | Ramlila booking + land-owner authority workflow. **Gap record, UNDER_REVIEW, no content, never shown to users.** | — | UNVERIFIED | — |

## What changed in the platform to support this
- **`legal_certainty`** on rules (`PRIMARY_VERIFIED` / `OFFICIAL_GUIDANCE` / `UNVERIFIED`). Publishing needs a value other than UNVERIFIED; `PRIMARY_VERIFIED` additionally needs a source attached with **PRIMARY** evidence strength. A cloned version resets to UNVERIFIED until a human re-confirms it. Users see "Primary source verified" or "Official guidance".
- **`rule_sources.flag_on_change`.** The notifications feed is linked to DEL-LIVE-001 with this off: a feed change opens a review item (so a human can record new Section 163 orders under *Admin → Restrictions*) without flipping the rule to CHANGE_DETECTED every day.
- Planner places are any supported non-venue jurisdiction (not only "city"); venue picker; dashboard shows the venue.
- Two Jantar Mantar document templates (venue-level, versioned, selected automatically): a request letter addressed to the DCP, and an **undertaking preparation sheet** (programme date, venue, time, participants, volunteers, organizer details and the commitments). The sheet says it is not the official undertaking.
- Monitored: Standing Order (weekly, once its URL exists), Traffic Police NOC page (weekly), Delhi Police Notifications (daily).

## Tests (all pass; see `npm test`: 91 total)
Scenario 1, 300 static at Jantar Mantar → 22 families; deadline = event − 10 days; the five blockers; no march/sound/vehicle/Ramlila rules.
Scenario 2, 2,000 → only DEL-JM-005 + Ramlila routing + Traffic NOC + live check (also with no venue: no Jantar Mantar rules); exact boundary 1,000 vs 1,001; the held Ramlila record never appears at 1,500 / 2,000 / 50,000 / 60,000.
Scenario 3, 500 + march + loudspeaker → DEL-JM-008/009/010/011 + Traffic NOC, all four permission items critical; no vehicle rules.
Plus: corpus shape, human-reviewer attribution, certainty marking, no invented Ramlila steps, idempotent reload, feed-vs-rule flagging, venue templates, and "no URL → nothing published, then supplying it completes the load". A mutation check (changing the cap in the data) made the scenario tests fail, as it should. The same three scenarios were also exercised through the real UI (`scripts/e2e-delhi.mjs`, screenshots in `docs/previews/v0.4.0/`).

## Reviewer checklist: things I could not verify, or noticed
1. **Standing Order URL and citation.** Provide the official PDF URL. Also confirm the citation: some reports date the governing standing order **28 April 2023**, not 2022 (reissue/amendment?). A separate official **Standing Order No. 10/2018** (`delhipolice.gov.in/doc/standing-order/10.pdf`) covers Central Vista/Jantar Mantar/Boat Club and may interact.
2. **Section references and verbatim excerpts are blank.** The rules reflect your summary of the PDF; I did not read the PDF. Add section refs/excerpts in Admin → Rules → Evidence.
3. **7 vs 10 days.** One news report mentions 7 days; your review says 10 excluding the event day. Loaded as 10. "Excluding event day" is modelled as event date − 10 calendar days with a note; confirm that is the intended counting.
4. **Traffic NOC URL** (`traffic.delhipolice.gov.in/node/80`) came from a web search result and is not fetchable here. Confirm it is the NOC page. Application steps, fee and processing time were not found and are not asserted.
5. **Live Section 163 orders matter right now.** Search results (Oct 2026) report Section 163 BNSS orders in New Delhi district prohibiting assemblies of five or more except at the designated Jantar Mantar site with prior permission. I did **not** enter any order as a temporary restriction because I could not read the notifications. A human should read the current orders and record them in Admin → Restrictions; until then DEL-LIVE-001 sends users to check.
6. **Above 50,000.** Some reports mention Burari; not in your summary, not loaded. DEL-RAM-001 says there is no verified guidance above 50,000.
7. **Time-window clash.** DEL-JM-006 states the 10:00–17:00 window but does not yet flag a plan whose times fall outside it (conditions cannot compare times yet).
8. **Classification choices are mine** (levels/severities/categories, e.g. DEL-JM-004 as "recommended", DEL-RAM-001 critical). They are data; edit via clone → publish.
9. **Published as the admin user** on your instruction, with `last_verified_at` = load date. That date records when the corpus was loaded on your word, not an independent check; re-verify and re-publish when you have read the PDF.

## Next missing chunk (unchanged)
Ramlila Ground booking workflow and the land-owner authority/NOC process: not guessed. DEL-RAM-002 is the placeholder; when a clean official source exists, add it as a source, attach evidence, and publish through the normal flow.

## TheDuck learning capture
Added for this corpus: which Delhi rules triggered manual clarification, how often users hit the Ramlila routing, and how often the Traffic NOC / land-owner NOC items stayed incomplete (the two with no verified procedure). See [THEDUCK-LEARNING-CAPTURE.md](THEDUCK-LEARNING-CAPTURE.md).
