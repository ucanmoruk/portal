import poolPromise from "@/lib/db";
import { z } from "zod";

export const FormulaMatchInput = z.object({ items: z.array(z.object({ name: z.string().trim().min(1).max(500), amount: z.union([z.string().max(100), z.number()]).default("0") })).min(1).max(250) });
type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const normalized = (value: unknown) => text(value).toUpperCase().replace(/İ/g, "I");

/** Three bounded catalogue reads per formula, instead of four serial reads per row. */
export async function matchUgdFormula(items: { name: string; amount: string | number }[]) {
  if (!items.length) return [];
  const pool = await poolPromise;
  const names = [...new Set(items.map(item => normalized(item.name)))];
  const query = pool.request();
  const conditions = names.map((name, i) => { query.input(`name${i}`, name); return `INCIName=@name${i} OR Cas=@name${i}`; });
  const catalogue: Row[] = (await query.query(`SELECT ID,INCIName,Cas,EC,Functions,Kategori,Regulation,Link FROM rCosing WHERE ${conditions.map(c => `(${c})`).join(" OR ")} ORDER BY ID`)).recordset;
  const ids = [...new Set(catalogue.map(row => Number(row.ID)).filter(id => Number.isInteger(id) && id > 0))];
  const profileQuery = pool.request();
  const profileConditions = ids.map((id, i) => { profileQuery.input(`id${i}`, id); return `cID=@id${i}`; });
  const [profilesResult, regulationResult] = await Promise.all([
    ids.length ? profileQuery.query(`SELECT cID,Noael2,Fizikokimya,Toksikoloji,Kaynak FROM rHammadde WHERE ${profileConditions.join(" OR ")} ORDER BY ID`) : Promise.resolve({ recordset: [] }),
    pool.request().query("SELECT ID,INCI,Num AS YonetmelikNo,UrunTipi AS YonetmelikUrunTipi,Maks,Diger,Etiket FROM rUGDYonetmelik ORDER BY ID"),
  ]);
  const profiles: Row[] = profilesResult.recordset, regulations: Row[] = regulationResult.recordset;
  return items.map(item => {
    const name = normalized(item.name);
    const cosing = catalogue.find(row => normalized(row.INCIName) === name || normalized(row.Cas) === name) || {};
    const profile = profiles.find(row => Number(row.cID) === Number(cosing.ID)) || {};
    const inci = normalized(cosing.INCIName || name), regulation = normalized(cosing.Regulation);
    const details = (regulation ? regulations.find(row => normalized(row.YonetmelikNo) === regulation) : undefined)
      || regulations.find(row => normalized(row.INCI) === inci)
      || regulations.find(row => normalized(row.INCI).includes(inci)) || {};
    return {
      inputName: item.name, inputAmount: String(item.amount || "0").replace(",", "."),
      matched: Boolean(cosing.INCIName), cosingId: cosing.ID || null, INCIName: cosing.INCIName || null,
      Cas: cosing.Cas || null, Ec: cosing.EC || null, Functions: cosing.Functions || null,
      Kategori: cosing.Kategori || null, Regulation: cosing.Regulation || null, Link: cosing.Link || null,
      YonetmelikNo: details.YonetmelikNo || null, YonetmelikUrunTipi: details.YonetmelikUrunTipi || null,
      Maks: details.Maks || null, Diger: details.Diger || null, Etiket: details.Etiket || null,
      Fizikokimya: profile.Fizikokimya || null, Toksikoloji: profile.Toksikoloji || null, Kaynak: profile.Kaynak || null,
      noael: profile.Noael2 == null || profile.Noael2 === "" ? null : String(profile.Noael2),
    };
  });
}
