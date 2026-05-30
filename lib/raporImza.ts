import { createHmac, timingSafeEqual } from "node:crypto";

// ───────────────────────────────────────────────────────────────────────────
// Rapor dijital imzası (tamper-proof)
//
// Rapor onaylandığında, raporda görünen içerik (numune, firma, analiz sonuçları)
// kanonik bir metne çevrilip HMAC-SHA256 ile imzalanır. İmza NKR_RaporOnay.ImzaHash
// alanında saklanır. Doğrulama sırasında aynı içerik tekrar imzalanıp saklanan
// imza ile karşılaştırılır — eşleşmezse rapor onaydan sonra değiştirilmiş demektir.
//
// PRODUCTION NOTU: HMAC anahtarı RAPOR_IMZA_SECRET ortam değişkeninden okunur.
// Üretim ortamında bu değişken MUTLAKA tanımlanmalı (uzun, rastgele bir değer).
// Tanımlı değilse aşağıdaki dev fallback kullanılır — bu durumda imza güvenliği
// zayıftır ve sadece geliştirme içindir.
// ───────────────────────────────────────────────────────────────────────────

const IMZA_SURUM = "1";
const DEV_FALLBACK_SECRET = "ROOTPORTAL_DEV_IMZA_SECRET_CHANGE_IN_PRODUCTION";

export interface ImzaHizmet {
  Kod: string | null;
  Sonuc: string | null;
  Degerlendirme: string | null;
  Birim: string | null;
  LimitDeger: string | null;
}

export interface ImzaPayloadInput {
  nkrId: number;
  raporNo: string;
  format: string;
  numuneAdi: string;
  firmaAd: string;
  raporTarihi: string | null; // YYYY-MM-DD
  hizmetler: ImzaHizmet[];
}

function norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function getSecret(): string {
  const s = (process.env.RAPOR_IMZA_SECRET || "").trim();
  return s.length > 0 ? s : DEV_FALLBACK_SECRET;
}

/** RAPOR_IMZA_SECRET üretimde tanımlı mı? (dev fallback kullanılmıyor mu?) */
export function imzaSecretConfigured(): boolean {
  return (process.env.RAPOR_IMZA_SECRET || "").trim().length > 0;
}

export function imzaSurum(): string {
  return IMZA_SURUM;
}

/** Rapor içeriğini deterministik (sıra-bağımsız) bir kanonik metne çevirir. */
export function buildCanonicalPayload(input: ImzaPayloadInput): string {
  const satirlar = [...input.hizmetler]
    .map(h => ({
      Kod: norm(h.Kod),
      Sonuc: norm(h.Sonuc),
      Degerlendirme: norm(h.Degerlendirme),
      Birim: norm(h.Birim),
      LimitDeger: norm(h.LimitDeger),
    }))
    .sort((a, b) => a.Kod.localeCompare(b.Kod, "tr"))
    .map(h => [h.Kod, h.Sonuc, h.Degerlendirme, h.Birim, h.LimitDeger].join("|"));

  return [
    `v=${IMZA_SURUM}`,
    `nkr=${input.nkrId}`,
    `rapor=${norm(input.raporNo)}`,
    `format=${norm(input.format)}`,
    `numune=${norm(input.numuneAdi)}`,
    `firma=${norm(input.firmaAd)}`,
    `tarih=${norm(input.raporTarihi)}`,
    `hizmetler=${satirlar.join(";")}`,
  ].join("\n");
}

/** Rapor içeriğinin HMAC-SHA256 imzasını (hex) üretir. */
export function signRapor(input: ImzaPayloadInput): string {
  const payload = buildCanonicalPayload(input);
  return createHmac("sha256", getSecret()).update(payload, "utf8").digest("hex");
}

/** Saklanan imza ile güncel içeriğin imzasını sabit-zamanlı karşılaştırır. */
export function verifyRapor(input: ImzaPayloadInput, expected: string | null | undefined): boolean {
  const exp = norm(expected);
  if (!exp) return false;
  const actual = signRapor(input);
  if (actual.length !== exp.length) return false;
  try {
    return timingSafeEqual(Buffer.from(actual, "utf8"), Buffer.from(exp, "utf8"));
  } catch {
    return false;
  }
}
