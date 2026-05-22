// ─────────────────────────────────────────────────────────────────────────────
// MIGRATION: Lineerite belirsizliğini yeniden hesapla
//
// Tüm validasyonların moduleData.LINEARITY[component] kayıtlarını dolaşır ve:
//   - n alanı                → effectiveN = nLevels × pCount  (yeni formül)
//   - inverseN               → 1 / effectiveN
//   - uncertaintyFactor      → sqrt(1/pCount + 1/effectiveN + coDeltaOverSxx)
//   - uCo                    → sOverB1 × uncertaintyFactor
//   - rsdUCo                 → |uCo / co| × 100
//
// HAM VERİLER (rows, slope, intercept, rSquared, standardDeviation, sxx vb.)
// DEĞİŞTİRİLMEZ. Sadece belirsizlik propagation alanları yeniden hesaplanır.
//
// Kullanım: POST /api/eurolab/validations/recalculate-linearity
//   curl -X POST -b "next-auth.session-token=..." \
//        http://localhost:3000/api/eurolab/validations/recalculate-linearity
//
// Sonuç: { updated: N, skipped: M, errors: [...] }
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasEurolabDatabaseConfig, query } from "@/lib/db_eurolab";

interface LinearityStatistics {
    rows?: unknown[];
    intercept?: number;
    slope?: number;
    standardDeviation?: number;
    co?: number;
    cort?: number;
    p?: number;
    n?: number;
    nLevels?: number;
    inverseP?: number;
    inverseN?: number;
    sOverB1?: number;
    sxx?: number;
    coDeltaOverSxx?: number;
    uncertaintyFactor?: number;
    uCo?: number;
    rsdUCo?: number;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Number(value.replace(",", "."));
        return Number.isFinite(parsed) ? parsed : Number.NaN;
    }
    return Number.NaN;
}

interface RecalculateResult {
    changed: boolean;
    newN?: number;
    newRsd?: number;
}

