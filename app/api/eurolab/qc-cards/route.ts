import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig } from "@/lib/db_eurolab";
import { createRangeCardsFromValidation, createRecoveryCardsFromValidation, deleteQcCardGroup, findQcCardGroupByValidation, listQcCards } from "@/lib/eurolab_qc_cards";

export async function GET(request: Request) {
  try {
    if (!hasEurolabDatabaseConfig()) return NextResponse.json([]);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const validationId = Number(searchParams.get("validation_id") || "");
    return NextResponse.json(await listQcCards(search, Number.isFinite(validationId) && validationId > 0 ? validationId : undefined));
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

    if (cardType === "AVERAGE") {
      return NextResponse.json({ error: "Ortalama kart tipi henüz desteklenmiyor." }, { status: 400 });
    }

    if (cardType !== "RECOVERY" && cardType !== "RANGE") {
      return NextResponse.json({ error: "Geçerli bir QC kart tipi seçiniz." }, { status: 400 });
    }

    const existingGroup = await findQcCardGroupByValidation(validationId, cardType);
    if (existingGroup) return NextResponse.json(existingGroup);

    if (cardType === "RANGE") {
      return NextResponse.json(await createRangeCardsFromValidation(validationId));
    }
    return NextResponse.json(await createRecoveryCardsFromValidation(validationId));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "QC kart oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab veritabanÄ± baÄŸlantÄ±sÄ± yok." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get("id") || "");
    if (!id) return NextResponse.json({ error: "QC kart seÃ§imi zorunludur." }, { status: 400 });

    const deleted = await deleteQcCardGroup(id);
    if (!deleted) return NextResponse.json({ error: "QC kart bulunamadÄ±." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "QC kart silinemedi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
