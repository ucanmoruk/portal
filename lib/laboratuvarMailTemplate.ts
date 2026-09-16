export const escapeMailHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export type LaboratoryMailBrand = { name: string; address: string; email: string; web: string };
export function laboratoryMailBrand(settings: Record<string, string> = {}): LaboratoryMailBrand {
  const get = (key: string, fallback = "") => settings[key] || process.env[key] || fallback;
  return { name: get("SIRKET_ADI", "UNIQUE Analiz"), address: get("SIRKET_ADRES"), email: get("SIRKET_EMAIL"), web: get("SIRKET_WEB") };
}

// Both laboratory mail flows share the report mail's typography, logo and layout.
export function renderLaboratoryMail({ brand, title, message, intro, headings, rows, note, logoSrc = "cid:unique-logo" }: {
  brand: LaboratoryMailBrand; title: string; message: string; intro: string;
  headings: string[]; rows: string[][]; note: string; logoSrc?: string;
}) {
  const esc = escapeMailHtml;
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>${esc(brand.name)} — ${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;">
  <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;">
    <div style="padding:24px 28px;border-bottom:1px solid #eaeaea;">
      <img src="${esc(logoSrc)}" alt="${esc(brand.name)}" style="height:32px;display:block;"/>
    </div>
    <div style="padding:28px;">
      <h2 style="margin:0 0 16px 0;font-size:18px;color:#1d1d1f;font-weight:700;">${esc(title)}</h2>
      ${message ? `<p style="margin:0 0 16px 0;color:#1d1d1f;line-height:1.6;white-space:pre-wrap;">${esc(message)}</p>` : ""}
      <p style="margin:0 0 12px 0;color:#86868b;font-size:14px;">${esc(intro)}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #eaeaea;border-radius:8px;overflow:hidden;font-size:13px;">
        <thead><tr style="background:#ffffff;">${headings.map(h => `<th style="padding:8px 10px;text-align:left;color:#6e6e73;font-weight:600;border-bottom:1px solid #eaeaea;">${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(row => `<tr>${row.map((cell, i) => `<td style="padding:6px 10px;border-bottom:1px solid #eaeaea;color:#1d1d1f;vertical-align:top;overflow-wrap:anywhere;${i === 0 ? "font-weight:600;" : ""}">${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
      <p style="margin:18px 0 0 0;font-size:12px;color:#86868b;">${note}</p>
    </div>
    <div style="padding:18px 28px;background:#ffffff;border-top:1px solid #eaeaea;font-size:12px;color:#86868b;">
      <strong style="color:#1d1d1f;">${esc(brand.name)}</strong><br/>
      ${brand.address ? esc(brand.address) + "<br/>" : ""}
      ${brand.email ? `<a href="mailto:${esc(brand.email)}" style="color:#0071e3;text-decoration:none;">${esc(brand.email)}</a>` : ""}
      ${brand.web ? ` · <a href="${esc(brand.web)}" style="color:#0071e3;text-decoration:none;">${esc(brand.web)}</a>` : ""}
    </div>
  </div>
</body></html>`;
}
