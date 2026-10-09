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
