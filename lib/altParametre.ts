// Hizmet (StokAnalizListesi) alt parametreleri — StokAnalizAltParametre tablosu.
// Tablo yoksa (migration 021 koşulmamış) graceful degrade: load → [], save → no-op.
// cosmoPool (ResilientPool) ile kullanılır.

export interface AltParametre {
  BilesenAdi?: string | null;
  BilesenAdiEn?: string | null;
  Birim?: string | null;
  BirimEn?: string | null;
  LOQ?: string | null;
  LOQEn?: string | null;
  Limit?: string | null;
  LimitEn?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pool = any;

let _exists: { val: boolean; ts: number } | null = null;
const TTL_MS = 30_000;

export async function altParametreTabloVar(pool: Pool): Promise<boolean> {
  if (_exists && Date.now() - _exists.ts < TTL_MS) return _exists.val;
  const r = await pool.request().query(
    `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = 'StokAnalizAltParametre' AND TABLE_SCHEMA IN ('dbo','cosmoroot')`
  );
  const val = r.recordset.length > 0;
  _exists = { val, ts: Date.now() };
  return val;
}

export async function loadAltParametreler(pool: Pool, analizId: number | string): Promise<AltParametre[]> {
  if (!(await altParametreTabloVar(pool))) return [];
  const r = await pool.request().input("aid", analizId).query(`
    SELECT
      ISNULL(BilesenAdi,   '') AS BilesenAdi,
      ISNULL(BilesenAdiEn, '') AS BilesenAdiEn,
      ISNULL(Birim,        '') AS Birim,
      ISNULL(BirimEn,      '') AS BirimEn,
      ISNULL(LOQ,          '') AS LOQ,
      ISNULL(LOQEn,        '') AS LOQEn,
      ISNULL([Limit],      '') AS [Limit],
      ISNULL(LimitEn,      '') AS LimitEn
    FROM StokAnalizAltParametre
    WHERE AnalizID = @aid
    ORDER BY Sira, ID
  `);
  return r.recordset as AltParametre[];
}

// Birden çok AnalizID için alt parametreleri tek sorguda yükler → { analizId: [...] }.
// Rapor görünümünde (loadRaporViewData) hizmetlere toplu eklemek için. Tablo yoksa {}.
export async function loadAltParametrelerByAnalizIds(
  pool: Pool,
  analizIds: Array<number | string>,
): Promise<Record<string, AltParametre[]>> {
  const map: Record<string, AltParametre[]> = {};
  if (!analizIds.length) return map;
  if (!(await altParametreTabloVar(pool))) return map;
  // Integer'a indirge (SQL'e güvenli inline) — DB'den gelen kimlikler.
  const ids = [...new Set(analizIds.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n)))];
  if (!ids.length) return map;
  const r = await pool.request().query(`
    SELECT
      AnalizID,
      ISNULL(BilesenAdi,   '') AS BilesenAdi,
      ISNULL(BilesenAdiEn, '') AS BilesenAdiEn,
      ISNULL(Birim,        '') AS Birim,
      ISNULL(BirimEn,      '') AS BirimEn,
      ISNULL(LOQ,          '') AS LOQ,
      ISNULL(LOQEn,        '') AS LOQEn,
      ISNULL([Limit],      '') AS [Limit],
      ISNULL(LimitEn,      '') AS LimitEn
    FROM StokAnalizAltParametre
    WHERE AnalizID IN (${ids.join(",")})
    ORDER BY AnalizID, Sira, ID
  `);
  for (const row of r.recordset as Array<AltParametre & { AnalizID: number }>) {
    const k = String(row.AnalizID);
    (map[k] ||= []).push(row);
  }
  return map;
}

// ── Per-rapor bileşen SONUÇLARI (NumuneX1AltParametre) ──────────────────────

export interface BilesenSonuc {
  AltParametreID: number | null;
  BilesenAdi: string; BilesenAdiEn: string;
  Birim: string; BirimEn: string;
  LOQ: string; LOQEn: string;
  Limit: string; LimitEn: string;
  Sonuc: string; SonucEn: string; Degerlendirme: string;
}

