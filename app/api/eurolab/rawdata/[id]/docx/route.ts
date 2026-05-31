export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { ensureEurolabRawdataTable } from "@/lib/eurolab_rawdata_schema";
import { buildHamveriDocx } from "@/lib/eurolab/hamveri_docx";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        if (!hasEurolabDatabaseConfig()) {
            return NextResponse.json({ error: "Eurolab hamveri veritabanı bağlantısı eksik." }, { status: 500 });
        }

        await ensureEurolabRawdataTable();
        const { id } = await params;

        const result = await query(`
            SELECT
                id, code, sample_name, standard, toy_category, age_group, status,
                COALESCE(product_data, '{}'::jsonb) AS product_data,
                COALESCE(test_data, '{}'::jsonb) AS test_data,
                created_at, updated_at
            FROM eurolab_rawdata
            WHERE id = $1
        `, [Number(id)]);

        if (result.rowCount === 0) {
            return NextResponse.json({ error: "Hamveri kaydı bulunamadı." }, { status: 404 });
        }

        const record = result.rows[0];
        const buffer = buildHamveriDocx(record);

        const safeCode = String(record.code || `hamveri-${id}`).replace(/[^\w.\-]+/g, "_");
        const filename = `Hamveri-${safeCode}.docx`;

        return new NextResponse(buffer as any, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Hamveri şablonu üretilemedi.";
        console.error("Hamveri DOCX üretim hatası:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
