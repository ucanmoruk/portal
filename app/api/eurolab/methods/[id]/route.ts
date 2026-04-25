import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { deactivateLocalMethod, getLocalMethod, updateLocalMethod } from "@/lib/eurolab_local_methods";

// GET /api/eurolab/methods/[id]
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!hasEurolabDatabaseConfig()) {
            const method = await getLocalMethod(id);
            if (!method) return NextResponse.json({ error: "Not found" }, { status: 404 });
            return NextResponse.json(method);
        }

        const res = await query("SELECT * FROM eurolab_methods WHERE id = $1", [id]);
        if (res.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(res.rows[0]);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT /api/eurolab/methods/[id]
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { method_code, name, technique, matrix, personnel, validation_date, instruction } = body;

        if (!hasEurolabDatabaseConfig()) {
            const method = await updateLocalMethod(id, instruction !== undefined
                ? { instruction }
                : { method_code, name, technique, matrix, personnel, validation_date: validation_date || null });
            if (!method) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
            return NextResponse.json(method);
        }

        let sql = "";
        let values = [];

        if (instruction !== undefined) {
            // Sadece talimatı güncelleme (Talimat sayfası için)
            sql = "UPDATE eurolab_methods SET instruction = $1 WHERE id = $2 RETURNING *";
            values = [JSON.stringify(instruction), id];
        } else {
            // Genel bilgileri güncelleme
            sql = `
                UPDATE eurolab_methods 
                SET method_code = $1, name = $2, technique = $3, matrix = $4, personnel = $5, validation_date = $6
                WHERE id = $7
                RETURNING *
            `;
            values = [method_code, name, technique, matrix, JSON.stringify(personnel || []), validation_date || null, id];
        }
        
        const res = await query(sql, values);
        if (res.rowCount === 0) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
        return NextResponse.json(res.rows[0]);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/eurolab/methods/[id]
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        if (!hasEurolabDatabaseConfig()) {
            const method = await deactivateLocalMethod(id);
            if (!method) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
            return NextResponse.json({ message: "Kayıt pasifleştirildi" });
        }

        const res = await query("UPDATE eurolab_methods SET status = 'Passive' WHERE id = $1 RETURNING *", [id]);
        if (res.rowCount === 0) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
        return NextResponse.json({ message: "Kayıt pasifleştirildi" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
