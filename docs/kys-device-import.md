# Cihaz prosedürü aktarımı

`/laboratuvar/kys/cihaz-listesi` mevcut KYS kayıt altyapısını kullanır. Cihaz kartında performans/bakım şartları, kalibrasyon şartnamesi, son uygulamalar ve işlem geçmişi birlikte gösterilir. İki şartname ekranı cihaz listesinin görüntüleme/düzenleme yetkisini kullanır. İşlem ve kalibrasyon kayıtlarının mevcut yetkileri korunur.

Kaynaklar `CihazListesi`, `CihazBakim`, `CihazKalibrasyon`, `CihazIslem` tablolarıdır. Birim `StokFirmaBirim`, tedarikçi `StokTedarikci`, uygulayan personel `StokKullanici`, kaynak doküman `StokDKDListe` üzerinden çözülür. `RootCihaz*` ve `Cihaz*Ex` farklı cihaz envanterleridir ve bu aktarıma karıştırılmaz.

`scripts/import-kys-devices.cjs <CihazListesi.xlsx>` yalnızca aktarım planını üretir. `--apply` aynı planı tek işlemde, değişiklik geçmişiyle ekler. Plan ve yedek `outputs/device-import-2026-11-17/` altındadır; bu klasördeki kaynak verileri Git'e eklemeyin. Cihazlar Excel'deki kod, ad, marka ve seri numarasıyla tek bir SQL cihazına eşleşmelidir. Başka portal cihazıyla kod çakışırsa işlem durur. İlişkili kayıtlar daha sonra kaynak `CihazID` üzerinden taşınır; aynı kodlu farklı cihazların geçmişleri birleştirilmez.

Her kaynak tablo/kimlik için sabit UUID üretilir. Tekrar çalıştırma aktarılmış kayıtları atlar; kullanıcı değişikliklerini veya geçmiş sürümleri güncellemez. Her kaydın `source` alanında kaynak tablo, kimlik, kaynak durumu ve parti bilgisi saklanır. Portalda düzenleme bu köken bilgisini korur. Eski SQL tabloları değiştirilmez.

Eski işlem kayıtları `Aktarıldı` veya `Pasif Eski Kayıt` olarak gösterilir; kaynak açıklamasındaki `Uygun` sözcüğü yeni portal onayına dönüştürülmez. Son kalibrasyon hesabı aktif aktarılmış uygulamaları da kapsar. Pasif kayıtlar işlem geçmişinde isteğe bağlı gösterilir. Gerçekleşen tarih ve sonraki tarih korunur; kaynakta bulunmayan ilk planlanan tarih, sorumlu, sertifika numarası ve değerlendiren kişi doldurulmaz. Alım yılı kesin kullanıma alma tarihine çevrilmez. Eski belge adları korunur, belge dosyaları bu SQL tablolarında bulunmaz.

`CihazIslem` kalibrasyon tipi kimliği taşımadığından aynı cihazın çoklu şartnameleri işlem satırlarına çoğaltılarak bağlanmaz. Ölçüm noktaları ve kriterler kartta ayrı, cihazla ilişkili şartnameler olarak görüntülenir.

Doğrulama: `node scripts/test-kys-device-import.cjs`, `node scripts/test-kys-workspace.cjs`, TypeScript ve ilgili dosyalarda ESLint. Aktarım önizlemesi 164 cihaz, 16 bakım şartı, 134 kalibrasyon/ara kontrol şartı ve 179 tarihsel işlem içerir. Dört Excel dosyasındaki satırların tamamı kaynak SQL ile karşılaştırılmıştır. Ek SQL şartları ve eski uygulamalar da korunur. Excel'de yer almayan C.K.33 ile C.K.35'in boş mükerrer kaydı aktarılmaz; özgün SQL tablosunda kalır.
