# Spektrotek Market ↔ Unique Analyse Portal — Uygulama sözleşmesi v1

Bu doküman Spektrotek geliştiricisine iletilebilir. Portalın aşağıdaki kodlarının canlıya kurulması ve Spektrotek tarafındaki işlerin uygulanması birlikte gereklidir. Yalnızca iki sunucuya aynı anahtarı eklemek senkronizasyonu başlatmaz.

## 1. Adres ve kimlik doğrulama

Portal taban adresi: `https://lab.uniqueanalyse.com`

Mağaza: `https://spektrotek.com/market`

Portal sunucusunun çalışan ortamında `SPEKTROTEK_INTEGRATION_KEY` en az 32 karakterlik gizli değer olmalı. Spektrotek sunucusu aynı değeri kendi gizli ortam değişkeninden okuyup **her istekte** `x-api-key` başlığında göndermeli. Alternatif: `Authorization: Bearer <anahtar>`. Değişkenin Spektrotek tarafındaki ismi serbesttir; değer aynı olmalıdır. Anahtarı tarayıcıya veya NEXT_PUBLIC_ değişkenine koymayın. HTTPS kullanın. Sunucu tarafında çağırın; tarayıcı CORS entegrasyonu değildir.

Önce `GET /api/integrations/spektrotek/health` çağırın. Başarılı yanıt:

```json
{"ok":true,"service":"spektrotek-commerce","version":1}
```

Bu uç yalnızca sürüm ve anahtarı doğrular; veritabanı kontrolü ürün beslemesiyle yapılır.

401 teşhisi:

- `Geçersiz entegrasyon anahtarı.`: ürün servisine ulaşılıyor; başlık yok veya anahtar uyuşmuyor.
- `Oturum suresi doldu...`: yanlış URL veya canlıda eski proxy kodu; entegrasyon yolları portal giriş oturumu gerektirmemeli.
- JSON yerine HTML 401/403: reverse proxy, hosting veya başka erişim katmanını kontrol edin.
- 503 ve anahtar sunucuda tanımlı değil mesajı: çalışan uygulama ortamında anahtar yok veya 32 karakterden kısa.
- `.env` değişikliğinden sonra çalışan Node uygulamasını yeniden başlatın; hosting ortam değişkenlerini ve `.env.local` gibi öncelikli dosyaları kontrol edin. Next.js `$` karakterini değişken olarak genişletir; rastgele hex anahtar kullanmak bu sorunu önler. Anahtarı hata kayıtlarına yazmayın.

## 2. Ürünleri okuma ve otomatik senkronizasyon

`GET /api/integrations/spektrotek/products?page=1&limit=100`

Yanıt `{data: [...], total, page, limit, totalPages}`. Limit en fazla 500. `data` yalnızca `Kaynak='Spektrotek'` ürünlerini içerir; webSecili=false ürünler de dahildir. Root ve Unique aktarılmaz. Veritabanı tabloları ilk erişimde hazırlanır; uygulamanın şema oluşturma izni olmalıdır.

Her ürünün alanları:

| Alan | Anlam |
| --- | --- |
| id | Değişmeyen portal ürün kimliği; esas bağlantı anahtarı |
| sku, barkod | Portal ürün kodu ve EAN-13 |
| ad, name, ozellik | Türkçe/ikinci ad ve özellik |
| kategori, marka | Kategori ve marka |
| satisFiyati, listeFiyati | KDV hariç fiyatlar; null bilinmiyor demektir, sıfır olarak yorumlamayın |
| paraBirimi, kdvOrani | EUR/USD/TRY/GBP ve KDV yüzdesi |
| stokMiktari, birim, stokDurumu | Portalın mevcut fiziksel stok adedi, birim, durum |
| kisaAciklama, urunAciklamasi | Ürün içerikleri; mağazada gösterirken HTML'yi güvenli biçimde temizleyin |
| tedarikDurumu, teslimSuresi | Stoktan / Tedarik süreli / Teklif ile ve teslim süresi |
| webSecili | Portalın web seçimi; otomatik yayınlama izni olarak kullanılmaz |
| webUrunId, webSlug | Bilinen mağaza eşleştirmesi; eski kayıtlarda da bulunabilir |
| images | `{id,url,alt}` dizisi; indirme de aynı gizli başlığı gerektirir |
| updatedAt | Bilgilendirici tarih; değişiklik imleci olarak kullanmayın |
| revision | Ürün verisinden hesaplanan SHA-256; stok hareketi dahil değişiklik karşılaştırması |
| createStatus | Her zaman `draft`; yeni mağaza ürünü taslak açılır |

