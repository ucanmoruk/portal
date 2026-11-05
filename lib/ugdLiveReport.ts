export type LiveReportSection = { key: string; title: string; html: string };
export type LiveReportRange = { key: string; title: string; start: number; end: number };

/** Store the HTML once; section ranges also cover embedded photographs. */
export function packLiveReport(sections: LiveReportSection[], bodyHtml = "") {
  const joined = sections.map(section => section.html).join("");
  const body = bodyHtml || joined;
  const source = sections.length && joined === body ? sections : [{ key: "s1", title: "Kaydedilen rapor", html: body }];
  let offset = 0;
  const ranges: LiveReportRange[] = source.map(section => {
    const start = offset; offset += section.html.length;
    return { key: section.key, title: section.title, start, end: offset };
  });
  return { bodyHtml: body, sections: ranges };
}

/** Read both compact snapshots and historical SectionsJson containing duplicate HTML. */
export function restoreLiveReportSections(body: string, value: unknown): LiveReportSection[] {
  if (Array.isArray(value) && value.length) {
    const rows = value as Record<string, unknown>[];
    if (rows.every(row => row && typeof row.html === "string") && rows.map(row => row.html).join("") === body) {
      return rows.map((row, i) => ({ key: String(row.key || `s${i + 1}`), title: String(row.title || "Rapor"), html: String(row.html) }));
    }
    let end = 0;
    const valid = rows.every(row => {
      if (!row || !Number.isInteger(row.start) || !Number.isInteger(row.end) || row.start !== end || Number(row.end) < end || Number(row.end) > body.length) return false;
      end = Number(row.end); return true;
    });
    if (valid && end === body.length) return rows.map((row, i) => ({ key: String(row.key || `s${i + 1}`), title: String(row.title || "Rapor"), html: body.slice(Number(row.start), Number(row.end)) }));
  }
  return body ? [{ key: "s1", title: "Kaydedilen rapor", html: body }] : [];
}
export function liveReportDocument(head: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8" />${head}</head><body><div class="WordSection1">${body}</div></body></html>`;
}
