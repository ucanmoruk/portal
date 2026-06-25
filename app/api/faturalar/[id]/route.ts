import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { ODEME_DURUMLARI } from "@/lib/faturaConstants";

// Ödeme durumu güncelle — Odeme tablosuna yeni aşama satırı ekler (append-only;
// güncel durum = en son ID'li satır). Böylece numune-takip "Ödeme" sütunu ve
// fatura-takip aynı kaynaktan tutarlı kalır.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const body = await request.json();
    const odemeDurumu = body.odemeDurumu;
    if (!ODEME_DURUMLARI.includes(odemeDurumu)) {
      return Response.json({ error: "Geçersiz ödeme durumu" }, { status: 400 });
    }

    const pool = await cosmoPool;
    const fatRes = await pool.request()
      .input("id", Number(id))
      .query(`SELECT ID, ProformaNo, Toplam FROM Fatura WHERE ID = @id AND Durum = 'Aktif'`);
    const fatura = fatRes.recordset[0];
    if (!fatura) return Response.json({ error: "Fatura bulunamadı." }, { status: 404 });

    const evrakNo = fatura.ProformaNo ? String(fatura.ProformaNo) : null;
    if (!evrakNo) {
      return Response.json({ error: "Faturaya bağlı evrak no bulunamadı; ödeme durumu güncellenemez." }, { status: 409 });
    }

    // Ödeme aşaması Odeme tablosuna (numune-takip + fatura-takip ortak kaynak).
    await pool.request()
      .input("Evrak_No", evrakNo)
      .input("Odeme_Durumu", odemeDurumu)
      .input("Fatura_ID", Number(id))
      .query(`
        INSERT INTO Odeme (Evrak_No, Odeme_Durumu, Fatura_ID, Tarih)
        VALUES (@Evrak_No, @Odeme_Durumu, @Fatura_ID, GETDATE())
      `);

    // Footer "Ödenen" toplamı Fatura.Odenen_Tutar'dan hesaplandığı için netleşen
    // durumlarda tutarı senkronla (Kısmen/İptal → tutar bilinmediğinden dokunma).
    if (odemeDurumu === "Ödendi") {
      await pool.request().input("id", Number(id))
        .query(`UPDATE Fatura SET Odenen_Tutar = Toplam WHERE ID = @id`);
    } else if (odemeDurumu === "Ödeme Bekliyor") {
      await pool.request().input("id", Number(id))
        .query(`UPDATE Fatura SET Odenen_Tutar = 0 WHERE ID = @id`);
    }

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
