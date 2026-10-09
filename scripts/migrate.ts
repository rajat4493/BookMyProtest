import { readFileSync, readdirSync } from "node:fs";
import { Pool } from "pg";
import { loadEnv } from "./env";
import { ensureDefaultTemplates } from "../src/lib/default-templates";

/** Applies db/schema.sql (V0 baseline, idempotent) then db/migrations/*.sql once each, tracked in schema_migrations. */
export async function migrate(url: string) {
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const files = ["db/schema.sql", ...readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort().map((f) => `db/migrations/${f}`)];
    for (const f of files) {
      if ((await pool.query("SELECT 1 FROM schema_migrations WHERE name=$1", [f])).rowCount) continue;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(readFileSync(f, "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
        await client.query("COMMIT");
        console.log("applied", f);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    }
    await ensureDefaultTemplates((q, p) => pool.query(q, p));
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  loadEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  migrate(process.env.DATABASE_URL).then(() => console.log("schema up to date"));
}
