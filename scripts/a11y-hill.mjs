// axe-core scan of the v1.1 screens (mobile; admin at desktop). Run after scripts/e2e-hill.mjs on the same database, app with both flags ON:
//   BASE=http://localhost:3101 node scripts/a11y-hill.mjs
import { chromium } from "playwright-core";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import pg from "pg";
for (const f of [".env.local"]) if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://bmp:bmp@localhost:5432/bookmyprotest_test" });
await db.query("TRUNCATE rate_limits");
const BASE = process.env.BASE ?? "http://localhost:3101";
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const b = await chromium.launch({ executablePath: exe });
let n = 0;
const scan = async (p, name) => {
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
  await p.evaluate(axe);
  const r = await p.evaluate(() => axe.run({ exclude: ["nextjs-portal"] }));
  console.log(`${name}: ${r.violations.length} violations`);
  for (const v of r.violations) console.log("  -", v.id, v.impact, v.nodes.length, v.nodes[0].target.join(" "), "|", v.nodes[0].failureSummary?.split("\n")[1]);
  n += r.violations.length;
};
const issue = (await db.query("SELECT id, slug FROM issues WHERE status='PUBLISHED' LIMIT 1")).rows[0];
const camp = (await db.query("SELECT slug FROM digital_campaigns WHERE visibility='PUBLIC' LIMIT 1")).rows[0];
if (!issue || !camp) throw new Error("run scripts/e2e-hill.mjs first (it creates the fixture issue and campaign)");

const q = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await q.goto(BASE + "/issues"); await scan(q, "find your hill (empty search)");
await q.goto(BASE + "/issues?q=water&state=Maharashtra"); await scan(q, "find your hill (results)");
await q.goto(BASE + "/issues?q=zzzz-nothing"); await scan(q, "find your hill (no results)");
await q.goto(BASE + "/issues/" + issue.slug); await scan(q, "issue page");
await q.getByTestId("report").locator("summary").click(); await scan(q, "issue page (report form open)");
await q.goto(BASE + "/issues/suggest"); await scan(q, "suggest an issue (signed out)");
await q.goto(BASE + "/actions"); await scan(q, "digital actions list");
await q.goto(BASE + "/actions/" + camp.slug); await scan(q, "campaign page (signed out)");
await q.getByTestId("report").locator("summary").click(); await scan(q, "campaign page (report form open)");
await q.goto(BASE + "/actions/new"); await scan(q, "create a campaign (signed out)");

// a confirmed user: suggest, create form, participate, activity, manage (campaign seeded for this user)
const u = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const email = `a11yhill${Date.now()}@example.com`;
await u.goto(BASE + "/signup"); await u.fill("#email", email); await u.fill("#password", "correct-horse-battery"); await u.getByRole("button", { name: /create account/i }).click(); await u.waitForTimeout(2500);
await scan(u, "after sign-up (unconfirmed)");
await u.goto(BASE + "/issues/suggest"); await scan(u, "suggest an issue (unconfirmed)");
await u.goto(BASE + "/actions/" + camp.slug); await scan(u, "campaign page (unconfirmed email)");
await u.goto(BASE + "/actions/new?issue=" + issue.slug); await scan(u, "create a campaign (signed in)");
const link = (await db.query("SELECT body FROM email_outbox WHERE to_email=$1 ORDER BY created_at DESC LIMIT 1", [email])).rows[0].body.match(/\/verify-email\?token=[0-9a-f]{64}/)[0];
await u.goto(BASE + link); await u.getByRole("button", { name: /confirm email/i }).click(); await u.waitForTimeout(2000);
await u.goto(BASE + "/issues/suggest"); await scan(u, "suggest an issue (confirmed)");
await u.goto(BASE + "/issues/" + issue.slug); await scan(u, "issue page (confirmed, following control)");
await u.goto(BASE + "/actions/" + camp.slug); await u.locator("button[data-intent='INTENDS']").first().click(); await u.waitForTimeout(2000); await scan(u, "campaign page (participating)");
await u.goto(BASE + "/activity"); await scan(u, "my activity");
const uid = (await db.query("SELECT id FROM users WHERE email=$1", [email])).rows[0].id;
const slug = `a11y-seed-${Date.now()}`;
const cid = (await db.query(`INSERT INTO digital_campaigns (slug, issue_id, owner_user_id, title, summary, requested_change, institution, evidence, closure_criteria, starts_on, review_on, organizer_display_name, visibility, published_at)
  VALUES ($1,$2,$3,'Accessibility seed campaign','Seed','Publish a written policy within 60 days.','', '[]', 'Closed when published or on the review date.', current_date, current_date + 30, 'Seed group','DRAFT', NULL) RETURNING id`, [slug, issue.id, uid])).rows[0].id;
await db.query("INSERT INTO digital_campaign_actions (campaign_id, category, label) VALUES ($1,'FOLLOW_DEVELOPMENTS','Follow the developments')", [cid]);
await u.goto(BASE + `/actions/${slug}/manage`); await scan(u, "manage a campaign");

const a = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await a.goto(BASE + "/login"); await a.fill('input[name="email"]', process.env.ADMIN_EMAIL); await a.fill('input[name="password"]', process.env.ADMIN_PASSWORD);
await a.getByRole("button", { name: /sign in|log in/i }).click(); await a.waitForLoadState("networkidle");
await a.goto(BASE + "/admin/issues"); await scan(a, "admin: issues");
await a.goto(BASE + `/admin/issues/${issue.id}`); await scan(a, "admin: issue editor");
await a.goto(BASE + "/admin/content"); await scan(a, "admin: issue and campaign reports");
await db.end();
console.log("TOTAL violations:", n);
await b.close(); process.exit(n ? 1 : 0);
