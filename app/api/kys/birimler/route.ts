import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createKysBirim, listKysBirimler } from "@/lib/kysStore";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    return Response.json({ data: await listKysBirimler() });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Birim listesi alınamadı." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const id = await createKysBirim(await request.json());
    return Response.json({ id }, { status: 201 });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Birim kaydedilemedi." }, { status: 500 });
  }
}
