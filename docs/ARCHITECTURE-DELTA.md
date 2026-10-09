# Rules Platform — Architecture Delta (v0.3.0)

BookMyProtest is now **a regulatory knowledge platform with an application on top.** A new city, authority, rule, deadline or source, or a superseded requirement, is a data/admin operation. No Delhi (or any production) rules are loaded in this milestone; the only populated geography is still the marked development seed.

## 1. Architecture summary

Modular monolith, three strictly separated concerns. The product layer contains no jurisdiction-specific logic.

| Layer | Where | Contents |
|---|---|---|
| **A. Product Experience** | `src/app/*` (plan, check, pack, vendors, account), `src/components/*` | Questionnaire, readiness, checklist, documents, vendors, dashboard. Reads evaluated results only. |
| **B. Regulatory Knowledge Platform** | `src/lib/engine/*` (pure), `src/lib/knowledge.ts`, `src/lib/store.ts`, `src/app/admin/*`, `db/migrations/002_*` | Jurisdictions, authorities, rules + versions, structured conditions, sources, templates, temporary restrictions, review workflow, audit. |
| **C. Regulatory Watch** | `src/lib/engine/watch.ts`, `recordSourceContent` / `checkSource` / `runDueChecks` in `knowledge.ts`, `scripts/watch.ts` | Source registry → snapshot → hash compare → diff → suggestion → affected-rule mapping → review queue → human decision → new rule version. |

Pure functions (testable without a database), all in `src/lib/engine/`:

- `select.ts`: `selectRules` (jurisdiction chain inheritance, OVERRIDE/EXCLUDE, version-by-date, lifecycle eligibility), temporary-restriction overlays.
- `evaluate.ts`: condition evaluation (unchanged operators), evidence status, **freshness**, structured **deadline** computation.
- `templates.ts`: template selection (jurisdiction specificity → version → effective window) and a small safe renderer (no code execution).
- `watch.ts`: normalisation, hashing, diff, and the change-suggestion type.

The pre-existing rule engine (`evaluate`, `readiness`, condition clauses) is **kept**; it was extended, not replaced. The questionnaire and user flows are unchanged.

### Evaluation order (conceptual)
`base law` → `local standing rule` → `venue rule` → `temporary restriction` → `final current guidance`.
Implementation: rules in the jurisdiction chain (general → specific) are selected for the **event date**; a more specific rule may OVERRIDE or EXCLUDE an inherited rule family; then active temporary restrictions overlay the result. Restrictions never rewrite a rule's outcome; they mark the affected items ("A temporary restriction may change this requirement") and show a warning panel.

### The guardrails (enforced in code, not only in the UI)
- **Only ACTIVE rules can be verified guidance.** `evidenceStatus` requires ACTIVE + a linked official source with a URL + a verification date + review flag off + non-low confidence.
- **Secondary reporting never verifies anything.** `SECONDARY_LEAD` sources and `LEAD`-strength links are ignored by `evidenceStatus` and rejected by `publishRule`.
- **Publishing needs a human.** `publishRule`, `dismissChange`, `startReplacement`, every save/archive etc. call `assertHuman(actor)`; `null`, `undefined`, `"ai"`, `"system"` or any non-UUID actor throws. The Regulatory Watch assistant returns a plain `ChangeSuggestion` data object that has no way to touch a rule.
- **Live rules are never edited in place.** `saveRuleDraft` refuses anything but DRAFT/UNDER_REVIEW; the path is *clone as new version → evidence → publish → old version SUPERSEDED*.
- **Detected change is not silent.** Source hash change → rules citing it become `CHANGE_DETECTED` → users see "A possible regulatory change has been detected. Please verify this requirement with the relevant authority."
- **No manufactured deadlines.** Deadlines are `STRUCTURED` (only then a date is computed), `UNKNOWN`, or `NO_PUBLISHED_DEADLINE_FOUND`.
- **History is append-only.** `event_evaluations` rejects UPDATE at the database level (trigger).

