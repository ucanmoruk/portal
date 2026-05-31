export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { getLocalValidation } from "@/lib/eurolab_local_validations";
import { buildValidationProtocolDocx } from "@/lib/eurolab/validation_protocol_docx";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        let validation: any = null;
        if (!hasEurolabDatabaseConfig()) {
            validation = await getLocalValidation(id);
        } else {
            const res = await query(`
                SELECT
                    v.id,
                    COALESCE(v.code, 'VAL-' || v.id::text) AS code,
                    v.title,
                    m.method_code,
                    m.name AS method_name,
                    m.technique,
                    m.matrix,
                    m.personnel,
                    v.study_type,
                    v.planned_start_date,
                    v.planned_end_date,
                    COALESCE(v.config, '{}'::jsonb) AS config
                FROM eurolab_validations v
                LEFT JOIN eurolab_methods m ON m.id = v.method_id
                WHERE v.id::text = $1 OR v.code = $1
                LIMIT 1
            `, [id]);
            if (res.rowCount === 0) return NextResponse.json({ error: "Validasyon bulunamadı." }, { status: 404 });
            validation = res.rows[0];
        }

        if (!validation) return NextResponse.json({ error: "Validasyon bulunamadı." }, { status: 404 });

        const buffer = buildValidationProtocolDocx(validation);
        const safeCode = String(validation.code || `validasyon-${id}`).replace(/[^\w.\-]+/g, "_");
        const filename = `Validasyon-Plani-${safeCode}.docx`;

        return new NextResponse(buffer as any, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error: any) {
        console.error("Validasyon protokolü DOCX üretim hatası:", error);
        return NextResponse.json({ error: error?.message || "Şablon üretilemedi." }, { status: 500 });
    }
}
