# CRM mail servisi seçimi ve API kurulumu

21 Kasım 2026 tarihli değerlendirme. Bu belge kampanya servisleri için bir kurulum rehberidir. Portalda Brevo/Resend/SES API adaptörü, kampanya gönderim kuyruğu veya webhook endpoint'i bulunmaz; yalnızca anahtar oluşturmak kampanya gönderimini etkinleştirmez. **Birebir firmaya özel mail mevcut SMTP ayarlarıyla gönderilebilir**; bunun için yeni bir servis hesabı zorunlu değildir. Bu geliştirmede hesap, abonelik veya API anahtarı oluşturulmamıştır. Birebir gönderimin ayar ve yetki ayrıntıları [CRM dokümanındadır](crm.md).

## Önerilen seçenekler

| Sağlayıcı | Bu portal için değerlendirme | Dikkat edilmesi gereken |
| --- | --- | --- |
| **Brevo** | İzinli müşteri tanıtımı ve pazarlama için ilk değerlendireceğim seçenek. E-posta API'si, HTML içerik, teslim/açılma/tıklanma/ret olayları ve pazarlama araçları birlikte bulunur. Listeler ve editör portalda kalabilir. | Açık alıcı onayı politikası vardır. SMTP API kullanmak bir pazarlama iletisini işlem e-postasına dönüştürmez; kullanım amacının hesapta doğru tanımlanması gerekir. |
| **Resend** | Portalın kendi listeleri ve editörü üzerinden API odaklı, sade bir gönderim entegrasyonu için uygun aday. Doğrulanmış alan adı, kapsamı sınırlandırılmış anahtar ve webhook desteği bulunur. | Talep edilmeyen alıcılara gönderim yasaktır. Soğuk firma listesi için politika uygunluğu varsayılmaz. |
| **Amazon SES** | Gönderim altyapısını daha fazla kendimiz yönetmek istediğimizde değerlendirilebilir. AWS IAM, bölge, alan adı doğrulama ve olay altyapısı kurulumunu gerektirir. | Yeni hesaplar bölgeye özel sandbox ile başlar; gerçek alıcılara geniş gönderim için production erişim talebi gerekir. İşletim yükü daha fazladır. Fiyat, bölge/plan ve eklentilere göre güncel sayfadan kontrol edilmelidir. |

Önerim, alıcılar açık onaylı mevcut müşterilerse önce Brevo ve Resend'i değerlendirmek. İzinli pazarlama araçları öncelikliyse Brevo, portal içinden sade API yönetimi öncelikliyse Resend. Listeler henüz onay alınmamış yeni firmalardan oluşuyorsa önce alıcı toplama ve izin süreci netleştirilir; bu servisler izinsiz gönderim için alternatif değildir. API erişimi servis hesabı ihtiyacını kaldırmaz.

## Brevo ile hazırlık

