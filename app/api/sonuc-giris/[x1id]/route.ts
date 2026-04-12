import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// ── PATCH /api/sonuc-giris/[x1id] — Sonuç, Değerlendirme, Durum güncelle ───
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ x1id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { x1id } = await params;
  const x1Id = parseInt(x1id);

  try {
    const body = await request.json();
    const sonuc = (body.sonuc || "").trim() || null;
    const birim = (body.birim || "").trim() || null;
    const limit = (body.limit || "").trim() || null;
    const degerlendirme = (body.degerlendirme || "").trim() || null;
    const durum = body.durum || "Devam"; // "Devam" | "Tamamlandı"
    const sonucEn = (body.sonucEn || "").trim() || null;
    const limitEn = (body.limitEn || "").trim() || null;
    const birimEn = (body.birimEn || "").trim() || null;

    const pool = await poolPromise;

    // Hangi opsiyonel kolonlar var?
    const colRes = await pool.request().query(
      `SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('NumuneX1') AND name IN ('SonucEn','LimitEn','BirimEn','HizmetDurum')`
    );
    const x1Cols = new Set<string>(colRes.recordset.map((r: any) => r.name as string));

    const sets: string[] = ["Sonuc = @sonuc", "Birim = @birim", "Limit = @limit", "Degerlendirme = @degerlendirme"];
    const req = pool.request()
      .input("x1Id", x1Id)
      .input("sonuc", sonuc)
      .input("birim", birim)
      .input("limit", limit)
      .input("degerlendirme", degerlendirme);

    if (x1Cols.has("SonucEn"))    { req.input("sonucEn", sonucEn);   sets.push("SonucEn = @sonucEn"); }
    if (x1Cols.has("LimitEn"))    { req.input("limitEn", limitEn);   sets.push("LimitEn = @limitEn"); }
    if (x1Cols.has("BirimEn"))    { req.input("birimEn", birimEn);   sets.push("BirimEn = @birimEn"); }
    if (x1Cols.has("HizmetDurum")) {
      req.input("durum", durum === "Tamamlandı" ? "Tamamlandı" : "Devam");
      sets.push("HizmetDurum = @durum");
    }

    await req.query(`UPDATE NumuneX1 SET ${sets.join(", ")} WHERE ID = @x1Id`);

    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
