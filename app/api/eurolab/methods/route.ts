import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { createLocalMethod, listLocalMethods } from "@/lib/eurolab_local_methods";

// GET /api/eurolab/methods
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";

        if (!hasEurolabDatabaseConfig()) {
            return NextResponse.json(await listLocalMethods(search));
        }
        
        let sql = `
            SELECT * FROM eurolab_methods 
            WHERE (method_code ILIKE $1 OR name ILIKE $1 OR technique ILIKE $1 OR matrix ILIKE $1)
            AND status = 'Active'
            ORDER BY method_code ASC
        `;
        
        const res = await query(sql, [`%${search}%`]);
        return NextResponse.json(res.rows);
    } catch (error: any) {
        console.error("Eurolab Methods GET Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/eurolab/methods
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { method_code, name, technique, matrix, personnel, validation_date } = body;

        if (!hasEurolabDatabaseConfig()) {
            return NextResponse.json(await createLocalMethod({
                method_code,
                name,
                technique,
                matrix,
                personnel,
                validation_date: validation_date || null,
            }));
        }

        const sql = `
            INSERT INTO eurolab_methods (method_code, name, technique, matrix, personnel, validation_date, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'Active')
            RETURNING *
        `;
        
        const res = await query(sql, [
            method_code, 
            name, 
            technique, 
            matrix, 
            JSON.stringify(personnel || []), 
            validation_date || null
        ]);
        
        return NextResponse.json(res.rows[0]);
    } catch (error: any) {
        console.error("Eurolab Methods POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
