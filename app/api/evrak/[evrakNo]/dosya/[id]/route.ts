import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/evrak/[evrakNo]/dosya/[id]?download=1
//   Eşleştirme kaydındaki dosyayı (FileData) geri verir.
//   download=1 → Content-Disposition: attachment, aksi halde inline.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ evrakNo: string; id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Yetkisiz", { status: 401 });

  const { evrakNo, id } = await params;
  const nid = Number(id);
  if (!evrakNo || !Number.isFinite(nid)) return new Response("Geçersiz parametre", { status: 400 });

  try {
    const pool = await cosmoPool;
    const r = await pool.request().input("e", evrakNo).input("id", nid).query(`
      SELECT FileData, ISNULL(MimeType, 'application/octet-stream') AS MimeType,
             ISNULL(FileName, 'dosya') AS FileName
      FROM NKR_EvrakEslestirme
      WHERE EvrakNo = @e AND ID = @id AND Tur = N'Dosya'
    `);
    const row = r.recordset[0] as { FileData?: Buffer; MimeType: string; FileName: string } | undefined;
    if (!row?.FileData) return new Response("Dosya bulunamadı", { status: 404 });

    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";
    const dispo = download
      ? `attachment; filename*=UTF-8''${encodeURIComponent(row.FileName)}`
      : `inline; filename*=UTF-8''${encodeURIComponent(row.FileName)}`;

    return new Response(new Uint8Array(row.FileData), {
      headers: {
        "Content-Type": row.MimeType,
        "Content-Disposition": dispo,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (e: any) {
    return new Response(e.message || "Hata", { status: 500 });
  }
}
