export const KYS_STOCK_SOURCES = ["Unique", "Root", "Spektrotek"] as const;

export function kysStockSource(value: unknown, materialType?: unknown): string {
  const source = value == null ? (materialType === "Spektrotek" ? "Spektrotek" : "Unique") : String(value).trim();
  if (!KYS_STOCK_SOURCES.some(item => item === source)) throw new Error("Geçersiz stok kaynağı.");
  return source;
}
