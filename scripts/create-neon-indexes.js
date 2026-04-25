const fs = require("fs");
const { createPool } = require("@vercel/postgres");

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const connectionString = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
if (!connectionString) {
  throw new Error("UGD_POSTGRESS_URL or UGD_POSTGRES_URL is required.");
}

const statements = [
  `CREATE INDEX IF NOT EXISTS idx_nkr_durum_id ON dbo."NKR" ("Durum", "ID" DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_nkr_durum_evrak ON dbo."NKR" ("Durum", "Evrak_No" DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_nkr_firma ON dbo."NKR" ("Firma_ID")`,
  `CREATE INDEX IF NOT EXISTS idx_nkr_tarih ON dbo."NKR" ("Tarih")`,

  `CREATE INDEX IF NOT EXISTS idx_numunex1_raporid ON dbo."NumuneX1" ("RaporID")`,
  `CREATE INDEX IF NOT EXISTS idx_numunex1_rapor_analiz ON dbo."NumuneX1" ("RaporID", "AnalizID")`,
  `CREATE INDEX IF NOT EXISTS idx_numunex1_termin ON dbo."NumuneX1" ("Termin")`,
  `CREATE INDEX IF NOT EXISTS idx_numunex1_hizmetdurum ON dbo."NumuneX1" ("HizmetDurum")`,

  `CREATE INDEX IF NOT EXISTS idx_stokanaliz_id_rapor ON dbo."StokAnalizListesi" ("ID", "RaporFormati")`,
  `CREATE INDEX IF NOT EXISTS idx_stokanaliz_kod ON dbo."StokAnalizListesi" ("Kod")`,

  `CREATE INDEX IF NOT EXISTS idx_root_tedarikci_durum_ad ON dbo."RootTedarikci" ("Durum", "Ad")`,
  `CREATE INDEX IF NOT EXISTS idx_root_tedarikci_kimin_ad ON dbo."RootTedarikci" ("Kimin", "Ad")`,

  `CREATE INDEX IF NOT EXISTS idx_numunedetay_raporid ON dbo."NumuneDetay" ("RaporID")`,
  `CREATE INDEX IF NOT EXISTS idx_odeme_evrak_id ON dbo."Odeme" ("Evrak_No", "ID" DESC)`,

  `CREATE INDEX IF NOT EXISTS idx_rugd_liste_durum_birim_id ON dbo."rUGDListe" ("Durum", "BirimID", "ID" DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_rugd_liste_firma ON dbo."rUGDListe" ("FirmaID")`,
  `CREATE INDEX IF NOT EXISTS idx_rcosing_tur_id ON dbo."rCosing" ("Tur", "ID")`,
  `CREATE INDEX IF NOT EXISTS idx_rugd_yonetmelik_num_inci ON dbo."rUGDYonetmelik" ("Num", "INCI")`,

  `CREATE INDEX IF NOT EXISTS idx_stalep_tarih_id ON dbo."STalepListe" ("Tarih", "ID" DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_stalep_durum_tarih ON dbo."STalepListe" ("Durum", "Tarih")`,
  `CREATE INDEX IF NOT EXISTS idx_stalep_firma ON dbo."STalepListe" ("FirmaID")`,
  `CREATE INDEX IF NOT EXISTS idx_steklif_tarih_id ON dbo."STeklifListe" ("Tarih", "ID" DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_steklif_durum_id ON dbo."STeklifListe" ("Durum", "ID" DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_steklif_firma ON dbo."STeklifListe" ("FirmaID")`,
  `CREATE INDEX IF NOT EXISTS idx_steklifdetay_teklif ON dbo."STeklifDetay" ("TeklifID")`,
  `CREATE INDEX IF NOT EXISTS idx_sstok_durum_ad ON dbo."SStokListe" ("Durum", "Ad")`,

  `CREATE INDEX IF NOT EXISTS idx_rootkoz_silindi_id ON cosmoroot."RootKozTeklif" ("SilindiMi", "ID" DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_rootkoz_kalem_teklif ON cosmoroot."RootKozTeklifKalem" ("TeklifID", "Dahil")`,
  `CREATE INDEX IF NOT EXISTS idx_nkr_log_nkr_tarih ON cosmoroot."NKR_Log" ("NKRID", "Tarih" DESC)`,

  `ANALYZE`,
];

(async () => {
  const pool = createPool({ connectionString });
  try {
    for (const sql of statements) {
      process.stdout.write(`Running: ${sql.slice(0, 90)}...\n`);
      await pool.query(sql);
    }
    console.log("Indexes created and statistics refreshed.");
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
