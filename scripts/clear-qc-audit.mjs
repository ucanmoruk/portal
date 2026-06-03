// Bir QC kart grubunun (URL'deki id = 232) tum component'lerine ait
// eurolab_qc_card_audit_logs kayitlarini siler.
//
// Calisma:  node scripts/clear-qc-audit.mjs <kart-id>

import { readFileSync } from "node:fs";
import { createPool } from "@vercel/postgres";

// .env.local'i manuel yukle
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

const cardId = Number(process.argv[2] || 232);
if (!Number.isFinite(cardId)) {
  console.error("Gecersiz kart id:", process.argv[2]);
  process.exit(1);
}

const connectionString = process.env.EUROLAB_POSTGRES_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("EUROLAB_POSTGRES_URL veya POSTGRES_URL tanimli degil.");
  process.exit(1);
}

const pool = createPool({ connectionString });

try {
  // Kart id 232'nin (validation_id, card_type) ikilisini bul
  const baseRes = await pool.query(
    `SELECT validation_id, card_type FROM eurolab_qc_cards WHERE id = $1`,
    [cardId]
  );
  if (baseRes.rowCount === 0) {
    console.error(`Kart bulunamadi: id=${cardId}`);
    process.exit(2);
  }
  const { validation_id, card_type } = baseRes.rows[0];
  console.log(`Hedef grup: validation_id=${validation_id}, card_type=${card_type}`);

  // Bu grup altindaki tum component card id'leri
  const cardsRes = await pool.query(
    `SELECT id, component_name FROM eurolab_qc_cards
     WHERE validation_id = $1 AND card_type = $2
     ORDER BY id`,
    [validation_id, card_type]
  );
  const cardIds = cardsRes.rows.map((r) => r.id);
  console.log(`Etkilenecek component sayisi: ${cardIds.length}`);
  for (const r of cardsRes.rows) {
    console.log(`  - card_id=${r.id} component=${r.component_name}`);
  }

  if (cardIds.length === 0) {
    console.log("Silinecek bir sey yok.");
    process.exit(0);
  }

  // Once kac kayit silinecek say
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM eurolab_qc_card_audit_logs WHERE card_id = ANY($1::int[])`,
    [cardIds]
  );
  console.log(`Silinecek audit log sayisi: ${countRes.rows[0].n}`);

  if (countRes.rows[0].n === 0) {
    console.log("Bu grupta islem izi zaten yok.");
    process.exit(0);
  }

  const delRes = await pool.query(
    `DELETE FROM eurolab_qc_card_audit_logs WHERE card_id = ANY($1::int[])`,
    [cardIds]
  );
  console.log(`Silindi: ${delRes.rowCount} kayit`);
} catch (err) {
  console.error("Hata:", err);
  process.exit(3);
} finally {
  await pool.end?.();
}
