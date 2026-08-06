import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";
import { getStabiliteVeriJson, saveStabiliteVeriJson } from "@/lib/stabiliteData";

// GET  /api/rapor-takip/[nkrId]/stabilite?format=Stabilite  → { veri: <parsed JSON | null> }
// PUT  /api/rapor-takip/[nkrId]/stabilite  Body: { format, veri }  → { ok: true }
// Stabilite matris verisini (gün/sıcaklık/test config + sonuçlar) yükler/kaydeder.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (!Number.isFinite(nkrIdNum)) return Response.json({ error: "Geçersiz NkrID" }, { status: 400 });
  const format = (request.nextUrl.searchParams.get("format") || "Stabilite").trim();

  try {
    const pool = await cosmoPool;
    const json = await getStabiliteVeriJson(pool, nkrIdNum, format);
    return Response.json({ veri: json ? JSON.parse(json) : null });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (!Number.isFinite(nkrIdNum)) return Response.json({ error: "Geçersiz NkrID" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const format = String(body?.format || "Stabilite").trim();
  if (body?.veri == null || typeof body.veri !== "object") {
    return Response.json({ error: "veri (object) gerekli" }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;
    await saveStabiliteVeriJson(pool, nkrIdNum, format, JSON.stringify(body.veri));
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
