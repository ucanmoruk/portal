import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { getLocalValidation, updateLocalValidation, updateLocalValidationStatus } from "@/lib/eurolab_local_validations";

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
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!hasEurolabDatabaseConfig()) {
            const validation = await getLocalValidation(id);
            if (!validation) return NextResponse.json({ error: "Validasyon bulunamadı." }, { status: 404 });
            return NextResponse.json(validation);
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

        if (res.rowCount === 0) return NextResponse.json({ error: "Validasyon bulunamadı." }, { status: 404 });
        return NextResponse.json(res.rows[0]);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const status = body.status ? String(body.status).trim() : undefined;
        const allowedStatuses = new Set(["NEW", "IN_PROGRESS", "COMPLETED", "CANCELLED", "PASSIVE"]);

        if (status && !allowedStatuses.has(status)) {
            return NextResponse.json({ error: "Geçersiz validasyon durumu." }, { status: 400 });
        }

        if (!hasEurolabDatabaseConfig()) {
            const validation = await updateLocalValidation(id, {
                method_id: body.method_id ? Number(body.method_id) : undefined,
                study_type: body.study_type,
                status,
                planned_start_date: body.planned_start_date,
                planned_end_date: body.planned_end_date,
                config: body.config,
            });
            if (!validation) return NextResponse.json({ error: "Validasyon bulunamadı." }, { status: 404 });
            return NextResponse.json(validation);
        }

        await ensureValidationSchema();

        const existing = await query(`
            SELECT * FROM eurolab_validations WHERE id::text = $1 OR code = $1 LIMIT 1
        `, [id]);

        if (existing.rowCount === 0) return NextResponse.json({ error: "Validasyon bulunamadı." }, { status: 404 });

        const current = existing.rows[0];
        const res = await query(`
            UPDATE eurolab_validations
            SET
                method_id = COALESCE($2, method_id),
                study_type = COALESCE($3, study_type),
                status = COALESCE($4, status),
                planned_start_date = $5,
                planned_end_date = $6,
                config = COALESCE($7::jsonb, config),
                title = COALESCE((
                    SELECT name || ' Validasyonu'
                    FROM eurolab_methods
                    WHERE id = COALESCE($2, eurolab_validations.method_id)
                ), title)
            WHERE id = $1::integer
            RETURNING *
        `, [
            String(current.id),
            body.method_id ? Number(body.method_id) : null,
            body.study_type || null,
            status || null,
            Object.prototype.hasOwnProperty.call(body, "planned_start_date") ? body.planned_start_date || null : current.planned_start_date,
            Object.prototype.hasOwnProperty.call(body, "planned_end_date") ? body.planned_end_date || null : current.planned_end_date,
            Object.prototype.hasOwnProperty.call(body, "config") ? JSON.stringify(body.config || {}) : null,
        ]);

        if (res.rowCount === 0) return NextResponse.json({ error: "Validasyon bulunamadı." }, { status: 404 });
        return NextResponse.json(res.rows[0]);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!hasEurolabDatabaseConfig()) {
            const validation = await updateLocalValidationStatus(id, "PASSIVE");
            if (!validation) return NextResponse.json({ error: "Validasyon bulunamadı." }, { status: 404 });
            return NextResponse.json(validation);
        }

        await ensureValidationSchema();

        const res = await query(`
            UPDATE eurolab_validations
            SET status = 'PASSIVE'
            WHERE id::text = $1 OR code = $1
            RETURNING *
        `, [id]);

        if (res.rowCount === 0) return NextResponse.json({ error: "Validasyon bulunamadı." }, { status: 404 });
        return NextResponse.json(res.rows[0]);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
