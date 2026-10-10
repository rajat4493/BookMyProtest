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
