import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

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
    const acceptedOnly = searchParams.get("acceptedOnly") === "1";
    // phase: "lab" → sonuç giriş aşamasındaki kayıtlar (Bekliyor + Analiz Devam Ediyor),
    //        "approval" → Onaya Gönder'le gelmiş kayıtlar (Onay Bekleniyor)
    const phase = (searchParams.get("phase") || "").trim();
    const offset      = (page - 1) * limit;

    const pool = await cosmoPool;

    // NKR_LabKabul tablosu opsiyonel — yoksa acceptedOnly filtresi yok sayılır.
    // Schema filtresi: Postgres mirror'da lowercase legacy tablolardan kaçınılır.
    const labKabulTblCheck = await pool.request().query(`
      SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'NKR_LabKabul' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')
    `);
    const hasLabKabul = labKabulTblCheck.recordset.length > 0;

    // NKR_RaporOnay (Onayla/Yayınla) opsiyonel
    const raporOnayTblCheck = await pool.request().query(`
      SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')
    `);
    const hasRaporOnay = raporOnayTblCheck.recordset.length > 0;

    // Migration 018: NKR_RaporOnay.DisRaporKodu — kolon yoksa null döner.
    const disRaporKoduCheck = await pool.request().query(`
      SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'NKR_RaporOnay' AND COLUMN_NAME = 'DisRaporKodu'
    `);
    const hasDisRaporKodu = hasRaporOnay && disRaporKoduCheck.recordset.length > 0;

    // NOT: Postgres mirror'da public şemasında lowercase legacy tablolar olabilir;
    // bizim hedeflediğimiz CamelCase kolonlu tablo dbo şemasındadır. Schema filtresi
    // olmazsa "tablo var" sanılıp sonra `o.NkrID does not exist` hatası alınır.
    const overrideTableCheck = await pool.request().query(`
      SELECT 1 AS x
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'NKR_RaporDurumOverride'
        AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')
    `);
    const hasOverrideTable = overrideTableCheck.recordset.length > 0;

    // Sonuc kolonu var mi?
    const sonucCheck = await pool.request().query(`
      SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'NumuneX1' AND COLUMN_NAME = 'Sonuc'
    `);
    const hasSonuc = sonucCheck.recordset.length > 0;

    // SonucKayitTarihi var mı? Saved-state'in yeni göstergesi
    const kayitCheck = await pool.request().query(`
      SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'NumuneX1' AND COLUMN_NAME = 'SonucKayitTarihi'
    `);
    const hasKayitTarihi = kayitCheck.recordset.length > 0;

    // DisRaporKodu (ÜGAM/RR26/XXXX) NKR_RaporOnay tablosunda — n.ID üzerinden
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
      : raporDurumu === "Analiz Devam Ediyor" || raporDurumu === "Devam Ediyor"
      ? "AND EffectiveDurum = N'Analiz Devam Ediyor'"
      : raporDurumu === "Onay Bekleniyor"
      ? "AND EffectiveDurum = N'Onay Bekleniyor'"
      : raporDurumu === "Onayland\u0131"
      ? "AND EffectiveDurum = N'Onayland\u0131'"
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
      ? "AND EffectiveDurum IN (N'Onayland\u0131', N'Yay\u0131nland\u0131', N'Ar\u015fiv')"
      : "";

    // Override tablosunda Notlar kolonu var mı? (Geri Gönder notu için)
    let hasOverrideNotlar = false;
    if (hasOverrideTable) {
      const r = await pool.request().query(
        `SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA IN ('dbo','cosmoroot')
           AND TABLE_NAME='NKR_RaporDurumOverride' AND COLUMN_NAME='Notlar'`
      );
      hasOverrideNotlar = r.recordset.length > 0;
    }

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
        n.Barkod,
        n.Numune_Adi,
        f.Ad                                    AS FirmaAd,
        p.Ad                                    AS ProjeAd,
        s.RaporFormati,
        UPPER(REPLACE(s.RaporFormati, N'Ü', N'U')) AS NormFmt,
        ${hasLabKabul ? `CONVERT(varchar(10), lk.KabulTarihi, 23)` : `NULL`} AS KabulTarihi
      INTO #Rap
      FROM NKR n
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f  ON f.ID = n.Firma_ID
      LEFT JOIN NumuneDetay   nd ON nd.RaporID = n.ID
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) p  ON p.ID = nd.ProjeID
      INNER JOIN NumuneX1         x1 ON x1.RaporID  = n.ID
      INNER JOIN StokAnalizListesi s  ON s.ID = x1.AnalizID
        AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
      ${hasLabKabul ? `${acceptedOnly ? "INNER" : "LEFT"} JOIN NKR_LabKabul lk ON lk.NkrID = n.ID AND lk.RaporFormati = s.RaporFormati` : ""}
      WHERE n.Durum = 'Aktif'
        ${searchFilter}
        ${raporTuruFilter};

      SELECT x.RaporID AS NkrID, s.RaporFormati,
        COUNT(*) AS HizmetSayisi,
        SUM(CASE WHEN ${savedCond} THEN 1 ELSE 0 END) AS SonucluSayisi,
        MAX(CONVERT(varchar(10), x.Termin, 23)) AS MaxTermin
      INTO #HS
      FROM NumuneX1 x
      INNER JOIN StokAnalizListesi s ON s.ID = x.AnalizID
        AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
      GROUP BY x.RaporID, s.RaporFormati;

      ${hasRaporOnay ? `SELECT ro.NkrID, UPPER(REPLACE(ro.RaporFormati, N'Ü', N'U')) AS NormFmt,
        MAX(ro.Durum) AS RaporOnayDurum,
        MAX(ro.YayinUrl) AS YayinUrl,
        ${hasDisRaporKodu ? `MAX(ro.DisRaporKodu)` : `CAST(NULL AS NVARCHAR(40))`} AS DisRaporKodu
      INTO #OS
      FROM NKR_RaporOnay ro
      GROUP BY ro.NkrID, UPPER(REPLACE(ro.RaporFormati, N'Ü', N'U'));` : ``}

      ${hasOverrideTable ? `SELECT o.NkrID, UPPER(REPLACE(o.RaporFormati, N'Ü', N'U')) AS NormFmt,
        MAX(o.Durum) AS OverrideDurum${hasOverrideNotlar ? `,
        MAX(o.Notlar) AS GeriGonderNotu` : ``}
      INTO #OV
      FROM NKR_RaporDurumOverride o
      GROUP BY o.NkrID, UPPER(REPLACE(o.RaporFormati, N'Ü', N'U'));` : ``}

      WITH WithStats AS (
        SELECT
          r.*,
          COALESCE(hs.HizmetSayisi, 0)  AS HizmetSayisi,
          COALESCE(hs.SonucluSayisi, 0) AS SonucluSayisi,
          ${hasOverrideTable ? `ov.OverrideDurum` : `NULL`} AS OverrideDurum,
          ${hasOverrideNotlar ? `ov.GeriGonderNotu` : `NULL`} AS GeriGonderNotu,
          ${hasRaporOnay ? `os.RaporOnayDurum` : `NULL`} AS RaporOnayDurum,
          ${hasRaporOnay ? `os.YayinUrl` : `NULL`} AS YayinUrl,
          ${hasDisRaporKodu ? `os.DisRaporKodu` : `CAST(NULL AS NVARCHAR(40))`} AS DisRaporKodu,
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
          ${raporDurumuFilter}
          ${phaseFilter}
      )
      SELECT *, COUNT(*) OVER() AS TotalCount
      FROM Filtered
      ORDER BY
        ${phase === "lab"
          ? `CASE WHEN MaxTermin IS NULL THEN 1 ELSE 0 END, MaxTermin ASC, RaporNo DESC,`
          : `RaporNo DESC,`}
        RaporFormati
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      DROP TABLE #Rap;
      DROP TABLE #HS;
      ${hasRaporOnay ? `DROP TABLE #OS;` : ``}
      ${hasOverrideTable ? `DROP TABLE #OV;` : ``}
    `;

    const req = pool.request()
      .input("offset", offset)
      .input("limit",  limit);

    if (search) req.input("search", `%${search}%`);
    if (year) req.input("year", parseInt(year));
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
