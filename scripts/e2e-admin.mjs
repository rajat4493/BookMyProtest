// Admin journey. Needs the seeded admin from .env.local. Usage: BASE=... node scripts/e2e-admin.mjs
import { chromium } from "playwright-core";
import { readdirSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3000";
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  -", m); };
const next = (n) => page.getByRole("button", { name: n, exact: true });

// non-admin cannot see admin
const anon = await (await browser.newContext()).newPage();
await anon.goto(BASE + "/admin");
ok(anon.url().includes("/login"), "anonymous visitor redirected to login from /admin");

await page.goto(BASE + "/login?next=/admin");
await page.fill("#email", "admin@example.com"); await page.fill("#password", "change-me-please");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/admin");
await page.getByRole("heading", { name: "Overview" }).waitFor(); ok(true, "admin signs in");

// add a new city + a rule, no code
await page.goto(BASE + "/admin/jurisdictions");
const stamp = Date.now();
await page.selectOption('select[name="level"]', "country");
await page.fill('input[name="name"]', `Testland${stamp}`);
await page.getByRole("button", { name: "Add" }).click();
await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
await page.selectOption('select[name="level"]', "state");
await page.selectOption('select[name="parentId"]', { label: `Testland${stamp}` });
await page.fill('input[name="name"]', "Teststate");
await page.getByRole("button", { name: "Add" }).click();
await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
await page.selectOption('select[name="level"]', "city");
await page.selectOption('select[name="parentId"]', { label: `Testland${stamp} › Teststate` });
await page.fill('input[name="name"]', `Testville${stamp}`);
await page.check('input[type="checkbox"][name="supported"]');
await page.getByRole("button", { name: "Add" }).click();
await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
ok(await page.getByText(`Testville${stamp}`).first().isVisible(), "new city added via admin");

await page.goto(BASE + "/admin/rules/new");
await page.fill('input[name="title"]', `Megaphone notice ${stamp}`);
await page.selectOption('select[name="jurisdictionId"]', { label: "Teststate (state)" }).catch(() => {});
const opts = await page.locator('select[name="jurisdictionId"] option').allInnerTexts();
await page.selectOption('select[name="jurisdictionId"]', { label: opts.find((o) => o.startsWith(`Testville${stamp}`)) });
await page.selectOption('select[name="severity"]', "CRITICAL");
await page.selectOption('select[name="cond_all_field_0"]', "attendance");
await page.selectOption('select[name="cond_all_op_0"]', "gt");
await page.fill('input[name="cond_all_value_0"]', "50");
await page.getByRole("button", { name: "Save rule" }).click();
await page.waitForURL(/saved=1/);
ok(true, "rule with conditional logic saved");

// the new city appears in the planner with only its rule, unverified
const user = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await user.goto(BASE + "/plan");
const labels = await user.locator("#city option").allInnerTexts();
ok(labels.some((l) => l.startsWith(`Testville${stamp}`)), "new city appears in planner without code change");
await user.selectOption("#city", { label: labels.find((l) => l.startsWith(`Testville${stamp}`)) });
await user.getByRole("button", { name: "Next", exact: true }).click();
await user.fill("#name", "Rule check");
await user.fill("#date", new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10));
await user.getByRole("button", { name: "Next", exact: true }).click();
await user.fill("#startLoc", "Square");
await user.getByRole("button", { name: "Next", exact: true }).click();
await user.fill("#att", "10");
await user.getByRole("button", { name: "Next", exact: true }).click();
await user.getByRole("button", { name: "Next", exact: true }).click();
await user.fill("#oname", "Tester"); await user.fill("#oemail", "t@example.com");
await user.getByRole("button", { name: /show my readiness/i }).click();
await user.waitForURL(/\/plan\/[0-9a-f-]{36}$/);
ok((await user.getByText(`Megaphone notice ${stamp}`).count()) === 0, "rule with attendance > 50 does not fire at 10 people");
const planUrl = user.url();
// bump attendance via DB-free route: new plan with 80
await user.goto(BASE + "/plan"); await user.evaluate(() => localStorage.clear()); await user.reload(); await user.waitForLoadState("networkidle");
await user.selectOption("#city", { label: labels.find((l) => l.startsWith(`Testville${stamp}`)) });
await user.getByRole("button", { name: "Next", exact: true }).click();
await user.fill("#name", "Rule check 2");
await user.fill("#date", new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10));
await user.getByRole("button", { name: "Next", exact: true }).click();
await user.fill("#startLoc", "Square");
await user.getByRole("button", { name: "Next", exact: true }).click();
await user.fill("#att", "80");
await user.getByRole("button", { name: "Next", exact: true }).click();
await user.getByRole("button", { name: "Next", exact: true }).click();
await user.fill("#oname", "Tester"); await user.fill("#oemail", "t@example.com");
await user.getByRole("button", { name: /show my readiness/i }).click();
await user.waitForURL(/\/plan\/[0-9a-f-]{36}$/);
ok((await user.getByText(`Megaphone notice ${stamp}`).count()) > 0, "rule fires at 80 people");
ok((await user.getByText("Needs verification").count()) > 0, "new rule without source shows Needs verification");
const plan2 = user.url();

// verify the rule with a source -> label flips
await page.goto(BASE + "/admin/rules");
await page.getByRole("row", { name: new RegExp(`Megaphone notice ${stamp}`) }).getByRole("link", { name: "Edit" }).click();
await page.fill('input[name="lastVerifiedAt"]', "2026-10-01");
await page.selectOption('select[name="confidence"]', "high");
await page.uncheck('input[name="needsReview"]');
await page.fill('input[name="src_url_0"]', "https://example.org/rules");
await page.fill('input[name="src_title_0"]', "Example rules page");
await page.getByRole("button", { name: "Save rule" }).click();
await page.waitForURL(/saved=1/);
await user.goto(plan2);
ok(await user.getByText("Last verified: 1 October 2026").isVisible(), "verified rule shows 'Last verified: DATE'");

// archive hides rule
await page.getByRole("button", { name: "Archive rule" }).click();
await page.waitForURL("**/admin/rules");
await user.goto(plan2);
ok((await user.getByText(`Megaphone notice ${stamp}`).count()) === 0, "archived rule no longer shown to users");

// vendor request status
await page.goto(BASE + "/admin/vendor-requests");
const first = page.locator("li form").first();
if (await first.count()) {
  await first.locator('select[name="status"]').selectOption("matched");
  await first.getByRole("button", { name: "Save" }).click();
  await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
  await page.reload();
  ok((await page.locator("li form").first().locator('select[name="status"]').inputValue()) === "matched", "vendor request marked matched");
}
await page.goto(BASE + "/admin/events"); ok(await page.getByRole("heading", { name: "Events" }).isVisible(), "admin events view loads");
await browser.close();
