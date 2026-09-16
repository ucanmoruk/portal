import { getPortalUser } from "@/lib/portalYetki";
import { cosmoPool } from "@/lib/db";
import { ensureKysPurchaseSchema } from "@/lib/kysPurchaseWorkflow";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; belgeId: string }> },
) {
  const user = await getPortalUser();
  if (!user) return new Response("Yetkisiz erişim", { status: 401 });
  if (!user.can("laboratuvar.kys.talep-listesi"))
    return new Response("Yetkiniz yok.", { status: 403 });
  const { id, belgeId } = await params;
  await ensureKysPurchaseSchema();
  const p = await cosmoPool;
  const row = (
    await p
      .request()
      .input("ID", Number(belgeId))
      .input("TalepID", Number(id))
      .query(
        "SELECT DosyaAdi,MimeType,FileData FROM KysTalepBelge WHERE ID=@ID AND TalepID=@TalepID",
      )
  ).recordset[0];
  if (!row) return new Response("Belge bulunamadı", { status: 404 });
  return new Response(new Uint8Array(row.FileData), {
    headers: {
      "Content-Type": row.MimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.DosyaAdi)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
