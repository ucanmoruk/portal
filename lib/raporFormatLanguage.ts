export type ReportLanguageChoice = "tr" | "en" | "both";

export function baseReportFormat(format: string): string {
  const value = String(format || "").trim();
  const normalized = value.toLocaleUpperCase("tr-TR");
  if (normalized === "GENELEN") return "Genel";
  if (normalized === "CHALLENGEEN") return "Challenge";
  return value;
}

export function englishReportFormat(format: string): string | null {
  const base = baseReportFormat(format);
  const normalized = base.toLocaleUpperCase("tr-TR");
  if (normalized === "GENEL") return "GenelEn";
  if (normalized === "CHALLENGE") return "ChallengeEn";
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
