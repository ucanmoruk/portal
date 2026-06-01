// fix-baseline-out-of-range.mjs ile yapilan VALIDATION_BASELINE guncellemelerini geri alir.
//
// Mantik:
//   - Baseline noktalari createRecoveryCardsFromValidation icinde
//     validation.config.moduleData.TRUENESS[component].rows[N][analystIndex]
//     degerlerinden uretilmistir. Bu config DEGISMEDI -> orijinal degerleri yeniden hesaplariz.
//   - Her baseline noktasinin label'i: "Sinir {analyst} {N}" (N 1-indexed)
//   - Yeniden hesaplanan value/recovery DB'deki ile farkliysa UPDATE et.
//   - source='VALIDATION_FLOW' ve 'MANUAL' noktalarina DOKUNULMAZ.
//   - Audit log'a hicbir sey eklenmez.

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

const parseNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v !== "string") return NaN;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const cards = await pool.query(`
  SELECT c.id, c.component_name, c.validation_id, c.validation_code, v.config
  FROM eurolab_qc_cards c
  JOIN eurolab_validations v ON v.id = c.validation_id
  WHERE c.card_type = 'RECOVERY'
  ORDER BY c.validation_code, c.component_name
`);

let totalChecked = 0, totalReverted = 0, mismatchSkipped = 0;
const cardSummary = [];

for (const c of cards.rows) {
  const cfg = c.config || {};
  const trueness = (cfg.moduleData && cfg.moduleData.TRUENESS) || {};
  const compData = trueness[c.component_name];
  if (!compData) {
    cardSummary.push({ card_id: c.id, code: c.validation_code, comp: c.component_name, status: "config'de bilesen yok" });
    continue;
  }

  const target = parseNumber(compData.target);
  const rows = Array.isArray(compData.rows) ? compData.rows : [];
  const analystsArr = Array.isArray(compData.analysts) ? compData.analysts.filter(Boolean) : [];
  if (analystsArr.length === 0 || rows.length === 0 || !Number.isFinite(target) || target <= 0) {
    cardSummary.push({ card_id: c.id, code: c.validation_code, comp: c.component_name, status: "config eksik" });
    continue;
  }
  const selectedAnalysts = analystsArr.slice(0, 2);

  // Analyst basina ilk 7 gecerli value (createRecovery ile ayni mantik)
  const validValuesByAnalyst = selectedAnalysts.map((_, idx) =>
    rows.map(row => parseNumber(row[idx])).filter(Number.isFinite).slice(0, 7)
  );

  const baselinePoints = await pool.query(
    `SELECT id, sequence_no, label, analyst,
            value::float AS value,
            recovery::float AS recovery
     FROM eurolab_qc_card_points
     WHERE card_id = $1 AND source = 'VALIDATION_BASELINE'
     ORDER BY sequence_no`,
    [c.id]
  );

  let cardReverted = 0;
  for (const p of baselinePoints.rows) {
    totalChecked++;
    // Label parse: "Sinir/Sınır {analyst} {N}"
    const m = (p.label || "").match(/^S[ıi]n[ıi]r\s+(.+)\s+(\d+)$/);
    if (!m) { mismatchSkipped++; continue; }
    const analystName = m[1].trim();
    const N = parseInt(m[2], 10);
    const analystIndex = selectedAnalysts.indexOf(analystName);
    if (analystIndex < 0) { mismatchSkipped++; continue; }
    const col = validValuesByAnalyst[analystIndex];
    if (!col || col.length < N) { mismatchSkipped++; continue; }

    const origValue = col[N - 1];
    const origRecovery = (origValue / target) * 100;

    const valueDiff = Math.abs(origValue - (p.value ?? NaN));
    const recDiff = Math.abs(origRecovery - (p.recovery ?? NaN));
    if (valueDiff < 1e-6 && recDiff < 1e-6) continue; // zaten orijinal

    await pool.query(
      `UPDATE eurolab_qc_card_points SET value = $1, recovery = $2 WHERE id = $3`,
      [origValue, origRecovery, p.id]
    );
    totalReverted++;
    cardReverted++;
    console.log(`  ${c.validation_code} | ${c.component_name} #${p.sequence_no}  ` +
                `db value=${(p.value ?? 0).toFixed(3)} rec=${(p.recovery ?? 0).toFixed(3)}%  ->  ` +
                `orig value=${origValue.toFixed(3)} rec=${origRecovery.toFixed(3)}%`);
  }
  if (cardReverted > 0) cardSummary.push({ card_id: c.id, code: c.validation_code, comp: c.component_name, status: `${cardReverted} nokta geri alindi` });
}

console.log(`\n========== OZET ==========`);
console.log(`Toplam baseline kontrol: ${totalChecked}`);
console.log(`Geri alinan: ${totalReverted}`);
console.log(`Label/analyst eslesmeyen (atlandi): ${mismatchSkipped}`);

await pool.end?.();
