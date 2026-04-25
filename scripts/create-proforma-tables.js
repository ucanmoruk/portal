const fs = require("fs");
const { createPool } = require("@vercel/postgres");

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const connectionString = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
if (!connectionString) throw new Error("UGD_POSTGRESS_URL or UGD_POSTGRES_URL is required.");

const statements = [
  `CREATE TABLE IF NOT EXISTS cosmoroot."ProformaX1" (
    "ID" SERIAL PRIMARY KEY,
    "ProformaNo" TEXT NOT NULL,
    "EvrakNo" TEXT NULL,
    "TeklifID" INTEGER NULL,
    "FirmaID" INTEGER NULL,
    "Tarih" TIMESTAMP NOT NULL DEFAULT NOW(),
    "Durum" TEXT NOT NULL DEFAULT 'Taslak',
    "KdvOran" NUMERIC(8,2) NOT NULL DEFAULT 20,
    "GenelIskonto" NUMERIC(8,2) NOT NULL DEFAULT 0,
    "AraToplam" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "IskontoTutar" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "KdvTutar" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "GenelToplam" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "Notlar" TEXT NULL,
    "KID" INTEGER NULL,
    "SilindiMi" BOOLEAN NOT NULL DEFAULT FALSE
  )`,
  `CREATE TABLE IF NOT EXISTS cosmoroot."ProformaX2" (
    "ID" SERIAL PRIMARY KEY,
    "ProformaID" INTEGER NOT NULL REFERENCES cosmoroot."ProformaX1"("ID") ON DELETE CASCADE,
    "HizmetID" INTEGER NULL,
    "HizmetKodu" TEXT NULL,
    "HizmetAdi" TEXT NOT NULL,
    "RaporNoListesi" TEXT NULL,
    "NumuneListesi" TEXT NULL,
    "Adet" NUMERIC(18,2) NOT NULL DEFAULT 1,
    "BirimFiyat" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "ParaBirimi" TEXT NOT NULL DEFAULT 'TRY',
    "Iskonto" NUMERIC(8,2) NOT NULL DEFAULT 0,
    "Tutar" NUMERIC(18,2) NOT NULL DEFAULT 0,
    "Kaynak" TEXT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_proformax1_silindi_id ON cosmoroot."ProformaX1" ("SilindiMi", "ID" DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_proformax1_evrak ON cosmoroot."ProformaX1" ("EvrakNo")`,
  `CREATE INDEX IF NOT EXISTS idx_proformax1_firma ON cosmoroot."ProformaX1" ("FirmaID")`,
  `CREATE INDEX IF NOT EXISTS idx_proformax2_proforma ON cosmoroot."ProformaX2" ("ProformaID")`,
  `ANALYZE cosmoroot."ProformaX1"`,
  `ANALYZE cosmoroot."ProformaX2"`,
];

(async () => {
  const pool = createPool({ connectionString });
  try {
    for (const sql of statements) {
      console.log(`Running: ${sql.slice(0, 90)}...`);
      await pool.query(sql);
    }
    console.log("Proforma tables are ready.");
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
