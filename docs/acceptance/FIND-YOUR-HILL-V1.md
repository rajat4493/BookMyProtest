# Find Your Hill v1: acceptance

> BookMyProtest informs, connects and assists. It does not authorize, certify, represent, endorse or guarantee.

**Status: built and tested; NOT enabled.** Behind `FEATURE_FIND_YOUR_HILL` (default off). Nothing was deployed, no flag was turned on outside tests, and the public-launch gates (`rc:check`, the four blockers) are unchanged. See also [DIGITAL-ACTIONS-V1.md](DIGITAL-ACTIONS-V1.md) and the plan in [../V1.1-SCOPE-AND-PLAN.md](../V1.1-SCOPE-AND-PLAN.md).

## What a visitor gets
`/issues`: keyword search plus state, city, nationwide and topic filters; results show the source count, when the information was last checked, and the number of related protests and digital actions. `/issues/[slug]`: neutral title and summary, what it is, why it is discussed, **evidence and sources** (labelled official record, research, independent reporting or statement by an involved party), **different perspectives**, **disputed claims**, **recent developments** (each with a source), **what remains unknown**, last-checked date, published **corrections**, related protests and digital actions, and Follow / Explore / Create-a-campaign. Reading never needs an account. The page states that BookMyProtest endorses no position described.

An issue stands on its own: with no protest and no campaign the page still works and says so.

## Ordering (no manipulation)
Text relevance, then whether the issue covers the visitor's chosen place, then how recently the information was checked, then documented source quality (official record 3, research 2, independent reporting 2, statement by an involved party 1). Nothing about the viewer, no popularity, no follower count, no participation and no belief signal enters the ordering; a test follows an issue with many accounts and asserts the order does not move. The page tells the visitor this.

## Where the content comes from (read this)
- **The catalogue ships empty.** This build environment cannot reach most official sites, and I will not invent a source. Issues are written and published by a human admin through `/admin/issues`; the screens show exactly what is missing before a draft can be published (a descriptive, non-slogan title; factual description; why it is discussed; at least one https source and at least one independent of the parties; a statement of what is unknown; a check date). Only a person publishes, with a note, and it is audited.
- **Whether any real issue's sources are accurate is an editorial task this software cannot verify.** The browser tests use a clearly labelled TEST FIXTURE with placeholder links.
- **No AI is used.** No new AI service, crawler or auto-summariser exists. Users can *suggest* an issue (confirmed email, 3/day, no personal details); a suggestion only enters a review queue, and an admin may start a *draft* from it. Nothing is published from a suggestion.
- Issue evidence (`issue_sources`) is separate from the legal-rule source registry that drives the Delhi compliance engine; neither reads the other.

## Reuse
Accounts and confirmed-email gating, `allow()` rate limits, `screenPublicText`, the `Provenance` component (one new class: *Link to independent source*), report/moderation patterns and the admin shell. New tables only for what could not be reused safely (`issues`, `issue_sources`, `issue_followers`, `issue_suggestions`, `issue_protest_links`, shared `content_reports`/`content_corrections`). Migration `012` is additive.

## Linking protests
A public-protest organizer may link their page to a published issue (publish screen, only when the flag is on). The issue lists the protest; the protest shows "documented on Find Your Hill". Linking is the organizer's choice and states it is not an endorsement either way. The existing protest wizard is untouched.

## Moderation, reports and corrections
"Report this page or correct a statement" on every issue page, open to anyone including a party named on it. A report never hides anything. A factual-error report asks the reporter to quote the statement; a moderator can **publish a correction beside the original or dismiss** (a factual dispute has no remove option). Hiding or removing needs a conduct reason (threat, harassment, doxxing, impersonation, fraud, illegal content, spam) and a note; "unpopular" or "disagreed with" is not a reason. All decisions are audited.

## Tests
- Pure (`tests/hill-pure.test.ts`, 22) and DB (`tests/hill-db.test.ts` 32, `tests/hill-protest-link.test.ts` 3): publish gates, search filters and ordering, impersonal ordering, suggestions, following (confirmed accounts only, undo, own state only), hide/restore, corrections, protest link, no financial fields.
- Browser (`scripts/e2e-hill.mjs`): **A** a visitor searches, reads sources, perspectives, disputed claims, unknowns and the check date with no login; **B** no campaign exists, the page works and offers to create one; flags-off check (all new routes 404, no navigation entries, existing pages unchanged).
- Accessibility (`scripts/a11y-hill.mjs`, axe): 0 violations on 22 screens.
- Screenshots: `docs/previews/v1.1.0/images/` (`1-admin-issue-editor`, `2-find-your-hill-search`, `3-issue-page`).

## Limitations and deferred
- No real issue content; editorial process and capacity are unresolved (who writes, who reviews, how often sources are re-checked, how a published issue is kept current).
- Search is Postgres full-text (`simple` dictionary): no stemming for Indian languages, no synonyms, no transliteration.
- "Last checked" is a human-entered date, not an automatic one; nothing re-checks sources.
- Related-protest linking is one issue per protest.
- Public issue pages are not in a sitemap and are `noindex` only while the flag is off (the routes 404); search-engine strategy is not decided.
- Legal review (defamation exposure for issues naming institutions, notice-and-action duties) is required before enabling; not done.

## Rollback
Turn the flag off (routes disappear immediately). Schema rollback: drop the tables created by `012` and the two `moderation_actions` columns; no existing data is altered.

## Scenario G: existing product regression (flags OFF, as shipped)
All passing on the same build with both flags unset: `e2e-v07`, `e2e-venues`, `e2e-delhi` (Delhi organizer journey, official information, permission lifecycle), `e2e-admin` (13 steps), `e2e` (V0 journey; only the expected 404 console line), `a11y` and `a11y-v07` (0 violations), and `e2e-public` (66 checks: public protests, supporter privacy, reporting, moderation, identity, rate limit). `e2e-public` and `a11y-public` also pass with both flags ON, so the new modules do not alter the existing journeys. `npm run rc:check` output is unchanged: the same four blockers (feed probe, Delhi rule verification, email delivery, legal review) remain open; v1.1 neither closes nor delays them.

Test totals: `npx vitest run` 22 files, 448 passed, 1 skipped (was 391).
