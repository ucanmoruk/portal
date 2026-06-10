// Tüm validasyonların moduleData içindeki repeatabilityLimit alanını
// 2.83·Sr → 2.8·Sr formülüne göre yeniden hesapla.
//
// DOKUNULMAYAN: stdDev, mean, n, rsdr, rsdrPoolPart, variance, grubbs,
//                pooledRsd, fTest, fCritical, values, vs.
//
// DEĞİŞEN: SADECE repeatabilityLimit alanı (mevcut yapı korunur).

import { createPool } from '@vercel/postgres';

const pool = createPool({ connectionString: process.env.EUROLAB_POSTGRES_URL });

const FACTOR_NEW = 2.8;
const FACTOR_OLD = 2.83;

let totalValidations = 0;
let totalRepeatabilityChanges = 0;
let totalReproducibilityChanges = 0;
const auditLog = [];

function recalcRepeatability(repMap) {
    if (!repMap || typeof repMap !== 'object') return { changed: 0, next: repMap };
    let changed = 0;
    const nextMap = {};
    for (const [comp, data] of Object.entries(repMap)) {
        if (!data || typeof data !== 'object') { nextMap[comp] = data; continue; }
        const nextLevels = Array.isArray(data.levels) ? data.levels.map(level => {
            if (!level || typeof level !== 'object') return level;
            const analysts = level.analysts;
            if (!analysts || typeof analysts !== 'object') return level;
            const nextAnalysts = {};
            for (const [analyst, stat] of Object.entries(analysts)) {
                if (!stat || typeof stat !== 'object') { nextAnalysts[analyst] = stat; continue; }
                const sd = Number(stat.stdDev);
                if (Number.isFinite(sd)) {
                    const old = stat.repeatabilityLimit;
                    const next = FACTOR_NEW * sd;
                    if (old !== next) {
                        changed++;
                        auditLog.push({ scope: 'REPEAT', comp, level: level.key || level.label, analyst, stdDev: sd, oldR: old, newR: next });
                    }
                    nextAnalysts[analyst] = { ...stat, repeatabilityLimit: next };
                } else {
                    nextAnalysts[analyst] = stat;
                }
            }
            return { ...level, analysts: nextAnalysts };
        }) : data.levels;
        nextMap[comp] = { ...data, levels: nextLevels };
    }
    return { changed, next: nextMap };
}

function recalcReproducibility(rprMap) {
    if (!rprMap || typeof rprMap !== 'object') return { changed: 0, next: rprMap };
    let changed = 0;
    const nextMap = {};
    for (const [comp, data] of Object.entries(rprMap)) {
        if (!data || typeof data !== 'object') { nextMap[comp] = data; continue; }
        const result = data.result;
        if (!result || typeof result !== 'object' || !result.analystStats) {
            nextMap[comp] = data;
            continue;
        }
        const nextStats = {};
        for (const [analyst, stat] of Object.entries(result.analystStats)) {
            if (!stat || typeof stat !== 'object') { nextStats[analyst] = stat; continue; }
            const sd = Number(stat.stdDev);
            if (Number.isFinite(sd)) {
                const old = stat.repeatabilityLimit;
                const next = FACTOR_NEW * sd;
                if (old !== next) {
                    changed++;
                    auditLog.push({ scope: 'REPRO', comp, analyst, stdDev: sd, oldR: old, newR: next });
                }
                nextStats[analyst] = { ...stat, repeatabilityLimit: next };
            } else {
                nextStats[analyst] = stat;
            }
        }
        nextMap[comp] = { ...data, result: { ...result, analystStats: nextStats } };
    }
    return { changed, next: nextMap };
}

const DRY_RUN = process.argv.includes('--apply') ? false : true;

const all = await pool.query(`
    SELECT id, code, config
    FROM eurolab_validations
    WHERE config->'moduleData' ? 'PRECISION_REPEATABILITY'
       OR config->'moduleData' ? 'PRECISION_REPRODUCIBILITY'
    ORDER BY id
`);

for (const row of all.rows) {
    const config = row.config || {};
    const moduleData = config.moduleData || {};
    const { changed: repChanged, next: nextRep } = recalcRepeatability(moduleData.PRECISION_REPEATABILITY);
    const { changed: rprChanged, next: nextRpr } = recalcReproducibility(moduleData.PRECISION_REPRODUCIBILITY);

    if (repChanged === 0 && rprChanged === 0) continue;

    totalValidations++;
    totalRepeatabilityChanges += repChanged;
    totalReproducibilityChanges += rprChanged;

    const nextModuleData = {
        ...moduleData,
        ...(moduleData.PRECISION_REPEATABILITY ? { PRECISION_REPEATABILITY: nextRep } : {}),
        ...(moduleData.PRECISION_REPRODUCIBILITY ? { PRECISION_REPRODUCIBILITY: nextRpr } : {}),
    };
    const nextConfig = { ...config, moduleData: nextModuleData };

    console.log(`  ID ${row.id} (${row.code}): REPEAT ${repChanged}, REPRO ${rprChanged}`);

    if (!DRY_RUN) {
        await pool.query(
            `UPDATE eurolab_validations SET config = $1::jsonb WHERE id = $2`,
            [JSON.stringify(nextConfig), row.id]
        );
    }
}

console.log('');
console.log(DRY_RUN ? '=== DRY RUN (uygulanmadı) ===' : '=== UYGULANDI ===');
console.log('Etkilenen validasyon sayısı:', totalValidations);
console.log('Repeatability güncellenen alan:', totalRepeatabilityChanges);
console.log('Reproducibility güncellenen alan:', totalReproducibilityChanges);
console.log('Toplam güncellenen alan:', totalRepeatabilityChanges + totalReproducibilityChanges);

// Bir doğrulama: ilk 3 örnek
console.log('');
console.log('İlk 3 örnek değişim (eski → yeni):');
for (const entry of auditLog.slice(0, 3)) {
    const ratio = entry.oldR ? (entry.newR / entry.oldR).toFixed(6) : '—';
    console.log(`  [${entry.scope}] ${entry.comp.substring(0,40)} | analyst=${entry.analyst} | Sr=${entry.stdDev.toExponential(4)} | r: ${entry.oldR?.toExponential(4)} → ${entry.newR.toExponential(4)} | oran=${ratio} (beklenen ≈ ${(FACTOR_NEW/FACTOR_OLD).toFixed(6)})`);
}

process.exit(0);
