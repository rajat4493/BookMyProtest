# TheDuck learning capture

Kept from the original BookMyProtest spec (section 29) and extended for the rules platform. After launch, capture the learnings below and feed them into the next iteration of **BookMyProtest** and **TheDuck's future product-spec methodology**.

## Product learnings (original)
- What users misunderstood.
- Where they abandoned the flow.
- Which requirement explanations caused confusion.
- Which vendor categories were requested most.
- Which compliance questions repeatedly required manual clarification.
- Which parts users trusted.
- Which parts users ignored.

## Knowledge-platform learnings (new)
Where the data lives is noted so the capture is a query, not a research project.

| Question | Source |
|---|---|
| How long from **change detected → human decision → new version live**? Which reviewers/priorities were slow? | `change_events.detected_at/reviewed_at/review_priority`, `audit_log` |
| What share of detected changes were **noise** (dismissed) vs real (approved update)? Which sources are noisiest? | `change_events.review_status` by `source_id`; informs monitoring frequency and the heuristic |
| Did the automatic **materiality suggestion** match the human outcome? (calibration before trusting any LLM assistant) | `change_events.materiality` vs `review_status` |
| Which rules stayed **UNKNOWN / Needs verification** longest, and which did users still act on? | `rules` status/evidence, `event_evaluations.requirements` |
| How often did users hit **"rules have changed since this plan was generated"** and did they recheck? | `event_evaluations.reason` (`RECHECK`), dashboard banner views |
| Which **rule explanations** (legal statement vs plain English vs action) drove manual clarification requests? | support notes mapped to `rule_family_id` |
| Which **authorities** lack a published submission method or deadline (`NO_PUBLISHED_DEADLINE_FOUND`)? | `authorities.submission_method`, `rules.deadline_definition` |
| Which **templates** were edited most, and did edits reduce rework? | `document_templates` versions, `documents.template_version` |
| How much **admin effort** did onboarding a city take (rules, sources, hours)? Is "Berlin as data onboarding" true? | audit-log entries per jurisdiction |
| Did **temporary restrictions** ever fire for real events, and how fast were they entered? | `temporary_restrictions` created vs `starts_at` |

## Methodology feedback for TheDuck
- Spec statements that were testable as invariants (e.g. "AI may never publish") became code-level guards and tests; keep writing specs this way.
- The migration against the *real* dev database found issues a clean test database would not (stale data shapes). Make "run against the previous version's real data" a standard milestone check.
- Record, per milestone: what was verified, what was only inspected, what remains unverified (see `docs/ARCHITECTURE-DELTA.md` §7).

## Delhi / Jantar Mantar (v0.4.0)
- Which Delhi rules produced support questions or manual clarification (expect: land-owner NOC, designated parking, how to submit to the DCP, Traffic NOC steps).
- How often 1,000+ plans hit the Ramlila routing, and whether users then asked for the booking workflow we have deliberately not published (DEL-RAM-002).
- How often DEL-TRAFFIC-001 and DEL-JM-022 stayed incomplete: these have no verified procedure, so they are the likeliest drop-off points.
- Notifications-feed change events: how many were real new Section 163 orders vs noise, and the lag from order published to recorded as a temporary restriction.
- Method note: summarised corpus handed over without the source document. The platform's "no URL → nothing published" guard turned a missing input into a safe partial load instead of a guess. Keep that pattern.
- Evidence-chain note: separating the governing instrument from current-practice confirmation (and press leads) let a rule stay verifiable by its instrument while the *current* deadline is corroborated elsewhere. Record how often current practice and the written order disagree; each disagreement is a candidate for a reviewed rule update.
- Track how long placeholder sources (e.g. the 25 May 2022 procession order) wait before extraction, and how many march plans hit the "no verified march rules" gap in the meantime.

## Live restrictions and large events (v0.7.0)
- Parser calibration: share of candidates accepted vs rejected, fields humans had to correct (`restriction_candidates` vs resulting `temporary_restrictions`), and lag from feed change to accepted draft.
- How often checks returned FEED_STALE or REVIEW_PENDING (`restriction_checks.status`) vs RESTRICTIONS_APPLY; whether T-72h/T-24h results changed organiser behaviour.
- How many large events skipped optional fields (speakers, footprint); how many marked applications and then made material changes (`event_changes.after_application`), and whether they acknowledged the advice.
- Whether users asked for the Ramlila booking steps we deliberately do not give (DEL-RAM-002) and which of the three approvals caused most drop-off.
- Method note: invariants ("a candidate is never ACTIVE", "no MCD link", "L&O/10/2022 stays metadata-only") were written as tests first; two real bugs (an operator-precedence slip and an off-by-one parameter index) were caught by them.

