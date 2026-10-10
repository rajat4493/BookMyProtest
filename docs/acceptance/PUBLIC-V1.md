# BookMyProtest v1.0 — Public Launch Foundation: acceptance

> BookMyProtest informs, connects and assists. It does not authorize, certify, represent, endorse or guarantee.

## Verdict

**READY FOR CLOSED PUBLIC BETA** — conditional on the launch blockers below being accepted or closed by the owner. This is not a public-launch verdict.

## Implemented scope
- Positioning/copy audit: approval/booking/"verified" language removed; preparation language throughout; automated copy-audit test over `src/app` and `src/components`.
- First-class `public_protests` entity (visibility DRAFT/PRIVATE/UNLISTED/PUBLIC/ARCHIVED/CANCELLED); explicit publish only; never auto-created from a plan.
- Provenance classes (ORGANIZER_PROVIDED, BOOKMYPROTEST_SOURCE_CHECKED, OFFICIAL_SOURCE_LINK, SYSTEM_DERIVED, UNKNOWN) with one reusable component.
- Organizer Prepare → Publish (`/plan/[id]/publish`): preview, public-field and support-option choice, publish/unpublish; permission status never blocks publishing.
- Public page `/protests/[slug]` (sections A–H + transparency footer); discovery `/protests` (no login; city/state/date/category/upcoming/newest; no political ranking).
- Supporter actions FOLLOWING / INTERESTED / PLANNING_TO_ATTEND, undoable, aggregate counts only; support offers (volunteer, transport, water, printing, first aid, other); no payments.
- Social toolkit (Instagram, X post/thread, WhatsApp, Facebook/LinkedIn, blurb, FAQ, know-before, bring) from organizer data + held logistics; never auto-published.
- Multiple protests per venue/date shown as "Other public protests are listed for this date."; no capacity maths.
- Public permission labels (Not started … Status not provided), no green.
- Moderation: organizer edit/unpublish/cancel/archive; admin hide/restore/remove/suspend organizer with 8 reason codes, all logged to `moderation_actions` + `audit_log`.
- Draft `/terms`, `/privacy`, `/platform-guidelines` marked LEGAL REVIEW REQUIRED BEFORE PUBLIC LAUNCH.
- 12 analytics events with a whitelisted property set (no ideology).

## Journeys (all verified in the real UI by `scripts/e2e-public.mjs`)
- A Organizer: Jantar Mantar plan, permission SUBMITTED → public "Submitted — reported by organizer", official links shown, never "approved"/"verified".
- B Supporter: anonymous browse → login → Planning to attend → aggregate increments; organizer sees count only; undo works.
- C Multiple protests at one venue/date listed without availability/capacity claims.
- D Toolkit: Instagram/X/WhatsApp drafts carry the provenance note; no approval/endorsement claims; no private details.
- E Moderation: admin hides one listing; hidden page 404s; opposing listing unaffected; log preserves reason.

## Provenance model
Every public fact carries a class + as-of date + source where one exists. Organizer-provided facts read "Reported by organizer · updated <date>"; calculated facts read "Calculated from <source> · source"; official links are links only; unknown stays UNKNOWN. Permission is always "reported by organizer".

## Moderation model
Viewpoint-neutral, reason-coded (VIOLENCE_OR_THREAT, HARASSMENT, DOXXING, IMPERSONATION, FRAUD, ILLEGAL_CONTENT, SPAM, OTHER), note required, human actor only. `moderation_status` (OK/HIDDEN/REMOVED) is separate from organizer-controlled visibility. Suspending an organizer hides all their pages; admins cannot be suspended. Everything is logged and reversible by restore.

## Privacy minimization
Public reads use an explicit column whitelist (never event_id, owner_user_id, contact). Supporter tables hold only protest_id, user_id, kind, created_at; viewers see only their own state; counts are aggregate; no identity lists, no exports. Emails/phones are screened from public text. No Aadhaar/ID/religion/caste/party/ideology fields exist. A code-scan test fails if any file outside `protests.ts` touches supporter tables; a shape test pins the public key set.

## Launch blockers (must be accepted or closed before beta traffic)
1. No public content-reporting route (moderation is admin-initiated only).
2. Rate limiting is in-memory (single instance only).
3. Unverified email signups can inflate aggregate counts.
4. Organizer display names are unverified; impersonation is mitigated only by moderation and the transparency footer.
5. Delhi rules remain DRAFT in the real DB, so public "Official information" is empty for Delhi until the owner publishes; Delhi is not enabled publicly and no go-live was run.
6. Feed parser unverified against a real page; recheck results are not pushed.

## Legal-review items
Terms, Privacy and Platform Guidelines are drafts; intermediary/IT-Rules obligations, grievance officer, data-retention and DPDP consent wording, and the support-offer disclaimer need counsel review.

## Deferred (out of scope by design)
Payments, donations, crowdfunding, vendor checkout, escrow, political ads/targeting, supporter exports, chat/DMs/mass messaging, native app, nationwide expansion, auto government submission, approval prediction, party integrations.

## Screenshots
`docs/previews/v1.0.0/images/`: publish editor, public page (mobile), discovery, supporter counts, multiple protests, toolkit, admin moderation.

## Test evidence
- `npx vitest run`: 15 files, 347 passed, 1 skipped (one earlier full run showed 1 transient failure that did not reproduce on the immediate rerun; not root-caused).
- `scripts/e2e-public.mjs`: scenarios A–E all ok.
- `scripts/a11y-public.mjs` (axe): 0 violations on discovery, filtered discovery, terms, privacy, guidelines, admin listings, my plans.
- Regression: e2e (only an expected 404 console line), e2e-v07, e2e-venues, e2e-admin (13 steps), a11y (0 violations) pass.
- Mutation checks confirmed the exposure and moderation tests fail when the protections are removed.

## TheDuck challenge pass
- Does anything look like an approval? Fixed: all approval/booking/"verified" copy removed; copy-audit test enforces it.
- Is a hidden/organizer-reported fact distinguishable? Yes, via provenance labels.
- Browse without login? Yes. Organizer sees supporters? Counts only.
- Political profiling? None stored or exposed. Endorsement confusion? Footer on every public page plus toolkit note.
- Official vs organizer facts distinguishable? Yes. Generated copy implies endorsement? Forbidden-claim tests block it.
- Moderation viewpoint-neutral? Reason codes are conduct-based only. Unneeded data? None collected.

## Engineering handover
- Base commit: df0861d (v1.0 work committed on top on `claude/loving-volta-xrhoqz`; see git log for the v1.0 SHA). No PR; no production deploy.
- Migration: `db/migrations/010_public_protests.sql` (additive). Rollback: drop the five new tables and the two `users` columns, revert the commit; existing plans/events are untouched. No private plan was published.
- Routes: `/protests`, `/protests/[slug]`, `/plan/[id]/publish`, `/plan/[id]/publish/toolkit`, `/terms`, `/privacy`, `/platform-guidelines`, `/admin/protests`.
- Key files: `src/lib/protests.ts`, `src/lib/moderation.ts`, `src/lib/engine/{provenance,public-protest,toolkit}.ts`, `src/app/actions.ts`, `src/lib/store.ts`, components `provenance|transparency|protest-bits|protest-card|legal-draft`, tests `tests/public-protests.test.ts`, `tests/public-db.test.ts`.
- Known limitations: see launch blockers.
