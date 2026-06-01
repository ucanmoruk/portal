// Verilen validation ID'leri icin RANGE QC kart olusturur.
// Yapi:
//   Baseline (Sinir)  : PRECISION_REPEATABILITY rawData[level-0] -> her analist icin 5 paralel cift (toplam 10)
//   Flow (Ornek)      : PRECISION_REPRODUCIBILITY ilk 2 satir (her satir bir cift)
//   Her nokta         : A, B (paralel olcumler) -> avg=(A+B)/2, %r=|A-B|/avg*100 (recovery alaninda saklanir)
//   S (center line)   : mean(%r) baseline noktalardan
//   UUL (upper_warn)  : S * 2.83
//   UKL (upper_ctrl)  : S * 3.69
//   Alt limit, yasal limit yok
//
// Kullanim: node scripts/create-range-cards.mjs 22 23

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

const VALIDATION_IDS = process.argv.slice(2).map(Number).filter(Number.isFinite);
if (VALIDATION_IDS.length === 0) {
  console.error("Kullanim: node scripts/create-range-cards.mjs <validation-id> [...]");
  process.exit(1);
}

const BASELINE_PER_ANALYST = 5;
const FLOW_ROWS = 2;
const F_WARNING = 2.83;
const F_CONTROL = 3.69;

const pool = createPool({ connectionString: process.env.EUROLAB_POSTGRES_URL || process.env.POSTGRES_URL });

const parseNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v !== "string") return NaN;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const sampleMean = (vs) => vs.length > 0 ? vs.reduce((s,v)=>s+v,0)/vs.length : NaN;
const sampleStdDev = (vs) => {
  if (vs.length < 2) return 0;
  const m = sampleMean(vs);
  const v = vs.reduce((s,x)=>s+(x-m)*(x-m),0)/(vs.length-1);
  return Math.sqrt(v);
};

