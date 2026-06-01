// QC kart 232 detayini incele
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
} catch (err) {
  console.warn(".env.local okunamadi:", err.message);
}

const pool = createPool({ connectionString: process.env.EUROLAB_POSTGRES_URL || process.env.POSTGRES_URL });

const cardId = Number(process.argv[2] || 232);

const base = await pool.query(
  `SELECT validation_id, card_type, validation_code FROM eurolab_qc_cards WHERE id = $1`,
  [cardId]
);
if (base.rowCount === 0) {
  console.error("Kart bulunamadi");
  process.exit(1);
}
const { validation_id, card_type, validation_code } = base.rows[0];
console.log("Kart base:", { cardId, validation_id, card_type, validation_code });

const val = await pool.query(
  `SELECT id, code, title, method_id, config FROM eurolab_validations WHERE id = $1`,
  [validation_id]
);
const v = val.rows[0];
console.log("Validation code:", v.code, "title:", v.title);

const cfg = v.config || {};
const md = cfg.moduleData || {};
const repro = md.PRECISION_REPRODUCIBILITY || {};
console.log("Reproducibility component keys:", Object.keys(repro));

// Tum tarihlerini topla
let allDates = [];
for (const [comp, data] of Object.entries(repro)) {
  const rows = (data && Array.isArray(data.rows)) ? data.rows : [];
  const analysts = (data && Array.isArray(data.analysts)) ? data.analysts : [];
  console.log(`  comp=${comp} analysts=${JSON.stringify(analysts)} rows=${rows.length}`);
  for (const r of rows) {
    if (r && typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
      allDates.push(r.date);
    }
  }
}
allDates.sort();
console.log("Min/Max repro date:", allDates[0], "->", allDates[allDates.length - 1]);

// Personel bilgisi
console.log("config.personnel:", JSON.stringify(cfg.personnel || []));

// Trueness/recovery icin analist listesi
const trueness = md.TRUENESS || {};
for (const [comp, data] of Object.entries(trueness)) {
  console.log(`  trueness ${comp} analysts=${JSON.stringify(data?.analysts || [])}`);
}

// Bilesenler
const comps = await pool.query(
  `SELECT id, component_name, lower_warning_limit::float AS aul, upper_warning_limit::float AS uul,
          lower_control_limit::float AS akl, upper_control_limit::float AS ukl,
          center_line::float AS xort, unit, created_at
   FROM eurolab_qc_cards
   WHERE validation_id = $1 AND card_type = $2
   ORDER BY component_name`,
  [validation_id, card_type]
);
console.log("Bilesenler:");
for (const c of comps.rows) {
  console.log(`  card_id=${c.id} ${c.component_name} | xort=${c.xort?.toFixed(2)} AUL=${c.aul?.toFixed(2)} UUL=${c.uul?.toFixed(2)} AKL=${c.akl?.toFixed(2)} UKL=${c.ukl?.toFixed(2)} unit=${c.unit} created=${c.created_at?.toISOString?.()?.slice(0,10)}`);

  // Mevcut noktalar (target_value referansi icin)
  const pts = await pool.query(
    `SELECT source, COUNT(*)::int AS n, AVG(target_value::float)::float AS avg_target, AVG(value::float)::float AS avg_value
     FROM eurolab_qc_card_points WHERE card_id = $1 GROUP BY source`,
    [c.id]
  );
  for (const row of pts.rows) {
    console.log(`    src=${row.source} n=${row.n} avg_target=${row.avg_target?.toFixed?.(4)} avg_value=${row.avg_value?.toFixed?.(4)}`);
  }
}

await pool.end?.();
