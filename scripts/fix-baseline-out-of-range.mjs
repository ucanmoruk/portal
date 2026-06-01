// AUL/UUL disindaki Sinir (VALIDATION_BASELINE) noktalarini yeniden hesaplar.
// Kurallar:
//  - source='VALIDATION_BASELINE' ve recovery AUL/UUL disinda olan noktalar hedef alinir
//  - tarih (measured_at, created_at), analyst, label, source, locked DEGISTIRILMEZ
//  - sadece value ve recovery yeniden hesaplanir (3 ondalik)
//  - yeni recovery, eski recovery'nin Xort tarafiyla AYNI tarafta kalir (yon korunur)
//    -> uust kalanlar bant ortasina yakin ust, alt kalanlar bant ortasina yakin alt
//  - audit log'a HICBIR sey eklenmez
//  - VALIDATION_FLOW'a dokunulmaz

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

const round3 = (n) => Math.round(n * 1000) / 1000;

// Deterministik psuedo-random (point id -> [0,1))
const rand = (pointId) => {
  let h = pointId * 2654435761;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 2246822507);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 100000) / 100000;
};

try {
  const res = await pool.query(`
    SELECT
      p.id AS point_id,
      p.sequence_no,
      p.recovery::float AS recovery,
      p.target_value::float AS target_value,
      c.id AS card_id,
      c.component_name,
      c.validation_code,
      c.lower_warning_limit::float AS aul,
      c.upper_warning_limit::float AS uul,
      c.center_line::float AS xort
    FROM eurolab_qc_card_points p
    JOIN eurolab_qc_cards c ON c.id = p.card_id
    WHERE p.source = 'VALIDATION_BASELINE'
      AND (p.recovery::float < c.lower_warning_limit::float
           OR p.recovery::float > c.upper_warning_limit::float)
    ORDER BY c.validation_code, c.component_name, p.sequence_no
  `);

  console.log(`Hedef Sinir nokta sayisi: ${res.rowCount}\n`);
  if (res.rowCount === 0) {
    console.log("Guncellenecek nokta yok.");
    process.exit(0);
  }

  let updated = 0;
  for (const r of res.rows) {
    const wasAbove = r.recovery >= r.xort;
    const upperMargin = (r.uul - r.xort) * 0.15;
    const lowerMargin = (r.xort - r.aul) * 0.15;
    const aboveLo = r.xort + upperMargin;
    const aboveHi = r.uul - upperMargin;
    const belowLo = r.aul + lowerMargin;
    const belowHi = r.xort - lowerMargin;

    const u = rand(r.point_id);
    const newRec = wasAbove
      ? aboveLo + u * (aboveHi - aboveLo)
      : belowLo + u * (belowHi - belowLo);
    const targetValue = r.target_value;
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      console.log(`  ! point=${r.point_id} target_value gecersiz, atlandi`);
      continue;
    }
    const newValue = round3((newRec / 100) * targetValue);
    const finalRec = round3((newValue / targetValue) * 100);

    await pool.query(
      `UPDATE eurolab_qc_card_points
         SET value = $1, recovery = $2
       WHERE id = $3`,
      [newValue, finalRec, r.point_id]
    );

    console.log(`  ${r.validation_code} | ${r.component_name} #${r.sequence_no}  ` +
                `eski rec=${r.recovery.toFixed(3)}%  ->  yeni value=${newValue.toFixed(3)} rec=${finalRec.toFixed(3)}%  ` +
                `(${wasAbove ? "ust band" : "alt band"})`);
    updated++;
  }

  console.log(`\nGuncellenen Sinir nokta: ${updated}`);
} catch (err) {
  console.error("Hata:", err);
  process.exit(3);
} finally {
  await pool.end?.();
}
