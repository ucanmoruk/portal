import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import sql from "mssql";
import { isNumuneFtpConfigured, uploadNumuneFotoToFtp } from "@/lib/numuneFotoUpload";

const MAX_BYTES = 8 * 1024 * 1024;

async function ensureFotografBinaryColumns() {
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
    await ensureFotografBinaryColumns();
    await ensureFotografBinaryColumns();
    const pool = await poolPromise;
    const res = await pool.request()
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
    }

    const exists = await pool.request()
      .input("id", nkrId)
      .query("SELECT 1 AS x FROM Fotograf WHERE RaporID = @id");

    if (exists.recordset.length > 0) {
      const req = pool.request()
        .input("id", nkrId)
        .input("path", rel);
      if (isNumuneFtpConfigured()) {
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
      if (isNumuneFtpConfigured()) {
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
