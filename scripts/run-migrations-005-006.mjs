// Postgres mirror için migration 005 + 006 çalıştırıcı
// - 005: StokAnalizListesi'ne BolumID kolonu ekler
// - 006: NKR_LabKabul tablosunu oluşturur
//
// Şema "dbo" altında (lib/db.ts quoteKnownIdentifiers ile aynı).

import { createPool } from "@vercel/postgres";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
if (!url) {
  console.error(".env.local içinde UGD_POSTGRESS_URL veya UGD_POSTGRES_URL yok.");
  process.exit(1);
}

const pool = createPool({ connectionString: url });

async function findTableSchema(table) {
  const r = await pool.query(
    `SELECT table_schema FROM information_schema.tables
     WHERE table_name = $1 AND table_schema IN ('dbo','cosmoroot','public')
     ORDER BY CASE table_schema WHEN 'dbo' THEN 0 WHEN 'cosmoroot' THEN 1 ELSE 2 END
     LIMIT 1`,
    [table]
  );
  return r.rows[0]?.table_schema || null;
}

async function columnExists(schema, table, column) {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
    [schema, table, column]
  );
  return r.rowCount > 0;
}

async function tableExists(table) {
  const schema = await findTableSchema(table);
  return schema != null;
}

async function run() {
  console.log("▶  Postgres'e bağlanılıyor…");

  // ─────────────── 005: BolumID ───────────────
  const stokSchema = await findTableSchema("StokAnalizListesi");
  if (!stokSchema) {
    console.error("✗ StokAnalizListesi tablosu bulunamadı. (Mirror eksik olabilir)");
    process.exit(2);
  }
  console.log(`  StokAnalizListesi şeması: ${stokSchema}`);

  const hasBolum = await columnExists(stokSchema, "StokAnalizListesi", "BolumID");
  if (hasBolum) {
    console.log("✓ 005: BolumID kolonu zaten var, atlandı.");
  } else {
    await pool.query(`ALTER TABLE "${stokSchema}"."StokAnalizListesi" ADD COLUMN "BolumID" integer NULL`);
    console.log("✓ 005: StokAnalizListesi.BolumID eklendi.");
  }

  // ─────────────── 006: NKR_LabKabul ───────────────
  const targetSchema = stokSchema; // aynı şemada oluştur
  const exists = await tableExists("NKR_LabKabul");
  if (exists) {
    console.log("✓ 006: NKR_LabKabul tablosu zaten var, atlandı.");
  } else {
    await pool.query(`
      CREATE TABLE "${targetSchema}"."NKR_LabKabul" (
        "ID"           serial PRIMARY KEY,
        "NkrID"        integer NOT NULL,
        "RaporFormati" varchar(80) NOT NULL,
        "BolumID"      integer NULL,
        "KabulEdenID"  integer NULL,
        "KabulTarihi"  timestamp NOT NULL DEFAULT NOW(),
        "Notlar"       varchar(500) NULL,
        CONSTRAINT "UQ_NKR_LabKabul" UNIQUE ("NkrID", "RaporFormati")
      )
    `);
    await pool.query(`CREATE INDEX "IX_NKR_LabKabul_Nkr" ON "${targetSchema}"."NKR_LabKabul" ("NkrID")`);
    console.log(`✓ 006: NKR_LabKabul tablosu (${targetSchema} şemasında) oluşturuldu.`);
  }

  // Doğrulama
  console.log("\nDoğrulama:");
  const col = await pool.query(
    `SELECT data_type, is_nullable FROM information_schema.columns
     WHERE table_schema=$1 AND table_name='StokAnalizListesi' AND column_name='BolumID'`,
    [stokSchema]
  );
  console.log(`  StokAnalizListesi.BolumID → ${col.rows[0]?.data_type || "YOK"} (nullable: ${col.rows[0]?.is_nullable || "?"})`);

  const tbl = await pool.query(
    `SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_name='NKR_LabKabul'`
  );
  console.log(`  NKR_LabKabul tablo sayısı → ${tbl.rows[0]?.c}`);

  await pool.end();
  console.log("\n✅  Migration tamam.");
}

run().catch((e) => {
  console.error("✗ Hata:", e.message);
  process.exit(3);
});
