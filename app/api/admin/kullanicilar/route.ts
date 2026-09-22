import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserFirmalari, getUserPool, replaceUserFirmalari } from "@/lib/userStore";

// GET /api/admin/kullanicilar - Aktif personel listesi
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const pool = await getUserPool();
    const result = await pool.request().query(`
      SELECT ID, Kadi, Ad, Soyad, Gorev, Email, Telefon, BirimID, LaboratuvarBirimID, Durum
      FROM RootKullanici
      WHERE Durum = 'Aktif'
      ORDER BY Ad, Soyad
    `);
    return Response.json(await Promise.all(result.recordset.map(async (user: { ID: number }) => ({
      ...user,
      Firmalar: await getUserFirmalari(user.ID),
    }))));
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
    const { Kadi, Ad, Soyad, Gorev, Email, Telefon, Parola, LaboratuvarBirimID, Firmalar } = body;

    if (!Kadi?.trim()) return Response.json({ error: "Kullanıcı adı zorunludur." }, { status: 400 });
    if (!Ad?.trim()) return Response.json({ error: "Ad zorunludur." }, { status: 400 });
    if (!Parola?.trim()) return Response.json({ error: "Şifre zorunludur." }, { status: 400 });

    const pool = await getUserPool();
    const result = await pool.request()
      .input("Kadi", Kadi.trim())
      .input("Ad", Ad.trim())
      .input("Soyad", Soyad || null)
      .input("Gorev", Gorev || null)
      .input("Email", Email || null)
      .input("Telefon", Telefon || null)
      .input("Parola", Parola)
      .input("LaboratuvarBirimID", LaboratuvarBirimID ? Number(LaboratuvarBirimID) : null)
      .input("FirmaID", 1)
      .query(`
        INSERT INTO RootKullanici
          (FirmaID, BirimID, LaboratuvarBirimID, Kadi, Ad, Soyad, Gorev, Email, Telefon, Parola, Durum)
        OUTPUT INSERTED.ID
        VALUES
          (@FirmaID, NULL, @LaboratuvarBirimID, @Kadi, @Ad, @Soyad, @Gorev, @Email, @Telefon, @Parola, 'Aktif')
      `);
    const id = Number(result.recordset[0]?.ID || result.recordset[0]?.id);
    await replaceUserFirmalari(pool, id, Firmalar);
    return Response.json({ id }, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
