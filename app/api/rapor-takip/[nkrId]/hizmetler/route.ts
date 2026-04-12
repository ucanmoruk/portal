import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { NextRequest } from "next/server";

// GET /api/rapor-takip/[nkrId]/hizmetler?raporFormati=Genel
// Bir numune + rapor formatına ait hizmetleri döner
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId);
  if (isNaN(nkrIdNum)) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  const raporFormati = request.nextUrl.searchParams.get("raporFormati") || "";

  try {
    const pool = await poolPromise;

    // Hangi opsiyonel kolonlar mevcut?
    const colCheck = await pool.request().query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID('NumuneX1')
        AND name IN ('Sonuc', 'Degerlendirme', 'Birim')
    `);
    const existingCols = new Set<string>(colCheck.recordset.map((r: any) => r.name));

    const sonucSel         = existingCols.has("Sonuc")         ? "x1.Sonuc,"         : "NULL AS Sonuc,";
    const degerlendirmeSel = existingCols.has("Degerlendirme") ? "x1.Degerlendirme," : "NULL AS Degerlendirme,";
    // Birim: NumuneX1'den al, yoksa StokAnalizListesi.Matriks'e düş
    const birimSel         = existingCols.has("Birim")
      ? "ISNULL(x1.Birim, s.Matriks) AS Birim,"
      : "s.Matriks AS Birim,";

    const req = pool.request()
      .input("nkrId",        nkrIdNum)
      .input("raporFormati", raporFormati);

    const result = await req.query(`
      SELECT
        x1.ID                                       AS X1ID,
        x1.AnalizID,
        s.Kod,
        s.Ad,
        s.Akreditasyon,
        s.Method                                    AS Metot,
        ${birimSel}
        x1.[Limit]                                  AS LimitDeger,
        ${sonucSel}
        ${degerlendirmeSel}
        CONVERT(varchar(10), x1.Termin, 23)        AS Termin
      FROM NumuneX1 x1
      INNER JOIN StokAnalizListesi s ON s.ID = x1.AnalizID
      WHERE x1.RaporID        = @nkrId
        AND s.RaporFormati    = @raporFormati
      ORDER BY s.Kod
    `);

    return Response.json(result.recordset);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/rapor-takip/[nkrId]/hizmetler
// Body: { updates: [{ x1Id, sonuc, degerlendirme }] }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId);
  if (isNaN(nkrIdNum)) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const body = await request.json();
    const updates: { x1Id: number; sonuc: string; degerlendirme: string }[] = body.updates || [];

    if (updates.length === 0) return Response.json({ ok: true });

    const pool = await poolPromise;

    // Kolonları kontrol et
    const colCheck = await pool.request().query(`
      SELECT name FROM sys.columns
      WHERE object_id = OBJECT_ID('NumuneX1')
        AND name IN ('Sonuc', 'Degerlendirme')
    `);
    const existingCols = new Set<string>(colCheck.recordset.map((r: any) => r.name));
    const hasSonuc         = existingCols.has("Sonuc");
    const hasDegerlendirme = existingCols.has("Degerlendirme");

    if (!hasSonuc && !hasDegerlendirme) {
      return Response.json(
        { error: "Sonuc ve Degerlendirme kolonları henüz eklenmemiş. Migration çalıştırın." },
        { status: 422 },
      );
    }

    // Her satırı güncelle
    for (const upd of updates) {
      const sets: string[] = [];
      const req = pool.request().input("x1Id", upd.x1Id).input("nkrId", nkrIdNum);

      if (hasSonuc) {
        sets.push("Sonuc = @sonuc");
        req.input("sonuc", upd.sonuc ?? null);
      }
      if (hasDegerlendirme) {
        sets.push("Degerlendirme = @degerlendirme");
        req.input("degerlendirme", upd.degerlendirme ?? null);
      }

      if (sets.length === 0) continue;

      await req.query(`
        UPDATE NumuneX1
        SET ${sets.join(", ")}
        WHERE ID = @x1Id AND RaporID = @nkrId
      `);
    }

    return Response.json({ ok: true, updated: updates.length });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
