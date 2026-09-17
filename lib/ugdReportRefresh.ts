function tableKind(table: string): string | null {
  const headings = [...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)]
    .map(match => match[1].replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim());
  const first = headings[0] || "";
  if (/^(Tedarikçi \/ Dağıtıcı Firma|Supplier \/ Distributor Company|Company)$/i.test(first)
    && headings.some(label => /^(Adresi?|Address)$/i.test(label))
    && headings.some(label => /^(Telefon|Phone)$/i.test(label))) return "supplier";
  if (/^(Bileşen|COMPONENT)$/i.test(first) && headings.includes("SED")) return "formula";
  if (/^INCI Name$/i.test(first) && headings.some(label => /EINECS\/ELICS/i.test(label))) return "allergens";
  if (/^INCI Name$/i.test(first) && headings.some(label => /koruyucular|preservatives|Max Concentration in Final Product/i.test(label))) return "preservatives";
  if (headings.some(label => /Proof of Qualification of the Safety Assessor/i.test(label))) return "assessor";
  return null;
}

/** Refresh derived data in existing editor HTML while preserving narrative edits. */
export function refreshUgdReportHtml(editedHtml: string, generatedHtml: string, cpsr: boolean): string {
  if (!editedHtml) return generatedHtml;
  const fresh = new Map<string, string>();
  for (const match of generatedHtml.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const kind = tableKind(match[0]);
    if (kind && (kind !== "assessor" || cpsr)) fresh.set(kind, match[0]);
  }
  const companyPattern = /<div\b[^>]*class=["'][^"']*\bcompany\b[^"']*["'][^>]*>[\s\S]*?<\/div>/gi;
  const company = generatedHtml.match(companyPattern)?.[0];
  const refreshed = company ? editedHtml.replace(companyPattern, () => company) : editedHtml;
  return refreshed.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, table => {
    const kind = tableKind(table);
    return kind ? fresh.get(kind) || table : table;
  });
}
