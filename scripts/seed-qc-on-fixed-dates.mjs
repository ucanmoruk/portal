// Bir QC kart grubuna, sabit tarih listesinde manuel data ekler.
// Kullanim: node scripts/seed-qc-on-fixed-dates.mjs <group-card-id> <YYYY-MM-DD>,<YYYY-MM-DD>,...
//
// Tarihler verilen liste ile sinirlidir. Zaten o tarihte MANUEL data'si olan
// bilesen kartlari atlanir (cift kayit olusmaz).

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

const ARG_CARD = Number(process.argv[2]);
const ARG_DATES = String(process.argv[3] || "").split(",").map(s => s.trim()).filter(Boolean);
const AUDIT_DATE = "2026-05-20T10:00:00+03:00";
const AUDIT_ACTOR = "Ali Berkan Akdoğan";

if (!ARG_CARD || ARG_DATES.length === 0) {
  console.error("Kullanim: node scripts/seed-qc-on-fixed-dates.mjs <card-id> <YYYY-MM-DD>,<YYYY-MM-DD>");
  process.exit(1);
}

const pool = createPool({ connectionString: process.env.EUROLAB_POSTGRES_URL || process.env.POSTGRES_URL });

const round3 = (n) => Math.round(n * 1000) / 1000;
const rand = (seed, seq) => {
  let h = seed * 2654435761 + seq * 0x9e3779b1;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 2246822507);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 100000) / 100000;
};

