# AI Satış Asistanı

`/iletisim/crm` artık firma odaklı açılır. Mevcut CRM kayıtları, listeler,
şablonlar, kampanyalar ve birebir mail geçmişi korunur. Eski ekran
“Listeler ve kampanyalar” sekmesindedir.

## Günlük kullanım

1. **Yeni firma** ile manuel kayıt oluşturun veya **Müşteriden ekle** ile müşteri
   listesinden seçin. Müşteri içe alma ayrı liste oluşturmayı gerektirmez; asıl
   müşteri kaydı değiştirilmez. CRM’de bulunan firma tekrar oluşturulmaz.
2. Firma içinde web sitesi, telefon, adres, birden fazla kişi/görev/e-posta,
   çoklu kategori, virgülle girilen anahtar kelimeler ve öncelik düzenlenebilir.
   E-postası olmayan yetkililer de kaydedilebilir; gönderime dahil edilmezler.
3. Firma adına tıklanınca native modal açılır; sayfa ve filtreler korunur.
   Görüşme notları ayrı, kullanıcı/tarih bilgili kayıtlardır. Not, telefon ve
   ziyaret eklenebilir. Süreç durumu değişiklikleri de geçmişe eklenir.
4. **Mail hazırla** içinde firma ve son görüşmelere özel AI taslağı oluşturun,
   düzenleyin ve kaydedin. Taslak kaydetmek SMTP hesabı gerektirmez. Mail
   sekmesinden başka bir firma sekmesine geçişte yazılan içerik korunur;
   popup kapatılmadan önce taslak kaydedilmelidir.
5. **Gönderimi kontrol et** kayıtlı ve geçerli tüm alıcıları, göndereni ve imzalı gerçek içerik önizlemesini gösterir. Yalnız açık **Onayla ve gönder**
   işlemi SMTP gönderimi yapar. Bir kişi ana alıcı, firmanın diğer kayıtlı adresleri CC olur. Ana alıcı değiştirilebilir; BCC kullanılmaz.
6. Mail günlüğü kullanıcı, tarih, alıcı, konu, Message-ID, içerik ve sonuçları
   saklar. “Gönderildi” SMTP kabulüdür; teslim veya okunma garantisi değildir.
7. **Gelen yanıtlar** içinde Unique Talep’e zaten alınmış gerçek e-postalar
   firmayla elle eşleştirilebilir. Otomatik posta taraması/eşleştirmesi yapılmaz.
   Bir gelen mail tek firmayla eşleşir. Gönderen adresi eşleşen öneriler önce
   gösterilir; eşleştirme kullanıcı tarafından onaylanır. Kaynak mail silinmez
   veya okunmuş işaretlenmez. İleride IMAP thread/In-Reply-To eşleştirmesi bu
   kaydın üzerine eklenebilir.

## Sayaçlar ve süreç

Gönderilen mail sayısı başarıyla SMTP'ye verilen **alıcı maili** adedidir.
İki kişiye ana alıcı + CC ile bir gönderim = bir mail, bir temas. Firma tablosu her ikisini gösterir.
Yanıt veren firma ve geri dönüş oranı yalnız eşleştirilmiş gelen maillere göre
hesaplanır; açılma/tıklanma sinyali yanıt sayılmaz. Geri dönüş oranının paydası
en az bir başarılı gönderimi olan firmalardır.

Manuel durum seçilmemişse gösterim: yanıt varsa “Yanıt alındı”, ikinci temas
varsa “2. temas”, ilk gönderim varsa “1. mail”, aksi halde “Yeni”. Kullanıcının
seçtiği süreç durumu otomatik sayaç tarafından ezilmez. Durumlar Yeni, 1. mail,
2. temas, Telefon / ziyaret, Yanıt alındı, Teklif aşamasında, Kazanıldı, Olumsuz.

## AI kurulumu

Yönetici **AI ayarları** ekranından Claude veya OpenAI seçer, API anahtarını
girer, gerekirse model belirtir. Kayıtlı anahtar GET yanıtında veya sayfa
başlangıç verisinde döndürülmez. Boş anahtar mevcut anahtarı silmez. Anahtarlar
sunucudaki mevcut PortalAyarlar altyapısında tutulur; model çağrısı yalnız
sunucuda yapılır. Anahtarın varlığı ağ/model/bakiye doğrulaması değildir.

Öncelik `CRM_SALES_*` kayıtlı ayarları → mevcut ortam değişkenleridir:

