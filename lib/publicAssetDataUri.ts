import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// PDF renderi `file://` ile çalıştığı için `/foo.png` gibi mutlak yollar
// chromium tarafından çözülemez ve "bozuk görsel" olur. Sunucu tarafında
// public dosyasını okuyup data URI'ye çevirerek HTML'e gömüyoruz.

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const cache = new Map<string, string>();

/** /imza-oguzhan.png gibi public altındaki bir yolu base64 data URI'ye çevirir.
 *  - Zaten data: veya http(s): ile başlıyorsa olduğu gibi döner.
 *  - Dosya yoksa orijinal değer döner (kırılma yerine sessizce devam).
 */
export function toPublicAssetDataUri(src: string | null | undefined): string {
  const value = String(src ?? "").trim();
  if (!value) return value;
  if (/^(data:|https?:|file:)/i.test(value)) return value;
  if (!value.startsWith("/")) return value;

  const cached = cache.get(value);
  if (cached) return cached;

  const ext = path.extname(value).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) return value;

  const publicPath = path.join(process.cwd(), "public", value.replace(/^\/+/, ""));
  if (!existsSync(publicPath)) return value;

  try {
    const buf = readFileSync(publicPath);
    const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
    cache.set(value, dataUri);
    return dataUri;
  } catch {
    return value;
  }
}
