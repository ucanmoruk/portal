// Sinir (VALIDATION_BASELINE) noktalarinin guncel recovery'lerinden
// her bilesen karti icin Xort, sigma, AUL=Xort-2sigma, UUL=Xort+2sigma yeniden hesaplar.
// Sonra TUM noktalari (baseline + flow + manuel) yeni limitlerle karsilastirir.

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

const sampleMean = (vs) => vs.length > 0 ? vs.reduce((s,v) => s+v, 0) / vs.length : NaN;
const sampleStdDev = (vs) => {
  if (vs.length < 2) return NaN;
  const m = sampleMean(vs);
  const v = vs.reduce((s,x) => s + (x-m)*(x-m), 0) / (vs.length - 1);
  return Math.sqrt(v);
};

const cards = await pool.query(`
  SELECT id, validation_code, component_name,
         center_line::float AS xort_old,
         lower_warning_limit::float AS aul_old,
         upper_warning_limit::float AS uul_old,
         lower_control_limit::float AS akl_old,
         upper_control_limit::float AS ukl_old,
         standard_deviation::float AS sd_old
  FROM eurolab_qc_cards
  ORDER BY validation_code, component_name
`);

let totalCardsChanged = 0;
let totalOutOfRange = 0;
const offending = [];

for (const c of cards.rows) {
  const blRes = await pool.query(
    `SELECT recovery::float AS recovery FROM eurolab_qc_card_points
     WHERE card_id = $1 AND source = 'VALIDATION_BASELINE'`,
    [c.id]
  );
  const recoveries = blRes.rows.map(r => r.recovery).filter(Number.isFinite);
  if (recoveries.length < 2) continue;
  const xort = sampleMean(recoveries);
  const sd = sampleStdDev(recoveries);
  const aul = xort - 2*sd;
  const uul = xort + 2*sd;

  const shifted = Math.abs(xort - c.xort_old) > 0.001 || Math.abs(aul - c.aul_old) > 0.001 || Math.abs(uul - c.uul_old) > 0.001;
  if (shifted) totalCardsChanged++;

  // Tum noktalari yeni limitlere gore kontrol et
  const all = await pool.query(
    `SELECT id, sequence_no, recovery::float AS recovery, source, analyst, measured_at
     FROM eurolab_qc_card_points
     WHERE card_id = $1
     ORDER BY sequence_no`,
    [c.id]
  );
  const violators = all.rows.filter(p => p.recovery < aul || p.recovery > uul);
  if (violators.length === 0) continue;

  totalOutOfRange += violators.length;
  console.log(`\n▼ ${c.validation_code} | ${c.component_name}  (card_id=${c.id})`);
  console.log(`   ESKI:  Xort=${c.xort_old.toFixed(3)}  AUL=${c.aul_old.toFixed(3)}  UUL=${c.uul_old.toFixed(3)}  SD=${c.sd_old?.toFixed(3) ?? "n/a"}`);
  console.log(`   YENI:  Xort=${xort.toFixed(3)}  AUL=${aul.toFixed(3)}  UUL=${uul.toFixed(3)}  SD=${sd.toFixed(3)}  (n=${recoveries.length})`);
  for (const p of violators) {
    const dir = p.recovery < aul ? "↓" : "↑";
    const dateStr = p.measured_at ? new Date(p.measured_at).toISOString().slice(0,10) : "";
    const srcLabel = p.source === "VALIDATION_BASELINE" ? "Sinir" : p.source === "VALIDATION_FLOW" ? "Takip" : "Manuel";
    console.log(`     ${dir} #${String(p.sequence_no).padStart(2)} ${dateStr}  rec=${p.recovery.toFixed(3)}%  [${srcLabel}] ${p.analyst || ""}`);
    offending.push({ code: c.validation_code, comp: c.component_name, src: p.source, rec: p.recovery, aul, uul, seq: p.sequence_no });
  }
}

console.log(`\n========== OZET ==========`);
console.log(`Limitleri kayan kart sayisi: ${totalCardsChanged}`);
console.log(`Yeni limitlere gore sinir disinda nokta sayisi: ${totalOutOfRange}`);
const bySource = {};
for (const o of offending) bySource[o.src] = (bySource[o.src] || 0) + 1;
for (const [s, n] of Object.entries(bySource)) console.log(`  ${s}: ${n}`);

await pool.end?.();
