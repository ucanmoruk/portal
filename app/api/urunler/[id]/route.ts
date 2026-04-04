import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// ----------------------------------------------------------------
// PUT /api/urunler/[id] (Ürün Güncelle)
// ----------------------------------------------------------------
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const body = await request.json();
    const { Tarih, RaporNo, Versiyon, FirmaID, Barkod, Urun, Miktar, Tip1, Tip2, A, RaporDurum } = body;

    const pool = await poolPromise;
    await pool.request()
      .input("id", id)
      .input("Tarih", Tarih || null)
      .input("RaporNo", RaporNo || null)
      .input("Versiyon", Versiyon || null)
      .input("FirmaID", FirmaID || null)
      .input("Barkod", Barkod || null)
      .input("Urun", Urun || null)
      .input("Miktar", Miktar || null)
      .input("Tip1", Tip1 || null)
      .input("Tip2", Tip2 || null)
      .input("A", A || null)
      .input("RaporDurum", RaporDurum || null)
      .query(`
        UPDATE rUGDListe
        SET Tarih = @Tarih, RaporNo = @RaporNo, Versiyon = @Versiyon, FirmaID = @FirmaID,
            Barkod = @Barkod, Urun = @Urun, Miktar = @Miktar, Tip1 = @Tip1,
            Tip2 = @Tip2, A = @A, RaporDurum = @RaporDurum
        WHERE ID = @id
      `);

    return Response.json({ message: "Başarıyla güncellendi" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// DELETE /api/urunler/[id] (Soft Delete)
// ----------------------------------------------------------------
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input("id", id)
      .query("UPDATE rUGDListe SET Durum = 'Pasif' WHERE ID = @id");

    return Response.json({ message: "Başarıyla silindi (pasif yapıldı)" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
