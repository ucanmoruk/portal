import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

// Müşteriler menüsü cari düzenleme/silme — MSSQL massgrup_cosmo · Firma

// ----------------------------------------------------------------
// PUT  /api/firmalar/[id]
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
    const { Ad, Adres, VergiDairesi, VergiNo, Telefon, Email, Tur2, Yetkili } = body;

    if (!Ad?.trim()) {
      return Response.json({ error: "Firma adı zorunludur." }, { status: 400 });
    }

    const pool = await cosmoPool;
    await pool.request()
      .input("ID", Number(id))
      .input("Ad", Ad.trim())
      .input("Adres", Adres || null)
      .input("VergiDairesi", VergiDairesi || null)
      .input("VergiNo", VergiNo || null)
      .input("Telefon", Telefon || null)
      .input("Email", Email || null)
      .input("Tur2", Tur2 || null)
      .input("Yetkili", Yetkili || null)
      .query(`
        UPDATE Firma
        SET Firma_Adi = @Ad, Adres = @Adres, Vergi_Dairesi = @VergiDairesi,
            Vergi_No = @VergiNo, Telefon = @Telefon, Mail = @Email,
            Yetkili = @Yetkili, Tur = @Tur2
        WHERE ID = @ID
      `);

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ----------------------------------------------------------------
// DELETE  /api/firmalar/[id]  (SOFT DELETE → Durum='Pasif')
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
    const pool = await cosmoPool;
    await pool.request()
      .input("ID", Number(id))
      .query(`UPDATE Firma SET Durum = 'Pasif' WHERE ID = @ID`);

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