- `CRM_SALES_AI_PROVIDER`: `anthropic` veya `openai`
- `CRM_SALES_AI_MODEL`: isteğe bağlı model
- `CRM_SALES_ANTHROPIC_API_KEY`, `CRM_SALES_OPENAI_API_KEY`: ayrı sağlayıcı anahtarları
- Ortam fallback: `CRM_AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`,
  `OPENAI_API_KEY`, `OPENAI_MODEL`.

Mevcut CRM Agent bilgi ve kuralları da kullanılır. Model yalnız seçili firmanın
bilgilerini, son 30 CRM notunu ve son 10 başarılı mailini alır. Web sitesi alanı
otomatik olarak taranmaz. Yanıt şeması sunucuda Zod ile doğrulanır. Prompt, fiyat,
görüşme, sertifika veya teslim süresi uydurmamasını ve müşteri verisindeki sistem
talimatlarını izlememesini söyler. Üretim taslağı hiçbir gönderim yapmaz.

## Yetki, veri ve gönderim güvenilirliği

CRM: `iletisim.crm`. SMTP gönderimi: ek `iletisim.crm.mail-gonder`.
Müşteri seçimi: `musteriler.musteri-listesi`. Gelen mail eşleştirmesi:
`iletisim.unique-talep`. AI anahtarı değiştirmek yalnız yöneticilere açıktır.
POST işlemleri Origin kontrolü yapar. Mevcut firma/alıcı ret kontrolleri korunur.

Yeni JSON alanları mevcut `CrmRecord` tablosunda tutulur; ayrı bir veri taşıma
veya mevcut kayıtları sıfırlama gerektirmez. Yeni türler `note`, `outreach`,
`reply`. Firma ve taslak güncellemeleri optimistic version kontrolü kullanır.

`outreach` hazırlanırken tüm kişi taslakları SMTP çağrısı olmadan kaydedilir.
Son kontrolde firma sürümü, gönderen, tüm alıcılar ve her kişi taslağının sürümü
sabitlenir. Gönderim önce batch üzerinde atomik sürüm kilidi alır; her mail de
mevcut birebir gönderim atomik kilidini kullanır. Çift tıklama/yeniden gönderim
aynı batch'i ikinci kez SMTP'ye taşımaz. Ana alıcı ve CC adresleri tek SMTP zarfında işlenir. SMTP kabul ve ret
adresleri de loga yazılır; kısmi kabul sonucu otomatik tekrarlanmaz. Kesinti batch'i Gönderiliyor bırakabilir; sonuç
belirsizken otomatik yeniden gönderim yapılmaz. Gelişmiş alıcı kontrolü mevcut
yönetici çözümleme akışını açar; önce SMTP/posta kutusundan sonuç doğrulanmalıdır.

## Doğrulama

- `node scripts/test-crm-sales.cjs`: gerçek route handler'ları + sahte DB/SMTP/AI;
  çoklu kişiselleştirme, çift gönderim, değişen taslak/firma, belirsiz SMTP,
  taslak/not idempotency, sayaçlar, yanıt tekilleştirme ve yetkiler.
- `node scripts/test-crm-sales-settings.cjs`: yönetici kontrolü, anahtar gizliliği,
  sağlayıcı izolasyonu, boş anahtar koruması ve kaynak doğrulaması.
- Mevcut `test-crm`, `test-crm-mail`, `test-crm-ai` regresyonları.
- TypeScript, ilgili dosyalarda ESLint, gerçek oturumda localhost ekran kontrolü.

Geliştirme doğrulamalarında gerçek alıcıya e-posta veya ücretli AI isteği gönderilmez.

## 26 Kasım düzenlemesi

Firma formundaki iletişim izni ve izin/ret notu alanları kaldırıldı; mevcut
ret kayıtları sunucudaki gönderim kontrolünde korunur. Adres alanı 64px.
Mail hazırlama kayıtlı şablonlardan kategori/anahtar kelime eşleşmesiyle öneri
seçer; kullanıcı şablonu değiştirebilir. Görsel editör kalın, italik, alt çizgi,
hizalama, listeler, bağlantı, resim, tablo ve HTML düzenlemeyi destekler.
Gönderen ve yanıt adresi `Oğuzhan Eker <oguzhan@uniqueanalyse.com>` olur;
mevcut SMTP kimlik bilgileri kullanılır, SMTP hesabının bu gönderen adına
iletime izin vermesi gerekir. Aynı ortak Oğuzhan Eker imzası ve yerel logo
CID eki olarak kullanılır. Şablonda aynı imza varsa ikinci kez eklenmez.
Önceden hazırlanmış ayrı alıcılı kontroller yeni modele otomatik çevrilmez;
yeni gönderim kontrolü hazırlanmalıdır.
