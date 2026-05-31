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
    const acceptedOnly = searchParams.get("acceptedOnly") === "1";
    // phase: "lab" → sonuç giriş aşamasındaki kayıtlar (Bekliyor + Analiz Devam Ediyor),
    //        "approval" → Onaya Gönder'le gelmiş kayıtlar (Onay Bekleniyor)
    const phase = (searchParams.get("phase") || "").trim();
    const offset      = (page - 1) * limit;

    const pool = await poolPromise;

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
      ? "AND EffectiveDurum IN (N'Onayland\u0131', N'Yay\u0131nland\u0131')"
      : "";

    // Kayıtlı (Kullanıcı Kaydet bastı) sonuç sayısı:
    // - SonucKayitTarihi kolonu varsa → NULL olmayanlar
    // - Yoksa eski davranış: Sonuc dolu olanlar
    const sonucCountExpr = hasKayitTarihi
      ? `(SELECT COUNT(*) FROM NumuneX1 x2
           INNER JOIN StokAnalizListesi s2 ON s2.ID = x2.AnalizID
           WHERE x2.RaporID = r.NkrID AND s2.RaporFormati = r.RaporFormati
             AND x2.[SonucKayitTarihi] IS NOT NULL)`
      : hasSonuc
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
    const overrideNotluSelectExpr = hasOverrideNotlar
      ? `(
            SELECT MAX(o.Notlar)
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
          s.RaporFormati,
          ${hasLabKabul ? `CONVERT(varchar(10), lk.KabulTarihi, 23)` : `NULL`} AS KabulTarihi
        FROM NKR n
        LEFT JOIN RootTedarikci f  ON f.ID = n.Firma_ID
        LEFT JOIN NumuneDetay   nd ON nd.RaporID = n.ID
        LEFT JOIN RootTedarikci p  ON p.ID = nd.ProjeID
        INNER JOIN NumuneX1         x1 ON x1.RaporID  = n.ID
        INNER JOIN StokAnalizListesi s  ON s.ID = x1.AnalizID
          AND s.RaporFormati IS NOT NULL AND s.RaporFormati != ''
        ${hasLabKabul ? `${acceptedOnly ? "INNER" : "LEFT"} JOIN NKR_LabKabul lk ON lk.NkrID = n.ID AND lk.RaporFormati = s.RaporFormati` : ""}
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
          ${overrideNotluSelectExpr} AS GeriGonderNotu,
          ${hasRaporOnay ? `(
            SELECT MAX(ro.Durum) FROM NKR_RaporOnay ro
            WHERE ro.NkrID = r.NkrID
              AND UPPER(REPLACE(ro.RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(r.RaporFormati, N'Ü', N'U'))
          )` : `NULL`} AS RaporOnayDurum,
          (SELECT MAX(CONVERT(varchar(10), x3.Termin, 23)) FROM NumuneX1 x3
             INNER JOIN StokAnalizListesi s3 ON s3.ID = x3.AnalizID
             WHERE x3.RaporID = r.NkrID AND s3.RaporFormati = r.RaporFormati
               AND x3.Termin IS NOT NULL) AS MaxTermin
        FROM Raporlar r
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

    const data = result.recordset.map(({ TotalCount: _t, HizmetSayisi, SonucluSayisi, EffectiveDurum, ...row }) => ({
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
