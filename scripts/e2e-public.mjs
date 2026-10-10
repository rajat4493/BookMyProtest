// v1.0 public-launch acceptance scenarios A–E through the real UI. Run against an app on the test DB with the Delhi corpus loaded (admin from .env.local):
//   BASE=http://localhost:3101 node scripts/e2e-public.mjs
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import pg from "pg";
import { recordPermission } from "./ui-helpers.mjs";
for (const f of [".env.local"]) if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test" });
await db.query("TRUNCATE rate_limits"); // counters are durable, so a rerun within the hour starts clean
const BASE = process.env.BASE ?? "http://localhost:3101";
const OUT = process.env.SHOTS ?? "docs/previews/v1.0.0/images";
mkdirSync(OUT, { recursive: true });
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  -", m); };
const settle = async (p) => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(700); };
const ctx = (w = 390, h = 844, mobile = true) => browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
const date = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
const stamp = Date.now() % 1e6;
const text = async (p) => p.locator("main").innerText();
const BAD = /\bapproved by bookmyprotest|verified by bookmyprotest|\bvenue (is )?available\b|\bcapacity remaining\b|bookmyprotest (approves|certifies|endorses)/i;

async function createPlan(p, name, att = 500) {
  const next = () => p.getByRole("button", { name: "Next", exact: true }).click();
  await p.goto(BASE + "/plan"); await settle(p);
  await p.selectOption("#city", { label: "New Delhi District, NCT Delhi" }); await p.locator("#venue").waitFor(); await p.selectOption("#venue", { label: "Jantar Mantar" }); await next();
  await p.fill("#name", name); await p.fill("#date", date); await p.fill("#start", "10:30"); await p.fill("#end", "15:30"); await next();
  await p.fill("#startLoc", "Jantar Mantar, New Delhi"); await p.fill("#desc", "A peaceful gathering about unsafe school buildings."); await next();
  await p.fill("#att", String(att)); await next();
  await p.locator("#vehicles").click(); await p.fill("#buses", "2"); await next();
  await p.fill("#oname", "Private Person"); await p.fill("#oemail", "private.person@example.org"); await p.fill("#ophone", "9810012345");
  await p.getByRole("button", { name: /show my checklist/i }).click(); await p.waitForURL(/\/plan\/[0-9a-f-]{36}$/); await settle(p);
  return p.url();
}
async function signup(p, email) {
  await p.fill("#email", email); await p.fill("#password", "correct-horse-battery");
  await p.getByRole("button", { name: /create account/i }).click(); await settle(p);
}
/** Opens the emailed confirmation link as a person would (the link is read from the outbox; the button press stops scanners using it up). */
async function confirmEmail(p, email) {
  const { rows } = await db.query("SELECT body FROM email_outbox WHERE to_email=$1 ORDER BY created_at DESC LIMIT 1", [email]);
  const link = rows[0]?.body.match(/https?:\/\/\S+\/verify-email\?token=[0-9a-f]{64}/)?.[0];
  if (!link) throw new Error("FAIL: no confirmation email in the outbox for " + email);
  await p.goto(BASE + new URL(link).pathname + new URL(link).search); await settle(p);
  await p.getByRole("button", { name: /confirm email/i }).click(); await settle(p);
  return p.getByTestId("verify-result").getAttribute("data-result");
}
const signedUp = new WeakMap();
async function publishPage(p, planUrl, { title, organizer, visibility = "PUBLIC", water = false, expectBlocked = false }) {
  await p.goto(planUrl + "/publish"); await settle(p);
  if (await p.getByRole("link", { name: /create an account/i }).count()) {
    await p.getByRole("link", { name: /create an account/i }).click(); await settle(p);
    const email = `org${stamp}${Math.random().toString(36).slice(2, 6)}@example.com`;
    await signup(p, email); signedUp.set(p, email);
    await p.goto(planUrl + "/publish"); await settle(p);
  }
  const fill = async () => { await fillAndSave(p, { title, organizer, visibility, water }); };
  await fill();
  if (await p.getByRole("alert").filter({ hasText: /Confirm your email/ }).count()) {
    if (expectBlocked) {
      ok(true, "A: an unconfirmed email cannot publish: " + (await p.getByRole("alert").first().innerText()).slice(0, 60));
      ok(await p.getByTestId("verify-needed").count() === 1, "A: the publish page explains why and offers a new link");
      ok(!(await db.query("SELECT 1 FROM public_protests WHERE visibility='PUBLIC' AND title=$1", [title])).rowCount, "A: nothing was published");
    }
    ok((await confirmEmail(p, signedUp.get(p))) === "VERIFIED", "the emailed link confirms the address");
    await p.goto(planUrl + "/publish"); await settle(p);
    await fill();
  } else if (expectBlocked) throw new Error("FAIL: publishing was not blocked for an unconfirmed email");
}
async function fillAndSave(p, { title, organizer, visibility, water }) {
  await p.fill("#title", title); await p.fill("#summary", "Parents asking for safer school buildings."); await p.fill("#organizerDisplayName", organizer);
  await p.selectOption("#category", "EDUCATION"); await p.selectOption("#visibility", visibility);
  if (water) { await p.check('input[name="opt_WATER_HELP"]'); await p.fill('input[name="note_WATER_HELP"]', "We need water for 500 people"); await p.check('input[name="opt_VOLUNTEER"]'); }
  await p.getByTestId("save-page").click(); await settle(p);
}

