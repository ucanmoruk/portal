# Sonuç girişinde laboratuvar birimi

Hizmet detayındaki **Teknik Bilgiler → Bölüm** seçenekleri `/api/kys/birimler` üzerinden KYS laboratuvar birimleri listesinden gelir. Sabit bölüm adı filtresi yoktur. Personelin birimi **Admin → Kullanıcı Listesi → Laboratuvar Birimi** alanından atanır.

Sonuç girişinde personel yalnız kendi aktif birimine atanmış analizleri görebilir ve kaydedebilir. Kullanıcı birimi her istekte `RootKullanici.LaboratuvarBirimID` alanından okunur; birim değişince eski oturumun önceki birime erişimi sürmez. Atanmamış, pasif veya kimliği belirsiz birimler erişim vermez. Bölümü atanmamış hizmetler personele gösterilmez. Mevcut yönetici hesabı (ID 2) tüm analizlere erişir.

Kullanıcı birimi ve hizmet `BolumID` alanı doğrudan KYS `ID` değerini kullanır. Önceki `RootFirmaBirim` kimlikleri birim adı eşleşmesiyle otomatik olarak KYS kimliklerine dönüştürülür. Zaten geçerli KYS kimliğine sahip kayıtlar ve bölümü boş olan hizmetler değiştirilmez. Yeni bölüm seçimi API tarafında KYS listesinde doğrulanır.

Özel ve K.D. sonuç listeleri, alt formatlar, günlük sayaçlar, aramadan sonuç sekmesine geçiş ve Excel dışa aktarımı bu kapsamı uygular. Diğer ana sekmelerin sayaçları korunur. Analiz detayını okuma ve toplu/tek sonuç kaydetme API'leri de kapsamı uygular; yetkisiz analiz içeren toplu istek kayıt başlamadan HTTP 403 ile reddedilir. Challenge ve Stabilite ortak matrislerinde formatın TR/EN analizlerinin tamamı personele ait olmalıdır; karışık birim matrisleri paylaşılmaz.

Yükleme sonrası Node.js uygulamasını yeniden başlatın. Hizmet bölümlerini ve personel birimlerini kontrol edin. Mikrobiyoloji personeliyle aynı numunedeki mikrobiyoloji analizinin görünür, kimyasal analizin gizli olduğunu doğrulayın. Gizli analizin ID'sini doğrudan sonuç API'sine gönderme HTTP 403 dönmelidir.
