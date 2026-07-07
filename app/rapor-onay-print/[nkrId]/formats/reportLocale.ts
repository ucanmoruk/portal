export function isEnglishFormat(format: string): boolean {
  return String(format || "").trim().toLocaleLowerCase("tr-TR").endsWith("en");
}

export function translateReportUnit(unit: string | null | undefined, english: boolean): string {
  const raw = String(unit ?? "").trim();
  if (!english || !raw) return raw;
  return raw.toLocaleLowerCase("tr-TR") === "adet" ? "Qty" : raw;
}

