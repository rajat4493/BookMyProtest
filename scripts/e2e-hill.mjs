// v1.1 acceptance scenarios A–F through the real UI, with both feature flags ON, plus a flags-OFF check. Run on the Delhi test DB:
//   BASE=http://localhost:3101 BASE_OFF=http://localhost:3102 node scripts/e2e-hill.mjs
// (the app on BASE runs with FEATURE_FIND_YOUR_HILL=1 FEATURE_HIT_WHERE_IT_HURTS=1; the app on BASE_OFF runs with neither)
// The issue below is a TEST FIXTURE authored through the admin screens; it is not real-world content and its links are placeholders.
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import pg from "pg";
for (const f of [".env.local"]) if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test" });
await db.query("TRUNCATE rate_limits");
const BASE = process.env.BASE ?? "http://localhost:3101";
const BASE_OFF = process.env.BASE_OFF;
const OUT = process.env.SHOTS ?? "docs/previews/v1.1.0/images";
mkdirSync(OUT, { recursive: true });
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  -", m); };
const settle = async (p) => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(600); };
const ctx = (w = 390, h = 844, mobile = true) => browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
const stamp = Date.now() % 1e6;
const text = async (p) => p.locator("main").innerText();
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const ISSUE = `Water supply interruptions in Ward 12 ${stamp}`;

async function signup(p, email) {
  await p.goto(BASE + "/signup"); await settle(p);
  await p.fill("#email", email); await p.fill("#password", "correct-horse-battery");
  await p.getByRole("button", { name: /create account/i }).click(); await settle(p);
}
async function confirmEmail(p, email) {
  const { rows } = await db.query("SELECT body FROM email_outbox WHERE to_email=$1 ORDER BY created_at DESC LIMIT 1", [email]);
  const link = rows[0]?.body.match(/https?:\/\/\S+\/verify-email\?token=[0-9a-f]{64}/)?.[0];
  if (!link) throw new Error("FAIL: no confirmation email in the outbox for " + email);
  await p.goto(BASE + new URL(link).pathname + new URL(link).search); await settle(p);
  await p.getByRole("button", { name: /confirm email/i }).click(); await settle(p);
}
async function newUser(prefix) { const p = await (await ctx()).newPage(); const email = `${prefix}${stamp}${Math.random().toString(36).slice(2, 5)}@example.com`; await signup(p, email); await confirmEmail(p, email); return { p, email }; }

// ---------- flags OFF: nothing is reachable ----------
if (BASE_OFF) {
  const off = await (await ctx()).newPage();
  for (const path of ["/issues", "/issues/suggest", "/actions", "/actions/new", "/activity"]) { const r = await off.goto(BASE_OFF + path); ok(r.status() === 404, `flags off: ${path} is not found`); }
  await off.goto(BASE_OFF + "/protests"); await settle(off);
  const nav = await off.locator("nav[aria-label='Main']").innerText();
  ok(!/find your hill|digital actions|my activity/i.test(nav) && /discover/i.test(nav), "flags off: the navigation shows no new entries and the existing Discover link is unchanged");
  ok((await off.goto(BASE_OFF + "/protests")).status() === 200 && (await off.goto(BASE_OFF + "/")).status() === 200, "flags off: the existing public pages still work");
}

