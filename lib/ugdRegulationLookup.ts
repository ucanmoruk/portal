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
  const pool = await poolPromise;
  const names = [...new Set(rows.map(row => value(row.INCIName || row.inputName)).filter(Boolean))];
  const ids = [...new Set(rows.map(row => Number(row.HammaddeID ?? row.cosingId)).filter(id => Number.isInteger(id) && id > 0))];
  const request = pool.request();
  const conditions = [
    ...names.map((name, index) => { request.input(`inci${index}`, name); return `INCIName = @inci${index}`; }),
    ...ids.map((id, index) => { request.input(`cid${index}`, id); return `ID = @cid${index}`; }),
  ];
  const catalogue = conditions.length
    ? (await request.query(`SELECT ID, INCIName, Kategori FROM rCosing WHERE ${conditions.join(" OR ")}`)).recordset
    : [];
  const cache = new Map<string, Record<string, any>>();
  const profileCache = new Map<string, Record<string, any>>();

  return Promise.all(rows.map(async (row) => {
    const name = value(row.INCIName || row.inputName);
    if (!name) return row;
    const cosingId = row.HammaddeID ?? row.cosingId;
    const ingredient = catalogue.find(item => Number(item.ID) === Number(cosingId))
      || catalogue.find(item => value(item.INCIName).toUpperCase() === name.toUpperCase());

    const key = `${name}::${value(row.Regulation)}`;
    if (!cache.has(key)) {
      cache.set(key, await findUgdRegulationDetails(name, row.Regulation));
    }

    const details = cache.get(key) || {};
    const profileKey = value(cosingId);
    if (profileKey && !profileCache.has(profileKey)) {
      profileCache.set(profileKey, await findUgdIngredientProfile(cosingId));
    }
    const profile = profileKey ? profileCache.get(profileKey) || {} : {};

    return {
      ...row,
      inputName: row.inputName ?? row.INCIName,
      inputAmount: row.inputAmount ?? row.Miktar ?? row.miktar,
      dap: row.dap ?? row.DaP ?? 100,
      noael: row.noael ?? row.Noael,
      Kategori: firstValue(ingredient?.Kategori, row.Kategori),
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
