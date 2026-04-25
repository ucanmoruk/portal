import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// GET /api/admin/kullanicilar - Aktif personel listesi
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT ID, Kadi, Ad, Soyad, Gorev, Email, Telefon, BirimID, Durum
      FROM RootKullanici
      WHERE Durum = 'Aktif'
      ORDER BY Ad, Soyad
    `);
    return Response.json(result.recordset);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/kullanicilar - Yeni kullanıcı
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const body = await request.json();
    const { Kadi, Ad, Soyad, Gorev, Email, Telefon, Parola, BirimID } = body;

    if (!Kadi?.trim()) return Response.json({ error: "Kullanıcı adı zorunludur." }, { status: 400 });
    if (!Ad?.trim()) return Response.json({ error: "Ad zorunludur." }, { status: 400 });
    if (!Parola?.trim()) return Response.json({ error: "Şifre zorunludur." }, { status: 400 });

    const pool = await poolPromise;
    const result = await pool.request()
      .input("Kadi", Kadi.trim())
      .input("Ad", Ad.trim())
      .input("Soyad", Soyad || null)
      .input("Gorev", Gorev || null)
      .input("Email", Email || null)
      .input("Telefon", Telefon || null)
      .input("Parola", Parola)
      .input("BirimID", BirimID ? Number(BirimID) : null)
      .input("FirmaID", 1)
      .query(`
        INSERT INTO RootKullanici
          (FirmaID, BirimID, Kadi, Ad, Soyad, Gorev, Email, Telefon, Parola, Durum)
        OUTPUT INSERTED.ID
        VALUES
          (@FirmaID, @BirimID, @Kadi, @Ad, @Soyad, @Gorev, @Email, @Telefon, @Parola, 'Aktif')
      `);

    return Response.json({ id: result.recordset[0]?.ID }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
