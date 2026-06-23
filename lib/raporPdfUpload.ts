import { Client } from "basic-ftp";
import { Readable } from "stream";
import { loadDotenvOnce } from "@/lib/loadDotenv";

/**
 * Onaylı imzalı raporun PDF'ini, public erişimli FTP klasörüne yükler.
 *
 * Güvenlik: dosya adı = `<KarekodToken>.pdf`. Token 24-karakter base64url
 * CSPRNG (≈144 bit) → enumere edilemez; bu URL'i alan kişi başka raporlara
 * erişemez.
 *
 * Ortam değişkenleri (.env.local):
 * - RAPOR_FTP_HOST            (örn. uniqueanalyse.com)
 * - RAPOR_FTP_USER            (örn. portal@uniqueanalyse.com)
 * - RAPOR_FTP_PASSWORD
 * - RAPOR_FTP_REMOTE_DIR      (varsayılan: public_html/VerifiedFiles)
 * - RAPOR_FTP_PUBLIC_BASE     (varsayılan: https://uniqueanalyse.com/VerifiedFiles)
 * - RAPOR_FTP_SECURE          ("1" → TLS; default off)
 * - RAPOR_FTP_VERBOSE         ("1" → ftp komut log'u)
 */
export function isRaporFtpConfigured(): boolean {
  loadDotenvOnce();
  return Boolean(
    process.env.RAPOR_FTP_HOST?.trim() &&
      process.env.RAPOR_FTP_USER?.trim() &&
      process.env.RAPOR_FTP_PASSWORD?.trim(),
  );
}

const TOKEN_RE = /^[A-Za-z0-9_-]+$/;

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

export async function uploadRaporPdfToFtp(opts: {
  pdfBuffer: Buffer;
  token: string;
}): Promise<{ publicUrl: string; remotePath: string }> {
  loadDotenvOnce();

  if (!opts.pdfBuffer?.length) {
    throw new Error("uploadRaporPdfToFtp: boş PDF buffer.");
  }
  // Sertleştirme: token sadece base64url karakter kümesinden olabilir; aksi
  // halde path traversal ya da garip dosya adı oluşmasın.
  if (!opts.token || !TOKEN_RE.test(opts.token) || opts.token.length > 64) {
    throw new Error("uploadRaporPdfToFtp: geçersiz token formatı.");
  }

  const host = normalizeFtpHost(process.env.RAPOR_FTP_HOST!);
  const user = process.env.RAPOR_FTP_USER!.trim();
  const password = process.env.RAPOR_FTP_PASSWORD!.trim();
  // RAPOR_FTP_REMOTE_DIR tanımsız → FTP login dizinine (kök) yaz. Bizim kurulumda
  // portal@ hesabı doğrudan doğrulama klasörüne chroot'lu, bu yüzden default boş.
  const remoteDir = (process.env.RAPOR_FTP_REMOTE_DIR ?? "").trim();
  const publicBase = (process.env.RAPOR_FTP_PUBLIC_BASE || "https://dogrulama.uniqueanalyse.com")
    .replace(/\/$/, "");
  const secure = process.env.RAPOR_FTP_SECURE === "1";

  if (host.toLowerCase() === "uniqeuanalyse.com") {
    throw new Error("RAPOR_FTP_HOST yazım hatalı: uniqeuanalyse.com yerine uniqueanalyse.com olmalı.");
  }
  if (!host || !user || !password) {
    throw new Error("RAPOR_FTP_HOST, RAPOR_FTP_USER veya RAPOR_FTP_PASSWORD eksik.");
  }

  const filename = `${opts.token}.pdf`;

  const client = new Client();
  client.ftp.verbose = process.env.RAPOR_FTP_VERBOSE === "1";
  try {
    try {
      await client.access({ host, user, password, secure });
    } catch (error) {
      throw new Error(`FTP bağlantısı/kimlik doğrulama başarısız (${host}): ${ftpErrorMessage(error)}`);
    }
    // remoteDir boşsa login dizinine (FTP kök) yaz; doluysa o klasöre geç/oluştur.
    // ensureDir hem oluşturur hem cwd'yi oraya taşır; ekstra cd gerekmez.
    if (remoteDir) {
      try {
        await client.ensureDir(remoteDir);
      } catch (error) {
        throw new Error(`FTP klasörüne geçilemedi/oluşturulamadı (${remoteDir}): ${ftpErrorMessage(error)}`);
      }
    }

    try {
      await client.uploadFrom(Readable.from(opts.pdfBuffer), filename);
    } catch (error) {
      throw new Error(`PDF FTP'ye yüklenemedi (${remoteDir || "/"} / ${filename}): ${ftpErrorMessage(error)}`);
    }
  } finally {
    client.close();
  }

  return {
    publicUrl: `${publicBase}/${filename}`,
    remotePath: remoteDir ? `${remoteDir.replace(/\/$/, "")}/${filename}` : filename,
  };
}
