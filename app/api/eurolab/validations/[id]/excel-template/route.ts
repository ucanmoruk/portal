import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { getLocalValidation } from "@/lib/eurolab_local_validations";
import { buildValidationWorkbook, workbookToBuffer } from "@/lib/eurolab_validation_excel";

/**
 * GET /api/eurolab/validations/[id]/excel-template
 *
 * Protokolün aktif parametrelerine göre çok-sayfalı bir XLSX şablon üretir
 * ve binary olarak döndürür. Mevcut veriler (config.moduleData) varsa hücrelere
 * önceden yerleştirilir; kullanıcı doldurup tekrar yükleyebilir.
 */
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
                    v.method_id,
                    m.method_code,
                    m.name AS method_name,
                    m.technique,
                    m.matrix,
                    m.personnel,
                    v.study_type,
                    v.status,
                    v.planned_start_date,
                    v.planned_end_date,
                    v.study_date,
                    COALESCE(v.config, '{}'::jsonb) AS config
                FROM eurolab_validations v
                LEFT JOIN eurolab_methods m ON m.id = v.method_id
                WHERE v.id::text = $1 OR v.code = $1
                LIMIT 1
            `, [id]);
            if (res.rowCount && res.rowCount > 0) validation = res.rows[0];
        }

        if (!validation) {
            return NextResponse.json({ error: "Validasyon bulunamadı." }, { status: 404 });
        }

        const wb = buildValidationWorkbook(validation);
        const buffer = workbookToBuffer(wb);
        // Buffer'in içeriğini bağımsız bir ArrayBuffer'a kopyala (SharedArrayBuffer riskini yok et)
        const ab = new ArrayBuffer(buffer.byteLength);
        new Uint8Array(ab).set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
        const blob = new Blob([ab], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const safeCode = String(validation.code || `VAL-${validation.id}`).replace(/[^a-zA-Z0-9_\-]/g, "_");
        const fileName = `${safeCode}-sablon.xlsx`;

        return new NextResponse(blob, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${fileName}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Excel şablonu üretilemedi." },
            { status: 500 }
        );
    }
}
