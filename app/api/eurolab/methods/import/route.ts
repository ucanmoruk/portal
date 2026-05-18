import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { createTemplateWorkbook, excelResponse, getExcelCell, parseWorkbookRows } from "@/lib/eurolab_excel";
import { upsertLocalMethods, type EurolabMethod } from "@/lib/eurolab_local_methods";
import { sanitizeMethodPersonnel } from "@/lib/eurolab_methods";

const templateHeaders = [
    "Metot Kodu",
    "Analiz Adı",
    "Metot / Teknik",
    "Matriks",
    "Validasyon Tarihi",
    "Yetkili Personel",
];

const splitPersonnel = (value: string) =>
    value
        .split(/[;,]/)
        .map(item => item.trim())
        .filter(Boolean);

export async function GET() {
    const buffer = createTemplateWorkbook("Metotlar", templateHeaders, [
        {
            "Metot Kodu": "K.SOP.01",
            "Analiz Adı": "Derilerde Formaldehit Tayini",
            "Metot / Teknik": "K.SOP.16",
            "Matriks": "Deri",
            "Validasyon Tarihi": "2025-12-30",
            "Yetkili Personel": "Ayşe Demir; Mehmet Kaya",
        },
    ]);
    return excelResponse(buffer, "eurolab-metotlar-sablon.xlsx");
}

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            return NextResponse.json({ error: "Excel dosyası seçilmedi." }, { status: 400 });
        }

        const rows = parseWorkbookRows(Buffer.from(await file.arrayBuffer()));
        const methods: Array<Partial<EurolabMethod>> = [];
        const errors: string[] = [];

        rows.forEach((row, index) => {
            const methodCode = getExcelCell(row, ["Metot Kodu", "Method Code", "Kod"]);
            const name = getExcelCell(row, ["Analiz Adı", "Analiz Adi", "Ad", "Name"]);
            if (!methodCode && !name) return;
            if (!methodCode || !name) {
                errors.push(`${index + 2}. satır: Metot Kodu ve Analiz Adı zorunludur.`);
                return;
            }

            methods.push({
                method_code: methodCode,
                name,
                technique: getExcelCell(row, ["Metot / Teknik", "Metot", "Teknik", "Technique"]),
                matrix: getExcelCell(row, ["Matriks", "Matrix"]),
                validation_date: getExcelCell(row, ["Validasyon Tarihi", "Validation Date"]) || null,
                personnel: sanitizeMethodPersonnel(splitPersonnel(getExcelCell(row, ["Yetkili Personel", "Personel", "Personnel"]))),
            });
        });

        if (!hasEurolabDatabaseConfig()) {
            const result = await upsertLocalMethods(methods);
            return NextResponse.json({ imported: result.imported, errors });
        }

        let imported = 0;
        for (const method of methods) {
            await query(`
                INSERT INTO eurolab_methods (method_code, name, technique, matrix, personnel, validation_date, status)
                VALUES ($1, $2, $3, $4, $5, $6, 'Active')
                ON CONFLICT (method_code) DO UPDATE SET
                    name = EXCLUDED.name,
                    technique = EXCLUDED.technique,
                    matrix = EXCLUDED.matrix,
                    personnel = EXCLUDED.personnel,
                    validation_date = EXCLUDED.validation_date,
                    status = 'Active'
            `, [
                method.method_code,
                method.name,
                method.technique || "",
                method.matrix || "",
                JSON.stringify(method.personnel || []),
                method.validation_date || null,
            ]);
            imported += 1;
        }

        return NextResponse.json({ imported, errors });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Excel içeri aktarılamadı.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