Spektrotek'te bir dakikada bir çalışan, çakışan çalışmaları kilitleyen kalıcı görev kurun. Her turda tüm sayfaları okuyun. Şu anda tarih filtreli delta uç veya portal push/webhook yoktur; bir dakikalık görev ve API süresi kadar gecikme beklenir. `updatedAt` tek başına stok hareketlerini yakalamaya yeterli değildir. `revision` kullanın.

Algoritma:

1. Mağaza tablosuna benzersiz `portalProductId` alanı, son başarılı `revision` ve kalıcı eşleştirme/iş kuyruğu ekleyin.
2. İlk eşleştirmede önce portal ID'si, ardından bildirilen webUrunId, ardından **tekil ve tam** SKU, sonra **tekil ve tam** barkod eşleşmesi arayın. Farklı ürünleri işaret eden SKU/barkod veya birden çok aday varsa manuel inceleme kuyruğuna alın. Ad benzerliğiyle otomatik eşleştirmeyin. Aynı ürünü iki kez oluşturmayın.
3. Eşleşme yoksa `portalProductId` için atomik upsert ile taslak oluşturun. `webSecili` ne olursa olsun yeni kayıt taslaktır. Portalda ürün tekrar kaydedilince taslak çoğalmamalıdır.
4. Aşağıdaki eşleştirme POST'unu başarıyla yapın. Oluşturma başarılı, POST başarısızsa aynı mağaza kimliğiyle tekrar deneyin; yeni ürün yaratmayın. Sipariş göndermeden önce eşleştirmenin portalda onaylandığından emin olun.
5. Revizyon değiştiğinde portal alanlarından SKU/barkod, ad/açıklamalar, kategori/marka, fiyat/para birimi/KDV, stok/birim/tedarik ve görselleri güncelleyin. **Mevcut mağaza yayın/taslak durumunu koruyun.** Portal esas kaynaktır; mağazada bu alanlara yapılan değişiklik sonraki turda üzerine yazılır. Editoryal alanları ayrı tutun.
6. Fiyat/KDV eksik veya fiyat pozitif değilse doğrudan satın almayı kapatın; teklifle satış politikasını uygulayın. TRY dışındaki fiyatları para birimi dönüşümü olmadan TRY kabul etmeyin. Portal stok adedini negatifse mağazada satılabilir adet olarak sıfıra sınırlayın.
7. Ürün görsellerini sunucuda anahtarla indirip mağaza medya deposuna alın. Gizli başlık gerektiren portal görsel URL'sini doğrudan ziyaretçinin img src'sine koymayın. İç alanlar ve referans fiyat beslemede bulunmaz.
8. Tüm alanlar ve eşleştirme başarıyla yazılınca revizyonu başarılı işaretleyin. Hatalı ürünleri tekrar kuyruğa alın; bir ürün hatası diğerlerini durdurmasın. Eksik/başarısız taramada ürün silmeyin. Sayfalama hareketli verinin anlık fotoğrafı değildir; bir turda görünmeyen ürünleri otomatik silmeyin. Kaynak değişimi/silme için en az iki başarılı tam tur ve manuel incelemeyle mağazada pasife alma uygulayın.

### Eşleştirmeyi portala bildirme

`POST /api/integrations/spektrotek/product-mappings`

```json
{"portalProductId":123,"webProductId":"store-456","webSlug":"hplc-vial"}
```

Content-Type: application/json. webSlug isteğe bağlı, küçük harf/rakam/tire. Başarılı yanıt `{ok:true,portalProductId,webProductId,webSlug}`. Aynı bağlantı tekrar bildirilebilir. Ürün başına tek mağaza ürünü ve mağaza ürünü başına tek portal ürünü vardır. Farklı bağlantıyla üzerine yazma 409 verir; destekle mevcut yanlış bağlantıyı inceleyin. Haritalama ayrı tabloda korunur; normal portal ürün düzenlemesi bu bağlantıyı silmez. Beslemedeki webUrunId/webSlug bu eşleştirmeyi yansıtır. Eski webUrunId bilgilerini de bu POST ile kesinleştirin.

## 3. Web siparişini portala gönderme

`POST /api/integrations/spektrotek/orders`

Sipariş mağazada kalıcı olarak oluşunca aynı yerel transaction'da bir outbox işi yazın. İşçi portala göndersin. Tarayıcı dönüş sayfasına veya ödeme callback'inin yalnızca bir kez gelmesine güvenmeyin. Bekleyen havale dahil hangi ödeme durumunda sipariş kesinleşiyorsa o aşamada bir kez gönderin. Kart bilgisi/CVV/ödeme tokenı göndermeyin.

