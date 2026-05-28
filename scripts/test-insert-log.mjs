// lib/teklifLog'un yapacağı INSERT'i taklit ederek test et.
// Bu translator'ı bypass eder — doğrudan pool.query ile.
// Hedef: lowercase kolon adlarıyla insert başarılı mı?

import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
}

const pool = createPool({ connectionString: process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL });

// Translator'ın çıktısını simüle et: TeklifID/TeklifNo/Aciklama PascalCase quoted,
// aksiyon/ipadresi/kullaniciid/kullaniciad lowercase unquoted.
const sql = `
    INSERT INTO public.teklifonaylog
        ("TeklifID", "TeklifNo", aksiyon, "Aciklama", ipadresi, kullaniciid, kullaniciad)
    VALUES
        ($1, $2, $3, $4, $5, $6, $7)
    RETURNING "ID"
`;

try {
    const r = await pool.query(sql, [99999, "TEST/99", "Düzeltildi", "Diagnostic insert", "127.0.0.1", 1, "Test User"]);
    console.log(`✅ INSERT OK, ID=${r.rows[0].ID}`);

    // Sil
    await pool.query(`DELETE FROM public.teklifonaylog WHERE "ID" = $1`, [r.rows[0].ID]);
    console.log("Test satırı silindi.");
} catch (e) {
    console.error("❌ INSERT fail:", e.message);
    process.exit(1);
} finally {
    await pool.end();
}
