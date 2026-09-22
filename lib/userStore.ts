/* eslint-disable @typescript-eslint/no-explicit-any */
import { cosmoPool, legacyRootPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";

export const PORTAL_FIRMALARI = ["Unique", "Spektrotek", "Root", "Ozeco"] as const;
export type PortalFirma = (typeof PORTAL_FIRMALARI)[number];

type DbPool = { request(): any };
type UserRow = Record<string, unknown>;

let schemaReady: Promise<void> | null = null;

function firmaListesi(value: unknown): PortalFirma[] {
  const values = Array.isArray(value) ? value : [];
  return PORTAL_FIRMALARI.filter((firma) => values.includes(firma));
}

export function normalizePortalFirmalari(value: unknown): PortalFirma[] {
  const firmalar = firmaListesi(value);
  return firmalar.length ? firmalar : ["Unique"];
}

export async function ensureUserSchema() {
  if (!schemaReady) {
    schemaReady = ensureSchema().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function ensureSchema() {
  if (!hasMysqlConfig()) return;
  const pool = (await cosmoPool) as unknown as DbPool;
  await pool.request().query(`
    CREATE TABLE IF NOT EXISTS RootKullanici (
      ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      FirmaID INT NULL,
      BirimID INT NULL,
      LaboratuvarBirimID INT NULL,
      Kadi VARCHAR(120) NOT NULL,
      Ad VARCHAR(120) NOT NULL,
      Soyad VARCHAR(120) NULL,
      Gorev VARCHAR(180) NULL,
      Email VARCHAR(220) NULL,
      Telefon VARCHAR(80) NULL,
      Parola VARCHAR(255) NOT NULL,
      Durum VARCHAR(20) NOT NULL DEFAULT 'Aktif',
      CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY UX_RootKullanici_Kadi (Kadi),
      KEY IX_RootKullanici_LaboratuvarBirim (LaboratuvarBirimID)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci
  `);
  await pool.request().query(`
    CREATE TABLE IF NOT EXISTS PortalKullaniciFirma (
      KullaniciID INT NOT NULL,
      Firma VARCHAR(30) NOT NULL,
      PRIMARY KEY (KullaniciID, Firma),
      KEY IX_PortalKullaniciFirma_Firma (Firma)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci
  `);
  await pool.request().query("ALTER TABLE RootKullanici ADD COLUMN IF NOT EXISTS LaboratuvarBirimID INT NULL");

  const count = await pool.request().query("SELECT COUNT(*) AS Adet FROM RootKullanici");
  if (Number(count.recordset[0]?.Adet || 0) === 0) await migrateLegacyUsers(pool);
  await pool.request().query(`
    INSERT IGNORE INTO PortalKullaniciFirma (KullaniciID, Firma)
    SELECT ID, 'Unique' FROM RootKullanici k
    WHERE NOT EXISTS (SELECT 1 FROM PortalKullaniciFirma f WHERE f.KullaniciID = k.ID)
  `);
}

async function migrateLegacyUsers(target: DbPool) {
  const source = (await legacyRootPool) as unknown as DbPool;
  const users = await source.request().query(`
    SELECT ID, FirmaID, BirimID, Kadi, Ad, Soyad, Gorev, Email, Telefon, Parola, Durum
    FROM RootKullanici
    ORDER BY ID
  `);

  let birimMap = new Map<number, string>();
  try {
    const birimler = await source.request().query("SELECT ID, Birim FROM RootFirmaBirim");
    birimMap = new Map(birimler.recordset.map((row: UserRow) => [Number(row.ID), String(row.Birim || "").trim()]));
  } catch {
    // Eski kurulumda birim tablosu bulunmayabilir; kullanıcılar Unique kabul edilir.
  }

  for (const row of users.recordset as UserRow[]) {
    await target.request()
      .input("ID", Number(row.ID))
      .input("FirmaID", row.FirmaID == null ? null : Number(row.FirmaID))
      .input("BirimID", row.BirimID == null ? null : Number(row.BirimID))
      .input("Kadi", String(row.Kadi || "").trim())
      .input("Ad", String(row.Ad || "").trim())
      .input("Soyad", row.Soyad == null ? null : String(row.Soyad))
      .input("Gorev", row.Gorev == null ? null : String(row.Gorev))
      .input("Email", row.Email == null ? null : String(row.Email))
      .input("Telefon", row.Telefon == null ? null : String(row.Telefon))
      .input("Parola", String(row.Parola || ""))
      .input("Durum", String(row.Durum || "Aktif"))
      .query(`
        INSERT INTO RootKullanici
          (ID, FirmaID, BirimID, Kadi, Ad, Soyad, Gorev, Email, Telefon, Parola, Durum)
        VALUES
          (@ID, @FirmaID, @BirimID, @Kadi, @Ad, @Soyad, @Gorev, @Email, @Telefon, @Parola, @Durum)
      `);

    const eskiBirim = birimMap.get(Number(row.BirimID)) || "";
    const firma = eskiBirim.toLocaleLowerCase("tr-TR") === "istanbul"
      ? "Unique"
      : PORTAL_FIRMALARI.find((item) => item.toLocaleLowerCase("tr-TR") === eskiBirim.toLocaleLowerCase("tr-TR")) || "Unique";
    await target.request().input("ID", Number(row.ID)).input("Firma", firma)
      .query("INSERT IGNORE INTO PortalKullaniciFirma (KullaniciID, Firma) VALUES (@ID, @Firma)");
  }
}

export async function getUserPool(): Promise<DbPool> {
  await ensureUserSchema();
  return (await (hasMysqlConfig() ? cosmoPool : legacyRootPool)) as unknown as DbPool;
}

export async function getUserFirmalari(userId: string | number): Promise<PortalFirma[]> {
  await ensureUserSchema();
  if (!hasMysqlConfig()) return ["Unique"];
  const pool = (await cosmoPool) as unknown as DbPool;
  const result = await pool.request().input("ID", Number(userId))
    .query("SELECT Firma FROM PortalKullaniciFirma WHERE KullaniciID=@ID ORDER BY Firma");
  return normalizePortalFirmalari(result.recordset.map((row: UserRow) => row.Firma));
}

export async function replaceUserFirmalari(pool: DbPool, userId: number, value: unknown) {
  const firmalar = normalizePortalFirmalari(value);
  await pool.request().input("ID", userId).query("DELETE FROM PortalKullaniciFirma WHERE KullaniciID=@ID");
  for (const firma of firmalar) {
    await pool.request().input("ID", userId).input("Firma", firma)
      .query("INSERT INTO PortalKullaniciFirma (KullaniciID, Firma) VALUES (@ID, @Firma)");
  }
  return firmalar;
}
