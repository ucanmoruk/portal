// kullaniciid / kullaniciad lowercase kolonlarını PascalCase'e geri çevir.
// Translator metadata'sında "KullaniciID" zaten dbo tablolarında olduğu için
// quote edilmiş halde aranıyor → PG'de de PascalCase olması gerek.

import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
}

const pool = createPool({ connectionString: process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL });

async function colExists(name) {
    const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name='teklifonaylog' AND table_schema='public' AND column_name=$1`,
        [name]
    );
    return r.rows.length > 0;
}

try {
    for (const [from, to] of [["kullaniciid", "KullaniciID"], ["kullaniciad", "KullaniciAd"]]) {
        if (!(await colExists(from))) {
            if (await colExists(to)) {
                console.log(`✓ ${to} zaten PascalCase.`);
            } else {
                console.log(`⚠️  Ne ${from} ne ${to} bulunamadı, atlanıyor.`);
            }
            continue;
        }
        await pool.query(`ALTER TABLE public.teklifonaylog RENAME COLUMN ${from} TO "${to}"`);
        console.log(`✅ public.teklifonaylog ${from} → "${to}" olarak yeniden adlandırıldı.`);
    }
    console.log("\nBitti.");
} catch (e) {
    console.error("Hata:", e);
    process.exit(1);
} finally {
    await pool.end();
}
