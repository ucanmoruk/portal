import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserPool } from "@/lib/userStore";

// ----------------------------------------------------------------
// GET /api/kullanicilar
// Durum = 'Aktif' olan kullanıcıları döner: [{ ID, Ad }]
//
// RootKullanici MySQL'deki merkezi kullanıcı tablosundan okunur. Ad+Soyad
// birleştirmesi SQL lehçelerinden bağımsız kalması için JS tarafında yapılır.
// ----------------------------------------------------------------
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const pool = await getUserPool();
    const result = await pool.request().query(`
      SELECT ID, Ad, Soyad
      FROM RootKullanici
      WHERE Durum = 'Aktif'
      ORDER BY Ad, Soyad
    `);

    const data: Array<{ ID: number | string; Ad: string }> = result.recordset
      .map((r: { ID: number | string; Ad?: string | null; Soyad?: string | null }) => ({
        ID: r.ID,
        Ad: [r.Ad, r.Soyad].filter(Boolean).join(" ").trim() || String(r.ID),
      }))
      .sort((a: { Ad: string }, b: { Ad: string }) => a.Ad.localeCompare(b.Ad, "tr"));

    return Response.json({ data });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Kullanıcı listesi alınamadı." }, { status: 500 });
  }
}
