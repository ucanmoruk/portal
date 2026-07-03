// Rapor formatı adını normalize eder (Türkçe karakter + büyük/küçük harf duyarsız).
// Hem sunucu hem client'ta güvenli — node bağımlılığı yok (disKod'un aksine).
export function normFormat(f: string | null | undefined): string {
  return (f ?? "")
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ç/g, "c").replace(/Ç/g, "C")
    .trim()
    .toUpperCase();
}

// "Diğer" formatı mı? ("Diğer", "Diger", "DİĞER", "DIGER" … hepsi eşleşir)
export function isDigerFormat(f: string | null | undefined): boolean {
  return normFormat(f) === "DIGER";
}
