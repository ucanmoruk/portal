# UNIQUE web asistanı → Portal entegrasyonu

Web tasarım / asistan geliştirme ekibine teslim belgesi — 14.11.2026

## Amaç ve mevcut durum
Asistanın müşteri onayıyla topladığı bilgiler Portal'daki **İletişim > Unique Talep** ekranına aktarılır. Hizmetler tanımlıysa katalog fiyatlarıyla teklif **taslağı** oluşur. Müşteriye e-posta gönderilmez, sözleşme veya onaylı teklif oluşmaz. Teklifin kaydedilmesi ve müşteriye iletilmesi portal kullanıcısının mevcut iş akışıdır.

Alıcı kodu hazırlanmıştır. Canlıya dağıtım ve sunucu anahtarının tanımlanması ayrıca gereklidir. Anahtar tanımlı değilken API 503 döner. Bu belgede gerçek anahtar bulunmaz.

## Bağlantı
- Yöntem: `POST`
- Yol: `/api/integrations/website-assistant`
- Yerel test: `http://localhost:1038/api/integrations/website-assistant`
- Canlı hedef: `https://lab.uniqueanalyse.com/api/integrations/website-assistant` (dağıtımdan sonra)
- Başlıklar: `Content-Type: application/json`, `Authorization: Bearer <SUNUCU_ANAHTARI>`
- Portal sunucusunda ortam değişkeni: `WEBSITE_ASSISTANT_TOKEN`

**Akış:** müşterinin tarayıcısı → web sitesinin backend'i → Portal API.
Anahtar yalnızca backend'de saklanır. JavaScript paketine, HTML'ye veya asistan konuşmasına konmaz. Doğrudan tarayıcıdan Portal'a istek yapılmaz; CORS açılması gerekmez. Canlı web sitesinden `localhost` adresine erişilemez. HTTPS canlı adres kullanılmalıdır.

## Gönderilecek JSON
```json
{
  "externalId": "website-chat-20261114-000123",
  "name": "Örnek Yetkili",
  "email": "yetkili@example.com",
  "companyName": "Örnek Firma A.Ş.",
  "phone": "+90 555 000 00 00",
  "subject": "Kozmetik ürün için analiz teklifi",
  "message": "Ürün: yüz kremi. Numune sayısı: 2. Talep edilen analizler ve ürün özellikleri müşteri tarafından teyit edildi.",
  "consent": true,
  "items": []
}
```
Bu örnek doğrudan talep açar; `items` boş olduğundan fiyatlı teklif taslağı üretmez. Hizmet eşleştirmesi netse aşağıdaki kalem yapısı kullanılır:
```json
{"serviceId": 123, "quantity": 2, "products": ["Yüz kremi"]}
```
`123` örnektir; gerçek katalog ID'si ile değiştirilmelidir. Uydurma ID gönderilmemelidir. Mevcut katalog kimlikleri portal yöneticisinden güvenli biçimde alınmalıdır; bu entegrasyon herkese açık bir katalog endpoint'i sağlamaz. Hizmet bilinmiyorsa `items: []` gönderin, isteği `message` alanında açıklayın.

## Alanlar ve sınırlar
| Alan | Zorunlu | Kural |
|---|---|---|
| externalId | Evet | 1–200 karakter; web sistemi tarafından üretilen benzersiz talep anahtarı |
| name | Evet | 1–200 karakter; iletişim kişisi |
| email | Evet | Geçerli e-posta |
| companyName | Hayır | En çok 250 karakter; firma portalda otomatik eşleştirilmez |
| phone | Hayır | En çok 50 karakter |
| subject | Evet | 1–500 karakter |
| message | Evet | 1–16.000 karakter; ürün, matris, analizler, numune sayısı, hedef pazar, talep edilen kapsam ve termin bilgilerini bilindiği ölçüde içerir |
| consent | Evet | Gerçek müşteri teyidinden sonra `true`; yalnızca sohbet açılmış olması onay sayılmaz |
| items | Hayır | En çok 100 kalem; boş liste kabul edilir |
| items[].serviceId | Kalem varsa | Portalın pozitif tam sayı hizmet ID'si |
| items[].quantity | Kalem varsa | 1–10.000 tam sayı |
| items[].products | Hayır | En çok 30 ürün adı, her biri en çok 200 karakter |

