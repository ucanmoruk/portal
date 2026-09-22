import { getPortalUser } from "@/lib/portalYetki";
import { createMuhasebeRow, deleteMuhasebeRow, listMuhasebeRows, updateMuhasebeRow } from "@/lib/muhasebeStore";

const fail = (message: string, status: number) => Response.json({ error: message }, { status });

async function admin() {
  const user = await getPortalUser();
  if (!user) return { error: fail("Yetkisiz erişim", 401) };
  if (!user.isAdmin) return { error: fail("Muhasebe alanına yalnızca yöneticiler erişebilir.", 403) };
  return { user };
}

export async function GET() {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  try { return Response.json({ data: await listMuhasebeRows() }); }
  catch (error) { return fail(error instanceof Error ? error.message : "Muhasebe verileri alınamadı.", 500); }
}

export async function POST(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  try { return Response.json({ data: await createMuhasebeRow(await request.json(), auth.user) }, { status: 201 }); }
  catch (error) { return fail(error instanceof Error ? error.message : "Kayıt eklenemedi.", 400); }
}

export async function PATCH(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  try { const body = await request.json(); return Response.json({ data: await updateMuhasebeRow(Number(body.id), body) }); }
  catch (error) { return fail(error instanceof Error ? error.message : "Kayıt güncellenemedi.", 400); }
}

export async function DELETE(request: Request) {
  const auth = await admin();
  if ("error" in auth) return auth.error;
  try { const id = Number(new URL(request.url).searchParams.get("id")); await deleteMuhasebeRow(id); return Response.json({ ok: true }); }
  catch (error) { return fail(error instanceof Error ? error.message : "Kayıt silinemedi.", 400); }
}
