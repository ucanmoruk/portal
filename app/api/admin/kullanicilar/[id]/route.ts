import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz kullanıcı ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { Kadi, Ad, Soyad, Gorev, Email, Telefon, Parola, BirimID } = body;

    if (!Kadi?.trim()) return Response.json({ error: "Kullanıcı adı zorunludur." }, { status: 400 });
    if (!Ad?.trim()) return Response.json({ error: "Ad zorunludur." }, { status: 400 });

    const pool = await poolPromise;
    const requestDb = pool.request()
      .input("ID", Number(id))
      .input("Kadi", Kadi.trim())
      .input("Ad", Ad.trim())
      .input("Soyad", Soyad || null)
      .input("Gorev", Gorev || null)
      .input("Email", Email || null)
      .input("Telefon", Telefon || null)
      .input("BirimID", BirimID ? Number(BirimID) : null);

    const passwordSet = Parola?.trim() ? ", Parola = @Parola" : "";
    if (Parola?.trim()) requestDb.input("Parola", Parola);

    await requestDb.query(`
      UPDATE RootKullanici
      SET Kadi = @Kadi,
          Ad = @Ad,
          Soyad = @Soyad,
          Gorev = @Gorev,
          Email = @Email,
          Telefon = @Telefon,
          BirimID = @BirimID
          ${passwordSet}
      WHERE ID = @ID
    `);

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return Response.json({ error: "Geçersiz kullanıcı ID" }, { status: 400 });
  }

  try {
    const pool = await poolPromise;
    await pool.request()
      .input("ID", Number(id))
      .query("UPDATE RootKullanici SET Durum = 'Pasif' WHERE ID = @ID");

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
