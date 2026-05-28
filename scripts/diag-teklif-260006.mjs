// ROT260006/1 teklifinin log durumunu kontrol et.
import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
}

const pool = createPool({ connectionString: process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL });

const r1 = await pool.query(`
    SELECT "ID", "TeklifNo", "RevNo", "OlusturanAd", "Durum", "TeklifDurum"
    FROM dbo."TeklifX1"
    WHERE "TeklifNo" = 260006
    ORDER BY "RevNo"
`);
console.log(`TeklifNo=260006 satırları (${r1.rows.length}):`);
r1.rows.forEach(r => console.log(`  ID=${r.ID}  Rev=${r.RevNo}  Oluşturan=${r.OlusturanAd || '-'}  Durum=${r.Durum}/${r.TeklifDurum}`));

const ids = r1.rows.map(r => r.ID);
if (ids.length === 0) { console.log("Hiç satır yok."); await pool.end(); process.exit(0); }

const r2 = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'teklifonaylog' AND table_schema = 'public'
    ORDER BY ordinal_position
`);
console.log(`\nteklifonaylog kolonları:`);
r2.rows.forEach(r => console.log(`  - ${r.column_name}`));

const r3 = await pool.query(`SELECT * FROM public.teklifonaylog WHERE teklifid = ANY($1::int[]) ORDER BY id DESC`, [ids]);
console.log(`\nLog satırları (${r3.rows.length}):`);
r3.rows.forEach(r => console.log(`  ${JSON.stringify(r)}`));

await pool.end();
