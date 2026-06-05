import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// ----------------------------------------------------------------
// GET  /api/numune-kabul?search=&page=1&limit=20
//
// Sayfalama: Evrak_No grubu başına 1 sayfa birimi.
// Yanıt: { data: EvrakGroup[], total, page, limit, totalPages }
// EvrakGroup: { evrakNo, tarih, firmaAd, projeAd, numuneSayisi,
//               odemeDurumu, numuneler: NumuneItem[] }
// ----------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp     = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || "";
  const page   = Math.max(1, parseInt(sp.get("page")  || "1",  10));
  const limit  = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  // ── Filtreler ──
  const tarihBas    = sp.get("tarihBas")?.trim()    || "";
  const tarihBit    = sp.get("tarihBit")?.trim()    || "";
  const odeme       = sp.get("odeme")?.trim()       || "";
  const raporDurumu = sp.get("raporDurumu")?.trim() || "";

  try {
    const pool = await cosmoPool;

    // Arama: Evrak_No, RaporNo, FirmaAd, NumuneAdi üzerinde
    const searchClause = search
      ? `AND (
          LOWER(ISNULL(CAST(n.Evrak_No AS NVARCHAR), '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(CAST(n.RaporNo AS NVARCHAR), '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(f.Ad, '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(n.Numune_Adi, '')) LIKE LOWER(@searchLike)
        )`
      : "";

    // Filtre cümlesi: tarih aralığı + rapor durumu (NKR satırı) + ödeme (Evrak bazında)
    const filterClause =
      (tarihBas    ? " AND CONVERT(date, n.Tarih) >= @tarihBas" : "") +
      (tarihBit    ? " AND CONVERT(date, n.Tarih) <= @tarihBit" : "") +
      (raporDurumu ? " AND ISNULL(n.Rapor_Durumu, '') = @raporDurumu" : "") +
      (odeme       ? " AND (SELECT TOP 1 Odeme_Durumu FROM Odeme WHERE Evrak_No = n.Evrak_No ORDER BY ID DESC) = @odeme" : "");

    // Filtre input'larını bir request'e ekler (yalnızca kullanılanlar)
    const addFilters = <T extends { input: (n: string, v: unknown) => T }>(req: T): T => {
      if (tarihBas)    req.input("tarihBas", tarihBas);
      if (tarihBit)    req.input("tarihBit", tarihBit);
      if (raporDurumu) req.input("raporDurumu", raporDurumu);
      if (odeme)       req.input("odeme", odeme);
      return req;
    };

    const baseJoin = `
      FROM NKR n
      LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f ON f.ID = n.Firma_ID
      WHERE n.Durum = 'Aktif' ${searchClause} ${filterClause}
    `;

    const signal = request.signal;

    // ── Query 1 + 2 paralel: Count ve sayfalanmış gruplar aynı anda ──
    const [countResult, groupResult] = await Promise.all([
      addFilters(pool.request()
        .input("search", search)
        .input("searchLike", `%${search}%`))
        .query(`SELECT COUNT(DISTINCT n.Evrak_No) AS total ${baseJoin}`),

      addFilters(pool.request()
        .input("search", search)
        .input("searchLike", `%${search}%`)
        .input("offset", offset)
        .input("limit",  limit))
        .query(`
          SELECT
            n.Evrak_No,
            MIN(CONVERT(varchar(10), n.Tarih, 120))  AS Tarih,
            MIN(f.Ad)                                 AS FirmaAd,
            COUNT(*)                                  AS NumuneSayisi,
            (
              SELECT TOP 1 Odeme_Durumu
              FROM Odeme
              WHERE Evrak_No = n.Evrak_No
              ORDER BY ID DESC
            )                                         AS Odeme_Durumu,
            (
              SELECT TOP 1 rt.Ad
              FROM   NKR n2
              LEFT JOIN NumuneDetay nd ON nd.RaporID = n2.ID
              LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) rt ON nd.ProjeID = rt.ID
              WHERE  n2.Evrak_No = n.Evrak_No AND n2.Durum = 'Aktif'
                AND  rt.Ad IS NOT NULL
            )                                         AS ProjeAd,
            CAST(CASE WHEN EXISTS (
              SELECT 1 FROM NKR_EvrakEslestirme
              WHERE EvrakNo = CAST(n.Evrak_No AS NVARCHAR(50))
                AND Tur IN (N'Teklif', N'Dosya')
            ) THEN 1 ELSE 0 END AS BIT)             AS HasEslestirme
          ${baseJoin}
          GROUP BY n.Evrak_No
          ORDER BY n.Evrak_No DESC
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `),
    ]);

    if (signal.aborted) return new Response(null, { status: 499 });

    const total  = countResult.recordset[0].total;
    const groups = groupResult.recordset as any[];

    // ── Query 3: Bu sayfadaki gruplara ait numuneler ──
    let numunesByEvrak: Record<string, any[]> = {};
    if (groups.length > 0) {
      const req3 = pool.request();
      const inParams = groups.map((g, i) => {
        req3.input(`ev${i}`, g.Evrak_No);
        return `@ev${i}`;
      }).join(", ");

      const numuneResult = await req3.query(`
        SELECT
          n.ID,
          n.Evrak_No,
          n.RaporNo,
          n.Numune_Adi,
          n.Grup,
          n.Tur
        FROM NKR n
        WHERE n.Durum = 'Aktif'
          AND n.Evrak_No IN (${inParams})
        ORDER BY n.Evrak_No DESC, n.RaporNo DESC
      `);

      for (const row of numuneResult.recordset) {
        if (!numunesByEvrak[row.Evrak_No]) numunesByEvrak[row.Evrak_No] = [];
        numunesByEvrak[row.Evrak_No].push(row);
      }
    }

    // ── Merge ──
    const data = groups.map(g => ({
      evrakNo:        g.Evrak_No,
      tarih:          g.Tarih,
      firmaAd:        g.FirmaAd,
      projeAd:        g.ProjeAd,
      numuneSayisi:   g.NumuneSayisi,
      odemeDurumu:    g.Odeme_Durumu,
      hasEslestirme:  Boolean(g.HasEslestirme),
      numuneler:      numunesByEvrak[g.Evrak_No] ?? [],
    }));

    return Response.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// POST /api/numune-kabul
// ----------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const body = await request.json();
    const { Tarih, Evrak_No, RaporNo, Firma_ID, Numune_Adi, Grup } = body;

    if (!Evrak_No?.trim())   return Response.json({ error: "Evrak No zorunludur."   }, { status: 400 });
    if (!RaporNo?.trim())    return Response.json({ error: "Rapor No zorunludur."   }, { status: 400 });
    if (!Numune_Adi?.trim()) return Response.json({ error: "Numune Adı zorunludur." }, { status: 400 });

    const pool = await cosmoPool;
    const result = await pool.request()
      .input("Tarih",      Tarih      || null)
      .input("Evrak_No",   Evrak_No.trim())
      .input("RaporNo",    RaporNo.trim())
      .input("Firma_ID",   Firma_ID ? parseInt(Firma_ID) : null)
      .input("Numune_Adi", Numune_Adi.trim())
      .input("Grup",       Grup       || null)
      .query(`
        INSERT INTO NKR (Tarih, Evrak_No, RaporNo, Firma_ID, Numune_Adi, Grup, Durum)
        OUTPUT INSERTED.ID
        VALUES (@Tarih, @Evrak_No, @RaporNo, @Firma_ID, @Numune_Adi, @Grup, 'Aktif')
      `);

    return Response.json({ id: result.recordset[0].ID }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
