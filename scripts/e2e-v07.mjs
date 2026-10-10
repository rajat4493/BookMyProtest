// v0.7.0 journeys through the real UI: large-event step, Ramlila workflow + warning, live-restriction check, change-after-application, admin order parsing.
// Run against an app on the test DB with the Delhi corpus loaded (admin from .env.local): BASE=http://localhost:3101 node scripts/e2e-v07.mjs
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]; }
}
const BASE = process.env.BASE ?? "http://localhost:3101";
const OUT = process.env.SHOTS ?? "docs/previews/v0.7.0/images";
mkdirSync(OUT, { recursive: true });
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: exe });
const ok = (c, m) => { if (!c) throw new Error("FAIL: " + m); console.log("ok  -", m); };
const eventDate = new Date(Date.now() + 25 * 864e5).toISOString().slice(0, 10);
const has = async (p, t) => (await p.getByText(t).count()) > 0;
const settle = async (p) => { await p.waitForLoadState("networkidle"); await p.waitForTimeout(700); };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const next = () => p.getByRole("button", { name: "Next", exact: true }).click();

async function wizard({ attendance, large }) {
  await p.goto(BASE + "/plan"); await settle(p);
  await p.selectOption("#city", { label: "New Delhi District, NCT Delhi" });
  await next();
  await p.fill("#name", `Ramlila ${attendance}`); await p.fill("#date", eventDate); await next();
  await p.fill("#startLoc", "Ramlila Maidan"); await next();
  await p.fill("#att", String(attendance)); await next();
  await p.locator("#sound").click(); await next();
  const heading = await p.locator("h1").innerText();
  if (large) {
    ok(/tell us more/i.test(heading), "large event: the extra step appears before organiser details");
    await p.screenshot({ path: `${OUT}/1-large-event-step.png`, fullPage: true });
    await next();
    ok(await has(p, "Say in a sentence or two what the event is for"), "large event: purpose is required");
    await p.fill("#purpose", "A public meeting about the state of local schools");
    await p.fill("#speakers", "Dr A Rao (keynote); a visiting MP");
    await p.getByRole("button", { name: "Printed" }).click();
    await p.fill("#footprint", "Buses arrive via Asaf Ali Road; no road closure requested");
    await next();
  } else {
    ok(/organising/i.test(heading), "small event: no extra step, goes straight to organiser details");
  }
  await p.fill("#oname", "Asha Rao"); await p.fill("#oemail", "asha@example.com");
  await p.getByRole("button", { name: /show my readiness/i }).click();
  await p.waitForURL(/\/plan\/[0-9a-f-]{36}$/); await settle(p);
}

// 1. a small event has the unchanged questionnaire
await wizard({ attendance: 300, large: false });
ok(!(await has(p, "Heads-up")), "small event: no Ramlila heads-up");

// 2. a large event: Ramlila workflow
await wizard({ attendance: 5000, large: true });
const planUrl = p.url();
ok(await has(p, "Ramlila Maidan is not a one-step police-permission venue. Ground allotment and police NOC are separate requirements."), "Ramlila heads-up carries the exact warning sentence");
ok(await p.getByTestId("heads-up").getByText(/three separate approvals/i).count() > 0, "heads-up says to plan for three separate approvals");
ok(await p.getByTestId("heads-up").getByText(/Needs verification/).count() > 0, "heads-up is labelled 'Needs verification'");
for (const t of ["Police NOC for a gathering at Ramlila Maidan", "Ground allotment and land-owner permission for Ramlila Maidan", "Traffic NOC for rallies"]) ok(await has(p, t), `shows "${t}"`);
ok(await has(p, "Sound permission for processions and large gatherings that use sound"), "sound overlay applies to a large gathering using sound");
const html = await p.content();
ok(!/href="https?:\/\/[^"]*mcd/i.test(html), "no direct MCD booking link is exposed");
ok(!(await has(p, "Exact Ramlila Ground booking endpoint")), "the held booking-endpoint record is not shown to users");
await p.getByTestId("heads-up").scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/2-ramlila-heads-up.png` });

// 3. live restriction check at plan generation
const panel = p.getByTestId("restriction-check");
ok(await panel.count() === 1, "live restriction check panel is shown for a Delhi event");
const txt = await panel.innerText();
ok(/Plan generated/.test(txt), "check records that it ran at plan generation");
ok(!/no restrictions? (are|is) in force|all clear/i.test(txt), "check never claims 'no restrictions in force'");
await panel.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/3-live-restriction-check.png` });

