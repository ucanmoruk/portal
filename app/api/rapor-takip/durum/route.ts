import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

type DurumItem = { nkrId: number; raporFormati: string };

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const body = await request.json().catch(() => null) as { items?: DurumItem[]; durum?: string } | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  const durum = String(body?.durum || "").trim();
  if (!items.length) return Response.json({ error: "Güncellenecek rapor seçilmedi." }, { status: 400 });
  if (durum !== "Ödeme bekliyor") return Response.json({ error: "Geçersiz rapor durumu." }, { status: 400 });

  try {
    const pool = await cosmoPool;
    let updated = 0;
    for (const item of items) {
      const nkrId = Number(item.nkrId);
      const format = String(item.raporFormati || "").trim();
      if (!Number.isFinite(nkrId) || !format) continue;
      const result = await pool.request()
        .input("nkrId", nkrId)
        .input("format", format)
        .query(`
          UPDATE NKR_RaporOnay
          SET Durum = N'Ödeme bekliyor'
          WHERE NkrID = @nkrId
            AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
            AND Durum IN (N'Onaylandı', N'Onaylandi', N'Ödeme bekliyor')
        `);
      updated += result.rowsAffected?.[0] ?? 0;
    }
    return Response.json({ ok: true, updated });
  } catch (error: unknown) {
    return Response.json({ error: error instanceof Error ? error.message : "Durum güncellenemedi." }, { status: 500 });
  }
}
