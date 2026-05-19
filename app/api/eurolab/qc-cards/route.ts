import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig } from "@/lib/db_eurolab";
import { createRecoveryCardsFromValidation, findQcCardGroupByValidation, listQcCards } from "@/lib/eurolab_qc_cards";

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

    if (cardType === "AVERAGE" || cardType === "RANGE") {
      return NextResponse.json({ error: "Bu kart tipi için hesaplama kurgusu sonraki aşamada eklenecek." }, { status: 400 });
    }

    if (cardType !== "RECOVERY") {
      return NextResponse.json({ error: "Geçerli bir QC kart tipi seçiniz." }, { status: 400 });
    }

    const existingGroup = await findQcCardGroupByValidation(validationId, "RECOVERY");
    if (existingGroup) return NextResponse.json(existingGroup);

    return NextResponse.json(await createRecoveryCardsFromValidation(validationId));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "QC kart oluşturulamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
