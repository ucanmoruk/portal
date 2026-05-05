export type GrubbsResult = {
    n: number;
    mean: number;
    stdDev: number;
    value: number;
    index: number;
    gCalculated: number;
    gCritical: number;
    hasOutlier: boolean;
};

const GRUBBS_CRITICAL_95: Record<number, number> = {
    3: 1.153,
    4: 1.463,
    5: 1.672,
    6: 1.822,
    7: 1.938,
    8: 2.032,
    9: 2.110,
    10: 2.176,
    11: 2.234,
    12: 2.285,
    13: 2.331,
    14: 2.371,
    15: 2.409,
    16: 2.443,
    17: 2.475,
    18: 2.504,
    19: 2.532,
    20: 2.557,
    21: 2.580,
    22: 2.603,
    23: 2.624,
    24: 2.644,
    25: 2.663,
    26: 2.681,
    27: 2.698,
    28: 2.714,
    29: 2.730,
    30: 2.745,
};

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const sampleStdDev = (values: number[]) => {
    if (values.length < 2) return Number.NaN;
    const avg = mean(values);
    const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
};

const criticalForN = (n: number) => {
    if (n < 3) return Number.NaN;
    if (n <= 30) return GRUBBS_CRITICAL_95[n];
    return 2.745;
};

export const calculateGrubbs = (values: number[]): GrubbsResult | null => {
    const cleanValues = values.filter(Number.isFinite);
    if (cleanValues.length < 3) return null;

    const avg = mean(cleanValues);
    const stdDev = sampleStdDev(cleanValues);
    if (!Number.isFinite(stdDev) || stdDev === 0) return null;

    let maxIndex = 0;
    let maxDistance = -1;
    cleanValues.forEach((value, index) => {
        const distance = Math.abs(value - avg);
        if (distance > maxDistance) {
            maxDistance = distance;
            maxIndex = index;
        }
    });

    const gCalculated = maxDistance / stdDev;
    const gCritical = criticalForN(cleanValues.length);

    return {
        n: cleanValues.length,
        mean: avg,
        stdDev,
        value: cleanValues[maxIndex],
        index: maxIndex,
        gCalculated,
        gCritical,
        hasOutlier: Number.isFinite(gCritical) && gCalculated > gCritical,
    };
};