let _numuneAltExists: { val: boolean; ts: number } | null = null;
export async function numuneAltTabloVar(pool: Pool): Promise<boolean> {
  if (_numuneAltExists && Date.now() - _numuneAltExists.ts < TTL_MS) return _numuneAltExists.val;
  const r = await pool.request().query(
    `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_NAME = 'NumuneX1AltParametre' AND TABLE_SCHEMA IN ('dbo','cosmoroot')`
  );
  const val = r.recordset.length > 0;
  _numuneAltExists = { val, ts: Date.now() };
  return val;
}

// Sonuç girişi + rapor için: katalog bileşenleri (StokAnalizAltParametre, AnalizID)
// + (varsa) per-rapor girilmiş sonuçlar (NumuneX1AltParametre, X1ID). LEFT JOIN
// mantığı: her bileşen şartnamesi listelenir, sonuç girilmişse Sonuç/Değerlendirme dolu gelir.
// pairs: rapordaki her hizmet için { x1Id, analizId }. Dönen: { x1Id: BilesenSonuc[] }.
export async function loadBilesenSonuclar(
  pool: Pool,
  pairs: Array<{ x1Id: number; analizId: number }>,
): Promise<Record<string, BilesenSonuc[]>> {
  const out: Record<string, BilesenSonuc[]> = {};
  if (!pairs.length) return out;
  if (!(await altParametreTabloVar(pool))) return out;

  const analizIds = [...new Set(pairs.map((p) => p.analizId).filter((n) => Number.isFinite(n)))];
  const x1Ids = [...new Set(pairs.map((p) => p.x1Id).filter((n) => Number.isFinite(n)))];
  if (!analizIds.length) return out;

  const cat = await pool.request().query(`
    SELECT ID, AnalizID, Sira,
      ISNULL(BilesenAdi,'') AS BilesenAdi, ISNULL(BilesenAdiEn,'') AS BilesenAdiEn,
      ISNULL(Birim,'') AS Birim, ISNULL(BirimEn,'') AS BirimEn,
      ISNULL(LOQ,'') AS LOQ, ISNULL(LOQEn,'') AS LOQEn,
      ISNULL([Limit],'') AS [Limit], ISNULL(LimitEn,'') AS LimitEn
    FROM StokAnalizAltParametre WHERE AnalizID IN (${analizIds.join(",")})
    ORDER BY AnalizID, Sira, ID
  `);
  const catByAnaliz = new Map<number, Array<Record<string, unknown>>>();
  for (const c of cat.recordset as Array<Record<string, unknown>>) {
    const k = c.AnalizID as number;
    if (!catByAnaliz.has(k)) catByAnaliz.set(k, []);
    catByAnaliz.get(k)!.push(c);
  }

  const saved = new Map<string, { Sonuc: string; SonucEn: string; Degerlendirme: string }>();
  if (x1Ids.length && (await numuneAltTabloVar(pool))) {
    const sv = await pool.request().query(`
      SELECT X1ID, AltParametreID, ISNULL(Sonuc,'') AS Sonuc, ISNULL(SonucEn,'') AS SonucEn,
             ISNULL(Degerlendirme,'') AS Degerlendirme
      FROM NumuneX1AltParametre WHERE X1ID IN (${x1Ids.join(",")})
    `);
    for (const r of sv.recordset as Array<Record<string, unknown>>) {
      saved.set(`${r.X1ID}|${r.AltParametreID}`, {
        Sonuc: String(r.Sonuc ?? ""), SonucEn: String(r.SonucEn ?? ""), Degerlendirme: String(r.Degerlendirme ?? ""),
      });
    }
  }

  for (const p of pairs) {
    const comps = catByAnaliz.get(p.analizId) || [];
    out[String(p.x1Id)] = comps.map((c) => {
      const s = saved.get(`${p.x1Id}|${c.ID}`);
      return {
        AltParametreID: (c.ID as number) ?? null,
        BilesenAdi: String(c.BilesenAdi ?? ""), BilesenAdiEn: String(c.BilesenAdiEn ?? ""),
        Birim: String(c.Birim ?? ""), BirimEn: String(c.BirimEn ?? ""),
        LOQ: String(c.LOQ ?? ""), LOQEn: String(c.LOQEn ?? ""),
        Limit: String(c.Limit ?? ""), LimitEn: String(c.LimitEn ?? ""),
        Sonuc: s?.Sonuc ?? "", SonucEn: s?.SonucEn ?? "", Degerlendirme: s?.Degerlendirme ?? "",
      };
    });
  }
  return out;
}