async function processValidation(validationId) {
  const v = await pool.query(
    `SELECT v.id, COALESCE(v.code, 'VAL-' || v.id::text) AS code,
            COALESCE(m.name, v.title) AS method_name, v.config
     FROM eurolab_validations v LEFT JOIN eurolab_methods m ON m.id = v.method_id
     WHERE v.id = $1`, [validationId]);
  if (v.rowCount === 0) { console.log(`Validation ${validationId}: bulunamadi`); return; }
  const validation = v.rows[0];
  const cfg = validation.config || {};
  const repeat = cfg.moduleData?.PRECISION_REPEATABILITY || {};
  const repro = cfg.moduleData?.PRECISION_REPRODUCIBILITY || {};
  const componentNames = Array.from(new Set([...Object.keys(repeat), ...Object.keys(repro)]));
  if (componentNames.length === 0) {
    console.log(`Validation ${validationId} (${validation.code}): REPEATABILITY/REPRO yok`);
    return;
  }

  console.log(`\n=== Validation ${validationId} ${validation.code} - ${validation.method_name} ===`);

  for (const componentName of componentNames) {
    const compRepeat = repeat[componentName] || {};
    const compRepro = repro[componentName] || {};
    const unit = compRepeat.unitLabel || compRepro.unitLabel || compRepeat.unit || compRepro.unit || null;

    // Baseline pairs from REPEATABILITY rawData[level-0]
    const rawData = compRepeat.rawData || {};
    const levelKeys = Object.keys(rawData).sort();
    const firstLevel = rawData[levelKeys[0]] || {};
    const baselinePoints = [];
    for (const [analystName, pairs] of Object.entries(firstLevel)) {
      if (!Array.isArray(pairs)) continue;
      for (const pair of pairs.slice(0, BASELINE_PER_ANALYST)) {
        const A = parseNumber(pair[0]);
        const B = parseNumber(pair[1]);
        if (!Number.isFinite(A) || !Number.isFinite(B)) continue;
        const avg = (A + B) / 2;
        if (!Number.isFinite(avg) || avg === 0) continue;
        const r = Math.abs(A - B) / Math.abs(avg) * 100;
        // Baseline (REPEAT): A ve B ayni analist tarafindan parallel olcum
        baselinePoints.push({ A, B, avg, r, analystA: analystName, analystB: analystName });
      }
    }

    // Flow pairs from REPRODUCIBILITY ilk N satir
    const reproRows = Array.isArray(compRepro.rows) ? compRepro.rows : [];
    const reproAnalysts = Array.isArray(compRepro.analysts) ? compRepro.analysts.filter(Boolean) : [];
    const flowPoints = [];
    for (const row of reproRows.slice(0, FLOW_ROWS)) {
      const values = Array.isArray(row?.values) ? row.values : [];
      const A = parseNumber(values[0]);
      const B = parseNumber(values[1]);
      if (!Number.isFinite(A) || !Number.isFinite(B)) continue;
      const avg = (A + B) / 2;
      if (!Number.isFinite(avg) || avg === 0) continue;
      const r = Math.abs(A - B) / Math.abs(avg) * 100;
      const date = (typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) ? row.date : null;
      // Flow (REPRO): A = analist1, B = analist2 (analist karsilastirmasi)
      const analystA = reproAnalysts[0] || null;
      const analystB = reproAnalysts[1] || reproAnalysts[0] || null;
      flowPoints.push({ A, B, avg, r, date, analystA, analystB });
    }

    if (baselinePoints.length === 0) {
      console.log(`  ${componentName}: baseline cift bulunamadi, atlandi`);
      continue;
    }

    // Limits
    const baselineR = baselinePoints.map(p => p.r);
    const S = sampleMean(baselineR);
    const sdR = sampleStdDev(baselineR);
    const UUL = S * F_WARNING;
    const UKL = S * F_CONTROL;

    console.log(`\n  >>> ${componentName}  baseline=${baselinePoints.length}  flow=${flowPoints.length}`);
    console.log(`      S=${S.toFixed(4)}  ÜUL=${UUL.toFixed(4)}  ÜKL=${UKL.toFixed(4)}  unit=${unit}`);

    const codeStr = `QC-R-${validation.code}-${componentName}`.replace(/\s+/g,"-").slice(0,60);
    const cardRes = await pool.query(`
      INSERT INTO eurolab_qc_cards
        (code, validation_id, validation_code, method_name, component_name, card_type,
         lower_limit, center_line, upper_limit,
         lower_warning_limit, upper_warning_limit, lower_control_limit, upper_control_limit,
         lower_legal_limit, upper_legal_limit, standard_deviation,
         unit, source_data, metadata)
      VALUES ($1, $2, $3, $4, $5, 'RANGE',
              0, $6, $7,
              0, $7, 0, $8,
              NULL, NULL, $9, $10, $11::jsonb, $12::jsonb)
      ON CONFLICT (validation_id, component_name, card_type)
      DO UPDATE SET
        validation_code = EXCLUDED.validation_code,
        method_name = EXCLUDED.method_name,
        lower_limit = EXCLUDED.lower_limit,
        center_line = EXCLUDED.center_line,
        upper_limit = EXCLUDED.upper_limit,
        lower_warning_limit = EXCLUDED.lower_warning_limit,
        upper_warning_limit = EXCLUDED.upper_warning_limit,
        lower_control_limit = EXCLUDED.lower_control_limit,
        upper_control_limit = EXCLUDED.upper_control_limit,
        lower_legal_limit = NULL,
        upper_legal_limit = NULL,
        standard_deviation = EXCLUDED.standard_deviation,
        unit = EXCLUDED.unit,
        source_data = EXCLUDED.source_data,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, code`,
      [codeStr, validation.id, validation.code, validation.method_name, componentName,
       S, UUL, UKL, sdR, unit,
       JSON.stringify({ repeatability: compRepeat, reproducibility: compRepro,
                        baselineCount: baselinePoints.length, flowCount: flowPoints.length,
                        formula: "%r = |A-B|/avg(A,B) * 100" }),
       JSON.stringify({ source: "PRECISION_REPEATABILITY+PRECISION_REPRODUCIBILITY", cardType: "RANGE",
                        limitRule: "S = mean(%r baseline); ÜUL = S × 2.83; ÜKL = S × 3.69; alt limit yok",
                        S, warningFactor: F_WARNING, controlFactor: F_CONTROL,
                        upperWarningLimit: UUL, upperControlLimit: UKL,
                        baselinePerAnalyst: BASELINE_PER_ANALYST, flowRows: FLOW_ROWS })]
    );
    const card = cardRes.rows[0];
    console.log(`      card_id=${card.id}  code=${card.code}`);

    await pool.query(`DELETE FROM eurolab_qc_card_points WHERE card_id=$1 AND source IN ('VALIDATION','VALIDATION_BASELINE','VALIDATION_FLOW')`, [card.id]);

    // Range kart noktasi sema:
    //   value         = A (1. paralel)
    //   target_value  = B (2. paralel)
    //   recovery      = %r (grafikte Y)
    //   analyst       = "analystA||analystB" (delimiter ile iki analist; ayni kisi olsa da iki kez)
    let seq = 0;
    for (const p of baselinePoints) {
      seq++;
      const analystField = `${p.analystA || ""}||${p.analystB || ""}`;
      await pool.query(`
        INSERT INTO eurolab_qc_card_points
          (card_id, sequence_no, label, analyst, value, target_value, unit, recovery, source, locked, measured_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'VALIDATION_BASELINE', true, NULL)`,
        [card.id, seq, `Sınır ${seq}`, analystField, p.A, p.B, unit, p.r]);
      console.log(`        + #${seq} [Sınır] ${p.analystA}  A=${p.A} B=${p.B}  avg=${p.avg.toFixed(4)}  %r=${p.r.toFixed(3)}`);
    }
    for (const p of flowPoints) {
      seq++;
      const analystField = `${p.analystA || ""}||${p.analystB || ""}`;
      await pool.query(`
        INSERT INTO eurolab_qc_card_points
          (card_id, sequence_no, label, analyst, value, target_value, unit, recovery, source, locked, measured_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'VALIDATION_FLOW', true, $9::date)`,
        [card.id, seq, `Örnek ${seq - baselinePoints.length}`, analystField, p.A, p.B, unit, p.r, p.date]);
      console.log(`        + #${seq} [Örnek] ${p.date} ${p.analystA}/${p.analystB}  A=${p.A} B=${p.B}  avg=${p.avg.toFixed(4)}  %r=${p.r.toFixed(3)}`);
    }
  }
}

try {
  for (const id of VALIDATION_IDS) await processValidation(id);
  console.log(`\nTamamlandi.`);
} catch (err) {
  console.error("Hata:", err);
  process.exit(3);
} finally {
  await pool.end?.();
}
