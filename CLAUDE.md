@AGENTS.md

# ÜGD Portal — Proje Bağlamı

## Stack
- **Next.js 16** App Router + React 19 + TypeScript — `params` her zaman `Promise<{id:string}>`, mutlaka `await` edilmeli
- **next-auth v4** — `getServerSession(authOptions)`, session'da `userId` ve `birimId` var (`types/next-auth.d.ts`)
- **MSSQL** — `lib/db.ts` poolPromise pattern; tüm sorgular `.input(name, value)` ile parametreli
- **CSS Modules** — Apple HIG tasarım dili: `--color-accent:#0071e3`, `--color-bg:#f5f5f7`, system-font stack

## Dosya yapısı
```
app/
  (dashboard)/
    layout.tsx          ← Server — session + PortalYetki DB → Sidebar'a props
    admin/yetki-listesi/ ← Personel yetki yönetimi
    admin/muhasebe/      ← iframe (public/muhasebe-paneli.html, Google Sheets)
    ugd/                 ← urun-listesi, cosing, yonetmelik, firma-listesi, formul-kontrol
    musteriler/          ← musteri-listesi, teklif-listesi, proforma-listesi, fatura-takip
    laboratuvar/         ← numune-takip, hizmet-listesi, hizmet-paketleri
components/
  Sidebar.tsx            ← Props: allowedKeys:string[], isAdmin:boolean
lib/
  db.ts                  ← poolPromise (mssql)
  auth.ts                ← CredentialsProvider → RootKullanici (kolon adları dinamik okunur)
```

## Yetki sistemi
- `allowedKeys` boşsa → kısıtlama yok
- `isAdmin` → `Set(["1","2"])` (Selin:1, Oğuzhan:2)

## Kritik DB tabloları
| Tablo | Açıklama |
|---|---|
| `RootKullanici` | Kullanıcılar (kolon adları dinamik — KullaniciAdi/Kadi, Sifre/Parola vb.) |
| `PortalYetki` | KullaniciID, MenuKey |
| `StokAnalizListesi` | Lab hizmet kataloğu — `Durumu='Aktif'`, kolonlar: ID, Kod, Ad, AdEn, Method, MethodEn, Matriks, Akreditasyon, Sure, Fiyat, ParaBirimi, NumDipnot, NumDipnotEn |
| `NumuneX3` | Hizmet paket listeleri — ID, ListeAdi, Aciklama, Durum (Aktif/Pasif) |
| `NumuneX4` | Paket kalemleri — ListeID→NumuneX3, HizmetID→StokAnalizListesi, LimitDeger, LimitBirimi, Notlar |

## Yeni sohbet başlangıç mesajı
> "Next.js 16 / React 19 portal (ÜGD Portal). CLAUDE.md'yi oku, kaldığımız yerden devam edelim: [ne yapmak istediğini yaz]"
