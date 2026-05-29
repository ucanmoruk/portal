import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

// GET /api/rapor-dogrula/[token]  (AUTH GEREKTİRMEZ)
// QR kodun gösterdiği public URL bu endpoint'i çağırır.
// Yanıt: rapor temel bilgisi + onay/yayın durumu.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const tok = (token || "").trim();
  if (!tok) {
    return Response.json({ valid: false, error: "Token boş" }, { status: 400 });
  }

  try {
    const pool = await poolPromise;

    const tblCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
    );
    if (tblCheck.recordset.length === 0) {
      return Response.json({ valid: false, error: "Doğrulama sistemi hazır değil." }, { status: 500 });
    }

    const r = await pool.request()
      .input("tok", tok)
      .query(`
        SELECT
          o.KarekodToken, o.RaporFormati, o.Durum,
          o.OnayTarihi, o.YayinTarihi,
          n.RaporNo, n.Numune_Adi, n.Tarih,
          ISNULL(f.Ad, '') AS FirmaAd,
          ISNULL(u.Ad, '')    AS OnaylayanAd,
          ISNULL(u.Soyad, '') AS OnaylayanSoyad
        FROM NKR_RaporOnay o
        INNER JOIN NKR n ON n.ID = o.NkrID
        LEFT JOIN RootTedarikci f ON f.ID = n.Firma_ID
        LEFT JOIN RootKullanici u ON u.ID = o.OnaylayanID
        WHERE o.KarekodToken = @tok
      `);

    const row = r.recordset[0];
    if (!row) return Response.json({ valid: false });

    return Response.json({
      valid: true,
      durum: row.Durum,
      raporNo: row.RaporNo,
      numuneAd: row.Numune_Adi,
      firmaAd: row.FirmaAd,
      raporFormati: row.RaporFormati,
      raporTarihi: row.Tarih,
      onayTarihi: row.OnayTarihi,
      yayinTarihi: row.YayinTarihi,
      onaylayanAd: [String(row.OnaylayanAd ?? "").trim(), String(row.OnaylayanSoyad ?? "").trim()]
        .filter(Boolean).join(" ") || null,
    });
  } catch (e: any) {
    return Response.json({ valid: false, error: e.message }, { status: 500 });
  }
}
