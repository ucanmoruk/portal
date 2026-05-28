// teklifonaylog'daki tüm kayıtları (en son 30) listele.
import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
}

const pool = createPool({ connectionString: process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL });

const r1 = await pool.query(`SELECT COUNT(*) AS n FROM public.teklifonaylog`);
console.log(`Toplam log satırı: ${r1.rows[0].n}`);

const r2 = await pool.query(`
    SELECT "ID", "TeklifID", "TeklifNo", aksiyon, "Aciklama", kullaniciad, musteriad, "Tarih"
    FROM public.teklifonaylog
    ORDER BY "ID" DESC
    LIMIT 20
`);
console.log(`\nSon ${r2.rows.length} log satırı:`);
r2.rows.forEach(r => console.log(
    `  ID=${r.ID} TeklifID=${r.TeklifID} TeklifNo=${r.TeklifNo} | ${r.aksiyon} | Yapan=${r.kullaniciad || r.musteriad || '-'} | Açıklama=${(r.Aciklama || '').slice(0, 60)} | ${r.Tarih}`
));

await pool.end();
