import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { ensureEurolabRawdataTable } from "@/lib/eurolab_rawdata_schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const normalizeText = (value: unknown) => String(value || "").trim();

export async function GET(_request: Request, context: RouteContext) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab hamveri veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabRawdataTable();

    const { id } = await context.params;
    const result = await query(`
      SELECT
        id, code, sample_name, standard, toy_category, age_group, status,
        COALESCE(product_data, '{}'::jsonb) AS product_data,
        COALESCE(test_data, '{}'::jsonb) AS test_data,
        created_at, updated_at
      FROM eurolab_rawdata
      WHERE id = $1
    `, [Number(id)]);

    if (result.rowCount === 0) return NextResponse.json({ error: "Hamveri kaydı bulunamadı." }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Hamveri kaydı alınamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab hamveri veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabRawdataTable();

    const { id } = await context.params;
    const body = await request.json();
    const code = normalizeText(body.code);
    const sampleName = normalizeText(body.sample_name);

    if (!code || !sampleName) {
      return NextResponse.json({ error: "Rapor no ve ürün adı zorunludur." }, { status: 400 });
    }

    const result = await query(`
      UPDATE eurolab_rawdata
      SET
        code = $2,
        sample_name = $3,
        standard = $4,
        toy_category = $5,
        age_group = $6,
        status = $7,
        product_data = $8::jsonb,
        test_data = $9::jsonb,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, code, sample_name, standard, toy_category, age_group, status, created_at, updated_at
    `, [
      Number(id),
      code,
      sampleName,
      normalizeText(body.standard) || "EN 71-1:2026",
      normalizeText(body.toy_category) || null,
      normalizeText(body.age_group) || null,
      normalizeText(body.status) || "Taslak",
      JSON.stringify(body.product_data || {}),
      JSON.stringify(body.test_data || {}),
    ]);

    if (result.rowCount === 0) return NextResponse.json({ error: "Hamveri kaydı bulunamadı." }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    const maybeCode = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
    const message = maybeCode === "23505"
      ? "Bu rapor no ile kayıtlı hamveri zaten var."
      : error instanceof Error ? error.message : "Hamveri kaydı güncellenemedi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
