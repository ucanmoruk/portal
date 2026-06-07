import { Client } from "basic-ftp";
import { Readable } from "stream";

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
  return Boolean(
    process.env.RAPOR_FTP_HOST?.trim() &&
      process.env.RAPOR_FTP_USER?.trim() &&
      process.env.RAPOR_FTP_PASSWORD?.trim(),
  );
}

const TOKEN_RE = /^[A-Za-z0-9_-]+$/;

export async function uploadRaporPdfToFtp(opts: {
  pdfBuffer: Buffer;
  token: string;
}): Promise<{ publicUrl: string; remotePath: string }> {
  if (!opts.pdfBuffer?.length) {
    throw new Error("uploadRaporPdfToFtp: boş PDF buffer.");
  }
  // Sertleştirme: token sadece base64url karakter kümesinden olabilir; aksi
  // halde path traversal ya da garip dosya adı oluşmasın.
  if (!opts.token || !TOKEN_RE.test(opts.token) || opts.token.length > 64) {
    throw new Error("uploadRaporPdfToFtp: geçersiz token formatı.");
  }

  const host = process.env.RAPOR_FTP_HOST!.trim();
  const user = process.env.RAPOR_FTP_USER!.trim();
  const password = process.env.RAPOR_FTP_PASSWORD!;
  // RAPOR_FTP_REMOTE_DIR tanımsız → FTP login dizinine (kök) yaz. Bizim kurulumda
  // portal@ hesabı doğrudan doğrulama klasörüne chroot'lu, bu yüzden default boş.
  const remoteDir = (process.env.RAPOR_FTP_REMOTE_DIR ?? "").trim();
  const publicBase = (process.env.RAPOR_FTP_PUBLIC_BASE || "https://dogrulama.uniqueanalyse.com")
    .replace(/\/$/, "");
  const secure = process.env.RAPOR_FTP_SECURE === "1";

  const filename = `${opts.token}.pdf`;

  const client = new Client();
  client.ftp.verbose = process.env.RAPOR_FTP_VERBOSE === "1";
  try {
    await client.access({ host, user, password, secure });
    // remoteDir boşsa login dizinine (FTP kök) yaz; doluysa o klasöre geç/oluştur.
    // ensureDir hem oluşturur hem cwd'yi oraya taşır; ekstra cd gerekmez.
    if (remoteDir) await client.ensureDir(remoteDir);
    await client.uploadFrom(Readable.from(opts.pdfBuffer), filename);
  } finally {
    client.close();
  }

  return {
    publicUrl: `${publicBase}/${filename}`,
    remotePath: remoteDir ? `${remoteDir.replace(/\/$/, "")}/${filename}` : filename,
  };
}
