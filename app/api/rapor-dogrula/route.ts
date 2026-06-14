import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/rapor-dogrula?raporNo=...&token=...[&auth=...]   (AUTH GEREKTİRMEZ)
//
// İki kullanım:
//   1) QR ile: URL otomatik raporNo + token (8 karakter doğrulama kodu) + auth
//      (24 karakter tam KarekodToken) taşır. Müşteri sadece "Doğrula"ya basar.
//   2) Manuel: müşteri raporNo + token (QR altındaki 8 karakterlik kod) elle girer.
//
// raporNo iki formatta gelebilir:
//   - Yeni: ÜGAM/RR26/XXXX/NN  (NKR_RaporOnay.DisRaporKodu + /Rev)
//   - Eski/iç: NKR.RaporNo     (örn "26060126")
//
// token iki şekilde gelebilir:
//   - 8 karakter alfasayısal (I,L,O,0,1 yok) → KarekodToken'dan türetilen kod
//   - >16 karakter → doğrudan KarekodToken (eski uyumluluk)
// auth ek olarak gelirse her zaman tam KarekodToken sayılır (güçlü doğrulama).
//
// Yalnızca "Yayınlandı" (PDF FTP'ye yüklenmiş) raporlar valid sayılır.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// raporViewData.ts ile birebir aynı türetim — değiştirmek tehlikeli (mevcut QR'leri bozar).
function deriveDogrulamaKod(token: string): string {
  return token
    .replace(/[^A-Z0-9]/gi, "")
    .replace(/[ILO01]/gi, "")
    .toUpperCase()
    .slice(0, 8)
    .padEnd(8, "X");
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const raporNoInput = (sp.get("raporNo") || "").trim();
  const tokenInput = (sp.get("token") || "").trim();
  const authToken = (sp.get("auth") || "").trim();

  if (!raporNoInput || !tokenInput) {
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

    // DisRaporKodu kolonu var mı? (Migration 018)
    const disKodCol = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = 'NKR_RaporOnay' AND COLUMN_NAME = 'DisRaporKodu'`,
    );
    const hasDisKod = disKodCol.recordset.length > 0;

    // raporNo eşleşmesi: kullanıcı ÜGAM/RR26/XXXX/NN (revizyon dahil) veya ÜGAM/RR26/XXXX
    // (revizyonsuz) veya iç RaporNo girmiş olabilir. Hepsini tek WHERE'de karşıla.
    const raporNoFilter = hasDisKod
      ? `(
          CAST(n.RaporNo AS NVARCHAR(50)) = @raporNo
          OR o.DisRaporKodu = @raporNo
          OR o.DisRaporKodu + '/' + RIGHT('00' + CAST(ISNULL(n.Revno, 0) AS NVARCHAR(2)), 2) = @raporNo
        )`
      : `CAST(n.RaporNo AS NVARCHAR(50)) = @raporNo`;

    // Token eşleşmesi: önce authToken (varsa tam token), sonra tokenInput'un
    // ya KarekodToken ya da türetilen 8-karakter dogrulamaKod olduğu varsayımıyla
    // tüm raporNo eşleşmelerini çekip JS tarafında karşılaştır.
    const r = await pool.request()
      .input("raporNo", raporNoInput)
      .query(`
        SELECT
          o.KarekodToken,
          n.RaporNo,
          ISNULL(n.Revno, 0)                        AS RevizyonNo,
          CONVERT(varchar(10), o.YayinTarihi, 104)  AS YayinTarihi,
          ISNULL(f.Firma_Adi, '')                   AS FirmaAd,
          ISNULL(n.Numune_Adi, '')                  AS NumuneAd,
          o.RaporFormati,
          o.Durum,
          o.YayinUrl
          ${hasDisKod ? ", o.DisRaporKodu" : ""}
        FROM NKR_RaporOnay o
        INNER JOIN NKR n ON n.ID = o.NkrID
        LEFT JOIN Firma f ON f.ID = n.Firma_ID
        WHERE ${raporNoFilter}
      `);

    if (r.recordset.length === 0) {
      return Response.json({ valid: false }, { headers: CORS });
    }

    // Token karşılaştırması (case-insensitive 8-karakter kod için)
    const tokenUpper = tokenInput.toUpperCase();
    const isLikelyFullToken = tokenInput.length >= 16;

    const matchRow = r.recordset.find((row: any) => {
      const dbToken = String(row.KarekodToken || "");
      // 1) authToken (URL'de QR'den) varsa — daima tam token kontrol et
      if (authToken && dbToken === authToken) return true;
      // 2) tokenInput tam token uzunluğunda → direkt karşılaştır
      if (isLikelyFullToken && dbToken === tokenInput) return true;
      // 3) tokenInput 8-karakter doğrulama kodu → türet + karşılaştır
      const derived = deriveDogrulamaKod(dbToken);
      return derived === tokenUpper;
    });

    if (!matchRow) {
      return Response.json({ valid: false }, { headers: CORS });
    }

    const yayinlandi = matchRow.Durum === "Yayınlandı" && !!matchRow.YayinUrl;
    if (!yayinlandi) {
      return Response.json(
        { valid: false, durum: matchRow.Durum, error: "Rapor henüz yayınlanmadı." },
        { headers: CORS },
      );
    }

    // Müşteriye dönen raporNo dış kod öncelikli (DisRaporKodu/RevNo)
    const disKodLabel = hasDisKod && matchRow.DisRaporKodu
      ? `${matchRow.DisRaporKodu}/${String(matchRow.RevizyonNo).padStart(2, "0")}`
      : null;

    return Response.json(
      {
        valid: true,
        raporNo: disKodLabel || String(matchRow.RaporNo),
        icRaporNo: String(matchRow.RaporNo),
        disRaporKodu: disKodLabel,
        revizyonNo: Number(matchRow.RevizyonNo ?? 0),
        yayinTarihi: matchRow.YayinTarihi,
        firmaAd: matchRow.FirmaAd,
        numuneAd: matchRow.NumuneAd,
        raporFormati: matchRow.RaporFormati,
        durum: matchRow.Durum,
        pdfUrl: matchRow.YayinUrl,
      },
      { headers: CORS },
    );
  } catch (e: any) {
    return Response.json({ valid: false, error: e.message }, { status: 500, headers: CORS });
  }
}
