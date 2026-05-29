import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/rapor-takip/[nkrId]/onay-durum?format=Genel
// Onay sayfası açıldığında çağrılır — onay var mı, token ne, yayınlanmış mı?
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (!Number.isFinite(nkrIdNum)) return Response.json({ error: "Geçersiz NkrID" }, { status: 400 });
  const format = request.nextUrl.searchParams.get("format")?.trim() || "";
  if (!format) return Response.json({ error: "format gerekli" }, { status: 400 });

  try {
    const pool = await poolPromise;

    // NKR_RaporOnay tablosu yoksa onay yok demektir
    const tblCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
    );
    if (tblCheck.recordset.length === 0) {
      return Response.json({ onay: null, info: "NKR_RaporOnay tablosu yok" });
    }

    // Rapor + onay birlikte
    const r = await pool.request()
      .input("nkrId", nkrIdNum)
      .input("format", format)
      .query(`
        SELECT
          n.ID            AS NkrID,
          n.RaporNo,
          n.Numune_Adi,
          n.Tarih,
          ISNULL(f.Ad, '') AS FirmaAd,
          o.ID             AS OnayID,
          o.KarekodToken,
          o.Durum,
          o.OnayTarihi,
          o.YayinTarihi,
          o.YayinUrl,
          ISNULL(u.Ad, '') AS OnaylayanAd,
          ISNULL(u.Soyad, '') AS OnaylayanSoyad
        FROM NKR n
        LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
        LEFT JOIN NKR_RaporOnay o
          ON o.NkrID = n.ID
         AND UPPER(REPLACE(o.RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
        LEFT JOIN RootKullanici u ON u.ID = o.OnaylayanID
        WHERE n.ID = @nkrId AND n.Durum = 'Aktif'
      `);

    const row = r.recordset[0];
    if (!row) return Response.json({ error: "Rapor bulunamadı" }, { status: 404 });

    return Response.json({
      rapor: {
        NkrID: row.NkrID,
        RaporNo: row.RaporNo,
        NumuneAd: row.Numune_Adi,
        Tarih: row.Tarih,
        FirmaAd: row.FirmaAd,
        RaporFormati: format,
      },
      onay: row.OnayID
        ? {
            id: row.OnayID,
            token: row.KarekodToken,
            durum: row.Durum,
            onayTarihi: row.OnayTarihi,
            yayinTarihi: row.YayinTarihi,
            yayinUrl: row.YayinUrl,
            onaylayanAd: [String(row.OnaylayanAd ?? "").trim(), String(row.OnaylayanSoyad ?? "").trim()]
              .filter(Boolean).join(" ") || null,
          }
        : null,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
