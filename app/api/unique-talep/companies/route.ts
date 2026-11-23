import { getPortalUser } from "@/lib/portalYetki";
import { cosmoPool } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user?.can("iletisim.unique-talep")) return Response.json({ error: "Yetkisiz erişim" }, { status: user ? 403 : 401 });
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 200) || "";
  if (q.length < 2) return Response.json({ data: [] });
  try {
    const pool = await cosmoPool;
    const result = await pool.request().input("Q", `%${q}%`).query("SELECT TOP 20 ID,ISNULL(Firma_Adi,'') AS name,ISNULL(Mail,'') AS email,ISNULL(Yetkili,'') AS contact FROM Firma WHERE Durum='Aktif' AND LOWER(ISNULL(Firma_Adi,'')) LIKE LOWER(@Q) ORDER BY Firma_Adi");
    return Response.json({ data: result.recordset.map(row => ({ id: Number(row.ID), name: String(row.name), email: String(row.email).trim(), contact: String(row.contact).trim() })) });
  } catch { return Response.json({ error: "Kayıtlı firmalar aranamadı. Tekrar deneyebilir veya manuel devam edebilirsiniz." }, { status: 503 }); }
}
