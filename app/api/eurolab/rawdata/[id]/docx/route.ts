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

        // Next.js Response gövdesi için Buffer yerine Uint8Array kullanıyoruz —
        // bazı sürümlerde Buffer body'si yanlış encode edilebiliyor, bu da Word'ün
        // "dosya bozuk" demesine yol açar. Uint8Array binary olarak transfer edilir.
        const body = new Uint8Array(buffer);

        return new NextResponse(body, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Content-Length": String(body.byteLength),
                // no-transform: Vercel/CDN edge'inin gzip/brotli yeniden sıkıştırma yapıp
                // zaten DEFLATE olan docx içeriğini bozmasını engeller.
                "Cache-Control": "no-store, no-transform",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Hamveri şablonu üretilemedi.";
        console.error("Hamveri DOCX üretim hatası:", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
