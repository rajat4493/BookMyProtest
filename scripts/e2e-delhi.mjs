// Delhi / Jantar Mantar scenarios through the real UI. Run against an app whose database has the corpus fully loaded
// (the test DB with a fixture Standing Order URL). Usage: BASE=http://localhost:3101 node scripts/e2e-delhi.mjs
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3101";
const OUT = process.env.SHOTS ?? "docs/previews/v0.6.0/images";
mkdirSync(OUT, { recursive: true });
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  -", m); };
const eventDate = new Date(Date.now() + 25 * 864e5).toISOString().slice(0, 10);

async function run(tag, { attendance, march = false, sound = false, venue = true }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const next = () => p.getByRole("button", { name: "Next", exact: true }).click();
  await p.goto(BASE + "/plan"); await p.waitForLoadState("networkidle");
  await p.selectOption("#city", { label: "New Delhi District, NCT Delhi" });
  await p.locator("#venue").waitFor();
  if (venue) await p.selectOption("#venue", { label: "Jantar Mantar" });
  if (tag === "s1") await p.screenshot({ path: `${OUT}/1-questionnaire-venue.png` });
  await next();
  await p.fill("#name", `Scenario ${tag}`); await p.fill("#date", eventDate); await next();
  if (march) { await p.getByRole("button", { name: /^March/ }).click(); await p.fill("#dest", "Parliament Street"); }
  await p.fill("#startLoc", "Jantar Mantar Road"); await next();
  await p.fill("#att", String(attendance)); await next();
  if (sound) await p.locator("#sound").click();
  await next();
  if (/tell us more/i.test(await p.locator("h1").innerText())) { await p.fill("#purpose", "A large public meeting for the scenario"); await next(); } // large-event step (v0.7.0)
  await p.fill("#oname", "Asha Rao"); await p.fill("#oemail", "asha@example.com");
  await p.getByRole("button", { name: /show my readiness/i }).click();
  await p.waitForURL(/\/plan\/[0-9a-f-]{36}$/); await p.waitForLoadState("networkidle"); await p.waitForTimeout(1500);
  return p;
}
const has = async (p, t) => (await p.getByText(t).count()) > 0;

// Scenario 1: 300-person static protest
let p = await run("s1", { attendance: 300 });
ok(await has(p, "Prior police permission") && await has(p, "Apply at least 10 days ahead") && await has(p, "Traffic NOC for rallies"), "S1: permission, 10-day lead time and Traffic NOC shown");
ok(!(await has(p, "No march to or from Jantar Mantar")) && !(await has(p, "Loudspeaker only with specific permission")), "S1: no march/loudspeaker rules for a static, no-sound plan");
ok(await has(p, "Jantar Mantar ·") || await has(p, "Jantar Mantar"), "S1: dashboard names the venue");
ok(await has(p, "Primary source verified"), "S1: user sees 'Primary source verified'");
await p.screenshot({ path: `${OUT}/2-s1-300-static-top.png` });
await p.getByText("Critical").first().scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/3-s1-300-static-critical.png` });

// Scenario 2: 2,000 people routed away from Jantar Mantar
p = await run("s2", { attendance: 2000 });
ok(await has(p, "Larger gatherings: Ramlila Ground") && await has(p, "Maximum 1,000 participants"), "S2: Ramlila routing guidance and the 1,000 cap shown");
ok(!(await has(p, "Prior police permission")) && !(await has(p, "Protest window 10:00")), "S2: Jantar Mantar permission/time rules are not shown for 2,000 people");
ok(!(await has(p, "booking and land-owner authority workflow")), "S2: held Ramlila booking record never reaches users");
await p.getByText("Larger gatherings: Ramlila Ground").first().scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/4-s2-2000-routed-to-ramlila.png` });

// Scenario 3: 500 people, march + loudspeaker
p = await run("s3", { attendance: 500, march: true, sound: true });
for (const t of ["No march to or from Jantar Mantar", "Symbolic march only with separate police permission", "Loudspeaker only with specific permission", "No vehicle-mounted PA system", "Traffic NOC for rallies"]) ok(await has(p, t), `S3: shows "${t}"`);
await p.getByText("No march to or from Jantar Mantar").first().scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/5-s3-500-march-sound.png` });
await p.goto(p.url() + "/pack"); await p.getByRole("button", { name: /generate my preparation pack/i }).click(); await p.waitForURL(/ready=1/); await p.waitForTimeout(800);
ok(await has(p, "Undertaking preparation sheet (Jantar Mantar)"), "documents use the Jantar Mantar venue template");
await p.getByText("Undertaking preparation sheet (Jantar Mantar)").first().scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/6-jantar-mantar-undertaking-sheet.png` });
// Scenario 4: a march elsewhere in Delhi (no venue): conservative generic baseline, nothing borrowed from Jantar Mantar
p = await run("s4", { attendance: 500, march: true, sound: true, venue: false });
for (const t of ["Police permission process for processions", "Route and timing are set by Delhi Police", "Sound permission for processions and large gatherings that use sound", "A current Delhi Police order governs rallies and processions", "Traffic NOC for rallies"]) ok(await has(p, t), `S4: shows "${t}"`);
for (const t of ["No march to or from Jantar Mantar", "Apply at least 10 days ahead", "Loudspeaker only with specific permission"]) ok(!(await has(p, t)), `S4: does not show the Jantar Mantar rule "${t}"`);
ok(await has(p, "Needs verification"), "S4: the sound item is honestly labelled 'Needs verification'");
const routeRow = p.locator("li", { hasText: "Route and timing are set by Delhi Police" }).first();
ok((await routeRow.innerText()).includes("The Delhi Police Act, 1978"), "S4: the route/timing rule cites the Delhi Police Act (the source that carries the claim), not the index entry");
const permRow = p.locator("li", { hasText: "Police permission process for processions" }).first();
ok(!/Guidelines for regulation of rallies\/procession in Delhi/.test((await permRow.innerText()).split("Details")[0]), "S4: the permission rule's headline citation is not the index-only entry");
await p.getByText("Route and timing are set by Delhi Police").first().scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/7-s4-march-elsewhere-in-delhi.png` });
await p.getByText("Other notes").first().click(); await p.getByText("A current Delhi Police order governs rallies and processions").first().scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/8-s4-existence-notice-unknown.png` });
await browser.close();
console.log("DELHI SCENARIOS VERIFIED IN THE UI");
