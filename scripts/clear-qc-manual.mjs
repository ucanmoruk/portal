// QC kart grubunun (URL'deki id) tum component'lerinden
// source='MANUAL' QC noktalarini ve ilgili audit log'lari siler.
// Validasyondan gelen (VALIDATION_BASELINE / VALIDATION_FLOW / VALIDATION) noktalara dokunmaz.
//
// Calistir: node scripts/clear-qc-manual.mjs <card-id>

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

const ARG_CARD = Number(process.argv[2] || 232);
const pool = createPool({ connectionString: process.env.EUROLAB_POSTGRES_URL || process.env.POSTGRES_URL });

try {
  const base = await pool.query(
    `SELECT validation_id, card_type FROM eurolab_qc_cards WHERE id = $1`,
    [ARG_CARD]
  );
  if (base.rowCount === 0) {
    console.error(`Kart bulunamadi: ${ARG_CARD}`);
    process.exit(1);
  }
  const { validation_id, card_type } = base.rows[0];

  const comps = await pool.query(
    `SELECT id, component_name FROM eurolab_qc_cards
     WHERE validation_id = $1 AND card_type = $2
     ORDER BY id`,
    [validation_id, card_type]
  );
  const cardIds = comps.rows.map(r => r.id);
  console.log(`Hedef ${cardIds.length} bilesen kart`);

  // Manuel noktalarin id'lerini bul
  const pts = await pool.query(
    `SELECT id, card_id, sequence_no FROM eurolab_qc_card_points
     WHERE card_id = ANY($1::int[]) AND source = 'MANUAL'
     ORDER BY card_id, sequence_no`,
    [cardIds]
  );
  console.log(`Silinecek MANUAL nokta: ${pts.rowCount}`);
  for (const p of pts.rows) console.log(`  card=${p.card_id} seq=${p.sequence_no} id=${p.id}`);

  if (pts.rowCount === 0) {
    console.log("Silinecek manuel veri yok.");
    process.exit(0);
  }
  const pointIds = pts.rows.map(r => r.id);

  // Bu manuel noktalara ait audit log'lar
  const audit = await pool.query(
    `DELETE FROM eurolab_qc_card_audit_logs
     WHERE card_id = ANY($1::int[]) AND point_id = ANY($2::int[])
     RETURNING id`,
    [cardIds, pointIds]
  );
  console.log(`Silinen audit log: ${audit.rowCount}`);

  // Manuel noktalar
  const delPts = await pool.query(
    `DELETE FROM eurolab_qc_card_points
     WHERE card_id = ANY($1::int[]) AND source = 'MANUAL'
     RETURNING id`,
    [cardIds]
  );
  console.log(`Silinen MANUAL nokta: ${delPts.rowCount}`);

  // Card updated_at'i kalan en son aktiviteye geri al (validation insert anina)
  await pool.query(
    `UPDATE eurolab_qc_cards
       SET updated_at = COALESCE(
         (SELECT MAX(created_at) FROM eurolab_qc_card_points WHERE card_id = eurolab_qc_cards.id),
         created_at
       )
     WHERE id = ANY($1::int[])`,
    [cardIds]
  );
  console.log("Card updated_at resetlendi.");
} catch (err) {
  console.error("Hata:", err);
  process.exit(3);
} finally {
  await pool.end?.();
}
