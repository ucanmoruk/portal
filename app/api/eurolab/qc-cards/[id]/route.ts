import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig } from "@/lib/db_eurolab";
import { addQcCardPoint, deleteQcCardPoint, getQcCard, updateQcCardPoint } from "@/lib/eurolab_qc_cards";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const parseOptionalNumber = (value: unknown) =>
  value === "" || value == null ? null : Number(String(value).replace(",", "."));

const parsePointPayload = (body: Record<string, unknown>) => {
  const recovery = Number(String(body.recovery ?? "").replace(",", "."));
  const value = parseOptionalNumber(body.value);

  if (!Number.isFinite(recovery)) throw new Error("Geri kazanım değeri zorunludur.");
  if (value !== null && !Number.isFinite(value)) throw new Error("Ölçüm değeri geçerli değil.");

  return {
    label: String(body.label || "").trim(),
    analyst: String(body.analyst || "").trim(),
    value,
    recovery,
    measured_at: body.measured_at ? String(body.measured_at) : null,
  };
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab veritabanı bağlantısı yok." }, { status: 400 });
    }

    const { id } = await context.params;
    const card = await getQcCard(Number(id));
    if (!card) return NextResponse.json({ error: "QC kart bulunamadı." }, { status: 404 });

    return NextResponse.json(card);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "QC kart alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab veritabanı bağlantısı yok." }, { status: 400 });
    }

    const { id } = await context.params;
    const cardId = Number(id);
    const body = await request.json() as Record<string, unknown>;

    if (!cardId) return NextResponse.json({ error: "QC kart seçimi zorunludur." }, { status: 400 });

    await addQcCardPoint(cardId, parsePointPayload(body));

    const card = await getQcCard(cardId);
    return NextResponse.json(card);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "QC kart verisi eklenemedi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab veritabanı bağlantısı yok." }, { status: 400 });
    }

    const { id } = await context.params;
    const cardId = Number(id);
    const body = await request.json() as Record<string, unknown>;
    const pointId = Number(body.point_id);

    if (!cardId) return NextResponse.json({ error: "QC kart seçimi zorunludur." }, { status: 400 });
    if (!pointId) return NextResponse.json({ error: "Veri satırı seçimi zorunludur." }, { status: 400 });

    await updateQcCardPoint(cardId, pointId, parsePointPayload(body));

    const card = await getQcCard(cardId);
    return NextResponse.json(card);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "QC kart verisi güncellenemedi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab veritabanı bağlantısı yok." }, { status: 400 });
    }

    const { id } = await context.params;
    const cardId = Number(id);
    const body = await request.json() as Record<string, unknown>;
    const pointId = Number(body.point_id);

    if (!cardId) return NextResponse.json({ error: "QC kart seçimi zorunludur." }, { status: 400 });
    if (!pointId) return NextResponse.json({ error: "Veri satırı seçimi zorunludur." }, { status: 400 });

    await deleteQcCardPoint(cardId, pointId);

    const card = await getQcCard(cardId);
    return NextResponse.json(card);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "QC kart verisi silinemedi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
