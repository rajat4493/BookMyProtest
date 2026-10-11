// Release-candidate check for the four public-launch blockers. READ-ONLY: it observes, it never fixes, publishes, verifies or flips a flag.
//   npm run rc:check                 # against DATABASE_URL (point it at the staging/production-candidate database)
//   npm run rc:check -- --with-tests # also run the unit/DB test suite
// Exit code 0 only when every gate is PASS. A gate that needs someone else's action reports BLOCKED (owner / counsel); nothing here works around it.
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { loadEnv } from "./env";
loadEnv();

type Status = "PASS" | "BLOCKED:OWNER" | "BLOCKED:COUNSEL" | "FAIL:ENGINEERING";
const results: { gate: string; status: Status; detail: string[] }[] = [];
const gate = (g: string, status: Status, detail: string[]) => { results.push({ gate: g, status, detail }); };
const sh = (c: string) => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

async function main() {
  const { query, one, pool } = await import("../src/lib/db");
  const sha = sh("git rev-parse HEAD"), dirty = sh("git status --porcelain");
  console.log(`Release candidate: ${sha || "(no git)"}${dirty ? "  [WORKING TREE NOT CLEAN: this is not a releasable build]" : ""}`);
  console.log(`Database: ${(process.env.DATABASE_URL ?? "").replace(/:\/\/[^@]*@/, "://…@")}\n`);

  // 0. Engineering baseline (only when asked: it takes a minute)
  if (process.argv.includes("--with-tests")) {
    const r = spawnSync("npx", ["vitest", "run"], { encoding: "utf8" });
    const tail = (r.stdout + r.stderr).split("\n").filter((l) => /Test Files|Tests /.test(l)).join(" | ");
    gate("0 Engineering baseline", r.status === 0 ? "PASS" : "FAIL:ENGINEERING", [tail || "vitest produced no summary"]);
  } else gate("0 Engineering baseline", "PASS", ["not run (pass --with-tests to run the suite)"]);

  // 1. Real notifications-feed probe (live-feed evidence class: official feed URL, SOURCE_VERIFIED, PARSER_REAL_PAGE_VERIFIED, a successful retrieval; plus the saved real page)
  {
    const { feedEvidence } = await import("../src/lib/rule-verification");
    const d: string[] = []; let ok = true;
    const feed = await one<{ id: string }>("SELECT id FROM sources WHERE feed_role='LIVE_RESTRICTIONS' AND active ORDER BY created_at LIMIT 1");
    const fixture = "tests/fixtures/live/notifications.txt";
    if (!feed) { ok = false; d.push("no live-restriction feed source in this database"); }
    else { const ev = await feedEvidence(feed.id); for (const m of ev?.missing ?? []) { ok = false; d.push(`missing ${m}`); } for (const n of ev?.notes.filter((x) => /^latest/.test(x)) ?? []) d.push(n); }
    if (!existsSync(fixture) || readFileSync(fixture, "utf8").trim().length < 200) { ok = false; d.push(`${fixture} is missing or empty: \`npm run probe:feed\` has not been run from a network that can reach the site`); }
    gate("1 Real notifications-feed probe", ok ? "PASS" : "BLOCKED:OWNER", d.length ? d : ["fixture present, feed evidence complete"]);
  }

  // 2. Delhi rules: every rule not held for review is ACTIVE, and every ACTIVE one passes the evidence gate FOR ITS OWN SOURCE TYPE
  {
    const { verificationReport, EVIDENCE_CLASS_LABEL } = await import("../src/lib/rule-verification");
    const { RULES } = await import("../data/delhi/corpus");
    const held = new Set(RULES.filter((r) => r.holdForReview).map((r) => r.family));
    const report = await verificationReport("DEL-");
    const expected = RULES.filter((r) => !r.holdForReview).map((r) => r.family);
    const d: string[] = []; let ok = true;
    if (!report.length) { ok = false; d.push("no Delhi rules loaded in this database (`npm run db:load-delhi`)"); }
    const active = new Set(report.filter((r) => r.status === "ACTIVE").map((r) => r.family));
    const notActive = expected.filter((f) => !active.has(f));
    if (notActive.length) { ok = false; d.push(`${notActive.length} of ${expected.length} launch rules are not ACTIVE`); }
    const unverified = report.filter((r) => r.status === "ACTIVE" && !r.ready);
    if (unverified.length) ok = false;
    const heldActive = report.filter((r) => held.has(r.family) && r.status === "ACTIVE");
    if (heldActive.length) { ok = false; d.push(`held-for-review rule(s) are ACTIVE: ${heldActive.map((r) => r.family).join(", ")}`); }
    const live = await one<{ supported: boolean }>("SELECT supported FROM jurisdictions WHERE name ILIKE 'New Delhi District' LIMIT 1");
    d.push(`New Delhi District selectable in the planner: ${live?.supported ? "yes" : "no"} (going live is a separate owner decision this check does not make)`);
    const open = report.filter((r) => !held.has(r.family) && !(r.status === "ACTIVE" && r.ready));
    for (const cls of ["CLAUSE_INSTRUMENT", "OFFICIAL_WEBPAGE", "LIVE_FEED"] as const) {
      const rs = open.filter((r) => r.evidenceClass === cls);
      if (rs.length) d.push(`${EVIDENCE_CLASS_LABEL[cls]}: ${rs.length} rule(s) missing evidence: ${rs.slice(0, 4).map((r) => r.family).join(", ")}${rs.length > 4 ? "…" : ""}`);
    }
    const noClass = open.filter((r) => !r.evidenceClass);
    if (noClass.length) d.push(`no official source at all: ${noClass.map((r) => r.family).join(", ")}`);
    for (const f of ["DEL-TRAFFIC-001", "DEL-LIVE-001"]) { const r = report.find((x) => x.family === f); if (r && !r.ready) d.push(`${f} [${r.status}] still missing: ${r.missing.map((m) => m.replace(/^[^:]+: missing /, "")).join("; ")}`); }
    d.push("run `npm run delhi:verify-gate` for every rule's exact missing evidence");
    gate("2 Delhi rules verified and published", ok ? "PASS" : "BLOCKED:OWNER", d);
  }

  // 3. Email delivery: configured AND proven by a real delivery recorded by the provider path
  {
    const d: string[] = []; let ok = true;
    for (const k of ["RESEND_API_KEY", "MAIL_FROM", "APP_URL"]) if (!process.env[k]) { ok = false; d.push(`${k} is not set`); }
    if (process.env.APP_URL && !/^https:\/\//.test(process.env.APP_URL)) { ok = false; d.push("APP_URL must be https:// for a public build (confirmation links are built from it)"); }
    if (!process.env.TRUSTED_PROXY_HOPS) { ok = false; d.push("TRUSTED_PROXY_HOPS is not set explicitly: rate limits key on the client address, so it must match the real number of proxies"); }
    const sent = await one<{ n: number }>("SELECT count(*)::int AS n FROM email_outbox WHERE kind='EMAIL_VERIFICATION' AND status='SENT'");
    const failed = await one<{ n: number }>("SELECT count(*)::int AS n FROM email_outbox WHERE status='FAILED' AND created_at > now() - interval '7 days'");
    if (!sent?.n) { ok = false; d.push("no EMAIL_VERIFICATION message has ever been delivered by the provider in this database (do one real sign-up on the candidate and receive the email)"); }
    if (failed?.n) { ok = false; d.push(`${failed.n} message(s) FAILED in the last 7 days`); }
    gate("3 Email delivery", ok ? "PASS" : "BLOCKED:OWNER", d.length ? d : ["provider configured; delivery recorded"]);
  }

  // 4. Legal review: the draft banner may only be removed after counsel's sign-off, by a person
  {
    const draftBanner = existsSync("src/components/legal-draft.tsx");
    const pages = ["terms", "privacy", "platform-guidelines"].map((p) => `src/app/${p}/page.tsx`).filter((f) => existsSync(f) && /LegalDraft/.test(readFileSync(f, "utf8")));
    const d: string[] = [];
    if (draftBanner && pages.length) d.push(`${pages.length} of 3 pages still render the "Legal review is required before public launch" draft banner: ${pages.map((p) => p.split("/")[2]).join(", ")}`);
    gate("4 Legal review", pages.length ? "BLOCKED:COUNSEL" : "PASS", d.length ? d : ["no draft banner remains (confirm the counsel sign-off reference is filed in docs/acceptance/PUBLIC-LAUNCH-READINESS.md)"]);
  }

  await pool().end();
  const mark: Record<Status, string> = { PASS: "PASS ", "BLOCKED:OWNER": "BLOCKED (owner) ", "BLOCKED:COUNSEL": "BLOCKED (counsel) ", "FAIL:ENGINEERING": "FAIL (engineering) " };
  for (const r of results) { console.log(`${mark[r.status]} ${r.gate}`); for (const l of r.detail) console.log(`      - ${l}`); }
  const all = results.every((r) => r.status === "PASS");
  console.log(`\n${all ? "ALL FOUR GATES PASS: eligible for the public-launch decision (still a human decision)." : "NOT READY FOR PUBLIC LAUNCH: " + results.filter((r) => r.status !== "PASS").map((r) => r.gate.split(" ")[0]).join(", ") + " open."}`);
  process.exit(all ? 0 : results.some((r) => r.status === "FAIL:ENGINEERING") ? 1 : 2);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
