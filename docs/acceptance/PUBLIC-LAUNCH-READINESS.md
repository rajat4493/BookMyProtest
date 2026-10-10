# Public Launch Readiness: checklist and release-candidate script

Scope: **only** the four blockers that kept v1.0.1 at NOT READY FOR PUBLIC BETA. No feature work. Nothing here substitutes for an external check: where a gate needs a network, a reader, a provider or a lawyer that this build environment does not have, the gate stays BLOCKED until that party acts.

Current state (checked 2026-10-10 with `npm run rc:check` against the dev database): **all four gates open** → NOT READY FOR PUBLIC BETA.

## 1. Commit record (corrects the earlier handover)

`8f9213a` is only the version bump. The implementation commits are:

| SHA | What it contains |
|-----|------------------|
| `df0861d` | v0.9.2 baseline (permission lifecycle, readiness engine). Everything below builds on it. |
| `9d69d72` | **v1.0 implementation**: public protests, discovery, supporter actions, toolkit, moderation, provenance, legal drafts, migration `010`. |
| `e59f122` | v1.0 docs only (records `9d69d72`; version bump to 1.0.0 is in `9d69d72`'s tree via package.json). |
| `7bb0f27` | **v1.0.1 implementation** (37 files): user reports, verified-email gating, durable rate limits, identity signals, rule-verification gate, e2e/a11y updates, migration `011`. |
| `8f9213a` | v1.0.1 version bump only (`package.json`). |
| *this commit* | Readiness checklist + `scripts/rc-check.ts` + `npm run rc:check` (no product code). |

To see the whole hardening change: `git diff 9d69d72..7bb0f27`. The release candidate is whatever commit `rc:check` prints with a clean working tree; do not tag a commit it reports as dirty.

## 2. Who does what

| Gate | Blocker | Owner action | Engineering action | Legal counsel |
|------|---------|--------------|--------------------|---------------|
| 1 | Real feed probe | Run the probe from a network that can reach `delhipolice.gov.in`; review the parse; record the parser flag in Admin → Sources | Only if the parse is wrong against the real page: fix the parser to the page and keep the saved page as the regression fixture. Nothing before the probe has run. | – |
| 2 | Delhi rules verified | Designate the reviewer; reviewer reads each instrument and records section + excerpt; run the publish gate; decide the two pointer rules; decide go-live separately | None unless the gate or a rule definition is wrong. No publishing on anyone's behalf. | Advise only if the reviewer cannot establish what a clause says |
| 3 | Email delivery | Choose and pay for the provider, verify the sending domain, set secrets and proxy count in the deployment, do one real sign-up | Confirm the candidate boots with the settings; fix a delivery bug if the real send fails | – |
| 4 | Legal review | Engage counsel, supply facts, file the sign-off reference | Replace draft text with counsel's final text and remove the draft banner, exactly as approved | Review and approve the three documents and answer the questions in 3.4 |

Nothing in the table can be done by the assistant alone: the first three need the outside world, the fourth needs a lawyer. Assistant/engineering never sets `PARSER_REAL_PAGE_VERIFIED`, never attests a rule is verified, and never removes the legal banner on its own judgement.

## 3. The four gates

### 3.1 Gate 1: real notifications-feed probe (OWNER)
Why blocked: the build environment's egress policy returns 403 for `delhipolice.gov.in`; the parser has only met synthetic wording. Status flags today: `SOURCE_VERIFIED`, `FETCH_IN_THIS_ENVIRONMENT_BLOCKED`, `PARSER_REAL_PAGE_VERIFICATION_PENDING`.

- [ ] (Owner) From an unrestricted network with the repo checked out at the candidate commit: `npm run probe:feed`. It is read-only; it writes `tests/fixtures/live/notifications.txt` and prints what the parser made of each order-like block.
- [ ] (Owner) Compare the printed parse (issuer, date, scope, start/end, missing fields) with the live page by eye. Record what you checked and the date in the sign-off table.
- [ ] (Owner) If the page lists no orders at the time, that is a valid but weak result: record it as such and repeat when an order is listed; do not mark verified on an empty page.
- [ ] (Engineering, only if wrong) If any field is mis-parsed, fix `order-parser.ts` against the saved page, keep the fixture, make `tests/notifications-feed.test.ts` hold the parser to it. Then the owner repeats the probe.
- [ ] (Owner) Commit `tests/fixtures/live/notifications.txt` to the candidate branch.
- [ ] (Owner) In Admin → Sources → the live-restrictions feed: remove `PARSER_REAL_PAGE_VERIFICATION_PENDING`, add `PARSER_REAL_PAGE_VERIFIED`. A person records this; code does not.
- Pass condition (`rc:check`): fixture present and non-trivial, source has `PARSER_REAL_PAGE_VERIFIED`, `PENDING` cleared.

### 3.2 Gate 2: Delhi rules verified and published (OWNER / designated reviewer)
Why blocked: 0 of 38 unpublished rules pass the verification gate. The corpus records no section reference or excerpt for the Standing Order, whose PDF has never been readable from the build environment. A load date is not verification.

- [ ] (Owner) Obtain the instruments (L&O/48/2022 PDF at the corpus URL; the L&O/10/2022 document is not yet recovered, so its clause rules stay held).
- [ ] (Reviewer) For each rule, read the instrument and record **section reference + excerpt** on its PRIMARY source link (Admin → Rules → the rule → sources). If the instrument does not say it, the rule does not publish; correct or archive it.
- [ ] (Owner) `npm run delhi:verify-gate` (report) and review every HOLD reason.
- [ ] (Owner) `npm run delhi:verify-gate -- --publish` as the named admin (`ADMIN_EMAIL`). Publishes only rules that pass; the rest stay DRAFT.
- [ ] (Owner) **Decide the two already-active pointer rules** `DEL-LIVE-001` (check current Section 163 orders; cites the notifications page) and `DEL-TRAFFIC-001` (Traffic NOC; cites the Traffic Police page). They were activated earlier by the loader and fail the new gate because they have no section/excerpt. Either record the page section and excerpt (DEL-LIVE-001's evidence is only meaningful after Gate 1), or archive them. Engineering will not relax the gate to make them pass.
- [ ] (Owner) Decide separately whether to make New Delhi District selectable (`db:load-delhi -- --go-live`). This check never does it.
- Pass condition: every non-held launch rule ACTIVE; no ACTIVE rule failing the gate; no held-for-review rule ACTIVE.

### 3.3 Gate 3: email delivery (OWNER, then ENGINEERING on failure)
Why blocked: no provider is configured; confirmation links are written to `email_outbox` and not sent, so on a real deployment nobody can publish or have support counted.

- [ ] (Owner) Provider account and a verified sending domain (SPF/DKIM) for the `MAIL_FROM` address. The built-in adapter is Resend; another provider needs an engineering change, which is out of scope here.
- [ ] (Owner) Deployment settings: `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL` (https), `TRUSTED_PROXY_HOPS` (the real number of proxies in front of the app; wrong value lets clients dodge or share rate limits).
- [ ] (Owner) On the candidate deployment, sign up with a real mailbox, receive the email, follow the link, publish a draft page.
- [ ] (Engineering, only on failure) Diagnose from `email_outbox.error`; fix in the adapter.
- Pass condition: variables set, `APP_URL` https, at least one `EMAIL_VERIFICATION` row with status SENT, no FAILED rows in 7 days.

### 3.4 Gate 4: legal review (LEGAL COUNSEL, then ENGINEERING)
Why blocked: `/terms`, `/privacy`, `/platform-guidelines` are structure-and-positioning drafts, bannered "Legal review is required before public launch".

- [ ] (Owner) Brief counsel with: `docs/PRODUCT-PRINCIPLES.md`, the three pages, `docs/acceptance/PUBLIC-V1.md` and `PUBLIC-BETA-V1.0.1.md` (data collected, moderation model, what is never collected).
- [ ] (Counsel) Questions to answer, not assumed by us: the platform's status and duties as an intermediary hosting user content; notice-and-action and grievance contact requirements; personal-data consent, notice, retention and children's data; whether a reporter/organizer record may be kept and for how long (**no retention period is defined today**); terms for organizers (who is responsible for their page and for the permission status they report); terms for supporters; liability and disclaimer wording; content licence; governing law and forum; whether the "reported by organizer" labelling is sufficient; any restrictions on displaying police-order information.
- [ ] (Engineering) Replace the draft text with counsel's final text verbatim; remove `LegalDraft` banner use only for pages counsel has approved; update the cookie/consent surface if counsel requires.
- [ ] (Owner) File the counsel sign-off reference (name, firm, date, document versions) in the sign-off table.
- Pass condition: no page renders the draft banner and a sign-off reference is filed.

## 4. Release-candidate script

`npm run rc:check` (read-only; `-- --with-tests` also runs the test suite). Point `DATABASE_URL` and the mail/proxy variables at the **candidate** environment, not the dev database. It prints the commit, flags a dirty tree, then one line per gate: `PASS`, `BLOCKED (owner)`, `BLOCKED (counsel)` or `FAIL (engineering)`, with the exact reasons. Exit 0 = all four pass; 2 = blocked by someone else; 1 = engineering failure.

Sequence for the release candidate:
1. [ ] Freeze: clean tree on the candidate branch; note the SHA from `rc:check`.
2. [ ] Gates 1–4 closed by their owners (any order; 3.1 before 3.2's DEL-LIVE-001 decision).
3. [ ] `npm run db:migrate` on the candidate database (migrations `010`, `011` are additive; rollback notes are in the acceptance docs).
4. [ ] `npm run rc:check -- --with-tests` → exit 0.
5. [ ] Re-run the browser acceptance against the candidate: `scripts/e2e-public.mjs` (A–H) and `scripts/a11y-public.mjs`, plus the regression scripts; all must pass on this SHA.
6. [ ] Update the verdict in a new acceptance note with the SHA and the sign-off table below; the only permitted verdicts are READY FOR PUBLIC BETA or NOT READY FOR PUBLIC BETA.
7. [ ] Human go/no-go and tag. No deployment is performed by this script or by the assistant.

## 5. Sign-off table (to be completed by the named people; blank means not done)

| Gate | Evidence | Done by | Date | Reference |
|------|----------|---------|------|-----------|
| 1 Feed probe | fixture committed; flag recorded; what was checked | | | |
| 2 Delhi rules | `delhi:verify-gate` output; pointer-rule decision; go-live decision | | | |
| 3 Email | provider, domain, first delivered message id | | | |
| 4 Legal | counsel, firm, document versions | | | |
| Release | candidate SHA; rc:check exit 0; e2e/a11y results | | | |

## 6. Not in scope here
New features, relaxing any gate, changing jurisdictions, enabling Delhi without the owner's explicit step, payments, and any deploy.
