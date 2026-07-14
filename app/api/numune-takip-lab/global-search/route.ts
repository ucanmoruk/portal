import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

const RAPOR_FORMAT_EXPR = "COALESCE(NULLIF(s.RaporFormati, ''), N'Genel')";

const normSql = (expr: string) => `
  UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${expr},
    N'Ü', N'U'), N'ü', N'U'), N'İ', N'I'), N'ı', N'I'), N'Ö', N'O'), N'ö', N'O'),
    N'Ç', N'C'), N'ç', N'C'), N'Ğ', N'G'), N'ğ', N'G'), N'Ş', N'S'), N'ş', N'S'))
`;

const bucketSql = (expr: string) => `
  CASE
    WHEN ${normSql(expr)} IN (N'DERMATOLOJI', N'CLAIM') THEN N'CLAIM'
    WHEN ${normSql(expr)} IN (N'UGDR', N'UGD') THEN N'UGDR'
    WHEN ${normSql(expr)} = N'DIGER' THEN N'DIGER'
    ELSE ${normSql(expr)}
  END
`;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const search = request.nextUrl.searchParams.get("search")?.trim() || "";
  if (search.length < 2) return Response.json({ data: [] });

  try {
    const pool = await cosmoPool;

    const tableCheck = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA IN ('dbo', 'cosmoroot')
        AND TABLE_NAME IN ('NKR_LabKabul', 'NKR_RaporOnay', 'NKR_RaporDurumOverride')
    `);
    const tables = new Set<string>(
      tableCheck.recordset.map((row: { TABLE_NAME: string }) => String(row.TABLE_NAME).toLowerCase()),
    );
    const hasLabKabul = tables.has("nkr_labkabul");
    const hasRaporOnay = tables.has("nkr_raporonay");
    const hasOverride = tables.has("nkr_rapordurumoverride");

    const columnCheck = await pool.request().query(`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME IN ('NumuneX1', 'NKR_RaporOnay')
        AND COLUMN_NAME IN ('SonucKayitTarihi', 'Sonuc', 'DisRaporKodu')
    `);
    const cols = new Set<string>(
      columnCheck.recordset.map((row: { TABLE_NAME: string; COLUMN_NAME: string }) =>
        `${row.TABLE_NAME}.${row.COLUMN_NAME}`,
      ),
    );
    const hasKayitTarihi = cols.has("NumuneX1.SonucKayitTarihi");
    const hasSonuc = cols.has("NumuneX1.Sonuc");
    const hasDisRaporKodu = hasRaporOnay && cols.has("NKR_RaporOnay.DisRaporKodu");

    const savedCond = hasKayitTarihi
      ? "x.[SonucKayitTarihi] IS NOT NULL"
      : hasSonuc
      ? "x.Sonuc IS NOT NULL AND x.Sonuc != ''"
      : "1 = 0";

    const disKodSearchClause = hasDisRaporKodu
      ? `OR EXISTS (
          SELECT 1
          FROM NKR_RaporOnay ro
          WHERE ro.NkrID = n.ID
            AND LOWER(COALESCE(ro.DisRaporKodu, '')) LIKE LOWER(@search)
        )`
      : "";

    const query = `
      IF OBJECT_ID('tempdb..#Rap') IS NOT NULL DROP TABLE #Rap;
      IF OBJECT_ID('tempdb..#HS') IS NOT NULL DROP TABLE #HS;
      IF OBJECT_ID('tempdb..#OS') IS NOT NULL DROP TABLE #OS;
      IF OBJECT_ID('tempdb..#OV') IS NOT NULL DROP TABLE #OV;
      IF OBJECT_ID('tempdb..#Pending') IS NOT NULL DROP TABLE #Pending;

      SELECT DISTINCT
        n.ID AS NkrID,
        CONVERT(varchar(10), n.Tarih, 23) AS Tarih,
        n.Evrak_No,
        n.RaporNo,
        n.Barkod,
        n.Numune_Adi,
        f.Ad AS FirmaAd,
        p.Ad AS ProjeAd,
        ${RAPOR_FORMAT_EXPR} AS RaporFormati,
        ${bucketSql(RAPOR_FORMAT_EXPR)} AS NormFmt,
        ${hasLabKabul ? "lk.ID" : "CAST(NULL AS INT)"} AS LabKabulID
      INTO #Rap
      FROM NKR n
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad FROM Firma) f ON f.ID = n.Firma_ID
      LEFT JOIN NumuneDetay nd ON nd.RaporID = n.ID
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad FROM Firma) p ON p.ID = nd.ProjeID
      INNER JOIN NumuneX1 x1 ON x1.RaporID = n.ID
      INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      ${hasLabKabul ? `LEFT JOIN NKR_LabKabul lk ON lk.NkrID = n.ID AND ${bucketSql("lk.RaporFormati")} = ${bucketSql(RAPOR_FORMAT_EXPR)}` : ""}
      WHERE n.Durum = 'Aktif'
        AND (
          LOWER(COALESCE(CAST(n.Evrak_No AS NVARCHAR), '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(CAST(n.RaporNo AS NVARCHAR), '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(CAST(n.Barkod AS NVARCHAR), '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(n.Numune_Adi, '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(f.Ad, '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(p.Ad, '')) LIKE LOWER(@search)
          ${disKodSearchClause}
        );

      SELECT x.RaporID AS NkrID, ${RAPOR_FORMAT_EXPR} AS RaporFormati,
        COUNT(*) AS HizmetSayisi,
        SUM(CASE WHEN ${savedCond} THEN 1 ELSE 0 END) AS SonucluSayisi,
        MAX(CONVERT(varchar(10), x.Termin, 23)) AS MaxTermin
      INTO #HS
      FROM NumuneX1 x
      INNER JOIN StokAnalizListesi s ON s.ID = x.AnalizID
      GROUP BY x.RaporID, ${RAPOR_FORMAT_EXPR};

      SELECT r.NkrID, r.NormFmt,
        CASE WHEN EXISTS (
          SELECT 1
          FROM NumuneX1 nx
          INNER JOIN StokAnalizListesi ns ON ns.ID = nx.AnalizID
          WHERE nx.RaporID = r.NkrID
            AND ${bucketSql("COALESCE(NULLIF(ns.RaporFormati, ''), N'Genel')")} = r.NormFmt
            AND nx.HizmetDurum IN (N'Yeni', N'YeniAnaliz', N'Yeni Analiz')
        ) THEN 1 ELSE 0 END AS HasNewService
      INTO #Pending
      FROM #Rap r;

      ${hasRaporOnay ? `SELECT ro.NkrID, ${bucketSql("ro.RaporFormati")} AS NormFmt,
        MAX(ro.Durum) AS RaporOnayDurum,
        ${hasDisRaporKodu ? "MAX(ro.DisRaporKodu)" : "CAST(NULL AS NVARCHAR(80))"} AS DisRaporKodu
      INTO #OS
      FROM NKR_RaporOnay ro
      GROUP BY ro.NkrID, ${bucketSql("ro.RaporFormati")};` : ""}

      ${hasOverride ? `SELECT o.NkrID, ${bucketSql("o.RaporFormati")} AS NormFmt,
        MAX(o.Durum) AS OverrideDurum
      INTO #OV
      FROM NKR_RaporDurumOverride o
      GROUP BY o.NkrID, ${bucketSql("o.RaporFormati")};` : ""}

      WITH WithStats AS (
        SELECT
          r.*,
          COALESCE(hs.HizmetSayisi, 0) AS HizmetSayisi,
          COALESCE(hs.SonucluSayisi, 0) AS SonucluSayisi,
          hs.MaxTermin,
          pnd.HasNewService,
          ${hasRaporOnay ? "os.RaporOnayDurum" : "NULL"} AS RaporOnayDurum,
          ${hasDisRaporKodu ? "os.DisRaporKodu" : "CAST(NULL AS NVARCHAR(80))"} AS DisRaporKodu,
          ${hasOverride ? "ov.OverrideDurum" : "NULL"} AS OverrideDurum
        FROM #Rap r
        LEFT JOIN #HS hs ON hs.NkrID = r.NkrID AND hs.RaporFormati = r.RaporFormati
        LEFT JOIN #Pending pnd ON pnd.NkrID = r.NkrID AND pnd.NormFmt = r.NormFmt
        ${hasRaporOnay ? "LEFT JOIN #OS os ON os.NkrID = r.NkrID AND os.NormFmt = r.NormFmt" : ""}
        ${hasOverride ? "LEFT JOIN #OV ov ON ov.NkrID = r.NkrID AND ov.NormFmt = r.NormFmt" : ""}
      ),
      WithEffective AS (
        SELECT *,
          COALESCE(
            RaporOnayDurum,
            CASE
              WHEN OverrideDurum IN (N'Tamamlandı', N'Tamamlandi') THEN N'Onay Bekleniyor'
              WHEN OverrideDurum = N'Devam Ediyor' THEN N'Analiz Devam Ediyor'
              ELSE OverrideDurum
            END,
            CASE
              WHEN HizmetSayisi = 0 OR SonucluSayisi = 0 THEN N'Bekliyor'
              ELSE N'Analiz Devam Ediyor'
            END
          ) AS EffectiveDurum
        FROM WithStats
      ),
      Final AS (
        SELECT *,
          CASE
            WHEN (LabKabulID IS NULL OR HasNewService = 1)
              AND COALESCE(RaporOnayDurum, N'') NOT IN (N'Onaylandı', N'Onaylandi', N'Yayınlandı', N'Yayinlandi', N'Arşiv', N'Arsiv')
              THEN N'Kabul Bekleyenler'
            WHEN EffectiveDurum IN (N'Bekliyor', N'Analiz Devam Ediyor') THEN N'Sonuç Girişi'
            WHEN EffectiveDurum = N'Geri Gönderildi' THEN N'Geri Gelenler'
            WHEN EffectiveDurum = N'Onay Bekleniyor' THEN N'Onay Bekleyenler'
            WHEN EffectiveDurum IN (N'Onaylandı', N'Onaylandi') THEN N'Onaylandı'
            WHEN EffectiveDurum IN (N'Yayınlandı', N'Yayinlandi') THEN N'Yayınlandı'
            WHEN EffectiveDurum IN (N'Arşiv', N'Arsiv') THEN N'Arşiv'
            ELSE EffectiveDurum
          END AS TakipDurumu,
          CASE
            WHEN (LabKabulID IS NULL OR HasNewService = 1)
              AND COALESCE(RaporOnayDurum, N'') NOT IN (N'Onaylandı', N'Onaylandi', N'Yayınlandı', N'Yayinlandi', N'Arşiv', N'Arsiv')
              THEN N'kabul'
            WHEN EffectiveDurum IN (N'Bekliyor', N'Analiz Devam Ediyor') THEN N'sonuc'
            WHEN EffectiveDurum = N'Geri Gönderildi' THEN N'geri'
            WHEN EffectiveDurum = N'Onay Bekleniyor' THEN N'onay'
            ELSE N'approved'
          END AS TabKey
        FROM WithEffective
      )
      SELECT
        NkrID, Tarih, Evrak_No, RaporNo, Barkod, Numune_Adi,
        FirmaAd, ProjeAd, RaporFormati, HizmetSayisi, SonucluSayisi,
        MaxTermin, DisRaporKodu, TakipDurumu, TabKey
      FROM Final
      ORDER BY
        CASE
          WHEN TakipDurumu = N'Kabul Bekleyenler' THEN 1
          WHEN TakipDurumu = N'Sonuç Girişi' THEN 2
          WHEN TakipDurumu = N'Geri Gelenler' THEN 3
          WHEN TakipDurumu = N'Onay Bekleyenler' THEN 4
          ELSE 5
        END,
        TRY_CAST(RaporNo AS BIGINT) DESC,
        RaporFormati
      OFFSET 0 ROWS FETCH NEXT 12 ROWS ONLY;

      DROP TABLE #Rap;
      DROP TABLE #HS;
      DROP TABLE #Pending;
      ${hasRaporOnay ? "DROP TABLE #OS;" : ""}
      ${hasOverride ? "DROP TABLE #OV;" : ""}
    `;

    const req = pool.request().input("search", `%${search}%`);
    (req as unknown as { timeout?: number }).timeout = 60000;
    const result = await req.query(query);
    const recordsets = (result.recordsets as unknown as Record<string, unknown>[][]) || [];
    const rows =
      recordsets.find((rs) => rs && rs.length > 0 && "TakipDurumu" in rs[0]) ??
      result.recordset ??
      [];

    return Response.json({ data: rows });
  } catch (e: any) {
    console.error("numune-takip-lab global-search error:", e);
    return Response.json({ error: e.message || "Durum araması yapılamadı." }, { status: 500 });
  }
}
