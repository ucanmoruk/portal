import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/talepler?tur=Analiz|Destek&search=&page=1&limit=20
//
// Müşteri portalında oluşturulan TALEPLER (Analiz / Destek).
// Analiz için cosmoroot.VIEW_TALEP_LISTE (Tur='Analiz' filtreli) kullanılır.
// Destek için dbo.Talep'ten doğrudan (Tur='Destek', Durum<>'Pasif').
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const sp     = request.nextUrl.searchParams;
  const tur    = (sp.get("tur") || "Analiz").trim();
  const search = sp.get("search")?.trim() || "";
  const durum  = sp.get("durum")?.trim() || "";
  const page   = Math.max(1, parseInt(sp.get("page")  || "1",  10));
  const limit  = Math.min(100, Math.max(5, parseInt(sp.get("limit") || "20", 10)));
  const offset = (page - 1) * limit;

  if (tur !== "Analiz" && tur !== "Destek") {
    return Response.json({ error: "Geçersiz tur (Analiz | Destek)." }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;

    if (tur === "Analiz") {
      // Analiz: cosmoroot.VIEW_TALEP_LISTE (kolon adlarında boşluk var)
      const searchClause = search
        ? `AND (
            LOWER(ISNULL(v.[Talep No], '')) LIKE LOWER(@searchLike)
            OR LOWER(ISNULL(v.FirmaKodu, '')) LIKE LOWER(@searchLike)
            OR LOWER(ISNULL(v.[Talep Oluşturan], '')) LIKE LOWER(@searchLike)
            OR LOWER(ISNULL(v.[Müşteri], '')) LIKE LOWER(@searchLike)
            OR LOWER(ISNULL(v.Durum, '')) LIKE LOWER(@searchLike)
          )`
        : "";
      const durumClause = durum ? `AND ISNULL(v.Durum, '') = @durum` : "";

      const [countRes, dataRes] = await Promise.all([
        pool.request().input("searchLike", `%${search}%`).input("durum", durum).query(`
          SELECT COUNT(*) AS total FROM cosmoroot.VIEW_TALEP_LISTE v
          WHERE 1 = 1 ${searchClause} ${durumClause}
        `),
        pool.request().input("searchLike", `%${search}%`).input("durum", durum).input("offset", offset).input("limit", limit).query(`
          SELECT
            v.ID,
            v.[Talep No]          AS TalepNo,
            -- İç takip kodu: '26' + dbo.Talep.TalepNo (sayı). Eski "UQ193" view'da
            -- dış kod olarak görünür; iç kod = "26193".
            N'26' + CAST(t.TalepNo AS NVARCHAR(20)) AS IcTakipNo,
            FORMAT(v.Tarih, 'dd.MM.yyyy') AS Tarih,
            v.FirmaKodu,
            v.[Talep Oluşturan]   AS TalepOlusturan,
            v.[Müşteri]            AS Musteri,
            v.Durum,
            v.FirmaID
          FROM cosmoroot.VIEW_TALEP_LISTE v
          INNER JOIN dbo.Talep t ON t.ID = v.ID
          WHERE 1 = 1 ${searchClause} ${durumClause}
          ORDER BY v.Tarih DESC, v.ID DESC
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `),
      ]);

      const total = countRes.recordset[0].total;
      return Response.json({
        data: dataRes.recordset, total, page, limit, totalPages: Math.ceil(total / limit),
      });
    }

    // Destek: dbo.Talep WHERE Tur='Destek' (view yok)
    const searchClause = search
      ? `AND (
          LOWER(ISNULL(COALESCE(t.DisTalepKodu, CAST(t.TalepNo AS NVARCHAR(50))), '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(t.FirmaKodu, '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(f.Firma_Adi, '')) LIKE LOWER(@searchLike)
          OR LOWER(ISNULL(t.Durum, '')) LIKE LOWER(@searchLike)
        )`
      : "";
    const durumClause = durum ? `AND ISNULL(t.Durum, '') = @durum` : "";

    const [countRes, dataRes] = await Promise.all([
      pool.request().input("searchLike", `%${search}%`).input("durum", durum).query(`
        SELECT COUNT(*) AS total
        FROM dbo.Talep t
        LEFT JOIN dbo.Firma f ON f.Kod = t.FirmaKodu
        WHERE t.Tur = N'Destek' AND ISNULL(t.Durum, '') <> N'Pasif' ${searchClause} ${durumClause}
      `),
      pool.request().input("searchLike", `%${search}%`).input("durum", durum).input("offset", offset).input("limit", limit).query(`
        SELECT
          t.ID,
          COALESCE(t.DisTalepKodu, N'26' + CAST(t.TalepNo AS NVARCHAR(20))) AS TalepNo,
          N'26' + CAST(t.TalepNo AS NVARCHAR(20)) AS IcTakipNo,
          FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
          t.FirmaKodu,
          ISNULL(f.Firma_Adi, '')   AS TalepOlusturan,
          ISNULL(f.Firma_Adi, '')   AS Musteri,
          t.Durum,
          f.ID                       AS FirmaID
        FROM dbo.Talep t
        LEFT JOIN dbo.Firma f ON f.Kod = t.FirmaKodu
        WHERE t.Tur = N'Destek' AND ISNULL(t.Durum, '') <> N'Pasif' ${searchClause} ${durumClause}
        ORDER BY t.Tarih DESC, t.ID DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `),
    ]);

    const total = countRes.recordset[0].total;
    return Response.json({
      data: dataRes.recordset, total, page, limit, totalPages: Math.ceil(total / limit),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
