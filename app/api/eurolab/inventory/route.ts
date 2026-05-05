import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { ensureEurolabInventoryTable } from "@/lib/eurolab_inventory_schema";

const PAGE_SIZE_OPTIONS = new Set([10, 20, 50, 100]);

const normalizeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: Request) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab envanter veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabInventoryTable();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const requestedPageSize = Number(searchParams.get("pageSize")) || 20;
    const pageSize = PAGE_SIZE_OPTIONS.has(requestedPageSize) ? requestedPageSize : 20;
    const offset = (page - 1) * pageSize;
    const searchValue = `%${search}%`;

    const where = `
      WHERE status = 'Active'
      AND (
        $1 = ''
        OR code ILIKE $2
        OR name ILIKE $2
        OR COALESCE(serial_lot_no, '') ILIKE $2
        OR intended_use ILIKE $2
        OR COALESCE(uncertainty_component, '') ILIKE $2
        OR COALESCE(value_text, '') ILIKE $2
        OR COALESCE(cas_no, '') ILIKE $2
        OR COALESCE(limit_info, '') ILIKE $2
        OR COALESCE(unit, '') ILIKE $2
        OR distribution_type ILIKE $2
      )
    `;

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM eurolab_inventory ${where}`, [search, searchValue]);
    const dataRes = await query(`
      SELECT
        id,
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
        status,
        created_at,
        updated_at
      FROM eurolab_inventory
      ${where}
      ORDER BY code ASC, name ASC
      LIMIT $3 OFFSET $4
    `, [search, searchValue, pageSize, offset]);

    return NextResponse.json({
      rows: dataRes.rows,
      total: countRes.rows[0]?.total || 0,
      page,
      pageSize,
    });
  } catch (error: any) {
    console.error("Eurolab Inventory GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab envanter veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabInventoryTable();

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
      INSERT INTO eurolab_inventory (
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
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Active')
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
    ]);

    return NextResponse.json(res.rows[0]);
  } catch (error: any) {
    console.error("Eurolab Inventory POST Error:", error);
    const message = error.code === "23505" ? "Bu kod ile kayıtlı bir envanter kalemi zaten var." : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
