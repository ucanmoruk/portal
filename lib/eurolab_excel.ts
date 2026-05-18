import * as XLSX from "xlsx";

export type SheetRow = Record<string, unknown>;

export function normalizeExcelHeader(value: string) {
    return value
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/ı/g, "i")
        .replace(/ğ/g, "g")
        .replace(/ü/g, "u")
        .replace(/ş/g, "s")
        .replace(/ö/g, "o")
        .replace(/ç/g, "c")
        .replace(/[^a-z0-9]/g, "");
}

export function getExcelCell(row: SheetRow, aliases: string[]) {
    const normalizedAliases = aliases.map(normalizeExcelHeader);
    const entry = Object.entries(row).find(([key]) => normalizedAliases.includes(normalizeExcelHeader(key)));
    const value = entry?.[1];
    return value === null || value === undefined ? "" : String(value).trim();
}

export function parseWorkbookRows(buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) return [];
    return XLSX.utils.sheet_to_json<SheetRow>(firstSheet, { defval: "", raw: false });
}

export function createTemplateWorkbook(sheetName: string, headers: string[], rows: Array<Record<string, string>>) {
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    worksheet["!cols"] = headers.map(header => ({ wch: Math.max(14, header.length + 4) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function excelResponse(buffer: Buffer, filename: string) {
    return new Response(new Uint8Array(buffer), {
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    });
}
