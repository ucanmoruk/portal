import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { ensureEurolabRawdataRequirementVisualsTable } from "@/lib/eurolab_rawdata_requirement_visuals_schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabRawdataRequirementVisualsTable();

    const { id } = await context.params;
    const result = await query("DELETE FROM eurolab_rawdata_requirement_visuals WHERE id = $1 RETURNING id", [Number(id)]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Gereklilik görseli bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "Gereklilik görseli silinemedi.") }, { status: 500 });
  }
}
