import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { ensureEurolabInventoryTable } from "@/lib/eurolab_inventory_schema";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabInventoryTable();

    const { id } = await params;
    const inventoryRes = await query(`
      SELECT id, code, name, serial_lot_no
      FROM eurolab_inventory
      WHERE id = $1 AND status = 'Active'
    `, [id]);

    if (inventoryRes.rowCount === 0) {
      return NextResponse.json({ error: "Envanter kaydı bulunamadı." }, { status: 404 });
    }

    const item = inventoryRes.rows[0];
    const terms = [item.code, item.name, item.serial_lot_no]
      .map(value => String(value || "").trim())
      .filter(Boolean);

    if (terms.length === 0) {
      return NextResponse.json({ inventory: item, rows: [] });
    }

    const paramsList: unknown[] = [];
    const conditions = terms.map(term => {
      paramsList.push(`%${term}%`);
      const index = paramsList.length;
      return `(COALESCE(v.config::text, '') ILIKE $${index} OR COALESCE(v.title, '') ILIKE $${index})`;
    });

    const validationRes = await query(`
      SELECT
        v.id,
        COALESCE(v.code, 'VAL-' || v.id::text) AS code,
        v.title,
        v.study_type,
        v.status,
        v.planned_start_date,
        v.planned_end_date,
        v.study_date,
        m.method_code,
        m.name AS method_name
      FROM eurolab_validations v
      LEFT JOIN eurolab_methods m ON m.id = v.method_id
      WHERE (${conditions.join(" OR ")})
        AND COALESCE(v.status, '') <> 'PASSIVE'
      ORDER BY COALESCE(v.planned_start_date, v.study_date) DESC, v.id DESC
      LIMIT 50
    `, paramsList);

    return NextResponse.json({ inventory: item, rows: validationRes.rows });
  } catch (error: any) {
    console.error("Eurolab Inventory Validations GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