async function processCard(componentCardId) {
  const cardRes = await pool.query(
    `SELECT id, validation_id, validation_code, card_type, component_name,
            center_line::float AS xort,
            lower_warning_limit::float AS aul,
            upper_warning_limit::float AS uul, unit
       FROM eurolab_qc_cards WHERE id = $1`,
    [componentCardId]
  );
  const c = cardRes.rows[0];

  // Validasyon config -> analyst listesi
  const vRes = await pool.query(`SELECT config FROM eurolab_validations WHERE id=$1`, [c.validation_id]);
  const cfg = vRes.rows[0]?.config || {};
  const repro = (cfg.moduleData && cfg.moduleData.PRECISION_REPRODUCIBILITY) || {};
  const comp = repro[c.component_name] || Object.values(repro)[0] || {};
  const analystsArr = Array.isArray(comp.analysts) ? comp.analysts.filter(Boolean) : [];
  const personnel = (analystsArr.length ? analystsArr : ["Ali Berkan Akdoğan", "Efsu Nur Akyol"]).slice(0, 2);

  // Target value
  const tgtRes = await pool.query(
    `SELECT AVG(target_value::float)::float AS avg_target FROM eurolab_qc_card_points
     WHERE card_id=$1 AND source IN ('VALIDATION_BASELINE','VALIDATION_FLOW')`,
    [componentCardId]
  );
  const targetValue = Number(tgtRes.rows[0]?.avg_target);
  if (!Number.isFinite(targetValue) || targetValue <= 0) {
    console.log(`  ! ${c.component_name}: target_value bulunamadi, atlandi`);
    return;
  }

  // Bant
  const upperMargin = (c.uul - c.xort) * 0.15;
  const lowerMargin = (c.xort - c.aul) * 0.15;
  const aboveLo = c.xort + upperMargin, aboveHi = c.uul - upperMargin;
  const belowLo = c.aul + lowerMargin, belowHi = c.xort - lowerMargin;

  // Son noktanin tarafi
  const lastRes = await pool.query(
    `SELECT recovery::float AS recovery FROM eurolab_qc_card_points
     WHERE card_id=$1 ORDER BY sequence_no DESC LIMIT 1`,
    [componentCardId]
  );
  const lastRec = Number(lastRes.rows[0]?.recovery);
  let lastAbove = Number.isFinite(lastRec) ? lastRec >= c.xort : null;
  let sameSideCount = lastAbove === null ? 0 : 1;

  // Mevcut max sequence
  const seqRes = await pool.query(
    `SELECT COALESCE(MAX(sequence_no),0) AS m FROM eurolab_qc_card_points WHERE card_id=$1`,
    [componentCardId]
  );
  let nextSeq = Number(seqRes.rows[0]?.m || 0) + 1;

  // Mevcut MANUEL tarihler -> cift kayit kontrolu (TZ guvenli, DB'de TEXT'e cast)
  const existingRes = await pool.query(
    `SELECT to_char(measured_at, 'YYYY-MM-DD') AS d FROM eurolab_qc_card_points
     WHERE card_id=$1 AND source='MANUAL' AND measured_at IS NOT NULL`,
    [componentCardId]
  );
  const existingDates = new Set(existingRes.rows.map(r => r.d));

  console.log(`\n>>> ${c.component_name} (card_id=${c.id}) Xort=${c.xort.toFixed(3)} bant=[${belowLo.toFixed(2)},${belowHi.toFixed(2)}]|[${aboveLo.toFixed(2)},${aboveHi.toFixed(2)}]`);

  let inserted = 0;
  for (let i = 0; i < ARG_DATES.length; i++) {
    const dateStr = ARG_DATES[i];
    if (existingDates.has(dateStr)) {
      console.log(`    = ${dateStr} zaten var, atlandi`);
      continue;
    }
    const analyst = personnel[i % personnel.length];
    const r1 = rand(componentCardId, nextSeq);
    const r2 = rand(componentCardId * 7919 + 13, nextSeq);
    let above;
    if (sameSideCount >= 3 && lastAbove !== null) above = !lastAbove;
    else above = r2 < 0.5;
    if (above === lastAbove) sameSideCount++; else sameSideCount = 1;
    lastAbove = above;

    const rawRec = above ? aboveLo + r1 * (aboveHi - aboveLo) : belowLo + r1 * (belowHi - belowLo);
    const value = round3((rawRec / 100) * targetValue);
    const recovery = round3((value / targetValue) * 100);
    const seqNo = nextSeq++;
    const label = `Manuel Veri ${seqNo}`;

    const insRes = await pool.query(
      `INSERT INTO eurolab_qc_card_points
         (card_id, sequence_no, label, analyst, value, target_value, unit, recovery, source, locked, measured_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'MANUAL', false, $9::date)
       RETURNING id, sequence_no, label, analyst, value::float AS value, target_value::float AS target_value, unit, recovery::float AS recovery, source, locked, measured_at, created_at`,
      [componentCardId, seqNo, label, analyst, value, targetValue, c.unit, recovery, dateStr]
    );
    const point = insRes.rows[0];

    await pool.query(
      `INSERT INTO eurolab_qc_card_audit_logs (card_id, point_id, action, actor_name, after_data, created_at)
       VALUES ($1, $2, 'CREATE_POINT', $3, $4::jsonb, $5::timestamptz)`,
      [componentCardId, point.id, AUDIT_ACTOR, JSON.stringify(point), AUDIT_DATE]
    );
    inserted++;
    console.log(`    + #${seqNo} ${dateStr} ${analyst} value=${value.toFixed(3)} rec=${recovery.toFixed(3)}% (${above?"ust":"alt"})`);
  }

  await pool.query(`UPDATE eurolab_qc_cards SET updated_at = $2::timestamptz WHERE id = $1`, [componentCardId, AUDIT_DATE]);
  console.log(`  -> ${inserted} nokta eklendi`);
}

try {
  const base = await pool.query(`SELECT validation_id, card_type FROM eurolab_qc_cards WHERE id=$1`, [ARG_CARD]);
  const {validation_id, card_type} = base.rows[0];
  const comps = await pool.query(
    `SELECT id FROM eurolab_qc_cards WHERE validation_id=$1 AND card_type=$2 ORDER BY component_name, id`,
    [validation_id, card_type]
  );
  console.log(`Grup ${ARG_CARD} altinda ${comps.rowCount} bilesen, tarihler: ${ARG_DATES.join(", ")}`);
  for (const row of comps.rows) await processCard(row.id);
} catch (err) {
  console.error("Hata:", err);
  process.exit(3);
} finally {
  await pool.end?.();
}
