export const runtime = "nodejs";
// Next.js 16 bu GET route'unu statik render edip cache'lemesin — her istekte
// taze DOCX üretilmeli (aksi halde eski/bozuk dosya servis edilebiliyordu).
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

        // Vercel/serverless'ta en güvenilir binary aktarım: Blob.
        // Buffer/Uint8Array bazen ortam-spesifik encoding adımlarına takılabiliyor;
        // Blob standart Web API tipi ve düzgün transfer ediliyor.
        const u8 = new Uint8Array(buffer);
        const blob = new Blob([u8], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });

        return new Response(blob, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Content-Length": String(u8.byteLength),
                // no-transform: Vercel/CDN edge'inin gzip/brotli yeniden sıkıştırma yapıp
                // zaten DEFLATE olan docx içeriğini bozmasını engeller.
                "Cache-Control": "no-store, no-transform",
                "X-Content-Type-Options": "nosniff",
                // Tanı için: bozuksa response header'larından dosya boyutunu görebilelim.
                "X-Doc-Bytes": String(u8.byteLength),
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Hamveri şablonu üretilemedi.";
        console.error("Hamveri DOCX üretim hatası:", error);
        // Hata cevabını DOCX uzantısıyla göstermeyelim — Word açmaya çalışıp kafa karıştırır.
        return new Response(
            JSON.stringify({ error: message }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    "Cache-Control": "no-store",
                },
            },
        );
    }
}
