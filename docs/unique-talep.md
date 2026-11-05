# Unique Talep

İletişim menüsünde Spektrotek Talep'in altındadır. `iletisim.unique-talep` yetkisi gerekir; yöneticide otomatik açıktır.

## Posta kutusu

`info@uniqueanalyse.com` hesabının INBOX klasörü IMAP üzerinden **salt okunur** taranır; okundu bayrakları, klasörler ve mesajlar değiştirilmez. Son 30 günün yeni mesajları her çalışmada en fazla 40 adet alınır. Önce güncel mesajlar işlenir; eski mesajlar sonraki çalışmalarda tamamlanır. Kaynak anahtarı hesap, klasör, UIDVALIDITY ve UID'den oluşur; tekrarlanan taramalar kullanıcı düzenlemelerini değiştirmez. Ekler indirilse de saklanmaz veya yapay zekâya gönderilmez. 5 MB üzerindeki mesajlarda yalnızca zarf bilgileri alınır; içeriğin posta kutusundan incelenmesi belirtilir.

Mevcut Admin → Ayarlar değerleri kullanılır: `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`. IMAP varsayılanı TLS/993'tür. Gerekirse `.env` veya PortalAyarlar üzerinden `UNIQUE_IMAP_HOST`, `UNIQUE_IMAP_PORT`, `UNIQUE_IMAP_USER`, `UNIQUE_IMAP_PASS` tanımlanabilir. Kullanıcı `info@uniqueanalyse.com` olmalıdır. Gönderim mevcut SMTP ayarlarını kullanır ve info hesabı gerektirir.

Mevcut `scripts/run-kys-telegram.sh` beş dakikalık cron'u artık Telegram ile birlikte `/api/cron/unique-talep` endpoint'ini de çağırır. İki iş birbirinden bağımsızdır; aynı `KYS_TELEGRAM_CRON_SECRET` kullanılır. Yeni cron veya yeni anahtar gerekmez. Sayfadaki **Posta kutusunu tara** düğmesi de aynı taramayı başlatır. Tarama müşteri e-postası göndermez.

## Sınıflandırma ve teklif

İlk sınıflandırma Türkçe/İngilizce hizmet, fiyat ve talep ifadeleriyle kural tabanlıdır. Potansiyel müşteriler varsayılan görünümde listelenir; **Tüm e-postalar** görünümünden yanlış negatifler bulunup düzeltilebilir. Otomatik sınıflandırma kesin karar değildir. Gelen içerik yalnızca yetkili kullanıcının **Yapay zekâ ile hazırla** işlemiyle CRM sağlayıcısına gönderilir; ortak CRM bilgi notları, hizmet ve paket kataloğu kullanılır.

Firma eşleştirme/yeni firma, düzenlenebilir hizmet/adet/fiyat/kapsam, paket başlığı ve parametreleri, yanıt ve Oğuzhan Eker imzası desteklenir. Taslak UniqueTalep içinde saklanır. **Teklif listesine kaydet** mevcut TeklifBaslik/TeklifKalem kayıtlarını oluşturur/günceller. **Yanıt ve PDF teklifi gönder** önce teklifi kaydeder, mevcut teklif baskı şablonundan PDF üretir ve yazılan açıklama + imza ile tek alıcıya yollar. PDF üretilemezse SMTP çağrılmaz. Başarılı SMTP kabulünden sonra talep **Teklif İletildi**, teklif **Onay Bekleniyor** olur.

Gönderim ve kayıt değişiklikleri sürüm denetimiyle korunur. Gönderim sürerken ikinci gönderim kabul edilmez. SMTP zaman aşımında sonuç **Belirsiz** olarak saklanır; otomatik tekrar yapılmaz. Bu durumda sistem yöneticisi posta sunucusu teslim kayıtlarını kontrol etmelidir. `Gönderildi` SMTP kabulünü belirtir; alıcının okuduğu veya spam filtresinden geçtiği anlamına gelmez.

Yeni tablolar `UniqueTalep` ve `UniqueTalepSync` ilk kullanımda oluşturulur. E-posta içerikleri veritabanında saklanır; uygulama dosyalarına veya Git'e yazılmaz. İmzalı gerçek müşteriye test gönderimi yapılmamalıdır.
