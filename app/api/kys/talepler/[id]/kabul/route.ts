import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { acceptKysRequestItem } from "@/lib/kysStore";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const result = await acceptKysRequestItem(Number(id), {
      ...body,
      degerlendirenId: (session.user as { userId?: string })?.userId || null,
      degerlendirenAd: session.user?.name || null,
    });
    return Response.json(result, { status: 201 });
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Talep kabulü kaydedilemedi." }, { status: 500 });
  }
}