## 2. Schema / migration summary

`db/migrations/002_rules_platform.sql` (additive; V0 columns and tables are preserved). The runner (`npm run db:migrate`) records applied files in `schema_migrations`.

| Area | Change |
|---|---|
| `jurisdictions` | level now `country/state/region/district/city/zone/venue` (generic parent→child, any depth); `code`, `metadata jsonb` (country-specific extensions), `archived_at`. |
| `authorities` | first-class: `authority_type`, contact, `submission_url`, `submission_method`, `office_address`, `active`, `notes`, `last_verified_at`. |
| `sources` *(new)* | registry with `source_type` (PRIMARY_LAW, BINDING_CASE_LAW, OFFICIAL_ADMINISTRATIVE_RULE, OFFICIAL_CURRENT_PRACTICE, SECONDARY_LEAD), dates, `content_hash`, `monitoring_enabled/frequency`, `last_checked_at`. |
| `source_snapshots` *(new)* | `retrieved_at`, `content_hash`, `raw_text`, `status`. |
| `rules` | + `rule_family_id`, `version`, `rule_status` (DRAFT/UNDER_REVIEW/ACTIVE/CHANGE_DETECTED/SUPERSEDED/ARCHIVED), `legal_statement`, `user_action`, `deadline_definition jsonb`, `submission_method`, `effective_from/until`, `reviewed_by/at`, `supersedes_rule_id`, `inheritance_mode`, `overrides_family_id`. `description` = the plain-English explanation. Unique `(rule_family_id, version)`. |
| `rule_sources` | now a **join** `(rule_id, source_id)` with `evidence_strength`, `excerpt`, `section_ref`, `interpretation_note`, `relevance`. |
| `rule_documents` *(new)* | required/conditional documents with `template_key`, `authority_id`, `notes`, `source_reference`. |
| `document_templates` *(new)* | versioned, per jurisdiction (null = global), effective dates, source, disclaimer. |
| `temporary_restrictions` *(new)* | jurisdiction, geographic scope, window, legal basis, affected activities, effect, source, status. |
| `change_events`, `change_event_rules` *(new)* | review queue: materiality, priority, summary + origin, affected rules, review status/notes/reviewer, replacement rule. |
| `event_evaluations` *(new)* | immutable snapshot: answers, rule IDs + versions, fingerprint, sources, requirements as shown, restrictions, readiness. |
| `events` / `documents` / `audit_log` | `events.venue_jurisdiction_id`; `documents.template_id/version`; `audit_log.before/after/reason`. |

### Mapping of V0 data (applied to the real dev database, 27 rules / 24 events / 3 sources)
| V0 | New model |
|---|---|
| active rule | `ACTIVE`, family `LEGACY-xxxxxxxx` (dev seed: `DEV-nnn`), version 1; stays unverified → still "Needs verification" |
| archived rule | `ARCHIVED` |
| `deadline_days_before` + `deadline_note` | `deadline_definition` STRUCTURED (or UNKNOWN when only a note) |
| per-rule source rows | registry `sources` + `rule_sources` join, **typed `SECONDARY_LEAD`/`LEAD`** until an admin classifies them (conservative: they cannot verify a rule) |
| `required_documents[]` | `rule_documents` rows |
| events | unchanged; each gets a `BACKFILL` evaluation snapshot lazily on first open |
| hard-coded document text | seeded as global v1 `document_templates` |

Legacy columns (`required_documents`, `deadline_days_before`, `deadline_note`, `archived_at`, `needs_review`, `official_link`) and `rule_sources_legacy` are **kept** for rollback/comparison; nothing reads them for logic except `needs_review` (still part of "verified").

## 3. Admin workflow (lightweight regulatory CMS)

