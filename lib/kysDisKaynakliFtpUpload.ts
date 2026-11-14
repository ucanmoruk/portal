import { Client } from "basic-ftp";
import { Readable, Writable } from "stream";
import { loadDotenvOnce } from "@/lib/loadDotenv";

/**
 * KYS "Dış Kaynaklı Doküman" PDF'leri (standart, rehber vb.) lisanslı ve telifli
 * içerik taşıyabilir. Bu yüzden ARTIK web kökünün (public_html) DIŞINDA saklanır
 * ve yalnızca oturum açmış, yetkili kullanıcılara portal üzerinden sunulur
 * (GET /api/kys/dis-kaynakli-dokumanlar/[id]/pdf). Dosyalara doğrudan bir web
 * adresi yoktur, dolayısıyla arama motorları dizinleyemez.
 *
 * Rapor doğrulama ile AYNI FTP hesabı kullanılır (RAPOR_FTP_HOST/USER/PASSWORD).
 *
 * Ortam değişkenleri:
 * - DKD_FTP_PRIVATE_DIR  (varsayılan: kys-private/dis-kaynakli) — FTP giriş dizinine göre,
 *                         web köküne (public_html) bağlı OLMAMALIDIR.
 * - DKD_FTP_REMOTE_DIR / DKD_FTP_PUBLIC_BASE — yalnızca ESKİ herkese açık klasör;
 *                         eski dosyaları okumak ve özel klasöre taşımak için kullanılır.
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

/** Eski, herkese açık klasör (web köküne bağlı). Yalnızca geçiş için. */
export function legacyPublicDir(): string {
  const explicit = (process.env.DKD_FTP_REMOTE_DIR ?? "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const raporDir = (process.env.RAPOR_FTP_REMOTE_DIR ?? "").trim().replace(/\/$/, "");
  return raporDir ? `${raporDir}/DKD` : "public_html/VerifiedFiles/DKD";
}

export function legacyPublicBase(): string {
  const explicit = (process.env.DKD_FTP_PUBLIC_BASE ?? "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const raporBase = (process.env.RAPOR_FTP_PUBLIC_BASE ?? "").trim().replace(/\/$/, "");
  return raporBase ? `${raporBase}/DKD` : "https://uniqueanalyse.com/VerifiedFiles/DKD";
}

/** Web köküne bağlı olmayan özel klasör. Web köküne işaret eden bir değer reddedilir. */
export function privateDir(): string {
  const dir = (process.env.DKD_FTP_PRIVATE_DIR || "kys-private/dis-kaynakli").trim().replace(/^\/+|\/+$/g, "");
  if (!dir || dir.includes("..") || /(^|\/)(public_html|www|htdocs|httpdocs)(\/|$)/i.test(dir)) {
    throw new Error("DKD_FTP_PRIVATE_DIR web köküne (public_html vb.) bağlı olamaz.");
  }
  return dir;
}

/** DB'de saklanan değerden (eski URL ya da yeni "dkd-private/ad.pdf") güvenli dosya adını çıkarır. */
export function pdfFileName(pdfPathOrUrl: string): string | null {
  const fileName = pdfPathOrUrl.split("/").pop()?.split(/[?#]/)[0];
  return fileName && SAFE_NAME_RE.test(fileName) && fileName.length <= 180 ? fileName : null;
}

/** Kullanıcının yüklediği orijinal dosya adını FTP'de güvenli bir isme çevirir. */
export function safePdfName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return base.toLowerCase().endsWith(".pdf") ? base : `${base || "dokuman"}.pdf`;
}

async function withFtp<T>(task: (client: Client, home: string) => Promise<T>): Promise<T> {
  loadDotenvOnce();
  const host = normalizeFtpHost(process.env.RAPOR_FTP_HOST || "");
  const user = (process.env.RAPOR_FTP_USER || "").trim();
  const password = (process.env.RAPOR_FTP_PASSWORD || "").trim();
  if (!host || !user || !password) throw new Error("RAPOR_FTP_HOST, RAPOR_FTP_USER veya RAPOR_FTP_PASSWORD eksik.");
  const client = new Client(ftpTimeoutMs());
  client.ftp.verbose = process.env.RAPOR_FTP_VERBOSE === "1";
  try {
    try {
      await client.access({ host, user, password, secure: process.env.RAPOR_FTP_SECURE === "1" });
    } catch (error) {
      throw new Error(`FTP bağlantısı/kimlik doğrulama başarısız (${host}): ${ftpErrorMessage(error)}`);
    }
    return await task(client, (await client.pwd()).replace(/\/$/, ""));
  } finally {
    client.close();
  }
}

export async function uploadDisKaynakliPdfToFtp(opts: {
  pdfBuffer: Buffer;
  fileName: string;
}): Promise<{ publicUrl: string; remotePath: string }> {
  if (!opts.pdfBuffer?.length) throw new Error("uploadDisKaynakliPdfToFtp: boş PDF buffer.");
  // Dosya adı çağıran tarafta (safePdfName + timestamp/uuid) üretilir; burada
  // yine de path traversal/garip karakterlere karşı sertleştirme yapılır.
  if (!opts.fileName || !SAFE_NAME_RE.test(opts.fileName) || opts.fileName.length > 180) {
    throw new Error("uploadDisKaynakliPdfToFtp: geçersiz dosya adı.");
  }
  const remoteDir = privateDir();
  await withFtp(async (client, home) => {
    try {
      await client.ensureDir(`${home}/${remoteDir}`);
    } catch (error) {
      throw new Error(`FTP klasörüne geçilemedi/oluşturulamadı (${remoteDir}): ${ftpErrorMessage(error)}`);
    }
    try {
      await client.uploadFrom(Readable.from(opts.pdfBuffer), opts.fileName);
    } catch (error) {
      throw new Error(`PDF FTP'ye yüklenemedi (${remoteDir} / ${opts.fileName}): ${ftpErrorMessage(error)}`);
    }
  });
  // Bu değer bir web adresi DEĞİLDİR; yalnızca dosya adını taşır. Görüntüleme portal üzerinden yapılır.
  return { publicUrl: `dkd-private/${opts.fileName}`, remotePath: `${remoteDir}/${opts.fileName}` };
}

/**
 * PDF'i FTP'den okur: önce özel klasör, bulunamazsa (taşıma henüz yapılmadıysa) eski klasör.
 * Dosya yoksa null döner.
 */
export async function readDisKaynakliPdf(pdfPathOrUrl: string): Promise<Buffer | null> {
  const fileName = pdfFileName(pdfPathOrUrl);
  if (!fileName) return null;
  return withFtp(async (client, home) => {
    for (const dir of [privateDir(), legacyPublicDir()]) {
      const chunks: Buffer[] = [];
      const sink = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
      try {
        await client.downloadTo(sink, `${home}/${dir}/${fileName}`);
        return Buffer.concat(chunks);
      } catch { /* Bu klasörde yok: sıradakini dene. */ }
    }
    return null;
  });
}

/**
 * Eski herkese açık klasördeki PDF'leri özel klasöre TAŞIR (FTP rename; kopya bırakmaz).
 * Hedefte aynı ada sahip dosya varsa o dosya atlanır ve eski kopya yerinde bırakılır.
 */
export async function moveLegacyPdfsToPrivate(): Promise<{ moved: string[]; skipped: string[]; failed: { name: string; error: string }[] }> {
  const target = privateDir();
  const legacy = legacyPublicDir();
  return withFtp(async (client, home) => {
    await client.ensureDir(`${home}/${target}`);
    const existing = new Set((await client.list(`${home}/${target}`)).map(f => f.name));
    const files = (await client.list(`${home}/${legacy}`)).filter(f => f.isFile && SAFE_NAME_RE.test(f.name));
    const result = { moved: [] as string[], skipped: [] as string[], failed: [] as { name: string; error: string }[] };
    for (const file of files) {
      if (existing.has(file.name)) { result.skipped.push(file.name); continue; }
      try {
        await client.rename(`${home}/${legacy}/${file.name}`, `${home}/${target}/${file.name}`);
        result.moved.push(file.name);
      } catch (error) {
        result.failed.push({ name: file.name, error: ftpErrorMessage(error) });
      }
    }
    return result;
  });
}

/**
 * Bir dış kaynaklı doküman PDF'ini FTP'den siler — kayıt silinirken veya PDF
 * değiştirilirken eski dosyayı temizlemek için. Best-effort: dosya zaten yoksa
 * veya FTP'ye erişilemiyorsa SESSİZCE geçer; DB işlemini asla engellemez.
 */
export async function deleteDisKaynakliPdfFromFtp(pdfPathOrUrl: string): Promise<void> {
  const fileName = pdfFileName(pdfPathOrUrl);
  if (!fileName) return;
  try {
    await withFtp(async (client, home) => {
      for (const dir of [privateDir(), legacyPublicDir()]) await client.remove(`${home}/${dir}/${fileName}`).catch(() => {});
    });
  } catch {
    // Bağlantı kurulamadıysa sessizce geç — orphan dosya kalabilir ama kullanıcı işlemi engellenmemeli.
  }
}
