// Postgres mirror için NKR_RaporDurumOverride tablosunu dbo şemasında oluşturur.
// public şemasında lowercase legacy versiyon var ama CamelCase referansları
// çalışmıyor — bu yüzden dbo'da düzgün bir versiyon yarat.

import { createPool } from "@vercel/postgres";

const url = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
if (!url) {
  console.error(".env.local içinde UGD_POSTGRESS_URL/UGD_POSTGRES_URL yok.");
  process.exit(1);
}

const pool = createPool({ connectionString: url });

async function run() {
  console.log("▶  Bağlantı kontrol ediliyor…");

  const check = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'dbo' AND table_name = 'NKR_RaporDurumOverride'`
  );
  if (check.rowCount > 0) {
    console.log("✓ dbo.NKR_RaporDurumOverride zaten var, atlandı.");
  } else {
    await pool.query(`
      CREATE TABLE "dbo"."NKR_RaporDurumOverride" (
        "NkrID"        integer NOT NULL,
        "RaporFormati" varchar(100) NOT NULL,
        "Durum"        varchar(50)  NOT NULL,
        "UpdatedAt"    timestamp    NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("NkrID", "RaporFormati")
      )
    `);
    console.log("✓ dbo.NKR_RaporDurumOverride oluşturuldu.");
  }

  // public'teki legacy varsa veriyi taşı (varsa)
  const legacyCheck = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'nkr_rapordurumoverride'`
  );
  if (legacyCheck.rowCount > 0) {
    const dataRes = await pool.query(`SELECT * FROM public.nkr_rapordurumoverride`);
    if (dataRes.rowCount > 0) {
      console.log(`▶  public'ten ${dataRes.rowCount} satır taşınıyor…`);
      for (const r of dataRes.rows) {
        await pool.query(
          `INSERT INTO "dbo"."NKR_RaporDurumOverride" ("NkrID","RaporFormati","Durum","UpdatedAt")
           VALUES ($1,$2,$3,$4)
           ON CONFLICT ("NkrID","RaporFormati") DO UPDATE SET "Durum" = EXCLUDED."Durum", "UpdatedAt" = EXCLUDED."UpdatedAt"`,
          [r.nkrid, r.RaporFormati, r.Durum, r.UpdatedAt]
        );
      }
      console.log("✓ Veri taşındı.");
    } else {
      console.log("ℹ  public.nkr_rapordurumoverride boş.");
    }
  } else {
    console.log("ℹ  public.nkr_rapordurumoverride yok.");
  }

  await pool.end();
  console.log("✅  Tamam.");
}

run().catch((e) => {
  console.error("✗ Hata:", e.message);
  process.exit(2);
});
