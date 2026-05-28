// lib/db.ts translator'ın metadata cache'inde KullaniciID veya KullaniciAd
// kolonları var mı kontrol et. Varsa translator INSERT'te quote edip yine
// PascalCase olarak arar → public.teklifonaylog'daki lowercase kolonla
// eşleşmez → fail.

import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
}

const pool = createPool({ connectionString: process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL });

// Translator'ın taradığı şemalar: dbo, cosmoroot
const r = await pool.query(`
    SELECT DISTINCT column_name
    FROM information_schema.columns
    WHERE table_schema IN ('dbo', 'cosmoroot')
      AND (column_name ILIKE '%kullanici%' OR column_name ILIKE '%aksiyon%' OR column_name ILIKE '%ipadresi%')
    ORDER BY column_name
`);
console.log("dbo/cosmoroot'ta translator'ın quotelama yapabileceği kolonlar:");
r.rows.forEach(row => console.log(`  • ${row.column_name}`));

// Tüm public.teklifonaylog kolonları
const r2 = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teklifonaylog'
    ORDER BY ordinal_position
`);
console.log("\npublic.teklifonaylog kolonları:");
r2.rows.forEach(row => console.log(`  • ${row.column_name} (${row.data_type})`));

await pool.end();
