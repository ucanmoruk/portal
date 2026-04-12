import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// GET /api/rapor-takip
// Her (NKR.ID, RaporFormati) kombinasyonu için bir satır döner.
// Aynı rapor numarasına ait birden fazla rapor formatı varsa birden fazla satır gelir.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

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

    // Sonuc kolonu var mı?
    const sonucCheck = await pool.request().query(`
      SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'NumuneX1' AND COLUMN_NAME = 'Sonuc'
    `);
    const hasSonuc = sonucCheck.recordset.length > 0;

    const searchFilter = search
      ? `AND (n.Evrak_No LIKE @search OR n.RaporNo LIKE @search
             OR n.Numune_Adi LIKE @search OR f.Ad LIKE @search)`
      : "";

    const yearFilter = year
      ? `AND YEAR(n.Tarih) = @year`
      : "";

    const raporTuruFilter = raporTuru
      ? `AND s.RaporFormati = @raporTuru`
      : "";

    const sonucCountExpr = hasSonuc
      ? `(SELECT COUNT(*) FROM NumuneX1 x2
           INNER JOIN StokAnalizListesi s2 ON s2.ID = x2.AnalizID
           WHERE x2.RaporID = r.NkrID AND s2.RaporFormati = r.RaporFormati
             AND x2.Sonuc IS NOT NULL AND x2.Sonuc != '')`
      : "0";

    const query = `
      WITH Raporlar AS (
        SELECT DISTINCT
          n.ID                                    AS NkrID,
          CONVERT(varchar(10), n.Tarih, 23)       AS Tarih,
          n.Evrak_No,
          n.RaporNo,
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
          ${yearFilter}
          ${raporTuruFilter}
      ),
      WithStats AS (
        SELECT
          r.*,
          COUNT(*) OVER() AS TotalCount,
          (SELECT COUNT(*) FROM NumuneX1 x2
             INNER JOIN StokAnalizListesi s2 ON s2.ID = x2.AnalizID
             WHERE x2.RaporID = r.NkrID AND s2.RaporFormati = r.RaporFormati) AS HizmetSayisi,
          ${sonucCountExpr} AS SonucluSayisi,
          (SELECT MAX(CONVERT(varchar(10), x3.Termin, 23)) FROM NumuneX1 x3
             INNER JOIN StokAnalizListesi s3 ON s3.ID = x3.AnalizID
             WHERE x3.RaporID = r.NkrID AND s3.RaporFormati = r.RaporFormati
               AND x3.Termin IS NOT NULL) AS MaxTermin
        FROM Raporlar r
      )
      SELECT *
      FROM WithStats
      WHERE 1=1
        ${raporDurumu ? raporDurumu === "Bekliyor"
          ? "AND (HizmetSayisi = 0 OR SonucluSayisi = 0)"
          : raporDurumu === "Devam Ediyor"
          ? "AND HizmetSayisi > 0 AND SonucluSayisi > 0 AND SonucluSayisi < HizmetSayisi"
          : raporDurumu === "Tamamlandı"
          ? "AND HizmetSayisi > 0 AND SonucluSayisi >= HizmetSayisi"
          : ""
        : ""}
      ORDER BY Tarih DESC, RaporNo DESC, RaporFormati
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

    const data = result.recordset.map(({ TotalCount: _, HizmetSayisi, SonucluSayisi, ...row }) => ({
      ...row,
      RaporDurumu:
        HizmetSayisi === 0      ? "Bekliyor"
        : SonucluSayisi === 0   ? "Bekliyor"
        : SonucluSayisi >= HizmetSayisi ? "Tamamlandı"
        : "Devam Ediyor",
    }));

    return Response.json({ data, total, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
