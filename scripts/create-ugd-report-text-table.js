const fs = require("fs");
const { createPool } = require("@vercel/postgres");

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const connectionString = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
if (!connectionString) throw new Error("UGD_POSTGRESS_URL or UGD_POSTGRES_URL is required.");

(async () => {
  const pool = createPool({ connectionString });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dbo."rUGDRaporMetinleri" (
        "ID" SERIAL PRIMARY KEY,
        "UrunID" INTEGER NOT NULL,
        "Alan" TEXT NOT NULL,
        "Dil" TEXT NOT NULL,
        "Metin" TEXT NULL,
        "UpdatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_rUGDRaporMetinleri" UNIQUE ("UrunID", "Alan", "Dil")
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_rugd_rapor_metinleri_urun
      ON dbo."rUGDRaporMetinleri" ("UrunID")
    `);
    console.log("rUGDRaporMetinleri table is ready.");
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