```json
{
  "orderId":"order-2026-10001",
  "orderNumber":"SPK-WEB-10001",
  "placedAt":"2026-10-19T14:30:00+03:00",
  "currency":"EUR",
  "customer":{
    "name":"Örnek Laboratuvar Ltd.",
    "email":"satinalma@example.com",
    "phone":"+90 212 000 00 00",
    "billingAddress":"Fatura adresi, İstanbul",
    "shippingAddress":"Teslimat adresi, İstanbul",
    "taxNumber":"1234567890"
  },
  "items":[
    {"portalProductId":123,"webProductId":"store-456","quantity":2,"unitPrice":100,"vatRate":20}
  ],
  "shippingTotal":10,
  "discountTotal":0,
  "grandTotal":250,
  "paymentStatus":"bank_transfer",
  "paymentReference":"SPK-WEB-10001",
  "note":"Mesai saatlerinde teslimat."
}
```

Alanlar örnekteki gibi zorunludur; yalnız taxNumber, paymentReference, note isteğe bağlıdır. orderId mağazanın değişmeyen kimliği olmalı (harf/rakam/tire/alt çizgi; en fazla 120). items 1–100 kalem; aynı portalProductId tek kalemde toplanmalı. Miktar pozitif ve en fazla 4 ondalıklı; fiyatlar JSON number, negatif olmayan ve en fazla 2 ondalıklı. Virgüllü sayı veya para sembolü göndermeyin. Gövde en fazla 128 KiB.

`unitPrice` KDV hariç; kalem bazlı indirim uygulanmış net birim fiyat. Kargo ve sipariş geneli indirim KDV dahil tutarlardır. grandTotal = her kalem için `round(quantity * unitPrice * (1 + vatRate/100), 2)` toplamı + shippingTotal − discountTotal. Kalem indirimi unitPrice'a uygulanmışsa discountTotal'a tekrar dahil etmeyin. Toplam uyuşmazlığı 400 verir. Geçmiş sipariş fiyatı mevcut katalog fiyatıyla karşılaştırılmaz; sipariş anındaki fiyat saklanır.

paymentStatus: pending / paid / bank_transfer / cash_on_delivery. Bu bilgi sipariş notunda saklanır; portalda fatura veya muhasebe tahsilatı oluşturmaz. Tüm kalemler önceden bildirilmiş eşleştirmeye sahip olmalıdır; farklı kaynak veya eksik eşleştirme 409 verir. Portal otomatik stok kartı yaratmaz.

Başarı HTTP 200:

```json
{"ok":true,"duplicate":false,"portalOrderId":789,"portalOrderNumber":"S1001"}
```

Portalda Seri=Spektrotek, TalepTuru=Sipariş, Durum=Onay Bekliyor ve OlusturanAd=Spektrotek Web olur. Kayıt `https://lab.uniqueanalyse.com/laboratuvar/kys/siparis-listesi` sayfasında görünür. Müşteri/teslimat/ödeme/toplam bilgileri notlarda, birim fiyat/KDV kalem notlarında, özgün JSON ayrı entegrasyon tablosunda saklanır. Normal onay, işleme alma ve sevkiyat akışı devam eder.

**Stok politikası:** Sipariş alımı fiziksel stok hareketi veya depo rezervasyonu oluşturmaz. Portalın sevkiyat/tamamlama adımı mevcut stok çıkışını yapar. Mağaza açık siparişler için kendi rezervasyonunu tutmalı; beslemenin fiziksel stok adedini rezervasyon üstüne yazarak fazla satışa yol açmamalı. Aşağıdaki durum servisiyle kalemlerin sevk edilen miktarını okuyup kalan rezervasyonları uzlaştırın. Stok ve sipariş okumaları ayrı isteklerdir; eşzamanlı depo işlemlerinde geçici farklar olabilir. Bu entegrasyon tek başına tüm satış kanallarında atomik stok rezervasyonu sağlamaz.

### Sipariş durumunu okuma

`GET /api/integrations/spektrotek/orders/{orderId}` — aynı gizli başlık gerekir. Yalnızca web entegrasyonundan alınmış siparişleri döndürür; müşteri kişisel bilgilerini döndürmez.

```json
{"orderId":"order-2026-10001","portalOrderId":789,"portalOrderNumber":"S1001","status":"Kısmi Kabul","items":[{"portalProductId":123,"quantity":2,"shippedQuantity":1}]}
```

Her ürün taramasında açık web siparişlerini de sorgulayın. `quantity - shippedQuantity` açık kalan miktardır. Portalın fiziksel stok bilgisi zaten sevk edilmiş miktarı içermez; sevk edilmiş kalemi mağazada ikinci kez stoktan düşmeyin. Yeni fiziksel stok ve kalan rezervasyon birlikte güncellenmelidir. `Silindi` veya `İptal` durumunda kalan rezervasyonu kaldırın; diğer bilinmeyen durumlarda rezervasyonu koruyup inceleyin. Sipariş GET 404 ise siparişin hiç teslim edilmemiş olması mümkündür; ilk outbox JSON'unu tekrar POST edin, mağazada yeni kimlik üretmeyin. Bu servis salt okunurdur; ödeme/iptal/iade güncellemez.

