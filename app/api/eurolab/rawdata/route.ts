import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { ensureEurolabRawdataTable } from "@/lib/eurolab_rawdata_schema";

const PAGE_SIZE_OPTIONS = new Set([10, 20, 50, 100]);

const normalizeText = (value: unknown) => String(value || "").trim();

export async function GET(request: Request) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab hamveri veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabRawdataTable();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const requestedPageSize = Number(searchParams.get("pageSize")) || 20;
    const pageSize = PAGE_SIZE_OPTIONS.has(requestedPageSize) ? requestedPageSize : 20;
    const offset = (page - 1) * pageSize;
    const searchValue = `%${search}%`;

    const where = `
      WHERE (
        $1 = ''
        OR code ILIKE $2
        OR sample_name ILIKE $2
        OR standard ILIKE $2
        OR COALESCE(toy_category, '') ILIKE $2
        OR COALESCE(age_group, '') ILIKE $2
        OR status ILIKE $2
      )
    `;

    const countRes = await query(`SELECT COUNT(*)::int AS total FROM eurolab_rawdata ${where}`, [search, searchValue]);
    const dataRes = await query(`
      SELECT id, code, sample_name, standard, toy_category, age_group, status, created_at, updated_at
      FROM eurolab_rawdata
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $3 OFFSET $4
    `, [search, searchValue, pageSize, offset]);

    return NextResponse.json({
      rows: dataRes.rows,
      total: countRes.rows[0]?.total || 0,
      page,
      pageSize,
    });
  } catch (error: any) {
    console.error("Eurolab Rawdata GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab hamveri veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabRawdataTable();

    const body = await request.json();
    const code = normalizeText(body.code);
    const sampleName = normalizeText(body.sample_name);

    if (!code || !sampleName) {
      return NextResponse.json({ error: "Rapor no ve ürün adı zorunludur." }, { status: 400 });
    }

    const result = await query(`
      INSERT INTO eurolab_rawdata (
        code,
        sample_name,
        standard,
        toy_category,
        age_group,
        status,
        product_data,
        test_data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
      RETURNING id, code, sample_name, standard, toy_category, age_group, status, created_at, updated_at
    `, [
      code,
      sampleName,
      normalizeText(body.standard) || "EN 71-1:2026",
      normalizeText(body.toy_category) || null,
      normalizeText(body.age_group) || null,
      normalizeText(body.status) || "Taslak",
      JSON.stringify(body.product_data || {}),
      JSON.stringify(body.test_data || {}),
    ]);

    return NextResponse.json(result.rows[0]);
  } catch (error: any) {
    console.error("Eurolab Rawdata POST Error:", error);
    const message = error.code === "23505" ? "Bu rapor no ile kayıtlı hamveri zaten var." : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
