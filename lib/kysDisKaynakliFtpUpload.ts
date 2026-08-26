import { Client } from "basic-ftp";
import { Readable } from "stream";
import { loadDotenvOnce } from "@/lib/loadDotenv";

/**
 * KYS "Dış Kaynaklı Doküman" PDF'lerini FTP'ye yükler.
 *
 * Rapor doğrulama ile AYNI FTP hesabını kullanır (RAPOR_FTP_HOST/USER/PASSWORD) —
 * tek fark hedef klasör: public_html/VerifiedFiles/DKD (VerifiedFiles'ın altında
 * ayrı bir alt klasör). Ayrı bir hesap gerekmediği için kimlik bilgileri
 * tekrarlanmaz; sadece klasör/URL üretimi DKD_FTP_* ile bağımsız ayarlanabilir.
 *
 * Ortam değişkenleri (.env.local):
 * - RAPOR_FTP_HOST / RAPOR_FTP_USER / RAPOR_FTP_PASSWORD  (paylaşılan FTP hesabı)
 * - RAPOR_FTP_SECURE / RAPOR_FTP_TIMEOUT_MS / RAPOR_FTP_VERBOSE (paylaşılan bağlantı ayarları)
 * - DKD_FTP_REMOTE_DIR   (varsayılan: `${RAPOR_FTP_REMOTE_DIR}/DKD`, o da yoksa public_html/VerifiedFiles/DKD)
 * - DKD_FTP_PUBLIC_BASE  (varsayılan: `${RAPOR_FTP_PUBLIC_BASE}/DKD`, o da yoksa https://uniqueanalyse.com/VerifiedFiles/DKD)
 */
export function isDisKaynakliFtpConfigured(): boolean {
  loadDotenvOnce();
  return Boolean(
    process.env.RAPOR_FTP_HOST?.trim() &&
      process.env.RAPOR_FTP_USER?.trim() &&
      process.env.RAPOR_FTP_PASSWORD?.trim(),
  );
}

const SAFE_NAME_RE = /^[A-Za-z0-9._-]+$/;

function normalizeFtpHost(value: string): string {
  return value
    .trim()
    .replace(/^ftps?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim();
}

function ftpErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Bilinmeyen FTP hatası";
}

function ftpTimeoutMs(): number {
  const value = Number(process.env.RAPOR_FTP_TIMEOUT_MS || 0);
  return Number.isFinite(value) && value >= 10_000 ? value : 30_000;
}

function defaultDkdRemoteDir(): string {
  const raporDir = (process.env.RAPOR_FTP_REMOTE_DIR ?? "").trim().replace(/\/$/, "");
  return raporDir ? `${raporDir}/DKD` : "public_html/VerifiedFiles/DKD";
}

function defaultDkdPublicBase(): string {
  const raporBase = (process.env.RAPOR_FTP_PUBLIC_BASE ?? "").trim().replace(/\/$/, "");
  return raporBase ? `${raporBase}/DKD` : "https://uniqueanalyse.com/VerifiedFiles/DKD";
}

/** Kullanıcının yüklediği orijinal dosya adını FTP'de güvenli bir isme çevirir. */
export function safePdfName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base || "dokuman"}.pdf`;
}

export async function uploadDisKaynakliPdfToFtp(opts: {
  pdfBuffer: Buffer;
  fileName: string;
}): Promise<{ publicUrl: string; remotePath: string }> {
  loadDotenvOnce();

  if (!opts.pdfBuffer?.length) {
    throw new Error("uploadDisKaynakliPdfToFtp: boş PDF buffer.");
  }
  // Dosya adı çağıran tarafta (safePdfName + timestamp/uuid) üretilir; burada
  // yine de path traversal/garip karakterlere karşı sertleştirme yapılır.
  if (!opts.fileName || !SAFE_NAME_RE.test(opts.fileName) || opts.fileName.length > 180) {
    throw new Error("uploadDisKaynakliPdfToFtp: geçersiz dosya adı.");
  }

  const host = normalizeFtpHost(process.env.RAPOR_FTP_HOST!);
  const user = process.env.RAPOR_FTP_USER!.trim();
  const password = process.env.RAPOR_FTP_PASSWORD!.trim();
  const remoteDir = (process.env.DKD_FTP_REMOTE_DIR || defaultDkdRemoteDir()).trim().replace(/\/$/, "");
  const publicBase = (process.env.DKD_FTP_PUBLIC_BASE || defaultDkdPublicBase()).replace(/\/$/, "");
  const secure = process.env.RAPOR_FTP_SECURE === "1";

  if (!host || !user || !password) {
    throw new Error("RAPOR_FTP_HOST, RAPOR_FTP_USER veya RAPOR_FTP_PASSWORD eksik.");
  }

  const client = new Client(ftpTimeoutMs());
  client.ftp.verbose = process.env.RAPOR_FTP_VERBOSE === "1";
  try {
    try {
      await client.access({ host, user, password, secure });
    } catch (error) {
      throw new Error(`FTP bağlantısı/kimlik doğrulama başarısız (${host}): ${ftpErrorMessage(error)}`);
    }

    if (remoteDir) {
      try {
        await client.ensureDir(remoteDir);
      } catch (error) {
        throw new Error(`FTP klasörüne geçilemedi/oluşturulamadı (${remoteDir}): ${ftpErrorMessage(error)}`);
      }
    }

    try {
      await client.uploadFrom(Readable.from(opts.pdfBuffer), opts.fileName);
    } catch (error) {
      throw new Error(`PDF FTP'ye yüklenemedi (${remoteDir || "/"} / ${opts.fileName}): ${ftpErrorMessage(error)}`);
    }
  } finally {
    client.close();
  }

  return {
    publicUrl: `${publicBase}/${opts.fileName}`,
    remotePath: remoteDir ? `${remoteDir}/${opts.fileName}` : opts.fileName,
  };
}

/**
 * Bir dış kaynaklı doküman PDF'ini FTP'den siler — kayıt silinirken veya PDF
 * değiştirilirken eski dosyayı temizlemek için. Best-effort: dosya zaten yoksa
 * veya FTP'ye erişilemiyorsa SESSİZCE geçer — DB işlemini (asıl kayıt
 * silme/güncelleme) bu temizlik adımının başarısızlığı asla engellemez.
 */
export async function deleteDisKaynakliPdfFromFtp(pdfPathOrUrl: string): Promise<void> {
  loadDotenvOnce();
  const fileName = pdfPathOrUrl.split("/").pop()?.split(/[?#]/)[0];
  if (!fileName || !SAFE_NAME_RE.test(fileName)) return;

  const host = normalizeFtpHost(process.env.RAPOR_FTP_HOST || "");
  const user = (process.env.RAPOR_FTP_USER || "").trim();
  const password = (process.env.RAPOR_FTP_PASSWORD || "").trim();
  if (!host || !user || !password) return;

  const remoteDir = (process.env.DKD_FTP_REMOTE_DIR || defaultDkdRemoteDir()).trim().replace(/\/$/, "");
  const secure = process.env.RAPOR_FTP_SECURE === "1";

  const client = new Client(ftpTimeoutMs());
  client.ftp.verbose = process.env.RAPOR_FTP_VERBOSE === "1";
  try {
    await client.access({ host, user, password, secure });
    if (remoteDir) await client.cd(remoteDir).catch(() => {});
    await client.remove(fileName).catch(() => {});
  } catch {
    // Bağlantı kurulamadıysa da sessizce geç — orphan dosya kalabilir, FTP'de
    // elle temizlik gerekebilir ama kullanıcı işlemi engellenmemeli.
  } finally {
    client.close();
  }
}