Screenshots: `docs/previews/v0.3.0/` (README there shows them). Pages: **Rules** (lifecycle, version history, evidence, conditions, structured deadline), **Sources** (+ monitoring, snapshots, manual content entry, cited-by), **Review queue**, **Authorities**, **Jurisdictions**, **Templates**, **Restrictions**, **Audit**, Events, Vendor requests.

## 4. Example: dummy rule-versioning flow (executed by `scripts/e2e-admin.mjs`)
1. Admin adds `Testland › Testregion › Testville` (live), authority "Test Police Authority", source "Public Assembly Order" (official, monitored).
2. Drafts rule **TST-…-001** v1: *attendance > 50 → REQUIRED/CRITICAL*, deadline STRUCTURED 7 calendar days. Publishing is **refused** (no evidence). Attach the source (PRIMARY, "para 4") → publish → `ACTIVE`.
3. A user plans an 80-person event in Testville: sees the rule as **Current · Last verified: DATE**. Snapshot #1 pins `TST-…-001@1`.
4. Admin **clones** → v2 draft, sets deadline 14 days, re-verifies, publishes. v1 becomes **SUPERSEDED**, `effective_until` = v2's `effective_from`.
5. The user reopens the plan: *"Rules have changed since this plan was generated."* Snapshot #1 still pins v1 (database confirms). **Recheck** appends snapshot #2 pinning v2; done ticks carry over by rule family.

## 5. Example: source-change review flow
1. Admin records the source text (first content = baseline, no review item). Records changed text ("7/14 → 21 days").
2. Hash differs → **change event** (diff excerpt, suggestion: *potentially material, priority high, "automatic summary, not a legal finding"*). Every ACTIVE rule citing the source becomes `CHANGE_DETECTED`; the user's dashboard shows **Change under review**.
3. Reviewer either **Dismiss** (rule returns to ACTIVE, reviewer notes recorded) or **Start new version**: draft v+1 → evidence → publish → the old version is superseded and the change event closes as `APPROVED_UPDATE`.
4. Everything above is in the audit log with actor, before/after and reason. At no point does the assistant publish or change a rule (test: an over-confident "cosmetic" AI summary leaves the rule `CHANGE_DETECTED`).

## 6. Tests run (all on the final build)
| Suite | Result |
|---|---|
| `npm test`: 69 tests: 21 V0 engine/doc/validation, 26 platform-logic (inheritance, venue override/exclude, narrowing, version-by-date, superseded/expired/future/draft not firing, CHANGE_DETECTED flagged, freshness states, UNKNOWN stays UNKNOWN, temporary restriction window/chain/status/activity overlay, structured & business-day deadlines, template selection by specificity/version/window, renderer, diff/hash/heuristic suggestion), 22 database (chain of any depth, venue events, human-only publish, official-source gate, secondary-lead rejection, draft→review→active, no in-place edit, audit before/after, clone/supersede, event keeps its version, recheck + done carry-over, immutable snapshots, archived rules, restrictions through the stack, baseline/unchanged/changed, dismiss, replacement approval, **AI cannot publish**, template versioning, V0 migration shape) | **69 pass** |
| `scripts/e2e-admin.mjs`: all 13 definition-of-done steps in a real browser against the production build | **pass** |
| `scripts/e2e.mjs`: unchanged user journey (waitlist, questionnaire, dashboard, vendor, pack, signup, access control) | **pass** |
| `scripts/a11y.mjs`: axe on 10 user screens | **0 violations** (admin pages not scanned) |
| Real migration against the existing V0 dev database | applied cleanly; 24 ACTIVE / 3 ARCHIVED preserved |
| `tsc --noEmit`, `next build` | clean |

A bug found and fixed by the tests: a wrong bind-parameter index in the rule insert.

