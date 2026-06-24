import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { loadRaporViewData } from "@/lib/raporViewData";
import { loadRaporEdit, saveRaporEdit, type RaporEditPayload } from "@/lib/raporDuzenleme";
import { type NextRequest } from "next/server";

const DATA_FORMAT_ALIAS: Record<string, string> = {
  DetayRapor: "Genel",
  DetayFormat: "Genel",
};

function isApprovedStatus(durum: unknown) {
  return ["Onaylandı", "Onaylandi", "Yayınlandı", "Yayinlandi", "Arşiv", "Arsiv"].includes(String(durum || ""));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  const format = (request.nextUrl.searchParams.get("format") || "").trim();
  if (!Number.isFinite(nkrIdNum) || !format) {
    return Response.json({ error: "Geçersiz rapor / format." }, { status: 400 });
  }

  const dataFormat = DATA_FORMAT_ALIAS[format] ?? format;
  const data = await loadRaporViewData(nkrIdNum, dataFormat, format);
  if (!data) return Response.json({ error: "Rapor bulunamadı." }, { status: 404 });

  const pool = await cosmoPool;
  const edit = await loadRaporEdit(pool, nkrIdNum, format);
  const approved = isApprovedStatus(data.onay?.durum);
  return Response.json({ data, locked: edit.kilitli || approved, approved });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  const format = (request.nextUrl.searchParams.get("format") || "").trim();
  if (!Number.isFinite(nkrIdNum) || !format) {
    return Response.json({ error: "Geçersiz rapor / format." }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as RaporEditPayload;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Geçersiz düzenleme verisi." }, { status: 400 });
  }
  if (body.hizmetler && !Array.isArray(body.hizmetler)) {
    return Response.json({ error: "Hizmetler listesi geçersiz." }, { status: 400 });
  }

  const pool = await cosmoPool;
  const edit = await loadRaporEdit(pool, nkrIdNum, format);
  const dataFormat = DATA_FORMAT_ALIAS[format] ?? format;
  const data = await loadRaporViewData(nkrIdNum, dataFormat, format);
  if (!data) return Response.json({ error: "Rapor bulunamadı." }, { status: 404 });
  if (edit.kilitli || isApprovedStatus(data.onay?.durum)) {
    return Response.json({ error: "Bu rapor onaylandığı için düzenlenemez." }, { status: 409 });
  }

  const userId = ((session.user as any)?.userId ?? null) as number | null;
  await saveRaporEdit(pool, nkrIdNum, format, body, userId);
  return Response.json({ ok: true });
}
