# ÜGD Portal — Geliştirici Onboarding Dokümanı

## Genel Bakış

**ÜGD Portal**, kozmetik/laboratuvar alanında faaliyet gösteren bir şirkete ait iç kullanım web uygulamasıdır. Numune kabulünden rapor gönderime, müşteri teklifinden fatura takibine kadar uzanan iş süreçlerini tek bir panel üzerinden yönetir.

---

## Teknoloji Stack

| Katman | Teknoloji | Sürüm |
|---|---|---|
| Framework | Next.js (App Router) | **16.2.1** |
| UI | React | 19.2.4 |
| Dil | TypeScript | ^5 |
| Auth | next-auth | ^4.24.13 |
| Veritabanı | Microsoft SQL Server (MSSQL) | — |
| ORM | Yok — raw SQL, `mssql` paketi | ^12.2.1 |
| Stil | CSS Modules (Apple HIG dili) | — |
| E-posta | nodemailer | ^7.0.13 |
| Word rapor | docxtemplater + pizzip | ^3.68.3 |
| Excel | xlsx | ^0.18.5 |
| Grafikler | chart.js + react-chartjs-2 | ^4.5.1 |
| FTP | basic-ftp | ^5.2.0 |
| İkon | lucide-react | ^1.8.0 |

### Kritik Next.js 16 Farklılıkları (Breaking Changes)
- **`params` her zaman `Promise<{id:string}>` döner** → `await params` zorunlu
- Dinamik route `page.tsx` içinde `const { id } = await params` şeklinde okunmalı
- Kodu yazmadan önce `node_modules/next/dist/docs/` içindeki kılavuzu okuyun

---

## Mimari

```
app/
  (dashboard)/
    layout.tsx        ← Server Component — session alır, DB'den PortalYetki çeker,
    │                    Sidebar'a allowedKeys ve isAdmin prop'larını geçer
    ├── admin/
    ├── ugd/
    ├── musteriler/
    └── laboratuvar/
  api/                ← Route Handler'lar (REST API)
  login/
  teklif-print/[id]/  ← Baskı sayfası (session gerektirmez)

components/
  Sidebar.tsx         ← Props: allowedKeys:string[], isAdmin:boolean

lib/
  auth.ts             ← CredentialsProvider; kolon adları runtime'da dinamik okunur
  db.ts               ← poolPromise (ConnectionPool singleton)
  menuConfig.ts       ← MENU_TREE ve allMenuKeys() — tek kaynak
  numuneFormTables.ts ← Runtime DB şema kontrolü (NKR, NKR_Formul, NKR_Log)
  rapor/
    getReportData.ts  ← DB'den rapor verisi çeker
    fillTemplate.ts   ← docxtemplater ile sablon/*.docx doldurur
  spektrotek/         ← Spektrotek modülü server action'ları

migrations/           ← El ile çalıştırılan SQL migration dosyaları
sablon/               ← Word rapor şablonları (Genel.docx; diğerleri eklenecek)
```

---

## Kimlik Doğrulama & Yetki

