import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// ----------------------------------------------------------------
// PUT /api/numune-kabul/[id]  (güncelle)
// ----------------------------------------------------------------
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  try {
    const body = await request.json();
    const { Tarih, Evrak_No, RaporNo, Firma_ID, Numune_Adi, Grup } = body;

    const pool = await poolPromise;
    await pool.request()
      .input("id",        id)
      .input("Tarih",     Tarih      || null)
      .input("Evrak_No",  Evrak_No   || null)
      .input("RaporNo",   RaporNo    || null)
      .input("Firma_ID",  Firma_ID   ? parseInt(Firma_ID) : null)
      .input("Numune_Adi", Numune_Adi || null)
      .input("Grup",      Grup       || null)
      .query(`
        UPDATE NKR
        SET
          Tarih      = @Tarih,
          Evrak_No   = @Evrak_No,
          RaporNo    = @RaporNo,
          Firma_ID   = @Firma_ID,
          Numune_Adi = @Numune_Adi,
          Grup       = @Grup
        WHERE ID = @id
      `);

    return Response.json({ message: "Güncellendi" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// DELETE /api/numune-kabul/[id]  (soft-delete: Durum = 'Pasif')
// ----------------------------------------------------------------
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input("id", id)
      .query(`UPDATE NKR SET Durum = 'Pasif' WHERE ID = @id`);

    return Response.json({ message: "Pasife alındı" });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