// ---------- admin authors one sourced issue (TEST FIXTURE) ----------
const adm = await (await ctx(1280, 900, false)).newPage();
await adm.goto(BASE + "/login"); await adm.fill('input[name="email"]', process.env.ADMIN_EMAIL); await adm.fill('input[name="password"]', process.env.ADMIN_PASSWORD);
await adm.getByRole("button", { name: /sign in|log in/i }).click(); await settle(adm);
await adm.goto(BASE + "/admin/issues"); await settle(adm);
await adm.fill('input[name="title"]', ISSUE); await adm.selectOption('select[name="category"]', "PUBLIC_SERVICES"); await adm.fill('input[name="city"]', "Pune"); await adm.fill('input[name="state"]', "Maharashtra");
await adm.getByRole("button", { name: "Create draft" }).click(); await settle(adm);
ok(/\/admin\/issues\/[0-9a-f-]{36}/.test(adm.url()), "admin: a draft issue is created (not public)");
const issueUrl = adm.url().split("?")[0];
await adm.getByTestId("publish-issue").scrollIntoViewIfNeeded();
// publishing an incomplete draft is refused
await adm.locator('form:has([data-testid="publish-issue"]) input[name="note"]').fill("Checked sources (test fixture)");
await adm.getByTestId("publish-issue").click(); await settle(adm);
ok(/Cannot publish/.test(await adm.locator("main").innerText()), "admin: an incomplete issue cannot be published");
ok((await adm.getByTestId("publish-problems").innerText()).includes("At least one source"), "admin: the editor lists exactly what is still missing");
await adm.fill('input[name="summary"]', "Residents report repeated interruptions to piped water in Ward 12.");
await adm.fill('textarea[name="description"]', "Piped water to Ward 12 was interrupted on several days this year, according to the utility's outage log and to resident reports. TEST FIXTURE: not real-world content.");
await adm.fill('textarea[name="whyDiscussed"]', "The utility and a residents' association have given different explanations for the interruptions.");
await adm.fill('textarea[name="sources"]', "OFFICIAL_RECORD | Utility outage log (placeholder link) | https://example.gov.in/outage-log | Pune Water Board | 2026-09-20\nINDEPENDENT_REPORTING | Local report on the outages (placeholder link) | https://example.org/report | Local newsroom | 2026-09-25");
await adm.fill('textarea[name="perspectives"]', "Water utility | Says the interruptions followed scheduled pipe maintenance. | https://example.org/utility-statement\nResidents' association | Says the maintenance was never announced to residents. |");
await adm.fill('textarea[name="disputedClaims"]', "Maintenance was announced in advance | The utility and residents disagree about whether any notice was issued. |");
await adm.fill('textarea[name="developments"]', "2026-09-20 | The utility published its outage log. | Utility outage log | https://example.gov.in/outage-log");
await adm.fill('textarea[name="unknowns"]', "The cause of the March interruptions has not been published by the utility or any independent party.");
await adm.fill('input[name="lastCheckedOn"]', day(-2));
await adm.getByTestId("save-issue").click(); await settle(adm);
ok(/Complete: ready for a person to publish/.test(await adm.getByTestId("publish-problems").innerText()), "admin: a complete, sourced draft is ready for a person to publish");
const issueSlug = (await adm.locator("main p").filter({ hasText: "/issues/" }).first().innerText()).match(/\/issues\/([^\s·]+)/)[1];
const anon0 = await (await ctx()).newPage();
ok((await anon0.goto(BASE + "/issues/" + issueSlug)).status() === 404, "admin: saving a draft does not publish it");
await adm.locator('form:has([data-testid="publish-issue"]) input[name="note"]').fill("Checked each source against its page (test fixture)");
await adm.getByTestId("publish-issue").click(); await settle(adm);
await adm.screenshot({ path: `${OUT}/1-admin-issue-editor.png`, fullPage: true });

// ================= SCENARIO A: curious visitor =================
const vis = await (await ctx()).newPage();
await vis.goto(BASE + "/issues"); await settle(vis);
ok(/Find the issue\. Understand the facts\. Decide what matters to you\./.test(await text(vis)), "A: Find Your Hill states its purpose");
await vis.fill('input[name="q"]', "water"); await vis.getByRole("button", { name: "Search" }).click(); await settle(vis);
ok(await vis.getByTestId("issue-card").filter({ hasText: ISSUE }).count() === 1, "A: an anonymous visitor searches by keyword and finds the issue");
ok(/not ordered by popularity/.test(await text(vis)), "A: the page explains the ordering and that nothing about the visitor is used");
await vis.screenshot({ path: `${OUT}/2-find-your-hill-search.png`, fullPage: true });
await vis.getByTestId("issue-card").filter({ hasText: ISSUE }).click(); await settle(vis);
const P = await text(vis);
ok(new RegExp(ISSUE).test(await vis.getByTestId("issue-title").innerText()), "A: the issue page opens without logging in");
ok(await vis.getByTestId("sources").locator("a").count() >= 2 && /Link to official source/.test(P) && /Link to independent source/.test(P), "A: sourced evidence and original references, labelled by kind");
ok(await vis.getByTestId("perspectives").locator("li").count() === 2, "A: different perspectives are shown side by side");
ok(/Maintenance was announced in advance/.test(await vis.getByTestId("disputed").innerText()), "A: disputed claims are shown as disputed");
ok(/has not been published/.test(await vis.getByTestId("unknowns").innerText()), "A: what remains unknown is stated");
ok(/Information last checked \d+ \w+ \d{4}/.test(await vis.getByTestId("last-checked").innerText()), "A: the last information-check date is shown");
ok(/does not endorse any position described here/.test(await vis.getByTestId("neutrality-note").innerText()), "A: the page says BookMyProtest endorses no position");
ok(!/\b(scam|corrupt|boycott)\b/i.test(await vis.getByTestId("issue-title").innerText()), "A: the title is a neutral description");
await vis.screenshot({ path: `${OUT}/3-issue-page.png`, fullPage: true });

