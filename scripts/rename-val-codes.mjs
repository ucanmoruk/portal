// VAL- baslayan (ve null) validasyon kodlarini K.SOP.X-Ek.N formatina cevirir.
// Metoda gore zaten kullanilan Ek.N'leri atlar, validation.id sirasiyla atar.
// Hem eurolab_validations.code hem eurolab_qc_cards.validation_code'u gunceller.

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

try {
  const allRes = await pool.query(`
    SELECT v.id, v.code, v.method_id, m.method_code
    FROM eurolab_validations v
    LEFT JOIN eurolab_methods m ON m.id = v.method_id
    ORDER BY v.method_id, v.id
  `);

  // method_id -> { method_code, existingEks:Set, renameIds:[] }
  const methodMap = new Map();
  for (const r of allRes.rows) {
    if (!r.method_code) continue;
    if (!methodMap.has(r.method_id)) {
      methodMap.set(r.method_id, { method_code: r.method_code, existingEks: new Set(), renameIds: [] });
    }
    const entry = methodMap.get(r.method_id);
    const ekRegex = new RegExp(`^${r.method_code.replace(/\./g, "\\.")}-Ek\\.(\\d+)$`);
    const m = typeof r.code === "string" ? r.code.match(ekRegex) : null;
    if (m) {
      entry.existingEks.add(parseInt(m[1], 10));
    } else if (r.code === null || (typeof r.code === "string" && r.code.startsWith("VAL-"))) {
      entry.renameIds.push(r.id);
    }
  }

  const renamePlan = []; // { val_id, oldCode, newCode }
  for (const [, info] of methodMap) {
    let nextN = 1;
    const taken = new Set(info.existingEks);
    for (const valId of info.renameIds) {
      while (taken.has(nextN)) nextN++;
      renamePlan.push({ val_id: valId, newCode: `${info.method_code}-Ek.${nextN}` });
      taken.add(nextN);
      nextN++;
    }
  }

  if (renamePlan.length === 0) {
    console.log("Rename edilecek validasyon yok.");
    process.exit(0);
  }

  // Mevcut kodlari oku (log icin)
  const oldCodes = new Map();
  for (const r of allRes.rows) oldCodes.set(r.id, r.code);

  console.log(`Toplam ${renamePlan.length} validasyon rename edilecek:`);
  for (const p of renamePlan) {
    console.log(`  v.id=${p.val_id}  "${oldCodes.get(p.val_id)}"  ->  "${p.newCode}"`);
  }

  // Once unique constraint celismesi olmasin diye gecici prefix
  await pool.query("BEGIN");
  try {
    for (const p of renamePlan) {
      await pool.query(`UPDATE eurolab_validations SET code = $1 WHERE id = $2`, [`__TMP_${p.val_id}`, p.val_id]);
    }
    for (const p of renamePlan) {
      await pool.query(`UPDATE eurolab_validations SET code = $1 WHERE id = $2`, [p.newCode, p.val_id]);
      const upd = await pool.query(
        `UPDATE eurolab_qc_cards SET validation_code = $1 WHERE validation_id = $2 RETURNING id`,
        [p.newCode, p.val_id]
      );
      console.log(`  -> v.id=${p.val_id} validation_code guncellendi, etkilenen QC kart: ${upd.rowCount}`);
    }
    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }

  console.log("\nTamamlandi.");
} catch (err) {
  console.error("Hata:", err);
  process.exit(3);
} finally {
  await pool.end?.();
}
