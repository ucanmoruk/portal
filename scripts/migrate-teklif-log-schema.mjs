// Migration: teklif log/revizyon iş akışı için gerekli kolonları ekle.
//   • TeklifX1.OlusturanAd       — kayıt sırasında snapshot (denormalize)
//   • TeklifOnayLog.KullaniciID  — internal kullanıcı eylemleri için
//   • TeklifOnayLog.KullaniciAd  — internal kullanıcı adı snapshot
//
// PG translator ALTER TABLE'ı no-op yaptığından doğrudan @vercel/postgres üzerinden çalıştırıyoruz.

import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) process.env[m[1]] = m[2];
}

const pool = createPool({ connectionString: process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL });

async function findColumn(schema, table, column) {
    const r = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 AND column_name ILIKE $3`,
        [schema, table, column]
    );
    return r.rows[0]?.column_name || null;
}

async function findTable(table) {
    const r = await pool.query(
        `SELECT table_schema, table_name FROM information_schema.tables
         WHERE table_name ILIKE $1 AND table_schema IN ('dbo','public','cosmoroot')
         ORDER BY CASE table_schema WHEN 'dbo' THEN 1 WHEN 'public' THEN 2 ELSE 3 END
         LIMIT 1`,
        [table]
    );
    return r.rows[0] || null;
}

try {
    // 1) TeklifX1.OlusturanAd
    {
        const t = await findTable("TeklifX1");
        if (!t) {
            console.log("⚠️  TeklifX1 bulunamadı, atlanıyor.");
        } else {
            const existing = await findColumn(t.table_schema, t.table_name, "OlusturanAd");
            if (existing) {
                console.log(`✓  ${t.table_schema}.${t.table_name}.${existing} zaten var.`);
            } else {
                await pool.query(`ALTER TABLE "${t.table_schema}"."${t.table_name}" ADD COLUMN "OlusturanAd" VARCHAR(255) NULL`);
                console.log(`✅ ${t.table_schema}.${t.table_name} → OlusturanAd VARCHAR(255) eklendi.`);
            }
        }
    }

    // 2) TeklifOnayLog.KullaniciID + KullaniciAd
    {
        const t = await findTable("TeklifOnayLog");
        if (!t) {
            console.log("⚠️  TeklifOnayLog henüz oluşmamış (ilk kullanımda kendi kendine oluşacak).");
        } else {
            for (const [col, type] of [["KullaniciID", "INTEGER NULL"], ["KullaniciAd", "VARCHAR(255) NULL"]]) {
                const existing = await findColumn(t.table_schema, t.table_name, col);
                if (existing) {
                    console.log(`✓  ${t.table_schema}.${t.table_name}.${existing} zaten var.`);
                } else {
                    await pool.query(`ALTER TABLE "${t.table_schema}"."${t.table_name}" ADD COLUMN "${col}" ${type}`);
                    console.log(`✅ ${t.table_schema}.${t.table_name} → ${col} ${type} eklendi.`);
                }
            }
        }
    }

    console.log("\nBitti.");
} catch (e) {
    console.error("Hata:", e);
    process.exit(1);
} finally {
    await pool.end();
}
