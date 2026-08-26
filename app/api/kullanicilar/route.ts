import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// ----------------------------------------------------------------
// GET /api/kullanicilar
// Durum = 'Aktif' olan kullanıcıları döner: [{ ID, Ad }]
//
// Not: RootKullanici artık Postgres mirror'da yaşıyor (lib/db.ts → rootPool /
// poolPromise usePostgres dalı). Ad+Soyad'ı SQL'de "+" ile birleştirmek MSSQL'e
// özgüdür ve Postgres'te "operator does not exist: text + unknown" hatasıyla
// patlar (compat katmanının "+" → "||" çevirisi sadece çıplak kolon + literal +
// kolon örüntüsünü yakalıyor, ISNULL(...) gibi fonksiyon çağrılarını değil).
// Bu yüzden birleştirme burada, JS tarafında yapılır — /api/admin/kullanicilar
// ile aynı, kanıtlı kolon adlarını (Ad, Soyad, Durum) doğrudan kullanır.
// ----------------------------------------------------------------
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT ID, Ad, Soyad
      FROM RootKullanici
      WHERE Durum = 'Aktif'
      ORDER BY Ad, Soyad
    `);

    const data = result.recordset
      .map((r: { ID: number | string; Ad?: string | null; Soyad?: string | null }) => ({
        ID: r.ID,
        Ad: [r.Ad, r.Soyad].filter(Boolean).join(" ").trim() || String(r.ID),
      }))
      .sort((a, b) => a.Ad.localeCompare(b.Ad, "tr"));

    return Response.json({ data });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Kullanıcı listesi alınamadı." }, { status: 500 });
  }
}
