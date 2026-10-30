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


## Telegram’dan görev tamamlama

Admin > Ayarlar > Telegram Bildirimleri sayfasında **Telegram görev düğmelerini
etkinleştir** düğmesine bir kez basın. İşlem yalnız yöneticiye açıktır. Botun
webhook adresi HTTPS portalındaki /api/telegram/kys olur; doğrulama anahtarı bot
token’ından sunucuda türetilir ve tarayıcıya verilmez. Başka bir webhook varsa
üzerine yazılmaz. Token değişirse bağlantıyı aynı düğmeyle yenileyin.

Bağlantı etkinleştikten sonra gönderilen günlük, haftalık ve geciken kişisel görev
mesajlarında görev başına ✅ düğmesi bulunur. Düğme yalnız mevcut görev alıcısının
kendi özel sohbetinde çalışır; aktif kullanıcı ve güncel KYS erişimi yeniden
kontrol edilir. Görev doğrudan Tamamlandı olur; görev geçmişine Telegram kaynağıyla
tek kayıt yazılır. Tekrar basmak ikinci geçmiş kaydı oluşturmaz. Başka kullanıcıya
atanmış veya silinmiş görev tamamlanmaz. Önceden gönderilmiş mesajlara geriye
dönük düğme eklenmez. Analiz ve kalite özetleri bilgilendirme mesajı olarak kalır.

Webhook açıkken getUpdates kullanılmaz. Yeni özel sohbetlerin yalnız Chat ID,
ad ve kullanıcı adı bilgileri KysTelegramChat tablosuna kaydedilir; mesaj içeriği
saklanmaz. Böylece eşleştirme listesi çalışmaya devam eder. Webhook açılmadan
önce bekleyen sohbet bilgileri de bu listeye alınır.

## Anında deneme gönderimi

Kayıtlı ve açık en fazla 10 alıcıyı, ardından bildirim türlerini seçip
**Seçilenlere deneme gönder** düğmesine basın. Yalnız alıcının kayıtlı tercihlerinde
açık olan seçili türler gönderilir. İşlem 09.00’u beklemez ve otomatik gönderim
kapalıyken de kullanılabilir; bot token’ı gereklidir. Kayıt yoksa bağlantıyı
denemek için kayıt bulunmadığını bildiren mesaj gider. Deneme mesajlarındaki görev
düğmeleri gerçek görevleri tamamlar.

Deneme gönderim kimliği otomatik özetlerden ayrıdır; sabah özetini engellemez.
Aynı kimlikle durum kontrolü tekrar mesaj üretmez. Gönderim belirsizse sonuç
tekrar sorgulanabilir; yeni deneme hazırlamadan önce sohbeti kontrol edin.


## Telegram’dan hızlı görev atama

Aynı webhook bağlantısı açıkken bota aşağıdaki biçimde mesaj yazılabilir:

- Selin bugün teklifleri kontrol et
- Oğuzhan Eker yarın kargo durumunu sor
- Selin bir hafta sonra stokları kontrol et
- Selin 05.11.2026 raporu hazırla

İsteğe bağlı /gorev öneki kullanılabilir. /yardim ve /help örnekleri gösterir.
Göndericinin özel sohbeti aktif portal kullanıcısıyla eşleştirilmiş ve KYS erişimi
olmalıdır. Alıcılar aktif ve KYS erişimi olan portal kullanıcıları arasından
ad/ad-soyad ile bulunur; alıcının Telegram kullanması zorunlu değildir. Türkçe
harfsiz adlar da eşleşir; birden fazla eşleşmede kişi seçimi gösterilir.

Tarihler Europe/Istanbul takvimine göre çözülür: bugün, yarın, bir hafta sonra,
1 hafta sonra; tam tarihler GG.AA.YYYY, GG/AA/YYYY veya YYYY-AA-GG olabilir.
Geçersiz ve geçmiş tarihler reddedilir. Görevin başlangıcı ve termini seçilen
gündür; kategori Rutin, ilk durumu Atandı olur. Görev metni en fazla 2000 karakter;
başlık ilk 220 karakter, açıklama metnin tamamıdır.

Bot kişi, tarih ve metni önizlemede gösterir. Görevi ata onayı alınmadan görev
oluşturulmaz. Taslaklar 30 dakika geçerlidir; İptal düğmesi taslağı kapatır.
Onay anında iki kişinin güncel erişimi tekrar kontrol edilir; taslak yalnız
oluşturan sohbet ve portal hesabı tarafından kullanılabilir. Satır kilidi altında
görev, atama geçmişi ve taslağın sonucu tek işlemde kaydedilir. Telegram’ın
tekrar iletmesi veya aynı onaya tekrar basılması ikinci görev oluşturmaz.
