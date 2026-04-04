import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { type NextRequest } from "next/server";

// ----------------------------------------------------------------
// GET /api/teklifler/lookup?type=musteriler&q=
// GET /api/teklifler/lookup?type=hizmetler&q=
// GET /api/teklifler/lookup?type=paketler
// ----------------------------------------------------------------
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const type = request.nextUrl.searchParams.get("type") || "";
  const q    = request.nextUrl.searchParams.get("q")?.trim() || "";

  try {
    const pool = await poolPromise;

    // ── Müşteri listesi ───────────────────────────────────────────
    if (type === "musteriler") {
      const res = await pool.request()
        .input("q", `%${q}%`)
        .query(`
          SELECT TOP 50 ID, Ad
          FROM RootTedarikci
          WHERE Durum = 'Aktif'
          ${q ? "AND Ad LIKE @q" : ""}
          ORDER BY Ad
        `);
      return Response.json({ data: res.recordset });
    }

    // ── Hizmet listesi (StokAnalizListesi) ────────────────────────
    if (type === "hizmetler") {
      const res = await pool.request()
        .input("q", `%${q}%`)
        .query(`
          SELECT TOP 100 ID, Kod, Ad, Fiyat, ParaBirimi,
                 ISNULL(Method,'')      AS Metot,
                 ISNULL(Akreditasyon,'') AS Akreditasyon,
                 ISNULL(Matriks,'')     AS Matriks,
                 Sure
          FROM StokAnalizListesi
          WHERE Durumu = 'Aktif'
          ${q ? "AND (Ad LIKE @q OR Kod LIKE @q)" : ""}
          ORDER BY Ad
        `);
      return Response.json({ data: res.recordset });
    }

    // ── Paket listesi (NumuneX3 + NumuneX4 + StokAnalizListesi) ──
    if (type === "paketler") {
      const pakRes = await pool.request().query(`
        SELECT ID, ListeAdi, ISNULL(Aciklama,'') AS Aciklama
        FROM NumuneX3
        WHERE Durum = 'Aktif'
        ORDER BY ListeAdi
      `);

      const paketler = pakRes.recordset;
      if (paketler.length === 0) return Response.json({ data: [] });

      // Tüm paket ID'lerini güvenle oluştur (sayısal ID'ler)
      const ids = paketler
        .map((p: any) => parseInt(p.ID, 10))
        .filter((n: number) => !isNaN(n))
        .join(",");

      const itemsRes = await pool.request().query(`
        SELECT
          x4.ListeID,
          x4.AltAnalizID AS HizmetID,
          ISNULL(s.Ad, '')  AS HizmetAdi,
          ISNULL(s.Kod, '') AS Kod,
          s.Fiyat,
          ISNULL(s.ParaBirimi, 'TRY') AS ParaBirimi
        FROM NumuneX4 x4
        JOIN StokAnalizListesi s ON s.ID = x4.AltAnalizID
        WHERE x4.ListeID IN (${ids})
        ORDER BY x4.ListeID, s.Ad
      `);

      const byPaket: Record<number, any[]> = {};
      for (const item of itemsRes.recordset) {
        if (!byPaket[item.ListeID]) byPaket[item.ListeID] = [];
        byPaket[item.ListeID].push(item);
      }

      const result = paketler.map((p: any) => ({
        ...p,
        items: byPaket[p.ID] || [],
      }));

      return Response.json({ data: result });
    }

    return Response.json({ error: "Geçersiz type parametresi" }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