1. Kurumsal Brevo hesabı açın, hesap doğrulamasını ve gönderim amacının değerlendirmesini tamamlayın. Kapsamı pazarlama ise bu amaçla bildirin.
2. Gönderici adı, gönderen adresi ve yanıt adresini belirleyin. Örnek: `Unique Analyse`, `bilgi@mail.uniqueanalyse.com`, yanıt adresi olarak mevcut ekip posta kutusu. Bu adresin gerçek kullanımını ve yanıt yönlendirmesini ayrıca doğrulayın; alan adını doğrulamak posta kutusu oluşturmaz.
3. Gönderim için size ait bir alt alan adını ekleyin. Örneğin `mail.uniqueanalyse.com`. Sağlayıcının gösterdiği DNS kayıtlarını alan adı yöneticisine girin. DKIM/DMARC ve sağlayıcının istediği diğer kayıtları aynen uygulayın; ana alan adının mevcut MX/SPF kayıtlarını rastgele değiştirmeyin veya ikinci SPF kaydı eklemeyin. Başarılı doğrulama görünmeden gönderim açmayın.
4. API key ayarlarından portal için ayrı bir anahtar oluşturun. Anahtar SMTP parolasından farklıdır. Anahtarı sohbet, Git, istemci kodu veya `NEXT_PUBLIC_*` değişkenleri içine koymayın; sunucunun secret/environment alanında saklayın. Bu rehber henüz portal tarafından okunan bir ortam değişkeni adı tanımlamaz; seçilen sağlayıcının adaptörü eklenirken gerçek ayar adları belirlenecektir.
5. Portal entegrasyonunda tek alıcılı API çağrısı, kalıcı gönderim kuyruğu, hız/günlük kota, durdur/devam et, tekrar gönderim koruması ve başarısız/belirsiz gönderim yönetimi eklenir. Her ileti ayrı alıcı ve ayrı sağlayıcı kimliğiyle kaydedilir; BCC listesi kullanılmaz.
6. Sağlayıcıda teslim, bounce, açılma, tıklanma, şikâyet ve ret olayları için webhook eklenir. **Portalın webhook adresi entegrasyon geliştirilmeden mevcut değildir.** Brevo'nun desteklediği Bearer token gibi kimlik doğrulama yöntemleriyle korunur. Resend seçilirse ham gövde üzerinden webhook imza doğrulaması yapılır. Tekrarlanan/sırasız olaylar güvenli biçimde işlenir.
7. Webhook sağlayıcının ulaşabildiği HTTPS adresinde olmalıdır. `localhost` doğrudan kullanılamaz. Yerel doğrulamada uygun bir HTTPS geliştirme adresi; gerçek kullanımda portalın yayımlanmış adresi gerekir.
8. Ret/şikâyet/kalıcı hata tüm kampanyalarda geçerli bir engel listesine işlenir. Ret veren alıcının sıradaki gönderimleri iptal edilir. İzin kaynağı ve alıcı türü tutulur; CRM izin alanı otomatik İYS entegrasyonu sağlamaz.
9. Önce kontrollü test alıcılarına gönderin. Gmail ve Outlook'ta konu, görsel, bağlantı, yanıt adresi, ret, bounce ve teslim olaylarını doğrulayın. Daha sonra sağlayıcı kotasına ve alan adının durumuna uygun hızla açın. Test geçmeden gerçek listeye gönderim başlatılmaz.

## Resend seçilirse

Hesap → Domains → size ait alan/alt alan adı ekleme → gösterilen DNS kayıtlarını doğrulama → API Keys → **Sending access** kapsamı ve mümkünse sadece ilgili alan adına sınırlama → anahtarı sunucu secret alanına kaydetme. Webhook ayarından teslim/açılma/tıklanma/bounce/complaint olayları seçilip signing secret sunucuda tutulur. Portal adaptörü ve webhook işleyicisi ayrıca geliştirilir; şu an hazır değildir.

## Takibin anlamı

`sent` sağlayıcının gönderim sürecini, `delivered` alıcı sunucunun kabulünü gösterir. Gelen kutusuna yerleşme/okunma garantisi değildir. Açılma ve tıklanma birer sinyaldir; gizlilik özellikleri ve güvenlik tarayıcıları nedeniyle “kesin incelendi” denmemelidir. Yanıt alma veya insan tarafından görüşme teyidi ayrı bir durum olarak tutulmalıdır. Tek tek gönderim de spam filtresi ve alıcı onayı gereksinimini ortadan kaldırmaz.

## Resmî kaynaklar

- [Brevo API başlangıcı ve anahtar oluşturma](https://developers.brevo.com/docs/quickstart)
- [Brevo tekil HTML e-posta API'si](https://developers.brevo.com/docs/send-a-transactional-email)
- [Brevo alan adı doğrulama](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- [Brevo webhook olayları](https://developers.brevo.com/docs/transactional-webhooks) ve [webhook güvenliği](https://developers.brevo.com/docs/secured-webhooks)
- [Brevo antispam ve açık onay politikası](https://help.brevo.com/hc/en-us/articles/209405205-What-is-the-anti-spam-policy-of-Brevo)
- [Resend alan adı doğrulama](https://resend.com/docs/dashboard/domains/introduction), [API anahtarları](https://resend.com/docs/dashboard/api-keys/introduction), [kullanım politikası](https://resend.com/legal/acceptable-use)
- [Amazon SES production erişimi](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) ve [güncel fiyatlandırma](https://aws.amazon.com/ses/pricing/)
