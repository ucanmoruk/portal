import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

const LAB_BIRIMLER = ["Mikrobiyoloji", "Kimyasal", "Dış Laboratuvar"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  try {
    const pool = await cosmoPool;
    const result = await pool.request().query(`
      SELECT ID, Birim, FirmaID, Durum
      FROM RootFirmaBirim
      WHERE Durum = 'Aktif'
      ORDER BY Birim
    `);

    const rows = result.recordset as Array<{ ID: number | null; Birim: string; FirmaID?: number | null; Durum?: string }>;
    const existing = new Set(rows.map((row) => String(row.Birim || "").trim()));
    for (const birim of LAB_BIRIMLER) {
      if (!existing.has(birim)) rows.push({ ID: null, Birim: birim, FirmaID: null, Durum: "Aktif" });
    }

    return Response.json(rows);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
