// Üç sistem için ortak dış kod üretici: Talep, Teklif, Rapor.
//
// Formatlar:
//   Talep   → ÜGAM/A26/XXXX         (revizyonsuz)
//   Teklif  → ÜGAM/T26/XXXX[/NN]    (revizyon /NN)
//   Rapor   → ÜGAM/RR26/XXXX[/NN]   (RR = rapor formatı kodu, revizyon /NN)
//
// XXXX:
//   4 karakter, alfabe = ABCDEFGHJKMNPQRSTUVWXYZ23456789 (I, L, O, 0, 1 yok).
//   En az 1 karakteri rakam olacak şekilde üretilir.
//
// Rapor format kodları (RR):
//   Genel → GE · Stabilite → ST · Challenge → CH · Claim → CL · ÜGDR → ÜG · Diğer → DG

const ALPHABET_FULL  = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ALPHABET_DIGIT = "23456789";

function pickRandom(alphabet: string): string {
  return alphabet[Math.floor(Math.random() * alphabet.length)];
}

/** 4 karakterli rastgele blok, en az 1 rakam garantili. */
function random4(): string {
  // En az 1 rakam: rastgele 1 slot rakam olarak doldur, kalan 3 slot tam alfabe.
  const digitSlot = Math.floor(Math.random() * 4);
  const chars: string[] = [];
  for (let i = 0; i < 4; i++) {
    chars.push(i === digitSlot ? pickRandom(ALPHABET_DIGIT) : pickRandom(ALPHABET_FULL));
  }
  return chars.join("");
}

function year2(year: number): string {
  return String(year % 100).padStart(2, "0");
}

// ── Üretici (random kod) ──────────────────────────────────────────────────

/** ÜGAM/A26/XXXX */
export function randomDisKodTalep(year: number): string {
  return `ÜGAM/A${year2(year)}/${random4()}`;
}

/** ÜGAM/T26/XXXX */
export function randomDisKodTeklif(year: number): string {
  return `ÜGAM/T${year2(year)}/${random4()}`;
}

/** ÜGAM/RR26/XXXX — RR rapor formatından türetilir. */
export function randomDisKodRapor(year: number, raporFormati: string): string {
  const rr = raporFormatToRR(raporFormati);
  return `ÜGAM/${rr}${year2(year)}/${random4()}`;
}

// ── Format mapping (StokAnalizListesi.RaporFormati → RR) ──────────────────

