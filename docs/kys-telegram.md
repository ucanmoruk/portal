# KYS Telegram bildirimleri

Admin > Ayarlar > Telegram Bildirimleri sayfasında yöneticilere **Telegram Bildirimleri** ayarları görünür.
Kişiler için beş abonelik ayrı seçilir:

- Günlük kişisel işler: her gün 09.00; yalnız kişiye atanmış, tamamlanmamış,
  başlamış veya gecikmiş işler. Başlangıcı ileride olan işler hariçtir.
- Haftalık kişisel işler: pazartesi 09.00; o hafta başlayacak/devam eden ve
  gecikmiş işler. Hafta pazartesi–pazar, saat dilimi Europe/Istanbul'dur.
- Bugün çıkacak analizler: her gün 09.00; Lab Akışı'nda termin tarihi bugün olan,
  tamamlanmamış analizler. Ara günler ve sadece bugün başlayan analizler hariçtir.
- Geciken işler: her gün 09.00; kişiye atanmış, termin tarihi bugünden önce olan ve tamamlanmamış görevler ayrıca hatırlatılır. Tamamlanınca durur; aynı gün tekrar gönderilmez. Günlük özet de açıksa görev orada da görünebilir.
- Kalite işleri: her gün 09.00; Lab Akışı'nda bugüne planlanan, tamamlanmamış işler.

Kayıt yoksa boş Telegram mesajı gönderilmez. Özet, ilk zamanlayıcı çalışmasında
oluşur; aynı gün sonradan eklenen işler için ek mesaj üretilmez. Haftalık görev
kaçırılırsa aynı hafta ilk uygun çalışmada telafi edilir; günlükte eski günler
geriye dönük gönderilmez. Mesajlarda portal bağlantısı bulunur.

## Kurulum

1. BotFather'dan bir bot oluşturun veya yönetilen mevcut botu kullanın.
2. Sunucunun ortam değişkenlerine `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`,
   `KYS_TELEGRAM_PORTAL_URL=https://lab.uniqueanalyse.com` ve en az 32 karakterlik
   rastgele `KYS_TELEGRAM_CRON_SECRET` ekleyin. Tokeni sohbete veya Git'e yazmayın.
3. Her alıcı Telegram'da botu açıp `/start` mesajı göndersin. Admin > Ayarlar >
   Telegram Bildirimleri sayfasında bota mesaj yazan kişiler otomatik listelenir.
   Telegram listesini yenile düğmesiyle tekrar okuyabilirsiniz. Portal kullanıcısını
   seçip listedeki kişiye tıklayın; Chat ID forma aktarılır. Liste mesaj göndermez,
   offset ilerletmez ve mevcut webhook varsa değiştirmeden durur. Yalnız bekleyen
   güncellemelerdeki son 100 kayıt okunur; boşsa yeni mesaj gönderin. Terminal
   alternatifi: `node scripts/telegram-chat-ids.mjs`.
4. Yönetici ayarlarından portal kullanıcısını seçin, kişinin Chat ID'sini girip
   aboneliklerini kaydedin. Özel sohbet Telegram `getChat` ile doğrulanır.
   Aynı Chat ID iki kullanıcıya bağlanamaz; grup/kanal adresleri kabul edilmez.
5. Hazır olunca `KYS_TELEGRAM_ENABLED=true` yapın ve uygulamayı yeniden başlatın.
6. cPanel Cron Jobs'a her beş dakikada bir, proje dizininde
   `node scripts/run-kys-telegram.mjs` çalıştıran görev ekleyin. Node yolunu
   sunucudaki uygulama Node sürümüne göre ayarlayın. Anahtar komut satırına yazılmaz.

Üretimde Node worker da beş dakikada bir kontrol yapar. Uygulama uyursa
uyandırılması için dış cron asıl tetikleyici olmalıdır. Serverless ortamda
kalıcı timer'a güvenilmez; aynı HTTPS cron uç noktası dış zamanlayıcıdan Bearer
anahtarıyla çağrılmalıdır. Geliştirme ortamında worker otomatik başlamaz.

## Erişim ve gönderim güvenilirliği

Her çalışmada kullanıcının aktifliği, KYS yetkileri ve laboratuvar kapsamı
yeniden okunur. Analizler mevcut ekranın bölüm sınırlarıyla filtrelenir.
Görevlerde oluşturanın tüm görevleri değil, yalnız alıcıya atanmış olanlar seçilir.
Kalite kapsamı mevcut Lab Akışı ekranındaki kapsamla aynıdır. Gönderim sırasında
abonelik, Chat ID veya erişim değişirse kalan parçalar iptal edilir.

Uzun özetler Telegram sınırının altında parçalara ayrılır. Kalıcı rapor anahtarı
kullanıcı/sohbet/tür/dönem/erişim kapsamına bağlıdır; ilk içerik dondurulur.
Atomik sahiplenme, paralel cron ve worker çağrılarının aynı özeti tekrar
göndermesini engeller. Telegram 429 yanıtında `retry_after` süresi beklenir ve
yalnız tamamlanmamış parçadan devam edilir. Ağ sonucu belirsizse otomatik
tekrar yapılmaz. `sending` durumunda kalmış kayıt da körlemesine yeniden
gönderilmez; yönetici son gönderim kayıtlarından kontrol eder.

Sunucuda token eksikse veya gönderimler kapalıysa gerçek bildirim gönderilmez.
Token istemciye, kayıt tablosuna veya hata mesajına yazılmaz.

Bot API: https://core.telegram.org/bots/api#sendmessage
