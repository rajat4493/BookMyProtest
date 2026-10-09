import { Pool } from "pg";
import { loadEnv } from "./env";
import { SEED_RULES, VENDOR_CATEGORIES } from "../src/lib/seed-data";
import { hashPassword } from "../src/lib/password";
import { ensureDefaultTemplates } from "../src/lib/default-templates";

loadEnv();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  for (const [i, [slug, label]] of VENDOR_CATEGORIES.entries()) {
    await pool.query(
      "INSERT INTO vendor_categories (slug,label,sort) VALUES ($1,$2,$3) ON CONFLICT (slug) DO UPDATE SET label=$2, sort=$3",
      [slug, label, i],
    );
  }

  await ensureDefaultTemplates((q, p) => pool.query(q, p));
  const existing = await pool.query("SELECT 1 FROM jurisdictions WHERE is_dev_seed LIMIT 1");
  if (existing.rowCount === 0) {
    const country = (await pool.query("INSERT INTO jurisdictions (level,name,supported,is_dev_seed) VALUES ('country','India',false,true) RETURNING id")).rows[0].id;
    const state = (await pool.query("INSERT INTO jurisdictions (parent_id,level,name,supported,is_dev_seed) VALUES ($1,'state','Karnataka',false,true) RETURNING id", [country])).rows[0].id;
    const city = (await pool.query("INSERT INTO jurisdictions (parent_id,level,name,supported,is_dev_seed) VALUES ($1,'city','Bengaluru',true,true) RETURNING id", [state])).rows[0].id;
    await pool.query("INSERT INTO authorities (jurisdiction_id,name) VALUES ($1,'Local police authority (to be confirmed)')", [city]);
    for (const r of SEED_RULES) {
      await pool.query(
        `INSERT INTO rules (rule_family_id, version, rule_status, jurisdiction_id, assembly_type, title, description, category, level, else_level, severity, condition, complete_when,
           deadline_definition, vendor_category, needs_review, confidence, rule_owner, admin_notes, sort)
         VALUES ($1,1,'ACTIVE',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,'low','unassigned','DEV SEED — unverified placeholder. Replace with a sourced rule.',$14) RETURNING id`,
        [`DEV-${String(r.sort).padStart(3, "0")}`, city, r.assemblyType ?? "any", r.title, r.description, r.category, r.level, r.elseLevel ?? null, r.severity,
          JSON.stringify(r.condition ?? { all: [], any: [] }), r.completeWhen ? JSON.stringify(r.completeWhen) : null,
          JSON.stringify(r.deadlineDaysBefore != null ? { kind: "STRUCTURED", minimumDaysBeforeEvent: r.deadlineDaysBefore, dayType: "CALENDAR", specialNotes: r.deadlineNote ?? "" } : { kind: "UNKNOWN", specialNotes: r.deadlineNote ?? "" }),
          r.vendorCategory ?? null, r.sort],
      ).then(async (res) => {
        for (const d of r.requiredDocuments ?? []) await pool.query("INSERT INTO rule_documents (rule_id, name, required) VALUES ($1,$2,true)", [res.rows[0].id, d]);
      });
    }
    console.log(`seeded dev jurisdiction + ${SEED_RULES.length} rules`);
  } else console.log("dev jurisdiction already present");

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    await pool.query(
      "INSERT INTO users (email,password_hash,role) VALUES ($1,$2,'admin') ON CONFLICT (email) DO UPDATE SET role='admin'",
      [process.env.ADMIN_EMAIL.toLowerCase(), await hashPassword(process.env.ADMIN_PASSWORD)],
    );
    console.log("admin user ensured");
  }
}
main().finally(() => pool.end());
