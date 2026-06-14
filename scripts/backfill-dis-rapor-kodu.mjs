// Geri dönük backfill: NKR_RaporOnay'da DisRaporKodu NULL olan tüm satırlara
// ÜGAM/RR26/XXXX formatında dış kod atar.
//   - Yıl: OnayTarihi'nin yılı (yoksa şimdiki yıl)
//   - RR : RaporFormati'den türetilir (GE/ST/CH/CL/ÜG/DG)
//   - XXXX: 4 karakter, ABCDEFGHJKMNPQRSTUVWXYZ23456789 alfabesinden, en az 1 rakam
//   - Çakışma → yeniden dene (25 tur), sonra timestamp ek
// Idempotent: tekrar çalıştırılırsa zaten dolu olan satırlara dokunulmaz.
import mssql from "mssql";

const db = process.env.MSSQL_COSMO_DB || "massgrup_cosmo";
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: db,
  server: process.env.DB_SERVER,
  port: 1433,
  connectionTimeout: 30000,
  requestTimeout: 60000,
  options: { encrypt: true, trustServerCertificate: true },
};
if (!config.server || !config.user) {
  console.error("DB_SERVER/DB_USER/DB_PASSWORD yok.");
  process.exit(1);
}

// ── lib/disKod.ts ile birebir mantık ──────────────────────────────────────
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

// ── Çalıştır ─────────────────────────────────────────────────────────────
const pool = await new mssql.ConnectionPool(config).connect();
console.log(`MSSQL ${db} baglanildi.`);

// 1) Kolon var mı? (Migration 018 koşulmamışsa hata ver)
const colCheck = await pool.request().query(
  `SELECT COL_LENGTH('NKR_RaporOnay','DisRaporKodu') AS len`
);
if (!colCheck.recordset[0].len) {
  console.error("✗ NKR_RaporOnay.DisRaporKodu kolonu yok. Once Migration 018'i calistirin.");
  await pool.close();
  process.exit(1);
}

// 2) NULL olan onaylari cek
const nullRows = await pool.request().query(`
  SELECT ID, NkrID, RaporFormati, OnayTarihi
  FROM NKR_RaporOnay
  WHERE DisRaporKodu IS NULL
  ORDER BY ID
`);
const toplam = nullRows.recordset.length;
console.log(`Backfill edilecek satir: ${toplam}`);
if (toplam === 0) {
  console.log("✅ Hicbir satir backfill gerektirmiyor. Cikiliyor.");
  await pool.close();
  process.exit(0);
}

// 3) Her satira benzersiz kod ata
let basarili = 0;
let cakisma = 0;
for (const r of nullRows.recordset) {
  const yil = r.OnayTarihi ? new Date(r.OnayTarihi).getFullYear() : new Date().getFullYear();
  let yeniKod = null;
  for (let i = 0; i < 25; i++) {
    const cand = randomDisKodRapor(yil, r.RaporFormati);
    const exists = await pool.request()
      .input("kod", cand)
      .query(`SELECT TOP 1 ID FROM NKR_RaporOnay WHERE DisRaporKodu = @kod`);
    if (!exists.recordset.length) { yeniKod = cand; break; }
    cakisma++;
  }
  if (!yeniKod) {
    // 25 cakisma → timestamp ekiyle ayir
    yeniKod = randomDisKodRapor(yil, r.RaporFormati) + String(Date.now()).slice(-2);
  }
  await pool.request()
    .input("id", r.ID)
    .input("kod", yeniKod)
    .query(`UPDATE NKR_RaporOnay SET DisRaporKodu = @kod WHERE ID = @id AND DisRaporKodu IS NULL`);
  basarili++;
  console.log(`  [${basarili}/${toplam}] NkrID=${r.NkrID} ${r.RaporFormati} → ${yeniKod}`);
}

console.log(`\n✅ Tamamlandi. ${basarili} satir guncellendi. (${cakisma} cakisma retry)`);
await pool.close();
