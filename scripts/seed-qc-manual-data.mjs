// QC kart 232 (veya parametrik) icin manuel QC verisi ekler.
//
// Kurallar (v3 - 2 ayda 1 data + zigzag):
//  1. Validasyon tekrarurutebilirlik son gunu T0. Data tarihleri T0 + 2*i ay (i=1,2,3...)
//     seklinde 2 aylik araliklarla planlanir. Hedef tarih hafta sonuna duserse
//     bir onceki Cuma'ya kaydirilir.
//  2. Maksimum data tarihi 2026-05-20. Bunun otesindeki noktalar eklenmez.
//  3. Analist: validasyondaki iki analistten biri (siralamali).
//  4. target_value = validasyon target_value'su; recovery (100*value/target) AUL ile UUL arasinda.
//  5. ZIGZAG: pes pese en fazla 3 nokta ortalamanin (Xort) ayni tarafinda olabilir.
//     Strict zigzag uygulariz (her nokta bir ust bir alt) -> "max 3 ayni taraf" garanti saglanir.
//  6. Audit log: created_at='2026-05-20', actor_name='Ali Berkan Akdogan', action='CREATE_POINT'
//  7. source='MANUAL', locked=false  -> tabloda "Manuel" gorunur
//
// Calistir: node scripts/seed-qc-manual-data.mjs <card-id>

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
const INTERVAL_MONTHS = Number(process.argv[3] || 2);  // default 2 ay, gerekirse CLI ile override
const AUDIT_DATE = "2026-05-20T10:00:00+03:00";
const AUDIT_ACTOR = "Ali Berkan Akdoğan";
const MAX_DATA_DATE = new Date("2026-05-20T00:00:00Z");

const pool = createPool({ connectionString: process.env.EUROLAB_POSTGRES_URL || process.env.POSTGRES_URL });

// --- yardimcilar ---
const isoDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };
const isWeekday = (d) => { const day = d.getUTCDay(); return day >= 1 && day <= 5; };

// Hafta sonuysa onceki Cuma'ya kaydir; haftaiciyse aynen birak
const snapToWeekday = (d) => {
  let cur = new Date(d);
  while (!isWeekday(cur)) cur = addDays(cur, -1);
  return cur;
};

// endDate'i sabitleyip geriye dogru intervalMonths adimlariyla T0'a kadar tarih uretir.
// Boylece son data her zaman endDate'e (haftaiciye snap'lenmis) sabitlenir.
// Hafta sonuna dusen hedef tarih bir onceki Cuma'ya kaydirilir.
const planPeriodicDates = (t0ISO, endDate, intervalMonths) => {
  const t0 = new Date(`${t0ISO}T00:00:00Z`);
  const out = [];
  let cursor = snapToWeekday(new Date(endDate));
  if (cursor <= t0) return out;
  while (cursor > t0) {
    out.unshift(isoDate(cursor));
    const prev = new Date(cursor);
    prev.setUTCMonth(prev.getUTCMonth() - intervalMonths);
    cursor = snapToWeekday(prev);
  }
  return out;
};

// Deterministik psuedo-random (kart id + seq -> [0,1))
const rand = (seed, seq) => {
  let h = seed * 2654435761 + seq * 0x9e3779b1;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 2246822507);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 100000) / 100000;
};

