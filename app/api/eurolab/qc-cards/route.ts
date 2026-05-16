import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig } from "@/lib/db_eurolab";
import { createRangeCardsFromValidation, listQcCards } from "@/lib/eurolab_qc_cards";

export async function GET(request: Request) {
  try {
    if (!hasEurolabDatabaseConfig()) return NextResponse.json([]);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    return NextResponse.json(await listQcCards(search));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "QC kartları alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab veritabanı bağlantısı yok." }, { status: 400 });
    }

    const body = await request.json();
    const validationId = Number(body.validation_id);
    const cardType = String(body.card_type || "").toUpperCase();

    if (!validationId) {
      return NextResponse.json({ error: "Validasyon seçimi zorunludur." }, { status: 400 });
    }

    if (cardType !== "RANGE") {
      return NextResponse.json({ error: "Şimdilik yalnızca Range Kart oluşturulabilir." }, { status: 400 });
    }

    return NextResponse.json(await createRangeCardsFromValidation(validationId));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "QC kart oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
