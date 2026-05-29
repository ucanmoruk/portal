// NumuneX1 tablosuna SonucKayitTarihi kolonu ekler (Postgres mirror).
// Bu kolon: NULL = kullanıcı henüz "Kaydet" basmadı (Sonuc auto-fill ile dolu olabilir)
//           Dolu = kullanıcı Kaydet bastı, sonuç "onaylandı"
import { createPool } from "@vercel/postgres";

const url = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
if (!url) { console.error("Env yok"); process.exit(1); }
const pool = createPool({ connectionString: url });

async function run() {
  const c = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'dbo' AND table_name = 'NumuneX1' AND column_name = 'SonucKayitTarihi'`
  );
  if (c.rowCount > 0) {
    console.log("✓ NumuneX1.SonucKayitTarihi zaten var, atlandı.");
  } else {
    await pool.query(`ALTER TABLE "dbo"."NumuneX1" ADD COLUMN "SonucKayitTarihi" timestamp NULL`);
    console.log("✓ NumuneX1.SonucKayitTarihi eklendi.");
  }
  await pool.end();
  console.log("✅ Tamam.");
}
run().catch(e => { console.error("Hata:", e.message); process.exit(2); });
