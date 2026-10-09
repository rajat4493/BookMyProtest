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
