import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllSettings, setSettings } from "@/lib/settings";

const ADMIN_IDS = new Set(["1", "2"]);

async function checkAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const uid = String((session.user as any)?.userId ?? "");
  return ADMIN_IDS.has(uid) ? session : null;
}

export async function GET() {
  if (!await checkAdmin()) return Response.json({ error: "Yetkisiz" }, { status: 401 });
  const settings = await getAllSettings();
  return Response.json(settings);
}

export async function POST(request: Request) {
  if (!await checkAdmin()) return Response.json({ error: "Yetkisiz" }, { status: 401 });
  const body = await request.json();
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Geçersiz veri" }, { status: 400 });
  }
  await setSettings(body);
  return Response.json({ success: true });
}