// Lineerite statistics objesini in-place günceller. true dönerse veriler değişti.
function recalculateLinearity(record: Record<string, unknown>): RecalculateResult {
    const stats = record.statistics as LinearityStatistics | undefined;
    if (!stats || typeof stats !== "object") return { changed: false };

    const pCount = Math.max(1, asNumber(stats.p) || 1);
    // Önceki kayıtlarda n = points.length (level başına 1 entry varsayımıyla)
    // veya n = nLevels (yeni format). Her durumda nLevels = orijinal level sayısı.
    let nLevels = asNumber(stats.nLevels);
    if (!Number.isFinite(nLevels) || nLevels <= 0) {
        // Eski format: stats.n level sayısıydı. effectiveN tahmini:
        //   - Eğer stats.n already > points → muhtemelen effectiveN olarak yazılmış (zaten güncellenmiş)
        //   - Aksi halde stats.n level sayısıdır
        const rawN = asNumber(stats.n);
        const rowCount = Array.isArray(stats.rows) ? stats.rows.length : 0;
        if (Number.isFinite(rawN) && rawN > 0) {
            // Heuristic: rawN > rowCount * (pCount - 0.5) → muhtemelen zaten effectiveN
            if (rowCount > 0 && rawN >= rowCount * pCount) {
                nLevels = rowCount;
            } else if (Number.isFinite(rawN) && rawN > 0) {
                nLevels = rawN;
            } else {
                nLevels = rowCount || 1;
            }
        } else {
            nLevels = rowCount || 1;
        }
    }

    const effectiveN = nLevels * pCount;
    if (!Number.isFinite(effectiveN) || effectiveN <= 0) return { changed: false };

    const sxx = asNumber(stats.sxx);
    const co = asNumber(stats.co);
    const cort = asNumber(stats.cort);
    const sOverB1 = asNumber(stats.sOverB1);
    // coDeltaOverSxx = (co - cort)^2 / sxx (mevcut değeri kullan veya yeniden hesapla)
    let coDeltaOverSxx = asNumber(stats.coDeltaOverSxx);
    if (!Number.isFinite(coDeltaOverSxx) && Number.isFinite(co) && Number.isFinite(cort) && Number.isFinite(sxx) && sxx !== 0) {
        coDeltaOverSxx = Math.pow(co - cort, 2) / sxx;
    }
    const coDeltaTerm = Number.isFinite(coDeltaOverSxx) ? coDeltaOverSxx : 0;
    const uncertaintyFactor = Math.sqrt((1 / pCount) + (1 / effectiveN) + coDeltaTerm);
    const uCo = Number.isFinite(sOverB1) ? sOverB1 * uncertaintyFactor : Number.NaN;
    const rsdUCo = (Number.isFinite(uCo) && Number.isFinite(co) && co !== 0)
        ? Math.abs((uCo / co) * 100)
        : Number.NaN;

    // Güncellemeyi uygula
    stats.n = effectiveN;
    stats.nLevels = nLevels;
    stats.inverseN = 1 / effectiveN;
    stats.uncertaintyFactor = uncertaintyFactor;
    if (Number.isFinite(uCo)) stats.uCo = uCo;
    if (Number.isFinite(rsdUCo)) stats.rsdUCo = rsdUCo;

    return { changed: true, newN: effectiveN, newRsd: rsdUCo };
}

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasEurolabDatabaseConfig()) {
        return NextResponse.json({ error: "Eurolab DB yapılandırması yok." }, { status: 500 });
    }

    let updated = 0;
    let skipped = 0;
    const errors: Array<{ id: number; message: string }> = [];
    const details: Array<{ id: number; code: string; component: string; newN: number; newRsd: number }> = [];

    try {
        const res = await query(
            `SELECT id, code, config FROM eurolab_validations WHERE config ? 'moduleData'`,
            [],
        ) as { rows: Array<{ id: number; code: string; config: unknown }> };
        for (const row of res.rows) {
            try {
                const config = asRecord(row.config);
                const moduleData = asRecord(config.moduleData);
                const linearity = asRecord(moduleData.LINEARITY);
                let anyChange = false;
                for (const [componentName, value] of Object.entries(linearity)) {
                    const componentRecord = asRecord(value);
                    const result = recalculateLinearity(componentRecord);
                    if (result.changed) {
                        anyChange = true;
                        details.push({
                            id: row.id,
                            code: row.code,
                            component: componentName,
                            newN: result.newN ?? 0,
                            newRsd: result.newRsd ?? 0,
                        });
                    }
                }

                if (anyChange) {
                    await query(
                        `UPDATE eurolab_validations SET config = $1::jsonb WHERE id = $2`,
                        [JSON.stringify(config), row.id],
                    );
                    updated += 1;
                } else {
                    skipped += 1;
                }
            } catch (innerErr) {
                errors.push({
                    id: row.id,
                    message: innerErr instanceof Error ? innerErr.message : "Bilinmeyen hata",
                });
            }
        }

        return NextResponse.json({ updated, skipped, errors, details });
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Migration başarısız." }, { status: 500 });
    }
}

// GET = preview (yazma yapmadan ne değişeceğini gösterir)
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (!hasEurolabDatabaseConfig()) {
        return NextResponse.json({ error: "Eurolab DB yapılandırması yok." }, { status: 500 });
    }

    const details: Array<{ id: number; code: string; component: string; oldN: number; oldRsd: number; newN: number; newRsd: number }> = [];

    try {
        const res = await query(
            `SELECT id, code, config FROM eurolab_validations WHERE config ? 'moduleData'`,
            [],
        ) as { rows: Array<{ id: number; code: string; config: unknown }> };
        for (const row of res.rows) {
            const config = asRecord(row.config);
            const moduleData = asRecord(config.moduleData);
            const linearity = asRecord(moduleData.LINEARITY);
            for (const [componentName, value] of Object.entries(linearity)) {
                const componentRecord = asRecord(value);
                const statsBefore = asRecord(componentRecord.statistics);
                const oldN = asNumber(statsBefore.n);
                const oldRsd = asNumber(statsBefore.rsdUCo);
                // Clone for preview
                const cloned = JSON.parse(JSON.stringify(componentRecord));
                const result = recalculateLinearity(cloned);
                if (result.changed) {
                    details.push({
                        id: row.id,
                        code: row.code,
                        component: componentName,
                        oldN: Number.isFinite(oldN) ? oldN : 0,
                        oldRsd: Number.isFinite(oldRsd) ? oldRsd : 0,
                        newN: result.newN ?? 0,
                        newRsd: result.newRsd ?? 0,
                    });
                }
            }
        }

        return NextResponse.json({ count: details.length, details });
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Preview başarısız." }, { status: 500 });
    }
}
