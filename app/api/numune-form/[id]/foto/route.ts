import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { isNumuneFtpConfigured, uploadNumuneFotoToFtp } from "@/lib/numuneFotoUpload";

const MAX_BYTES = 8 * 1024 * 1024;

// POST multipart: file — FTP (NUMUNE_FTP_*) veya yerel public/uploads/numune/{id}.jpg, Fotograf upsert
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
      rel = `/uploads/numune/${nkrId}.jpg`;
      const absDir = path.join(process.cwd(), "public", "uploads", "numune");
      const absFile = path.join(absDir, `${nkrId}.jpg`);
      await mkdir(absDir, { recursive: true });
      await writeFile(absFile, buf);
    }

    const exists = await pool.request()
      .input("id", nkrId)
      .query("SELECT 1 AS x FROM Fotograf WHERE RaporID = @id");

    if (exists.recordset.length > 0) {
      await pool.request()
        .input("id", nkrId)
        .input("path", rel)
        .query("UPDATE Fotograf SET Path = @path WHERE RaporID = @id");
    } else {
      await pool.request()
        .input("id", nkrId)
        .input("path", rel)
        .query("INSERT INTO Fotograf (RaporID, Path) VALUES (@id, @path)");
    }

    return Response.json({ path: rel });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Kaydedilemedi";
    return Response.json({ error: msg }, { status: 500 });
  }
}