// ================= SCENARIO A: organizer =================
const org = await (await ctx()).newPage();
const planUrl = await createPlan(org, `Parents for Safe Schools ${stamp}`);
ok(await org.getByTestId("publish-strip").count() === 1, "A: the plan dashboard offers the Prepare → Publish transition");
await recordPermission(org, "SUBMITTED", { method: "IN_PERSON", reference: "DIARY/001" });
ok((await org.getByTestId("permission-panel").getAttribute("data-status")) === "SUBMITTED", "A: permission status recorded as SUBMITTED (internal tracker)");
const readinessText = await org.getByTestId("readiness-panel").innerText();
ok(/Action required/.test(readinessText) && !/\bReady\b/.test(readinessText), "A: preparation state reads 'Action required', never 'Ready'");
await publishPage(org, planUrl, { title: `Parents for Safe Schools ${stamp}`, organizer: "Parents for Safe Schools", water: true, expectBlocked: true });
await org.getByTestId("publish-permission").scrollIntoViewIfNeeded(); await org.screenshot({ path: `${OUT}/1-publish-editor.png`, fullPage: true });
const slugHref = await org.getByTestId("preview-link").getAttribute("href");
ok(/^\/protests\//.test(slugHref), "A: the page can be previewed after saving");
const slug = slugHref.split("/").pop();
const anon = await (await ctx()).newPage();
await anon.goto(BASE + slugHref); await settle(anon);
const A = await text(anon);
ok(/Submitted — reported by organizer/.test(A), "A: public page says 'Submitted — reported by organizer'");
ok((await anon.getByTestId("permission-status").getAttribute("data-status")) === "SUBMITTED", "A: status is SUBMITTED");
ok(!/\bapproved\b/i.test(A) && !BAD.test(A), "A: the public page never says approved, or verified/endorsed by BookMyProtest");
ok(await anon.getByTestId("official-info").count() === 1 && (await anon.getByTestId("official-info").locator("a").count()) >= 2, "A: official information links are present");
ok(/not authorization/i.test(await anon.getByTestId("official-info").innerText()), "A: official information is labelled information, not authorization");
ok(/Reported by organizer/.test(A) && /Provided by organizer/.test(A), "A: provenance labels distinguish organizer claims");
ok(/Official information checked on|Link to official source/.test(A), "A: official-source facts are labelled separately");
ok(/does not organize, authorize, endorse or guarantee this event/.test(A), "A: transparency footer present");
ok(!/private\.person@example\.org|9810012345|Private Person/.test(A + (await anon.content())), "A: no private organizer details in the public page or its HTML");
await anon.screenshot({ path: `${OUT}/2-public-page-mobile.png`, fullPage: true });

// ================= SCENARIO B: supporter =================
await anon.goto(BASE + "/protests"); await settle(anon);
await anon.selectOption('select[name="state"]', "NCT Delhi"); await anon.getByRole("button", { name: "Apply" }).click(); await settle(anon);
ok(await anon.getByTestId("protest-card").count() >= 1, "B: discovery works without login and the Delhi filter finds the protest");
const cardText = await anon.getByTestId("protest-card").first().innerText();
ok(/Submitted — reported by organizer/.test(cardText) && /Parents for Safe Schools/.test(cardText), "B: the card shows the organizer-reported status");
await anon.screenshot({ path: `${OUT}/3-discovery.png`, fullPage: true });
await anon.getByTestId("protest-card").first().click(); await settle(anon);
ok(/Why this protest/.test(await text(anon)), "B: the protest reads without logging in");
await anon.locator('button[data-kind="PLANNING_TO_ATTEND"]').click(); await anon.waitForURL(/\/login/); 
ok(/\/login\?next=%2Fprotests%2F/.test(anon.url()), "B: 'Planning to attend' asks anonymous visitors to sign in, then returns to the protest");
await anon.getByRole("link", { name: /create (an )?account|sign up|create one/i }).first().click().catch(() => {});
await settle(anon);
if (!/\/signup/.test(anon.url())) await anon.goto(BASE + `/signup?next=${encodeURIComponent("/protests/" + slug)}`);
const supporterEmail = `supporter${stamp}@example.com`;
await signup(anon, supporterEmail);
await anon.waitForURL(new RegExp(`/protests/${slug}`)); await settle(anon);
ok(await anon.getByTestId("verify-needed").count() === 1 && await anon.locator('button[data-kind="PLANNING_TO_ATTEND"]').count() === 0, "B: a signed-up but unconfirmed supporter is asked to confirm their email before acting");
ok((await confirmEmail(anon, supporterEmail)) === "VERIFIED", "B: the supporter confirms their email from the link");
await anon.goto(BASE + slugHref); await settle(anon);
ok(/0 planning to attend/.test(await anon.getByTestId("support-counts").innerText()), "B: counts start at zero");
await anon.locator('button[data-kind="PLANNING_TO_ATTEND"]').click(); await settle(anon);
ok(/1 planning to attend/.test(await anon.getByTestId("support-counts").innerText()), "B: planning to attend increments the aggregate");
ok((await anon.locator('button[data-kind="PLANNING_TO_ATTEND"]').getAttribute("aria-pressed")) === "true", "B: the supporter sees their own choice");
await anon.getByRole("button", { name: "I can help" }).first().click(); await settle(anon);
ok(/1 can help/.test(await text(anon)), "B: 'I can help' counts as an aggregate");
await anon.screenshot({ path: `${OUT}/4-supporter-counts.png`, fullPage: true });
await org.goto(planUrl + "/publish"); await settle(org);
const orgView = await org.locator("main").innerText();
ok(/1 planning to attend/.test(orgView) && !orgView.includes(supporterEmail), "B: the organizer sees the aggregate only, never who");
const fresh = await (await ctx()).newPage(); await fresh.goto(BASE + slugHref); await settle(fresh);
ok(!(await fresh.content()).includes(supporterEmail) && /1 planning to attend/.test(await fresh.getByTestId("support-counts").innerText()), "B: the public sees totals, not identities");
await anon.locator('button[data-kind="PLANNING_TO_ATTEND"]').click(); await settle(anon);
ok(/0 planning to attend/.test(await anon.getByTestId("support-counts").innerText()), "B: the action can be undone");
await anon.locator('button[data-kind="PLANNING_TO_ATTEND"]').click(); await settle(anon);

// ================= SCENARIO C: multiple protests =================
const org2 = await (await ctx()).newPage();
const plan2 = await createPlan(org2, `Residents for Safe Roads ${stamp}`, 300);
await publishPage(org2, plan2, { title: `Residents for Safe Roads ${stamp}`, organizer: "Residents for Safe Roads" });
await fresh.goto(BASE + slugHref); await settle(fresh);
const C = await fresh.getByTestId("other-protests").innerText();
ok(/Other public protests are listed for this date\./.test(C) && /Residents for Safe Roads/.test(C), "C: the page shows the other listed protest for the same date and venue");
ok(!/unavailable|not available|blocked|capacity remaining|remaining capacity|\d+ (spaces|places|slots) left/i.test(C), "C: it does not say the venue is unavailable or calculate remaining capacity");
ok(/not an approval/i.test(C), "C: it states that a listing is not an approval");
await fresh.getByTestId("other-protests").scrollIntoViewIfNeeded(); await fresh.screenshot({ path: `${OUT}/5-multiple-protests.png` });

// ================= SCENARIO D: toolkit =================
await org.goto(planUrl + "/publish"); await settle(org);
await org.getByTestId("gen-toolkit").click(); await org.waitForURL(/toolkit=1/); await settle(org);
const T = org.getByTestId("toolkit");
for (const k of ["instagram", "x_post", "whatsapp"]) {
  const t = await T.locator(`[data-toolkit="${k}"]`).innerText();
  ok(/Jantar Mantar/.test(t) && new RegExp(`Parents for Safe Schools ${stamp}`).test(t), `D: the ${k} draft uses the event's data`);
  ok(/Generated from organizer-provided event information and BookMyProtest-held event logistics\./.test(t), `D: the ${k} draft carries its provenance note`);
}
const toolkitAll = await T.innerText();
ok(/reported by the organizer/.test(toolkitAll) && !BAD.test(toolkitAll) && !/\bapproved\b/i.test(toolkitAll.replace(/does not[^.]*\./gi, "")), "D: no draft claims approval or BookMyProtest verification");
ok(/Review, copy or download|Nothing is posted for you/.test(await org.locator("#toolkit").innerText()), "D: nothing is auto-published; the organizer reviews and copies");
ok(!/private\.person@example\.org|9810012345/.test(toolkitAll), "D: no private details in drafts");
await org.locator("#toolkit").scrollIntoViewIfNeeded(); await org.screenshot({ path: `${OUT}/6-toolkit.png`, fullPage: true });

// ================= SCENARIO E: moderation =================
const adm = await (await ctx(1280, 900, false)).newPage();
await adm.goto(BASE + "/login"); await adm.fill('input[name="email"]', process.env.ADMIN_EMAIL); await adm.fill('input[name="password"]', process.env.ADMIN_PASSWORD);
await adm.getByRole("button", { name: /sign in|log in/i }).click(); await settle(adm);
await adm.goto(BASE + "/admin/protests"); await settle(adm);
const row = adm.locator(`tr[data-slug="${slug}"]`);
await row.locator('select[name="reason"]').first().selectOption("HARASSMENT");
await row.locator('input[name="note"]').first().fill("Description targets a named individual");
await row.getByRole("button", { name: "Hide" }).click(); await settle(adm);
ok(/HIDDEN/.test(await adm.locator(`tr[data-slug="${slug}"]`).innerText()), "E: admin hides the listing for a platform-policy reason");
await adm.screenshot({ path: `${OUT}/7-admin-moderation.png`, fullPage: true });
const r404 = await fresh.goto(BASE + slugHref); ok(r404.status() === 404, "E: the hidden listing disappears publicly (404)");
await fresh.goto(BASE + "/protests"); await settle(fresh);
const list = await text(fresh);
ok(!new RegExp(`Parents for Safe Schools ${stamp}`).test(list) && new RegExp(`Residents for Safe Roads ${stamp}`).test(list), "E: discovery no longer lists it, and the other protest is unaffected");
ok(/HIDE/.test(await adm.locator("main").innerText()) && /Harassment/.test(await adm.locator("main").innerText()), "E: the moderation log preserves the action and the reason");
await org.goto(BASE + slugHref); await settle(org);
ok(/hidden under the platform guidelines/.test(await org.getByTestId("owner-notice").innerText()), "E: the organizer is told the page is hidden under platform guidelines");


// ================= SCENARIO F: user reporting =================
const rep = await (await ctx()).newPage();
const slug2 = (await db.query("SELECT slug FROM public_protests WHERE title=$1", [`Residents for Safe Roads ${stamp}`])).rows[0].slug;
await rep.goto(BASE + `/protests/${slug2}`); await settle(rep);
await rep.getByTestId("report").locator("summary").click();
await rep.locator('select[name="reason"]').selectOption("SPAM");
await rep.locator('textarea[name="note"]').fill("Looks like a repeated post");
await rep.getByRole("button", { name: "Send report" }).click(); await settle(rep);
ok(/Reports do not hide a page automatically/.test(await rep.getByTestId("report-received").innerText()), "F: a visitor can report a page without an account, and is told nothing is hidden automatically");
ok((await fresh.goto(BASE + `/protests/${slug2}`)).status() === 200, "F: the reported page stays visible until a person decides");
await adm.goto(BASE + "/admin/protests"); await settle(adm);
const rrow = adm.locator(`tr[data-report]`).filter({ hasText: `Residents for Safe Roads ${stamp}` }).first();
ok(/Spam/.test(await rrow.innerText()) && /anonymous/.test(await rrow.innerText()), "F: the admin sees the report with its reason, and the reporter as anonymous");
await rrow.locator('input[name="note"]').fill("Not a platform-rule issue");
await rrow.getByRole("button", { name: "Dismiss" }).click(); await settle(adm);
ok((await fresh.goto(BASE + `/protests/${slug2}`)).status() === 200, "F: a dismissed report leaves the page untouched");
await rep.goto(BASE + `/protests/${slug2}`); await settle(rep);
await rep.getByTestId("report").locator("summary").click();
await rep.locator('select[name="reason"]').selectOption("DOXXING");
await rep.getByRole("button", { name: "Send report" }).click(); await settle(rep);
await adm.goto(BASE + "/admin/protests"); await settle(adm);
const rrow2 = adm.locator(`tr[data-report][data-status="OPEN"]`).filter({ hasText: `Residents for Safe Roads ${stamp}` }).first();
await rrow2.locator('input[name="note"]').fill("Shows a private address");
await rrow2.getByRole("button", { name: "Hide page" }).click(); await settle(adm);
ok((await fresh.goto(BASE + `/protests/${slug2}`)).status() === 404, "F: acting on a report hides the page");
ok(/Doxxing/.test(await adm.locator("main").innerText()), "F: the action is logged with the report's reason");
await adm.screenshot({ path: `${OUT}/8-admin-reports.png`, fullPage: true });

// ================= SCENARIO G: organizer identity =================
const org3 = await (await ctx()).newPage();
const plan3 = await createPlan(org3, `Citizens clean air ${stamp}`, 200);
await publishPage(org3, plan3, { title: `Clean air walk ${stamp}`, organizer: "BookMyProtest Team" });
ok(/cannot present the page as BookMyProtest/.test(await org3.getByRole("alert").first().innerText()), "G: a name that presents the page as BookMyProtest is refused");
await publishPage(org3, plan3, { title: `Clean air walk ${stamp}`, organizer: "Parents for Safe Schools" });
ok(await org3.getByTestId("identity-note").count() === 1, "G: a name matching another organizer is accepted but the organizer is told it will be reviewed");
const org3slug = (await db.query("SELECT slug FROM public_protests WHERE title=$1", [`Clean air walk ${stamp}`])).rows[0].slug;
await fresh.goto(BASE + `/protests/${org3slug}`); await settle(fresh);
const G = await fresh.getByTestId("organizer-signals").innerText();
ok(/self-declared/.test(G) && /Contact email confirmed/.test(G) && /On BookMyProtest since/.test(G), "G: the public page says the name is self-declared, the email is confirmed, and since when");
ok(!/verified organizer|trusted/i.test(G) && !/LOOKALIKE|AUTHORITY_LIKE|identity_flags/.test(await fresh.content()), "G: no 'verified organizer' claim and no public accusation");
await adm.goto(BASE + "/admin/protests"); await settle(adm);
ok(await adm.locator(`tr[data-identity="${org3slug}"]`).count() === 1, "G: the page is in the admin organizer-name review queue");
await adm.locator(`tr[data-identity="${org3slug}"]`).locator('input[name="note"]').fill("Different group, same area");
await adm.locator(`tr[data-identity="${org3slug}"]`).getByRole("button", { name: "Mark reviewed" }).click(); await settle(adm);
ok(await adm.locator(`tr[data-identity="${org3slug}"]`).count() === 0, "G: marking it reviewed is a human decision that clears the queue");

// ================= SCENARIO H: durable rate limit =================
const lim = await (await ctx()).newPage();
let blocked = false;
for (let i = 0; i < 10 && !blocked; i++) {
  await lim.goto(BASE + "/login"); await lim.fill('input[name="email"]', `nobody${stamp}@example.com`); await lim.fill('input[name="password"]', "wrong-password-" + i);
  await lim.getByRole("button", { name: /sign in|log in/i }).click(); await settle(lim);
  blocked = /Too many attempts/.test(await lim.locator("main").innerText());
}
ok(blocked, "H: repeated failed sign-ins are slowed down");
ok((await db.query("SELECT hits FROM rate_limits WHERE key=$1", [`login:nobody${stamp}@example.com`])).rows[0].hits >= 8, "H: the counter lives in the database, shared by every app instance");

// legal drafts + positioning
for (const path of ["/terms", "/privacy", "/platform-guidelines"]) { await fresh.goto(BASE + path); ok(/Legal review is required before public launch/.test(await fresh.getByTestId("legal-draft-banner").innerText()), `${path} is marked as a draft needing legal review`); }
await db.end();
await browser.close();
console.log("V1.0.1 PUBLIC-BETA SCENARIOS A–H VERIFIED IN THE UI");