### Tekrar gönderme ve değişiklik politikası

- Aynı orderId ve aynı normalize edilmiş içerik yeniden gönderilirse aynı portalOrderId döner, duplicate=true olur; ikinci sipariş oluşmaz. Kalem dizisi sırası da aynı kalmalıdır. İlk isteğin JSON'unu outbox'ta saklayıp aynen tekrar kullanın.
- Aynı orderId farklı içerikle gönderilirse 409; mevcut sipariş değişmez. Ödeme güncellemesi/iptal/iade/adres değişikliği için yeni orderId üretmeyin; bu sürümde bunlar portalda manuel yürütülür. İlk gönderilmiş JSON'u değiştirerek tekrar denemeyin.
- Timeout, ağ hatası, 429 veya 5xx: aynı JSON ve orderId ile artan gecikmeyle tekrar deneyin (ör. 30 sn, 1 dk, 5 dk, 15 dk); Retry-After varsa kullanın. İş, başarılı HTTP yanıtı ve ok=true görülmeden tamamlanmasın.
- 400/413/415: veri/gövde düzeltmesi gerekli; 401: anahtar/URL kontrolü; 409: eşleştirme veya kimlik çakışması. Bunları görünür hata kuyruğuna alın; başarısız siparişi kaybetmeyin. Gizli anahtar veya kişisel müşteri verisini hata kayıtlarına basmayın.

## 4. Portal kurulumu ve kabul testi

Portal ekibi: bu değişiklikleri canlıya kurun; SPEKTROTEK_INTEGRATION_KEY çalışan sunucuda aynı olmalı. Node uygulamasını yeniden başlatın. `/api/integrations/spektrotek/*` mevcut proxy'de anahtar kontrollü, oturumsuz erişime açık olmalıdır; reverse proxy x-api-key/Authorization başlığını korumalı. Yeni tablolar SpektrotekProductMap ve SpektrotekWebOrder ilk ürün/mapping/order erişiminde otomatik oluşur. Yedekleme politikasına dahil edin; sipariş payload'u kişisel veri içerir, erişimi veritabanı yetkileriyle sınırlayın.

Portal ortamından salt okunur bağlantı kontrolü: `node scripts/check-spektrotek-connection.cjs`. Varsayılan adres canlı portaldır; farklı adres için `SPEKTROTEK_PORTAL_URL` sunucu ortam değişkenini verin. Script anahtarı `.env*` üzerinden alır, değeri yazdırmaz; health ve ilk ürün sayfasını kontrol eder. İlk besleme erişimi eksik entegrasyon tablolarını hazırlar.

Spektrotek ekibi: kalıcı bir dakikalık ürün görevi, eşleştirme POST'u, taslak ürün upsert'i, stok/fiyat güncellemesi, görsel indirme, sipariş outbox/yeniden deneme ve hata kuyruğunu uygulayın. İstek hedefi market sayfası değil portal API'sidir.

Birlikte kabul testi (önce test ürünü ve açıkça işaretlenmiş test siparişi):

1. Anahtarsız health 401; doğru anahtarla health 200. Ürün listesi 200 ve yalnız Spektrotek kayıtları.
2. Portalda yeni Spektrotek ürünü ekleyin; bir görev turunda mağazada tek taslak oluşsun ve eşleştirme geri yazılsın.
3. Mevcut SKU'yu eşleştirin; ikinci ürün oluşmasın. Çelişen SKU/barkod manuel kuyruğa düşsün; farklı bağlantı POST'u 409 olsun.
4. Portal satış fiyatı ve stok hareketi değişsin; sonraki turda revizyon ve mağaza fiyat/stok alanları değişsin; yayın durumu korunmalı.
5. Eşleşmiş ürünle örnek toplam formülüne uygun sipariş gönderin. Portalda S serisinde tek sipariş ve doğru kalem/müşteri bilgisi görülsün.
6. Aynı siparişi art arda ve eşzamanlı tekrar gönderin: tek portal kaydı; farklı içerikle aynı kimlik 409. Ağ kesintisi sonrası outbox aynı kaydı bulmalı.
7. Eşleşmemiş/Root ürünü ve hatalı toplam reddedilsin; yarım sipariş oluşmasın. Sipariş alımında stok düşmemeli; normal portal sevkiyatında bir kez düşmeli.
8. Geçici 503, görsel indirme hatası ve bir sayfa hatasında iş tekrar denensin; ürün kaybı/çift kayıt oluşmasın.

Kodun yerelde hazırlanması canlı sistemlerin bağlandığı anlamına gelmez; bu kabul testi iki tarafta kurulum tamamlandıktan sonra yapılmalıdır.
