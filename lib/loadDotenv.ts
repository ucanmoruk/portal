// Next.js standalone server.js (.next/standalone) `.env` dosyalarını OTOMATIK
// YÜKLEMEZ — bu yalnızca `next dev` / `next start` / `next build` davranışıdır.
// cPanel/Passenger ortamında app .env'i bu yüzden görmez. Bu yardımcı, server
// başlarken .env'i elle okur ve process.env'e ENJEKTE eder.
//
// Kural: zaten tanımlı (cPanel Node.js App UI'dan gelen) değişkenleri EZME —
// sadece eksik olanları .env'den doldur. Böylece UI > .env önceliği korunur.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let loaded = false;

export function loadDotenvOnce(): void {
  if (loaded) return;
  loaded = true;

  // Standalone server.js cwd genelde app kökü; birkaç aday yol dene.
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), ".env.production"),
    path.join(process.cwd(), ".env.local"),
  ];

  for (const file of candidates) {
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
        // Çevreleyen tırnakları kaldır
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    } catch {
      // .env okunamazsa sessiz geç — kritik değil
    }
  }
}
