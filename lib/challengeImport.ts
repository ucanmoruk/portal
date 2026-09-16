import type { WorkSheet } from "xlsx";

export const CHALLENGE_ORGANISMS = ["Pseudomonas aeruginosa", "Escherichia coli", "Staphylococcus aureus", "Candida albicans", "Aspergillus brasiliensis"] as const;
export const CHALLENGE_EXCEL_ROWS = [25, 19, 22, 28, 31] as const;
export const CHALLENGE_ASSESSMENTS = ["Uygun", "Uygun Değil", "D.Y."] as const;
export type ChallengeAssessment = typeof CHALLENGE_ASSESSMENTS[number];
export type ChallengeRow = { organism: string; inoculation: string; counts: [string, string, string, string]; reductions: [string, string, string] };
export type ChallengeData = { version: 1; sourceFile: string; sourceSheet: string; rows: ChallengeRow[]; assessment: ChallengeAssessment };
export const isChallengeFormat = (format: string) => /^(challenge|challengeen)$/i.test(format.trim());

function cellValue(sheet: WorkSheet, address: string, scientific: boolean): string {
  const cell = sheet[address];
  if (cell?.t === "e") throw new Error(`${address} hücresinde Excel hesaplama hatası var.`);
  if (cell?.f && cell.v == null) throw new Error(`${address} formülünün sonucu yok. Dosyayı Excel'de hesaplayıp kaydedin.`);
  if (cell?.v == null || String(cell.v).trim() === "") return "-";
  let value = String(cell.v).trim();
  if ((address === "M31" || address === "P31") && value.toUpperCase() === "X") return "-";
  if (scientific) {
    const formatted = String(cell.w ?? "").trim();
    if (/^[+-]?[\d.,]+e[+-]?\d+$/i.test(formatted)) value = formatted;
    const match = value.match(/^([+-]?[\d.,]+)e([+-]?\d+)$/i);
    if (match) return `${match[1].replace(".", ",")} x 10^${Number(match[2])}`;
  }
  return typeof cell.v === "number" ? value.replace(".", ",") : value;
}

export function importChallengeSheet(sheet: WorkSheet, sourceFile: string, sourceSheet: string): Omit<ChallengeData, "assessment"> {
  if (String(sheet.T1?.v ?? "").trim() !== "F.06.PR.19") throw new Error("Bu sayfa F.06.PR.19 Challenge Testi Analiz Detay Formu formatında değil.");
  return { version: 1, sourceFile, sourceSheet, rows: CHALLENGE_EXCEL_ROWS.map((row, index) => ({
    organism: CHALLENGE_ORGANISMS[index],
    inoculation: cellValue(sheet, `L${row}`, true),
    counts: ["L", "M", "N", "O"].map(column => cellValue(sheet, `${column}${row}`, true)) as ChallengeRow["counts"],
    reductions: ["P", "Q", "R"].map(column => cellValue(sheet, `${column}${row}`, false)) as ChallengeRow["reductions"],
  })) };
}

export function validateChallengeData(value: unknown): ChallengeData {
  if (!value || typeof value !== "object") throw new Error("Excel verisi eksik.");
  const data = value as ChallengeData;
  const validText = (text: unknown, max: number) => typeof text === "string" && text.trim().length > 0 && text.length <= max;
  if (data.version !== 1 || !validText(data.sourceFile, 260) || !validText(data.sourceSheet, 100) || !CHALLENGE_ASSESSMENTS.includes(data.assessment) || !Array.isArray(data.rows) || data.rows.length !== 5) throw new Error("Excel verisi veya değerlendirme geçersiz.");
  for (const [index, row] of data.rows.entries()) {
    if (!row || row.organism !== CHALLENGE_ORGANISMS[index] || !validText(row.inoculation, 80) || !Array.isArray(row.counts) || row.counts.length !== 4 || !Array.isArray(row.reductions) || row.reductions.length !== 3 || ![...row.counts, ...row.reductions].every(text => validText(text, 80))) throw new Error("Challenge sonuç tablosu geçersiz.");
  }
  return { version: 1, sourceFile: data.sourceFile, sourceSheet: data.sourceSheet, assessment: data.assessment, rows: data.rows.map(row => ({ organism: row.organism, inoculation: row.inoculation, counts: [...row.counts], reductions: [...row.reductions] })) };
}
