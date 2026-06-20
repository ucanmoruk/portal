// Next.js standalone server.js (.next/standalone) `.env` dosyalarını OTOMATIK
// YÜKLEMEZ — bu yalnızca `next dev` / `next start` / `next build` davranışıdır.
// cPanel/Passenger ortamında app .env'i bu yüzden görmez. Bu yardımcı, server
// başlarken .env'i birden çok aday yolda arar, bulduğunu process.env'e ENJEKTE eder.
//
// Kural: zaten tanımlı (cPanel Node.js App UI'dan gelen) değişkenleri EZME —
// sadece eksik olanları .env'den doldur. Böylece UI > .env önceliği korunur.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let loaded = false;

function candidatePaths(): string[] {
  const paths = new Set<string>();
  const cwd = process.cwd();
  const home = process.env.HOME || process.env.USERPROFILE || "";

  // 1) cwd ve üst dizinleri (server.js app kökünde veya .next/standalone içinde olabilir)
  let dir = cwd;
  for (let i = 0; i < 4; i++) {
    paths.add(path.join(dir, ".env"));
    paths.add(path.join(dir, ".env.production"));
    paths.add(path.join(dir, ".env.local"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 2) HOME altındaki tipik cPanel subdomain dizini
  if (home) {
    paths.add(path.join(home, "lab.uniqueanalyse.com", ".env"));
    paths.add(path.join(home, ".env"));
  }

  return [...paths];
}

export function loadDotenvOnce(): void {
  if (loaded) return;
  loaded = true;

  let usedFile: string | null = null;
  let count = 0;

  for (const file of candidatePaths()) {
    if (!existsSync(file)) continue;
    try {
      const content = readFileSync(file, "utf8");
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (!key || key in process.env) continue; // mevcut env'i EZME
        let value = line.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
        count++;
      }
      usedFile = file;
      break; // ilk bulunan .env yeterli
    } catch {
      // okunamadı, sonraki adaya geç
    }
  }

  // Teşhis için stderr'e tek satır özet (değer SIZMAZ, sadece anahtar varlığı)
  const has = (k: string) => (process.env[k] ? "✓" : "✗");
  console.error(
    `[loadDotenv] file=${usedFile ?? "BULUNAMADI"} loaded=${count} ` +
      `cwd=${process.cwd()} | MYSQL_HOST=${has("MYSQL_HOST")} ` +
      `MYSQL_USER=${has("MYSQL_USER")} MYSQL_DATABASE=${has("MYSQL_DATABASE")} ` +
      `UGD_POSTGRESS_URL=${has("UGD_POSTGRESS_URL")} NEXTAUTH_SECRET=${has("NEXTAUTH_SECRET")}`,
  );
}
