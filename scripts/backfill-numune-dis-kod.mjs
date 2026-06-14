// Tüm NKR'leri tarayıp, her (NkrID, RaporFormati) için DisRaporKodu allocate eder.
// Mevcut onaylar bozulmaz. Onay olmayan format'lara `Durum = NULL`, KarekodToken
// ve DisRaporKodu içeren yeni satır eklenir.
// Idempotent — tekrar koşulursa yeni satır eklemez.
import mssql from "mssql";
import { randomBytes } from "node:crypto";

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
    .replace(/\s+/g, "").toUpperCase();
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
const randomDisKodRapor = (yil, fmt) => `ÜGAM/${raporFormatToRR(fmt)}${year2(yil)}/${random4()}`;
const newToken = () => randomBytes(18).toString("base64url");

const pool = await new mssql.ConnectionPool(config).connect();
console.log(`MSSQL ${db} baglanildi.\n`);

const colCheck = await pool.request().query(`SELECT COL_LENGTH('NKR_RaporOnay','DisRaporKodu') AS len`);
if (!colCheck.recordset[0].len) {
  console.error("✗ DisRaporKodu kolonu yok. Migration 018'i koşun.");
  await pool.close(); process.exit(1);
}

// Tüm distinct (NkrID, RaporFormati) çifti
const pairsRes = await pool.request().query(`
  SELECT DISTINCT x.RaporID AS NkrID, s.RaporFormati
  FROM NumuneX1 x
  INNER JOIN StokAnalizListesi s ON s.ID = x.AnalizID
  INNER JOIN NKR n ON n.ID = x.RaporID AND n.Durum = 'Aktif'
  WHERE s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
  ORDER BY x.RaporID DESC
`);
console.log(`Toplam (NkrID, RaporFormati) cifti: ${pairsRes.recordset.length}`);

// Mevcut onay satırları
const existRes = await pool.request().query(
  `SELECT NkrID, RaporFormati, DisRaporKodu, KarekodToken FROM NKR_RaporOnay`
);
const mevcut = new Map(); // "NkrID|FORMAT_UPPER" → { DisRaporKodu, KarekodToken }
const tokSet = new Set(), kodSet = new Set();
for (const r of existRes.recordset) {
  mevcut.set(`${r.NkrID}|${normalizeFormat(r.RaporFormati)}`, r);
  if (r.KarekodToken) tokSet.add(r.KarekodToken);
  if (r.DisRaporKodu) kodSet.add(r.DisRaporKodu);
}

const yeniDisKod = (yil, fmt) => {
  for (let i = 0; i < 25; i++) {
    const k = randomDisKodRapor(yil, fmt);
    if (!kodSet.has(k)) { kodSet.add(k); return k; }
  }
  return randomDisKodRapor(yil, fmt) + String(Date.now()).slice(-2);
};
const yeniTok = () => {
  for (let i = 0; i < 10; i++) {
    const t = newToken();
    if (!tokSet.has(t)) { tokSet.add(t); return t; }
  }
  return newToken() + Date.now();
};

// Planı çıkar
const insertList = [], backfillList = [], skipList = [];
for (const r of pairsRes.recordset) {
  const key = `${r.NkrID}|${normalizeFormat(r.RaporFormati)}`;
  const ex = mevcut.get(key);
  if (!ex) insertList.push(r);
  else if (!ex.DisRaporKodu) backfillList.push({ ...r, mevcutToken: ex.KarekodToken });
  else skipList.push(r);
}

console.log(`Plan:`);
console.log(`  INSERT (yeni satir, Durum=NULL): ${insertList.length}`);
console.log(`  BACKFILL (DisKod doldur)        : ${backfillList.length}`);
console.log(`  SKIP (zaten kod var)             : ${skipList.length}\n`);

if (insertList.length + backfillList.length === 0) {
  console.log("✅ Yapacak is yok."); await pool.close(); process.exit(0);
}

const yil = new Date().getFullYear();
let okIns = 0, okBack = 0;

for (const r of insertList) {
  const tok = yeniTok();
  const kod = yeniDisKod(yil, r.RaporFormati);
  await pool.request()
    .input("nkrId", r.NkrID).input("format", r.RaporFormati)
    .input("token", tok).input("kod", kod)
    .query(`
      INSERT INTO NKR_RaporOnay (NkrID, RaporFormati, KarekodToken, Durum, DisRaporKodu)
      VALUES (@nkrId, @format, @token, NULL, @kod)
    `);
  okIns++;
  if (okIns % 100 === 0) console.log(`  INSERT ${okIns}/${insertList.length}`);
}

for (const r of backfillList) {
  const kod = yeniDisKod(yil, r.RaporFormati);
  await pool.request()
    .input("nkrId", r.NkrID).input("format", r.RaporFormati).input("kod", kod)
    .query(`
      UPDATE NKR_RaporOnay SET DisRaporKodu = @kod
      WHERE NkrID = @nkrId
        AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
        AND DisRaporKodu IS NULL
    `);
  okBack++;
}

console.log(`\n✅ Tamamlandi. INSERT: ${okIns}  BACKFILL: ${okBack}`);
await pool.close();
