import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { createLocalValidation, listLocalValidations } from "@/lib/eurolab_local_validations";
import { sanitizeMethodPersonnel } from "@/lib/eurolab_methods";

const sanitizeValidationConfig = (config: unknown) => {
    if (!config || typeof config !== "object" || Array.isArray(config)) return config;

    const record = config as Record<string, unknown>;
    const personnel = Array.isArray(record.personnel)
        ? record.personnel.filter(person => {
            const name = person && typeof person === "object" && "name" in person
                ? String((person as { name?: unknown }).name || "")
                : String(person || "");
            return sanitizeMethodPersonnel([name]).length > 0;
        })
        : record.personnel;

    return {
        ...record,
        personnel,
    };
};

const sanitizeValidationRows = <T extends { personnel?: unknown; config?: unknown }>(rows: T[]) =>
    rows.map(row => ({
        ...row,
        personnel: sanitizeMethodPersonnel(row.personnel),
        config: sanitizeValidationConfig(row.config),
    }));

async function ensureValidationSchema() {
    await query(`
        CREATE SEQUENCE IF NOT EXISTS eurolab_validation_code_seq START 1;

        CREATE TABLE IF NOT EXISTS eurolab_validations (
            id SERIAL PRIMARY KEY,
            code VARCHAR(40) UNIQUE,
            title VARCHAR(255) NOT NULL,
            method_id INTEGER REFERENCES eurolab_methods(id) ON DELETE CASCADE,
            study_type VARCHAR(50),
            status VARCHAR(30) DEFAULT 'IN_PROGRESS',
            planned_start_date DATE,
            planned_end_date DATE,
            study_date DATE DEFAULT CURRENT_DATE,
            config JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await query(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_validations' AND column_name='code') THEN
                ALTER TABLE eurolab_validations ADD COLUMN code VARCHAR(40) UNIQUE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_validations' AND column_name='planned_start_date') THEN
                ALTER TABLE eurolab_validations ADD COLUMN planned_start_date DATE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_validations' AND column_name='planned_end_date') THEN
                ALTER TABLE eurolab_validations ADD COLUMN planned_end_date DATE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='eurolab_validations' AND column_name='config') THEN
                ALTER TABLE eurolab_validations ADD COLUMN config JSONB DEFAULT '{}'::jsonb;
            END IF;
        END $$;
    `);
}

export async function GET() {
    try {
        if (!hasEurolabDatabaseConfig()) {
            return NextResponse.json(sanitizeValidationRows(await listLocalValidations()));
        }

        await ensureValidationSchema();

        const res = await query(`
            SELECT
                v.id,
                COALESCE(v.code, 'VAL-' || v.id::text) AS code,
                v.title,
                v.method_id,
                m.method_code,
                m.name AS method_name,
                m.technique,
                m.personnel,
                v.study_type,
                v.status,
                v.planned_start_date,
                v.planned_end_date,
                v.study_date,
                COALESCE(v.config, '{}'::jsonb) AS config
            FROM eurolab_validations v
            LEFT JOIN eurolab_methods m ON m.id = v.method_id
            WHERE COALESCE(v.status, '') <> 'PASSIVE'
            ORDER BY COALESCE(v.planned_start_date, v.study_date) DESC, v.id DESC
        `);

        return NextResponse.json(sanitizeValidationRows(res.rows));
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Validasyon kayÄ±tlarÄ± alÄ±namadÄ±.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { method_id, study_type, planned_start_date, planned_end_date, config } = body;

        if (!method_id) {
            return NextResponse.json({ error: "Metot seçimi zorunludur." }, { status: 400 });
        }

        if (!hasEurolabDatabaseConfig()) {
            return NextResponse.json(await createLocalValidation({
                method_id: Number(method_id),
                study_type,
                planned_start_date,
                planned_end_date,
                config,
            }));
        }

        await ensureValidationSchema();

        // Validasyon kodu: metoda göre üretilir, örn. "K.SOP.01-Ek.1", "K.SOP.01-Ek.2"...
        // Aynı metoda ait kaç validasyon varsa Ek numarası onun bir sonrası olur.
        // Metodun method_code'u yoksa eski VAL-YYYY-NNN formatına düşülür.
        const res = await query(`
            WITH chosen AS (
                SELECT m.id AS method_id, m.method_code, m.name
                FROM eurolab_methods m WHERE m.id = $1
            ), next_ek AS (
                SELECT COALESCE(MAX(
                    CASE
                        WHEN v.code ~ '-Ek\\.[0-9]+$'
                        THEN (regexp_replace(v.code, '^.*-Ek\\.([0-9]+)$', '\\1'))::int
                        ELSE 0
                    END
                ), 0) + 1 AS next_no
                FROM eurolab_validations v
                JOIN chosen c ON c.method_id = v.method_id
            )
            INSERT INTO eurolab_validations
                (code, title, method_id, study_type, status, planned_start_date, planned_end_date, config)
            SELECT
                CASE
                    WHEN NULLIF(TRIM(c.method_code), '') IS NOT NULL
                        THEN TRIM(c.method_code) || '-Ek.' || (SELECT next_no::text FROM next_ek)
                    ELSE 'VAL-' || EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' || LPAD(nextval('eurolab_validation_code_seq')::text, 3, '0')
                END,
                c.name || ' Validasyonu',
                c.method_id,
                $2,
                'NEW',
                $3,
                $4,
                $5::jsonb
            FROM chosen c
            RETURNING *
        `, [
            Number(method_id),
            study_type || "FULL_VALIDATION",
            planned_start_date || null,
            planned_end_date || null,
            JSON.stringify(config || {}),
        ]);

        if (res.rowCount === 0) {
            return NextResponse.json({ error: "Seçilen metot bulunamadı." }, { status: 404 });
        }

        return NextResponse.json(res.rows[0]);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Validasyon oluÅŸturulamadÄ±.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
