import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { ensureLabUgdrFormulTable } from "@/lib/labUgdrStorage";
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
    const pool = await poolPromise;
    const nkrId = await resolveNkrId(pool, id);
    if (!nkrId) return Response.json({ error: "Kayit bulunamadi" }, { status: 404 });

    await ensureLabUgdrFormulTable(pool);

    const result = await pool.request()
      .input("nkrId", nkrId)
      .query(`
        SELECT f.NKRID AS UrunID, f.HammaddeID, f.INCIName, f.Miktar, f.DaP, f.Noael,
               c.Cas, c.EC, c.Functions, c.Regulation, c.Link
        FROM NKR_Formul f
        LEFT JOIN rCosing c ON c.ID = f.HammaddeID
        WHERE f.NKRID = @nkrId
        ORDER BY f.ID
      `);

    const rows = await enrichUgdFormulaRows(result.recordset);
    return Response.json(rows);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
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
    const { rows } = await request.json();
    if (!Array.isArray(rows)) return Response.json({ error: "Gecersiz veri" }, { status: 400 });

    const pool = await poolPromise;
    const nkrId = await resolveNkrId(pool, id);
    if (!nkrId) return Response.json({ error: "Kayit bulunamadi" }, { status: 404 });

    await ensureLabUgdrFormulTable(pool);

    await pool.request()
      .input("nkrId", nkrId)
      .query("DELETE FROM NKR_Formul WHERE NKRID = @nkrId");

    for (const row of rows) {
      await pool.request()
        .input("nkrId", nkrId)
        .input("hammaddeId", row.cosingId ?? null)
        .input("inciName", row.INCIName ?? row.inputName ?? "")
        .input("miktar", String(row.inputAmount ?? row.miktar ?? "0"))
        .input("dap", row.dap ?? 100)
        .input("noael", row.noael ? String(row.noael) : null)
        .query(`
          INSERT INTO NKR_Formul (NKRID, HammaddeID, INCIName, Miktar, DaP, Noael)
          VALUES (@nkrId, @hammaddeId, @inciName, @miktar, @dap, @noael)
        `);
    }

    await pool.request().query(`
      CREATE TABLE NKR_RaporDurumOverride (
        NkrID INT NOT NULL,
        RaporFormati NVARCHAR(100) NOT NULL,
        Durum NVARCHAR(50) NOT NULL,
        UpdatedAt DATETIME NOT NULL,
        PRIMARY KEY (NkrID, RaporFormati)
      )
    `).catch(() => undefined);

    await pool.request()
      .input("nkrId", nkrId)
      .input("format", "ÜGDR")
      .input("durum", "Devam Ediyor")
      .query(`
        DELETE FROM NKR_RaporDurumOverride
        WHERE NkrID = @nkrId
          AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'));

        INSERT INTO NKR_RaporDurumOverride (NkrID, RaporFormati, Durum, UpdatedAt)
        VALUES (@nkrId, @format, @durum, GETDATE());
      `);

    return Response.json({ message: "Formul kaydedildi", count: rows.length });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}


