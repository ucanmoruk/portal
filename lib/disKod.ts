// Üç sistem için ortak dış kod üretici: Talep, Teklif, Rapor.
//
// Formatlar:
//   Talep   → UGAM/A26/XXXX         (revizyonsuz)
//   Teklif  → UGAM/T26/XXXX[/NN]    (revizyon /NN)
//   Rapor   → UGAM/RR26/XXXX[/NN]   (RR = rapor formatı kodu, revizyon /NN)
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

/** UGAM/A26/XXXX */
export function randomDisKodTalep(year: number): string {
  return `UGAM/A${year2(year)}/${random4()}`;
}

/** UGAM/T26/XXXX */
export function randomDisKodTeklif(year: number): string {
  return `UGAM/T${year2(year)}/${random4()}`;
}

/** UGAM/RR26/XXXX — RR rapor formatından türetilir. */
export function randomDisKodRapor(year: number, raporFormati: string): string {
  const rr = raporFormatToRR(raporFormati);
  return `UGAM/${rr}${year2(year)}/${random4()}`;
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

/** Talep dış kodu (revizyonsuz): "UGAM/A26/XXXX" veya "-". */
export function disTalepLabel(kod: string | null | undefined): string {
  return kod || "-";
}

/** Teklif dış kodu + revizyon: "UGAM/T26/XXXX/00". */
export function disTeklifLabelV2(kod: string | null | undefined, rev: number): string {
  if (!kod) return "-";
  return `${kod}/${String(rev).padStart(2, "0")}`;
}

/** Rapor dış kodu + revizyon: "UGAM/GE26/XXXX-00". */
export function disRaporLabel(kod: string | null | undefined, rev: number): string {
  if (!kod) return "-";
  return `${kod}-${String(rev).padStart(2, "0")}`;
}
