import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { ensureEurolabInventoryTable } from "@/lib/eurolab_inventory_schema";

const normalizeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab envanter veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabInventoryTable();

    const { id } = await params;
    const body = await request.json();
    const {
      code,
      name,
      serial_lot_no,
      intended_use,
      uncertainty_component,
      value_text,
      uncertainty_value,
      unit,
      cas_no,
      limit_info,
      distribution_type,
    } = body;
    const intendedUse = intended_use || "Numune Hazırlama";

    if (!String(code || "").trim() || !String(name || "").trim()) {
      return NextResponse.json({ error: "Kod ve Ad zorunludur." }, { status: 400 });
    }

    const res = await query(`
      UPDATE eurolab_inventory
      SET
        code = $1,
        name = $2,
        serial_lot_no = $3,
        intended_use = $4,
        uncertainty_component = $5,
        value_text = $6,
        uncertainty_value = $7,
        unit = $8,
        cas_no = $9,
        limit_info = $10,
        distribution_type = $11,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
      RETURNING *
    `, [
      String(code).trim(),
      String(name).trim(),
      String(serial_lot_no || "").trim() || null,
      intendedUse,
      String(uncertainty_component || "").trim() || null,
      String(value_text || "").trim() || null,
      normalizeNumber(uncertainty_value),
      String(unit || "").trim() || null,
      intendedUse === "Standart" ? String(cas_no || "").trim() || null : null,
      intendedUse === "Standart" ? String(limit_info || "").trim() || null : null,
      distribution_type || "Dikdörtgen",
      id,
    ]);

    if (res.rowCount === 0) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    return NextResponse.json(res.rows[0]);
  } catch (error: any) {
    console.error("Eurolab Inventory PUT Error:", error);
    const message = error.code === "23505" ? "Bu kod ile kayıtlı bir envanter kalemi zaten var." : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab envanter veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabInventoryTable();

    const { id } = await params;
    const res = await query(`
      UPDATE eurolab_inventory
      SET status = 'Passive', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id
    `, [id]);

    if (res.rowCount === 0) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    return NextResponse.json({ message: "Kayıt pasife alındı." });
  } catch (error: any) {
    console.error("Eurolab Inventory DELETE Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
