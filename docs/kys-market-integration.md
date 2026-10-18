# KYS ürün kataloğu ve Spektrotek Market entegrasyon hazırlığı

## Bu değişiklikte çalışan yapı

- `/laboratuvar/kys/stok-listesi`: yalnızca `Kaynak=Unique`; kaynak sütunu ve filtresi yok.
- `/laboratuvar/kys/urun-listesi`: `Kaynak=Root` veya `Spektrotek`.
- Her iki ekran `KysStokKart` tablosundaki aynı stok kimliğini kullanır. Kod, barkod, miktar, birim, hareket, kritik limit ve sertifikalar ortaktır. Ayrı bir ürün stoğu oluşturulmaz.
- Talep/sipariş stok seçicisi, kullanıcıya yetkili olduğu bütün kaynakları aynı API üzerinden getirir; ekran ayrımı stok seçicisini sınırlandırmaz.
- Yeni ürün bilgileri aynı stok satırında `UrunBilgileri` içinde, doğrulanan JSON olarak saklanır. Eski stoklarda alanlar boş başlar. Kaynak ataması yalnızca kaynağı boş olan kayıtlara uygulanır.
- Fotoğraflar `KysStokGorsel` tablosunda stok kimliğine bağlıdır; en fazla 24 adet, her biri en fazla 5 MB. JPEG/PNG/WebP dosya imzası kontrol edilir. İlk fotoğraf kapaktır; kapak, sıra ve alternatif metin düzenlenebilir. Kaldırma işlemi dosyayı fiziksel olarak silmez. İlk galeri yüklemesinde mevcut tek fotoğraf aynı işlem içinde galeriye taşınır.
- Yetki kontrolü liste, kart ve görsel API'lerinde kaynak/firma bazında yapılır.
- Web seçimi sadece gelecekte aktarılacak ürünleri işaretler. Henüz dışarıya veri gönderilmez, webhook veya otomatik sipariş açılmaz.

## Katalog alanları ve eşleştirme

