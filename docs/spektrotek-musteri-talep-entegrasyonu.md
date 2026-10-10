# Spektrotek müşteri talep entegrasyonu

Portal sayfası: `/iletisim/musteri-talep`. Yeni yetki: `iletisim.musteri-talep` (yöneticiler otomatik erişir). Talepler ve dosyalar portal veritabanında saklanır; ilk erişimde tablolar oluşturulur. Spektrotek taleplerindeki personel yanıtları ve durum değişiklikleri otomatik e-posta bildirimi için Spektrotek sunucusuna iletilir.

## Portal yanıtı ve durum bildirimi

Başarılı personel mesajı kaydı `staff_message`, gerçekten değişen durum `status_changed` olayı üretir. Yalnız `spektrotek` kaynaklı talepler için `POST https://talep.spektrotek.com/api/integrations/customer-request-notifications` çağrılır. Sunucudaki mevcut `CUSTOMER_REQUEST_SPEKTROTEK_API_KEY` değeri `x-api-key` başlığında kullanılır; e-postayı Spektrotek uygulamasının SMTP yapılandırması gönderir.

JSON alanları: `eventId`, `eventType`, `number`, `email`, `name`, `subject`, `text`, `status`. Personel mesajının UUID'si bildirim kimliği olarak kullanılır; her durum değişikliği yeni UUID alır. Dosyalar ve takip tokenı bildirim gövdesine eklenmez.

Yanıt/durum ile `CustomerRequestNotifications` kuyruk kaydı aynı veritabanı transaction'ında saklanır. HTTP 2xx başarılı kabul edilir. Ağ hatası, zaman aşımı veya başarısız HTTP durumunda aynı olay kimliğiyle tekrar denenir; gecikme 30 saniyeden başlayıp en fazla 1 saate çıkar. Spektrotek endpointinin aynı kimlikle tekrar gönderimleri tek e-postaya indirmesi gerekir. Bildirim hatası kaydedilen yanıtı geri almaz; kuyruk ekleme hatası transaction'ı geri alır.

İlk gönderim portal isteğinin yanıtından sonra yapılır. Production Node.js/Passenger süreci ayrıca kuyruğu 30 saniyede bir kontrol eder; süreç kapalıyken kuyruk veritabanında kalır, yeniden başlatıldığında devam eder. Birden fazla süreçte 60 saniyelik kiralama aynı kaydın paralel gönderilmesini önler. Sunucusuz ortamda ayrıca zamanlanmış kuyruk çalıştırıcısı gerekir; bu uygulamanın çalışan Passenger süreci esas alınmıştır.

Yeni paket yüklendikten sonra portal Node.js uygulamasını yeniden başlatın. Mevcut iki sunucu anahtarı eşleşiyorsa yeni ortam değişkeni gerekmez. Veritabanı kullanıcısı kuyruk tablosunu oluşturabilmelidir. Kuyruk takibi için `ID, Attempts, NextAttempt, SentAt, LastError` alanlarını inceleyin; `Payload` kişisel veri içerir ve loglanmamalıdır. Başarılı endpoint yanıtı, mesajın alıcının gelen kutusuna teslimini tek başına kanıtlamaz.

## Sunucu kurulumu

Portal ve Spektrotek sunucularında aynı, en az 32 karakter rastgele gizli anahtar tanımlayın:

```env
CUSTOMER_REQUEST_SPEKTROTEK_API_KEY=<rastgele-gizli-anahtar>
```

Unique Analyse için ayrı anahtar: `CUSTOMER_REQUEST_UNIQUEANALYSE_API_KEY`. Kaynak, gönderilen başlıkta bulunan anahtardan belirlenir; form kaynağı değiştiremez. Anahtarları tarayıcıya, JavaScript paketine veya Git'e koymayın. Portal sunucusu ortam değişkeni eklendikten sonra yeniden başlatılmalı.

Tüm istekler **Spektrotek backend'inden** portal HTTPS adresine gönderilir. Başlık: `x-api-key: <gizli-anahtar>`. Tarayıcı doğrudan portal API'sine bağlanmaz. Portal adresini Spektrotek backend ortamında yapılandırın; aşağıdaki örneklerde `https://lab.uniqueanalyse.com` kullanılmıştır.

## Form gönderimi

`POST /api/integrations/customer-requests`, `Content-Type: application/json`:

```json
{
  "externalId": "b07c5900-6e67-49c4-b6d6-180ab6691a52",
  "type": "Teklif talebi",
  "company": "Örnek Firma",
  "name": "Ayşe Yılmaz",
  "email": "ayse@example.com",
  "phone": "+90 555 000 00 00",
  "subject": "Analiz hizmeti hakkında",
  "body": "Talebin ayrıntıları…"
}
```

Tüm alanlar gereklidir. Sınırlar sırasıyla tür 100, firma 200, yetkili 160, e-posta 254, telefon 50, başlık 220, detay 20000 karakter. JSON istek sınırı 64 KB. `externalId`, backend'in bir form gönderimi için ürettiği UUID olmalı; aynı işlemi ağ hatası nedeniyle tekrar gönderirken **aynı ID'yi** kullanın. Aynı kaynak ve ID ile tekrar gönderim yeni talep oluşturmaz, önceki alanları değiştirmez.

Başarılı ilk yanıt HTTP 201:

