import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { loadEnv } from "./env";

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: url });
pool
  .query(readFileSync("db/schema.sql", "utf8"))
  .then(() => console.log("schema applied"))
  .finally(() => pool.end());
