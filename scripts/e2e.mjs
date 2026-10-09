// End-to-end user journey on a mobile viewport. Usage: BASE=http://localhost:3000 node scripts/e2e.mjs
import { chromium } from "playwright-core";
import { readdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const shot = (n, full = false) => page.screenshot({ path: `shots/${n}.png`, fullPage: full });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  -", m); };

await page.goto(BASE);
await page.waitForLoadState("networkidle");
await shot("01-landing", true);
ok(await page.getByRole("heading", { level: 1 }).innerText().then((t) => /show up/i.test(t)), "landing hero renders");

await page.getByRole("link", { name: /plan a protest/i }).first().click();
await page.waitForURL("**/plan");
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForLoadState("networkidle");
await shot("02-step1");
// unsupported city -> waitlist
await page.selectOption("#city", "__else");
ok(await page.getByText("We’re not live here yet.").isVisible(), "unsupported city shows waitlist message");
await shot("03-waitlist");
await page.fill("#w-city", "Warsaw"); await page.fill("#w-country", "Poland"); await page.fill("#w-email", "wait@example.com");
await page.getByRole("button", { name: /join the waitlist/i }).click();
await page.getByText("You’re on the list.").waitFor();
ok(true, "waitlist signup completes");

await page.goto(BASE + "/plan");
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForLoadState("networkidle");
const cityId = await page.locator("#city option").nth(1).getAttribute("value");
await page.selectOption("#city", cityId);
await page.getByRole("button", { name: "Next", exact: true }).click();
await page.fill("#name", "Climate March");
const d = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
await page.fill("#date", d);
await shot("04-step2");
await page.getByRole("button", { name: "Next", exact: true }).click();
await page.getByRole("button", { name: /^March/ }).click();
await page.fill("#startLoc", "Town Hall steps");
await page.fill("#dest", "City Park");
await shot("05-step3");
// validation: try to continue with empty -> error then fix
await page.getByRole("button", { name: "Next", exact: true }).click();
await page.fill("#att", "400");
await shot("06-step4");
await page.getByRole("button", { name: "Next", exact: true }).click();
await page.locator("#sound").click(); await page.locator("#stage").click(); await page.locator("#food").click();
await shot("07-step5");
await page.getByRole("button", { name: "Next", exact: true }).click();
await page.fill("#oname", "Asha Rao"); await page.fill("#oemail", "asha@example.com");
await shot("08-step6");
await page.getByRole("button", { name: /show my readiness/i }).click();
await page.waitForURL(/\/plan\/[0-9a-f-]{36}$/);
const planUrl = page.url();
await page.waitForTimeout(1400);
await shot("09-dashboard", true);
ok(await page.getByText("Based on currently configured local requirements").first().isVisible(), "dashboard shows configured-requirements language");
ok((await page.getByText("Needs verification").count()) > 0, "unverified rules labelled Needs verification");
const before = await page.locator('[aria-label$="percent ready"]').first().getAttribute("aria-label");
await page.getByRole("button", { name: /Mark as done: Police intimation/ }).click();
await page.waitForTimeout(1500);
const after = await page.locator('[aria-label$="percent ready"]').first().getAttribute("aria-label");
ok(before !== after, `readiness changes when item completed (${before} -> ${after})`);

// return later: new page load
await page.goto(planUrl);
ok((await page.locator('[aria-label$="percent ready"]').first().getAttribute("aria-label")) === after, "readiness state persists on return");

// vendor
await page.getByRole("link", { name: /^get quotes/i }).first().click();
await page.waitForURL(/vendors/);
await shot("10-vendors");
await page.locator('a:has-text("Sound")').first().click();
await page.fill("#q-qty", "1 PA system, 2 mics");
await shot("11-quote-form", true);
await page.getByRole("button", { name: /request a quote/i }).click();
await page.getByText("Request received.").waitFor();
await shot("12-request-received");
ok(true, "vendor request submitted");

// pack
await page.goto(planUrl + "/pack");
await page.getByRole("button", { name: /generate my preparation pack/i }).click();
await page.waitForURL(/ready=1/);
await shot("13-pack", true);
ok((await page.getByText("Draft generated by BookMyProtest. Verify requirements with the relevant authority before submission.").count()) >= 6, "all six docs carry the disclaimer");
const dl = await page.request.get(planUrl + "/pack/download");
ok(dl.status() === 200 && (await dl.text()).includes("Climate March"), "text download works");

// signup saves plan
await page.goto(planUrl);
await page.getByRole("link", { name: /save with an account/i }).click();
await page.fill("#email", `e2e${Date.now()}@example.com`); await page.fill("#password", "correct-horse-battery");
await page.getByRole("button", { name: /create account/i }).click();
await page.waitForURL(planUrl);
ok(true, "account created, redirected back to plan");
await page.goto(BASE + "/account");
ok(await page.getByText("Climate March").isVisible(), "plan listed under My plans");

// access control: a fresh browser must not see the plan
const other = await (await browser.newContext()).newPage();
const r = await other.goto(planUrl);
ok(r.status() === 404, "plan is not accessible to other visitors (404)");

console.log("console/page errors:", errors.length ? errors : "none");
await browser.close();
