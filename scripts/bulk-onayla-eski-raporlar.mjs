// Toplu onay: MAX(Termin) < BELIRLENEN_TARIH olan tüm (NkrID, RaporFormati)
// kombinasyonlarını "Onaylandı" durumuna alır.
//
// Default: 2026-05-01 (1 Mayıs 2026 öncesi)
// Override: --tarih=YYYY-MM-DD
//
// Mod:
//   (varsayılan, --apply yoksa) → DRY-RUN: ne kadar etkilenecek, ilk 20 örnek
//   --apply                     → Gerçekten UPDATE/INSERT yap
//
// Her satır için:
//   - NKR_RaporOnay kaydı yoksa → INSERT (KarekodToken + DisRaporKodu üretilir, Durum='Onaylandı')
//   - Kayıt varsa ve Durum 'Onaylandı'/'Yayınlandı' DEĞİLSE → UPDATE Durum='Onaylandı'
//   - Kayıt var ve zaten Onaylandı/Yayınlandı → DOKUNULMAZ
//   - DisRaporKodu NULL ise → backfill
import mssql from "mssql";
import { randomBytes } from "node:crypto";

const TARIH_DEFAULT = "2026-05-01";
const APPLY = process.argv.includes("--apply");
const tarihArg = (process.argv.find(a => a.startsWith("--tarih=")) || "").split("=")[1] || TARIH_DEFAULT;
if (!/^\d{4}-\d{2}-\d{2}$/.test(tarihArg)) {
  console.error("--tarih=YYYY-MM-DD formatında olmalı.");
  process.exit(1);
}
const ESIK = tarihArg;

const db = process.env.MSSQL_COSMO_DB || "massgrup_cosmo";
const config = {
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: db,
  server: process.env.DB_SERVER, port: 1433,
  connectionTimeout: 30000, requestTimeout: 60000,
  options: { encrypt: true, trustServerCertificate: true },
};
if (!config.server || !config.user) {
  console.error("DB_SERVER/DB_USER/DB_PASSWORD yok.");
  process.exit(1);
}

// ── DisKod generator (lib/disKod.ts ile birebir) ─────────────────────────
const ALPHABET_FULL  = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ALPHABET_DIGIT = "23456789";
const pickRandom = (a) => a[Math.floor(Math.random() * a.length)];
function random4() {
  const digitSlot = Math.floor(Math.random() * 4);
  const chars = [];
  for (let i = 0; i < 4; i++) {
    chars.push(i === digitSlot ? pickRandom(ALPHABET_DIGIT) : pickRandom(ALPHABET_FULL));
  }
  return chars.join("");
}
const year2 = (y) => String(y % 100).padStart(2, "0");
function normalizeFormat(s) {
  return String(s ?? "")
    .replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/\s+/g, "")
    .toUpperCase();
}
function raporFormatToRR(f) {
  const n = normalizeFormat(f);
  if (!n) return "DG";
  if (n.startsWith("GENEL"))     return "GE";
  if (n.startsWith("STABILITE")) return "ST";
  if (n.startsWith("CHALLENGE")) return "CH";
  if (n.startsWith("CLAIM"))     return "CL";
  if (n === "UGDR" || n === "UGD" || n.startsWith("UGDR")) return "ÜG";
  if (n.startsWith("DIGER") || n.startsWith("OZEL"))       return "DG";
  return "DG";
}
function randomDisKodRapor(year, raporFormati) {
  return `ÜGAM/${raporFormatToRR(raporFormati)}${year2(year)}/${random4()}`;
}
const newToken = () => randomBytes(18).toString("base64url"); // ~24 char