```json
{
  "number": "1234567890",
  "token": "64-karakterlik-hex-takip-anahtari",
  "trackingUrl": "https://spektrotek.com/talep-takip?token=...",
  "created": true
}
```

Tekrarlı gönderim HTTP 200, `created:false`. Portal takip bağlantısını sonradan yenilediyse eski işlem tekrarı `token:null, trackingUrl:null` döner; mevcut bağlantıyı değiştirmez. İlk takip token'ı kaynak anahtarından türetilir; anahtar değiştirildikten sonraki tekrarlar eski token'ı geri alamaz. Yanıtı backend'de güvenli kaydedin, form başarı ekranında talep numarasını gösterin. Müşteriye bağlantı e-postası göndermek Spektrotek yazılımının görevidir.

Form tarafına zorunlu alan kontrolleri, CAPTCHA, IP bazlı hız sınırı, çift tıklama engeli ve KVKK aydınlatma/onay akışı ekleyin. Portal API anahtarı tek başına halka açık formun spam koruması değildir.

## Takip sayfası

Spektrotek'te `/talep-takip?token=...` sayfasını oluşturun. Token'a sahip kişi talebe erişir; talep numarası tek başına erişim sağlamaz. Bağlantı 180 gün geçerlidir. Portalda yeni bağlantı üretildiğinde önceki geçersiz olur. Süre dolduğunda müşteri destekle iletişime yönlendirilmeli.

Backend üzerinden `GET /api/integrations/customer-requests/{token}` çağrısı yapın. Yanıt:

```json
{
  "request": {
    "number": "1234567890", "source": "spektrotek",
    "status": "Talep oluşturuldu", "createdAt": "2026-10-09T10:00:00.000Z",
    "type": "Teklif talebi", "company": "Örnek Firma", "name": "Ayşe Yılmaz",
    "email": "ayse@example.com", "phone": "+90 555 000 00 00",
    "subject": "Analiz hizmeti hakkında", "body": "Talebin ayrıntıları…"
  },
  "messages": [{
    "id": "mesaj-uuid", "role": "staff", "text": "Yanıt metni",
    "createdAt": "2026-10-09T11:00:00.000Z",
    "files": [{"name": "teklif.pdf", "size": 1024}]
  }]
}
```

Durumlar: `Talep oluşturuldu`, `İşleme Alındı`, `Tamamlandı`. Müşteri durum değiştiremez. Mesaj `role` değerleri `staff` (portal yanıtı), `customer` (müşteri). Tüm metinleri düz metin olarak render edin; HTML olarak çalıştırmayın.

Müşteri cevap gönderimi: `POST /api/integrations/customer-requests/{token}/messages`, `multipart/form-data`. `text` metin alanı; her dosya için tekrar eden `files` alanı. Mesaj veya en az bir dosya gerekir. Metin en fazla 20000 karakter. En fazla 3 dosya, her dosya 2 MB; toplam HTTP gövdesi 7 MB. Uzantılar PDF, DOCX, XLSX, PNG, JPG/JPEG, TXT, CSV. İlk form gönderiminde ek yok; dosyalar takip yazışmasına eklenebilir. Başarı: `{"ok":true}`. Sonrasında takip verisini yeniden okuyun.

Ek indirme: `GET /api/integrations/customer-requests/{token}/files/{messageId}/{fileIndex}`. `fileIndex` sıfırdan başlar. Spektrotek backend dosyayı portal üzerinden alıp müşteriye indirme yanıtı olarak iletmeli; anahtarı veya portalın iç API adresini tarayıcıya vermemeli. Dosyalar indirme olarak sunulur, otomatik açılmaz; antivirüs taraması mevcut değildir.

Token'ı URL'den aldıktan sonra HttpOnly/Secure/SameSite oturumuna taşıyıp adres çubuğundan kaldırın. Backend her takip/mesaj/dosya isteğinde o müşterinin token'ını kullanmalı; CSRF koruması ve hız sınırı uygulayın. `Cache-Control: no-store`, `Referrer-Policy: no-referrer` kullanın. Takip sayfasına üçüncü taraf analitik koymayın; token'ı loglamayın. Dosyaları CDN/public klasöre taşımayın. Yenile düğmesi veya makul aralıkta polling yeterli; websocket yoktur.

Hatalar JSON `{"error":"..."}`: 400 doğrulama, 401 anahtar, 404 geçersiz/süresi dolan takip veya dosya, 413 boyut, 500 sunucu. Müşteriye anlaşılır hata ve yeniden deneme sunun; ilk formun ağ hatalarında aynı `externalId` ile tekrar deneyin. Mesaj gönderimi idempotent değildir; otomatik tekrar yerine başarı durumunu takip listesinden kontrol edin.

## Teslim kontrolü

1. Spektrotek formu → portalda doğru kaynak, alanlar ve benzersiz numara.
2. Aynı form işlem ID'siyle tekrar → tek kayıt.
3. Portal yanıtı ve dosya → müşterinin takip sayfasında görünür.
4. Müşteri yanıtı ve dosya → portalda görünür.
5. Yanlış kaynak anahtarı, başka talebin dosyası ve eski bağlantı → erişim reddedilir.
6. Portal durum değişikliği → müşteri takip ekranında güncellenir.

Unique Analyse aynı sözleşmeyi kendi anahtarıyla kullanır; takip adresi `https://uniqueanalyse.com/talep-takip?token=...` olur.
