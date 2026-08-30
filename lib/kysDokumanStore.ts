/* eslint-disable @typescript-eslint/no-explicit-any */
// KYS Doküman Yönetimi veri katmanı.
// lib/kysStore.ts ile aynı desen: cosmoPool + MySQL/MSSQL çift şema.

import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { htmlToPlainText, sanitizeDocumentHtml } from "@/lib/htmlSanitize";

type AnyRow = Record<string, any>;

let schemaReady: Promise<void> | null = null;

// ── Sabitler ─────────────────────────────────────────────────────────────────

export const DOKUMAN_TURLERI = [
  "Prosedür",
  "Talimat",
  "SOP",
  "Form",
  "Liste",
  "Plan",
  "Politika",
  "Rehber",
] as const;
export type DokumanTuru = (typeof DOKUMAN_TURLERI)[number];

export const DOKUMAN_DURUMLARI = [
  "Taslak",
  "Kontrol Bekliyor",
  "Onay Bekliyor",
  "Yayında",
  "Revize Ediliyor",
  "Arşiv",
] as const;
export type DokumanDurumu = (typeof DOKUMAN_DURUMLARI)[number];

/** Tür → doküman kodu öneki (KYS-PR-001 gibi) */
const TUR_KODU: Record<string, string> = {
  "Prosedür": "PR",
  "Talimat": "TL",
  "SOP": "SOP",
  "Form": "FR",
  "Liste": "LS",
  "Plan": "PL",
  "Politika": "PO",
  "Rehber": "RB",
};

/** Sadece bu durumlarda içerik düzenlenebilir */
export const DUZENLENEBILIR_DURUMLAR: DokumanDurumu[] = ["Taslak", "Revize Ediliyor"];

export type DokumanAksiyon =
  | "onaya-gonder"
  | "kontrol-onayi"
  | "yayin-onayi"
  | "reddet"
  | "revizyon-baslat"
  | "arsivle"
  | "arsivden-cikar";

export type DokumanKullanici = { userId: string; userName: string };

export type DokumanInput = {
  kod?: string;
  baslik?: string;
  tur?: string;
  birimId?: number | string | null;
  hazirlayanId?: string | null;
  hazirlayanAd?: string | null;
  onaylayanId?: string | null;
  onaylayanAd?: string | null;
  yururlukTarihi?: string | null;
  ozet?: string;
  icerik?: string;
};

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  const v = text(value);
  return v || null;
}

