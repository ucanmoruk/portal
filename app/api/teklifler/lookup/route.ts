import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Teklif formu seçicileri — MSSQL massgrup_cosmo
//   musteriler → Firma
//   hizmetler  → StokAnalizListesi (cosmo gerçek kolonları; LOQ/Limit/En yok → '')
//   paketler   → NumuneX3 (Aciklama=ad) + NumuneX4 (x3ID, AltAnalizID)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const type = request.nextUrl.searchParams.get("type") || "";
  const q    = request.nextUrl.searchParams.get("q")?.trim() || "";

  try {
    const pool = await cosmoPool;

    // ── Müşteri listesi (Firma) ───────────────────────────────────
    if (type === "musteriler") {
      const res = await pool.request()
        .input("qLike", `%${q}%`)
        .query(`
          SELECT TOP 50 ID, ISNULL(Firma_Adi,'') AS Ad
          FROM Firma
          WHERE Durum = 'Aktif'
          ${q ? "AND LOWER(ISNULL(Firma_Adi,'')) LIKE LOWER(@qLike)" : ""}
          ORDER BY Firma_Adi
        `);
      return Response.json({ data: res.recordset });
    }

    // ── Hizmet listesi (StokAnalizListesi) ────────────────────────
    if (type === "hizmetler") {
      const res = await pool.request()
        .input("qLike", `%${q}%`)
        .query(`
          SELECT TOP 100 s.ID, s.Kod, s.Ad, s.Fiyat, s.ParaBirimi,
                 ISNULL(s.Method, ISNULL(s.Metot,'')) AS Metot,
                 ISNULL(s.Akreditasyon,'') AS Akreditasyon,
                 ISNULL(s.Matriks,'')      AS Matriks,
                 s.Sure,
                 ISNULL(s.[Limit],'')      AS [Limit],
                 ISNULL(s.BirimText,'')    AS Birim,
                 ISNULL(s.LOQ,'')          AS LOQ,
                 ISNULL(s.LimitEn,'')      AS LimitEn,
                 ISNULL(s.BirimEn,'')      AS BirimEn,
                 ISNULL(s.LOQEn,'')        AS LOQEn,
                 NULL                      AS BolumID,
                 ''                        AS BolumAdi
          FROM StokAnalizListesi s
          WHERE s.Durumu = 'Aktif'
          ${q ? "AND (LOWER(ISNULL(s.Ad,'')) LIKE LOWER(@qLike) OR LOWER(ISNULL(s.Kod,'')) LIKE LOWER(@qLike))" : ""}
          ORDER BY s.Ad
        `);
      return Response.json({ data: res.recordset });
    }

    // ── Paket listesi (NumuneX3 + NumuneX4 + StokAnalizListesi) ──
    if (type === "paketler") {
      const pakRes = await pool.request().query(`
        SELECT ID, ISNULL(Aciklama,'') AS ListeAdi, '' AS Aciklama
        FROM NumuneX3
        WHERE Durum = 'Aktif'
        ORDER BY Aciklama
      `);

      const paketler = pakRes.recordset;
      if (paketler.length === 0) return Response.json({ data: [] });

      const ids = paketler
        .map((p: any) => parseInt(p.ID, 10))
        .filter((n: number) => !isNaN(n))
        .join(",");

      const itemsRes = await pool.request().query(`
        SELECT
          x4.x3ID        AS ListeID,
          x4.AltAnalizID AS HizmetID,
          ISNULL(s.Ad, '')  AS HizmetAdi,
          ISNULL(s.Kod, '') AS Kod,
          s.Fiyat,
          ISNULL(s.ParaBirimi, 'TRY') AS ParaBirimi
        FROM NumuneX4 x4
        JOIN StokAnalizListesi s ON s.ID = x4.AltAnalizID
        WHERE x4.x3ID IN (${ids})
        ORDER BY x4.x3ID, s.Ad
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
