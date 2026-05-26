import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const pool = createPool({ connectionString: process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL });

// Tablo adı arama — "formul" geçen tüm tablolar
const r0 = await pool.query(`
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_name ILIKE '%formul%' OR table_name ILIKE '%Formul%'
  ORDER BY table_schema, table_name
`);
console.log("Formul ile ilgili tablolar:");
r0.rows.forEach(r => console.log(`  ${r.table_schema}.${r.table_name}`));

const r1 = await pool.query(`
  SELECT table_schema, column_name, data_type
  FROM information_schema.columns
  WHERE table_name ILIKE '%formul%' AND table_schema IN ('dbo','public','cosmoroot')
  ORDER BY table_schema, ordinal_position
`);
console.log("\nFormul kolon yapısı:");
r1.rows.forEach(r => console.log(`  ${r.table_schema}: ${r.column_name}: ${r.data_type}`));

const r2 = await pool.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'rUGDListe' AND table_schema IN ('dbo','public')
  ORDER BY ordinal_position
`);
console.log("\nrUGDListe columns:");
r2.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

// Empty UrunID kontrolü
try {
  const r3 = await pool.query(`SELECT COUNT(*) AS c FROM dbo."rUGDFormul" WHERE "UrunID"::text = '' OR "UrunID" IS NULL`);
  console.log(`\nrUGDFormul empty/null UrunID count: ${r3.rows[0].c}`);
} catch (e) {
  console.log("\nrUGDFormul empty UrunID check error:", e.message);
}

try {
  const r4 = await pool.query(`SELECT COUNT(*) AS c FROM dbo."rUGDListe" WHERE "BirimID"::text = ''`);
  console.log(`rUGDListe empty BirimID count: ${r4.rows[0].c}`);
} catch (e) {
  console.log("rUGDListe empty BirimID check error:", e.message);
}

// rUGDListe.ID typeof first row
try {
  const r5 = await pool.query(`SELECT "ID" FROM dbo."rUGDListe" LIMIT 1`);
  console.log(`\nrUGDListe.ID first row:`, r5.rows[0]?.ID, "typeof:", typeof r5.rows[0]?.ID);
} catch (e) {}

await pool.end();
