import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { migrateKysCosmoToMysql } from "@/lib/kysMigration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    return Response.json(await migrateKysCosmoToMysql("dry-run"));
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Migration ön izlemesi alınamadı." }, { status: 500 });
  }
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  try {
    return Response.json(await migrateKysCosmoToMysql("run"));
  } catch (e: unknown) {
    return Response.json({ error: e instanceof Error ? e.message : "Migration çalıştırılamadı." }, { status: 500 });
  }
}
