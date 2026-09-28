import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { importKysDocument } from "@/lib/kysDocumentImport";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  if (!dokumanYetkileri(user).duzenle) return NextResponse.json({ error: "Doküman düzenleme yetkiniz yok." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Dosya seçilmedi." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Dosya en fazla 15 MB olabilir." }, { status: 413 });
    const result = await importKysDocument(file.name, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dosya içe aktarılamadı." }, { status: 400 });
  }
}
