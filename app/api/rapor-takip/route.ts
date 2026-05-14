import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// GET /api/rapor-takip
// Her (NKR.ID, RaporFormati) kombinasyonu icin bir satir doner.
// Ayni rapor numarasina ait birden fazla rapor formati varsa birden fazla satir gelir.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erisim" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const page   = Math.max(1, parseInt(searchParams.get("page")  || "1"));
    const limit  = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "20")));
    const search = searchParams.get("search")?.trim() || "";
    const year        = searchParams.get("year")?.trim() || "";
    const raporDurumu = searchParams.get("raporDurumu")?.trim() || "";
    const raporTuru   = searchParams.get("raporTuru")?.trim() || "";
    const offset      = (page - 1) * limit;

    const pool = await poolPromise;

    const overrideTableCheck = await pool.request().query(`
      SELECT 1 AS x
      FROM INFORMATION_SCHEMA.TABLES
      WHERE LOWER(TABLE_NAME) = LOWER('NKR_RaporDurumOverride')
    `);
    const hasOverrideTable = overrideTableCheck.recordset.length > 0;

    // Sonuc kolonu var mi?
    const sonucCheck = await pool.request().query(`
      SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'NumuneX1' AND COLUMN_NAME = 'Sonuc'
    `);
    const hasSonuc = sonucCheck.recordset.length > 0;

    const searchFilter = search
      ? `AND (
             LOWER(COALESCE(CAST(n.Evrak_No AS NVARCHAR), '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(CAST(n.RaporNo AS NVARCHAR), '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(CAST(n.Barkod AS NVARCHAR), '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(n.Numune_Adi, '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(f.Ad, '')) LIKE LOWER(@search)
        )`
      : "";

    const yearFilter = year
      ? `AND MaxTermin IS NOT NULL AND YEAR(CONVERT(date, MaxTermin)) = @year`
      : "";

    const raporTuruFilter = ["ÜGDR", "UGDR", "ÜGD", "UGD"].includes(raporTuru.toLocaleUpperCase("tr-TR"))
      ? `AND UPPER(REPLACE(s.RaporFormati, N'Ü', N'U')) IN (N'UGDR', N'UGD')`
      : raporTuru
      ? `AND s.RaporFormati = @raporTuru`
      : "";

    const raporDurumuFilter = raporDurumu === "Bekliyor"
      ? "AND EffectiveDurum = N'Bekliyor'"
      : raporDurumu === "Devam Ediyor"
      ? "AND EffectiveDurum = N'Devam Ediyor'"
      : raporDurumu === "Tamamland\u0131"
      ? "AND (EffectiveDurum = N'Tamamland\u0131' OR EffectiveDurum = N'Tamamlandi')"
      : "";

    const sonucCountExpr = hasSonuc
      ? `(SELECT COUNT(*) FROM NumuneX1 x2
           INNER JOIN StokAnalizListesi s2 ON s2.ID = x2.AnalizID
           WHERE x2.RaporID = r.NkrID AND s2.RaporFormati = r.RaporFormati
             AND x2.Sonuc IS NOT NULL AND x2.Sonuc != '')`
      : "0";

    const overrideSelectExpr = hasOverrideTable
      ? `(
            SELECT MAX(o.Durum)
            FROM NKR_RaporDurumOverride o
            WHERE o.NkrID = r.NkrID
              AND UPPER(REPLACE(o.RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(r.RaporFormati, N'Ü', N'U'))
          )`
      : `NULL`;

    const query = `
      WITH Raporlar AS (
        SELECT DISTINCT
          n.ID                                    AS NkrID,
          CONVERT(varchar(10), n.Tarih, 23)       AS Tarih,
          n.Evrak_No,
          n.RaporNo,
          n.Barkod,
          n.Numune_Adi,
          f.Ad                                    AS FirmaAd,
          p.Ad                                    AS ProjeAd,
          s.RaporFormati
        FROM NKR n
        LEFT JOIN RootTedarikci f  ON f.ID = n.Firma_ID
        LEFT JOIN NumuneDetay   nd ON nd.RaporID = n.ID
        LEFT JOIN RootTedarikci p  ON p.ID = nd.ProjeID
        INNER JOIN NumuneX1         x1 ON x1.RaporID  = n.ID
        INNER JOIN StokAnalizListesi s  ON s.ID = x1.AnalizID
          AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
        WHERE n.Durum = 'Aktif'
          ${searchFilter}
          ${raporTuruFilter}
      ),
      WithStats AS (
        SELECT
          r.*,
          (SELECT COUNT(*) FROM NumuneX1 x2
             INNER JOIN StokAnalizListesi s2 ON s2.ID = x2.AnalizID
             WHERE x2.RaporID = r.NkrID AND s2.RaporFormati = r.RaporFormati) AS HizmetSayisi,
          ${sonucCountExpr} AS SonucluSayisi,
          ${overrideSelectExpr} AS OverrideDurum,
          (SELECT MAX(CONVERT(varchar(10), x3.Termin, 23)) FROM NumuneX1 x3
             INNER JOIN StokAnalizListesi s3 ON s3.ID = x3.AnalizID
             WHERE x3.RaporID = r.NkrID AND s3.RaporFormati = r.RaporFormati
               AND x3.Termin IS NOT NULL) AS MaxTermin
        FROM Raporlar r
      ),
      WithEffectiveDurum AS (
        SELECT *,
          COALESCE(
            OverrideDurum,
            CASE
              WHEN HizmetSayisi = 0 OR SonucluSayisi = 0 THEN N'Bekliyor'
              WHEN SonucluSayisi >= HizmetSayisi THEN N'Tamamlandı'
              ELSE N'Devam Ediyor'
            END
          ) AS EffectiveDurum
        FROM WithStats
      ),
      Filtered AS (
        SELECT *
        FROM WithEffectiveDurum
        WHERE 1=1
          ${yearFilter}
          ${raporDurumuFilter}
      )
      SELECT *, COUNT(*) OVER() AS TotalCount
      FROM Filtered
      ORDER BY
        Tarih ASC,
        RaporNo ASC,
        RaporFormati
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const req = pool.request()
      .input("offset", offset)
      .input("limit",  limit);

    if (search) req.input("search", `%${search}%`);
    if (year) req.input("year", parseInt(year));
    if (raporTuru) req.input("raporTuru", raporTuru);

    const result = await req.query(query);

    const total = result.recordset[0]?.TotalCount ?? 0;

    const data = result.recordset.map(({ TotalCount: _, HizmetSayisi, SonucluSayisi, EffectiveDurum, ...row }) => ({
      ...row,
      RaporDurumu: (EffectiveDurum === "Tamamlandi" ? "Tamamlandı" : EffectiveDurum)
        ?? (HizmetSayisi === 0      ? "Bekliyor"
        : SonucluSayisi === 0   ? "Bekliyor"
        : SonucluSayisi >= HizmetSayisi ? "Tamamland\u0131"
        : "Devam Ediyor"),
    }));

    return Response.json({ data, total, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    console.error("rapor-takip GET error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
