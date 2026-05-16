import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import sql from "mssql";
import { createPool } from "@vercel/postgres";
import { isNumuneFtpConfigured, uploadNumuneFotoToFtp } from "@/lib/numuneFotoUpload";

const MAX_BYTES = 8 * 1024 * 1024;
const usesPostgresCompat = () => Boolean(process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL);
let pgPool: ReturnType<typeof createPool> | undefined;

const getPgPool = () => {
  const connectionString = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
  if (!connectionString) throw new Error("PostgreSQL bağlantısı bulunamadı.");
  pgPool ??= createPool({ connectionString });
  return pgPool;
};

async function ensurePgFotoTable() {
  await getPgPool().query(`
    CREATE TABLE IF NOT EXISTS "NumuneFotoBlob" (
      "RaporID" integer PRIMARY KEY,
      "FotoData" bytea NOT NULL,
      "MimeType" text NOT NULL DEFAULT 'image/jpeg',
      "UpdatedAt" timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function ensureFotografBinaryColumns() {
  if (usesPostgresCompat()) return;
  const pool = await poolPromise;
  await pool.request().query(`
    IF COL_LENGTH('Fotograf', 'FotoData') IS NULL
      ALTER TABLE Fotograf ADD FotoData VARBINARY(MAX) NULL;

    IF COL_LENGTH('Fotograf', 'MimeType') IS NULL
      ALTER TABLE Fotograf ADD MimeType NVARCHAR(80) NULL;
  `);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const nkrId = parseInt(id, 10);
  if (!nkrId) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    if (usesPostgresCompat()) await ensurePgFotoTable();
    else await ensureFotografBinaryColumns();

    if (usesPostgresCompat()) {
      const blobRes = await getPgPool().query(
        `SELECT "FotoData", "MimeType" FROM "NumuneFotoBlob" WHERE "RaporID" = $1`,
        [nkrId],
      );
      const blobRow = blobRes.rows[0] as { FotoData?: Buffer; fotodata?: Buffer; MimeType?: string; mimetype?: string } | undefined;
      const data = blobRow?.FotoData || blobRow?.fotodata;
      if (data) {
        return new Response(new Uint8Array(data), {
          headers: {
            "Content-Type": blobRow?.MimeType || blobRow?.mimetype || "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    const pool = await poolPromise;
    const res = usesPostgresCompat()
      ? await pool.request()
          .input("id", nkrId)
          .query("SELECT Path FROM Fotograf WHERE RaporID = @id")
      : await pool.request()
          .input("id", nkrId)
          .query("SELECT Path, FotoData, MimeType FROM Fotograf WHERE RaporID = @id");

    const row = res.recordset[0];
    if (!row) return Response.json({ error: "Fotoğraf bulunamadı" }, { status: 404 });

    if (row.FotoData) {
      return new Response(row.FotoData, {
        headers: {
          "Content-Type": row.MimeType || "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    if (typeof row.Path === "string" && /^https?:\/\//i.test(row.Path)) {
      return Response.redirect(row.Path, 302);
    }

    return Response.json({ error: "Fotoğraf verisi bulunamadı" }, { status: 404 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Fotoğraf alınamadı";
    return Response.json({ error: msg }, { status: 500 });
  }
}

// POST multipart: file — FTP (NUMUNE_FTP_*) veya SQL binary fallback, Fotograf upsert
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { id } = await params;
  const nkrId = parseInt(id, 10);
  if (!nkrId) return Response.json({ error: "Geçersiz ID" }, { status: 400 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return Response.json({ error: "Dosya gerekli" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "Dosya çok büyük (en fazla 8 MB)" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const origName =
      typeof (file as File).name === "string" && (file as File).name
        ? (file as File).name
        : "yukleme.jpg";
    const mimeType =
      typeof (file as File).type === "string" && (file as File).type
        ? (file as File).type
        : "image/jpeg";

    if (usesPostgresCompat()) await ensurePgFotoTable();
    else await ensureFotografBinaryColumns();

    const pool = await poolPromise;
    const raporRes = await pool.request().input("id", nkrId).query("SELECT RaporNo FROM NKR WHERE ID = @id");
    const raporNo = String(raporRes.recordset[0]?.RaporNo ?? nkrId);

    let rel: string;

    if (isNumuneFtpConfigured()) {
      const { pathForDb } = await uploadNumuneFotoToFtp({
        buffer: buf,
        originalFilename: origName,
        raporNo,
      });
      rel = pathForDb;
    } else {
      rel = `/api/numune-form/${nkrId}/foto`;
      if (usesPostgresCompat()) {
        await getPgPool().query(`
          INSERT INTO "NumuneFotoBlob" ("RaporID", "FotoData", "MimeType", "UpdatedAt")
          VALUES ($1, $2, $3, now())
          ON CONFLICT ("RaporID")
          DO UPDATE SET "FotoData" = EXCLUDED."FotoData", "MimeType" = EXCLUDED."MimeType", "UpdatedAt" = now()
        `, [nkrId, buf, mimeType]);
      }
    }

    const exists = await pool.request()
      .input("id", nkrId)
      .query("SELECT 1 AS x FROM Fotograf WHERE RaporID = @id");

    if (exists.recordset.length > 0) {
      const req = pool.request()
        .input("id", nkrId)
        .input("path", rel);
      if (usesPostgresCompat()) {
        await req.query("UPDATE Fotograf SET Path = @path WHERE RaporID = @id");
      } else if (isNumuneFtpConfigured()) {
        await req.query("UPDATE Fotograf SET Path = @path, FotoData = NULL, MimeType = NULL WHERE RaporID = @id");
      } else {
        await req
          .input("fotoData", sql.VarBinary(sql.MAX), buf)
          .input("mimeType", sql.NVarChar(80), mimeType)
          .query("UPDATE Fotograf SET Path = @path, FotoData = @fotoData, MimeType = @mimeType WHERE RaporID = @id");
      }
    } else {
      const req = pool.request()
        .input("id", nkrId)
        .input("path", rel);
      if (usesPostgresCompat()) {
        await req.query("INSERT INTO Fotograf (RaporID, Path) VALUES (@id, @path)");
      } else if (isNumuneFtpConfigured()) {
        await req.query("INSERT INTO Fotograf (RaporID, Path, FotoData, MimeType) VALUES (@id, @path, NULL, NULL)");
      } else {
        await req
          .input("fotoData", sql.VarBinary(sql.MAX), buf)
          .input("mimeType", sql.NVarChar(80), mimeType)
          .query("INSERT INTO Fotograf (RaporID, Path, FotoData, MimeType) VALUES (@id, @path, @fotoData, @mimeType)");
      }
    }

    return Response.json({ path: rel });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Kaydedilemedi";
    return Response.json({ error: msg }, { status: 500 });
  }
}
