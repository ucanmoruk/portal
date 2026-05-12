import poolPromise from "@/lib/db";

type FormulaRow = Record<string, any>;

function value(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function firstValue(...items: unknown[]) {
  for (const item of items) {
    const text = value(item);
    if (text) return text;
  }
  return null;
}

export async function findUgdRegulationDetails(name: unknown, regulation: unknown = "") {
  const inci = value(name);
  if (!inci) return {};
  const regulationText = value(regulation);

  const pool = await poolPromise;
  const result = await pool.request()
    .input("name", inci)
    .input("regulation", regulationText)
    .query(`
      SELECT TOP 1
        Num AS YonetmelikNo,
        UrunTipi AS YonetmelikUrunTipi,
        Maks AS 'Maks',
        Diger AS 'Diger',
        Etiket AS 'Etiket'
      FROM rUGDYonetmelik
      WHERE
        (
          (@regulation <> '' AND Num = @regulation)
          OR INCI = @name
          OR INCI LIKE '%' + @name + '%'
        )
      ORDER BY
        CASE
          WHEN @regulation <> '' AND Num = @regulation THEN 0
          WHEN INCI = @name THEN 1
          ELSE 2
        END,
        ID
    `);

  return result.recordset[0] || {};
}

export async function findUgdIngredientProfile(cosingId: unknown) {
  const id = Number(cosingId);
  if (!Number.isFinite(id) || id <= 0) return {};

  const pool = await poolPromise;
  const result = await pool.request()
    .input("id", id)
    .query(`
      SELECT TOP 1
        Fizikokimya,
        Toksikoloji,
        Kaynak
      FROM rHammadde
      WHERE cID = @id
    `);

  return result.recordset[0] || {};
}

export async function enrichUgdFormulaRows(rows: FormulaRow[]) {
  const cache = new Map<string, Record<string, any>>();
  const profileCache = new Map<string, Record<string, any>>();

  return Promise.all(rows.map(async (row) => {
    const name = value(row.INCIName || row.inputName);
    if (!name) return row;

    const key = `${name}::${value(row.Regulation)}`;
    if (!cache.has(key)) {
      cache.set(key, await findUgdRegulationDetails(name, row.Regulation));
    }

    const details = cache.get(key) || {};
    const cosingId = row.HammaddeID ?? row.cosingId;
    const profileKey = value(cosingId);
    if (profileKey && !profileCache.has(profileKey)) {
      profileCache.set(profileKey, await findUgdIngredientProfile(cosingId));
    }
    const profile = profileKey ? profileCache.get(profileKey) || {} : {};

    return {
      ...row,
      YonetmelikNo: firstValue(row.YonetmelikNo, details.YonetmelikNo),
      YonetmelikUrunTipi: firstValue(row.YonetmelikUrunTipi, details.YonetmelikUrunTipi),
      Maks: firstValue(row.Maks, details.Maks),
      Diger: firstValue(row.Diger, details.Diger),
      Etiket: firstValue(row.Etiket, details.Etiket),
      Fizikokimya: firstValue(row.Fizikokimya, profile.Fizikokimya),
      Toksikoloji: firstValue(row.Toksikoloji, profile.Toksikoloji),
      Kaynak: firstValue(row.Kaynak, profile.Kaynak),
    };
  }));
}
