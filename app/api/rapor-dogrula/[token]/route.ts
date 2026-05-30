import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";
import { verifyRapor } from "@/lib/raporImza";
import { loadImzaInput, imzaColumnExists } from "@/lib/raporImzaData";

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

    // ImzaHash sütunu varsa onu da çek (migration 009).
    const hasImza = await imzaColumnExists(pool);
    const imzaSelect = hasImza ? "o.ImzaHash, o.ImzaTarihi," : "";

    const r = await pool.request()
      .input("tok", tok)
      .query(`
        SELECT
          o.NkrID, o.KarekodToken, o.RaporFormati, o.Durum,
          o.OnayTarihi, o.YayinTarihi,
          ${imzaSelect}
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

    // ───── Belge bütünlüğü kontrolü ─────
    // Onay anındaki imzayı, raporun GÜNCEL içeriğinden yeniden hesaplanan imzayla
    // karşılaştır. Eşleşmezse rapor onaydan sonra değiştirilmiş demektir.
    //   - butunluk: "gecerli" | "bozuk" | "yok"
    let butunluk: "gecerli" | "bozuk" | "yok" = "yok";
    if (hasImza && row.ImzaHash) {
      try {
        const imzaInput = await loadImzaInput(pool, Number(row.NkrID), row.RaporFormati);
        butunluk = imzaInput && verifyRapor(imzaInput, row.ImzaHash) ? "gecerli" : "bozuk";
      } catch {
        butunluk = "yok";
      }
    }

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
      butunluk,
      imzaHash: hasImza && row.ImzaHash ? String(row.ImzaHash) : null,
      imzaTarihi: hasImza ? (row.ImzaTarihi ?? null) : null,
    });
  } catch (e: any) {
    return Response.json({ valid: false, error: e.message }, { status: 500 });
  }
}
