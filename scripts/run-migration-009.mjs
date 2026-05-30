// Postgres mirror: NKR_RaporOnay'a dijital imza (tamper-proof) alanlarını ekler.
// MSSQL tarafı için migrations/009-add-rapor-imza.sql çalıştırılır.
import { createPool } from "@vercel/postgres";

const url = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
if (!url) {
  console.error(".env.local içinde UGD_POSTGRESS_URL/UGD_POSTGRES_URL yok.");
  process.exit(1);
}

const pool = createPool({ connectionString: url });

async function run() {
  await pool.query(`ALTER TABLE "dbo"."NKR_RaporOnay" ADD COLUMN IF NOT EXISTS "ImzaHash"   varchar(128) NULL`);
  await pool.query(`ALTER TABLE "dbo"."NKR_RaporOnay" ADD COLUMN IF NOT EXISTS "ImzaTarihi" timestamp    NULL`);
  await pool.query(`ALTER TABLE "dbo"."NKR_RaporOnay" ADD COLUMN IF NOT EXISTS "ImzaSurum"  varchar(10)  NULL`);
  console.log("✓ dbo.NKR_RaporOnay imza alanları eklendi (Postgres mirror).");
  await pool.end();
  console.log("✅  Tamam.");
}

run().catch((e) => { console.error("✗ Hata:", e.message); process.exit(2); });
