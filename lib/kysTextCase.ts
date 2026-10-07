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
