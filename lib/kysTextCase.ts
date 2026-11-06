export type TextCaseMode = "lower" | "upper" | "sentence";

/** Shared state keeps sentence capitalization consistent across inline formatting. */
export function convertTextCase(text: string, mode: TextCaseMode, state = { sentenceStart: true }): string {
  if (mode === "lower") return text.toLocaleLowerCase("tr-TR");
  if (mode === "upper") return text.toLocaleUpperCase("tr-TR");
  const characters = Array.from(text.toLocaleLowerCase("tr-TR"));
  return characters.map((character, index) => {
    if (/[\p{L}]/u.test(character)) {
      const result = state.sentenceStart ? character.toLocaleUpperCase("tr-TR") : character;
      state.sentenceStart = false;
      return result;
    }
    if (/[!?\n]/.test(character) || (character === "." && !( /\d/.test(characters[index - 1] || "") && /\d/.test(characters[index + 1] || "")))) {
      state.sentenceStart = true;
    }
    return character;
  }).join("");
}

/** Heading-only casing; shared state preserves words split by inline formatting. */
export function formatProcedureHeadingText(text: string, level: 2 | 3 | 4, state = { wordStart: true }): string {
  if (level === 2) return text.toLocaleUpperCase("tr-TR");
  return Array.from(text.toLocaleLowerCase("tr-TR")).map(character => {
    if (/\p{L}/u.test(character)) {
      const result = state.wordStart ? character.toLocaleUpperCase("tr-TR") : character;
      state.wordStart = false;
      return result;
    }
    // Apostrophes and inline formatting do not start another word.
    if (/[\s\-–—/()]/u.test(character)) state.wordStart = true;
    return character;
  }).join("");
}

/** Normalize only numbered procedure headings, preserving tags, attributes and body text. */
export function normalizeProcedureHeadingCase(html: string, documentType: string): string {
  if (documentType !== "Prosedür" && documentType !== "Talimat") return html;
  return html.replace(/(<h[2-4]\b[^>]*>)([\s\S]*?)(<\/h[2-4]>)/gi, (original, open: string, inner: string, close: string) => {
    const title = inner.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/gi, " ");
    const number = title.trim().match(/^(\d+(?:\.\d+)*)(?:\.|\s|$)/)?.[1];
    if (!number) return original;
    const level = number.includes(".") ? 3 : 2;
    const state = { wordStart: true };
    const converted = inner.replace(/<[^>]*>|&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);|[^<&]+/gi, token => {
      if (token.startsWith("<")) return token;
      if (token.startsWith("&")) {
        if (/^&(?:nbsp|#160|#32|#x20|#xa0);$/i.test(token)) state.wordStart = true;
        return token;
      }
      return formatProcedureHeadingText(token, level, state);
    });
    return open + converted + close;
  });
}
