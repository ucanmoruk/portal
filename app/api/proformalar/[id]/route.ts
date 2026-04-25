import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const pool = await poolPromise;
    const header = await pool.request()
      .input("id", Number(id))
      .query(`
        SELECT p.*, ISNULL(f.Ad, '') AS FirmaAd, ISNULL(f.Email, '') AS FirmaEmail,
               ISNULL(f.Telefon, '') AS FirmaTelefon, ISNULL(f.Adres, '') AS FirmaAdres,
               ISNULL(f.VergiDairesi, '') AS VergiDairesi, ISNULL(f.VergiNo, '') AS VergiNo
        FROM ProformaX1 p
        LEFT JOIN RootTedarikci f ON f.ID = p.FirmaID
        WHERE p.ID = @id AND p.SilindiMi = 0
      `);
    if (!header.recordset.length) return Response.json({ error: "Proforma bulunamadı" }, { status: 404 });

    const lines = await pool.request()
      .input("id", Number(id))
      .query(`
        SELECT *
        FROM ProformaX2
        WHERE ProformaID = @id
        ORDER BY ID
      `);

    return Response.json({ header: header.recordset[0], satirlar: lines.recordset });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const body = await request.json();
    const durum = body.durum;
    const valid = ["Taslak", "Gönderildi", "Onaylandı", "İptal"];
    if (!valid.includes(durum)) return Response.json({ error: "Geçersiz durum" }, { status: 400 });

    const pool = await poolPromise;
    await pool.request()
      .input("id", Number(id))
      .input("durum", durum)
      .query(`UPDATE ProformaX1 SET Durum = @durum WHERE ID = @id`);

    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const pool = await poolPromise;
    await pool.request()
      .input("id", Number(id))
      .query(`UPDATE ProformaX1 SET SilindiMi = 1 WHERE ID = @id`);
    return Response.json({ success: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
