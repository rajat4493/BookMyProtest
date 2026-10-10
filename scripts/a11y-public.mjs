// axe-core scan of the v1.0 public screens (mobile): discovery, protest page (anonymous and signed in), publish editor, toolkit, admin moderation, legal drafts.
// Usage (app on the Delhi test DB): BASE=http://localhost:3101 node scripts/a11y-public.mjs
import { chromium } from "playwright-core";
import { readdirSync, readFileSync, existsSync } from "node:fs";
for (const f of [".env.local"]) if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE ?? "http://localhost:3101";
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const b = await chromium.launch({ executablePath: exe });
let n = 0;
const scan = async (p, name) => {
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(900);
  await p.evaluate(axe);
  const r = await p.evaluate(() => axe.run({ exclude: ["nextjs-portal"] }));
  console.log(`${name}: ${r.violations.length} violations`);
  for (const v of r.violations) console.log("  -", v.id, v.impact, v.nodes.length, v.nodes[0].target.join(" "), "|", v.nodes[0].failureSummary?.split("\n")[1]);
  n += r.violations.length;
};
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const date = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
const next = () => p.getByRole("button", { name: "Next", exact: true }).click();
// organizer: plan -> sign up -> publish
await p.goto(BASE + "/plan"); await p.waitForLoadState("networkidle");
await p.selectOption("#city", { label: "New Delhi District, NCT Delhi" }); await p.locator("#venue").selectOption({ label: "Jantar Mantar" }); await next();
await p.fill("#name", "A11y public"); await p.fill("#date", date); await next(); await p.fill("#startLoc", "Jantar Mantar"); await next(); await p.fill("#att", "400"); await next(); await next();
await p.fill("#oname", "Asha Rao"); await p.fill("#oemail", "asha@example.com"); await p.getByRole("button", { name: /show my checklist/i }).click(); await p.waitForURL(/\/plan\/[0-9a-f-]{36}$/);
const planUrl = p.url();
await p.goto(planUrl + "/publish"); await scan(p, "publish editor (signed out)");
await p.getByRole("link", { name: /create an account/i }).click(); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800); await p.fill("#email", `a11y${Date.now()}@example.com`); await p.fill("#password", "correct-horse-battery"); await p.getByRole("button", { name: /create account/i }).click(); await p.waitForTimeout(3000);
await p.goto(planUrl + "/publish"); await p.fill("#title", "A11y public protest"); await p.fill("#summary", "A short summary."); await p.fill("#organizerDisplayName", "Test group"); await p.selectOption("#visibility", "PUBLIC");
await p.check('input[name="opt_WATER_HELP"]'); await p.getByTestId("save-page").click(); await p.waitForTimeout(3000);
await scan(p, "publish editor (saved)");
await p.getByTestId("gen-toolkit").click(); await p.waitForURL(/toolkit=1/, { waitUntil: "commit" }); await p.waitForLoadState("networkidle"); await scan(p, "toolkit");
const slug = (await p.getByTestId("preview-link").getAttribute("href"));
await p.goto(BASE + slug); await scan(p, "public protest page (owner)");
const q = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await q.goto(BASE + slug); await scan(q, "public protest page (anonymous)");
await q.goto(BASE + "/protests"); await scan(q, "discovery");
await q.goto(BASE + "/protests?state=NCT+Delhi&sort=newest"); await scan(q, "discovery filtered");
for (const path of ["/terms", "/privacy", "/platform-guidelines"]) { await q.goto(BASE + path); await scan(q, path); }
const a = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await a.goto(BASE + "/login"); await a.fill('input[name="email"]', process.env.ADMIN_EMAIL); await a.fill('input[name="password"]', process.env.ADMIN_PASSWORD);
await a.getByRole("button", { name: /sign in|log in/i }).click(); await a.waitForLoadState("networkidle");
await a.goto(BASE + "/admin/protests"); await scan(a, "admin public listings");
await p.goto(BASE + "/account"); await scan(p, "my plans with public page link");
console.log("TOTAL violations:", n);
await b.close(); process.exit(n ? 1 : 0);
