// Postgres mirror için NKR_RaporOnay tablosunu dbo şemasında oluşturur.
import { createPool } from "@vercel/postgres";

const url = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
if (!url) {
  console.error(".env.local içinde UGD_POSTGRESS_URL/UGD_POSTGRES_URL yok.");
  process.exit(1);
}

const pool = createPool({ connectionString: url });

async function run() {
  const check = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'dbo' AND table_name = 'NKR_RaporOnay'`
  );
  if (check.rowCount > 0) {
    console.log("✓ dbo.NKR_RaporOnay zaten var, atlandı.");
  } else {
    await pool.query(`
      CREATE TABLE "dbo"."NKR_RaporOnay" (
        "ID"           serial PRIMARY KEY,
        "NkrID"        integer NOT NULL,
        "RaporFormati" varchar(80) NOT NULL,
        "KarekodToken" varchar(48) NOT NULL,
        "Durum"        varchar(40) NOT NULL DEFAULT 'Onaylandı',
        "OnaylayanID"  integer NULL,
        "OnayTarihi"   timestamp NOT NULL DEFAULT NOW(),
        "YayinTarihi"  timestamp NULL,
        "YayinUrl"     varchar(500) NULL,
        "Notlar"       varchar(500) NULL,
        CONSTRAINT "UQ_NKR_RaporOnay"        UNIQUE ("NkrID", "RaporFormati"),
        CONSTRAINT "UQ_NKR_RaporOnay_Token"  UNIQUE ("KarekodToken")
      )
    `);
    await pool.query(`CREATE INDEX "IX_NKR_RaporOnay_Token" ON "dbo"."NKR_RaporOnay" ("KarekodToken")`);
    await pool.query(`CREATE INDEX "IX_NKR_RaporOnay_Nkr"   ON "dbo"."NKR_RaporOnay" ("NkrID")`);
    console.log("✓ dbo.NKR_RaporOnay oluşturuldu.");
  }
  await pool.end();
  console.log("✅  Tamam.");
}

run().catch((e) => { console.error("✗ Hata:", e.message); process.exit(2); });
