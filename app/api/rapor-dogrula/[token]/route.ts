import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";
import { verifyRapor } from "@/lib/raporImza";
import { loadImzaInput, imzaColumnExists } from "@/lib/raporImzaData";
import { disRaporLabel } from "@/lib/disKod";

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
    const pool = await cosmoPool;

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
          o.NkrID, o.KarekodToken, o.RaporFormati, o.Durum, o.DisRaporKodu,
          o.OnayTarihi, o.YayinTarihi,
          ${imzaSelect}
          n.RaporNo, n.Revno, n.Numune_Adi, n.Tarih,
          ISNULL(f.Ad, '') AS FirmaAd,
          ISNULL(o.OnaylayanAd, '') AS OnaylayanAd,
          '' AS OnaylayanSoyad
        FROM NKR_RaporOnay o
        INNER JOIN NKR n ON n.ID = o.NkrID
        LEFT JOIN (SELECT ID, Firma_Adi AS Ad, Adres, Mail AS Email, Telefon, Vergi_Dairesi AS VergiDairesi, Vergi_No AS VergiNo, Yetkili FROM Firma) f ON f.ID = n.Firma_ID
        WHERE o.KarekodToken = @tok
      `);

    const row = r.recordset[0];
    if (!row) return Response.json({ valid: false });

    // Sadece Onaylandı / Yayınlandı / Arşiv durumdaki raporlar doğrulanır.
    // Durum NULL (placeholder satır) veya başka durum → reddet.
    const aktifDurum =
      row.Durum === "Onaylandı" || row.Durum === "Yayınlandı" || row.Durum === "Arşiv";
    if (!aktifDurum) {
      return Response.json({
        valid: false,
        durum: row.Durum,
        error: "Bu rapor doğrulama için uygun değil.",
      });
    }

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

    // Güncel revizyon kodu: taban DisRaporKodu + /NN (disRaporLabel).
    const revNum = parseInt(String(row.Revno ?? "0").trim(), 10) || 0;
    const disRaporKodu = row.DisRaporKodu ? disRaporLabel(row.DisRaporKodu, revNum) : null;

    return Response.json({
      valid: true,
      durum: row.Durum,
      raporNo: row.RaporNo,
      disRaporKodu,
      revNo: revNum,
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