18 Ekim 2026 tarihinde incelenen [Spektrotek Market](https://spektrotek.com/market) sayfasında marka/kategori filtreleri, SKU, açıklama, normal/indirimli EUR fiyatları ve stok/tedarik bilgileri bulunuyor. Aşağıdaki model bu görünen ihtiyaçlara göre hazırlandı; sitenin özel API veya veritabanı şeması doğrulanmış değildir.

| Portal alanı | Kullanım |
| --- | --- |
| Stok `id` | Portalın değişmeyen yerel kimliği |
| `kod` | SKU; mevcut sistemde stok kodu tektir |
| `ad`, `name` | Ürün adı ve İngilizce adı |
| `kategori`, `marka` | Katalog sınıflandırması; şimdilik metin |
| `satisFiyati` | Güncel satış fiyatı; KDV hariç, en fazla iki ondalık |
| `listeFiyati` | İsteğe bağlı normal/eski fiyat; satış fiyatından düşük olamaz |
| `paraBirimi` | EUR, USD, TRY veya GBP |
| `kdvOrani` | Yüzde, 0–100; bilinmiyorsa boş kalır, tahmin edilmez |
| `kisaAciklama`, `urunAciklamasi` | Düz metin; listede kısa içerik, detayda uzun içerik |
| `ozellik`, `ambalaj`, `birim`, `casNo` | Mevcut teknik ve paket/birim bilgileri |
| `tedarikDurumu` | Stoktan / Tedarik süreli / Teklif ile |
| `teslimSuresi` | Örn. ürünün gerçek tedarik süresi; kullanıcı doldurur |
| `webSecili` | Gelecekte web senkronizasyonuna dahil etme seçimi |
| `webUrunId`, `webSlug` | Mevcut web ürününü kimliğiyle eşleştirme ve URL yolu |
| Galeri `id`, `sira`, `altMetin` | Görsel kimliği, kapak/sıra ve erişilebilir açıklama |

Web için seçim yapılırken kategori, marka ve açıklama zorunludur. Doğrudan satılan üründe pozitif fiyat ve KDV oranı da gerekir; teklifle satılan üründe fiyat şartı aranmaz. Web aktarımı uygulanırken en az bir fotoğraf, eşleşmenin tekilliği ve sitenin zorunlu alanları ayrıca kontrol edilmelidir. Hazırlık seçimi, “siteye yayımlandı” anlamına gelmez.

Stok miktarı fiziksel toplamdır. Gelecekte siteye gönderilecek **satılabilir miktar** için satış deposu, rezervasyon, güvenlik stoğu ve tedarik süreli ürünlerin satış politikası kararlaştırılmalıdır. KYS toplam miktarı doğrudan web stoğu kabul edilmemelidir.

Her satılabilir varyant için ayrı SKU ve stok kartı kullanılması mevcut yapıyla uyumludur. Web sitesi ana ürün/varyant modeli kullanıyorsa `product_id` ile `variant_id` eşlemesi entegrasyon katmanında ayrıca kurulmalıdır. Portalın otomatik ürettiği barkodun ticari GTIN/EAN olarak geçerli olduğu varsayılmamalıdır.

## Web sitesi tarafından sağlanması gerekenler

1. **Teknik erişim:** kullanılan altyapı ve sürüm, ürün/sipariş API dokümanı, test ortamı, erişim yöntemi ve kapsamları. API anahtarı/secret sunucu ortam değişkeninde tutulmalı; tarayıcıya veya bu dokümana yazılmamalı.
2. **Mevcut ürün dışa aktarımı:** web ürün/varyant kimliği, SKU, kategori/marka kimliği ve adları, para birimi, fiyatların KDV dahil/hariç oluşu, KDV sınıfı, stok ve satış birimi, görsel sırası, ürün URL'si ve yayım durumu. Önce mevcut SKU'lar eşleştirilmeli; yeni ürünler mükerrer açılmamalı.
3. **Alan sözleşmesi:** kategori/marka oluşturma kuralları, HTML açıklama desteği, görsel yükleme yöntemi/boyutları, fiyat hassasiyeti, çoklu dil/varyant/kur politikası ve stokta olmayan ürün davranışı.
4. **Sipariş webhook'u veya sorgulama API'si:** yeni sipariş, ödeme, iptal ve iade olayları; örnek gerçek yapıya uygun anonimleştirilmiş payload; imza doğrulama yöntemi, yeniden deneme ve olay kimliği.

## Gelen siparişte gerekli veri

| Grup | Gerekli alanlar |
| --- | --- |
| Kimlik | Site/mağaza kimliği, değişmeyen sipariş ID'si ve numarası, olay ID'si, olay türü, oluşturma/güncelleme zamanı ve saat dilimi |
| Müşteri | Web müşteri ID'si (varsa), kişi/firma adı, e-posta, telefon |
| Fatura | Fatura tipi, ticari unvan, vergi no/TCKN gerekli olduğu durumda, vergi dairesi, fatura adresi/il/ilçe/ülke/posta kodu |
| Teslimat | Alıcı ve telefonu, teslimat adresi, kargo yöntemi, teslimat ücreti, müşteri notu |
| Kalemler | Değişmeyen kalem ID'si, web ürün/varyant ID'si, SKU, sipariş anındaki ad, miktar, satış birimi/paket katsayısı, birim fiyat, KDV oranı ve tutarı, indirim, satır net/brüt toplamı |
| Tutarlar | Para birimi, ara toplam, indirimler/kupon, kargo net/KDV/brüt, toplam KDV ve genel toplam; sipariş anındaki kur varsa kur |
| Ödeme | Ödeme yöntemi, ödeme durumu ve referansı, ödenen tutar; kart numarası/CVV gibi ödeme sırları alınmaz |
| Süreç | Web sipariş durumu, iptal/iade edilen kalem ve miktarlar, kargo takip bilgisi gerektiğinde |

## Sonraki entegrasyonun kabul koşulları

- Ürün güncellemelerinde web kimliği + SKU eşleşmesi esas alınmalı. SKU çakışması veya bulunamayan ürün otomatik olarak başka bir stoğa bağlanmamalı; inceleme kuyruğuna alınmalı.
- Siparişin sahibi firma **Spektrotek**, siparişin alıcı firması ise **müşteri** olmalı. Ürün kaynağı Root olsa da bu iki kavram karıştırılmamalı.
- Sipariş kalemleri sipariş anındaki fiyat, vergi, ad ve adresin kopyasını tutmalı; daha sonraki katalog değişikliklerinden etkilenmemeli.
- `store_id + order_id` ile sipariş, `event_id` ile olay tekilleştirilmeli. Webhook yeniden geldiğinde ikinci sipariş veya ikinci stok hareketi oluşmamalı.
- İmza ve zaman penceresi doğrulanmalı; sırlar güvenli saklanmalı; kabul edilen olay dayanıklı kayda alındıktan sonra başarılı yanıt dönülmeli. Başarısız işlemler yeniden denenebilir olmalı.
- Mevcut KYS Sipariş Listesi `KysTalep` üzerinde çalışıyor. Otomatik aktarım yazılırken dış sipariş/kalem/olay kimlikleri, ödeme, adres, vergi, para birimi ve tutar kopyaları için ayrı entegrasyon şeması/migration eklenmeli; mevcut `firmaAdi` ve `notlar` alanlarına sıkıştırılmamalı.
- “Web siparişi geldi” olayı stok düşümü sayılmamalı. Rezervasyon ve mevcut KYS sipariş tamamlama hareketi tek kuralla bağlanmalı; ödeme, iptal ve iadelerde aynı hareket iki kez uygulanmamalı.
- Seçili ürünlerin yayın kuyruğu, son başarılı senkronizasyon tarihi, hata ve tekrar deneme kayıtları gerçek entegrasyon uygulanırken eklenmeli. Bu sürümde gerçekte yapılmamış senkronizasyona ait başarı durumu gösterilmez.

## Kontroller

`node scripts/test-kys-stock-sources.cjs` ve `node scripts/test-kys-products.cjs` çevrimdışı sınır/izolasyon/doğrulama testlerini çalıştırır. Yeni alan ve tablo, ilk KYS erişiminde mevcut MySQL/MSSQL şema hazırlığıyla eklenir; bu kodun kurulması veya veri hazırlığı, web sitesiyle bağlantı kurulduğu anlamına gelmez.
