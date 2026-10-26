import { numuneWorkspaceSql } from "@/lib/numuneWorkspace";
import { getLabScope, labScopeSql } from "@/lib/labResultAccess";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

const normSql = (expr: string) => `
  UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${expr},
    N'Ü', N'U'), N'ü', N'U'), N'İ', N'I'), N'ı', N'I'), N'Ö', N'O'), N'ö', N'O'),
    N'Ç', N'C'), N'ç', N'C'), N'Ğ', N'G'), N'ğ', N'G'))
`;
const bucketSql = (expr: string) => `
  CASE
    WHEN ${normSql(expr)} IN (N'DERMATOLOJI', N'CLAIM') THEN N'CLAIM'
    WHEN ${normSql(expr)} IN (N'UGDR', N'UGD') THEN N'UGDR'
    WHEN ${normSql(expr)} = N'DIGER' THEN N'DIGER'
    ELSE ${normSql(expr)}
  END
`;

// GET /api/rapor-takip
// Her (NKR.ID, RaporFormati) kombinasyonu icin bir satir doner.
// Ayni rapor numarasina ait birden fazla rapor formati varsa birden fazla satir gelir.
export async function GET(request: Request) {
  const workspaceFilter = numuneWorkspaceSql(request);
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
    const terminDate  = searchParams.get("terminDate")?.trim() || "";
    const acceptedOnly = searchParams.get("acceptedOnly") === "1";
    // phase: "lab" → sonuç giriş aşamasındaki kayıtlar (Bekliyor + Analiz Devam Ediyor),
    //        "approval" → Onaya Gönder'le gelmiş kayıtlar (Onay Bekleniyor)
    const phase = (searchParams.get("phase") || "").trim();
    const grup = searchParams.get("grup")?.trim() || "";
    if (grup && grup !== "Özel" && grup !== "K.D." && grup !== "Belge") return Response.json({ error: "Geçersiz numune kabul türü" }, { status: 400 });
    const offset      = (page - 1) * limit;

    const pool = await cosmoPool;
    const labFilter = ["lab", "returned", "approval"].includes(phase) ? labScopeSql(await getLabScope(session)) : "";

    // Two metadata reads replace seven sequential database round trips.
    const [tables, columns] = await Promise.all([
      pool.request().query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA IN ('dbo', 'cosmoroot')
        AND TABLE_NAME IN ('NKR_LabKabul', 'NKR_RaporOnay', 'NKR_RaporDurumOverride')`),
      pool.request().query(`SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA IN ('dbo', 'cosmoroot')
        AND TABLE_NAME IN ('NumuneX1', 'NKR_RaporOnay', 'NKR_RaporDurumOverride')`),
    ]);
    const hasTable = (name: string) => tables.recordset.some(r => String(r.TABLE_NAME).toLowerCase() === name.toLowerCase());
    const hasColumn = (table: string, column: string) => columns.recordset.some(r =>
      String(r.TABLE_NAME).toLowerCase() === table.toLowerCase() && String(r.COLUMN_NAME).toLowerCase() === column.toLowerCase());
    const hasLabKabul = hasTable('NKR_LabKabul');
    const hasRaporOnay = hasTable('NKR_RaporOnay');
    const hasOverrideTable = hasTable('NKR_RaporDurumOverride');
    const hasDisRaporKodu = hasRaporOnay && hasColumn('NKR_RaporOnay', 'DisRaporKodu');
    const hasSonuc = hasColumn('NumuneX1', 'Sonuc');
    const hasKayitTarihi = hasColumn('NumuneX1', 'SonucKayitTarihi');
    const hasOverrideNotlar = hasOverrideTable && hasColumn('NKR_RaporDurumOverride', 'Notlar');

    // DisRaporKodu (UGAM/RR26/XXXX) NKR_RaporOnay tablosunda — n.ID üzerinden
    // EXISTS ile aranır. Kolon yoksa aramaya dahil edilmez.
    const disKodSearchClause = (hasDisRaporKodu && search)
      ? `OR EXISTS (
             SELECT 1 FROM NKR_RaporOnay ro
             WHERE ro.NkrID = n.ID
               AND LOWER(COALESCE(ro.DisRaporKodu, '')) LIKE LOWER(@search)
           )`
      : "";

    const searchFilter = search
      ? `AND (
             LOWER(COALESCE(CAST(n.Evrak_No AS NVARCHAR), '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(CAST(n.RaporNo AS NVARCHAR), '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(CAST(n.Barkod AS NVARCHAR), '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(n.Numune_Adi, '')) LIKE LOWER(@search)
          OR LOWER(COALESCE(f.Ad, '')) LIKE LOWER(@search)
          ${disKodSearchClause}
        )`
      : "";

    const yearFilter = year && !terminDate
      ? `AND MaxTermin IS NOT NULL AND YEAR(CONVERT(date, MaxTermin)) = @year`
      : "";
    const terminDateFilter = terminDate
      ? `AND MaxTermin IS NOT NULL AND CONVERT(date, MaxTermin) = CONVERT(date, @terminDate)`
      : "";

    const raporTuruExpr = "COALESCE(NULLIF(s.RaporFormati, ''), N'Genel')";
    const raporTuruNormExpr = bucketSql(raporTuruExpr);
    const raporTuruParamNorm = bucketSql("@raporTuru");
    const raporOnayNormExpr = `
      CASE
        WHEN ${bucketSql("ro.RaporFormati")} = N'GENELEN' THEN N'GENEL'
        WHEN ${bucketSql("ro.RaporFormati")} = N'CHALLENGEEN' THEN N'CHALLENGE'
        WHEN ${bucketSql("ro.RaporFormati")} = N'STABILITEEN' THEN N'STABILITE'
        ELSE ${bucketSql("ro.RaporFormati")}
      END
    `;
    const raporOnayIsEnglishExpr = `${bucketSql("ro.RaporFormati")} IN (N'GENELEN', N'CHALLENGEEN', N'STABILITEEN')`;

    const raporTuruFilter = raporTuru
      ? `AND ${raporTuruNormExpr} = ${raporTuruParamNorm}`
      : "";

    const raporDurumuFilter = raporDurumu === "Bekliyor"
      ? "AND EffectiveDurum = N'Bekliyor'"
      : raporDurumu === "Analiz Devam Ediyor" || raporDurumu === "Devam Ediyor"
      ? "AND EffectiveDurum = N'Analiz Devam Ediyor'"
      : raporDurumu === "Onay Bekleniyor"
      ? "AND EffectiveDurum = N'Onay Bekleniyor'"
      : raporDurumu === "Onayland\u0131"
      ? "AND EffectiveDurum = N'Onayland\u0131'"
      : raporDurumu === "\u00d6deme bekliyor"
      ? "AND EffectiveDurum = N'\u00d6deme bekliyor'"
      : raporDurumu === "Yay\u0131nland\u0131"
      ? "AND EffectiveDurum = N'Yay\u0131nland\u0131'"
      : raporDurumu === "Geri G\u00f6nderildi"
      ? "AND EffectiveDurum = N'Geri G\u00f6nderildi'"
      : raporDurumu === "Tamamland\u0131"
      ? "AND (EffectiveDurum = N'Tamamland\u0131' OR EffectiveDurum = N'Tamamlandi')"
      : raporDurumu === "Ar\u015fiv"
      ? "AND EffectiveDurum = N'Ar\u015fiv'"
      : "";

    // Phase filtresi \u2014 geni\u015f kapsam, raporDurumu (filter dropdown) ile daralt\u0131l\u0131r.
    // lab \u2192 Bekliyor + Analiz Devam Ediyor (Onay Bekleniyor "Onay Bekleyenler"de)
    // approval \u2192 Onay Bekleniyor + Onayland\u0131 + Yay\u0131nland\u0131 (UI default Onay Bekleniyor)
    // returned \u2192 Geri G\u00f6nderildi
    const phaseFilter = phase === "lab"
      ? "AND EffectiveDurum IN (N'Bekliyor', N'Analiz Devam Ediyor')"
      : phase === "approval"
      ? "AND EffectiveDurum IN (N'Onay Bekleniyor', N'Onayland\u0131', N'Yay\u0131nland\u0131')"
      : phase === "returned"
      ? "AND EffectiveDurum = N'Geri G\u00f6nderildi'"
      : phase === "approved"
      ? "AND EffectiveDurum IN (N'Onayland\u0131', N'\u00d6deme bekliyor', N'Yay\u0131nland\u0131', N'Ar\u015fiv')"
      : "";

    // PERFORMANCE: Eski sürüm her satır için 8 correlated subquery çalıştırıyordu
    // → binlerce kabul'lü rapor olunca 30sn+ sürüp timeout veriyordu. Şimdi
    // istatistikler tek seferlik GROUP BY CTE'lerinde toplanıp Raporlar'a LEFT
    // JOIN ediliyor. Semantik birebir korunur.
    // "Kayıtlı" sonuç koşulu: SonucKayitTarihi varsa onu, yoksa Sonuc'u kullan.
    const savedCond = hasKayitTarihi
      ? "x.[SonucKayitTarihi] IS NOT NULL"
      : hasSonuc
      ? "x.Sonuc IS NOT NULL AND x.Sonuc != ''"
      : "1 = 0";

    // Numune Takip ile aynı evrak bazlı ödeme kaynağı. Öncelik sırası:
    // doğrudan evrak kaydı → bağlı faturanın ödeme kaydı → son legacy kayıt.
    const effectiveOdemeExpr = `
      COALESCE(
        (
          SELECT TOP 1 o.Odeme_Durumu
          FROM Odeme o
          WHERE o.Evrak_No = n.Evrak_No
            AND ISNULL(o.Odeme_Durumu, N'') <> N'Proforma'
          ORDER BY o.ID DESC
        ),
        (
          SELECT TOP 1 fo.Odeme_Durumu
          FROM ProformaNkr pn2
          INNER JOIN ProformaBaslik pb2 ON pb2.ID = pn2.ProformaID AND pb2.SilindiMi = 0
          INNER JOIN Fatura ft2 ON ft2.Durum = 'Aktif'
            AND (ft2.ProformaNo = pb2.EvrakNo OR ft2.ProformaNo = pb2.ProformaNo)
          INNER JOIN Odeme fo ON fo.Fatura_ID = ft2.ID
          WHERE pn2.NkrID = n.ID
            AND fo.Evrak_No = CAST(n.Evrak_No AS NVARCHAR(40))
            AND ISNULL(fo.Odeme_Durumu, N'') <> N'Proforma'
          ORDER BY fo.ID DESC
        ),
        (
          SELECT TOP 1 o.Odeme_Durumu
          FROM Odeme o
          WHERE o.Evrak_No = n.Evrak_No
          ORDER BY o.ID DESC
        )
      )
    `;

    // PERFORMANCE: SQL Server CTE'leri inline ediyor; tek dev sorguda
    // fonksiyon-bazlı join + filtre kombinasyonu kötü plan üretip 19sn sürüyordu.
    // Çözüm: ara sonuçları #temp tablolara materialize et (≈50× hız: 19s → 0.4s).
    // Temp tablolar batch sonunda DROP edilir; reused pooled connection'da kalıntı
    // olmaması için baştan IF OBJECT_ID guard'ı ile temizlenir.
    const query = `
      IF OBJECT_ID('tempdb..#Rap') IS NOT NULL DROP TABLE #Rap;
      IF OBJECT_ID('tempdb..#HS')  IS NOT NULL DROP TABLE #HS;
      IF OBJECT_ID('tempdb..#OS')  IS NOT NULL DROP TABLE #OS;
      IF OBJECT_ID('tempdb..#OV')  IS NOT NULL DROP TABLE #OV;

      SELECT DISTINCT
        n.ID                                    AS NkrID,
        CONVERT(varchar(10), n.Tarih, 23)       AS Tarih,
        n.Evrak_No,
        n.RaporNo,
        n.Revno,
        n.Barkod,
        n.Numune_Adi,
        n.Aciklama                              AS NumuneNotu,
        n.Firma_ID                              AS FirmaID,
        f.Ad                                    AS FirmaAd,
        nd.ProjeID                              AS ProjeFirmaID,
        p.Ad                                    AS ProjeAd,
        ${raporTuruExpr} AS RaporFormati,
        ${raporTuruNormExpr} AS NormFmt,
        CONVERT(varchar(10), n.Tarih, 23) AS KabulTarihi
      INTO #Rap
      FROM NKR n
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f  ON f.ID = n.Firma_ID
      LEFT JOIN NumuneDetay   nd ON nd.RaporID = n.ID
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) p  ON p.ID = nd.ProjeID
      INNER JOIN NumuneX1         x1 ON x1.RaporID  = n.ID
      INNER JOIN StokAnalizListesi s  ON s.ID = x1.AnalizID
      ${hasLabKabul ? `${acceptedOnly ? "INNER" : "LEFT"} JOIN NKR_LabKabul lk ON lk.NkrID = n.ID AND ${bucketSql("lk.RaporFormati")} = ${raporTuruNormExpr}` : ""}
      WHERE n.Durum = 'Aktif' AND ${workspaceFilter}
        ${labFilter}
        ${grup ? 'AND LTRIM(RTRIM(n.Grup)) = @grup' : ''}
        ${searchFilter}
        ${raporTuruFilter};

      SELECT x.RaporID AS NkrID, ${raporTuruExpr} AS RaporFormati,
        COUNT(*) AS HizmetSayisi,
        SUM(CASE WHEN ${savedCond} THEN 1 ELSE 0 END) AS SonucluSayisi,
        MAX(CONVERT(varchar(10), x.Termin, 23)) AS MaxTermin
      INTO #HS
      FROM NumuneX1 x
      INNER JOIN StokAnalizListesi s ON s.ID = x.AnalizID
      WHERE EXISTS (SELECT 1 FROM #Rap r WHERE r.NkrID = x.RaporID) ${labFilter}
      GROUP BY x.RaporID, ${raporTuruExpr};

      ${hasRaporOnay ? `SELECT ro.NkrID, ${raporOnayNormExpr} AS NormFmt,
        CASE
          WHEN SUM(CASE WHEN ro.Durum IN (N'Yayınlandı', N'Yayinlandi') THEN 1 ELSE 0 END) > 0 THEN N'Yayınlandı'
          WHEN SUM(CASE WHEN ro.Durum IN (N'Arşiv', N'Arsiv') THEN 1 ELSE 0 END) > 0 THEN N'Arşiv'
          WHEN SUM(CASE WHEN ro.Durum = N'Ödeme bekliyor' THEN 1 ELSE 0 END) > 0 THEN N'Ödeme bekliyor'
          WHEN SUM(CASE WHEN ro.Durum IN (N'Onaylandı', N'Onaylandi') THEN 1 ELSE 0 END) > 0 THEN N'Onaylandı'
          ELSE MAX(ro.Durum)
        END AS RaporOnayDurum,
        MAX(ro.OnayTarihi) AS OnayTarihi,
        COALESCE(
          MAX(CASE WHEN ro.Durum IN (N'Yayınlandı', N'Yayinlandi') THEN ro.YayinUrl END),
          MAX(ro.YayinUrl)
        ) AS YayinUrl,
        ${hasDisRaporKodu ? `MAX(ro.DisRaporKodu)` : `CAST(NULL AS NVARCHAR(40))`} AS DisRaporKodu
        ,MAX(CASE WHEN (${raporOnayIsEnglishExpr}) AND ro.Durum IN (N'Yayınlandı', N'Yayinlandi') THEN 1 ELSE 0 END) AS EnYayinlandi
        ,MAX(CASE WHEN NOT (${raporOnayIsEnglishExpr}) AND ro.Durum IN (N'Yayınlandı', N'Yayinlandi') THEN 1 ELSE 0 END) AS TrYayinlandi
      INTO #OS
      FROM NKR_RaporOnay ro
      WHERE EXISTS (SELECT 1 FROM #Rap r WHERE r.NkrID = ro.NkrID)
      GROUP BY ro.NkrID, ${raporOnayNormExpr};` : ``}

      ${hasOverrideTable ? `SELECT o.NkrID, ${bucketSql("o.RaporFormati")} AS NormFmt,
        MAX(o.Durum) AS OverrideDurum${hasOverrideNotlar ? `,
        MAX(o.Notlar) AS GeriGonderNotu` : ``}
      INTO #OV
      FROM NKR_RaporDurumOverride o
      WHERE EXISTS (SELECT 1 FROM #Rap r WHERE r.NkrID = o.NkrID)
      GROUP BY o.NkrID, ${bucketSql("o.RaporFormati")};` : ``}

      WITH WithStats AS (
        SELECT
          r.*,
          COALESCE(hs.HizmetSayisi, 0)  AS HizmetSayisi,
          COALESCE(hs.SonucluSayisi, 0) AS SonucluSayisi,
          ${hasOverrideTable ? `ov.OverrideDurum` : `NULL`} AS OverrideDurum,
          ${hasOverrideNotlar ? `ov.GeriGonderNotu` : `NULL`} AS GeriGonderNotu,
          ${hasRaporOnay ? `os.RaporOnayDurum` : `NULL`} AS RaporOnayDurum,
          ${hasRaporOnay ? `os.OnayTarihi` : `NULL`} AS OnayTarihi,
          ${hasRaporOnay ? `os.YayinUrl` : `NULL`} AS YayinUrl,
          ${hasDisRaporKodu ? `os.DisRaporKodu` : `CAST(NULL AS NVARCHAR(40))`} AS DisRaporKodu,
          ${hasRaporOnay ? `COALESCE(os.TrYayinlandi, 0)` : `0`} AS TrYayinlandi,
          ${hasRaporOnay ? `COALESCE(os.EnYayinlandi, 0)` : `0`} AS EnYayinlandi,
          hs.MaxTermin AS MaxTermin
        FROM #Rap r
        LEFT JOIN #HS hs ON hs.NkrID = r.NkrID AND hs.RaporFormati = r.RaporFormati
        ${hasRaporOnay ? `LEFT JOIN #OS os ON os.NkrID = r.NkrID AND os.NormFmt = r.NormFmt` : ``}
        ${hasOverrideTable ? `LEFT JOIN #OV ov ON ov.NkrID = r.NkrID AND ov.NormFmt = r.NormFmt` : ``}
      ),
      WithEffectiveDurum AS (
        SELECT *,
          -- NKR_RaporOnay (varsa) override'dan ÖNCE gelir: Onaylandı/Yayınlandı
          -- aksi halde override'tan Geri Gönderildi/Onay Bekleniyor
          -- aksi halde otomatik (Bekliyor / Analiz Devam Ediyor)
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
      Filtered AS (
        SELECT *
        FROM WithEffectiveDurum
        WHERE 1=1
          ${yearFilter}
          ${terminDateFilter}
          ${raporDurumuFilter}
          ${phaseFilter}
      ),
      Paged AS (
      SELECT *, COUNT(*) OVER() AS TotalCount
      FROM Filtered
      ORDER BY
        ${phase === "lab"
          ? `CASE WHEN MaxTermin IS NULL THEN 1 ELSE 0 END, MaxTermin ASC, RaporNo DESC,`
          : phase === "approved"
          ? `CASE WHEN OnayTarihi IS NULL THEN 1 ELSE 0 END, OnayTarihi DESC, RaporNo DESC,`
          : `RaporNo DESC,`}
        RaporFormati
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      )
      SELECT n.*, ${["lab", "returned", "approval"].includes(phase) ? "CAST(NULL AS NVARCHAR(40))" : `ISNULL(${effectiveOdemeExpr.replaceAll("n.ID", "n.NkrID")}, N'Fatura Kesilmedi')`} AS OdemeDurumu
      FROM Paged n
      ORDER BY ${phase === "lab" ? "CASE WHEN MaxTermin IS NULL THEN 1 ELSE 0 END, MaxTermin ASC," : phase === "approved" ? "CASE WHEN OnayTarihi IS NULL THEN 1 ELSE 0 END, OnayTarihi DESC," : ""} RaporNo DESC, RaporFormati;

      DROP TABLE #Rap;
      DROP TABLE #HS;
      ${hasRaporOnay ? `DROP TABLE #OS;` : ``}
      ${hasOverrideTable ? `DROP TABLE #OV;` : ``}
    `;

    const req = pool.request()
      .input("offset", offset)
      .input("limit",  limit);

    if (grup) req.input("grup", grup);
    if (search) req.input("search", `%${search}%`);
    if (year) req.input("year", parseInt(year));
    if (terminDate) req.input("terminDate", terminDate);
    if (raporTuru) req.input("raporTuru", raporTuru);

    const result = await req.query(query);

    // Çok-statement batch'te (SELECT INTO + final SELECT + DROP) bizim veri
    // setimiz TotalCount içeren recordset'tir.
    const recordsets = (result.recordsets as unknown as Record<string, unknown>[][]) || [];
    const rows =
      recordsets.find((rs) => rs && rs.length > 0 && "TotalCount" in rs[0]) ??
      recordsets[recordsets.length - 1] ??
      result.recordset ??
      [];

    const total = Number(rows[0]?.TotalCount ?? 0);

    const data = rows.map(({ TotalCount: _t, NormFmt: _nf, HizmetSayisi, SonucluSayisi, EffectiveDurum, ...row }: any) => ({
      ...row,
      RaporDurumu:
        EffectiveDurum === "Tamamlandi" || EffectiveDurum === "Tamamlandı"
          ? "Onay Bekleniyor"
          : EffectiveDurum === "Devam Ediyor"
          ? "Analiz Devam Ediyor"
          : (EffectiveDurum
              ?? (HizmetSayisi === 0      ? "Bekliyor"
              : SonucluSayisi === 0   ? "Bekliyor"
              : "Analiz Devam Ediyor")),
      HizmetSayisi:  Number(HizmetSayisi  ?? 0),
      SonucluSayisi: Number(SonucluSayisi ?? 0),
    }));

    return Response.json({ data, total, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    console.error("rapor-takip GET error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
