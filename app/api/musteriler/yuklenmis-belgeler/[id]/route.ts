import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";

// DELETE /api/musteriler/yuklenmis-belgeler/[id]
// Soft-delete: Durum='Pasif' → belge müşteri portalı "Belgelerim"den kaybolur.
// DB kaydı ve FTP'deki dosya korunur (geri alınabilir).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  const idNum = parseInt(id, 10);
  if (!Number.isFinite(idNum)) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const pool = await cosmoPool;
    // Yalnızca bu araçla yüklenen (Yol http…) Aktif kayıtları geri çekebiliriz.
    const res = await pool.request()
      .input("id", idNum)
      .query(`
        UPDATE Rapor
        SET Durum = 'Pasif'
        WHERE ID = @id AND Durum = 'Aktif' AND Yol LIKE 'http%'
      `);
    const affected = res.rowsAffected?.[0] ?? 0;
    if (!affected) {
      return Response.json({ error: "Belge bulunamadı veya zaten geri çekilmiş." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
