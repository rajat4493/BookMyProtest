# Digital Actions v1 (working name HitWhereItHurts): acceptance

> BookMyProtest informs, connects and assists. It does not authorize, certify, represent, endorse or guarantee.

**Status: built and tested; NOT enabled.** Behind `FEATURE_HIT_WHERE_IT_HURTS` (default off, independent of Find Your Hill). Nothing deployed; launch gates untouched.

## The naming problem
"HitWhereItHurts" announces an intent to cause harm, which is the opposite of what this module is allowed to be. The interface uses **Digital Actions**; the working name appears only as a small kicker on the list page. Recommendation: rename before launch, and have counsel look at it either way.

## What it is
An organizer attaches a campaign to a **published issue**, states **one specific requested change**, cites **evidence** (each fact with a title and https link), offers **only** actions from a fixed list of seven lawful categories (voluntary purchasing pause; support an alternative; subscription or membership decision; one honest message through an official feedback channel; share the sourced information; follow developments; support a transparency request), and sets a **start date, review date and closure criteria**. The organizer name is shown as self-declared; look-alike and authority-like names are queued for human review (reusing the v1.0.1 identity signals).

## What it refuses
A text screen on every field refuses doxxing and private-detail hunting, fake or paid reviews, review-bombing, floods of messages or calls, automation, harassment and intimidation, obstructing a business or its staff, and **estimates of financial damage or loss** (and campaign aims such as bankrupting or destroying a business). The screen is a first line only: it is regex-based, can be evaded, and can false-positive; human moderation is the backstop. There is no field in the schema for revenue, loss, damage, market share or sales (a test reads the information schema), and nothing converts a participation count into an effect.

BookMyProtest never chooses, suggests or ranks targets: no donor, executive, worker or company is selected for anyone; the list is newest-first and not ranked by participation or by any effect.

## Participation (voluntary, undoable, aggregate-only)
Follow, interested, "I plan to do this", "I did this (self-reported)", withdraw, share. Requires a confirmed email (the v1.0.1 model); counts include only confirmed, non-suspended accounts; the public and the organizer see **totals only**; the participant sees only their own choices; no export, no list, no receipts or purchase evidence asked for or stored. "Completed" is always worded *self-reported, not verified*. A closed campaign takes no new participation but always lets people withdraw. A test proves no read path (public page, owner view, listings) contains any participant id or email, and a code scan proves only `digital-actions.ts` / `issues.ts` touch the participation tables and that identity is only ever filtered to the viewer.

## Outcomes: four things, never mixed
| Lane | What it is | Shown as |
|---|---|---|
| Participation signals | following, interested, self-reported completions | "self-reported and unverified; says nothing about the effect on any organization" |
| Documented responses | statements or correspondence from the organization (**source link required**) | "Source linked. BookMyProtest has not independently verified this." |
| Observed outcomes | documented changes (**source link required**) | same |
| Unverified claims | the organizer's own claims | "Claimed by the organizer. Not independently established." |

States: Active; Response recorded (needs a source-backed response; "a response is not a change"); Partially resolved / Resolved, **both worded "reported by organizer"**; Disputed (**set only by a moderator**; the organizer cannot change state until a moderator clears it); Closed without resolution; Archived. **No independent verification method exists, so "verified" never appears**: a resolution with no evidence reads "Reported by the organizer. No independent evidence has been recorded."; with a linked source it still reads "has not independently verified". Financial impact is not supported in v1; if it is ever added it must require reliable sourcing and separate correlation from causation.

## Disputes, corrections, reports
Anyone, including the named company, can report. A factual-error report quotes the statement and may link evidence. A moderator publishes a **correction beside the original (the original is not deleted)** and may mark the campaign Disputed, or dismisses with a reason; a factual dispute **cannot remove a page**. Conduct reports can hide/remove only for platform-rule reasons, with a note, logged and reversible. A disagreement ("I dislike boycotts") is dismissed on the record. A report never hides a page; urgent protective action is a moderator's decision under the same conduct reasons. One open report per reporter per page: anonymous reporters sharing a network address count as one reporter (a known simplification).

## Edits after people have joined
Changes to the request, the institution named, or the actions are disclosed on the public page as an update, not made silently.

## Tests
Pure (22), DB (32 in `hill-db.test.ts`), browser `scripts/e2e-hill.mjs`: **C** organizer creates a peaceful, sourced campaign (refused: a request to bankrupt a business; encouraging floods); **D** a confirmed user selects an action, sees it recorded, completions labelled self-reported, withdraws, public sees totals only, organizer cannot see who, unconfirmed email asked to confirm; **E** a member of the public reports a factual error, the campaign stays visible, the moderator publishes a correction and dismisses a disagreement, original not deleted, campaign Disputed; **F** an organizer-declared success with no evidence is shown as "Resolved: reported by organizer", "No independent evidence has been recorded", never verified. Accessibility 0 violations (22 screens). Screenshots `docs/previews/v1.1.0/images/4-8`.

## Limitations and deferred
- Legal exposure is not solved by software: a campaign naming a company makes factual claims about it. Counsel must review before launch (liability, notice-and-action obligations, whether "boycott" campaigns need extra care, the product name).
- Evidence is organizer-cited and not checked by BookMyProtest; moderators check only what is reported.
- The text screen is best-effort. No review of individual posts happens before publication.
- Confirmed accounts are not unique people; totals can still be inflated by many throwaway confirmed emails.
- No reminders, notifications or messaging; no analytics beyond place-free event counts.
- Deferred by design: payments, fundraising, financial-impact reporting, supporter exports, receipts, any automatic selection of targets.

## Rollback
Turn the flag off. Schema: drop the `digital_campaign*` tables and `content_*` tables from `012`; existing data unaffected.
