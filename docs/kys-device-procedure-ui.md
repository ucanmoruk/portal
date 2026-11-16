# Cihaz Prosedürü

KYS yan menüsündeki açılır **Cihaz Prosedürü** grubu dört sayfadan oluşur: Cihaz Listesi, Kalibrasyon ve Ara Kontrol, Teknik Şartname, Performans Bakım. Mevcut adresler ve kayıtlar korunur. Şartname ve bakım için mevcut cihaz listesi yetkileri geçerlidir; ayrıca ayrı sayfa yetkisi atanabilir.

Cihaz listesinde kod veya Sicil kartı düğmesi sayfadan ayrılmadan native dialog açar. Kartın Bilgiler ve Şartlar, Cihaz İşlem Kayıtları, Kalibrasyon Belirsizlikleri ve Değişiklik Geçmişi bölümleri vardır. İşlem ve belirsizlik kayıtları bu karttan yönetilir. Eski bağımsız liste adresleri cihaz listesine, cihaz filtresiyle gelen adresler ilgili kart bölümüne yönlenir. API adresleri ve eski detay bağlantıları korunur.

Dört tabloda Güncelleyen sütunu kaldırılmıştır. Cihaz listesinde son/sonraki kalibrasyon tarihleri yoktur; kart ve etikette bu bilgiler korunur. Teknik şartname ve bakım metinleri tabloda kısa önizleme, kaydın popup'ında tam metin olarak gösterilir. Masaüstünde sabit tablo yerleşimi, küçük ekranlarda etiketli iki sütunlu satır düzeni kullanılır. Renk, yazı tipi, buton, kenarlık ve kartlar mevcut portal değişkenlerini kullanır.

Doğrulama: gerçek verilerle dört alt menü bağlantısı; adres değişmeden kart açma; iç içe detay ve Escape ile kapatma; işlem formunda cihazın önceden seçilmesi; kart içinde belirsizlik; eski adres yönlendirmesi; 1280, 1440, 320, 375, 414 ve 768 piksel genişliklerde yatay taşma kontrolü. Kontroller veri yazmaz. Aktarım ve KYS iş akışı regresyon testleri de çalıştırılır.
