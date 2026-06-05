import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import sql from "mssql";

export const runtime = "nodejs";

// 10 MB sınır — istersen artırılabilir
const MAX_BYTES = 10 * 1024 * 1024;

// POST /api/evrak/[evrakNo]/dosya
//   multipart/form-data ile dosya yükle → NKR_EvrakEslestirme'ye Tur='Dosya'
//   olarak insert (FileData VARBINARY, FileName, MimeType, FileSize).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ evrakNo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const userId = (session.user as any)?.userId ?? null;
  const userName = (session.user as any)?.name || (session.user as any)?.email || null;

  const { evrakNo } = await params;
  if (!evrakNo) return Response.json({ error: "Evrak no gerekli" }, { status: 400 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Dosya bulunamadı." }, { status: 400 });
    }
    if (file.size === 0) {
      return Response.json({ error: "Dosya boş." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: `Dosya çok büyük (max ${MAX_BYTES / (1024 * 1024)} MB).` }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = (file.name || "dosya").slice(0, 255);
    const mimeType = (file.type || "application/octet-stream").slice(0, 120);

    const pool = await cosmoPool;
    const ins = await pool.request()
      .input("e",        evrakNo)
      .input("name",     fileName)
      .input("mime",     mimeType)
      .input("size",     file.size)
      .input("data",     sql.VarBinary(sql.MAX), buffer)
      .input("uid",      userId ? parseInt(userId) : null)
      .input("uad",      userName)
      .query(`
        INSERT INTO NKR_EvrakEslestirme
          (EvrakNo, Tur, FileName, MimeType, FileSize, FileData, EslestirenID, EslestirenAd)
        OUTPUT INSERTED.ID
        VALUES (@e, N'Dosya', @name, @mime, @size, @data, @uid, @uad)
      `);

    return Response.json({
      success: true,
      id: ins.recordset[0]?.ID ?? null,
      fileName, mimeType, size: file.size,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
