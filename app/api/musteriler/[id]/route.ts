import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// ----------------------------------------------------------------
// PUT  /api/musteriler/[id]
// ----------------------------------------------------------------
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { Ad, Adres, VergiDairesi, VergiNo, Telefon, Email, Web, Tur2, Yetkili } = body;

    if (!Ad?.trim()) {
      return Response.json({ error: "Firma adı zorunludur." }, { status: 400 });
    }

    const pool = await poolPromise;
    await pool.request()
      .input("ID", Number(id))
      .input("Ad", Ad.trim())
      .input("Adres", Adres || null)
      .input("VergiDairesi", VergiDairesi || null)
      .input("VergiNo", VergiNo || null)
      .input("Telefon", Telefon || null)
      .input("Email", Email || null)
      .input("Web", Web || null)
      .input("Tur2", Tur2 || null)
      .input("Yetkili", Yetkili || null)
      .query(`
        UPDATE RootTedarikci
        SET Ad = @Ad, Adres = @Adres, VergiDairesi = @VergiDairesi,
            VergiNo = @VergiNo, Telefon = @Telefon, Email = @Email,
            Web = @Web, Tur2 = @Tur2, Yetkili = @Yetkili
        WHERE ID = @ID
      `);

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// DELETE  /api/musteriler/[id] (SOFT DELETE)
// ----------------------------------------------------------------
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz ID" }, { status: 400 });
  }

  try {
    const pool = await poolPromise;
    // Kural 6: Komple silme, Durum='Pasif' yap
    await pool.request()
      .input("ID", Number(id))
      .query(`UPDATE RootTedarikci SET Durum = 'Pasif' WHERE ID = @ID`);

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
