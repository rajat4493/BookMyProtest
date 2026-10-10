// v0.9 acceptance run: a first-time organizer, Jantar Mantar, 500 people, static, 2 buses, ~3 weeks out. Drives the real UI and dumps
// what the organizer actually sees to docs/acceptance/evidence/*.txt (+ screenshots). Test DB with the Delhi corpus SIMULATED as verified.
import { chromium } from "playwright-core";
import pg from "pg";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:3101";
const EV = "docs/acceptance/evidence", IMG = "docs/acceptance/images";
mkdirSync(EV, { recursive: true }); mkdirSync(IMG, { recursive: true });
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe });
const db = new pg.Pool({ connectionString: "postgres://bmp:bmp@localhost:5432/bookmyprotest_test" });
const p = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const settle = async () => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(900); };
const dump = async (name, extra = "") => { await settle(); writeFileSync(`${EV}/${name}.txt`, `URL: ${p.url()}\n\n` + (await p.locator("main").innerText()) + extra); await p.screenshot({ path: `${IMG}/${name}.png`, fullPage: true }); };
const next = () => p.getByRole("button", { name: "Next", exact: true }).click();
const date = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
console.log("event date", date);

// --- 1. questionnaire
await p.goto(BASE + "/plan"); await settle();
await p.selectOption("#city", { label: "New Delhi District, NCT Delhi" }); await p.locator("#venue").waitFor(); await p.selectOption("#venue", { label: "Jantar Mantar" });
await dump("01-where"); await next();
await p.fill("#name", "Parents for Safe Schools"); await p.fill("#date", date); await p.fill("#start", "10:30"); await p.fill("#end", "15:30");
await p.getByTestId("date-conflict-wizard").waitFor(); await dump("02-when-with-date-check"); await next();
await p.fill("#startLoc", "Jantar Mantar, New Delhi"); await p.fill("#desc", "A peaceful gathering of parents asking the Education Department to fix unsafe school buildings."); await dump("03-kind"); await next();
await p.fill("#att", "500"); await dump("04-howmany"); await next();
await p.locator("#vehicles").click(); await p.fill("#buses", "2"); await dump("05-use"); await next();
await p.fill("#oname", "Meera Nair"); await p.fill("#oemail", "meera@example.com"); await p.fill("#ophone", "9810000000"); await dump("06-who");
await p.getByRole("button", { name: /show my readiness/i }).click(); await p.waitForURL(/\/plan\/[0-9a-f-]{36}$/); await settle();
const planUrl = p.url(); const eventId = planUrl.split("/").pop();

// --- 2. dashboard, with every requirement's details expanded
await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
await p.evaluate(() => document.querySelectorAll("button[aria-expanded='false']").forEach((b) => b.click()));
await dump("10-dashboard");

// --- 3. pack
await p.goto(planUrl + "/pack"); await settle();
await p.getByRole("button", { name: /Generate my preparation pack/ }).click(); await p.waitForURL(/ready=1/); await dump("20-pack");
writeFileSync(`${EV}/21-pack-download.txt`, await (await p.context().request.get(planUrl + "/pack/download")).text());

// --- 4. submission tracking
await p.goto(planUrl); await settle();
const evalCount = async () => (await db.query("SELECT count(*)::int AS n FROM event_evaluations WHERE event_id=$1", [eventId])).rows[0].n;
const firstEval = (await db.query("SELECT id, answers, requirements FROM event_evaluations WHERE event_id=$1 ORDER BY evaluated_at LIMIT 1", [eventId])).rows[0];
const n0 = await evalCount();
await p.getByRole("button", { name: /I.ve submitted my application/ }).click(); await settle(); await dump("30-after-submitted");
await p.goto(planUrl + "/details"); await settle(); await p.fill("#d-organizerPhone", "9810000001"); await p.getByRole("button", { name: /Save and recheck/ }).click(); await p.waitForURL(/updated=1/); await dump("31-after-nonmaterial-edit");
const nonMaterialBanner = await p.getByTestId("change-banner").count();
await p.goto(planUrl + "/details"); await settle(); await p.fill("#d-attendance", "800"); await p.getByRole("button", { name: /Save and recheck/ }).click(); await p.waitForURL(/updated=1/); await dump("32-after-material-edit");
const materialBanner = await p.getByTestId("change-banner").count();
const n1 = await evalCount();
const firstAfter = (await db.query("SELECT id, answers, requirements FROM event_evaluations WHERE id=$1", [firstEval.id])).rows[0];
const changes = (await db.query("SELECT changed_fields, material, after_application FROM event_changes WHERE event_id=$1 ORDER BY changed_at", [eventId])).rows;
// restore plan to 500 for the later steps (a further material change, acknowledged)
await p.goto(planUrl + "/details"); await settle(); await p.fill("#d-attendance", "500"); await p.getByRole("button", { name: /Save and recheck/ }).click(); await p.waitForURL(/updated=1/); await settle();
await p.getByRole("button", { name: /I have re-confirmed/ }).click(); await settle();
writeFileSync(`${EV}/33-tracking-facts.json`, JSON.stringify({ snapshotsBefore: n0, snapshotsAfter: n1, nonMaterialBanner, materialBanner, firstEvalUntouched: JSON.stringify(firstEval) === JSON.stringify(firstAfter), changes }, null, 1));

// --- 5. dashboard final + what the check history says
await p.goto(planUrl); await settle();
await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
await dump("40-dashboard-final");
console.log(JSON.stringify({ eventId, planUrl, date }));
await db.end(); await browser.close();
