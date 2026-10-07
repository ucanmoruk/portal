/** Replace legacy Word spacing without overriding settings made in the editor. */
export function normalizeKysDocumentSpacing(html: string): string {
  return html.replace(/<(p|div|li|span)\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/gi, (tag, name: string, attrs: string) => {
    const normalized = attrs.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_style, quote: string, value: string) => {
      const style = value.split(";").map(part => {
        const colon = part.indexOf(":");
        if (colon < 0) return part;
        const property = part.slice(0, colon).trim().toLowerCase();
        const setting = part.slice(colon + 1).trim().toLowerCase();
        // The editor writes unitless line-height and px margins. Only old Word
        // percentages and zero physical-unit margins are migrated.
        if (property === "line-height" && /^\d+(?:\.\d+)?%$/.test(setting) && parseFloat(setting) <= 115) {
          return "line-height: 1.56";
        }
        if (property === "margin-bottom" && /^(?:0+(?:\.0+)?)(?:cm|mm|pt|in)$/.test(setting) && /^(p|div)$/i.test(name)) {
          return "margin-bottom: 9px";
        }
        return part;
      }).join(";");
      return `style=${quote}${style}${quote}`;
    });
    return normalized === attrs ? tag : `<${name}${normalized}>`;
  });
}
