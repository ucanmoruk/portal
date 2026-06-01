// VAL- ile baslayan validasyon kodlarini ve metot bilgilerini incele
import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

try {
  const envText = readFileSync(".env.local", "utf8");
  for (const rawLine of envText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
} catch {}

const pool = createPool({ connectionString: process.env.EUROLAB_POSTGRES_URL || process.env.POSTGRES_URL });

// QC'de gecen validation_code listesi
const codes = await pool.query(`
  SELECT DISTINCT validation_code FROM eurolab_qc_cards
  WHERE validation_code IS NOT NULL
  ORDER BY validation_code
`);
console.log("QC kartlardaki tum validation_code'lar:");
for (const r of codes.rows) console.log(" -", r.validation_code);

// VAL- ile baslayan validasyonlar + metot
const vals = await pool.query(`
  SELECT v.id, v.code, v.title, v.method_id, m.method_code, m.name AS method_name
  FROM eurolab_validations v
  LEFT JOIN eurolab_methods m ON m.id = v.method_id
  WHERE v.code LIKE 'VAL-%' OR v.code IS NULL
  ORDER BY v.method_id, v.id
`);
console.log("\nVAL- baslayan / kodsuz validasyonlar:");
for (const r of vals.rows) {
  console.log(`  v.id=${r.id} code=${r.code} method_id=${r.method_id} method_code=${r.method_code} title="${r.title}"`);
}

// Her metot icin halihazirda kullanilan ek numaralarini bul
const methodEks = await pool.query(`
  SELECT m.id AS method_id, m.method_code, v.id AS val_id, v.code
  FROM eurolab_methods m
  JOIN eurolab_validations v ON v.method_id = m.id
  WHERE m.method_code LIKE 'K.SOP.%'
  ORDER BY m.method_code, v.id
`);
console.log("\nMetoda gore mevcut validation kodlari:");
const byMethod = new Map();
for (const r of methodEks.rows) {
  if (!byMethod.has(r.method_code)) byMethod.set(r.method_code, []);
  byMethod.get(r.method_code).push({ val_id: r.val_id, code: r.code });
}
for (const [mc, list] of byMethod) {
  console.log(`  ${mc}:`);
  for (const v of list) console.log(`     v.id=${v.val_id} -> ${v.code}`);
}

await pool.end?.();