### Auth (`lib/auth.ts`)
- `CredentialsProvider` — kullanıcı adı + şifre ile giriş
- Tablo: `RootKullanici` — **kolon adları dinamik okunur** (`KullaniciAdi` veya `Kadi`, `Sifre` veya `Parola` gibi alternatifler DB'ye göre değişebilir)
- Session'a `userId` ve `birimId` enjekte edilir (`types/next-auth.d.ts`)
- Şifre: bcryptjs ile hash'lenir

### Yetki Sistemi
```
PortalYetki tablosu: KullaniciID ↔ MenuKey
```
- `allowedKeys` dizisi **boşsa** → kısıtlama yok (tüm menü açık)
- `isAdmin` → `Set(["1","2"])` (Selin:1, Oğuzhan:2)
- Menü key'leri `lib/menuConfig.ts`'deki `MENU_TREE`'den türer

---

## Menü Modülleri & Sayfalar

### 1. ÜGD Detayları
Kozmetik ürün bilgileri ve mevzuat yönetimi.

| Sayfa | Yol | Açıklama |
|---|---|---|
| Ürün Listesi | `/ugd/urun-listesi` | Şirket ürün kataloğu, CRUD |
| Cosing | `/ugd/cosing` | AB Cosing veritabanı sorgulama |
| Yönetmelik | `/ugd/yonetmelik` | Mevzuat/yönetmelik görüntüleme |
| Firma Listesi | `/ugd/firma-listesi` | Tedarikçi/müşteri firma kaydı |

### 2. Formül Kontrol
- Yol: `/ugd/formul-kontrol`
- Kozmetik formülasyon bileşenlerini Cosing/yönetmelik kurallarına karşı kontrol eder
- API: `/api/formul-kontrol/match`

### 3. Müşteriler

| Sayfa | Yol | Açıklama |
|---|---|---|
| Müşteri Listesi | `/musteriler/musteri-listesi` | CRM benzeri müşteri kaydı |
| Teklif Listesi | `/musteriler/teklif-listesi` | Teklifler; Word/PDF export + e-posta gönderimi |
| Proforma Listesi | `/musteriler/proforma-listesi` | Proforma fatura takibi |
| Fatura Takip | `/musteriler/fatura-takip` | Fatura durumu izleme |

**Teklif özellikleri:**
- `/api/teklifler/[id]/export` → Word/PDF çıktı
- `/api/teklifler/[id]/mail` → e-posta ile gönder
- `/teklif-print/[id]` → baskı görünümü (public route)

### 4. Laboratuvar ⭐ (Ana Modül)

#### 4.1 Numune Kabul (`/laboratuvar/numune-takip`)
- Numune listesi: sayfalama + arama
- API: `/api/numune-kabul`

#### 4.2 Numune Formu (`/laboratuvar/numune-form` ve `/numune-form/[id]`)
Dört sekmeli form yapısı:

| Sekme | Dosya | İçerik |
|---|---|---|
| Tab1 Bilgiler | `Tab1Bilgiler.tsx` | Numune genel bilgileri (Firma, Ürün, Tarih, Evrak No, Rapor No, Dil, SKT…) |
| Tab2 Hizmetler | `Tab2Hizmetler.tsx` | Test hizmetleri seçimi (paket veya tekil), Termin belirleme |
| Tab3 Formül | `Tab3Formul.tsx` | Kozmetik formülasyon bileşen listesi |
| Tab4 Geçmiş | `Tab4Gecmis.tsx` | İşlem log geçmişi (NKR_Log) |

**Form veri yapısı (`numuneFormTypes.ts`):**
- `NkrFormData` — 30+ alan (Barkod, Teklif_No, Evrak_No, RaporNo, Revno, Grup, Tur, Dil, Firma_ID, Numune_Adi, Miktar, SeriNo, UretimTarihi, SKT, Hedef_Grup, foto…)
- `HizmetRow` — AnalizID, Termin, Limit, Birim, LOQ
- `FormulRow` — HammaddeID, INCIName, Miktar, DaP, Noael, Cas

**Runtime şema kontrolü:**
```typescript
// lib/numuneFormTables.ts
nkrHasColumn(pool, "Sonuc")        // Migration uygulanmış mı?
hasNkrFormulTable(pool)             // NKR_Formul tablosu var mı?
hasNkrLogTable(pool)                // NKR_Log tablosu var mı?
```
Eski DB'lerde bazı kolonlar/tablolar olmayabilir — kod runtime'da kontrol eder.

#### 4.3 Rapor Takip (`/laboratuvar/rapor-takip`)
İki seviyeli liste yapısı:

**1. Seviye — Ana tablo:**
`Tarih | Evrak No | Rapor No | Firma/Proje | Numune Adı | Rapor Türü | Rapor Durumu | Yazdır | Gönder`

**2. Seviye — Genişletilmiş satır (hizmetler):**
`Kod | Ad | Metot | Birim | Sonuç | Limit | Değerlendirme`

- **Rapor Türü** → `StokAnalizListesi.RaporFormati` kolonuna göre belirlenir (4 farklı format)
- **Yazdır:** `/api/rapor-takip/yazdir/[id]?output=docx` (indir) veya `?output=html` (önizleme)
- **Gönder:** `/api/rapor-gonder/[id]` → nodemailer ile DOCX ek olarak e-posta

#### 4.4 Sonuç Girişi (`/laboratuvar/sonuc-giris`)
- Numune bazında analiz sonuçlarını girme
- `/sonuc-giris/[raporId]` — detay sayfası
- API: `/api/sonuc-giris/[x1id]`

#### 4.5 Hizmet Listesi (`/laboratuvar/hizmet-listesi`)
- `StokAnalizListesi` tablosu üzerinde CRUD
- API: `/api/hizmetler` ve `/api/hizmetler/[id]`

#### 4.6 Hizmet Paketleri (`/laboratuvar/hizmet-paketleri`)
- `NumuneX3` (paket) + `NumuneX4` (paket kalemleri) tabloları
- API: `/api/lab/paketler`, `/api/lab/paketler/[id]`, `/api/lab/paketler/[id]/items`

#### 4.7 KYS (`/laboratuvar/kys`)
Kalite Yönetim Sistemi modülü.

### 5. Spektrotek
Spektrotek firmasına ait mini ERP modülü:

| Alt Modül | Açıklama |
|---|---|
| Özet Panel | Dashboard — grafikler, özet kartlar |
| Talepler | Hizmet talepleri + detay sayfası `[id]` |
| Teklifler | Teklif oluşturma/yönetim + detay sayfası `[id]` |
| Müşteriler | Spektrotek müşteri kaydı |
| Ürünler | Ürün kataloğu |
| Faturalar | Fatura listesi |
| Satın Alma | Satın alma talepleri |
| Servis | Servis kayıtları |

Server action'lar: `lib/spektrotek/` klasöründe (customerActions, quoteActions, requestActions, productActions, dashboardActions, exchangeRates)

### 6. Admin

| Sayfa | Açıklama |
|---|---|
| Yetki Listesi | Kullanıcıya menü key'i ata/kaldır |
| Muhasebe | iframe — `public/muhasebe-paneli.html` (Google Sheets embed) |
| Ayarlar | Sistem ayarları (SMTP, genel konfigürasyon) |

---

## Veritabanı Tabloları

### Ana Tablolar

| Tablo | Açıklama | Kritik Kolonlar |
|---|---|---|
| `RootKullanici` | Kullanıcılar | Kolon adları dinamik (KullaniciAdi/Kadi, Sifre/Parola) |
| `PortalYetki` | Yetki eşleşmesi | KullaniciID, MenuKey |
| `StokAnalizListesi` | Lab hizmet kataloğu | ID, Kod, Ad, AdEn, Method, MethodEn, Matriks, Akreditasyon, Sure, Fiyat, ParaBirimi, **RaporFormati**, NumDipnot, NumDipnotEn |
| `NumuneX3` | Hizmet paket listeleri | ID, ListeAdi, Aciklama, Durum (Aktif/Pasif) |
| `NumuneX4` | Paket kalemleri | ListeID→NumuneX3, HizmetID→StokAnalizListesi, LimitDeger, LimitBirimi, Notlar |
| `NKR` | Numune kayıt başlıkları | Tüm form Tab1 alanları + opsiyonel kolonlar |
| `NumuneX1` | Numune-hizmet satırları | Sonuc, Degerlendirme, YetkiliKisi (opsiyonel) |
| `NKR_Formul` | Formülasyon bileşenleri | HammaddeID, INCIName, Miktar, DaP, Noael |
| `NKR_Log` | İşlem logları | NkrID, Aksiyon, KullaniciAdi, Tarih |

### Migration Sistemi
`migrations/` klasöründe el ile uygulanan SQL dosyaları:
- `001` — StokAnalizListesi'ne limit kolonları
- `002/003` — NumuneX1/X4'e İngilizce limit kolonu
- Diğerleri: `Sonuc`, `Degerlendirme`, `YetkiliKisi`, log tablosu güncellemeleri

Çalıştırmak için: `node scripts/run-migrations.js`

---

## Word Rapor Sistemi

### Akış
```
DB (getReportData.ts) → fillTemplate.ts → sablon/{format}.docx → kullanıcı
```

### Şablon Sözdizimi (docxtemplater)
```
{{RaporNo}}          ← tek değer
{{FirmaAd}}
{{MM-YY}}
{{Tarih}}

{{#hizmetler}}       ← tablo satırı döngüsü (ilk hücre)
  {{Analiz}}
  {{Sonuc}}
  {{Degerlendirme}}
  {{Metot}}
  {{Birim}}
  {{Limit}}
  {{LOQ}}
{{/hizmetler}}       ← döngü sonu (son hücre)
```

### Şablon Dosyaları (`sablon/` klasörü)
| Dosya | Durum |
|---|---|
| `Genel.docx` | Mevcut |
| `Challenge.docx` | Eklenecek |
| `Stabilite.docx` | Eklenecek |
| `Dermatoloji.docx` | Eklenecek |

Rapor formatı `StokAnalizListesi.RaporFormati` kolonu ile belirlenir.

---

## API Endpoint Özeti

```
POST /api/auth/[...nextauth]             Auth (next-auth)

GET/POST /api/hizmetler                  Hizmet listesi CRUD
GET/PUT/DELETE /api/hizmetler/[id]

GET/POST /api/lab/paketler               Paket CRUD
GET/PUT/DELETE /api/lab/paketler/[id]
GET/POST /api/lab/paketler/[id]/items

GET/POST /api/numune-form                Numune form CRUD
GET/PUT /api/numune-form/[id]
GET /api/numune-form/[id]/log            İşlem geçmişi
POST /api/numune-form/[id]/foto          Fotoğraf yükleme
GET /api/numune-form/lookup              Dropdown verileri
GET /api/numune-form/firmalar            Firma arama
GET /api/numune-form/hizmet-search       Hizmet arama
GET /api/numune-form/paket-items         Paket kalemleri
GET /api/numune-form/next-no             Otomatik numara

GET /api/rapor-takip                     Rapor listesi
GET /api/rapor-takip/[nkrId]/hizmetler  Rapora ait hizmetler
GET /api/rapor-takip/rapor-formatlari    Format listesi
GET /api/rapor-takip/yazdir/[id]         Rapor yazdır (docx/html)

POST /api/rapor-gonder/[id]              Raporu e-posta ile gönder

GET/POST /api/sonuc-giris                Sonuç girişi
GET/PUT /api/sonuc-giris/[x1id]

GET/POST /api/teklifler                  Teklif CRUD
GET/PUT/DELETE /api/teklifler/[id]
GET /api/teklifler/[id]/export           Word/PDF export
POST /api/teklifler/[id]/mail            E-posta gönder
GET /api/teklifler/lookup

GET/POST /api/musteriler                 Müşteri CRUD
GET/PUT /api/musteriler/[id]

GET /api/urunler                         Ürün listesi
GET/PUT/DELETE /api/urunler/[id]
GET /api/urunler/lookup

POST /api/formul-kontrol/match           Formül doğrulama

GET/PUT /api/admin/ayarlar               SMTP/sistem ayarları
GET/PUT /api/admin/yetki                 Yetki yönetimi
GET/POST /api/admin/kullanicilar         Kullanıcı yönetimi
```

---

## Tasarım Sistemi

Apple HIG tabanlı CSS değişkenleri:

```css
--color-accent: #0071e3     /* Apple mavi */
--color-bg: #f5f5f7         /* Açık gri arka plan */
/* System-font stack */
```

- CSS Modules kullanılıyor (`.module.css` dosyaları bileşen yanında)
- `app/styles/table.module.css` — ortak tablo stilleri
- Baskı için ayrı route: `/teklif-print/[id]`

---

## Ortam Değişkenleri (`.env`)

```env
# Veritabanı
DB_USER=
DB_PASSWORD=
DB_NAME=
DB_SERVER=

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# E-posta (nodemailer — Admin > Ayarlar üzerinden de yönetilebilir)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

---

## Geliştirici Notları

1. **MSSQL sorgular** — tüm input'lar `.input(name, value)` ile parametreli olmalı (SQL injection önlemi)
2. **DB bağlantısı** — `lib/db.ts`'den `poolPromise` import et, `await` ile pool al
3. **Runtime şema kontrolü** — `lib/numuneFormTables.ts` ile bazı kolonların/tabloların varlığını kontrol et; eski DB'lerde migration uygulanmamış olabilir
4. **`params` await** — Next.js 16'da `const { id } = await params` zorunlu
5. **Session okuma** — `getServerSession(authOptions)` kullan; `session.user.userId` ve `session.user.birimId` mevcut
6. **Migration** — `migrations/*.sql` dosyalarını DB'ye el ile uygulamak gerekiyor; `scripts/run-migrations.js` mevcut
7. **Word şablonları** — `sablon/` klasörüne yeni `.docx` dosyası eklenince `fillTemplate.ts`'de format anahtarına bağla
8. **Menü güncellemesi** — `lib/menuConfig.ts` tek kaynak; Sidebar ve Yetki sayfası buradan beslenir

---

## Aktif Geliştirme Durumu (Nisan 2026)

| Modül | Durum |
|---|---|
| Numune Kabul + Form | Tamamlandı |
| Hizmet Listesi + Paketleri | Tamamlandı |
| Rapor Takip | Tamamlandı |
| Word şablon sistemi (`Genel.docx`) | Tamamlandı |
| Sonuç Girişi | Tamamlandı |
| Müşteriler / Teklifler | Tamamlandı |
| Spektrotek modülü | Tamamlandı |
| Word şablonları (Challenge, Stabilite, Dermatoloji) | Bekliyor |
| Lab CRM | Geliştiriliyor |