// 4. change after application
await p.getByRole("button", { name: /I.ve submitted my application/ }).click(); await settle(p);
ok(await has(p, "Marked as submitted"), "application can be marked as submitted");
ok(await has(p, "re-confirm with the issuing authority"), "the standing re-confirm advice is shown on the dashboard");
await p.getByRole("link", { name: "Edit plan details" }).click(); await settle(p);
ok(await p.getByTestId("reconfirm-note").count() === 1, "details page warns that material changes need re-confirming");
await p.fill("#d-speakers", "A different, more prominent speaker"); // material
await p.screenshot({ path: `${OUT}/4-edit-details.png`, fullPage: true });
await p.getByRole("button", { name: /Save and recheck/ }).click();
await p.waitForURL(/\?updated=1/); await settle(p);
const banner = p.getByTestId("change-banner");
ok(await banner.count() === 1, "material change after applying shows the re-confirm banner");
ok(/speakers or VIPs/.test(await banner.innerText()) && /re-confirm the change with the issuing authority/.test(await banner.innerText()), "banner names what changed and advises re-confirming with the issuing authority");
await banner.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/5-change-after-application.png` });
ok((await p.getByTestId("restriction-check").innerText()).includes("Plan rechecked"), "a restriction check ran again on the change");
await p.getByRole("button", { name: /I have re-confirmed/ }).click(); await settle(p);
ok(await p.getByTestId("change-banner").count() === 0, "acknowledging clears the banner");

// 5. pack shows the check; download carries it
await p.goto(planUrl + "/pack"); await settle(p);
await p.getByRole("button", { name: /Generate my preparation pack/ }).click(); await p.waitForURL(/ready=1/); await settle(p);
ok(await p.getByTestId("pack-check").count() === 1, "pack page shows the live restriction check");
ok(/Documents generated/.test(await p.getByTestId("pack-check").innerText()), "check ran at document generation");
ok(await has(p, "Speakers / VIPs") && await has(p, "A different, more prominent speaker"), "event summary includes speakers/VIPs");
const dl = await (await ctx.request.get(planUrl + "/pack/download")).text();
ok(/LIVE RESTRICTION CHECK/.test(dl) && /Route and traffic footprint/.test(dl), "the .txt download carries the check and the large-event fields");

// 6. admin: parse an order, review the candidate, accept as DRAFT
const a = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await a.goto(BASE + "/login"); await a.fill('input[name="email"]', process.env.ADMIN_EMAIL); await a.fill('input[name="password"]', process.env.ADMIN_PASSWORD);
await a.getByRole("button", { name: /sign in|log in/i }).click(); await settle(a);
await a.goto(BASE + "/admin/restrictions"); await settle(a);
const order = `ORDER\nNo. 77/Ord/2026\nDated: 05.12.2026\nIn exercise of the powers conferred under Section 163 of the Bharatiya Nagarik Suraksha Sanhita, 2023, I, Commissioner of Police, Delhi, hereby prohibit the assembly of five or more persons within the limits of New Delhi District, from 08.12.2026 to 12.12.2026.\nCommissioner of Police, Delhi`;
await a.fill('textarea[name="text"]', order);
await a.getByRole("button", { name: "Parse for review" }).click(); await settle(a);
ok(await has(a, "Parsed orders awaiting review (1)"), "admin: pasted order becomes one pending candidate");
ok((await a.locator('input[name="issuingAuthority"]').first().inputValue()) === "Commissioner of Police, Delhi", "admin: issuing authority parsed");
ok((await a.locator('input[name="startsAt"]').first().inputValue()).startsWith("2026-12-08"), "admin: effective start parsed");
await a.screenshot({ path: `${OUT}/6-admin-candidate-review.png`, fullPage: true });
await a.getByRole("button", { name: "Accept as draft restriction" }).click(); await settle(a);
const row = await a.locator("table tbody tr").first().innerText();
ok(/Order 77\/Ord\/2026/.test(row) && /DRAFT/.test(row) && !/ACTIVE/.test(row), "admin: accepted candidate is a DRAFT restriction, not active");
await a.screenshot({ path: `${OUT}/7-admin-restriction-draft.png`, fullPage: true });

await browser.close();
console.log("V0.7.0 JOURNEYS VERIFIED IN THE UI");
