import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const evrakNo = request.nextUrl.searchParams.get("evrakNo")?.trim() || "";
  const teklifId = request.nextUrl.searchParams.get("teklifId")?.trim() || "";
  const nkrIds = Array.from(new Set(
    (request.nextUrl.searchParams.get("nkrIds") || "")
      .split(",")
      .map(x => Number(x.trim()))
      .filter(x => Number.isInteger(x) && x > 0)
  )).slice(0, 500);

  if (!evrakNo && nkrIds.length === 0) {
    return Response.json({ error: "Evrak no veya seçili numune bilgisi zorunludur." }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;
    const nkrWhere = nkrIds.length > 0
      ? `n.ID IN (${nkrIds.join(",")})`
      : `n.Evrak_No = @evrakNo`;

    const checkRes = await pool.request()
      .input("evrakNo", evrakNo)
      .query(`
        SELECT
          COUNT(*) AS KayitSayisi,
          COUNT(DISTINCT n.Firma_ID) AS FirmaSayisi
        FROM NKR n
        WHERE ${nkrWhere} AND n.Durum = 'Aktif'
      `);
    const check = checkRes.recordset[0] || {};
    if (Number(check.KayitSayisi || 0) === 0) {
      return Response.json({ error: "Seçilen numune kaydı bulunamadı." }, { status: 404 });
    }
    if (Number(check.FirmaSayisi || 0) > 1) {
      return Response.json({ error: "Tek proforma için aynı firmaya ait numuneleri seçmelisin." }, { status: 400 });
    }

    const evrakRes = await pool.request()
      .input("evrakNo", evrakNo)
      .query(`
        SELECT n.Evrak_No
        FROM NKR n
        WHERE ${nkrWhere} AND n.Durum = 'Aktif'
        GROUP BY n.Evrak_No
        ORDER BY MIN(n.ID)
      `);
    const evrakNos = (evrakRes.recordset || [])
      .map((r: { Evrak_No?: string | number | null }) => String(r.Evrak_No || "").trim())
      .filter(Boolean);
    const preparedEvrakNo = evrakNos.length <= 1
      ? (evrakNos[0] || evrakNo)
      : `Çoklu (${evrakNos.length} evrak)`;

    const firmaRes = await pool.request()
      .input("evrakNo", evrakNo)
      .query(`
        SELECT TOP 1
          f.ID, ISNULL(f.Ad, '') AS Ad, ISNULL(f.Email, '') AS Email,
          ISNULL(f.Telefon, '') AS Telefon, ISNULL(f.Adres, '') AS Adres,
          ISNULL(f.VergiDairesi, '') AS VergiDairesi, ISNULL(f.VergiNo, '') AS VergiNo
        FROM NKR n
        LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f ON f.ID = n.Firma_ID
        WHERE ${nkrWhere} AND n.Durum = 'Aktif'
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
          STRING_AGG(CAST(n.RaporNo AS NVARCHAR(MAX)), ', ') AS RaporNoListesi,
          STRING_AGG(CAST(n.Numune_Adi AS NVARCHAR(MAX)), ', ') AS NumuneListesi
        FROM NKR n
        INNER JOIN NumuneX1 x1 ON x1.RaporID = n.ID
        LEFT JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
        WHERE ${nkrWhere} AND n.Durum = 'Aktif'
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
          FROM TeklifBaslik t
          LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) m ON m.ID = t.MusteriID
          WHERE t.ID = @id
        `);
      teklif = teklifRes.recordset[0] || null;
      const linesRes = await pool.request()
        .input("id", Number(teklifId))
        .query(`
          SELECT HizmetID, HizmetAdi, Fiyat, ParaBirimi, Iskonto
          FROM TeklifKalem
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
      evrakNo: preparedEvrakNo,
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
