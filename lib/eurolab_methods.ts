const normalizePersonnelName = (value: string) =>
    value
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/^dr\.?\s+/i, "")
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .replace(/Ä±/g, "i")
        .replace(/ÄŸ/g, "g")
        .replace(/Ã¼/g, "u")
        .replace(/ÅŸ/g, "s")
        .replace(/Ã¶/g, "o")
        .replace(/Ã§/g, "c")
        .replace(/\s+/g, " ");

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
