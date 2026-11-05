const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const UNIQUE_SIGNATURE_TEXT = "Saygılarımla,\n\nOğuzhan EKER\nManaging Director\n\nMobile: +90 (551) 734 13 04\nWeb: www.uniqueanalyse.com\nAdress: Atatürk Mahallesi Hadımköy Yolu Cad. No:10 / 7 Esenyurt, İstanbul";

/** Inline styles and a CID logo also work in Outlook; preview uses the same markup. */
export function uniqueMailSignatureHtml(logoSrc = "/unique-logo.png") {
  return `<div style="font-family:Tahoma,Arial,sans-serif;font-size:10pt;line-height:1.4;color:#000;text-align:left">
<div style="color:#5542ff;margin-bottom:16px">Saygılarımla,</div>
<div><strong>Oğuzhan EKER</strong></div>
<div style="color:#5542ff">Managing Director</div>
<div style="margin-top:16px"><strong style="color:#5542ff;letter-spacing:.4px">Mobile:</strong> +90 (551) 734 13 04</div>
<div><strong style="color:#5542ff;letter-spacing:.4px">Web:</strong> <a href="https://www.uniqueanalyse.com" style="color:#28788c;text-decoration:underline">www.uniqueanalyse.com</a></div>
<div><strong style="color:#5542ff;letter-spacing:.4px">Adress:</strong> Atatürk Mahallesi Hadımköy Yolu Cad. No:10 / 7 Esenyurt, İstanbul</div>
<div style="margin-top:18px"><img src="${esc(logoSrc)}" alt="UNIQUE ANALYSE" width="320" style="display:block;width:320px;max-width:100%;height:auto;border:0"></div>
</div>`;
}
export function uniqueReplyHtml(body: string) {
  return `<div style="font-family:Tahoma,Arial,sans-serif;font-size:10pt;line-height:1.5;color:#000"><div style="white-space:pre-wrap">${esc(body.trim())}</div><div style="margin-top:20px">${uniqueMailSignatureHtml("cid:unique-mail-signature")}</div></div>`;
}
