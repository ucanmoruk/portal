// ─────────────────────────────────────────────────────────────────────────────
// Validasyon modüllerinin varsayılan açıklamaları
//
// Bu metinler:
//   • Validasyon detay sayfasındaki ilgili tab'ın Notlar/Açıklamalar alanına
//     ilk yüklemede önerilen metin olarak getirilir. Kullanıcı serbestçe
//     düzenleyebilir veya silebilir.
//   • PDF/rapor (Ek-1) içinde ilgili modülün başlığının altında gösterilir.
//
// Yeni modül eklemek istersen anahtarı + metni buraya ekle.
// ─────────────────────────────────────────────────────────────────────────────

export const VALIDATION_MODULE_DESCRIPTIONS: Record<string, string> = {
    LINEARITY: `Analiz talimatında anlatıldığı şekilde okutmalar yapılmış, kalibrasyon eğrisi oluşturulmuş ve regresyon denklemi ile korelasyon katsayısı belirlenmiştir.

Doğrusal çalışma aralığında korelasyon sabiti (R²) 0,995'den büyük olduğu ve görsel olarak doğrusal grafik oluşturduğu için kabul kriterlerine göre uygun olarak kabul edilmiştir.`,

    LOD_LOQ: `Tayin ve Tespit Limiti çalışmaları için 2 personel tarafından lineerite aralığının en düşük noktasında 10'ar adet spike test numunesi çalışılmıştır.

Elde edilen ölçüm değerlerinin ortalamaları ve standart sapmaları hesaplanmış, ortalamaya standart sapmanın 3 katı ilave edilerek LOD, 10 katı ilave edilerek LOQ olarak değerlendirilmiştir.`,

    PRECISION_REPEATABILITY: `Validasyon çalışmalarında tekrarlanabilirlik parametresi için "spike test örnekleri" kullanılmıştır.

Tekrarlanabilirlik çalışmaları, 2 analist tarafından 6'şar adet test örneği ve paralel test örneği kullanılarak, her bir analist tarafından farklı zamanlarda, en kısa süre içerisinde aynı şartlar altında ve aynı cihaz kullanılarak yukarıda belirtildiği şekilde yapılmıştır.

Elde edilen sonuçlar incelendiğinde, her bir test örneği ve paralel örnekten elde edilen analiz sonuçları farkının (x1-x2), tekrarlanabilirlik limit değerinden (r) küçük veya eşit olduğu görülmüştür.

(x1 - x2) ≤ r`,

    TRUENESS: `Geri kazanım çalışmasının değerlendirmesi aşağıda belirtilen "AOAC Manual For The Peer Verified Methods Program Analyte - Recovery Table" tablosuna göre yapılmıştır.`,

    PRECISION_REPRODUCIBILITY: `Laboratuvar içi tekrarüretilebilirlik çalışması farklı çalışanlar tarafından, aynı cihaz kullanılarak, farklı günler içerisinde gerçekleştirilmiştir.

Tekrarüretilebilirlik çalışmasının değerlendirilmesi için F Testi kullanılmaktadır.

İstatistiksel testin değerlendirilmesi aşağıdaki koşula göre yapılmaktadır:
Ftest > 1   ve   Ftest < Fkritik`,
};

/**
 * İlgili modül için varsayılan açıklamayı döner. Bilinmeyen modüller boş string verir.
 */
export function getDefaultModuleDescription(moduleKey: string): string {
    return VALIDATION_MODULE_DESCRIPTIONS[moduleKey] || "";
}
