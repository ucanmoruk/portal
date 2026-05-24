import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { getLocalValidation, updateLocalValidation } from "@/lib/eurolab_local_validations";
import { parseValidationWorkbook } from "@/lib/eurolab_validation_excel";

/**
 * POST /api/eurolab/validations/[id]/excel-import
 *
 * multipart/form-data: file=<xlsx>
 *
 * Yüklenen XLSX'i parse eder, mevcut config.moduleData ile merge eder
 * (SADECE DOLU hücreler üzerine yazılır, boş hücreler mevcut veriyi korur),
 * sonra config'i günceller. Hangi modül/komponentlerin etkilendiğini döner.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        // Multipart parse
        const formData = await request.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: "Dosya bulunamadı (file alanı eksik)." }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Mevcut validasyonu yükle
        let validation: any = null;

        if (!hasEurolabDatabaseConfig()) {
            validation = await getLocalValidation(id);
        } else {
            const res = await query(`
                SELECT * FROM eurolab_validations WHERE id::text = $1 OR code = $1 LIMIT 1
            `, [id]);
            if (res.rowCount && res.rowCount > 0) validation = res.rows[0];
        }

        if (!validation) {
            return NextResponse.json({ error: "Validasyon bulunamadı." }, { status: 404 });
        }

        const currentConfig = validation.config || {};
        const currentModuleData = currentConfig.moduleData || {};

        // Excel'i parse et — sadece dolu hücreler "imported" olarak gelir
        const { moduleData: importedModuleData, touched } = parseValidationWorkbook(buffer, currentModuleData);

        if (touched.length === 0) {
            return NextResponse.json({
                ok: true,
                touched: [],
                message: "Excel'de import edilebilir veri bulunamadı (tüm hücreler boş).",
            });
        }

        // Top-level merge: dokunulan modüller için yeni veri, diğerleri olduğu gibi
        const mergedModuleData: Record<string, Record<string, any>> = { ...currentModuleData };
        for (const [type, compMap] of Object.entries(importedModuleData)) {
            mergedModuleData[type] = {
                ...(currentModuleData[type] || {}),
                ...compMap,
            };
        }

        const nextConfig = {
            ...currentConfig,
            moduleData: mergedModuleData,
        };

        // Persist
        if (!hasEurolabDatabaseConfig()) {
            const updated = await updateLocalValidation(id, { config: nextConfig });
            if (!updated) {
                return NextResponse.json({ error: "Validasyon güncellenemedi." }, { status: 500 });
            }
        } else {
            await query(`
                UPDATE eurolab_validations
                SET config = $2::jsonb
                WHERE id::text = $1 OR code = $1
            `, [id, JSON.stringify(nextConfig)]);
        }

        return NextResponse.json({
            ok: true,
            touched,
            message: `${touched.length} kayıt güncellendi.`,
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Excel yüklenemedi." },
            { status: 500 }
        );
    }
}