// Per-rapor bileşen sonuçlarını kaydet (replace): X1ID için mevcut satırları sil,
// gelen listeyi (şartname snapshot + Sonuç/Değerlendirme) yaz. Tablo yoksa no-op.
export async function saveBilesenSonuclar(pool: Pool, x1Id: number | string, list: unknown): Promise<void> {
  if (!(await numuneAltTabloVar(pool))) return;
  const arr = (Array.isArray(list) ? list : []) as Array<Record<string, unknown>>;

  await pool.request().input("x1", x1Id)
    .query(`DELETE FROM NumuneX1AltParametre WHERE X1ID = @x1`);

  const str = (v: unknown) => { const s = String(v ?? "").trim(); return s === "" ? null : s; };
  let sira = 0;
  for (const p of arr) {
    await pool.request()
      .input("x1",   x1Id)
      .input("apid", Number.isFinite(Number(p.AltParametreID)) ? Number(p.AltParametreID) : null)
      .input("sira", sira++)
      .input("ba",   str(p.BilesenAdi))
      .input("bae",  str(p.BilesenAdiEn))
      .input("b",    str(p.Birim))
      .input("be",   str(p.BirimEn))
      .input("loq",  str(p.LOQ))
      .input("loqe", str(p.LOQEn))
      .input("lim",  str(p.Limit))
      .input("lime", str(p.LimitEn))
      .input("s",    str(p.Sonuc))
      .input("se",   str(p.SonucEn))
      .input("deg",  str(p.Degerlendirme))
      .query(`
        INSERT INTO NumuneX1AltParametre
          (X1ID, AltParametreID, Sira, BilesenAdi, BilesenAdiEn, Birim, BirimEn, LOQ, LOQEn, [Limit], LimitEn, Sonuc, SonucEn, Degerlendirme)
        VALUES
          (@x1, @apid, @sira, @ba, @bae, @b, @be, @loq, @loqe, @lim, @lime, @s, @se, @deg)
      `);
  }
}

// Tam değiştir (replace): mevcut satırları sil, gelen listeyi yaz. Tümüyle boş
// satırlar atlanır. Tablo yoksa sessizce no-op.
export async function saveAltParametreler(pool: Pool, analizId: number | string, list: unknown): Promise<void> {
  if (!(await altParametreTabloVar(pool))) return;
  const arr: AltParametre[] = Array.isArray(list) ? list : [];

  await pool.request().input("aid", analizId)
    .query(`DELETE FROM StokAnalizAltParametre WHERE AnalizID = @aid`);

  let sira = 0;
  for (const p of arr) {
    const dolu = [p.BilesenAdi, p.BilesenAdiEn, p.Birim, p.BirimEn, p.LOQ, p.LOQEn, p.Limit, p.LimitEn]
      .some((v) => String(v ?? "").trim() !== "");
    if (!dolu) continue;
    await pool.request()
      .input("aid",  analizId)
      .input("sira", sira++)
      .input("ba",   p.BilesenAdi   || null)
      .input("bae",  p.BilesenAdiEn || null)
      .input("b",    p.Birim        || null)
      .input("be",   p.BirimEn      || null)
      .input("loq",  p.LOQ          || null)
      .input("loqe", p.LOQEn        || null)
      .input("lim",  p.Limit        || null)
      .input("lime", p.LimitEn      || null)
      .query(`
        INSERT INTO StokAnalizAltParametre
          (AnalizID, Sira, BilesenAdi, BilesenAdiEn, Birim, BirimEn, LOQ, LOQEn, [Limit], LimitEn)
        VALUES
          (@aid, @sira, @ba, @bae, @b, @be, @loq, @loqe, @lim, @lime)
      `);
  }
}
