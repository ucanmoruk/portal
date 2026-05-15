export const runtime = "nodejs";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";

const isPostgres = Boolean(process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL);
let ensured = false;

function rowValue(row: Record<string, any>, ...keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
    const lower = key.toLowerCase();
    if (row[lower] !== undefined) return row[lower];
    const upper = key.toUpperCase();
    if (row[upper] !== undefined) return row[upper];
  }
  return undefined;
}

async function ensureTable() {
  if (ensured) return;
  const pool = await poolPromise;

  if (isPostgres) {
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS UGD_CanliRaporEdits (
        ID SERIAL PRIMARY KEY,
        Source VARCHAR(20) NOT NULL,
        RecordID INTEGER NOT NULL,
        Dil VARCHAR(10) NOT NULL,
        Profile VARCHAR(20) NOT NULL,
        HeadHtml TEXT NULL,
        BodyHtml TEXT NULL,
        SectionsJson TEXT NULL,
        CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.request().query(`
      CREATE INDEX IF NOT EXISTS IX_UGD_CanliRaporEdits_Record
      ON UGD_CanliRaporEdits (Source, RecordID, Dil, Profile, CreatedAt)
    `);
  } else {
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = N'UGD_CanliRaporEdits'
      )
      BEGIN
        CREATE TABLE UGD_CanliRaporEdits (
          ID INT IDENTITY(1,1) PRIMARY KEY,
          Source NVARCHAR(20) NOT NULL,
          RecordID INT NOT NULL,
          Dil NVARCHAR(10) NOT NULL,
          Profile NVARCHAR(20) NOT NULL,
          HeadHtml NVARCHAR(MAX) NULL,
          BodyHtml NVARCHAR(MAX) NULL,
          SectionsJson NVARCHAR(MAX) NULL,
          CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
        );
        CREATE INDEX IX_UGD_CanliRaporEdits_Record
          ON UGD_CanliRaporEdits (Source, RecordID, Dil, Profile, CreatedAt);
      END
    `);
  }

  ensured = true;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const url = new URL(request.url);
  const source = url.searchParams.get("source") || "ugd";
  const recordId = Number(url.searchParams.get("recordId") || 0);
  const dil = url.searchParams.get("language") || "tr";
  const profile = url.searchParams.get("profile") || source;
  if (!recordId) return Response.json({ item: null });

  await ensureTable();
  const pool = await poolPromise;
  const result = await pool.request()
    .input("Source", source)
    .input("RecordID", recordId)
    .input("Dil", dil)
    .input("Profile", profile)
    .query(`
      SELECT TOP 1 ID, Source, RecordID, Dil, Profile, HeadHtml, BodyHtml, SectionsJson, CreatedAt
      FROM UGD_CanliRaporEdits
      WHERE Source = @Source AND RecordID = @RecordID AND Dil = @Dil AND Profile = @Profile
      ORDER BY CreatedAt DESC, ID DESC
    `);

  const row = result.recordset[0] as Record<string, any> | undefined;
  const sectionsJson = row ? rowValue(row, "SectionsJson") : "";
  return Response.json({
    item: row ? {
      id: rowValue(row, "ID"),
      source: rowValue(row, "Source"),
      recordId: rowValue(row, "RecordID"),
      language: rowValue(row, "Dil"),
      profile: rowValue(row, "Profile"),
      headHtml: rowValue(row, "HeadHtml") || "",
      bodyHtml: rowValue(row, "BodyHtml") || "",
      createdAt: rowValue(row, "CreatedAt"),
      sections: sectionsJson ? JSON.parse(sectionsJson) : null,
    } : null,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  const body = await request.json();
  const source = String(body.source || "ugd");
  const recordId = Number(body.recordId || 0);
  const dil = String(body.language || "tr");
  const profile = String(body.profile || source);
  const headHtml = String(body.headHtml || "");
  const bodyHtml = String(body.bodyHtml || "");
  const sectionsJson = JSON.stringify(body.sections || []);

  if (!recordId || !bodyHtml.trim()) {
    return Response.json({ error: "Kaydedilecek canlı rapor içeriği bulunamadı." }, { status: 400 });
  }

  await ensureTable();
  const pool = await poolPromise;
  await pool.request()
    .input("Source", source)
    .input("RecordID", recordId)
    .input("Dil", dil)
    .input("Profile", profile)
    .input("HeadHtml", headHtml)
    .input("BodyHtml", bodyHtml)
    .input("SectionsJson", sectionsJson)
    .query(`
      INSERT INTO UGD_CanliRaporEdits (Source, RecordID, Dil, Profile, HeadHtml, BodyHtml, SectionsJson, CreatedAt)
      VALUES (@Source, @RecordID, @Dil, @Profile, @HeadHtml, @BodyHtml, @SectionsJson, GETDATE())
    `);

  return Response.json({ ok: true });
}
