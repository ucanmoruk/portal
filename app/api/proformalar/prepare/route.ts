import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const evrakNo = request.nextUrl.searchParams.get("evrakNo")?.trim() || "";
  const teklifId = request.nextUrl.searchParams.get("teklifId")?.trim() || "";

  if (!evrakNo) return Response.json({ error: "Evrak no zorunludur." }, { status: 400 });

  try {
    const pool = await poolPromise;

    const firmaRes = await pool.request()
      .input("evrakNo", evrakNo)
      .query(`
        SELECT TOP 1
          f.ID, ISNULL(f.Ad, '') AS Ad, ISNULL(f.Email, '') AS Email,
          ISNULL(f.Telefon, '') AS Telefon, ISNULL(f.Adres, '') AS Adres,
          ISNULL(f.VergiDairesi, '') AS VergiDairesi, ISNULL(f.VergiNo, '') AS VergiNo
        FROM NKR n
        LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
        WHERE n.Evrak_No = @evrakNo AND n.Durum = 'Aktif'
        ORDER BY n.ID
      `);

    const servicesRes = await pool.request()
      .input("evrakNo", evrakNo)
      .query(`
        SELECT
          x1.AnalizID AS HizmetID,
          ISNULL(s.Kod, '') AS HizmetKodu,
          ISNULL(s.Ad, '') AS HizmetAdi,
          COUNT(*) AS Adet,
          STRING_AGG(CAST(n.RaporNo AS text), ', ') AS RaporNoListesi,
          STRING_AGG(CAST(n.Numune_Adi AS text), ', ') AS NumuneListesi
        FROM NKR n
        INNER JOIN NumuneX1 x1 ON x1.RaporID = n.ID
        LEFT JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
        WHERE n.Evrak_No = @evrakNo AND n.Durum = 'Aktif'
        GROUP BY x1.AnalizID, s.Kod, s.Ad
        ORDER BY s.Ad
      `);

    let teklif: any = null;
    let teklifLines: any[] = [];
    if (teklifId && !isNaN(Number(teklifId))) {
      const teklifRes = await pool.request()
        .input("id", Number(teklifId))
        .query(`
          SELECT TOP 1 t.ID, t.TeklifNo, t.RevNo, t.MusteriID, ISNULL(m.Ad, '') AS MusteriAd,
                 ISNULL(t.KdvOran, 20) AS KdvOran, ISNULL(t.GenelIskonto, 0) AS GenelIskonto
          FROM TeklifX1 t
          LEFT JOIN RootTedarikci m ON m.ID = t.MusteriID
          WHERE t.ID = @id
        `);
      teklif = teklifRes.recordset[0] || null;
      const linesRes = await pool.request()
        .input("id", Number(teklifId))
        .query(`
          SELECT HizmetID, HizmetAdi, Fiyat, ParaBirimi, Iskonto
          FROM TeklifX2
          WHERE TeklifID = @id
        `);
      teklifLines = linesRes.recordset;
    }

    const lines = servicesRes.recordset.map((line: any) => {
      const match = teklifLines.find((t: any) =>
        (t.HizmetID && line.HizmetID && Number(t.HizmetID) === Number(line.HizmetID)) ||
        (t.HizmetAdi && line.HizmetAdi && String(t.HizmetAdi).trim().toLowerCase() === String(line.HizmetAdi).trim().toLowerCase())
      );
      return {
        hizmetId: line.HizmetID,
        hizmetKodu: line.HizmetKodu,
        hizmetAdi: line.HizmetAdi,
        raporNoListesi: line.RaporNoListesi,
        numuneListesi: line.NumuneListesi,
        adet: Number(line.Adet || 1),
        birimFiyat: match?.Fiyat ?? "",
        paraBirimi: match?.ParaBirimi || "TRY",
        iskonto: match?.Iskonto ?? 0,
        kaynak: match ? "Teklif" : "Numune",
      };
    });

    return Response.json({
      evrakNo,
      firma: firmaRes.recordset[0] || null,
      teklif,
      kdvOran: teklif?.KdvOran ?? 20,
      genelIskonto: teklif?.GenelIskonto ?? 0,
      satirlar: lines,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
