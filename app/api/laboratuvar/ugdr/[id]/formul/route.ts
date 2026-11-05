import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { ensureLabUgdrFormulTable } from "@/lib/labUgdrStorage";
import { LabFormulaInput, saveLabFormula } from "@/lib/labUgdrFormulaSave";
import { z } from "zod";
import { enrichUgdFormulaRows } from "@/lib/ugdRegulationLookup";

async function resolveNkrId(pool: any, rawId: string) {
  const result = await pool
    .request()
    .input("idRaw", rawId)
    .query(`
      SELECT TOP 1 ID
      FROM NKR
      WHERE Durum = 'Aktif'
        AND (ID = TRY_CAST(@idRaw AS INT) OR CAST(RaporNo AS NVARCHAR(100)) = @idRaw)
      ORDER BY CASE WHEN CAST(RaporNo AS NVARCHAR(100)) = @idRaw THEN 0 ELSE 1 END, ID DESC
    `);

  return result.recordset[0]?.ID ? Number(result.recordset[0].ID) : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const { id } = await params;

  try {
    const pool = await cosmoPool;
    const nkrId = await resolveNkrId(pool, id);
    if (!nkrId) return Response.json({ error: "Kayit bulunamadi" }, { status: 404 });

    await ensureLabUgdrFormulTable(pool);

    const result = await pool.request()
      .input("nkrId", nkrId)
      .query(`
        SELECT f.NKRID AS UrunID, f.HammaddeID, f.INCIName, f.Miktar, f.DaP, f.Noael,
               c.Cas, c.EC, c.Functions, c.Kategori, c.Regulation, c.Link
        FROM NKR_Formul f
        LEFT JOIN rCosing c ON c.ID = f.HammaddeID
        WHERE f.NKRID = @nkrId
        ORDER BY f.ID
      `);

    const rows = await enrichUgdFormulaRows(result.recordset);
    return Response.json(rows);
  } catch (e: any) {
    return Response.json({ error: e instanceof z.ZodError ? "Formül satırlarını ve miktarlarını kontrol edin (en fazla 250 satır)." : e.message }, { status: e instanceof z.ZodError ? 400 : 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const { id } = await params;

  try {
    const { rows } = LabFormulaInput.parse(await request.json());

    const pool = await cosmoPool;
    const nkrId = await resolveNkrId(pool, id);
    if (!nkrId) return Response.json({ error: "Kayit bulunamadi" }, { status: 404 });

    await ensureLabUgdrFormulTable(pool);

    await saveLabFormula(pool, nkrId, rows);

    return Response.json({ message: "Formul kaydedildi", count: rows.length });
  } catch (e: any) {
    return Response.json({ error: e instanceof z.ZodError ? "Formül satırlarını ve miktarlarını kontrol edin (en fazla 250 satır)." : e.message }, { status: e instanceof z.ZodError ? 400 : 500 });
  }
}


