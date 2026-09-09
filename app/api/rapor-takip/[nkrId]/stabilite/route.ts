import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";
import { getStabiliteVeriJson, saveStabiliteVeriJson } from "@/lib/stabiliteData";

function jsonContentEquals(left: string | null, right: string): boolean {
  if (left == null) return false;
  try {
    return JSON.stringify(JSON.parse(left)) === JSON.stringify(JSON.parse(right));
  } catch {
    return left === right;
  }
}

async function reopenChangedStabilityReport(pool: any, nkrId: number): Promise<boolean> {
  const tables = await pool.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME IN ('NKR_RaporOnay', 'NKR_RaporDurumOverride')
      AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')
  `);
  const present = new Set(
    tables.recordset.map((row: { TABLE_NAME?: unknown }) => String(row.TABLE_NAME || "").toLowerCase()),
  );

  let reopened = false;
  if (present.has("nkr_raporonay")) {
    const result = await pool.request()
      .input("nkrId", nkrId)
      .query(`
        UPDATE NKR_RaporOnay
        SET Durum = NULL,
            YayinUrl = NULL,
            YayinTarihi = NULL,
            OnayTarihi = NULL,
            OnaylayanID = NULL,
            OnaylayanAd = NULL,
            ImzaHash = NULL,
            ImzaTarihi = NULL,
            ImzaSurum = NULL
        WHERE NkrID = @nkrId
          AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) IN (N'STABILITE', N'STABILITEEN')
          AND (Durum IS NOT NULL OR YayinUrl IS NOT NULL)
      `);
    reopened = Number(result.rowsAffected?.[0] || 0) > 0;
  }

  if (reopened && present.has("nkr_rapordurumoverride")) {
    for (const reportFormat of ["Stabilite", "StabiliteEn"]) {
      await pool.request()
        .input("nkrId", nkrId)
        .input("format", reportFormat)
        .query(`
          DELETE FROM NKR_RaporDurumOverride
          WHERE NkrID = @nkrId
            AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'));

          INSERT INTO NKR_RaporDurumOverride (NkrID, RaporFormati, Durum, UpdatedAt)
          VALUES (@nkrId, @format, N'Onay Bekleniyor', GETDATE());
        `);
    }
  }

  return reopened;
}

// GET  /api/rapor-takip/[nkrId]/stabilite?format=Stabilite  → { veri: <parsed JSON | null> }
// PUT  /api/rapor-takip/[nkrId]/stabilite  Body: { format, veri }  → { ok: true }
// Stabilite matris verisini (gün/sıcaklık/test config + sonuçlar) yükler/kaydeder.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (!Number.isFinite(nkrIdNum)) return Response.json({ error: "Geçersiz NkrID" }, { status: 400 });
  const format = (request.nextUrl.searchParams.get("format") || "Stabilite").trim();

  try {
    const pool = await cosmoPool;
    const json = await getStabiliteVeriJson(pool, nkrIdNum, format);
    return Response.json({ veri: json ? JSON.parse(json) : null });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (!Number.isFinite(nkrIdNum)) return Response.json({ error: "Geçersiz NkrID" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const format = String(body?.format || "Stabilite").trim();
  if (body?.veri == null || typeof body.veri !== "object") {
    return Response.json({ error: "veri (object) gerekli" }, { status: 400 });
  }

  try {
    const pool = await cosmoPool;
    const previousJson = await getStabiliteVeriJson(pool, nkrIdNum, format);
    const nextJson = JSON.stringify(body.veri);
    const changed = !jsonContentEquals(previousJson, nextJson);

    await saveStabiliteVeriJson(pool, nkrIdNum, format, nextJson);

    // Stabilite ve StabiliteEn aynı matrisi kullanır. Matris, rapor onaylandıktan
    // veya yayınlandıktan sonra değişirse eski PDF artık güncel değildir. Tokenı
    // koruyup yalnızca onay/yayın durumunu açarak yeni matrisin yeniden onaylanıp
    // yeni PDF olarak üretilmesini sağla.
    const reopened = changed
      ? await reopenChangedStabilityReport(pool, nkrIdNum)
      : false;

    return Response.json({ ok: true, changed, reopened });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