## 7. Known limitations
1. **No real regulatory content.** No Delhi data. The Bengaluru seed remains an unverified dev placeholder and is the only populated city.
2. **`checkSource` (live HTTP fetch) is untested over a real network** from this sandbox; the detection pipeline is tested through `recordSourceContent` (manual paste) and an injected fetcher type. Fetching blocks private/loopback hosts but is otherwise minimal (no JS rendering, no PDF text extraction, no robots handling, no retry).
3. **The "AI" is a deterministic heuristic.** `ChangeAssistant` is the plug-in point for an LLM; none is wired. Guardrails are independent of it.
4. **`CHANGE_DETECTED` is conservative:** every non-no-op change flags all ACTIVE rules citing the source, even if the suggestion says "cosmetic", so a reviewer must clear it. Expect noise on volatile pages.
5. A rule citing several sources is flagged when *any* of them changes; there is no per-excerpt tracking.
6. **No scheduler is deployed.** `npm run watch` must be run by cron/a job runner.
7. Business-day deadlines skip weekends only (no public-holiday calendar).
8. Temporary-restriction matching is by date window, jurisdiction chain and activity tags; **geographic scope is free text** (no geometry), so "applies to the venue" is a human judgement shown as a warning.
9. Venue-level events need `venue_jurisdiction_id`; the questionnaire does not ask for a venue (flow intentionally unchanged), so it is data-ready but not user-selectable yet.
10. Templates use a small custom syntax (documented in `/admin/templates`); there is no WYSIWYG or preview, and changing a template's variables requires a developer if a new variable is needed.
11. Admin screens were not accessibility-scanned; admin UX is intentionally plain. Admin pages are only gated by the existing role check (no per-role permissions such as editor vs approver).
12. Rate limits, PII retention and Sentry gaps from V0 are unchanged.
13. Migrated V0 evidence is typed `SECONDARY_LEAD`, which is intentionally pessimistic.

## 8. Migration notes
- Run `npm run db:migrate` (applies `db/schema.sql` once as baseline, then `db/migrations/*.sql` once each; also seeds default templates). Safe to re-run. Take a backup first on any real database: the migration renames `rule_sources` → `rule_sources_legacy` inside a transaction.
- `npm run db:seed` now writes the new columns; the dev seed rules are `ACTIVE` but unverified.
- Rolling back means restoring a backup; there is no down-migration.
- Plans created before this release get a `BACKFILL` snapshot the first time they are opened, pinned to the rules current at that moment (we cannot reconstruct what they originally saw).
- Publishing a new version is the **only** way to change a live rule. Existing seed rules must be cloned, evidenced and published to become verified.

## 9. Files changed
**New:** `db/migrations/002_rules_platform.sql`, `src/lib/knowledge.ts`, `src/lib/default-templates.ts`, `src/lib/engine/{select,templates,watch}.ts`, `src/components/{admin-ui,empty}.tsx`, `src/app/admin/{sources,authorities,review,templates,restrictions,audit}/…`, `scripts/watch.ts`, `tests/{rules-platform,platform-db}.test.ts`, `docs/ARCHITECTURE-DELTA.md`, `docs/THEDUCK-LEARNING-CAPTURE.md`, `docs/previews/v0.3.0/*`.
**Changed:** `src/lib/engine/{types,evaluate}.ts`, `src/lib/{store,documents,plan,db}.ts`, `src/app/actions.ts`, admin rules/jurisdictions/overview/layout pages, `src/app/plan/[id]/{page,pack/page,pack/download/route}.tsx`, `src/components/requirement.tsx`, `src/app/{account,check}/page.tsx`, `scripts/{migrate,seed,e2e-admin}`, `tests/{fixtures,engine}`.

## 10. Next smallest milestone
Load **one real jurisdiction's** rules with sources through the new admin (starting with Delhi), have a human verify and publish them, wire a scheduler for `npm run watch` against two or three real official URLs, and wire Sentry. Then validate with real organisers (V0 validation threshold unchanged).

## TheDuck
The TheDuck learning-capture requirement from the original spec is kept and extended for the platform: see [THEDUCK-LEARNING-CAPTURE.md](THEDUCK-LEARNING-CAPTURE.md).