/** Türkçe karakter + boşluk normalize: "ÜGDR" → "UGDR", "Stabilite" → "STABILITE". */
function normalizeFormat(s: string): string {
  return s
    .replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** Rapor formatı string'inden RR koduna map. Bilinmeyen → "DG" (Diğer). */
export function raporFormatToRR(raporFormati: string | null | undefined): string {
  const n = normalizeFormat(String(raporFormati ?? ""));
  if (!n) return "DG";
  if (n.startsWith("GENEL"))      return "GE";
  if (n.startsWith("STABILITE"))  return "ST";
  if (n.startsWith("CHALLENGE"))  return "CH";
  if (n.startsWith("CLAIM"))      return "CL";
  if (n === "UGDR" || n === "UGD" || n.startsWith("UGDR")) return "ÜG";
  if (n.startsWith("DIGER") || n.startsWith("OZEL"))       return "DG";
  return "DG";
}

// ── Etiket helper'ları (revizyon ekleme) ──────────────────────────────────

/** Talep dış kodu (revizyonsuz): "ÜGAM/A26/XXXX" veya "-". */
export function disTalepLabel(kod: string | null | undefined): string {
  return kod || "-";
}

/** Teklif dış kodu + revizyon: "ÜGAM/T26/XXXX/00". */
export function disTeklifLabelV2(kod: string | null | undefined, rev: number): string {
  if (!kod) return "-";
  return `${kod}/${String(rev).padStart(2, "0")}`;
}

/** Rapor dış kodu + revizyon: "ÜGAM/GE26/XXXX-00". */
export function disRaporLabel(kod: string | null | undefined, rev: number): string {
  if (!kod) return "-";
  return `${kod}-${String(rev).padStart(2, "0")}`;
}

// ── Allocation helper'ı (numune kayıt sırasında DisKod tahsis et) ─────────

import { randomBytes } from "node:crypto";

function newCollisionFreeToken(existing: Set<string>): string {
  for (let i = 0; i < 10; i++) {
    const t = randomBytes(18).toString("base64url");
    if (!existing.has(t)) { existing.add(t); return t; }
  }
  return randomBytes(18).toString("base64url") + Date.now();
}

/**
 * Bu NKR'ye bağlı tüm rapor formatları için NKR_RaporOnay'da
 * DisRaporKodu satırı olduğundan emin olur. Onay anı beklenmez —
 * numune-form save / lab kabul aşamasında çağrılır.
 *
 * Satırın Durum'u NULL bırakılır ki rapor-takip durum mantığı
 * (Bekliyor / Analiz Devam Ediyor) bozulmasın. Onaylanınca aynı satır
 * UPDATE edilir (Durum='Onaylandı', OnayTarihi=NOW, vs).
 *
 * Idempotent: zaten DisKod olan satırlara dokunulmaz.
 */
export async function ensureDisRaporKodlari(pool: any, nkrId: number): Promise<{ created: number; skipped: number }> {
  // Kolon var mı?
  const colCheck = await pool.request().query(
    `SELECT COL_LENGTH('NKR_RaporOnay','DisRaporKodu') AS len`
  );
  if (!colCheck.recordset[0]?.len) return { created: 0, skipped: 0 };

  // Bu NKR'nin distinct format'ları
  const formatRes = await pool.request().input("nkrId", nkrId).query(`
    SELECT DISTINCT s.RaporFormati
    FROM NumuneX1 x1
    INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
    WHERE x1.RaporID = @nkrId
      AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
  `);
  const formatlar = formatRes.recordset.map((r: { RaporFormati: string }) => r.RaporFormati);
  if (formatlar.length === 0) return { created: 0, skipped: 0 };

  // Mevcut onay satırları (bu NKR için)
  const existRes = await pool.request().input("nkrId", nkrId).query(
    `SELECT ID, RaporFormati, DisRaporKodu FROM NKR_RaporOnay WHERE NkrID = @nkrId`
  );
  const mevcut = new Map<string, { ID: number; DisRaporKodu: string | null }>();
  for (const r of existRes.recordset) {
    mevcut.set(String(r.RaporFormati).toUpperCase(), { ID: r.ID, DisRaporKodu: r.DisRaporKodu });
  }

  // Çakışma önleme için sınırlı set yükle (token + kod)
  const setRes = await pool.request().query(
    `SELECT KarekodToken, DisRaporKodu FROM NKR_RaporOnay`
  );
  const tokSet = new Set<string>();
  const kodSet = new Set<string>();
  for (const r of setRes.recordset) {
    if (r.KarekodToken) tokSet.add(r.KarekodToken);
    if (r.DisRaporKodu) kodSet.add(r.DisRaporKodu);
  }
  const yeniDisKod = (yil: number, fmt: string) => {
    for (let i = 0; i < 25; i++) {
      const k = randomDisKodRapor(yil, fmt);
      if (!kodSet.has(k)) { kodSet.add(k); return k; }
    }
    return randomDisKodRapor(yil, fmt) + String(Date.now()).slice(-2);
  };

  const yil = new Date().getFullYear();
  let created = 0, skipped = 0;
  for (const fmt of formatlar) {
    const key = String(fmt).toUpperCase();
    const ex = mevcut.get(key);
    if (ex?.DisRaporKodu) { skipped++; continue; }

    if (ex) {
      // Satır var ama DisKod yok → backfill
      const kod = yeniDisKod(yil, fmt);
      await pool.request().input("id", ex.ID).input("kod", kod).query(
        `UPDATE NKR_RaporOnay SET DisRaporKodu = @kod WHERE ID = @id AND DisRaporKodu IS NULL`
      );
      created++;
    } else {
      // Yeni allocation satırı — Durum NULL, sadece kod taşıyıcı
      const tok = newCollisionFreeToken(tokSet);
      const kod = yeniDisKod(yil, fmt);
      await pool.request()
        .input("nkrId", nkrId).input("format", fmt)
        .input("token", tok).input("kod", kod)
        .query(`
          INSERT INTO NKR_RaporOnay (NkrID, RaporFormati, KarekodToken, Durum, DisRaporKodu)
          VALUES (@nkrId, @format, @token, NULL, @kod)
        `);
      created++;
    }
  }
  return { created, skipped };
}
