import { Pool, type QueryResultRow } from "pg";

const globalForPg = globalThis as unknown as { __bmpPool?: Pool };

export function pool(): Pool {
  if (!globalForPg.__bmpPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalForPg.__bmpPool = new Pool({ connectionString, max: 10 });
  }
  return globalForPg.__bmpPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}

export type Q = <T extends QueryResultRow = any>(text: string, params?: unknown[]) => Promise<T[]>;

/** Runs `fn` in a transaction. All writes that must stay consistent (publish, supersede, change detection) use this. */
export async function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const q: Q = async (text, params = []) => (await client.query(text, params as any[])).rows as any;
    const out = await fn(q);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
