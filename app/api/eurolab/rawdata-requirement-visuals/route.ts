import { NextResponse } from "next/server";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";
import { ensureEurolabRawdataRequirementVisualsTable } from "@/lib/eurolab_rawdata_requirement_visuals_schema";
import { isNumuneFtpConfigured, uploadNumuneFileToFtp } from "@/lib/numuneFotoUpload";

const normalizeText = (value: unknown) => String(value || "").trim();
const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const selectColumns = `
  id,
  standard,
  clause,
  title,
  file_name,
  mime_type,
  file_size,
  file_url,
  created_at,
  updated_at
`;

export async function GET(request: Request) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabRawdataRequirementVisualsTable();

    const { searchParams } = new URL(request.url);
    const standard = normalizeText(searchParams.get("standard")) || "EN 71-1:2026";
    const clause = normalizeText(searchParams.get("clause"));

    if (clause) {
      const result = await query(`
        SELECT ${selectColumns}
        FROM eurolab_rawdata_requirement_visuals
        WHERE standard = $1
          AND lower(regexp_replace(clause, '\\s+', ' ', 'g')) = lower(regexp_replace($2, '\\s+', ' ', 'g'))
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `, [standard, clause]);
      return NextResponse.json(result.rows[0] || null);
    }

    const result = await query(`
      SELECT ${selectColumns}
      FROM eurolab_rawdata_requirement_visuals
      WHERE standard = $1
      ORDER BY clause ASC, updated_at DESC
    `, [standard]);

    return NextResponse.json(result.rows);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "Gereklilik görselleri alınamadı.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!hasEurolabDatabaseConfig()) {
      return NextResponse.json({ error: "Eurolab veritabanı bağlantısı eksik." }, { status: 500 });
    }

    await ensureEurolabRawdataRequirementVisualsTable();

    const formData = await request.formData();
    const file = formData.get("file");
    const standard = normalizeText(formData.get("standard")) || "EN 71-1:2026";
    const clause = normalizeText(formData.get("clause"));
    const title = normalizeText(formData.get("title")) || `Madde ${clause} gereklilik kontrol görseli`;

    if (!clause) {
      return NextResponse.json({ error: "Madde seçimi zorunludur." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF dosyası seçilmelidir." }, { status: 400 });
    }

    const mimeType = file.type || "application/pdf";
    if (mimeType !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Yalnızca PDF dosyası yüklenebilir." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let fileUrl: string | null = null;

    if (isNumuneFtpConfigured()) {
      const uploaded = await uploadNumuneFileToFtp({
        buffer,
        originalFilename: file.name || "gereklilik-kontrol-gorseli.pdf",
        prefix: `Hamveri Gereklilik ${standard} ${clause}`,
      });
      fileUrl = uploaded.pathForDb;
    }

    const result = await query(`
      INSERT INTO eurolab_rawdata_requirement_visuals (
        standard, clause, title, file_name, mime_type, file_size, file_url, file_data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (standard, clause)
      DO UPDATE SET
        title = EXCLUDED.title,
        file_name = EXCLUDED.file_name,
        mime_type = EXCLUDED.mime_type,
        file_size = EXCLUDED.file_size,
        file_url = EXCLUDED.file_url,
        file_data = EXCLUDED.file_data,
        updated_at = CURRENT_TIMESTAMP
      RETURNING ${selectColumns}
    `, [standard, clause, title, file.name || "gereklilik-kontrol-gorseli.pdf", mimeType, buffer.length, fileUrl, buffer]);

    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "Gereklilik görseli kaydedilemedi.") }, { status: 500 });
  }
}
