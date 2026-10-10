# BookMyProtest v1.0.1 — Public Beta Hardening: acceptance

> BookMyProtest informs, connects and assists. It does not authorize, certify, represent, endorse or guarantee.

## Verdict

**NOT READY FOR PUBLIC BETA**

The engineering work requested is complete and tested. The verdict is not READY because two of the requested items depend on things this build environment cannot supply, and one deployment prerequisite is not yet met:

| # | Blocker | Who can close it |
|---|---------|------------------|
| 1 | **The real notifications-feed probe has not run.** `npm run probe:feed` failed at the network: the environment's egress policy answers 403 to `delhipolice.gov.in` (see evidence below). The order parser has still never met the real page; the integration remains `PARSER_REAL_PAGE_VERIFICATION_PENDING`. | Owner: run `npm run probe:feed` from a network that can reach the site, commit `tests/fixtures/live/notifications.txt`, then record `PARSER_REAL_PAGE_VERIFIED` only if the parse is right. |
| 2 | **No Delhi rule has completed verification, so none was published.** The verification gate reports 0 of 38 unpublished Delhi rules ready. The corpus records no section reference or excerpt for the Standing Order (the PDF has never been readable from the build environment), so nobody has recorded reading the instrument. Public "Official information" for Delhi is therefore empty. | Owner/reviewer: read the instruments, record section + excerpt on each PRIMARY source link in the admin UI, then `npm run delhi:verify-gate -- --publish`. |
| 3 | **Email delivery is not configured.** Confirmation links are written to `email_outbox` but not sent. With confirmed-email gating on, no real user can publish or have their support counted until a provider is set (`RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`). | Owner: configure the provider. The admin Public listings page shows a warning until it is. |
| 4 | Legal pages (`/terms`, `/privacy`, `/platform-guidelines`) are still drafts marked LEGAL REVIEW REQUIRED BEFORE PUBLIC LAUNCH. | Counsel. |

Delhi is not enabled publicly and nothing was run with `--go-live` against any real database.

## What was built (no new product features)

