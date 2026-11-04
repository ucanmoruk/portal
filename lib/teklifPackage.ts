export type PackageFields = { PaketGrup?: string | null; PaketAdi?: string | null };
type DisplayRow = PackageFields & {
  HizmetAdi: string | null; Adet: number | string | null; Fiyat: number | string | null;
  ParaBirimi: string | null; Iskonto: number | string | null; Metot?: string | null;
  Akreditasyon?: string | null; Notlar?: string | null;
};
const quantity = (row: DisplayRow) => Number.parseInt(String(row.Adet ?? ""), 10) || 1;
const price = (row: DisplayRow) => Number.parseFloat(String(row.Fiyat ?? "")) || 0;
const discount = (row: DisplayRow) => Number.parseFloat(String(row.Iskonto ?? "")) || 0;
export function packageDisplayRows<T extends DisplayRow>(rows: T[]): (T & { UygulananParametreler?: string[] })[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) if (row.PaketGrup && row.PaketAdi) {
    const key = JSON.stringify([row.PaketGrup, row.ParaBirimi || "TRY"]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const seen = new Set<string>();
  return rows.flatMap(row => {
    if (!row.PaketGrup || !row.PaketAdi) return [row];
    const key = JSON.stringify([row.PaketGrup, row.ParaBirimi || "TRY"]);
    if (seen.has(key)) return [];
    seen.add(key);
    const members = groups.get(key)!;
    const sameQuantity = members.every(item => quantity(item) === quantity(row));
    const adet = sameQuantity ? quantity(row) : 1;
    const total = members.reduce((sum, item) => sum + quantity(item) * price(item) * (1 - discount(item) / 100), 0);
    return [{ ...row, HizmetAdi: row.PaketAdi, Adet: adet, Fiyat: total / adet, Iskonto: 0, Metot: "", Akreditasyon: "", Notlar: "",
      UygulananParametreler: members.map(item => `${String(item.Akreditasyon || "").trim().toLowerCase() === "var" ? "* " : ""}${item.HizmetAdi || ""}${item.Metot ? ` / ${item.Metot}` : ""}${!sameQuantity ? ` (${quantity(item)} adet)` : ""}${item.Notlar ? ` — ${item.Notlar}` : ""}`),
    }];
  });
}