// --- ana akis ---
async function processCard(componentCardId) {
  // Bilesen kart bilgisi
  const cardRes = await pool.query(
    `SELECT id, validation_id, validation_code, card_type, component_name,
            center_line::float AS xort,
            lower_warning_limit::float AS aul,
            upper_warning_limit::float AS uul,
            unit
       FROM eurolab_qc_cards WHERE id = $1`,
    [componentCardId]
  );
  if (cardRes.rowCount === 0) throw new Error(`Bilesen kart bulunamadi: ${componentCardId}`);
  const c = cardRes.rows[0];
  console.log(`[card_id=${c.id}] ${c.component_name} AUL=${c.aul.toFixed(2)} UUL=${c.uul.toFixed(2)} unit=${c.unit}`);

  // Validasyon config'inden analistler ve repro son gunu
  const valRes = await pool.query(
    `SELECT config FROM eurolab_validations WHERE id = $1`,
    [c.validation_id]
  );
  const cfg = valRes.rows[0]?.config || {};
  const md = cfg.moduleData || {};
  const repro = md.PRECISION_REPRODUCIBILITY || {};
  const comp = repro[c.component_name] || Object.values(repro)[0] || {};
  const analysts = Array.isArray(comp.analysts) ? comp.analysts.filter(Boolean) : [];
  if (analysts.length === 0) throw new Error("Validasyon analist listesi bos");
  const personnel = analysts.slice(0, 2);
  console.log(`  analystler: ${personnel.join(", ")}`);

  // Tum repro tarihlerinden son gun
  let lastDateStr = null;
  for (const data of Object.values(repro)) {
    const rows = (data && Array.isArray(data.rows)) ? data.rows : [];
    for (const r of rows) {
      if (r && typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
        if (!lastDateStr || r.date > lastDateStr) lastDateStr = r.date;
      }
    }
  }
  if (!lastDateStr) throw new Error("PRECISION_REPRODUCIBILITY rows.date yok, repro son gunu bulunamadi");
  console.log(`  repro son gunu (QC olusturma tarihi): ${lastDateStr}`);

  // 2 ayda 1 hedef tarih, max 2026-05-20'ye kadar
  const chosen = planPeriodicDates(lastDateStr, MAX_DATA_DATE, INTERVAL_MONTHS);
  console.log(`  aralik: ${lastDateStr} -> ${isoDate(MAX_DATA_DATE)} | secilen ${chosen.length} tarih: ${chosen.join(", ") || "(yok)"}`);
  if (chosen.length === 0) {
    console.log("  -> Eklenebilir tarih yok, atlandi");
    return;
  }

  // Mevcut target_value referansi
  const tgtRes = await pool.query(
    `SELECT AVG(target_value::float)::float AS avg_target,
            AVG(value::float)::float AS avg_value
       FROM eurolab_qc_card_points
       WHERE card_id = $1 AND source IN ('VALIDATION_BASELINE','VALIDATION_FLOW')`,
    [componentCardId]
  );
  const targetValue = Number(tgtRes.rows[0]?.avg_target);
  if (!Number.isFinite(targetValue) || targetValue <= 0) throw new Error("Validasyon target_value bulunamadi");
  console.log(`  target_value=${targetValue}`);

  // Bir sonraki sequence_no
  const seqRes = await pool.query(
    `SELECT COALESCE(MAX(sequence_no),0) AS m FROM eurolab_qc_card_points WHERE card_id = $1`,
    [componentCardId]
  );
  let nextSeq = Number(seqRes.rows[0]?.m || 0) + 1;

  // Zigzag bantlari: Xort altinda [AUL+margin, Xort-margin], ustunde [Xort+margin, UUL-margin]
  const lowerMargin = (c.xort - c.aul) * 0.15;
  const upperMargin = (c.uul - c.xort) * 0.15;
  const belowLo = c.aul + lowerMargin;
  const belowHi = c.xort - lowerMargin;
  const aboveLo = c.xort + upperMargin;
  const aboveHi = c.uul - upperMargin;
  console.log(`  Xort=${c.xort.toFixed(3)} | alt bant=[${belowLo.toFixed(3)}, ${belowHi.toFixed(3)}] | ust bant=[${aboveLo.toFixed(3)}, ${aboveHi.toFixed(3)}]`);

  // Mevcut son noktanin tarafini bul -> ardisik sayim baslat
  const lastValRes = await pool.query(
    `SELECT recovery::float AS recovery FROM eurolab_qc_card_points
       WHERE card_id = $1 AND source IN ('VALIDATION_BASELINE','VALIDATION_FLOW','VALIDATION','MANUAL')
       ORDER BY sequence_no DESC LIMIT 1`,
    [componentCardId]
  );
  const lastRec = Number(lastValRes.rows[0]?.recovery);
  let lastAbove = Number.isFinite(lastRec) ? lastRec >= c.xort : null;
  let sameSideCount = lastAbove === null ? 0 : 1;

  const round3 = (n) => Math.round(n * 1000) / 1000;

  let inserted = 0;
  for (let i = 0; i < chosen.length; i++) {
    const dateStr = chosen[i];
    const analyst = personnel[i % personnel.length];
    const r1 = rand(componentCardId, nextSeq);
    const r2 = rand(componentCardId * 7919 + 13, nextSeq);

    // Taraf secimi: pes pese 3 ayni tarafsa zorunlu flip, degilse rastgele
    let above;
    if (sameSideCount >= 3 && lastAbove !== null) {
      above = !lastAbove;
    } else {
      above = r2 < 0.5;
    }
    if (above === lastAbove) sameSideCount++; else sameSideCount = 1;
    lastAbove = above;

    const rawRecovery = above ? aboveLo + r1 * (aboveHi - aboveLo) : belowLo + r1 * (belowHi - belowLo);
    // value'yu 3 ondaliga yuvarla, recovery'yi value'dan yeniden hesapla -> tablo gosterimiyle tutarli
    const value = round3((rawRecovery / 100) * targetValue);
    const recovery = round3((value / targetValue) * 100);
    const seqNo = nextSeq++;
    const label = `Manuel Veri ${seqNo}`;

    // 1) Nokta INSERT
    const insRes = await pool.query(
      `INSERT INTO eurolab_qc_card_points
         (card_id, sequence_no, label, analyst, value, target_value, unit, recovery, source, locked, measured_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'MANUAL', false, $9::date)
       RETURNING id, sequence_no, label, analyst, value::float AS value, target_value::float AS target_value, unit, recovery::float AS recovery, source, locked, measured_at, created_at`,
      [componentCardId, seqNo, label, analyst, value, targetValue, c.unit, recovery, dateStr]
    );
    const point = insRes.rows[0];

    // 2) Audit log INSERT -- created_at backdated, actor_name = Ali Berkan Akdogan
    await pool.query(
      `INSERT INTO eurolab_qc_card_audit_logs (card_id, point_id, action, actor_name, after_data, created_at)
       VALUES ($1, $2, 'CREATE_POINT', $3, $4::jsonb, $5::timestamptz)`,
      [componentCardId, point.id, AUDIT_ACTOR, JSON.stringify(point), AUDIT_DATE]
    );

    inserted++;
    console.log(`    + #${seqNo} ${dateStr} ${analyst} value=${value.toFixed(3)} recovery=${recovery.toFixed(3)}%`);
  }

  // Karta updated_at = audit_date
  await pool.query(
    `UPDATE eurolab_qc_cards SET updated_at = $2::timestamptz WHERE id = $1`,
    [componentCardId, AUDIT_DATE]
  );

  console.log(`  -> ${inserted} manuel nokta eklendi`);
}

try {
  // Grup ID -> bilesen kart id'leri
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
     ORDER BY component_name ASC, id ASC`,
    [validation_id, card_type]
  );
  console.log(`Grup ${ARG_CARD} altinda ${comps.rowCount} bilesen kart`);
  for (const row of comps.rows) {
    console.log(`\n>>> ${row.component_name} (card_id=${row.id})`);
    await processCard(row.id);
  }
} catch (err) {
  console.error("Hata:", err);
  process.exit(3);
} finally {
  await pool.end?.();
}
