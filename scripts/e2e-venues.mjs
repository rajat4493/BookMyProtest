// v0.8.0 venue date-conflict journeys through the real UI. App on the Delhi test DB, admin from .env.local: BASE=http://localhost:3101 node scripts/e2e-venues.mjs
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
for (const f of [".env.local"]) if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
const BASE = process.env.BASE ?? "http://localhost:3101";
const OUT = process.env.SHOTS ?? "docs/previews/v0.8.0/images";
mkdirSync(OUT, { recursive: true });
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  -", m); };
const settle = async (p) => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(700); };
const date = new Date(Date.now() + 25 * 864e5).toISOString().slice(0, 10);
const from = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10), to = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

const fresh = async () => (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
let u = await fresh();
const a = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const next = () => u.getByRole("button", { name: "Next", exact: true }).click();

async function check(venue) {
  u = await fresh(); await u.goto(BASE + "/plan"); await settle(u);
  await u.selectOption("#city", { label: "New Delhi District, NCT Delhi" });
  await u.locator("#venue").waitFor();
  await u.selectOption("#venue", { label: venue });
  await next();
  await u.fill("#name", `Venue ${venue}`);
  ok(await u.getByTestId("date-conflict-wizard").count() === 0, `${venue}: no date check before a date is chosen`);
  await u.fill("#date", date);
  await u.getByTestId("date-conflict-wizard").waitFor();
  return u.getByTestId("date-conflict-wizard");
}
const noAvailable = async (p, m) => ok(!/\bavailable\b/i.test(await p.innerText()), m);

// admin session
await a.goto(BASE + "/login"); await a.fill('input[name="email"]', process.env.ADMIN_EMAIL); await a.fill('input[name="password"]', process.env.ADMIN_PASSWORD);
await a.getByRole("button", { name: /sign in|log in/i }).click(); await settle(a);

// 1. Ramlila: nothing verified -> official status unknown
let panel = await check("Ramlila Maidan");
ok((await panel.getAttribute("data-state")) === "OFFICIAL_STATUS_UNKNOWN", "Ramlila with no official check: OFFICIAL_STATUS_UNKNOWN");
await noAvailable(panel, "Ramlila: the word 'available' is never shown");
await panel.scrollIntoViewIfNeeded(); await u.screenshot({ path: `${OUT}/1-ramlila-status-unknown.png` });

// 2. Jantar Mantar: shared venue
panel = await check("Jantar Mantar");
ok((await panel.getAttribute("data-state")) === "SHARED_CAPACITY", "Jantar Mantar: SHARED_CAPACITY");
await noAvailable(panel, "Jantar Mantar: never 'available'");

// 3. admin records official checks for Ramlila and a police approval; a JM police approval
await a.goto(BASE + "/admin/venues"); await settle(a);
await a.screenshot({ path: `${OUT}/2-admin-venues.png`, fullPage: true });
const sourceLabel = (await a.locator('form[action] select[name="sourceId"] option', { hasText: "Delhi Traffic Police" }).first().innerText()).trim();
const rmId = await a.locator('select[name="venueId"] option', { hasText: "Ramlila Maidan" }).first().getAttribute("value");
const jmId = await a.locator('select[name="venueId"] option', { hasText: "Jantar Mantar" }).first().getAttribute("value");
async function official(authority) {
  const f = a.locator("form", { has: a.locator('select[name="authority"]') });
  await f.locator('select[name="venueId"]').selectOption(rmId); await f.locator('select[name="authority"]').selectOption(authority);
  await f.locator('select[name="sourceId"]').selectOption({ label: sourceLabel }); await f.locator('input[name="from"]').fill(from); await f.locator('input[name="to"]').fill(to);
  await f.getByRole("button", { name: "Record check" }).click(); await settle(a);
}
await official("BOOKING"); await official("POLICE");
panel = await check("Ramlila Maidan");
ok((await panel.getAttribute("data-state")) === "NO_CONFLICT_FOUND", "Ramlila with both official checks and no entries: NO_CONFLICT_FOUND");
ok(/not confirmation that the date is free/i.test(await panel.innerText()), "…and says it is not confirmation the date is free");
await noAvailable(panel, "NO_CONFLICT_FOUND never reads as 'available'");
await panel.scrollIntoViewIfNeeded(); await u.screenshot({ path: `${OUT}/3-ramlila-no-conflict-found.png` });
ok(/can diverge/i.test(await panel.innerText()), "Ramlila shows the 2023-case operational-learning note");

async function signal(venueId, type, status, extra = {}) {
  await a.goto(BASE + "/admin/venues"); await settle(a);
  const f = a.locator("form", { has: a.locator('select[name="type"]') });
  await f.locator('select[name="venueId"]').selectOption(venueId); await f.locator('select[name="type"]').selectOption(type); await f.locator('select[name="status"]').selectOption(status);
  await f.locator('input[name="date"]').fill(date); await f.locator('input[name="attendance"]').fill("400"); await f.locator('select[name="confidence"]').selectOption("high");
  if (extra.source) await f.locator('select[name="sourceId"]').selectOption({ label: extra.source });
  await f.getByRole("button", { name: "Save signal" }).click(); await settle(a);
}
await signal(rmId, "POLICE_APPROVAL", "CONFIRMED", { source: sourceLabel });
panel = await check("Ramlila Maidan");
ok((await panel.getAttribute("data-state")) === "CONFLICT_CONFIRMED", "a police approval alone makes Ramlila CONFLICT_CONFIRMED (booking side clear)");
await panel.scrollIntoViewIfNeeded(); await u.screenshot({ path: `${OUT}/4-ramlila-conflict-confirmed.png` });

await signal(jmId, "POLICE_APPROVAL", "CONFIRMED", { source: sourceLabel });
panel = await check("Jantar Mantar");
ok((await panel.getAttribute("data-state")) === "SHARED_CAPACITY" && /does not block/i.test(await panel.innerText()), "Jantar Mantar with another confirmed approval: warning only, does not block");
await panel.scrollIntoViewIfNeeded(); await u.screenshot({ path: `${OUT}/5-jm-other-events-warning.png` });

// 4. social media can only be a low-confidence public report
await a.goto(BASE + "/admin/venues"); await settle(a);
const f = a.locator("form", { has: a.locator('select[name="type"]') });
await f.locator('select[name="venueId"]').selectOption(jmId); await f.locator('select[name="type"]').selectOption("OFFICIAL_BOOKING"); await f.locator('input[name="date"]').fill(date);
await f.locator('input[name="sourceUrl"]').fill("https://x.com/someone/status/1"); await f.locator('select[name="sourceId"]').selectOption({ label: sourceLabel });
await f.getByRole("button", { name: "Save signal" }).click(); await settle(a);
ok(/social media/i.test(await a.locator('[role="alert"]').first().innerText()), "admin: a social-media URL cannot back an official signal");

// 5. BookMyProtest's own application shows as 'Known to BookMyProtest' on another plan, labelled
async function plan(venue) {
  u = await fresh(); await u.goto(BASE + "/plan"); await settle(u);
  await u.selectOption("#city", { label: "New Delhi District, NCT Delhi" }); await u.locator("#venue").waitFor(); await u.selectOption("#venue", { label: venue }); await next();
  await u.fill("#name", "Own plan"); await u.fill("#date", date); await next();
  await u.fill("#startLoc", venue); await next(); await u.fill("#att", "200"); await next(); await next();
  await u.fill("#oname", "Asha Rao"); await u.fill("#oemail", "asha@example.com");
  await u.getByRole("button", { name: /show my readiness/i }).click(); await u.waitForURL(/\/plan\/[0-9a-f-]{36}$/); await settle(u);
}
await plan("Jantar Mantar");
await u.getByRole("button", { name: /I.ve submitted my application/ }).click(); await settle(u);
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } }); const u2 = await ctx2.newPage();
await u2.goto(BASE + "/plan"); await settle(u2);
await u2.selectOption("#city", { label: "New Delhi District, NCT Delhi" }); await u2.locator("#venue").waitFor(); await u2.selectOption("#venue", { label: "Jantar Mantar" });
await u2.getByRole("button", { name: "Next", exact: true }).click(); await u2.fill("#name", "Second"); await u2.fill("#date", date);
const p2 = u2.getByTestId("date-conflict-wizard"); await p2.waitFor();
ok(/Known to BookMyProtest/.test(await p2.innerText()), "another organiser sees the application labelled 'Known to BookMyProtest'");
ok(!/Asha Rao|asha@example\.com/.test(await p2.innerText()), "no names or contacts are revealed");
ok(/not complete government data/i.test(await p2.innerText()), "…with the not-complete-government-data caveat");
await p2.scrollIntoViewIfNeeded(); await u2.screenshot({ path: `${OUT}/6-known-to-bmp.png` });

// 6. the dashboard shows the check for a plan with a venue
await u.goto(u.url()); await settle(u);
ok(await u.getByTestId("date-conflict").count() === 1, "dashboard shows the date conflict check for a plan with a venue");
await browser.close();
console.log("V0.8.0 VENUE JOURNEYS VERIFIED IN THE UI");
