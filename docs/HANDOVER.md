# BookMyProtest V0 — milestone handover

Vertical slice **plus** auth, documents, admin and polish, built as a Next.js modular monolith on PostgreSQL.

## What was built
Landing · questionnaire (6 steps, progressive) · rule engine · readiness score · checklist dashboard · vendor quote request · 6 document templates (print + .txt) · accounts (save plan) · admin (jurisdictions, rules with conditional logic + evidence ledger, events, vendor requests, funnel) · quick "Check requirements" · waitlist for unsupported cities.

Architecture notes
- `src/lib/engine/*` is pure TypeScript (no UI, no DB): `evaluate`, `readiness`. Rules live in Postgres and are edited in `/admin`; no compliance logic is in components.
- Geography: `jurisdictions` (country → state → city) with inheritance of rules from ancestors; `supported` flag gates the planner. Adding a city = admin rows, no code (tested).
- Evidence ledger: `rule_sources` + `last_verified_at`, `needs_review`, `confidence`, `rule_owner`. A rule is "verified" only with a source URL **and** a verification date **and** review flag off **and** non-low confidence (`evidenceStatus`, unit-tested). Anything else renders "Needs verification — Please verify with the relevant authority."
- Anonymous planning via an httpOnly `bmp_anon` cookie; signing up/in attaches those plans to the account. Plan pages 404 for anyone else.
- Analytics: first-party `analytics_events` table, whitelisted names, viewable in `/admin`.

## Run it
```
cp .env.example .env.local   # set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:migrate && npm run db:seed
npm run dev                  # or: npm run build && npm start
npm test                     # unit tests
npm run e2e && npm run e2e:admin && npm run a11y   # need a running server (BASE=...)
```

## Verification actually run (local, Postgres 16, Chromium 390×844 emulation)
| Check | Result |
|---|---|
| `npm test` (vitest): clause ops, AND/ANY conditions, assembly type, auto-complete, deadlines, UNKNOWN stays UNKNOWN, evidence rules, readiness weights/blockers/copy, 6 documents + disclaimer, answer validation | 21 pass |
| `scripts/e2e.mjs`: landing → unsupported-city waitlist → 6-step questionnaire → dashboard → mark done (0%→8%) → persists on return → vendor request → pack + download → signup → My plans → other visitor gets 404 | pass (dev **and** production build) |
| `scripts/e2e-admin.mjs`: admin gate, add country/state/city, add rule with conditions (doesn't fire at 10, fires at 80), unverified → verified flips to "Last verified: DATE", archive hides, vendor status | pass (dev and prod) |
| `scripts/a11y.mjs` (axe-core, 10 screens incl. dashboard/forms/pack) | 0 violations |
| Analytics events seen in DB: all 9 (`return_visit` verified by backdating a plan) | pass |
| `next build` + typecheck | clean |

## Basic security review (done by inspection, not a pen test)
- All SQL parameterised; zod validation on every input; React escaping; no `dangerouslySetInnerHTML`.
- Passwords scrypt + per-user salt, constant-time compare; sessions are random 256-bit tokens stored hashed, httpOnly/SameSite=Lax cookies (Secure in production).
- Server actions get Next's origin check; every plan action re-checks ownership (`loadOwnedEvent`); every admin action calls `requireAdmin()`; admin layout gates the UI.
- Redirect targets (`next=`) restricted to same-origin paths.
- Security headers (nosniff, frame deny, referrer, permissions policy). No CSP yet.
- Rate limits are **in-memory per instance** (login, signup, waitlist, vendor, tracking) — not sufficient behind multiple instances.

## Known limitations / NOT done (be honest before launch)
1. **Rules are development placeholders.** The only populated geography (Bengaluru, Karnataka, India) is flagged `is_dev_seed`; its 24 rules have **no sources, are unverified, and deadlines are placeholders**. No evidence sources were used. The UI labels every one "Needs verification" and shows a "Development sample" banner. Someone must research, source and verify real rules in `/admin` before any public launch. Do not launch with this data.
2. **Sentry / error monitoring: not wired** (only `error.tsx`/`not-found.tsx` boundaries). DoD item **not met**.
3. **PostHog, Supabase/Clerk, object storage, Vercel deployment: not done.** Auth is first-party email+password; analytics is first-party. Nothing is deployed, so there are **no working public URLs**.
4. No password reset, email verification, or outbound email (vendor/waitlist notifications are admin-visible only).
5. Mobile was tested with Chromium device emulation, not real phones; keyboard navigation checked via axe rules, not a full manual pass; no screen-reader pass.
6. `Organizer` is stored inside the event (`answers`), not as its own table. `Requirement` = `rules` evaluated live; `EventRequirement` = manual completion state.
7. Plans cannot be edited after creation (answers are fixed; create a new plan). Intentional scope cut.
8. Localisation not built; dates use `Intl` (en-GB) and copy is English, but layouts use no fixed-width text assumptions.
9. PII (organizer/vendor-request contacts, waitlist emails) stored in plaintext with no retention policy.
10. No CSP; in-memory rate limiting (see above).
11. Screenshots are generated into `shots/` (git-ignored).

## Next smallest milestone
Research and load **one real city's** rules with sources (replace the dev seed), mark them verified in `/admin`, then wire Sentry + deploy, then test with 3 real organizers.