## Venue date conflicts (v0.8.0)
- How often the check returned OFFICIAL_STATUS_UNKNOWN vs NO_CONFLICT_FOUND, and whether users treated "no conflict found" as "available" (watch support questions).
- Which venues got official-check records and how stale they were; how many public-report signals were later confirmed or contradicted.
- How often organisers saw "Known to BookMyProtest" overlaps and changed date; whether two BMP users applied for the same Ramlila date.
- Whether the Ramlila booking-side and police-side pictures actually diverged once real checks exist (the 2023 lesson).

## Real-organizer acceptance test (v0.9, Delhi / Jantar Mantar / 500 people)
Full report: [acceptance/DELHI-JANTAR-500.md](acceptance/DELHI-JANTAR-500.md). Verdict: NOT READY FOR PRIVATE PILOT.

**What real organizer testing exposed that architecture and tests did not**
- Every engine invariant held (evidence labels, deadline maths, change snapshots, "no conflict found" wording) and the organizer was still left with the hardest question unanswered: *where do I send this, and who do I call?* Tests prove correctness of what we say; they cannot show what we never say.
- "Next action" was a rule title ("Prior police permission"), technically correct and operationally useless.
- A 100% score produced "You're prepared." next to an unconfirmed permission and a live restriction. Tick-boxes had quietly become a stand-in for permission status.
- The same facts were scattered across five places (dashboard row, pack checklist, undertaking sheet, request letter, timeline) with two different deadline dates.

**Assumptions that were wrong**
- "Honest uncertainty is enough": flagging gaps ("we have not verified how it is submitted") is trustworthy but not helpful unless it also says whom to ask and by when.
- "Verified" status is a property of a rule; to an organizer it reads as "BookMyProtest checked the document". Today it means the owner's summary plus the load date.
- "Conflict intelligence helps": with no official checks recorded, it mostly says "not checked".
- Questions we ask (stage, food, organizer type, end time) were assumed useful; none changed the Delhi output. The one input that matters for buses (how many) was never asked.

**Missing data that matters most (in order)**
1. Submission method, office, contact for DCP New Delhi District.
2. A link to the official undertaking form, and who issues the land-owner NOC.
3. Traffic NOC procedure and designated bus parking.
4. A real fetch of the Notifications feed.
5. Official availability signals for Jantar Mantar's police side.

**Features that turned out unnecessary or premature**
- The percentage ring as the headline for a permission-gated activity.
- Elaborate venue-conflict machinery before any official check data exists.
- Stage and food/water toggles for Delhi; the hero "Get quotes" button before compliance is understood.

**Block future work unless it removes organizer effort**
- No new rule family, venue, or signal type until the Jantar Mantar scenario can be completed with at most two phone calls.
- No new scoring/visual treatment of readiness; only a status derived from evidence (permission, restrictions, unknowns).
- No vendor feature that appears before the compliance need is established.
- Every milestone ends with a real-organizer run like this one, with an external-dependency ledger; the KPI is *external effort eliminated*, not rules covered.
- Method note: running the journey also surfaced two cheap wording bugs (a misleading "You're prepared." and press reports listed as sources) that no unit test had a reason to look for.

## Acceptance gap closure (v0.9.1)
Re-run of the Jantar Mantar / 500 people scenario after closing the verified P0 gaps. Verdict unchanged: NOT READY FOR PRIVATE PILOT, but for four smaller, named reasons.

- **Supplying five facts closed more than a feature would have.** The HAX Branch address and telephone, the Annexure B identity and pages, the clause numbers, the Jai Singh Road bus rule and the "shared, not guaranteed" wording turned FAIL/UNKNOWN rows into PASS with almost no new architecture. External effort eliminated rose from about 6 to about 8 of roughly 11. The expensive work was knowing the facts, not coding them. Prioritise sourcing missing operational facts over new machinery.
- **A rule is a sentence plus a place to go.** Rows that said what the law requires but not where to take the paper (or which page of which PDF) still sent organizers to search. Every row now carries its clause, its page and, where known, the office and number.
- **"No invented URLs" cost nothing and paid off.** The contact source is stored with no URL and says so; no email is stored, so nothing can imply email is accepted. A test now scans every rule, authority and source note for any sentence that would.
- **Testing the pipeline with a realistic page found two parser bugs that unit tests with tidy strings could not**: newlines flattened by the fetcher merged several orders into one candidate, and an order number such as `12/DCP/NW/2026` was read as the issuing authority. A synthetic fixture is still not the live page; the claim "real-source integration verified" was withheld because the sandbox cannot reach the site. `npm run probe:feed` exists so a person with network access can close it in one command.
- **Wrong assumption corrected:** that the questionnaire's yes/no "vehicles" was enough. The one number the rules need (buses) was missing, which blocked a plain-language answer ("2 buses are within the maximum") that organizers actually want.
- **Still the most valuable missing data:** a permission status the organizer can record, and an event-day state derived from evidence rather than ticks; the land-owner NOC route; the live feed's real markup.
- **Gate for future work:** nothing new on venues, signals or scoring until permission status and the real feed are done; both directly cut organizer effort.
