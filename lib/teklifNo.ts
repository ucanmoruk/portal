// Teklif numaralandırma yardımcıları (Müşteriler menüsü · massgrup_cosmo)
//
// İki ayrı numara:
//  • İç takip no (TeklifNo, INT)  : YY + 4 haneli sıra. 2026 için ilk = 260200.
//  • Dış takip kodu (DisTeklifKodu): "ÜGAM-YY-XXXXX" — müşteriye giden, tahmin
//    edilemez benzersiz kod. XXXXX = karışıklık yaratmayan alfabeden 5 karakter.
//  • Revizyon her ikisinde de "/NN" olarak gösterilir (RevNo).

// I/L/O/0/1 gibi karışan karakterler yok.
export const DIS_TEKLIF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Yıla göre iç teklif no taban değerleri. floor+1 = o yılın ilk numarası. */
export function icTeklifRange(year: number) {
  const year2 = year % 100;          // 26
  const yearMin = year2 * 10000;     // 260000
  const yearMax = yearMin + 9999;    // 269999
  const floor = yearMin + 199;       // 260199 → ilk üretilen 260200
  return { yearMin, yearMax, floor };
}

/** Rastgele dış teklif kodu üretir: ÜGAM-26-AB3KP (benzersizlik DB'de kontrol edilir). */
export function randomDisKod(year: number): string {
  const year2 = String(year % 100).padStart(2, "0");
  let s = "";
  for (let i = 0; i < 5; i++) {
    s += DIS_TEKLIF_ALPHABET[Math.floor(Math.random() * DIS_TEKLIF_ALPHABET.length)];
  }
  return `ÜGAM-${year2}-${s}`;
}

/** Dış kod + revizyon etiketi: "ÜGAM-26-AB3KP/00" */
export function disTeklifLabel(kod: string | null | undefined, rev: number): string {
  if (!kod) return "-";
  return `${kod}/${String(rev).padStart(2, "0")}`;
}

/** İç no + revizyon etiketi: "260200" veya "260200/01" */
export function icTeklifLabel(no: number | null | undefined, rev: number): string {
  if (!no) return "-";
  return rev > 0 ? `${no}/${String(rev).padStart(2, "0")}` : String(no);
}
