import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";
import { isRaporFtpConfigured, uploadRaporPdfToFtp } from "@/lib/raporPdfUpload";
import { renderUrlToPdf } from "@/lib/chromiumPdf";
import { signPdfBuffer, pdfImzaYapilandirildi } from "@/lib/raporPdfSign";
import { getRaporPdfBaseUrl } from "@/lib/raporPdfBaseUrl";
import { maybeMergeEk } from "@/lib/raporEkMerge";
import { ensureEnglishApprovalForBase } from "@/lib/raporOnaySync";
import { isEnglishReportFormat } from "@/lib/raporFormatLanguage";

// PDF üretimi (Chromium) + FTP yükleme süre alır.
export const runtime = "nodejs";
export const maxDuration = 60;

type PublishStage = "pdf" | "ftp";

class PublishTimeoutError extends Error {
  constructor(
    public readonly stage: PublishStage,
    timeoutMs: number,
  ) {
    super(`${stage === "pdf" ? "PDF üretimi" : "FTP yükleme"} zaman aşımına uğradı (${timeoutMs} ms).`);
    this.name = "PublishTimeoutError";
  }
}

function envTimeoutMs(name: string, fallback: number): number {
  const value = Number(process.env[name] || 0);
  return Number.isFinite(value) && value >= 10_000 ? value : fallback;
}

