const normalizePersonnelName = (value: string) =>
    value
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c");

export function sanitizeMethodPersonnel(personnel: unknown) {
    const rows = Array.isArray(personnel) ? personnel : [];
    return rows
        .map(item => String(item || "").trim())
        .filter(Boolean)
        .filter(name => {
            const normalized = normalizePersonnelName(name);
            return !(normalized.includes("ahmet") && normalized.includes("yilmaz"));
        });
}

export function sanitizeMethodRow<T extends { personnel?: unknown }>(row: T) {
    return {
        ...row,
        personnel: sanitizeMethodPersonnel(row.personnel),
    };
}
