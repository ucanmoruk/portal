import { Client } from "basic-ftp";
import { Readable } from "stream";
import path from "path";

function safeFileSegment(s: string) {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_").trim() || "dosya";
}

/**
 * Eski WinForms akışı: `RaporNo + " - " + orijinalDosyaAdı` ile FTP’ye yüklenir;
 * genel erişim URL’si aynı klasör üzerinden verilir.
 *
 * Ortam değişkenleri (üretimde .env):
 * - NUMUNE_FTP_HOST (örn. www.rootarge.com)
 * - NUMUNE_FTP_USER
 * - NUMUNE_FTP_PASSWORD
 * - NUMUNE_FTP_REMOTE_DIR (varsayılan: /httpdocs/cosmo/Numune — sunucu köküne göre ayarlayın)
 * - NUMUNE_FTP_PUBLIC_BASE (varsayılan: http://www.rootarge.com/cosmo/Numune)
 */
export function isNumuneFtpConfigured(): boolean {
  return Boolean(
    process.env.NUMUNE_FTP_HOST?.trim() &&
      process.env.NUMUNE_FTP_USER?.trim() &&
      process.env.NUMUNE_FTP_PASSWORD?.trim()
  );
}

export async function uploadNumuneFotoToFtp(opts: {
  buffer: Buffer;
  originalFilename: string;
  raporNo: string;
}): Promise<{ pathForDb: string }> {
  const host = process.env.NUMUNE_FTP_HOST!.trim();
  const user = process.env.NUMUNE_FTP_USER!.trim();
  const password = process.env.NUMUNE_FTP_PASSWORD!;
  const remoteDir = (process.env.NUMUNE_FTP_REMOTE_DIR || "/httpdocs/cosmo/Numune").trim();
  const publicBase = (process.env.NUMUNE_FTP_PUBLIC_BASE || "http://www.rootarge.com/cosmo/Numune").replace(
    /\/$/,
    ""
  );

  const rapor = safeFileSegment(opts.raporNo || "numune");
  const orig = path.basename(opts.originalFilename || "foto.jpg");
  const yenisim = `${rapor} - ${safeFileSegment(orig)}`;

  const client = new Client();
  client.ftp.verbose = process.env.NUMUNE_FTP_VERBOSE === "1";
  try {
    await client.access({ host, user, password, secure: false });
    await client.ensureDir(remoteDir);
    await client.cd(remoteDir);
    await client.uploadFrom(Readable.from(opts.buffer), yenisim);
  } finally {
    client.close();
  }

  const pathForDb = `${publicBase}/${encodeURIComponent(yenisim)}`;
  return { pathForDb };
}
