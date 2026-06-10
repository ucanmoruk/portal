import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/rapor-dogrula?raporNo=26060126&token=<doğrulama kodu>   (AUTH GEREKTİRMEZ)
//
// Müşteri doğrulama akışı: QR okunca token otomatik dolar, müşteri Rapor No'yu
// elle girer. İKİSİ DE eşleşmeli. Yalnızca "Yayınlandı" (portala gönderilmiş)
// raporlar doğrulanır — onların PDF'i FTP'de mevcuttur.
//
// Yanıt (valid=true): raporNo, revizyonNo, yayinTarihi, firmaAd, numuneAd,
//                     raporFormati, durum, pdfUrl
//
// CORS açık (GET) → uniqueanalyse.com gibi başka bir origin'den tarayıcı JS'i
// doğrudan fetch edebilir.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const raporNo = (sp.get("raporNo") || "").trim();
  const token = (sp.get("token") || "").trim();

  if (!raporNo || !token) {
    return Response.json(
      { valid: false, error: "raporNo ve token gerekli" },
      { status: 400, headers: CORS },
    );
  }

  try {
    const pool = await cosmoPool;

    const tblCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`,
    );
    if (tblCheck.recordset.length === 0) {
      return Response.json(
        { valid: false, error: "Doğrulama sistemi hazır değil." },
        { status: 500, headers: CORS },
      );
    }

    const r = await pool.request()
      .input("token", token)
      .input("raporNo", raporNo)
      .query(`
        SELECT
          n.RaporNo,
          ISNULL(n.Revno, 0)                        AS RevizyonNo,
          CONVERT(varchar(10), o.YayinTarihi, 104)  AS YayinTarihi,
          ISNULL(f.Firma_Adi, '')                   AS FirmaAd,
          ISNULL(n.Numune_Adi, '')                  AS NumuneAd,
          o.RaporFormati,
          o.Durum,
          o.YayinUrl
        FROM NKR_RaporOnay o
        INNER JOIN NKR n ON n.ID = o.NkrID
        LEFT JOIN Firma f ON f.ID = n.Firma_ID
        WHERE o.KarekodToken = @token
          AND CAST(n.RaporNo AS NVARCHAR(50)) = @raporNo
      `);

    const row = r.recordset[0];

    // Eşleşme yok → geçersiz (rapor no veya doğrulama kodu hatalı).
    if (!row) {
      return Response.json({ valid: false }, { headers: CORS });
    }

    // Yalnızca yayınlanmış + PDF'i yüklenmiş raporlar "doğrulanmış" sayılır.
    const yayinlandi = row.Durum === "Yayınlandı" && !!row.YayinUrl;
    if (!yayinlandi) {
      return Response.json(
        { valid: false, durum: row.Durum, error: "Rapor henüz yayınlanmadı." },
        { headers: CORS },
      );
    }

    return Response.json(
      {
        valid: true,
        raporNo: String(row.RaporNo),
        revizyonNo: Number(row.RevizyonNo ?? 0),
        yayinTarihi: row.YayinTarihi,        // dd.MM.yyyy
        firmaAd: row.FirmaAd,
        numuneAd: row.NumuneAd,
        raporFormati: row.RaporFormati,
        durum: row.Durum,
        pdfUrl: row.YayinUrl,
      },
      { headers: CORS },
    );
  } catch (e: any) {
    return Response.json({ valid: false, error: e.message }, { status: 500, headers: CORS });
  }
}
