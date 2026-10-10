// Fetches the canonical live-restriction feed ONCE and reports what the order parser makes of it. Run where the network can reach delhipolice.gov.in:
//   npm run probe:feed            (prints a report; saves the page text to tests/fixtures/live/notifications.txt so the test suite then holds the parser to the real page)
// Read-only: it records nothing in the database and creates no restriction.
import { mkdirSync, writeFileSync } from "node:fs";
import { loadEnv } from "./env";
loadEnv();
import { SOURCES } from "../data/delhi/corpus";

async function main() {
  const { defaultFetcher } = await import("../src/lib/knowledge");
  const { splitOrders, parseOrder } = await import("../src/lib/engine/order-parser");
  const feed = SOURCES.find((s) => s.feedRole === "LIVE_RESTRICTIONS");
  if (!feed?.url) throw new Error("No live-restriction feed in the Delhi corpus");
  console.log("Fetching", feed.url);
  let text: string;
  try { text = await defaultFetcher(feed.url); } catch (e) { console.error("FETCH FAILED:", (e as Error).message); process.exit(2); }
  mkdirSync("tests/fixtures/live", { recursive: true });
  writeFileSync("tests/fixtures/live/notifications.txt", text);
  const orders = splitOrders(text);
  console.log(`page text: ${text.length} chars; ${orders.length} order-like block(s) found`);
  for (const [i, block] of orders.entries()) {
    const o = parseOrder(block);
    console.log(`\\n#${i + 1} ${o.completeness}  issuer=${o.issuingAuthority.value ?? "?"}  date=${o.orderDate.value ?? "?"}  scope=${o.geographicScope.value ?? "?"}  ${o.effectiveFrom.value ?? "?"} -> ${o.effectiveTo.value ?? "?"}  missing=[${o.missing.join(", ")}]`);
  }
  if (orders.length === 0) console.log("\\nNo orders recognised: either the page lists none right now, or the parser needs calibrating to the real markup. Inspect tests/fixtures/live/notifications.txt.");
}
main();
