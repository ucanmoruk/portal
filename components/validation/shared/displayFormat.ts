// Validasyon formları için ortak görüntü formatlama yardımcısı.
//
// Veri giriş tablolarında uzun ondalıklı kullanıcı girdileri (`0,2022585`)
// hücreye odaklanmadığında 3 hane görünür: `0,202`.
//
// ÖNEMLİ: Bu fonksiyon SADECE gösterim içindir.
//   • Form state'inde ham değer durur
//   • Hesaplamalar ham değerle yapılır
//   • DB'ye ham değer yazılır
//
// Kullanım deseni (her formda):
//   const [focusedKey, setFocusedKey] = useState<string | null>(null);
//   const cellKey = `${ix}-${ix2}`;
//   const shown = focusedKey === cellKey ? rawValue : formatForDisplay(rawValue, 3);
//   <Input
//     value={shown}
//     onFocus={() => setFocusedKey(cellKey)}
//     onBlur={() => setFocusedKey(p => p === cellKey ? null : p)}
//     ...
//   />

/**
 * Ham değeri görüntü için yuvarlar. Yalnız sayısal bir string verilirse
 * Türkçe virgül formatında belirtilen hane sayısıyla döner; aksi halde
 * ham değeri olduğu gibi geri verir.
 */
export const formatForDisplay = (raw: string | null | undefined, digits = 3): string => {
    const text = String(raw ?? "").trim();
    if (!text) return "";
    // Sadece sayısal görünen değeri yuvarla; metin/etiket dokunulmaz
    if (!/^[-+]?\d+([.,]\d+)?$/.test(text)) return text;
    const parsed = Number(text.replace(",", "."));
    if (!Number.isFinite(parsed)) return text;
    return parsed.toFixed(digits).replace(".", ",");
};
