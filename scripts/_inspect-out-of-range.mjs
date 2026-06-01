// QC kart noktalarinin recovery'leri AUL (lower_warning_limit) ile
// UUL (upper_warning_limit) arasinda olmali. Disina cikanlari listeler.

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

const res = await pool.query(`
  SELECT
    c.validation_code,
    c.component_name,
    c.id AS card_id,
    p.sequence_no,
    p.measured_at,
    p.created_at,
    p.recovery::float AS recovery,
    c.lower_warning_limit::float AS aul,
    c.upper_warning_limit::float AS uul,
    c.center_line::float AS xort,
    p.analyst,
    p.source
  FROM eurolab_qc_card_points p
  JOIN eurolab_qc_cards c ON c.id = p.card_id
  WHERE p.recovery::float < c.lower_warning_limit::float
     OR p.recovery::float > c.upper_warning_limit::float
  ORDER BY c.validation_code, c.component_name, p.sequence_no
`);

console.log(`Toplam AUL/UUL disinda nokta: ${res.rowCount}\n`);

const byCard = new Map();
for (const r of res.rows) {
  const key = `${r.validation_code} | ${r.component_name}`;
  if (!byCard.has(key)) byCard.set(key, { aul: r.aul, uul: r.uul, xort: r.xort, card_id: r.card_id, rows: [] });
  byCard.get(key).rows.push(r);
}

for (const [key, info] of byCard) {
  console.log(`▼ ${key}  (card_id=${info.card_id})`);
  console.log(`    AUL=${info.aul.toFixed(3)}  Xort=${info.xort.toFixed(3)}  UUL=${info.uul.toFixed(3)}`);
  for (const r of info.rows) {
    const dir = r.recovery < info.aul ? "↓ AUL alti" : "↑ UUL ustu";
    const dateStr = r.measured_at ? new Date(r.measured_at).toISOString().slice(0,10) : new Date(r.created_at).toISOString().slice(0,10);
    console.log(`    #${r.sequence_no.toString().padStart(2," ")}  ${dateStr}  rec=${r.recovery.toFixed(3)}%  ${dir}  src=${r.source}  ${r.analyst || ""}`);
  }
  console.log();
}

await pool.end?.();
