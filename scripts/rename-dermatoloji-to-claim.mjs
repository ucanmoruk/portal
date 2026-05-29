// StokAnalizListesi.RaporFormati 'Dermatoloji' → 'Claim'
// Comma-separated formatlar için tek tek geçirir: "Genel,Dermatoloji" → "Genel,Claim"
import { createPool } from "@vercel/postgres";

const url = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
if (!url) { console.error("Env yok"); process.exit(1); }
const pool = createPool({ connectionString: url });

async function run() {
  // 1) StokAnalizListesi: comma-separated içinde Dermatoloji geçenleri Claim ile değiştir
  const r1 = await pool.query(
    `UPDATE "dbo"."StokAnalizListesi"
     SET "RaporFormati" = (
       SELECT string_agg(
         CASE WHEN trim(part) = 'Dermatoloji' THEN 'Claim' ELSE trim(part) END,
         ','
       )
       FROM regexp_split_to_table("RaporFormati", ',') AS part
     )
     WHERE "RaporFormati" LIKE '%Dermatoloji%'`
  );
  console.log(`StokAnalizListesi güncellendi: ${r1.rowCount} satır`);

  // 2) NKR_LabKabul (varsa)
  const r2 = await pool.query(
    `UPDATE "dbo"."NKR_LabKabul" SET "RaporFormati" = 'Claim' WHERE "RaporFormati" = 'Dermatoloji'`
  ).catch((e) => { console.log("  NKR_LabKabul:", e.message); return { rowCount: 0 }; });
  console.log(`NKR_LabKabul güncellendi: ${r2.rowCount ?? 0}`);

  // 3) NKR_RaporOnay (varsa)
  const r3 = await pool.query(
    `UPDATE "dbo"."NKR_RaporOnay" SET "RaporFormati" = 'Claim' WHERE "RaporFormati" = 'Dermatoloji'`
  ).catch((e) => { console.log("  NKR_RaporOnay:", e.message); return { rowCount: 0 }; });
  console.log(`NKR_RaporOnay güncellendi: ${r3.rowCount ?? 0}`);

  // 4) NKR_RaporDurumOverride (varsa)
  const r4 = await pool.query(
    `UPDATE "dbo"."NKR_RaporDurumOverride" SET "RaporFormati" = 'Claim' WHERE "RaporFormati" = 'Dermatoloji'`
  ).catch((e) => { console.log("  NKR_RaporDurumOverride:", e.message); return { rowCount: 0 }; });
  console.log(`NKR_RaporDurumOverride güncellendi: ${r4.rowCount ?? 0}`);

  await pool.end();
  console.log("✅ Tamam.");
}

run().catch(e => { console.error("Hata:", e.message); process.exit(2); });