// ── Çalıştır ─────────────────────────────────────────────────────────────
const pool = await new mssql.ConnectionPool(config).connect();
console.log(`MSSQL ${db} baglanildi. Esik tarihi: ${ESIK}  |  Mod: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

// 1) Aday (NkrID, RaporFormati) listesi: MaxTermin < ESIK
const adaylar = await pool.request().input("esik", ESIK).query(`
  WITH RF AS (
    SELECT DISTINCT x.RaporID AS NkrID, s.RaporFormati
    FROM NumuneX1 x
    INNER JOIN StokAnalizListesi s ON s.ID = x.AnalizID
    WHERE s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
  ),
  WithMaxTermin AS (
    SELECT rf.NkrID, rf.RaporFormati,
      (SELECT MAX(CONVERT(date, x2.Termin)) FROM NumuneX1 x2
         INNER JOIN StokAnalizListesi s2 ON s2.ID = x2.AnalizID
         WHERE x2.RaporID = rf.NkrID AND s2.RaporFormati = rf.RaporFormati
           AND x2.Termin IS NOT NULL) AS MaxTermin
    FROM RF rf
    INNER JOIN NKR n ON n.ID = rf.NkrID AND n.Durum = 'Aktif'
  )
  SELECT NkrID, RaporFormati, CONVERT(varchar(10), MaxTermin, 23) AS MaxTermin
  FROM WithMaxTermin
  WHERE MaxTermin IS NOT NULL AND MaxTermin < CONVERT(date, @esik)
  ORDER BY MaxTermin, NkrID, RaporFormati
`);
const toplamAday = adaylar.recordset.length;
console.log(`Termin'i ${ESIK} oncesi olan (NkrID, RaporFormati) sayisi: ${toplamAday}\n`);

if (toplamAday === 0) { await pool.close(); process.exit(0); }

// 2) Mevcut onay durumlari
const onayMap = new Map(); // "NkrID|FormatNormUpper" → { ID, Durum, DisRaporKodu }
const onayRes = await pool.request().query(`
  SELECT ID, NkrID, RaporFormati, Durum, DisRaporKodu
  FROM NKR_RaporOnay
`);
for (const r of onayRes.recordset) {
  const key = `${r.NkrID}|${normalizeFormat(r.RaporFormati)}`;
  onayMap.set(key, { ID: r.ID, Durum: r.Durum, DisRaporKodu: r.DisRaporKodu });
}

// 3) Plana ayir
const insertList   = [];
const updateList   = [];
const backfillList = [];
const skipList     = [];
for (const r of adaylar.recordset) {
  const key = `${r.NkrID}|${normalizeFormat(r.RaporFormati)}`;
  const mevcut = onayMap.get(key);
  if (!mevcut) {
    insertList.push(r);
  } else if (mevcut.Durum === "Onaylandı" || mevcut.Durum === "Yayınlandı") {
    if (!mevcut.DisRaporKodu) backfillList.push({ ...r, OnayID: mevcut.ID });
    else skipList.push({ ...r, mevcutDurum: mevcut.Durum });
  } else {
    updateList.push({ ...r, OnayID: mevcut.ID, mevcutDurum: mevcut.Durum, DisRaporKodu: mevcut.DisRaporKodu });
  }
}

console.log(`Plan:`);
console.log(`  INSERT (yeni onay)              : ${insertList.length}`);
console.log(`  UPDATE (durumu Onaylandı yap)  : ${updateList.length}`);
console.log(`  BACKFILL (DisKod doldur)        : ${backfillList.length}`);
console.log(`  SKIP (zaten Onaylandı/Yayınlandı): ${skipList.length}\n`);

if (insertList.length > 0) {
  console.log("Ilk 10 INSERT ornegi:");
  insertList.slice(0, 10).forEach(r =>
    console.log(`  - NkrID=${r.NkrID}  ${r.RaporFormati.padEnd(18)}  MaxTermin=${r.MaxTermin}`)
  );
}
if (updateList.length > 0) {
  console.log("\nIlk 10 UPDATE ornegi:");
  updateList.slice(0, 10).forEach(r =>
    console.log(`  - NkrID=${r.NkrID}  ${r.RaporFormati.padEnd(18)}  MaxTermin=${r.MaxTermin}  (mevcut: ${r.mevcutDurum})`)
  );
}

if (!APPLY) {
  console.log(`\n[DRY-RUN] Hicbir sey yazilmadi. Uygulamak icin: --apply ekleyin.`);
  await pool.close();
  process.exit(0);
}

// 4) APPLY — kullanilmis tokenleri ve diskodlari yukle (collision check icin)
const tokSet = new Set(); const kodSet = new Set();
const exist = await pool.request().query(`SELECT KarekodToken, DisRaporKodu FROM NKR_RaporOnay`);
for (const r of exist.recordset) {
  if (r.KarekodToken) tokSet.add(r.KarekodToken);
  if (r.DisRaporKodu) kodSet.add(r.DisRaporKodu);
}
const yeniToken = () => {
  for (let i = 0; i < 10; i++) {
    const t = newToken();
    if (!tokSet.has(t)) { tokSet.add(t); return t; }
  }
  return newToken() + Date.now();
};
const yeniDisKod = (yil, fmt) => {
  for (let i = 0; i < 25; i++) {
    const k = randomDisKodRapor(yil, fmt);
    if (!kodSet.has(k)) { kodSet.add(k); return k; }
  }
  return randomDisKodRapor(yil, fmt) + String(Date.now()).slice(-2);
};

let okIns = 0, okUpd = 0, okBack = 0;

console.log("\n--- INSERT basliyor ---");
for (const r of insertList) {
  const yil = parseInt(String(r.MaxTermin).slice(0, 4), 10) || new Date().getFullYear();
  const tok = yeniToken();
  const kod = yeniDisKod(yil, r.RaporFormati);
  await pool.request()
    .input("nkrId", r.NkrID).input("format", r.RaporFormati)
    .input("token", tok).input("kod", kod)
    .input("ad", "Toplu islem")
    .query(`
      INSERT INTO NKR_RaporOnay (NkrID, RaporFormati, KarekodToken, Durum, OnaylayanID, OnaylayanAd, DisRaporKodu)
      VALUES (@nkrId, @format, @token, N'Onaylandı', NULL, @ad, @kod)
    `);
  okIns++;
  if (okIns % 25 === 0) console.log(`  INSERT ${okIns}/${insertList.length}`);
}

console.log("\n--- UPDATE basliyor ---");
for (const r of updateList) {
  const yil = parseInt(String(r.MaxTermin).slice(0, 4), 10) || new Date().getFullYear();
  const kodVarMi = !!r.DisRaporKodu;
  const yeniKod = kodVarMi ? null : yeniDisKod(yil, r.RaporFormati);
  if (yeniKod) {
    await pool.request().input("id", r.OnayID).input("kod", yeniKod).query(
      `UPDATE NKR_RaporOnay SET Durum = N'Onaylandı', DisRaporKodu = @kod WHERE ID = @id`
    );
  } else {
    await pool.request().input("id", r.OnayID).query(
      `UPDATE NKR_RaporOnay SET Durum = N'Onaylandı' WHERE ID = @id`
    );
  }
  okUpd++;
  if (okUpd % 25 === 0) console.log(`  UPDATE ${okUpd}/${updateList.length}`);
}

console.log("\n--- BACKFILL basliyor ---");
for (const r of backfillList) {
  const yil = parseInt(String(r.MaxTermin).slice(0, 4), 10) || new Date().getFullYear();
  const kod = yeniDisKod(yil, r.RaporFormati);
  await pool.request().input("id", r.OnayID).input("kod", kod).query(
    `UPDATE NKR_RaporOnay SET DisRaporKodu = @kod WHERE ID = @id AND DisRaporKodu IS NULL`
  );
  okBack++;
}

console.log(`\n✅ Tamamlandi.`);
console.log(`  INSERT: ${okIns}`);
console.log(`  UPDATE: ${okUpd}`);
console.log(`  BACKFILL: ${okBack}`);
console.log(`  SKIP (zaten Onaylandı/Yayınlandı): ${skipList.length}`);
await pool.close();
