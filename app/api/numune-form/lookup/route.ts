import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// GET /api/numune-form/lookup
// Döner: grupTurleri, rUGDTipler, paketler
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const pool = await poolPromise;

    const [grupRes, tipRes, paketRes] = await Promise.all([
      pool.request().query(
        "SELECT Grup, Tur FROM Numune_Grup ORDER BY Grup, Tur"
      ),
      pool.request().query(
        "SELECT ID, Kategori, UrunTipi, UygulamaBolgesi, ADegeri FROM rUGDTip ORDER BY Kategori, UrunTipi"
      ),
      pool.request().query(
        "SELECT ID, ListeAdi, Aciklama FROM NumuneX3 WHERE Durum = 'Aktif' ORDER BY ListeAdi"
      ),
    ]);

    return Response.json({
      grupTurleri: grupRes.recordset,  // [{ Grup, Tur }]
      rUGDTipler:  tipRes.recordset,   // [{ ID, Kategori, UrunTipi, UygulamaBolgesi, ADegeri }]
      paketler:    paketRes.recordset, // [{ ID, ListeAdi, Aciklama }]
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
