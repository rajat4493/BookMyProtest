// Acceptance run, part 2 (test DB only): live-restriction states, T-72h/T-24h checks with an injected clock, and the "everything ticked" readiness view.
// SYNTHETIC restriction data is used to show how the product renders a restriction; it is not a real order.
process.env.DATABASE_URL = "postgres://bmp:bmp@localhost:5432/bookmyprotest_test";
import { chromium } from "playwright-core";
import { readdirSync, writeFileSync } from "node:fs";
import { one, pool, query } from "../src/lib/db";
import { recordSourceContent, saveRestriction, listCandidates, parseOrderText } from "../src/lib/knowledge";
import { getEvent } from "../src/lib/store";
import { listChecks, runDueEventChecks, runRestrictionCheck } from "../src/lib/restriction-checks";

async function main() {
const EV = "docs/acceptance/evidence", IMG = "docs/acceptance/images", BASE = "http://localhost:3101";
const ev = (await one<{ id: string }>("SELECT id FROM events ORDER BY created_at DESC LIMIT 1"))!.id;
const event = (await getEvent(ev))!;
const admin = { userId: (await one<{ id: string }>("SELECT id FROM users WHERE role='admin' LIMIT 1"))!.id };
const feed = (await one<{ id: string; title: string }>("SELECT id, title FROM sources WHERE feed_role='LIVE_RESTRICTIONS'"))!;
const out: Record<string, unknown> = {};
const stamp = async (k: string, now = new Date()) => { const c = await runRestrictionCheck(event, "RECHECK", now); out[k] = c ? { status: c.status, message: c.message, pendingReview: c.pendingReview, feedLastCheckedAt: c.feedLastCheckedAt } : null; };

await stamp("1-feed-never-checked");
await recordSourceContent(feed.id, "Notifications\nOrder about office timings only."); // baseline: the feed has now been read
await stamp("2-feed-checked-nothing-recorded");
await parseOrderText(feed.id, `ORDER\nNo. 90/2026\nDated: 28.10.2026\nIn exercise of the powers under Section 163 of the Bharatiya Nagarik Suraksha Sanhita, 2023, the Commissioner of Police, Delhi prohibits assembly of five or more persons within the limits of New Delhi District from 29.10.2026 to 02.11.2026.`, admin);
await stamp("3-unreviewed-notification-exists");
const [cand] = await listCandidates("PENDING");
const district = (await one<{ id: string }>("SELECT id FROM jurisdictions WHERE name='New Delhi District'"))!.id;
await query("UPDATE restriction_candidates SET status='REJECTED' WHERE id=$1", [cand.id]);
const rid = await saveRestriction(null, { jurisdictionId: district, title: "SYNTHETIC: Section 163 order, New Delhi District", geographicScope: "New Delhi District", startsAt: "2026-10-29T00:00:00Z", endsAt: "2026-11-02T23:59:00Z", legalBasis: "Section 163 BNSS", affectedActivities: ["ASSEMBLY"], effect: "PROHIBITED", plainExplanation: "Assembly of five or more persons is prohibited in the district (synthetic test data).", sourceId: feed.id, status: "ACTIVE", issuingAuthority: "Commissioner of Police, Delhi", orderDate: "2026-10-28", orderReference: "90/2026" }, admin);
await stamp("4-restriction-found");

// T-72h / T-24h with an injected clock (event 31 Oct 10:30 IST = 05:00Z)
const start = Date.parse("2026-10-31T05:00:00Z");
const r72 = await runDueEventChecks(new Date(start - 72 * 3_600_000));
const r24 = await runDueEventChecks(new Date(start - 24 * 3_600_000));
out["t72"] = r72.filter((r) => r.eventId === ev); out["t24"] = r24.filter((r) => r.eventId === ev);
out["checkHistory"] = (await listChecks(ev)).map((c) => `${c.trigger} ${c.status}`);

// dashboard with the restriction in force
const exe = "/opt/pw-browsers/" + readdirSync("/opt/pw-browsers").filter((d) => d.startsWith("chromium-"))[0] + "/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exe });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })).newPage();
// the plan belongs to an anonymous cookie; read it directly as that visitor
const anon = (await one<{ anon_id: string }>("SELECT anon_id FROM events WHERE id=$1", [ev]))!.anon_id;
await p.context().addCookies([{ name: "bmp_anon", value: anon, url: BASE }]);
const shot = async (name: string) => { await p.goto(`${BASE}/plan/${ev}`); await p.waitForLoadState("networkidle"); await p.waitForTimeout(800); writeFileSync(`${EV}/${name}.txt`, await p.locator("main").innerText()); await p.screenshot({ path: `${IMG}/${name}.png`, fullPage: true }); };
await shot("50-dashboard-restriction-in-force");

// "everything ticked" view: restriction removed, every actionable item marked done by the organiser
await query("UPDATE temporary_restrictions SET status='ARCHIVED' WHERE id=$1", [rid]);
const rules = await query<{ id: string }>("SELECT unnest(rule_ids) AS id FROM event_evaluations WHERE event_id=$1 ORDER BY evaluated_at DESC LIMIT 100", [ev]);
const latest = (await one<{ rule_ids: string[] }>("SELECT rule_ids FROM event_evaluations WHERE event_id=$1 ORDER BY evaluated_at DESC LIMIT 1", [ev]))!;
for (const id of latest.rule_ids) await query("INSERT INTO event_requirements (event_id, rule_id, done) VALUES ($1,$2,true) ON CONFLICT (event_id, rule_id) DO UPDATE SET done=true", [ev, id]);
await shot("51-dashboard-everything-ticked");
writeFileSync(`${EV}/52-restriction-and-schedule-facts.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close(); await pool().end();

}
main();
