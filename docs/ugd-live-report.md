# ÜGD canlı rapor kaydı ve çıktı

Canlı editör açıkken üstteki **Kaydet** ve alttaki **Raporu Kaydet** aynı HTML kaydını oluşturur. Ürün ve formül verileri bu işlemde yeniden yazılmaz. Başarısız kayıt başarı gibi gösterilmez; kayıt hatasında Yazdır işlemi de durur. Değişmemiş belgeyi Kaydet ardından Yazdır ile tekrar saklamak gerekmez.

HTML, `UGD_CanliRaporEdits.BodyHtml` içinde bir kez saklanır. Yeni `SectionsJson` kayıtları bölüm başlıkları ve JavaScript karakter aralıklarından oluşur; fotoğraf ve metinler burada tekrarlanmaz. Eski HTML içeren bölüm kayıtları okumada desteklenir. `/api/urunler/canli-rapor?compact=1` yeni istemciye bu aralıkları döndürür; parametresiz yanıt eski bölüm HTML formatını korur. Tarihçe kayıtları silinmez veya topluca dönüştürülmez.

Editör önce kaydedilmiş raporu yükler. Kaydedilen belgedeki firma metni, tablo değişiklikleri veya boş hücreler otomatik şablon yenilemesiyle değiştirilmez. **Şablonu Yenile** kullanıcının açık isteğiyle güncel ürün/formül verilerinden yeni şablon oluşturur; bunun da kalıcı olması için kaydedilmesi gerekir.

PDF/Word üretiminde öncelik: istekteki düzenlenmiş HTML → kayıt/lisan/profil için son kaydedilmiş HTML → yeni şablon. Bu kural TR, EN ve CPSR için aynıdır. Rapor takipten çıktı ve imzalı ÜGD PDF de formun kayıt ID'siyle aynı kaydı kullanır. Kaydedilmiş belge basılırken firma ve formül tabloları yeniden üretilmez.

Doğrulama: `node scripts/test-ugd-live-editor.cjs`, `node scripts/test-ugd-live-report.cjs --pdf`, `node scripts/test-ugd-report.cjs`. Gerçek PDF testi yalnızca sentetik belge kullanır; veritabanı ve oturum bağımlılıkları taklittir. Mevcut müşteri raporları test amacıyla değiştirilmez.

## Formül analizi

`ANALİZİ BAŞLAT` katalog eşleştirmesini satır başına seri sorgularla değil üç toplu okumayla yapar. İstek en fazla 250 bileşen içerir. INCI/CAS eşleşmesi, yönetmelik numarası önceliği, NOAEL ve miktar normalizasyonu korunur. Eşleşmeyen bileşenler listeden düşürülmez.

Laboratuvar formülü en fazla 100 satırlık INSERT gruplarıyla tek transaction içinde değiştirilir; numune kilidi eşzamanlı kaydı sıraya alır. Formül değişimi ve rapor durum güncellemesi birlikte commit edilir; hata halinde eski formül korunur. İstemci eşleştirme/kayıt aşamalarını gösterir, çift başlatmayı engeller ve ağ bekleyişini eşleştirmede 90, kayıtta 45 saniyeyle sınırlar. Zaman aşımı sonucu belirsiz kayıtta kullanıcıya kayıt durumunu kontrol etmesi söylenir; metin otomatik temizlenmez.

Ek testler: `node scripts/test-ugd-formula-match.cjs` ve `node scripts/test-ugd-formula-ui.cjs`.
