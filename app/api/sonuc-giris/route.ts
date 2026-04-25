import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// ── GET /api/sonuc-giris — Numune bazlı gruplu liste ─────────────────────────
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page   = Math.max(1, parseInt(searchParams.get("page")  || "1"));
  const limit  = Math.min(50, Math.max(5, parseInt(searchParams.get("limit") || "10")));
  const search = (searchParams.get("search") || "").trim();
  const year   = (searchParams.get("year")   || "").trim();
  const durum  = searchParams.get("durum") || "YeniDevam";
  const offset = (page - 1) * limit;

  try {
    const pool = await poolPromise;

    // Opsiyonel kolonlar
    const colRes = await pool.request().query(
      `SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX1')
       AND name IN ('SonucEn','LimitEn','BirimEn','HizmetDurum')`
    );
    const x1Cols        = new Set<string>(colRes.recordset.map((r: any) => r.name as string));
    const hasSonucEn    = x1Cols.has("SonucEn");
    const hasLimitEn    = x1Cols.has("LimitEn");
    const hasBirimEn    = x1Cols.has("BirimEn");
    const hasHizmetDurum = x1Cols.has("HizmetDurum");
    const aktifDurumlar = "'Yeni','YeniAnaliz','Devam','Devam Ediyor'";
    const hizmetDurumPriorityExpr = hasHizmetDurum
      ? `CASE
          WHEN x1.HizmetDurum IN ('Yeni','YeniAnaliz') THEN 0
          WHEN x1.HizmetDurum IS NULL OR x1.HizmetDurum IN ('Devam','Devam Ediyor') THEN 1
          WHEN x1.HizmetDurum = 'Tamamlandı' THEN 2
          ELSE 1
        END`
      : "1";

    // WHERE koşulları
    const whereClauses: string[] = ["n.Durum = 'Aktif'"];

    if (search) {
      whereClauses.push(`(
        n.Evrak_No   LIKE N'%' + @search + '%'
        OR n.RaporNo      LIKE N'%' + @search + '%'
        OR n.Numune_Adi   LIKE N'%' + @search + '%'
        OR s.Ad           LIKE N'%' + @search + '%'
        OR s.Kod          LIKE N'%' + @search + '%'
      )`);
    }

    // Yıl filtresi: termin yılı öncelikli, yoksa numune tarihi
    if (year) {
      whereClauses.push(`YEAR(ISNULL(x1.Termin, n.Tarih)) = @year`);
    }

    if (durum === "Tamamlandı" && hasHizmetDurum) {
      whereClauses.push(`x1.HizmetDurum = 'Tamamlandı'`);
    } else if (durum === "YeniDevam" && hasHizmetDurum) {
      whereClauses.push(`(x1.HizmetDurum IS NULL OR x1.HizmetDurum IN (${aktifDurumlar}))`);
    }

    const where = whereClauses.join(" AND ");

    // Ortak parametre helper
    const addParams = (req: any) => {
      if (search) req.input("search", search);
      if (year)   req.input("year", parseInt(year));
      return req;
    };

    // ── 1. Toplam numune sayısı ─────────────────────────────────────────────
    const countReq = addParams(pool.request());
    const countRes = await countReq.query(`
      SELECT COUNT(DISTINCT n.ID) AS total
      FROM NKR n
      JOIN NumuneX1 x1 ON x1.RaporID = n.ID
      LEFT JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      WHERE ${where}
    `);
    const total = countRes.recordset[0]?.total || 0;

    // ── 2. Sayfalanmış NkrID listesi (en yakın terminden sırala) ───────────
    const nkrReq = addParams(pool.request())
      .input("rn_from", offset + 1)
      .input("rn_to",   offset + limit);

    const nkrRes = await nkrReq.query(`
      WITH NkrMin AS (
        SELECT
          n.ID AS NkrID,
          MIN(CASE
            WHEN x1.Termin IS NULL THEN CAST('9999-12-31' AS DATE)
            ELSE CAST(x1.Termin AS DATE)
          END) AS MinTermin,
          MIN(${hizmetDurumPriorityExpr}) AS DurumPriority
        FROM NKR n
        JOIN NumuneX1 x1 ON x1.RaporID = n.ID
        LEFT JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
        WHERE ${where}
        GROUP BY n.ID
      ),
      Ranked AS (
        SELECT NkrID, ROW_NUMBER() OVER (ORDER BY DurumPriority ASC, MinTermin ASC, NkrID DESC) AS rn
        FROM NkrMin
      )
      SELECT NkrID FROM Ranked WHERE rn >= @rn_from AND rn <= @rn_to
    `);

    const nkrIds: number[] = nkrRes.recordset.map((r: any) => r.NkrID as number);

    // ── 3. Hizmet satırları (sadece eşleşen numuneler) ─────────────────────
    let groups: any[] = [];

    if (nkrIds.length > 0) {
      const inList  = nkrIds.join(","); // integer ID'ler, injection riski yok
      const dataReq = addParams(pool.request());

      const dataRes = await dataReq.query(`
        SELECT
          x1.ID                                           AS X1ID,
          n.ID                                            AS NkrID,
          n.Tarih,
          n.Evrak_No,
          n.RaporNo,
          n.Numune_Adi,
          s.ID                                            AS HizmetID,
          s.Kod,
          s.Ad                                            AS HizmetAd,
          s.Akreditasyon,
          s.Method                                        AS Metot,
          x1.Birim,
          x1.Limit                                        AS LimitDeger,
          x1.Termin,
          x1.Sonuc,
          x1.Degerlendirme,
          ${hasSonucEn  ? "ISNULL(x1.SonucEn,  '')" : "''"} AS SonucEn,
          ${hasLimitEn  ? "ISNULL(x1.LimitEn,  '')" : "''"} AS LimitEn,
          ${hasBirimEn  ? "ISNULL(x1.BirimEn,  '')" : "''"} AS BirimEn,
          ${hasHizmetDurum ? "x1.HizmetDurum"        : "'Devam'"} AS Durum,
          ISNULL(y.Ad, '')                                AS YetkiliAd
        FROM NKR n
        JOIN NumuneX1 x1 ON x1.RaporID = n.ID
        LEFT JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
        LEFT JOIN RootKullanici y ON y.ID = s.YetkiliID
        WHERE n.ID IN (${inList}) AND ${where}
        ORDER BY
          n.ID,
          ${hizmetDurumPriorityExpr} ASC,
          CASE WHEN x1.Termin IS NULL THEN 1 ELSE 0 END ASC,
          x1.Termin ASC,
          x1.ID
      `);

      // NkrID'ye göre grupla
      const groupMap = new Map<number, any>();
      for (const row of dataRes.recordset) {
        if (!groupMap.has(row.NkrID)) {
          groupMap.set(row.NkrID, {
            NkrID:       row.NkrID,
            Tarih:       row.Tarih,
            Evrak_No:    row.Evrak_No,
            RaporNo:     row.RaporNo,
            Numune_Adi:  row.Numune_Adi,
            hizmetler:   [],
          });
        }
        groupMap.get(row.NkrID).hizmetler.push({
          X1ID:          row.X1ID,
          Kod:           row.Kod,
          HizmetAd:      row.HizmetAd,
          Akreditasyon:  row.Akreditasyon,
          Metot:         row.Metot,
          Birim:         row.Birim,
          LimitDeger:    row.LimitDeger,
          Termin:        row.Termin,
          Sonuc:         row.Sonuc,
          Degerlendirme: row.Degerlendirme,
          SonucEn:       row.SonucEn,
          LimitEn:       row.LimitEn,
          BirimEn:       row.BirimEn,
          Durum:         row.Durum,
          YetkiliAd:     row.YetkiliAd,
        });
      }

      // Termin sıralamasını koru
      groups = nkrIds.map(id => groupMap.get(id)).filter(Boolean);
    }

    return Response.json({
      data:       groups,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
