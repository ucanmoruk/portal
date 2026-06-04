import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { clientIpFromRequest } from "@/lib/teklifLog";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/teklifler/[id]/portal-gonder
//
// Teklifi müşteri portalında görünür kılar (e-posta göndermeden).
// Sözleşme: TeklifBaslik.TeklifDurum = 'Gönderildi' → müşteri portalı bu teklifi
// listeler. Onaylandı/Reddedildi durumunu GERİ ALMAZ (sadece Taslak → Gönderildi).
// Aynı DB paylaşıldığı için ayrı bir aktarım/senkron gerekmez.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const userName = (session.user as any)?.name || (session.user as any)?.email || null;

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;

    await pool.request()
      .input("ID", Number(id))
      .query(`UPDATE TeklifBaslik SET TeklifDurum = 'Gönderildi' WHERE ID = @ID AND TeklifDurum = 'Taslak'`);

    const res = await pool.request()
      .input("ID", Number(id))
      .query(`SELECT TeklifNo, RevNo, TeklifDurum, DisTeklifKodu FROM TeklifBaslik WHERE ID = @ID`);
    const row = res.recordset[0];
    if (!row) return Response.json({ error: "Teklif bulunamadı." }, { status: 404 });

    // Audit log (kritik değil)
    try {
      await pool.request()
        .input("TeklifID", Number(id))
        .input("TeklifNo", row.DisTeklifKodu ? `${row.DisTeklifKodu}/${String(row.RevNo).padStart(2, "0")}` : String(row.TeklifNo))
        .input("Aksiyon", "Gönderildi")
        .input("Aciklama", "Müşteri portalına gönderildi.")
        .input("IpAdresi", clientIpFromRequest(request.headers))
        .input("KullaniciAdi", userName)
        .query(`
          INSERT INTO TeklifOnayLog (TeklifID, TeklifNo, Aksiyon, Aciklama, IpAdresi, KullaniciAdi)
          VALUES (@TeklifID, @TeklifNo, @Aksiyon, @Aciklama, @IpAdresi, @KullaniciAdi)
        `);
    } catch { /* log opsiyonel */ }

    return Response.json({
      success: true,
      teklifDurum: row.TeklifDurum,
      disTeklifKodu: row.DisTeklifKodu,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