function withTimeout<T>(promise: Promise<T>, stage: PublishStage, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PublishTimeoutError(stage, timeoutMs)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Onaylı raporun PDF buffer'ını üret. Cookie auth aktarılır → /rapor-onay-print
// auth'lu canlı sayfası render edilir. P12 sertifika varsa PAdES imza eklenir;
// yoksa imzasız PDF döner (yükleme yine yapılır).
async function buildRaporPdf(origin: string, nkrId: number, format: string, cookie: string): Promise<Buffer> {
  const previewUrl = `${origin}/rapor-onay-print/${nkrId}?format=${encodeURIComponent(format)}`;
  const pdf = await renderUrlToPdf(previewUrl, {
    cookieHeader: cookie,
    printBackground: true,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    settleMs: 1500,
  });
  // "Diğer" formatında: kayıtlı Ek-1 PDF'i ilk sayfanın arkasına ekle (merge).
  // Ek indirilemezse hata fırlar → Ek'siz yayın yapılmaz (kullanıcı tekrar dener).
  const merged = await maybeMergeEk(await cosmoPool, pdf, nkrId, format);
  if (pdfImzaYapilandirildi()) {
    try {
      return await signPdfBuffer(merged);
    } catch (e) {
      console.warn("[yayinla] PDF imza atılamadı, imzasız sürüm yüklenecek:", e);
    }
  }
  return merged;
}

function parseOptionalDate(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "__INVALID__";
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "__INVALID__" : raw;
}

// POST /api/rapor-takip/[nkrId]/yayinla
// Body: { format }
// Önkoşul: onaylı olmalı. "Portala Gönder" akışı:
//   1) İmzalı PDF üret → FTP'ye <KarekodToken>.pdf yükle
//   2) NKR_RaporOnay: Durum='Yayınlandı', YayinTarihi=NOW, YayinUrl=public link
//   3) NKR_Log'a "Rapor Yayınlandı"
// FTP yapılandırılmamışsa veya PDF/upload başarısızsa 502 döner (yayınlama
// yapılmaz) — kullanıcı tekrar deneyebilir.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  if (!Number.isFinite(nkrIdNum)) return Response.json({ error: "Geçersiz NkrID" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const format = String(body?.format || "").trim();
  if (!format) return Response.json({ error: "format gerekli" }, { status: 400 });
  const raporYayinTarihi = parseOptionalDate(body?.raporYayinTarihi);
  if (raporYayinTarihi === "__INVALID__") {
    return Response.json({ error: "Rapor yayın tarihi YYYY-MM-DD formatında olmalıdır." }, { status: 400 });
  }

  const userId = ((session.user as any)?.userId ?? null) as number | null;
  const userName = ((session.user as any)?.name || (session.user as any)?.email || null) as string | null;

  try {
    const pool = await cosmoPool;

    const tblCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_RaporOnay' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
    );
    if (tblCheck.recordset.length === 0) {
      return Response.json({ error: "NKR_RaporOnay tablosu yok." }, { status: 500 });
    }

    // Onay var mı? Token gerekli (PDF dosya adı).
    let exist = await pool.request()
      .input("nkrId", nkrIdNum).input("format", format)
      .query(`
        SELECT ID, KarekodToken, Durum, YayinUrl, YayinTarihi FROM NKR_RaporOnay
        WHERE NkrID = @nkrId
          AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
      `);
    let onay = exist.recordset[0];
    if (!onay && isEnglishReportFormat(format)) {
      await ensureEnglishApprovalForBase(pool, nkrIdNum, format, {
        userId,
        userName,
        raporYayinTarihi,
      });
      exist = await pool.request()
        .input("nkrId", nkrIdNum).input("format", format)
        .query(`
          SELECT ID, KarekodToken, Durum, YayinUrl, YayinTarihi FROM NKR_RaporOnay
          WHERE NkrID = @nkrId
            AND UPPER(REPLACE(RaporFormati, N'Ü', N'U')) = UPPER(REPLACE(@format, N'Ü', N'U'))
        `);
      onay = exist.recordset[0];
    }
    if (!onay) {
      return Response.json({ error: "Önce raporu Onayla'yın." }, { status: 400 });
    }
    if (!onay.KarekodToken) {
      return Response.json({ error: "Onay kaydında karekod token yok." }, { status: 500 });
    }

    // FTP yoksa yayınlama yapma — kullanıcıya net hata.
    if (!isRaporFtpConfigured()) {
      return Response.json(
        { error: "FTP yapılandırılmadı (RAPOR_FTP_* ortam değişkenleri eksik)." },
        { status: 503 },
      );
    }

    const eskiYayinTarihi = onay.YayinTarihi ?? null;

    // PDF üretimi DB'deki yayın tarihini okur. Kullanıcı tarih seçtiyse önce
    // geçici olarak yaz, hata olursa eski değeri geri koy.
    if (raporYayinTarihi) {
      await pool.request()
        .input("id", onay.ID)
        .input("raporYayinTarihi", raporYayinTarihi)
        .query(`
          UPDATE NKR_RaporOnay
          SET YayinTarihi = CAST(@raporYayinTarihi AS DATE)
          WHERE ID = @id
        `);
    }

    // ── İmzalı PDF üret + FTP'ye yükle ──
    let yayinUrl: string;
    try {
      console.info("[yayinla] PDF üretimi başladı", { nkrId: nkrIdNum, format });
      const pdfBuffer = await withTimeout(
        buildRaporPdf(getRaporPdfBaseUrl(request), nkrIdNum, format, request.headers.get("cookie") || ""),
        "pdf",
        envTimeoutMs("RAPOR_PDF_TIMEOUT_MS", 50_000),
      );
      console.info("[yayinla] FTP yükleme başladı", { nkrId: nkrIdNum, format, bytes: pdfBuffer.length });
      const uploaded = await withTimeout(
        uploadRaporPdfToFtp({ pdfBuffer, token: onay.KarekodToken }),
        "ftp",
        envTimeoutMs("RAPOR_FTP_UPLOAD_TIMEOUT_MS", 30_000),
      );
      yayinUrl = uploaded.publicUrl;
    } catch (e) {
      if (raporYayinTarihi) {
        await pool.request()
          .input("id", onay.ID)
          .input("eskiYayinTarihi", eskiYayinTarihi)
          .query(`
            UPDATE NKR_RaporOnay
            SET YayinTarihi = @eskiYayinTarihi
            WHERE ID = @id
          `);
      }
      console.error("[yayinla] PDF/FTP yüklemesi başarısız:", e);
      const detay =
        e instanceof Error ? e.message :
          typeof e === "string" ? e : "Bilinmeyen hata";
      return Response.json(
        { error: `Rapor PDF'i sunucuya yüklenemedi: ${detay.slice(0, 500)}` },
        { status: e instanceof PublishTimeoutError ? 504 : 502 },
      );
    }

    // ── DB: Yayınlandı + URL ──
    await pool.request()
      .input("id", onay.ID)
      .input("yayinUrl", yayinUrl)
      .input("raporYayinTarihi", raporYayinTarihi)
      .query(`
        UPDATE NKR_RaporOnay
        SET Durum = 'Yayınlandı',
            YayinTarihi = ${raporYayinTarihi ? "CAST(@raporYayinTarihi AS DATE)" : "COALESCE(YayinTarihi, GETDATE())"},
            YayinUrl = @yayinUrl
        WHERE ID = @id
      `);

    // NKR_Log → Ürün Geçmişi
    const logCheck = await pool.request().query(
      `SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_NAME = 'NKR_Log' AND TABLE_SCHEMA IN ('dbo', 'cosmoroot')`
    );
    if (logCheck.recordset.length > 0) {
      await pool.request()
        .input("NKRID", nkrIdNum)
        .input("KullaniciID", userId)
        .input("Eylem", "Rapor Yayınlandı")
        .input("Aciklama", `${format} formatı portala gönderildi. URL: ${yayinUrl}`)
        .query(
          `INSERT INTO NKR_Log (NKRID, KullaniciID, Eylem, Aciklama, Tarih)
           VALUES (@NKRID, @KullaniciID, @Eylem, @Aciklama, CURRENT_TIMESTAMP)`
        );
    }

    return Response.json({ ok: true, token: onay.KarekodToken, durum: "Yayınlandı", yayinUrl });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
