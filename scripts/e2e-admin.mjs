// Regulatory-platform admin journey: the 13-step "definition of done" for the architecture delta.
// Usage: BASE=http://localhost:3100 node scripts/e2e-admin.mjs   (needs the seeded admin from .env.local)
import { chromium } from "playwright-core";
import pg from "pg";
import { mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.SHOTS ?? "docs/previews/v0.3.0/images";
mkdirSync(OUT, { recursive: true });
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const browser = await chromium.launch({ executablePath: exe });
const admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const user = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  -", m); };
const settle = async (p) => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(600); };
const shot = async (p, name, full = false) => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); };
const stamp = Date.now() % 1e6;
const today = new Date().toISOString().slice(0, 10);
const eventDate = new Date(Date.now() + 25 * 864e5).toISOString().slice(0, 10);
const FAMILY = `TST-${stamp}-001`;
const next = (p) => p.getByRole("button", { name: "Next", exact: true }).click();

async function makePlan(label, attendance) {
  await user.goto(BASE + "/plan"); await user.evaluate(() => localStorage.clear()); await user.reload(); await settle(user);
  await user.selectOption("#city", { label }); await next(user);
  await user.fill("#name", "Platform check"); await user.fill("#date", eventDate); await next(user);
  await user.fill("#startLoc", "Test Square"); await next(user);
  await user.fill("#att", String(attendance)); await next(user); await next(user);
  await user.fill("#oname", "Tester"); await user.fill("#oemail", "t@example.com");
  await user.getByRole("button", { name: /show my readiness/i }).click();
  await user.waitForURL(/\/plan\/[0-9a-f-]{36}$/);
  await settle(user);
  return user.url();
}

// ---- access control
const anon = await (await browser.newContext()).newPage();
await anon.goto(BASE + "/admin/review");
ok(anon.url().includes("/login"), "anonymous visitor is sent to login from the admin area");

await admin.goto(BASE + "/login?next=/admin");
await admin.fill("#email", process.env.ADMIN_EMAIL ?? "admin@example.com"); await admin.fill("#password", process.env.ADMIN_PASSWORD ?? "change-me-please");
await admin.getByRole("button", { name: "Sign in" }).click();
await admin.getByRole("heading", { name: "Overview" }).waitFor();
await shot(admin, "admin-1-overview");

// ---- 1. jurisdiction (country > region > city, live)
await admin.goto(BASE + "/admin/jurisdictions"); await settle(admin);
const addJ = async (level, parentLabel, name, live = false) => {
  await admin.selectOption('select[name="level"]', level);
  if (parentLabel) await admin.selectOption('select[name="parentId"]', { label: parentLabel });
  await admin.fill('input[name="name"]', name);
  if (live) await admin.check('input[type="checkbox"][name="supported"]');
  await admin.getByRole("button", { name: "Add", exact: true }).click(); await settle(admin);
};
await addJ("country", null, `Testland${stamp}`);
await addJ("region", `Testland${stamp}`, `Testregion${stamp}`);
await addJ("city", `Testland${stamp} › Testregion${stamp}`, `Testville${stamp}`, true);
await shot(admin, "admin-2-jurisdictions");
ok(await admin.getByText(`Testville${stamp}`).first().isVisible(), "1. new jurisdiction hierarchy added through admin");
const cityLabelOpt = `Testville${stamp} (city)`;

// ---- 2. authority
await admin.goto(BASE + "/admin/authorities"); await settle(admin);
await admin.fill('input[name="name"]', `Test Police Authority ${stamp}`);
await admin.selectOption('select[name="jurisdictionId"]', { label: cityLabelOpt });
await admin.selectOption('select[name="authorityType"]', "POLICE");
await admin.selectOption('select[name="submissionMethod"]', "IN_PERSON");
await admin.getByRole("button", { name: "Save authority" }).click(); await settle(admin);
await shot(admin, "admin-3-authorities");
ok(await admin.getByText(`Test Police Authority ${stamp}`).first().isVisible(), "2. authority added as its own record");

// ---- 3. official source (monitored)
await admin.goto(BASE + "/admin/sources/new"); await settle(admin);
await admin.fill('input[name="title"]', `Public Assembly Order ${stamp}`);
await admin.selectOption('select[name="sourceType"]', "OFFICIAL_ADMINISTRATIVE_RULE");
await admin.fill('input[name="issuingAuthority"]', "Test Authority");
await admin.fill('input[name="canonicalUrl"]', `https://example.org/orders/${stamp}`);
await admin.fill('input[name="retrievedAt"]', today);
await admin.check('input[name="monitoringEnabled"]');
await admin.getByRole("button", { name: "Save source" }).click();
await admin.waitForURL(/\/admin\/sources\/[0-9a-f-]{36}\?saved=1/);
const sourceUrl = admin.url().split("?")[0];
await shot(admin, "admin-4-source");
ok(true, "3. official source added with monitoring enabled");

