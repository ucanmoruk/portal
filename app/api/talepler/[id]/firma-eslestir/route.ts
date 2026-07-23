import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Firma eşleştirilemedi.";
}

function makeFirmaKod(firmaId: number) {
  return `UQ${firmaId}`.slice(0, 10);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  const talepId = Number(id);
  if (!Number.isInteger(talepId) || talepId <= 0) {
    return Response.json({ error: "Geçersiz talep ID" }, { status: 400 });
  }

  let body: { firmaId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const firmaId = Number(body.firmaId);
  if (!Number.isInteger(firmaId) || firmaId <= 0) {
    return Response.json({ error: "Firma seçimi zorunludur." }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;
    const firmaRes = await pool.request()
      .input("firmaId", firmaId)
      .query(`
        SELECT TOP 1
          ID,
          ISNULL(Kod, '') AS Kod,
          ISNULL(Firma_Adi, '') AS FirmaAd
        FROM dbo.Firma
        WHERE ID = @firmaId AND Durum = 'Aktif'
      `);

    const firma = firmaRes.recordset[0] as { ID: number; Kod: string; FirmaAd: string } | undefined;
    if (!firma) return Response.json({ error: "Aktif firma bulunamadı." }, { status: 404 });

    let firmaKod = String(firma.Kod || "").trim();
    if (!firmaKod) {
      firmaKod = makeFirmaKod(firmaId);
      await pool.request()
        .input("firmaId", firmaId)
        .input("firmaKod", firmaKod)
        .query(`
          UPDATE dbo.Firma
          SET Kod = @firmaKod
          WHERE ID = @firmaId AND (Kod IS NULL OR LTRIM(RTRIM(Kod)) = '')
        `);
    }

    const updateRes = await pool.request()
      .input("talepId", talepId)
      .input("firmaKod", firmaKod)
      .query(`
        UPDATE dbo.Talep
        SET FirmaKodu = @firmaKod
        WHERE ID = @talepId AND ISNULL(Durum, '') <> 'Pasif'
      `);

    const affected = updateRes.rowsAffected?.[0] ?? 0;
    if (!affected) return Response.json({ error: "Talep bulunamadı veya pasif durumda." }, { status: 404 });

    return Response.json({
      success: true,
      firmaId,
      firmaKodu: firmaKod,
      firmaAd: firma.FirmaAd,
    });
  } catch (error: unknown) {
    return Response.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