1. **User reporting.** "Report this page" on every open public page (no account needed). Eight neutral conduct/content reasons (the same set as moderation; a test asserts the database constraint has no "disagree/offensive/political" category). A report never hides a page by itself, so it cannot be used for brigading. Duplicates are blocked per reporter while open; the owner cannot report their own page; hidden, draft and private pages cannot be reported. Admins resolve in `/admin/protests`: hide, remove (both logged through the existing moderation log with the report's reason) or dismiss (audited); other open reports on an actioned page settle with it. Organizers never see reports or who filed them.
2. **Verified-email gating.** One-time, hashed, expiring (48 h) links; a newer link replaces older ones; a link for an address the account no longer has is void. The link opens a page with a confirm button so email scanners cannot use it up. Unconfirmed accounts can browse, plan and save drafts; they **cannot** make a page Public or Unlisted and **cannot** follow, mark interest or offer help. Public counts include only confirmed, non-suspended supporters, enforced at read time (rows that predate the rule or were forged do not move the numbers).
3. **Durable, distributed rate limiting.** Counters live in Postgres (`rate_limits`), one atomic upsert per check: 25 simultaneous calls admit exactly the limit. If the database is unreachable the limiter degrades to per-instance memory (not fail-open) and the admin page says so. Applied to sign-up, sign-in, track, check, waitlist, vendor, confirmation requests, reports, supporter actions and publish saves. The client address now uses the entry appended by our own proxy (`TRUSTED_PROXY_HOPS`, default 1), not the spoofable first `X-Forwarded-For` value.
4. **Anti-impersonation signals.** BookMyProtest cannot verify who an organizer is and does not claim to. Names presenting the page as BookMyProtest (including look-alike spellings) are refused. Authority-like wording and names equal/one edit away from another organizer's are accepted but queued for human review (the organizer is told it is routine; the public page shows no flag). The public page states only: name is self-declared, contact email confirmed or not, month the account began. No "verified organizer" language anywhere.
5. **Real feed probe: attempted, blocked** (evidence below).
6. **Delhi rules: verification gate.** `src/lib/rule-verification.ts` + `npm run delhi:verify-gate` report exactly why each rule is or is not publishable and publish only rules that pass every check, by a named human admin. A load date is not treated as verification. It never goes live.

## Evidence

**Feed probe (verbatim):**
```
$ npm run probe:feed
Fetching https://delhipolice.gov.in/notification
FETCH FAILED: fetch failed
$ curl https://delhipolice.gov.in/notification
curl: (56) CONNECT tunnel failed, response 403
```
The proxy README says a 403 is an organization egress-policy denial that must be reported, not routed around. It was not.

**Verification gate against the dev database:**
`Delhi rules: 40 total · 2 active · 0 verification complete (not yet published) · 38 not ready` — each held rule: "no section reference and excerpt recorded: nobody has recorded reading the instrument" (and "held for review" for the clause-level items). The 2 active rules pre-date this milestone and were not touched.

**Automated tests:** `npx vitest run` → 18 files, 376 passed, 1 skipped (was 347). New: `tests/hardening-db.test.ts` (19: atomic rate limit, verification gating/counting/tokens, reports, impersonation), `tests/identity.test.ts` (6), `tests/rule-verification-db.test.ts` (4). Updated: public shape key list, supporter-identity code scan (aggregate counts may join users but must be GROUP BY only), migrations list.

**Public acceptance scenarios, real UI** (`scripts/e2e-public.mjs`, 66 checks, all ok; `V1.0.1 PUBLIC-BETA SCENARIOS A–H VERIFIED IN THE UI`):
- A organizer: unconfirmed email blocked from publishing and nothing published → link confirms → Jantar Mantar page shows "Submitted — reported by organizer", official links, never approved/verified.
- B supporter: anonymous browse → sign-in → asked to confirm email (no action buttons) → confirm → Planning to attend → aggregate increments → organizer sees totals only → undo.
- C multiple protests, D toolkit (Instagram/X/WhatsApp), E moderation (admin hides one listing, audit kept, other unaffected).
- F reporting: anonymous report; page stays visible; admin dismisses; second report actioned → page hidden; logged with reason.
- G identity: platform-name refused; matching name accepted, organizer told, appears in admin review, public shows self-declared/confirmed/since, no accusation; marked reviewed.
- H durable rate limit: repeated failed sign-ins blocked; counter row read back from the database.

**Accessibility:** `scripts/a11y-public.mjs` axe → 0 violations on 19 screens including unconfirmed publish editor, confirm-email (before/after), report form open/received, admin reports + identity review (one empty table header found and fixed during the run).

**Regression:** e2e (V0 journey; fixed a stale `percent ready` selector — the label was renamed in v1.0 and this script had not been updated; passes), e2e-v07, e2e-venues, e2e-delhi, e2e-admin (13 steps), a11y, a11y-v07 all pass.

## Commits
Implementation: `7bb0f27` (37 files; `git diff 9d69d72..7bb0f27`). `8f9213a` is only the version bump. v1.0 implementation: `9d69d72`. See [PUBLIC-LAUNCH-READINESS.md](PUBLIC-LAUNCH-READINESS.md).

## Schema, files, rollback
- Migration `011_beta_hardening.sql`: `users.email_verified_at` (admins marked confirmed), `email_verifications`, `email_outbox`, `rate_limits`, `protest_reports`, `public_protests.identity_flags/identity_reviewed_at`. Additive. Rollback: revert the commit and drop those tables/columns; existing data is unaffected. Existing non-admin accounts are unconfirmed and must confirm to publish/be counted.
- New: `src/lib/{verification,mail,reports,rule-verification}.ts`, `src/lib/engine/identity.ts`, `src/app/verify-email/`, `scripts/{delhi-verification-gate,prep-e2e}.ts`. Changed: `ratelimit.ts` (now async, DB-backed), `protests.ts`, `actions.ts`, protest/publish/account/admin pages, privacy draft. Screenshot: `docs/previews/v1.0.0/images/8-admin-reports.png`.
- Config: `APP_URL`, `RESEND_API_KEY`, `MAIL_FROM`, `TRUSTED_PROXY_HOPS`.

## Known limitations
- Rate-limit keys for anonymous visitors depend on correct proxy configuration (`TRUSTED_PROXY_HOPS`).
- A confirmed email proves control of an address, not identity; a determined bad actor can still create many confirmed accounts. Counts are harder, not impossible, to inflate.
- No reporter feedback loop (reporters are not told the outcome); reports from anonymous users are deduplicated by network address only.
- Admin accounts created by migration are marked confirmed; admins created later by other routes must be confirmed.
- This milestone's verdict does not change the legal-review requirement.

## TheDuck challenge pass
Does reporting enable takedown by pile-on? No: reports hide nothing. Can an unconfirmed throwaway account inflate counts? Not publicly. Can a name pose as the platform? Refused. Does the page imply organizers are verified? No: it says self-declared. Could a DB blip silently disable limits? It degrades to in-memory and shows a warning. Did "verified" Delhi rules mean anything? A load date was not accepted as verification; none were published.
