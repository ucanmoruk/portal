import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateKysBirim } from "@/lib/kysStore";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    await updateKysBirim(Number(id), await request.json());
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Birim güncellenemedi." }, { status: 500 });
  }
}