function dateValue(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function asDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function asDateTime(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function rowNumber(row: AnyRow, key: string): number {
  return Number(row[key] ?? row[key.toLowerCase()] ?? 0);
}

function rowString(row: AnyRow, key: string): string {
  return String(row[key] ?? row[key.toLowerCase()] ?? "");
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function normalizeTur(value: unknown): DokumanTuru {
  const v = text(value);
  const found = DOKUMAN_TURLERI.find(t => t.toLocaleLowerCase("tr-TR") === v.toLocaleLowerCase("tr-TR"));
  return found || "Prosedür";
}

// ── Şema ─────────────────────────────────────────────────────────────────────

export async function ensureKysDokumanSchema() {
  if (!schemaReady) {
    schemaReady = createSchema().catch(err => {
      schemaReady = null; // hata durumunda tekrar denenebilsin
      throw err;
    });
  }
  return schemaReady;
}

async function createSchema() {
  const pool = await cosmoPool;

  if (hasMysqlConfig()) {
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysDokuman (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        Kod VARCHAR(60) NOT NULL,
        Baslik VARCHAR(260) NOT NULL,
        Tur VARCHAR(40) NOT NULL DEFAULT 'Prosedür',
        Durum VARCHAR(40) NOT NULL DEFAULT 'Taslak',
        Revizyon INT NOT NULL DEFAULT 0,
        BirimID INT NULL,
        HazirlayanID VARCHAR(80) NULL,
        HazirlayanAd VARCHAR(160) NULL,
        KontrolEdenID VARCHAR(80) NULL,
        KontrolEdenAd VARCHAR(160) NULL,
        OnaylayanID VARCHAR(80) NULL,
        OnaylayanAd VARCHAR(160) NULL,
        YururlukTarihi DATE NULL,
        KontrolTarihi DATETIME NULL,
        OnayTarihi DATETIME NULL,
        ArsivTarihi DATETIME NULL,
        Ozet TEXT NULL,
        Icerik LONGTEXT NULL,
        DuzMetin LONGTEXT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY UX_KysDokuman_Kod (Kod),
        KEY IX_KysDokuman_Durum (Durum),
        KEY IX_KysDokuman_Tur (Tur)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysDokumanRevizyon (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        DokumanID INT NOT NULL,
        Revizyon INT NOT NULL DEFAULT 0,
        Aciklama TEXT NULL,
        Icerik LONGTEXT NULL,
        YayinTarihi DATE NULL,
        HazirlayanAd VARCHAR(160) NULL,
        KontrolEdenAd VARCHAR(160) NULL,
        OnaylayanAd VARCHAR(160) NULL,
        OlusturanID VARCHAR(80) NULL,
        OlusturanAd VARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY IX_KysDokumanRevizyon_DokumanID (DokumanID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysDokumanLog (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        DokumanID INT NOT NULL,
        Islem VARCHAR(60) NOT NULL,
        OncekiDurum VARCHAR(40) NULL,
        YeniDurum VARCHAR(40) NULL,
        Revizyon INT NULL,
        Aciklama TEXT NULL,
        KullaniciID VARCHAR(80) NULL,
        KullaniciAd VARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY IX_KysDokumanLog_DokumanID (DokumanID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS KysDokumanDosya (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        DokumanID INT NOT NULL,
        DosyaAdi VARCHAR(260) NOT NULL,
        MimeType VARCHAR(120) NOT NULL,
        DosyaBoyutu INT NOT NULL,
        Dosya LONGBLOB NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY UX_KysDokumanDosya_DokumanID (DokumanID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
    `);
    const revMadde = await pool.request().query(`SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'KysDokumanRevizyon' AND column_name = 'MaddeNo'`);
    if (!revMadde.recordset[0]) await pool.request().query("ALTER TABLE KysDokumanRevizyon ADD MaddeNo VARCHAR(100) NULL AFTER Revizyon");
    const logMadde = await pool.request().query(`SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'KysDokumanLog' AND column_name = 'MaddeNo'`);
    if (!logMadde.recordset[0]) await pool.request().query("ALTER TABLE KysDokumanLog ADD MaddeNo VARCHAR(100) NULL AFTER Revizyon");
  } else {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysDokuman')
      CREATE TABLE KysDokuman (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        Kod NVARCHAR(60) NOT NULL UNIQUE,
        Baslik NVARCHAR(260) NOT NULL,
        Tur NVARCHAR(40) NOT NULL DEFAULT 'Prosedür',
        Durum NVARCHAR(40) NOT NULL DEFAULT 'Taslak',
        Revizyon INT NOT NULL DEFAULT 0,
        BirimID INT NULL,
        HazirlayanID NVARCHAR(80) NULL,
        HazirlayanAd NVARCHAR(160) NULL,
        KontrolEdenID NVARCHAR(80) NULL,
        KontrolEdenAd NVARCHAR(160) NULL,
        OnaylayanID NVARCHAR(80) NULL,
        OnaylayanAd NVARCHAR(160) NULL,
        YururlukTarihi DATE NULL,
        KontrolTarihi DATETIME NULL,
        OnayTarihi DATETIME NULL,
        ArsivTarihi DATETIME NULL,
        Ozet NVARCHAR(MAX) NULL,
        Icerik NVARCHAR(MAX) NULL,
        DuzMetin NVARCHAR(MAX) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysDokumanRevizyon')
      CREATE TABLE KysDokumanRevizyon (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        DokumanID INT NOT NULL,
        Revizyon INT NOT NULL DEFAULT 0,
        Aciklama NVARCHAR(MAX) NULL,
        Icerik NVARCHAR(MAX) NULL,
        YayinTarihi DATE NULL,
        HazirlayanAd NVARCHAR(160) NULL,
        KontrolEdenAd NVARCHAR(160) NULL,
        OnaylayanAd NVARCHAR(160) NULL,
        OlusturanID NVARCHAR(80) NULL,
        OlusturanAd NVARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysDokumanLog')
      CREATE TABLE KysDokumanLog (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        DokumanID INT NOT NULL,
        Islem NVARCHAR(60) NOT NULL,
        OncekiDurum NVARCHAR(40) NULL,
        YeniDurum NVARCHAR(40) NULL,
        Revizyon INT NULL,
        Aciklama NVARCHAR(MAX) NULL,
        KullaniciID NVARCHAR(80) NULL,
        KullaniciAd NVARCHAR(160) NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
    await pool.request().query(`IF COL_LENGTH('KysDokumanRevizyon', 'MaddeNo') IS NULL ALTER TABLE KysDokumanRevizyon ADD MaddeNo NVARCHAR(100) NULL`);
    await pool.request().query(`IF COL_LENGTH('KysDokumanLog', 'MaddeNo') IS NULL ALTER TABLE KysDokumanLog ADD MaddeNo NVARCHAR(100) NULL`);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'KysDokumanDosya')
      CREATE TABLE KysDokumanDosya (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        DokumanID INT NOT NULL UNIQUE,
        DosyaAdi NVARCHAR(260) NOT NULL,
        MimeType NVARCHAR(120) NOT NULL,
        DosyaBoyutu INT NOT NULL,
        Dosya VARBINARY(MAX) NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
      )
    `);
  }
}

// ── Kod üretimi ──────────────────────────────────────────────────────────────

/** Türe göre bir sonraki boş doküman kodunu üretir: KYS-PR-004 */
export async function nextDokumanKodu(tur: string): Promise<string> {
  await ensureKysDokumanSchema();
  const pool = await cosmoPool;
  const prefix = `KYS-${TUR_KODU[normalizeTur(tur)] || "DK"}-`;
  const res = await pool.request()
    .input("prefix", `${prefix}%`)
    .query("SELECT Kod FROM KysDokuman WHERE Kod LIKE @prefix");
  const max = res.recordset.reduce((acc: number, r: AnyRow) => {
    const n = Number(rowString(r, "Kod").slice(prefix.length).replace(/\D/g, ""));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

// ── Okuma ────────────────────────────────────────────────────────────────────

function mapDokuman(r: AnyRow, withContent: boolean) {
  const revizyon = rowNumber(r, "Revizyon");
  const durum = (rowString(r, "Durum") || "Taslak") as DokumanDurumu;
  return {
    id: rowNumber(r, "ID"),
    kod: rowString(r, "Kod"),
    baslik: rowString(r, "Baslik"),
    tur: rowString(r, "Tur"),
    durum,
    revizyon,
    revizyonEtiket: String(revizyon).padStart(2, "0"),
    birimId: r.BirimID == null ? null : Number(r.BirimID),
    hazirlayanId: rowString(r, "HazirlayanID"),
    hazirlayanAd: rowString(r, "HazirlayanAd"),
    kontrolEdenId: rowString(r, "KontrolEdenID"),
    kontrolEdenAd: rowString(r, "KontrolEdenAd"),
    onaylayanId: rowString(r, "OnaylayanID"),
    onaylayanAd: rowString(r, "OnaylayanAd"),
    yururlukTarihi: asDate(r.YururlukTarihi),
    kontrolTarihi: asDateTime(r.KontrolTarihi),
    onayTarihi: asDateTime(r.OnayTarihi),
    arsivTarihi: asDateTime(r.ArsivTarihi),
    ozet: rowString(r, "Ozet"),
    dosyaAdi: rowString(r, "DosyaAdi"),
    dosyaMimeType: rowString(r, "DosyaMimeType"),
    dosyaBoyutu: rowNumber(r, "DosyaBoyutu"),
    hasDosya: Boolean(rowString(r, "DosyaAdi")),
    duzenlenebilir: DUZENLENEBILIR_DURUMLAR.includes(durum),
    createdAt: asDateTime(r.CreatedAt),
    updatedAt: asDateTime(r.UpdatedAt),
    ...(withContent ? { icerik: rowString(r, "Icerik") } : {}),
  };
}

export type DokumanOzet = ReturnType<typeof mapDokuman>;

export async function listKysDokumanlar(params: {
  search?: string;
  tur?: string;
  durum?: string;
  sort?: string;
  page?: number;
  limit?: number;
}) {
  await ensureKysDokumanSchema();
  const pool = await cosmoPool;
  const page = Math.max(1, Number(params.page || 1));
  const limit = Math.min(200, Math.max(5, Number(params.limit || 25)));
  const offset = (page - 1) * limit;
  const search = text(params.search);
  const tur = text(params.tur);
  const durum = text(params.durum);

  let where = "WHERE 1=1";
  if (search) {
    where += " AND (Kod LIKE @search OR Baslik LIKE @search OR Ozet LIKE @search OR DuzMetin LIKE @search" +
      " OR HazirlayanAd LIKE @search OR KontrolEdenAd LIKE @search OR OnaylayanAd LIKE @search)";
  }
  if (tur) where += " AND Tur = @tur";
  if (durum) where += " AND Durum = @durum";

  const order =
    params.sort === "kod-asc" ? "Kod ASC" :
    params.sort === "kod-desc" ? "Kod DESC" :
    params.sort === "baslik-asc" ? "Baslik ASC" :
    params.sort === "yururluk-desc" ? "YururlukTarihi DESC, KysDokuman.ID DESC" :
    "UpdatedAt DESC, KysDokuman.ID DESC";

  const bind = (req: any) => req
    .input("search", `%${search}%`)
    .input("tur", tur)
    .input("durum", durum);

  const countRes = await bind(pool.request()).query(`SELECT COUNT(*) AS total FROM KysDokuman ${where}`);
  const dataRes = await bind(pool.request())
    .input("offset", offset)
    .input("limit", limit)
    .query(`
      SELECT KysDokuman.ID, Kod, Baslik, Tur, Durum, Revizyon, BirimID,
             HazirlayanID, HazirlayanAd, KontrolEdenID, KontrolEdenAd, OnaylayanID, OnaylayanAd,
             YururlukTarihi, KontrolTarihi, OnayTarihi, ArsivTarihi, Ozet, KysDokuman.CreatedAt, UpdatedAt,
             kd.DosyaAdi, kd.MimeType AS DosyaMimeType, kd.DosyaBoyutu
      FROM KysDokuman
      LEFT JOIN KysDokumanDosya kd ON kd.DokumanID = KysDokuman.ID
      ${where}
      ORDER BY ${order}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  const statsRes = await pool.request().query(`
    SELECT Durum, COUNT(*) AS Adet FROM KysDokuman GROUP BY Durum
  `);
  const stats: Record<string, number> = {};
  let toplam = 0;
  for (const row of statsRes.recordset as AnyRow[]) {
    const adet = rowNumber(row, "Adet");
    stats[rowString(row, "Durum")] = adet;
    toplam += adet;
  }

  const total = Number(countRes.recordset[0]?.total ?? countRes.recordset[0]?.TOTAL ?? 0);
  return {
    data: dataRes.recordset.map((r: AnyRow) => mapDokuman(r, false)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    stats: {
      toplam,
      taslak: stats["Taslak"] || 0,
      kontrolBekliyor: stats["Kontrol Bekliyor"] || 0,
      onayBekliyor: stats["Onay Bekliyor"] || 0,
      yayinda: stats["Yayında"] || 0,
      revizyonda: stats["Revize Ediliyor"] || 0,
      arsiv: stats["Arşiv"] || 0,
    },
  };
}

async function fetchDokumanRow(id: number) {
  const pool = await cosmoPool;
  const res = await pool.request().input("ID", id).query(`
    SELECT KysDokuman.ID, Kod, Baslik, Tur, Durum, Revizyon, BirimID,
           HazirlayanID, HazirlayanAd, KontrolEdenID, KontrolEdenAd, OnaylayanID, OnaylayanAd,
           YururlukTarihi, KontrolTarihi, OnayTarihi, ArsivTarihi, Ozet, Icerik, KysDokuman.CreatedAt, UpdatedAt,
           kd.DosyaAdi, kd.MimeType AS DosyaMimeType, kd.DosyaBoyutu
    FROM KysDokuman
    LEFT JOIN KysDokumanDosya kd ON kd.DokumanID = KysDokuman.ID
    WHERE KysDokuman.ID = @ID
  `);
  return (res.recordset[0] as AnyRow) || null;
}

export async function getKysDokuman(id: number) {
  await ensureKysDokumanSchema();
  if (!Number.isFinite(id) || id <= 0) return null;
  const row = await fetchDokumanRow(id);
  if (!row) return null;
  const pool = await cosmoPool;

  const revRes = await pool.request().input("ID", id).query(`
    SELECT ID, Revizyon, MaddeNo, Aciklama, YayinTarihi, HazirlayanAd, OnaylayanAd, OlusturanAd, CreatedAt
    FROM KysDokumanRevizyon WHERE DokumanID = @ID ORDER BY Revizyon DESC, ID DESC
  `);
  const logRes = await pool.request().input("ID", id).query(`
    SELECT ID, Islem, OncekiDurum, YeniDurum, Revizyon, Aciklama, KullaniciAd, CreatedAt
    FROM KysDokumanLog WHERE DokumanID = @ID ORDER BY ID DESC
  `);

  return {
    ...mapDokuman(row, true),
    revizyonlar: (revRes.recordset as AnyRow[]).map(r => ({
      id: rowNumber(r, "ID"),
      revizyon: rowNumber(r, "Revizyon"),
      revizyonEtiket: String(rowNumber(r, "Revizyon")).padStart(2, "0"),
      maddeNo: rowString(r, "MaddeNo"),
      aciklama: rowString(r, "Aciklama"),
      yayinTarihi: asDate(r.YayinTarihi),
      hazirlayanAd: rowString(r, "HazirlayanAd"),
      onaylayanAd: rowString(r, "OnaylayanAd"),
      olusturanAd: rowString(r, "OlusturanAd"),
      createdAt: asDateTime(r.CreatedAt),
    })),
    loglar: (logRes.recordset as AnyRow[]).map(r => ({
      id: rowNumber(r, "ID"),
      islem: rowString(r, "Islem"),
      oncekiDurum: rowString(r, "OncekiDurum"),
      yeniDurum: rowString(r, "YeniDurum"),
      revizyon: r.Revizyon == null ? null : rowNumber(r, "Revizyon"),
      aciklama: rowString(r, "Aciklama"),
      kullaniciAd: rowString(r, "KullaniciAd"),
      createdAt: asDateTime(r.CreatedAt),
    })),
  };
}

/** Belirli bir revizyonun içerik anlık görüntüsünü döner. */
export async function getKysDokumanRevizyonIcerik(dokumanId: number, revizyonId: number) {
  await ensureKysDokumanSchema();
  const pool = await cosmoPool;
  const res = await pool.request()
    .input("DokumanID", dokumanId)
    .input("ID", revizyonId)
    .query(`
    SELECT ID, Revizyon, MaddeNo, Aciklama, Icerik, YayinTarihi, CreatedAt
      FROM KysDokumanRevizyon WHERE ID = @ID AND DokumanID = @DokumanID
    `);
  const r = res.recordset[0] as AnyRow | undefined;
  if (!r) return null;
  return {
    id: rowNumber(r, "ID"),
    revizyon: rowNumber(r, "Revizyon"),
    revizyonEtiket: String(rowNumber(r, "Revizyon")).padStart(2, "0"),
    maddeNo: rowString(r, "MaddeNo"),
    aciklama: rowString(r, "Aciklama"),
    icerik: rowString(r, "Icerik"),
    yayinTarihi: asDate(r.YayinTarihi),
    createdAt: asDateTime(r.CreatedAt),
  };
}

// ── Log ──────────────────────────────────────────────────────────────────────

async function writeLog(entry: {
  dokumanId: number;
  islem: string;
  oncekiDurum?: string | null;
  yeniDurum?: string | null;
  revizyon?: number | null;
  maddeNo?: string | null;
  aciklama?: string | null;
  user: DokumanKullanici;
}) {
  const pool = await cosmoPool;
  await pool.request()
    .input("DokumanID", entry.dokumanId)
    .input("Islem", entry.islem)
    .input("OncekiDurum", entry.oncekiDurum ?? null)
    .input("YeniDurum", entry.yeniDurum ?? null)
    .input("Revizyon", entry.revizyon ?? null)
    .input("MaddeNo", entry.maddeNo ?? null)
    .input("Aciklama", entry.aciklama ?? null)
    .input("KullaniciID", entry.user.userId || null)
    .input("KullaniciAd", entry.user.userName || null)
    .query(`
      INSERT INTO KysDokumanLog (DokumanID, Islem, OncekiDurum, YeniDurum, Revizyon, MaddeNo, Aciklama, KullaniciID, KullaniciAd)
      VALUES (@DokumanID, @Islem, @OncekiDurum, @YeniDurum, @Revizyon, @MaddeNo, @Aciklama, @KullaniciID, @KullaniciAd)
    `);
}

// ── Yazma ────────────────────────────────────────────────────────────────────

const VARSAYILAN_ICERIK = `
<h2 id="amac">1. Amaç</h2>
<p>Bu dokümanın amacını yazın.</p>
<h2 id="kapsam">2. Kapsam</h2>
<p>Dokümanın kapsadığı faaliyetleri ve birimleri yazın.</p>
<h2 id="sorumluluklar">3. Sorumluluklar</h2>
<p>İlgili görev ve sorumlulukları yazın.</p>
<h2 id="uygulama">4. Uygulama</h2>
<p>Uygulama adımlarını yazın.</p>
<h2 id="kayitlar">5. İlgili Kayıtlar</h2>
<p>Bu dokümanla ilişkili form ve kayıtları yazın.</p>
`.trim();

export async function createKysDokuman(input: DokumanInput, user: DokumanKullanici) {
  await ensureKysDokumanSchema();
  const baslik = text(input.baslik);
  if (!baslik) throw new Error("Doküman başlığı zorunludur.");

  const tur = normalizeTur(input.tur);
  const kod = text(input.kod) || (await nextDokumanKodu(tur));
  const pool = await cosmoPool;

  const dup = await pool.request().input("Kod", kod).query("SELECT ID FROM KysDokuman WHERE Kod = @Kod");
  if (dup.recordset[0]) throw new Error(`"${kod}" kodu zaten kullanılıyor.`);

  const icerik = sanitizeDocumentHtml(input.icerik) || VARSAYILAN_ICERIK;

  const res = await pool.request()
    .input("Kod", kod)
    .input("Baslik", baslik)
    .input("Tur", tur)
    .input("BirimID", input.birimId ? Number(input.birimId) : null)
    .input("HazirlayanID", nullableText(input.hazirlayanId) || user.userId || null)
    .input("HazirlayanAd", nullableText(input.hazirlayanAd) || user.userName)
    .input("OnaylayanID", nullableText(input.onaylayanId))
    .input("OnaylayanAd", nullableText(input.onaylayanAd))
    .input("YururlukTarihi", dateValue(input.yururlukTarihi))
    .input("Ozet", nullableText(input.ozet))
    .input("Icerik", icerik)
    .input("DuzMetin", htmlToPlainText(icerik).slice(0, 60000))
    .query(`
      INSERT INTO KysDokuman
        (Kod, Baslik, Tur, Durum, Revizyon, BirimID, HazirlayanID, HazirlayanAd,
         OnaylayanID, OnaylayanAd, YururlukTarihi, Ozet, Icerik, DuzMetin)
      OUTPUT INSERTED.ID
      VALUES
        (@Kod, @Baslik, @Tur, 'Taslak', 0, @BirimID, @HazirlayanID, @HazirlayanAd,
         @OnaylayanID, @OnaylayanAd, @YururlukTarihi, @Ozet, @Icerik, @DuzMetin)
    `);

  const id = Number(res.recordset[0]?.ID ?? res.recordset[0]?.id ?? 0);
  if (id) {
    await writeLog({ dokumanId: id, islem: "Oluşturuldu", yeniDurum: "Taslak", revizyon: 0, user });
  }
  return { id, kod };
}

export async function updateKysDokuman(id: number, input: DokumanInput, user: DokumanKullanici) {
  await ensureKysDokumanSchema();
  const row = await fetchDokumanRow(id);
  if (!row) throw new Error("Doküman bulunamadı.");

  const durum = rowString(row, "Durum") as DokumanDurumu;
  if (!DUZENLENEBILIR_DURUMLAR.includes(durum)) {
    throw new Error(`"${durum}" durumundaki doküman düzenlenemez. Değişiklik için revizyon başlatın.`);
  }

  const pool = await cosmoPool;
  const baslik = text(input.baslik) || rowString(row, "Baslik");
  const tur = input.tur ? normalizeTur(input.tur) : rowString(row, "Tur");
  const kod = text(input.kod) || rowString(row, "Kod");

  if (kod !== rowString(row, "Kod")) {
    const dup = await pool.request().input("Kod", kod).input("ID", id)
      .query("SELECT ID FROM KysDokuman WHERE Kod = @Kod AND ID <> @ID");
    if (dup.recordset[0]) throw new Error(`"${kod}" kodu zaten kullanılıyor.`);
  }

  // İçerik gönderilmediyse mevcut içeriği koru
  const icerik = input.icerik === undefined
    ? rowString(row, "Icerik")
    : sanitizeDocumentHtml(input.icerik);

  await pool.request()
    .input("ID", id)
    .input("Kod", kod)
    .input("Baslik", baslik)
    .input("Tur", tur)
    .input("BirimID", input.birimId === undefined ? (row.BirimID ?? null) : (input.birimId ? Number(input.birimId) : null))
    .input("HazirlayanID", input.hazirlayanId === undefined ? rowString(row, "HazirlayanID") || null : nullableText(input.hazirlayanId))
    .input("HazirlayanAd", input.hazirlayanAd === undefined ? rowString(row, "HazirlayanAd") || null : nullableText(input.hazirlayanAd))
    .input("OnaylayanID", input.onaylayanId === undefined ? rowString(row, "OnaylayanID") || null : nullableText(input.onaylayanId))
    .input("OnaylayanAd", input.onaylayanAd === undefined ? rowString(row, "OnaylayanAd") || null : nullableText(input.onaylayanAd))
    .input("YururlukTarihi", input.yururlukTarihi === undefined ? asDate(row.YururlukTarihi) : dateValue(input.yururlukTarihi))
    .input("Ozet", input.ozet === undefined ? rowString(row, "Ozet") || null : nullableText(input.ozet))
    .input("Icerik", icerik)
    .input("DuzMetin", htmlToPlainText(icerik).slice(0, 60000))
    .query(`
      UPDATE KysDokuman SET
        Kod = @Kod, Baslik = @Baslik, Tur = @Tur, BirimID = @BirimID,
        HazirlayanID = @HazirlayanID, HazirlayanAd = @HazirlayanAd,
        OnaylayanID = @OnaylayanID, OnaylayanAd = @OnaylayanAd,
        YururlukTarihi = @YururlukTarihi, Ozet = @Ozet, Icerik = @Icerik, DuzMetin = @DuzMetin,
        UpdatedAt = GETDATE()
      WHERE ID = @ID
    `);

  // Her kaydetmede log şişmesin: sadece içerik dışı alan değiştiyse ayrıca loglama yapılmaz.
  await writeLog({
    dokumanId: id,
    islem: "Kaydedildi",
    oncekiDurum: durum,
    yeniDurum: durum,
    revizyon: rowNumber(row, "Revizyon"),
    user,
  });

  return { ok: true };
}

export async function deleteKysDokuman(id: number, user: DokumanKullanici) {
  await ensureKysDokumanSchema();
  const row = await fetchDokumanRow(id);
  if (!row) throw new Error("Doküman bulunamadı.");
  const pool = await cosmoPool;
  await pool.request().input("ID", id).query("DELETE FROM KysDokumanDosya WHERE DokumanID = @ID");
  await pool.request().input("ID", id).query("DELETE FROM KysDokumanRevizyon WHERE DokumanID = @ID");
  await pool.request().input("ID", id).query("DELETE FROM KysDokumanLog WHERE DokumanID = @ID");
  await pool.request().input("ID", id).query("DELETE FROM KysDokuman WHERE ID = @ID");
  void user;
  return { ok: true };
}

export async function saveKysDokumanDosya(
  dokumanId: number,
  file: { name: string; type: string; size: number; buffer: Buffer },
  user: DokumanKullanici,
) {
  await ensureKysDokumanSchema();
  const row = await fetchDokumanRow(dokumanId);
  if (!row) throw new Error("Doküman bulunamadı.");
  const pool = await cosmoPool;
  await pool.request().input("DokumanID", dokumanId).query("DELETE FROM KysDokumanDosya WHERE DokumanID = @DokumanID");
  await pool.request()
    .input("DokumanID", dokumanId)
    .input("DosyaAdi", file.name)
    .input("MimeType", file.type)
    .input("DosyaBoyutu", file.size)
    .input("Dosya", file.buffer)
    .query(`
      INSERT INTO KysDokumanDosya (DokumanID, DosyaAdi, MimeType, DosyaBoyutu, Dosya)
      VALUES (@DokumanID, @DosyaAdi, @MimeType, @DosyaBoyutu, @Dosya)
    `);
  await writeLog({ dokumanId, islem: "Dosya yüklendi", aciklama: file.name, user });
}

export async function getKysDokumanDosya(dokumanId: number) {
  await ensureKysDokumanSchema();
  const pool = await cosmoPool;
  const res = await pool.request().input("DokumanID", dokumanId).query(`
    SELECT DosyaAdi, MimeType, DosyaBoyutu, Dosya
    FROM KysDokumanDosya WHERE DokumanID = @DokumanID
  `);
  const row = res.recordset[0] as AnyRow | undefined;
  if (!row) return null;
  return {
    name: rowString(row, "DosyaAdi"),
    type: rowString(row, "MimeType"),
    size: rowNumber(row, "DosyaBoyutu"),
    buffer: Buffer.isBuffer(row.Dosya) ? row.Dosya : Buffer.from(row.Dosya || []),
  };
}

// ── Onay akışı ───────────────────────────────────────────────────────────────

/** Aksiyonun hangi durumlardan çalışabileceği ve hangi yetkiyi gerektirdiği */
export const AKSIYON_KURALLARI: Record<DokumanAksiyon, {
  izinliDurumlar: DokumanDurumu[];
  yetkiKeys: string[];
  aciklamaZorunlu?: boolean;
  etiket: string;
}> = {
  "onaya-gonder": {
    izinliDurumlar: ["Taslak", "Revize Ediliyor"],
    yetkiKeys: ["laboratuvar.kys.dokuman-yonetimi.duzenle", "laboratuvar.kys.dokuman-yonetimi"],
    etiket: "Onaya gönderildi",
  },
  "kontrol-onayi": {
    izinliDurumlar: ["Kontrol Bekliyor"],
    yetkiKeys: ["laboratuvar.kys.dokuman-yonetimi.kontrol"],
    etiket: "Kontrol onayı verildi",
  },
  "yayin-onayi": {
    izinliDurumlar: ["Onay Bekliyor", "Kontrol Bekliyor"],
    yetkiKeys: ["laboratuvar.kys.dokuman-yonetimi.onayla"],
    etiket: "Yayına alındı",
  },
  reddet: {
    izinliDurumlar: ["Kontrol Bekliyor", "Onay Bekliyor"],
    yetkiKeys: ["laboratuvar.kys.dokuman-yonetimi.kontrol", "laboratuvar.kys.dokuman-yonetimi.onayla"],
    aciklamaZorunlu: true,
    etiket: "Revizyona geri gönderildi",
  },
  "revizyon-baslat": {
    izinliDurumlar: ["Yayında"],
    yetkiKeys: ["laboratuvar.kys.dokuman-yonetimi.duzenle", "laboratuvar.kys.dokuman-yonetimi"],
    aciklamaZorunlu: true,
    etiket: "Revizyon başlatıldı",
  },
  arsivle: {
    izinliDurumlar: ["Yayında", "Taslak"],
    yetkiKeys: ["laboratuvar.kys.dokuman-yonetimi.onayla"],
    aciklamaZorunlu: true,
    etiket: "Arşive alındı",
  },
  "arsivden-cikar": {
    izinliDurumlar: ["Arşiv"],
    yetkiKeys: ["laboratuvar.kys.dokuman-yonetimi.onayla"],
    etiket: "Arşivden çıkarıldı",
  },
};

export async function runKysDokumanAksiyon(
  id: number,
  aksiyon: DokumanAksiyon,
  payload: { maddeNo?: string; aciklama?: string; yururlukTarihi?: string | null },
  user: DokumanKullanici,
) {
  await ensureKysDokumanSchema();
  const kural = AKSIYON_KURALLARI[aksiyon];
  if (!kural) throw new Error("Geçersiz işlem.");

  const row = await fetchDokumanRow(id);
  if (!row) throw new Error("Doküman bulunamadı.");

  const oncekiDurum = rowString(row, "Durum") as DokumanDurumu;
  if (!kural.izinliDurumlar.includes(oncekiDurum)) {
    throw new Error(`Bu işlem "${oncekiDurum}" durumundaki bir dokümanda yapılamaz.`);
  }

  const aciklama = text(payload.aciklama);
  const maddeNo = text(payload.maddeNo);
  if (kural.aciklamaZorunlu && !aciklama) throw new Error("Bu işlem için açıklama girmelisiniz.");

  const pool = await cosmoPool;
  const revizyon = rowNumber(row, "Revizyon");
  let yeniDurum: DokumanDurumu = oncekiDurum;
  let yeniRevizyon = revizyon;

  if (aksiyon === "onaya-gonder") {
    yeniDurum = "Onay Bekliyor";
    await pool.request().input("ID", id).query(`
      UPDATE KysDokuman SET Durum = 'Onay Bekliyor', KontrolTarihi = NULL, OnayTarihi = NULL, UpdatedAt = GETDATE()
      WHERE ID = @ID
    `);
  } else if (aksiyon === "kontrol-onayi") {
    yeniDurum = "Onay Bekliyor";
    await pool.request()
      .input("ID", id)
      .input("KontrolEdenID", user.userId || null)
      .input("KontrolEdenAd", user.userName)
      .query(`
        UPDATE KysDokuman SET Durum = 'Onay Bekliyor', KontrolEdenID = @KontrolEdenID,
          KontrolEdenAd = @KontrolEdenAd, KontrolTarihi = GETDATE(), UpdatedAt = GETDATE()
        WHERE ID = @ID
      `);
  } else if (aksiyon === "yayin-onayi") {
    yeniDurum = "Yayında";
    const yururluk = dateValue(payload.yururlukTarihi) || asDate(row.YururlukTarihi) || todayIso();
    await pool.request()
      .input("ID", id)
      .input("OnaylayanID", user.userId || null)
      .input("OnaylayanAd", user.userName)
      .input("YururlukTarihi", yururluk)
      .query(`
        UPDATE KysDokuman SET Durum = 'Yayında', OnaylayanID = @OnaylayanID, OnaylayanAd = @OnaylayanAd,
          OnayTarihi = GETDATE(), YururlukTarihi = @YururlukTarihi, ArsivTarihi = NULL, UpdatedAt = GETDATE()
        WHERE ID = @ID
      `);
    // Yayınlanan sürümün anlık görüntüsünü revizyon geçmişine yaz
    const revNotu = await sonRevizyonNotu(id, revizyon);
    const revAciklama = aciklama || revNotu?.aciklama || (revizyon === 0 ? "İlk yayın." : "Revizyon yayınlandı.");
    const revMaddeNo = maddeNo || revNotu?.maddeNo || (revizyon === 0 ? "İlk yayın" : "-");
    await pool.request()
      .input("DokumanID", id)
      .input("Revizyon", revizyon)
      .input("MaddeNo", revMaddeNo)
      .input("Aciklama", revAciklama)
      .input("Icerik", rowString(row, "Icerik"))
      .input("YayinTarihi", yururluk)
      .input("HazirlayanAd", rowString(row, "HazirlayanAd") || null)
      .input("OnaylayanAd", user.userName)
      .input("OlusturanID", user.userId || null)
      .input("OlusturanAd", user.userName)
      .query(`
        INSERT INTO KysDokumanRevizyon
          (DokumanID, Revizyon, MaddeNo, Aciklama, Icerik, YayinTarihi, HazirlayanAd, OnaylayanAd, OlusturanID, OlusturanAd)
        VALUES
          (@DokumanID, @Revizyon, @MaddeNo, @Aciklama, @Icerik, @YayinTarihi, @HazirlayanAd, @OnaylayanAd, @OlusturanID, @OlusturanAd)
      `);
  } else if (aksiyon === "reddet") {
    yeniDurum = revizyon > 0 ? "Revize Ediliyor" : "Taslak";
    await pool.request().input("ID", id).input("Durum", yeniDurum).query(`
      UPDATE KysDokuman SET Durum = @Durum, KontrolTarihi = NULL, OnayTarihi = NULL, UpdatedAt = GETDATE()
      WHERE ID = @ID
    `);
  } else if (aksiyon === "revizyon-baslat") {
    yeniDurum = "Revize Ediliyor";
    yeniRevizyon = revizyon + 1;
    await pool.request().input("ID", id).input("Revizyon", yeniRevizyon).query(`
      UPDATE KysDokuman SET Durum = 'Revize Ediliyor', Revizyon = @Revizyon,
        KontrolTarihi = NULL, OnayTarihi = NULL, UpdatedAt = GETDATE()
      WHERE ID = @ID
    `);
  } else if (aksiyon === "arsivle") {
    yeniDurum = "Arşiv";
    await pool.request().input("ID", id).query(`
      UPDATE KysDokuman SET Durum = 'Arşiv', ArsivTarihi = GETDATE(), UpdatedAt = GETDATE() WHERE ID = @ID
    `);
  } else if (aksiyon === "arsivden-cikar") {
    yeniDurum = revizyon > 0 ? "Revize Ediliyor" : "Taslak";
    await pool.request().input("ID", id).input("Durum", yeniDurum).query(`
      UPDATE KysDokuman SET Durum = @Durum, ArsivTarihi = NULL, UpdatedAt = GETDATE() WHERE ID = @ID
    `);
  }

  await writeLog({
    dokumanId: id,
    islem: kural.etiket,
    oncekiDurum,
    yeniDurum,
    revizyon: yeniRevizyon,
    maddeNo: maddeNo || null,
    aciklama: aciklama || null,
    user,
  });

  return { ok: true, durum: yeniDurum, revizyon: yeniRevizyon };
}

/** Revizyon başlatılırken girilen notu, yayın anında revizyon kaydına taşımak için okur. */
async function sonRevizyonNotu(dokumanId: number, revizyon: number): Promise<{ maddeNo: string; aciklama: string } | null> {
  const pool = await cosmoPool;
  const res = await pool.request()
    .input("DokumanID", dokumanId)
    .input("Revizyon", revizyon)
    .query(`
      SELECT TOP 1 MaddeNo, Aciklama FROM KysDokumanLog
      WHERE DokumanID = @DokumanID AND Revizyon = @Revizyon AND Islem = 'Revizyon başlatıldı'
      ORDER BY ID DESC
    `);
  const row = res.recordset[0];
  return row ? { maddeNo: rowString(row, "MaddeNo"), aciklama: rowString(row, "Aciklama") } : null;
}