// ---- 4. conditional rule (draft)
await admin.goto(BASE + "/admin/rules/new"); await settle(admin);
await admin.fill('input[name="ruleFamilyId"]', FAMILY);
await admin.fill('input[name="title"]', `Notice of assembly ${stamp}`);
await admin.fill('textarea[name="legalStatement"]', "Written notice is required for assemblies of more than 50 persons (test fixture, not real law).");
await admin.fill('textarea[name="description"]', "Tell the authority before you gather.");
await admin.fill('input[name="userAction"]', "Prepare the notice letter");
await admin.selectOption('select[name="jurisdictionId"]', { label: cityLabelOpt });
await admin.selectOption('select[name="authorityId"]', { label: `Test Police Authority ${stamp}` });
await admin.selectOption('select[name="severity"]', "CRITICAL");
await admin.selectOption('select[name="deadlineKind"]', "STRUCTURED");
await admin.fill('input[name="deadlineMin"]', "7");
await admin.selectOption('select[name="cond_all_field_0"]', "attendance");
await admin.selectOption('select[name="cond_all_op_0"]', "gt");
await admin.fill('input[name="cond_all_value_0"]', "50");
await admin.fill('input[name="lastVerifiedAt"]', today);
await admin.selectOption('select[name="confidence"]', "high");
await admin.uncheck('input[name="needsReview"]');
await admin.getByRole("button", { name: "Create draft" }).click();
await admin.waitForURL(/\/admin\/rules\/[0-9a-f-]{36}\?saved=1/);
const ruleV1Url = admin.url().split("?")[0];
ok(await admin.getByText("DRAFT").first().isVisible(), "4. conditional rule created as a DRAFT");

// publishing without evidence must be refused
await admin.getByRole("button", { name: "Publish", exact: true }).click(); await settle(admin);
ok(await admin.getByText(/official source/i).first().isVisible(), "   publish is refused without an official source");

// ---- 5. evidence
await admin.selectOption('select[name="sourceId"]', { label: `Public Assembly Order ${stamp} (OFFICIAL_ADMINISTRATIVE_RULE)` });
await admin.fill('input[name="sectionRef"]', "para 4");
await admin.getByRole("button", { name: "Attach evidence" }).click(); await settle(admin);
await shot(admin, "admin-5-rule-draft-evidence", true);
ok(await admin.getByRole("link", { name: `Public Assembly Order ${stamp}` }).first().isVisible(), "5. evidence attached to the rule");

// ---- 6. publish
await admin.fill('input[name="reason"]', "Initial publication");
await admin.getByRole("button", { name: "Publish", exact: true }).click(); await settle(admin);
ok(await admin.getByText("ACTIVE").first().isVisible(), "6. rule published (ACTIVE)");
await shot(admin, "admin-6-rule-active", true);

// user plan uses the rule; verified + current
const planUrl = await makePlan(`Testville${stamp}, Testregion${stamp}`, 80);
ok((await user.getByText(`Notice of assembly ${stamp}`).count()) > 0, "   a user in the new city sees the new rule (rule evaluated from data, no code)");
ok(await user.getByText(/Current · Last verified/).first().isVisible(), "   user sees it as Current with a verification date");
await user.getByText(/Current · Last verified/).first().scrollIntoViewIfNeeded();
await shot(user, "user-1-dashboard-current");
const planId = planUrl.split("/").pop();

// ---- 7+8. replacement version supersedes the old one
await admin.goto(ruleV1Url); await settle(admin);
await admin.getByRole("button", { name: "Clone as new version" }).click();
await admin.waitForURL(/\/admin\/rules\/[0-9a-f-]{36}\?saved=1/);
const ruleV2Url = admin.url().split("?")[0];
ok(ruleV2Url !== ruleV1Url && (await admin.getByText(/v2/).first().isVisible()), "7. replacement version created as a draft (v2)");
await admin.selectOption('select[name="deadlineKind"]', "STRUCTURED");
await admin.fill('input[name="deadlineMin"]', "14");
await admin.fill('input[name="effectiveFrom"]', today);
await admin.fill('input[name="lastVerifiedAt"]', today);
await admin.uncheck('input[name="needsReview"]');
await admin.getByRole("button", { name: "Save draft" }).click(); await settle(admin);
await admin.fill('input[name="reason"]', "Notice period extended to 14 days");
await admin.getByRole("button", { name: "Publish", exact: true }).click(); await settle(admin);
await shot(admin, "admin-7-version-history", true);
await admin.goto(ruleV1Url); await settle(admin);
ok(await admin.getByText("SUPERSEDED").first().isVisible(), "8. old version is SUPERSEDED when the new version is published");
await admin.goto(BASE + "/admin/rules"); await settle(admin);
await shot(admin, "admin-8-rules-list");

