import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

// ----------------------------------------------------------------
// GET /api/kullanicilar
// Durum = 'Aktif' olan kullanıcıları döner: [{ ID, Ad }]
// RootKullanici kolon adları dinamik okunur (auth.ts ile aynı yaklaşım)
// ----------------------------------------------------------------
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const pool = await poolPromise;

    const colsResult = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'RootKullanici'
    `);
    const cols = new Set<string>(colsResult.recordset.map((r: any) => r.COLUMN_NAME as string));

    const idCol   = ["ID", "Id", "id", "KullaniciId"].find(c => cols.has(c)) ?? "ID";
    const nameCol = ["AdSoyad", "FullName", "Name", "Adi"].find(c => cols.has(c));
    const fnCol   = ["Ad", "FirstName", "Firstname"].find(c => cols.has(c));
    const lnCol   = ["Soyad", "LastName", "Lastname"].find(c => cols.has(c));
    const durumCol = ["Durum", "durum", "Status"].find(c => cols.has(c));

    let adExpr: string;
    if (nameCol) {
      adExpr = `ISNULL(${nameCol}, '')`;
    } else if (fnCol && lnCol) {
      adExpr = `LTRIM(RTRIM(ISNULL(${fnCol}, '') + ' ' + ISNULL(${lnCol}, '')))`;
    } else if (fnCol) {
      adExpr = `ISNULL(${fnCol}, '')`;
    } else {
      adExpr = `CAST(${idCol} AS NVARCHAR(50))`;
    }

    const where = durumCol ? `WHERE ${durumCol} = 'Aktif'` : "";

    const result = await pool.request().query(`
      SELECT ${idCol} AS ID, ${adExpr} AS Ad
      FROM RootKullanici
      ${where}
      ORDER BY Ad
    `);

    return Response.json({ data: result.recordset });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