Toplam istek boyutu en çok 64.000 bayttır. Bilinmeyen bilgileri tahmin etmeyin. Fiyat, indirim, para birimi, akreditasyon veya metot beyanı göndermeyin: bunlar Portal kataloğundan alınır. Telefon ve firma adı talep metninde de saklanır. Firma eşleştirmesi portalda doğrulanır.

## Tekrarlı gönderimler
`externalId` aynı talebin bütün tekrarlarında aynı kalmalıdır. Portal bunun özetinden benzersiz anahtar oluşturur; aynı ID ikinci bir talep oluşturmaz. Aynı ID ile değiştirilmiş içerik göndermek güncelleme yapmaz. Yeni talep için yeni ID kullanın.

## Yanıt
İlk kabul: HTTP 201; aynı talebin tekrarı: HTTP 200.
```json
{
  "id": 123,
  "created": true,
  "offerDraft": false,
  "url": "/iletisim/unique-talep/123"
}
```
`url` oturum gerektiren personel ekranıdır; müşteriye özel bir takip bağlantısı değildir. `offerDraft: true`, katalogdan fiyatlandırılmış taslak bulunduğunu belirtir; müşteriye teklif gönderildiğini belirtmez.

| Kod | Anlam / yapılacak işlem |
|---|---|
| 400 | Alanlar geçersiz; düzeltip gönderin |
| 401 | Anahtar yanlış / eksik; otomatik tekrar etmeyin |
| 413 | İstek çok büyük; içeriği kısaltın |
| 422 | Hizmet ID'si veya katalog fiyatı yok; eşleştirmeyi düzeltin |
| 500 | İşlem tamamlanamadı; aynı externalId ile sınırlı tekrar |
| 503 | Entegrasyon anahtarı tanımlanmamış; portal yöneticisine bildirin |

Ağ hatası veya 500 için aynı externalId ile örneğin 2, 5 ve 15 saniyede en çok üç tekrar yapın. Yanıt alındıktan sonra tekrar göndermeyin. Hata ayrıntılarına kimlik anahtarı veya gereksiz müşteri verisi yazmayın.

## Backend örneği (Node.js)
```js
const response = await fetch(
  `${process.env.PORTAL_BASE_URL}/api/integrations/website-assistant`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PORTAL_ASSISTANT_TOKEN}`
    },
    body: JSON.stringify(customerConfirmedRequest),
    signal: AbortSignal.timeout(30000)
  }
);
const result = await response.json();
if (!response.ok) throw new Error(`Portal aktarımı başarısız: ${response.status}`);
// result.id iç sistem kaydına yazılır; müşteriye personel ekranı URL'si gösterilmez.
```
Web backend'inde `PORTAL_ASSISTANT_TOKEN` ile Portal backend'indeki `WEBSITE_ASSISTANT_TOKEN` aynı değer olmalıdır. `PORTAL_BASE_URL` canlıda `https://lab.uniqueanalyse.com` olur.

## Teslim / kabul kontrolü
1. Portal kodu canlıya dağıtılır; iki backend'de anahtar güvenli şekilde tanımlanır.
2. Web backend'inde kötüye kullanım / hız sınırı ve müşteri onay adımı uygulanır.
3. Boş items ile talebin Unique Talep ekranına düştüğü doğrulanır.
4. Aynı externalId ile ikinci kayıt oluşmadığı kontrol edilir.
5. Gerçek hizmet ID'siyle katalog fiyatlı teklif taslağı kontrol edilir.
6. Yanlış anahtar ve geçersiz hizmet isteklerinin reddedildiği doğrulanır.
7. E-posta veya onaylı teklifin kendiliğinden gönderilmediği kontrol edilir.

Bu belge, web sitesindeki asistanın model veya sağlayıcı seçimini belirlemez. Portal'a aktarılacak veri sözleşmesini ve hazırlanan alıcının davranışını tanımlar.
