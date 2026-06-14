import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

// POST /api/rapor-takip/arsivle
// Body: { items: [{ nkrId: number, raporFormati: string }] }
// Onaylı raporları toplu olarak "Arşiv" durumuna alır.
// NKR_RaporOnay.Durum = 'Arşiv' — varsayılan filtre dışında kalır.
// Çıkarmak için manuel olarak "Onayla" akışıyla geri alınabilir.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  let body: { items?: Array<{ nkrId: number; raporFormati: string }> } = {};
  try { body = await request.json(); } catch { return Response.json({ error: "Geçersiz JSON" }, { status: 400 }); }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return Response.json({ error: "Arşivlenecek rapor seçilmedi." }, { status: 400 });

  try {
    const pool = await cosmoPool;
    let updated = 0;
    for (const it of items) {
      const nkrId = Number(it.nkrId);
      const fmt = String(it.raporFormati || "").trim();
      if (!Number.isFinite(nkrId) || !fmt) continue;
      const r = await pool.request()
        .input("nkrId", nkrId)
        .input("format", fmt)
        .query(`
          UPDATE NKR_RaporOnay
          SET Durum = N'Arşiv'
          WHERE NkrID = @nkrId
            AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
            AND Durum IN (N'Onaylandı', N'Yayınlandı')
        `);
      updated += r.rowsAffected?.[0] ?? 0;
    }
    return Response.json({ ok: true, updated });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
