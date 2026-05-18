import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { ensureEurolabInventoryTable } from "@/lib/eurolab_inventory_schema";
import { createTemplateWorkbook, excelResponse, getExcelCell, parseWorkbookRows } from "@/lib/eurolab_excel";

const templateHeaders = [
    "Kod",
    "Ad",
    "Seri/Lot No",
    "Kullanım Amacı",
    "Belirsizlik Bileşeni",
    "Değer",
    "Sertifika Belirsizlik Değeri",
    "Birim",
    "CAS No",
    "Limit",
    "Dağılım Türü",
];

const normalizeNumber = (value: string) => {
    if (!value) return null;
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
};

export async function GET() {
    const buffer = createTemplateWorkbook("Envanter", templateHeaders, [
        {
            "Kod": "STD-FRM-001",
            "Ad": "Formaldehit Standart",
            "Seri/Lot No": "LOT-2026-001",
            "Kullanım Amacı": "Standart",
            "Belirsizlik Bileşeni": "Standart sertifika belirsizliği",
            "Değer": "1000 mg/L",
            "Sertifika Belirsizlik Değeri": "0,02531",
            "Birim": "mg/kg",
            "CAS No": "50-00-0",
            "Limit": "0,18 - 3",
            "Dağılım Türü": "Normal",
        },
        {
            "Kod": "CIH-HPLC-001",
            "Ad": "HPLC Cihazı",
            "Seri/Lot No": "SN-001",
            "Kullanım Amacı": "Ana Cihaz",
            "Belirsizlik Bileşeni": "Cihaz tekrarlanabilirliği",
            "Değer": "",
            "Sertifika Belirsizlik Değeri": "",
            "Birim": "",
            "CAS No": "",
            "Limit": "",
            "Dağılım Türü": "Dikdörtgen",
        },
    ]);
    return excelResponse(buffer, "eurolab-envanter-sablon.xlsx");
}

export async function POST(request: Request) {
    try {
        if (!hasEurolabDatabaseConfig()) {
            return NextResponse.json({ error: "Eurolab envanter veritabanı bağlantısı eksik." }, { status: 500 });
        }

        await ensureEurolabInventoryTable();

        const formData = await request.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            return NextResponse.json({ error: "Excel dosyası seçilmedi." }, { status: 400 });
        }

        const rows = parseWorkbookRows(Buffer.from(await file.arrayBuffer()));
        let imported = 0;
        const errors: string[] = [];

        for (const [index, row] of rows.entries()) {
            const code = getExcelCell(row, ["Kod", "Code"]);
            const name = getExcelCell(row, ["Ad", "Adı", "Name"]);
            if (!code && !name) continue;
            if (!code || !name) {
                errors.push(`${index + 2}. satır: Kod ve Ad zorunludur.`);
                continue;
            }

            const intendedUse = getExcelCell(row, ["Kullanım Amacı", "Kullanim Amaci", "Intended Use"]) || "Numune Hazırlama";
            const casNo = intendedUse === "Standart" ? getExcelCell(row, ["CAS No", "Cas No"]) || null : null;
            const limitInfo = intendedUse === "Standart" ? getExcelCell(row, ["Limit", "Limit Bilgisi"]) || null : null;

            await query(`
                INSERT INTO eurolab_inventory (
                    code, name, serial_lot_no, intended_use, uncertainty_component, value_text,
                    uncertainty_value, unit, cas_no, limit_info, distribution_type, status, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Active', CURRENT_TIMESTAMP)
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    serial_lot_no = EXCLUDED.serial_lot_no,
                    intended_use = EXCLUDED.intended_use,
                    uncertainty_component = EXCLUDED.uncertainty_component,
                    value_text = EXCLUDED.value_text,
                    uncertainty_value = EXCLUDED.uncertainty_value,
                    unit = EXCLUDED.unit,
                    cas_no = EXCLUDED.cas_no,
                    limit_info = EXCLUDED.limit_info,
                    distribution_type = EXCLUDED.distribution_type,
                    status = 'Active',
                    updated_at = CURRENT_TIMESTAMP
            `, [
                code,
                name,
                getExcelCell(row, ["Seri/Lot No", "Seri Lot No", "Serial Lot No"]) || null,
                intendedUse,
                getExcelCell(row, ["Belirsizlik Bileşeni", "Belirsizlik Bileseni"]) || null,
                getExcelCell(row, ["Değer", "Deger", "Value"]) || null,
                normalizeNumber(getExcelCell(row, ["Sertifika Belirsizlik Değeri", "Sertifika Belirsizlik Degeri", "Belirsizlik Değeri"])),
                getExcelCell(row, ["Birim", "Unit"]) || null,
                casNo,
                limitInfo,
                getExcelCell(row, ["Dağılım Türü", "Dagilim Turu", "Distribution Type"]) || "Dikdörtgen",
            ]);
            imported += 1;
        }

        return NextResponse.json({ imported, errors });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Excel içeri aktarılamadı.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
