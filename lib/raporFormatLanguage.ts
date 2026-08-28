export type ReportLanguageChoice = "tr" | "en" | "both";

function normalizeFormatKey(format: string): string {
  return String(format || "")
    .trim()
    .replace(/Ü/g, "U").replace(/ü/g, "u")
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .replace(/Ö/g, "O").replace(/ö/g, "o")
    .replace(/Ç/g, "C").replace(/ç/g, "c")
    .replace(/Ş/g, "S").replace(/ş/g, "s")
    .replace(/Ğ/g, "G").replace(/ğ/g, "g")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function baseReportFormat(format: string): string {
  const value = String(format || "").trim();
  const normalized = normalizeFormatKey(value);
  if (normalized === "GENELEN") return "Genel";
  if (normalized === "CHALLENGEEN") return "Challenge";
  if (normalized === "STABILITEEN") return "Stabilite";
  return value;
}

export function englishReportFormat(format: string): string | null {
  const base = baseReportFormat(format);
  const normalized = normalizeFormatKey(base);
  if (normalized === "GENEL") return "GenelEn";
  if (normalized === "CHALLENGE") return "ChallengeEn";
  if (normalized === "STABILITE") return "StabiliteEn";
  return null;
}

export function isEnglishReportFormat(format: string): boolean {
  return baseReportFormat(format) !== String(format || "").trim();
}

export function expandReportFormats(format: string, language: ReportLanguageChoice): string[] {
  const base = baseReportFormat(format);
  const english = englishReportFormat(base);
  if (language === "en") return english ? [english] : [base];
  if (language === "both") return english ? [base, english] : [base];
  return [base];
}
