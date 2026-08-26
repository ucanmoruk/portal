// Zengin metin editöründen gelen HTML'i sunucu tarafında temizler.
// Doküman içeriği DB'ye yazılmadan önce buradan geçer; kayıtlı XSS'i önler.
// Beyaz liste dışındaki etiketler kaldırılır, içerikleri korunur.

const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "span", "div",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "small", "code", "pre", "blockquote",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "a", "img", "figure", "figcaption",
]);

// İçeriğiyle birlikte tamamen silinecek etiketler
const DANGEROUS = "script|style|iframe|object|embed|noscript|template|svg|math|form|input|button|select|textarea";
const DROP_WITH_CONTENT = new RegExp(`<(${DANGEROUS})\\b[\\s\\S]*?<\\/\\1\\s*>`, "gi");
const DROP_SELF_CLOSING = new RegExp(`<\\/?(?:${DANGEROUS})\\b[^>]*>`, "gi");

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  "*": new Set(["id", "class", "style", "colspan", "rowspan", "align", "title"]),
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height"]),
  col: new Set(["span", "width"]),
  td: new Set(["headers", "scope"]),
  th: new Set(["headers", "scope"]),
};

// style içinde sadece güvenli, düzenle ilgili özelliklere izin ver
const ALLOWED_STYLE_PROPS = new Set([
  "width", "height", "min-width", "max-width", "text-align", "vertical-align",
  "background-color", "color", "font-weight", "font-style", "text-decoration",
  "padding", "margin", "font-family",
]);

// font-family değerleri sadece harf, rakam, boşluk, tire, virgül ve tırnak içerebilir
const SAFE_FONT_FAMILY = /^[a-z0-9 ,'"._-]+$/i;

function sanitizeStyle(value: string): string {
  return value
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => {
      const [prop, ...rest] = part.split(":");
      const val = rest.join(":").toLowerCase();
      if (!prop || !val) return false;
      const propName = prop.trim().toLowerCase();
      if (!ALLOWED_STYLE_PROPS.has(propName)) return false;
      if (propName === "font-family" && !SAFE_FONT_FAMILY.test(val)) return false;
      // url(), expression(), javascript: gibi kaçış yollarını kapat
      return !/url\s*\(|expression\s*\(|javascript:|@import/.test(val);
    })
    .join("; ");
}

// HTML entity'lerini çöz — tarayıcı attribute değerini çözerek yorumlar, bu yüzden
// şema kontrolünden ÖNCE çözmek şart ("jav&#9;ascript:" -> "jav\tascript:").
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);?/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n")
    .replace(/&colon;/gi, ":")
    .replace(/&amp;/gi, "&");
}

function safeUrl(value: string, allowData: boolean): string | null {
  const url = value.trim();
  if (!url) return null;

  // Entity'leri çöz (iç içe kaçışlar için birkaç tur) + boşluk/kontrol karakterlerini at
  let normalized = decodeEntities(url);
  for (let i = 0; i < 3 && /&#|&amp;|&colon;|&tab;/i.test(normalized); i += 1) {
    normalized = decodeEntities(normalized);
  }
  normalized = normalized.replace(/[\u0000-\u0020\u00a0\u2000-\u200f\ufeff]/g, "").toLowerCase();

  // Kara liste değil BEYAZ liste: sadece bilinen güvenli şemalar ve göreli adresler
  const schemeMatch = normalized.match(/^([a-z][a-z0-9+.\-]*):/);
  if (!schemeMatch) return url; // göreli adres (/, #, ./, dosya adı) — güvenli

  const scheme = schemeMatch[1];
  if (scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel") return url;
  if (scheme === "data") {
    if (!allowData) return null; // sadece <img src> için
    return /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=]+$/i.test(normalized) ? url : null;
  }
  return null; // javascript:, vbscript:, file:, ve bilinmeyen her şey
}

function sanitizeAttributes(tag: string, attrText: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  const global = ALLOWED_ATTRS["*"];
  const out: string[] = [];
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))|([a-zA-Z_:][-a-zA-Z0-9_:.]*)/g;

  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(attrText))) {
    const name = (match[1] || match[6] || "").toLowerCase();
    if (!name) continue;
    // on* event handler'ları asla geçmez
    if (name.startsWith("on")) continue;
    if (!allowed?.has(name) && !global.has(name)) continue;

    let value = match[3] ?? match[4] ?? match[5] ?? "";
    if (name === "style") {
      value = sanitizeStyle(value);
      if (!value) continue;
    } else if (name === "href" || name === "src") {
      const url = safeUrl(value, name === "src" && tag === "img");
      if (!url) continue;
      value = url;
    }
    out.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
  }

  // Dış bağlantılar için güvenli rel
  if (tag === "a" && out.some(a => a.startsWith("target=")) && !out.some(a => a.startsWith("rel="))) {
    out.push('rel="noopener noreferrer"');
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

/** Doküman HTML'ini beyaz listeye göre temizler. */
export function sanitizeDocumentHtml(input: unknown): string {
  let html = String(input ?? "");
  if (!html.trim()) return "";

  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(DROP_WITH_CONTENT, "");
  html = html.replace(DROP_SELF_CLOSING, "");

  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)\/?>/g, (full, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (full.startsWith("</")) return `</${tag}>`;
    const selfClosing = /^(br|hr|img|col)$/.test(tag);
    return `<${tag}${sanitizeAttributes(tag, attrs)}${selfClosing ? " /" : ""}>`;
  });

  return html.trim();
}

/** HTML'den düz metin çıkarır (arama/özet için). */
export function htmlToPlainText(input: unknown): string {
  return String(input ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