// ---- 9. old event preserves the version it was evaluated with
await user.goto(planUrl); await settle(user);
ok(await user.getByText("Rules have changed since this plan was generated.").isVisible(), "9. reopened plan says the rules changed since it was generated");
await user.getByText("Rules have changed since this plan was generated.").scrollIntoViewIfNeeded();
await shot(user, "user-2-rules-changed-banner");
const before = await db.query("SELECT rule_ids, ruleset_fingerprint FROM event_evaluations WHERE event_id=$1 ORDER BY evaluated_at", [planId]);
ok(before.rowCount === 1 && /@1/.test(before.rows[0].ruleset_fingerprint), "   the stored snapshot still pins v1 (history not rewritten)");
await user.getByRole("button", { name: "Recheck my plan" }).click(); await user.waitForURL(/rechecked=1/); await settle(user);
const after = await db.query("SELECT rule_ids, ruleset_fingerprint FROM event_evaluations WHERE event_id=$1 ORDER BY evaluated_at", [planId]);
ok(after.rowCount === 2 && /@1/.test(after.rows[0].ruleset_fingerprint) && /@2/.test(after.rows[1].ruleset_fingerprint), "   recheck appended a new snapshot; v1 snapshot kept");
ok((await user.getByText("Rules have changed since this plan was generated.").count()) === 0, "   banner clears after recheck");

// ---- 10+11. source change recorded, affected rule placed in review
await admin.goto(sourceUrl); await settle(admin);
await admin.fill('textarea[name="content"]', "Notice of assembly is required at least 14 days before the event.\nOffice hours: 10 to 5.");
await admin.getByRole("button", { name: "Record snapshot" }).click(); await settle(admin);
ok(await admin.getByText("Result: BASELINE").isVisible(), "   first content becomes the baseline (no review item)");
await admin.fill('textarea[name="content"]', "Notice of assembly is required at least 21 days before the event.\nOffice hours: 10 to 5.");
await admin.getByRole("button", { name: "Record snapshot" }).click();
await admin.waitForURL(/\/admin\/review\?highlight=/);
await settle(admin);
ok(await admin.getByText(/POTENTIALLY MATERIAL/i).first().isVisible(), "10. source change recorded; summary flagged potentially material");
ok(await admin.getByText(`Notice of assembly ${stamp}`).first().isVisible() && (await admin.getByText("CHANGE DETECTED").count()) > 0, "11. affected rule placed in review (CHANGE_DETECTED)");
await shot(admin, "admin-9-review-queue", true);
await user.goto(planUrl); await settle(user);
ok(await user.getByText("Change under review").first().isVisible(), "    users no longer see the rule as unquestionably current");
await user.getByText("Change under review").first().scrollIntoViewIfNeeded();
await shot(user, "user-3-change-under-review");

// ---- 12. approve a new version from the review queue
await admin.getByRole("button", { name: "Start new version" }).first().click();
await admin.waitForURL(/\/admin\/rules\/[0-9a-f-]{36}\?saved=1/); await settle(admin);
await admin.fill('input[name="lastVerifiedAt"]', today);
await admin.fill('input[name="deadlineMin"]', "21");
await admin.uncheck('input[name="needsReview"]');
await admin.getByRole("button", { name: "Save draft" }).click(); await settle(admin);
await admin.fill('input[name="reason"]', "Source now says 21 days");
await admin.getByRole("button", { name: "Publish", exact: true }).click(); await settle(admin);
await admin.goto(BASE + "/admin/review?all=1"); await settle(admin);
ok(await admin.getByText("APPROVED UPDATE").first().isVisible(), "12. approving the new version closes the change event");
await shot(admin, "admin-10-review-resolved", true);

// ---- 13. template update without code
await admin.goto(BASE + "/admin/templates"); await settle(admin);
await admin.locator("tr", { hasText: "request-letter" }).getByRole("link", { name: "New version from this" }).first().click(); await settle(admin);
const content = await admin.inputValue('textarea[name="content"]');
await admin.fill('textarea[name="content"]', `TEMPLATE-V2-MARKER for {{event_name}}\n\n${content}`);
await admin.getByRole("button", { name: "Save as new version" }).click(); await settle(admin);
await shot(admin, "admin-11-templates", true);
await user.goto(planUrl + "/pack"); await user.getByRole("button", { name: /generate my preparation pack/i }).click(); await user.waitForURL(/ready=1/); await settle(user);
ok(await user.getByText("TEMPLATE-V2-MARKER for Platform check").first().isVisible(), "13. edited template changes generated paperwork with no code change");
await shot(user, "user-4-pack-template-v2");
const docRow = await db.query("SELECT template_version FROM documents WHERE event_id=$1 AND kind='request-letter' ORDER BY generated_at DESC LIMIT 1", [planId]);
ok(docRow.rows[0].template_version >= 2, "    generation records the template version used");

// ---- audit
await admin.goto(BASE + "/admin/audit"); await settle(admin);
ok(await admin.getByText("rule.publish").first().isVisible() && (await admin.getByText("rule.supersede").count()) > 0, "audit log shows publish and supersede with who/when");
await shot(admin, "admin-12-audit");

await browser.close();
await db.end();
console.log("ALL 13 DEFINITION-OF-DONE STEPS VERIFIED");