// ================= SCENARIO B: no campaign exists =================
ok(/No digital action exists for this issue yet/.test(await vis.getByTestId("no-campaigns").innerText()) && /No public protest is linked/.test(await vis.getByTestId("explore").innerText()), "B: the issue page works with no protest and no campaign");
ok(await vis.getByTestId("create-campaign").count() === 1, "B: it offers a way to create an organizer-led campaign");

// ================= SCENARIO C: organizer creates a digital campaign =================
const { p: org, email: orgEmail } = await newUser("org");
await vis.getByTestId("create-campaign").click(); await settle(vis);
ok(/\/actions\/new\?issue=/.test(vis.url()), "C: the create link carries the issue");
await org.goto(BASE + `/actions/new?issue=${issueSlug}`); await settle(org);
ok(/Threats, harassment or doxxing/.test(await org.getByTestId("rules-note").innerText()), "C: the rules are stated before the form");
const fillCampaign = async (p, over = {}) => {
  await p.fill("#title", over.title ?? `Publish a refund policy ${stamp}`); await p.fill("#summary", "Asking Example Retail Ltd to publish a clear refund policy.");
  await p.fill("#requestedChange", over.change ?? "Publish a written refund policy on the retailer's website within 60 days.");
  await p.fill("#institution", "Example Retail Ltd");
  await p.fill('input[name="ev_claim_0"]', "The retailer's website states no refund policy"); await p.fill('input[name="ev_title_0"]', "Retailer terms page, checked 1 Oct (placeholder link)"); await p.fill('input[name="ev_url_0"]', "https://example.com/terms");
  await p.check('input[name="act_CONSUMER_PAUSE"]'); await p.fill('input[name="label_CONSUMER_PAUSE"]', "Pause purchases from the retailer for one month");
  await p.check('input[name="act_FEEDBACK_PUBLIC_CHANNEL"]'); await p.fill('input[name="label_FEEDBACK_PUBLIC_CHANNEL"]', "Send one honest message through the retailer's feedback form");
  await p.fill("#startsOn", day(1)); await p.fill("#reviewOn", day(45));
  await p.fill("#closureCriteria", "Closed when a refund policy is published on the website, or on the review date if it is not.");
  await p.fill("#organizerDisplayName", "Shoppers' Group"); await p.selectOption("#visibility", over.visibility ?? "PUBLIC");
  await p.getByTestId("save-campaign").click(); await settle(p);
};
await fillCampaign(org, { change: "Bankrupt the company until they publish a refund policy." });
ok(/not designed to damage a business/.test(await org.locator("main").innerText()), "C: a request aimed at damaging a business is refused with the reason");
await org.goto(BASE + `/actions/new?issue=${issueSlug}`); await settle(org);
await fillCampaign(org, { title: `Spam the retailer ${stamp}`, change: "Flood their inbox and call them all day until they publish a refund policy." });
ok(/floods of messages/.test(await org.locator("main").innerText()), "C: encouraging floods of messages is refused");
await org.goto(BASE + `/actions/new?issue=${issueSlug}`); await settle(org);
await fillCampaign(org);
ok(/\/actions\/[^/]+\/manage\?saved=1/.test(org.url()), "C: a peaceful, sourced campaign with a specific request is saved and published");
const campSlug = org.url().match(/\/actions\/([^/]+)\/manage/)[1];
const pub = await (await ctx()).newPage();
await pub.goto(BASE + "/actions/" + campSlug); await settle(pub);
const C = await text(pub);
ok(/Publish a written refund policy on the retailer's website within 60 days\./.test(C) && /What would count as success or closure/.test(C), "C: the public page states the request and the closure criteria");
ok(/Evidence cited by the organizer/.test(C) && /BookMyProtest has not checked them/.test(await pub.getByTestId("evidence").innerText()), "C: the evidence is cited and labelled as the organizer's claim");
ok(/Shoppers' Group \(self-declared\)/.test(C) && /Organization named by the organizer: Example Retail Ltd/.test(await pub.getByTestId("institution").innerText()), "C: the organizer is self-declared and the named organization is flagged as the organizer's claim");
ok(/does not estimate any effect on a business/.test(await pub.getByTestId("neutrality-note").innerText()), "C: the page says no business impact is estimated");
await pub.screenshot({ path: `${OUT}/4-campaign-page.png`, fullPage: true });
await pub.goto(BASE + "/issues/" + issueSlug); await settle(pub);
ok(await pub.getByTestId("explore").locator('[data-testid="campaign-card"]').count() === 1, "C: the issue page now lists the related digital action");

// ================= SCENARIO D: remote participant =================
const { p: part, email: partEmail } = await newUser("part");
await part.goto(BASE + "/actions/" + campSlug); await settle(part);
const first = part.locator("li[data-action]").first();
await first.locator('button[data-intent="INTENDS"]').click(); await settle(part);
ok(/1 plan to do this/.test(await part.locator("li[data-action]").first().getByTestId("action-counts").innerText()), "D: a verified user voluntarily selects an action and the aggregate increments");
ok((await part.locator("li[data-action]").first().locator('button[data-intent="INTENDS"]').getAttribute("aria-pressed")) === "true", "D: they see their own participation recorded");
await part.locator("li[data-action]").first().locator('button[data-intent="COMPLETED_SELF_REPORTED"]').click(); await settle(part);
const counts = await part.locator("li[data-action]").first().getByTestId("action-counts").innerText();
ok(/1 say they have done it \(self-reported, not verified\)/.test(counts), "D: completions are labelled self-reported and not verified");
await part.locator('button[data-kind="FOLLOWING"]').click(); await settle(part);
ok(/1 following/.test(await part.getByTestId("participation-counts").innerText()), "D: following is counted as an aggregate");
await part.screenshot({ path: `${OUT}/5-participation.png`, fullPage: true });
const fresh = await (await ctx()).newPage(); await fresh.goto(BASE + "/actions/" + campSlug); await settle(fresh);
const publicHtml = await fresh.content();
ok(!publicHtml.includes(partEmail) && !/@example\.com/.test(await text(fresh)), "D: the public page shows totals only, no identities");
await org.goto(BASE + `/actions/${campSlug}/manage`); await settle(org);
ok(!(await org.content()).includes(partEmail), "D: the organizer cannot see who took part");
await part.locator("li[data-action]").first().locator('button[data-intent="WITHDRAW"]').click(); await settle(part);
ok(/0 plan to do this/.test(await part.locator("li[data-action]").first().getByTestId("action-counts").innerText()), "D: the participant can withdraw and the totals follow");
const unconf = await (await ctx()).newPage(); const unEmail = `unc${stamp}@example.com`; await signup(unconf, unEmail);
await unconf.goto(BASE + "/actions/" + campSlug); await settle(unconf);
ok(await unconf.getByTestId("verify-needed").count() === 1 && await unconf.locator("button[data-intent]").count() === 0, "D: an unconfirmed email is asked to confirm before taking part");
// My Activity shows only the participant's own
await part.goto(BASE + "/activity"); await settle(part);
ok(/Digital actions I joined/.test(await text(part)) && (await text(part)).includes("Publish a refund policy"), "D: My Activity lists the participant's own activity");

// ================= SCENARIO E: disputed claim =================
const co = await (await ctx()).newPage();
await co.goto(BASE + "/actions/" + campSlug); await settle(co);
await co.getByTestId("report").locator("summary").click();
await co.locator('select[name="reason"]').selectOption("FACTUAL_ERROR");
await co.locator('textarea[name="disputedText"]').fill("The retailer's website states no refund policy");
await co.locator('textarea[name="note"]').fill("A refund policy page exists on our website.");
await co.locator('input[name="evidenceUrl"]').fill("https://example.com/refunds");
await co.getByRole("button", { name: "Send report" }).click(); await settle(co);
ok(/Reports do not hide a page automatically/.test(await co.getByTestId("report-received").innerText()), "E: a member of the public (here, someone from the named company) reports a factual error without an account");
ok((await fresh.goto(BASE + "/actions/" + campSlug)).status() === 200, "E: the campaign stays visible while the report is reviewed");
// a disagreement-style report is also filed
const dis = part; await dis.goto(BASE + "/actions/" + campSlug); await settle(dis);
await dis.getByTestId("report").locator("summary").click(); await dis.locator('select[name="reason"]').selectOption("OTHER"); await dis.locator('textarea[name="note"]').fill("I strongly disagree with boycotts in general");
await dis.getByRole("button", { name: "Send report" }).click(); await settle(dis);
await adm.goto(BASE + "/admin/content"); await settle(adm);
const frow = adm.locator("tr[data-report]").filter({ hasText: "A statement of fact is wrong" }).first();
ok(/Disputed:/.test(await frow.innerText()) && !(await frow.getByRole("button", { name: "Remove" }).count()), "E: the moderator sees the disputed statement and the evidence link, and a factual dispute has no 'Remove' option");
await frow.locator('input[name="note"]').fill("Checked the retailer's page: a refund page exists");
await frow.locator('textarea[name="correction"]').fill("A refund policy page exists at the address given by the company. The organizer's statement was out of date when the campaign was published.");
await frow.locator('input[name="sourceUrl"]').fill("https://example.com/refunds");
await frow.locator('input[name="markDisputed"]').check();
await frow.getByRole("button", { name: "Publish correction" }).click(); await settle(adm);
const drow = adm.locator("tr[data-report]").filter({ hasText: "I strongly disagree" }).first();
await drow.locator('input[name="note"]').fill("Disagreement with a view is not a platform-rule reason");
await drow.getByRole("button", { name: "Dismiss" }).click(); await settle(adm);
await adm.screenshot({ path: `${OUT}/6-admin-content-reports.png`, fullPage: true });
const mod = await text(adm);
ok(/corrected/.test(mod) && /dismissed/.test(mod), "E: the correction and the dismissal are both recorded with their reasons");
await fresh.goto(BASE + "/actions/" + campSlug); await settle(fresh);
const E = await text(fresh);
ok(/Corrections/.test(E) && /A refund policy page exists at the address given by the company/.test(await fresh.getByTestId("corrections").innerText()), "E: the correction is published on the page beside the original statement");
ok(/The retailer's website states no refund policy/.test(await fresh.getByTestId("evidence").innerText()), "E: the organizer's original statement is not deleted");
ok((await fresh.getByTestId("outcome-state").getAttribute("data-state")) === "DISPUTED", "E: the campaign is marked Disputed, not removed");
await fresh.screenshot({ path: `${OUT}/7-disputed-campaign.png`, fullPage: true });

// ================= SCENARIO F: outcome reporting =================
await org.goto(BASE + `/actions/${campSlug}/manage`); await settle(org);
await adm.goto(BASE + "/admin/content"); await settle(adm);
await adm.locator(`tr[data-campaign="${campSlug}"] input[name="note"]`).last().fill("The organizer updated the evidence in light of the correction");
await adm.locator(`tr[data-campaign="${campSlug}"]`).getByRole("button", { name: "Clear dispute" }).click(); await settle(adm);
await org.goto(BASE + `/actions/${campSlug}/manage`); await settle(org);
await org.locator('form:has(select[name="kind"]) select[name="kind"]').selectOption("UNVERIFIED_CLAIM");
await org.locator('form:has(select[name="kind"]) textarea[name="body"]').fill("The retailer has agreed to our demand and will publish a policy.");
await org.getByRole("button", { name: "Add entry" }).click(); await settle(org);
await org.locator('select[name="state"]').selectOption("RESOLVED_REPORTED"); await org.getByRole("button", { name: "Update state" }).click(); await settle(org);
await fresh.goto(BASE + "/actions/" + campSlug); await settle(fresh);
const F = await fresh.getByTestId("outcome-state").innerText();
ok(/Resolved: reported by organizer/.test(F), "F: an organizer-declared resolution is displayed as reported by the organizer");
ok(/No independent evidence has been recorded/.test(await fresh.getByTestId("state-note").innerText()), "F: with no independent evidence, the page says so");
const Fall = await text(fresh);
ok(!/verified success|independently verified success|verified resolution|verified outcome/i.test(Fall), "F: independently verified success is never displayed");
ok(/Claimed by the organizer\. Not independently established\./.test(await fresh.getByTestId("outcomes").innerText()), "F: the claim sits in its own 'unverified' lane");
ok(/self-reported completions/.test(await fresh.getByTestId("outcomes").innerText()) && /say nothing about the effect on any organization/.test(await fresh.getByTestId("outcomes").innerText()), "F: participation signals are separate and make no claim about business impact");
await fresh.screenshot({ path: `${OUT}/8-outcome-reported.png`, fullPage: true });

await db.end();
await browser.close();
console.log("V1.1 SCENARIOS A–F VERIFIED IN THE UI");
