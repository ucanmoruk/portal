import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { ensureEurolabRawdataInstructionsTable } from "@/lib/eurolab_rawdata_instructions_schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabRawdataInstructionsTable();

    const { id } = await context.params;
    const result = await query(`
      SELECT file_name, mime_type, file_data
      FROM eurolab_rawdata_instructions
      WHERE id = $1
    `, [Number(id)]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Analiz talimatı bulunamadı." }, { status: 404 });
    }

    const row = result.rows[0] as { file_name: string; mime_type: string; file_data: Buffer };
    return new Response(new Uint8Array(row.file_data), {
      headers: {
        "Content-Type": row.mime_type || "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(row.file_name || "analiz-talimati.pdf")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Analiz talimatı açılamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
