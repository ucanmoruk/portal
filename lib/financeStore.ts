import mssql from "mssql";
import mysql from "mysql2/promise";
import { createPool as createPgPool } from "@vercel/postgres";
import poolPromise from "@/lib/db";

type SqlDialect = "postgres" | "mysql" | "mssql";
type FinanceRow = Record<string, unknown>;

export type FinanceCompany = {
  id: number;
  name: string;
  status: string;
};

export type FinanceEntry = {
  id: number;
  companyId: number | null;
  companyName: string;
  kind: string;
  title: string;
  amount: number;
  paidAmount: number | null;
  currency: string;
  dueDate: string;
  installmentNo: number | null;
  installmentTotal: number | null;
  recurrence: string;
  autoPayment: boolean;
  reminderDate: string | null;
  reminderTime: string | null;
  status: string;
  paidDate: string | null;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type FinancePayment = {
  id: number;
  entryId: number;
  amount: number;
  paidDate: string;
  note: string;
  createdAt: string | null;
};

export type FinanceEntryInput = {
  companyId?: number | null;
  companyName?: string;
  kind?: string;
  title?: string;
  amount?: number;
  paidAmount?: number | null;
  currency?: string;
  dueDate?: string;
  installmentNo?: number | null;
  installmentTotal?: number | null;
  recurrence?: string;
  autoPayment?: boolean;
  reminderDate?: string | null;
  reminderTime?: string | null;
  status?: string;
  paidDate?: string | null;
  notes?: string;
};

export type FinancePaymentInput = {
  entryId: number;
  amount: number;
  paidDate: string;
  note?: string;
};

let pgPool: ReturnType<typeof createPgPool> | null = null;
let mysqlPool: mysql.Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getDialect(): SqlDialect {
  if (process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL) return "postgres";
  if (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE) return "mysql";
  return "mssql";
}

function getPgPool() {
  const connectionString = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
  if (!connectionString) throw new Error("Postgres bağlantı bilgisi bulunamadı.");
  pgPool ??= createPgPool({ connectionString });
  return pgPool;
}

function getMysqlPool() {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_POOL_MAX || 10),
      charset: "utf8mb4_turkish_ci",
      dateStrings: true,
      timezone: "Z",
    });
  }
  return mysqlPool;
}

async function ensureSchema() {
  if (!schemaReady) schemaReady = createSchema();
  return schemaReady;
}

async function createSchema() {
  const dialect = getDialect();

  if (dialect === "postgres") {
    const pg = getPgPool();
    await pg.query(`
      CREATE TABLE IF NOT EXISTS portal_finans_firma (
        id SERIAL PRIMARY KEY,
        ad VARCHAR(160) NOT NULL,
        durum VARCHAR(20) NOT NULL DEFAULT 'Aktif',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pg.query(`
      CREATE TABLE IF NOT EXISTS portal_finans_kayit (
        id SERIAL PRIMARY KEY,
        firma_id INTEGER NULL REFERENCES portal_finans_firma(id),
        firma_ad VARCHAR(160) NOT NULL DEFAULT '',
        tur VARCHAR(40) NOT NULL DEFAULT 'borc',
        baslik VARCHAR(220) NOT NULL,
        tutar NUMERIC(18,2) NOT NULL DEFAULT 0,
        odenen_tutar NUMERIC(18,2) NULL,
        para_birimi VARCHAR(8) NOT NULL DEFAULT 'TRY',
        vade_tarihi DATE NOT NULL,
        taksit_no INTEGER NULL,
        taksit_toplam INTEGER NULL,
        tekrar VARCHAR(40) NOT NULL DEFAULT 'none',
        otomatik_odeme BOOLEAN NOT NULL DEFAULT FALSE,
        bildirim_tarihi DATE NULL,
        bildirim_saati VARCHAR(5) NULL,
        durum VARCHAR(40) NOT NULL DEFAULT 'bekliyor',
        odeme_tarihi DATE NULL,
        notlar TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pg.query("ALTER TABLE portal_finans_kayit ADD COLUMN IF NOT EXISTS odenen_tutar NUMERIC(18,2) NULL");
    await pg.query(`
      CREATE TABLE IF NOT EXISTS portal_finans_odeme (
        id SERIAL PRIMARY KEY,
        kayit_id INTEGER NOT NULL REFERENCES portal_finans_kayit(id) ON DELETE CASCADE,
        tutar NUMERIC(18,2) NOT NULL,
        odeme_tarihi DATE NOT NULL,
        notlar TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    return;
  }

  if (dialect === "mysql") {
    const db = getMysqlPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS PortalFinansFirma (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        Ad VARCHAR(160) NOT NULL,
        Durum VARCHAR(20) NOT NULL DEFAULT 'Aktif',
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS PortalFinansKayit (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        FirmaID INT NULL,
        FirmaAd VARCHAR(160) NOT NULL DEFAULT '',
        Tur VARCHAR(40) NOT NULL DEFAULT 'borc',
        Baslik VARCHAR(220) NOT NULL,
        Tutar DECIMAL(18,2) NOT NULL DEFAULT 0,
        OdenenTutar DECIMAL(18,2) NULL,
        ParaBirimi VARCHAR(8) NOT NULL DEFAULT 'TRY',
        VadeTarihi DATE NOT NULL,
        TaksitNo INT NULL,
        TaksitToplam INT NULL,
        Tekrar VARCHAR(40) NOT NULL DEFAULT 'none',
        OtomatikOdeme TINYINT(1) NOT NULL DEFAULT 0,
        BildirimTarihi DATE NULL,
        BildirimSaati VARCHAR(5) NULL,
        Durum VARCHAR(40) NOT NULL DEFAULT 'bekliyor',
        OdemeTarihi DATE NULL,
        Notlar TEXT NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX IX_PortalFinansKayit_FirmaID (FirmaID),
        INDEX IX_PortalFinansKayit_VadeTarihi (VadeTarihi)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci
    `);
    await db.query("ALTER TABLE PortalFinansKayit ADD COLUMN IF NOT EXISTS OdenenTutar DECIMAL(18,2) NULL");
    await db.query(`
      CREATE TABLE IF NOT EXISTS PortalFinansOdeme (
        ID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        KayitID INT NOT NULL,
        Tutar DECIMAL(18,2) NOT NULL,
        OdemeTarihi DATE NOT NULL,
        Notlar TEXT NOT NULL,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX IX_PortalFinansOdeme_KayitID (KayitID)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci
    `);
    return;
  }

  const pool = await poolPromise;
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PortalFinansFirma')
    CREATE TABLE PortalFinansFirma (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      Ad NVARCHAR(160) NOT NULL,
      Durum NVARCHAR(20) NOT NULL DEFAULT 'Aktif',
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PortalFinansKayit')
    CREATE TABLE PortalFinansKayit (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      FirmaID INT NULL,
      FirmaAd NVARCHAR(160) NOT NULL DEFAULT '',
      Tur NVARCHAR(40) NOT NULL DEFAULT 'borc',
      Baslik NVARCHAR(220) NOT NULL,
      Tutar DECIMAL(18,2) NOT NULL DEFAULT 0,
      OdenenTutar DECIMAL(18,2) NULL,
      ParaBirimi NVARCHAR(8) NOT NULL DEFAULT 'TRY',
      VadeTarihi DATE NOT NULL,
      TaksitNo INT NULL,
      TaksitToplam INT NULL,
      Tekrar NVARCHAR(40) NOT NULL DEFAULT 'none',
      OtomatikOdeme BIT NOT NULL DEFAULT 0,
      BildirimTarihi DATE NULL,
      BildirimSaati NVARCHAR(5) NULL,
      Durum NVARCHAR(40) NOT NULL DEFAULT 'bekliyor',
      OdemeTarihi DATE NULL,
      Notlar NVARCHAR(MAX) NOT NULL DEFAULT '',
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
      UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
  await pool.request().query(`
    IF COL_LENGTH('PortalFinansKayit', 'OdenenTutar') IS NULL
    ALTER TABLE PortalFinansKayit ADD OdenenTutar DECIMAL(18,2) NULL
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PortalFinansOdeme')
    CREATE TABLE PortalFinansOdeme (
      ID INT IDENTITY(1,1) PRIMARY KEY,
      KayitID INT NOT NULL,
      Tutar DECIMAL(18,2) NOT NULL,
      OdemeTarihi DATE NOT NULL,
      Notlar NVARCHAR(MAX) NOT NULL DEFAULT '',
      CreatedAt DATETIME NOT NULL DEFAULT GETDATE()
    )
  `);
}

const asDate = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const asDateTime = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const asNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const asNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
};

function mapCompany(row: FinanceRow): FinanceCompany {
  return {
    id: Number(row.id ?? row.ID),
    name: String(row.ad ?? row.Ad ?? ""),
    status: String(row.durum ?? row.Durum ?? "Aktif"),
  };
}

function mapEntry(row: FinanceRow): FinanceEntry {
  return {
    id: Number(row.id ?? row.ID),
    companyId: asNullableNumber(row.firma_id ?? row.FirmaID),
    companyName: String(row.firma_ad ?? row.FirmaAd ?? ""),
    kind: String(row.tur ?? row.Tur ?? "borc"),
    title: String(row.baslik ?? row.Baslik ?? ""),
    amount: Number(row.tutar ?? row.Tutar ?? 0),
    paidAmount: asNullableNumber(row.odenen_tutar ?? row.OdenenTutar),
    currency: String(row.para_birimi ?? row.ParaBirimi ?? "TRY"),
    dueDate: asDate(row.vade_tarihi ?? row.VadeTarihi) || "",
    installmentNo: asNullableNumber(row.taksit_no ?? row.TaksitNo),
    installmentTotal: asNullableNumber(row.taksit_toplam ?? row.TaksitToplam),
    recurrence: String(row.tekrar ?? row.Tekrar ?? "none"),
    autoPayment: Boolean(row.otomatik_odeme ?? row.OtomatikOdeme),
    reminderDate: asDate(row.bildirim_tarihi ?? row.BildirimTarihi),
    reminderTime: asNullableString(row.bildirim_saati ?? row.BildirimSaati),
    status: String(row.durum ?? row.Durum ?? "bekliyor"),
    paidDate: asDate(row.odeme_tarihi ?? row.OdemeTarihi),
    notes: String(row.notlar ?? row.Notlar ?? ""),
    createdAt: asDateTime(row.created_at ?? row.CreatedAt),
    updatedAt: asDateTime(row.updated_at ?? row.UpdatedAt),
  };
}

function mapPayment(row: FinanceRow): FinancePayment {
  return {
    id: Number(row.id ?? row.ID),
    entryId: Number(row.kayit_id ?? row.KayitID),
    amount: Number(row.tutar ?? row.Tutar ?? 0),
    paidDate: asDate(row.odeme_tarihi ?? row.OdemeTarihi) || "",
    note: String(row.notlar ?? row.Notlar ?? ""),
    createdAt: asDateTime(row.created_at ?? row.CreatedAt),
  };
}

function normalizeEntry(input: FinanceEntryInput, partial = false) {
  const title = input.title?.trim();
  const dueDate = input.dueDate?.trim();
  const amount = Number(input.amount ?? 0);
  const paidAmount = input.paidAmount == null ? null : Number(input.paidAmount);

  if (!partial) {
    if (!title) throw new Error("Başlık zorunludur.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Tutar 0'dan büyük olmalıdır.");
    if (!dueDate) throw new Error("Vade tarihi zorunludur.");
  }

  return {
    companyId: input.companyId ? Number(input.companyId) : null,
    companyName: input.companyName?.trim() || "",
    kind: input.kind || "borc",
    title: title || "",
    amount,
    paidAmount: Number.isFinite(paidAmount) ? paidAmount : null,
    currency: input.currency || "TRY",
    dueDate: dueDate || null,
    installmentNo: input.installmentNo ? Number(input.installmentNo) : null,
    installmentTotal: input.installmentTotal ? Number(input.installmentTotal) : null,
    recurrence: input.recurrence || "none",
    autoPayment: Boolean(input.autoPayment),
    reminderDate: input.reminderDate || null,
    reminderTime: input.reminderTime || null,
    status: input.status || "bekliyor",
    paidDate: input.paidDate || null,
    notes: input.notes || "",
  };
}

export async function listFinanceCompanies(): Promise<FinanceCompany[]> {
  await ensureSchema();
  const dialect = getDialect();
  if (dialect === "postgres") {
    const r = await getPgPool().query("SELECT id, ad, durum FROM portal_finans_firma WHERE durum = 'Aktif' ORDER BY ad");
    return r.rows.map(mapCompany);
  }
  if (dialect === "mysql") {
    const [rows] = await getMysqlPool().query("SELECT ID, Ad, Durum FROM PortalFinansFirma WHERE Durum = 'Aktif' ORDER BY Ad");
    return (rows as FinanceRow[]).map(mapCompany);
  }
  const pool = await poolPromise;
  const r = await pool.request().query("SELECT ID, Ad, Durum FROM PortalFinansFirma WHERE Durum = 'Aktif' ORDER BY Ad");
  return r.recordset.map(mapCompany);
}

export async function createFinanceCompany(name: string): Promise<FinanceCompany> {
  const clean = name.trim();
  if (!clean) throw new Error("Firma adı zorunludur.");
  await ensureSchema();
  const dialect = getDialect();

  if (dialect === "postgres") {
    const r = await getPgPool().query(
      "INSERT INTO portal_finans_firma (ad) VALUES ($1) RETURNING id, ad, durum",
      [clean],
    );
    return mapCompany(r.rows[0]);
  }
  if (dialect === "mysql") {
    const [result] = await getMysqlPool().query<mysql.ResultSetHeader>(
      "INSERT INTO PortalFinansFirma (Ad) VALUES (?)",
      [clean],
    );
    return { id: result.insertId, name: clean, status: "Aktif" };
  }
  const pool = await poolPromise;
  const r = await pool.request()
    .input("Ad", clean)
    .query("INSERT INTO PortalFinansFirma (Ad) OUTPUT INSERTED.ID, INSERTED.Ad, INSERTED.Durum VALUES (@Ad)");
  return mapCompany(r.recordset[0]);
}

export async function listFinanceEntries(): Promise<FinanceEntry[]> {
  await ensureSchema();
  const dialect = getDialect();
  if (dialect === "postgres") {
    const r = await getPgPool().query(`
      SELECT id, firma_id, firma_ad, tur, baslik, tutar, odenen_tutar, para_birimi, vade_tarihi,
             taksit_no, taksit_toplam, tekrar, otomatik_odeme, bildirim_tarihi,
             bildirim_saati, durum, odeme_tarihi, notlar, created_at, updated_at
      FROM portal_finans_kayit
      ORDER BY vade_tarihi ASC, id DESC
    `);
    return r.rows.map(mapEntry);
  }
  if (dialect === "mysql") {
    const [rows] = await getMysqlPool().query(`
      SELECT ID, FirmaID, FirmaAd, Tur, Baslik, Tutar, OdenenTutar, ParaBirimi, VadeTarihi,
             TaksitNo, TaksitToplam, Tekrar, OtomatikOdeme, BildirimTarihi,
             BildirimSaati, Durum, OdemeTarihi, Notlar, CreatedAt, UpdatedAt
      FROM PortalFinansKayit
      ORDER BY VadeTarihi ASC, ID DESC
    `);
    return (rows as FinanceRow[]).map(mapEntry);
  }
  const pool = await poolPromise;
  const r = await pool.request().query(`
    SELECT ID, FirmaID, FirmaAd, Tur, Baslik, Tutar, OdenenTutar, ParaBirimi, VadeTarihi,
           TaksitNo, TaksitToplam, Tekrar, OtomatikOdeme, BildirimTarihi,
           BildirimSaati, Durum, OdemeTarihi, Notlar, CreatedAt, UpdatedAt
    FROM PortalFinansKayit
    ORDER BY VadeTarihi ASC, ID DESC
  `);
  return r.recordset.map(mapEntry);
}

export async function listFinancePayments(): Promise<FinancePayment[]> {
  await ensureSchema();
  const dialect = getDialect();
  if (dialect === "postgres") {
    const r = await getPgPool().query(`
      SELECT id, kayit_id, tutar, odeme_tarihi, notlar, created_at
      FROM portal_finans_odeme
      ORDER BY odeme_tarihi ASC, id ASC
    `);
    return r.rows.map(mapPayment);
  }
  if (dialect === "mysql") {
    const [rows] = await getMysqlPool().query(`
      SELECT ID, KayitID, Tutar, OdemeTarihi, Notlar, CreatedAt
      FROM PortalFinansOdeme
      ORDER BY OdemeTarihi ASC, ID ASC
    `);
    return (rows as FinanceRow[]).map(mapPayment);
  }
  const pool = await poolPromise;
  const r = await pool.request().query(`
    SELECT ID, KayitID, Tutar, OdemeTarihi, Notlar, CreatedAt
    FROM PortalFinansOdeme
    ORDER BY OdemeTarihi ASC, ID ASC
  `);
  return r.recordset.map(mapPayment);
}

export async function createFinancePayment(input: FinancePaymentInput): Promise<{ payment: FinancePayment; entry: FinanceEntry | null }> {
  const entryId = Number(input.entryId);
  const amount = Number(input.amount);
  const paidDate = input.paidDate;
  const note = input.note || "";
  if (!Number.isFinite(entryId) || entryId <= 0) throw new Error("Geçersiz kayıt.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Ödeme tutarı 0'dan büyük olmalıdır.");
  if (!paidDate) throw new Error("Ödeme tarihi zorunludur.");

  await ensureSchema();
  const current = await getFinanceEntry(entryId);
  if (!current) throw new Error("Kayıt bulunamadı.");

  const previousPayments = (await listFinancePayments()).filter((item) => item.entryId === entryId);
  const dialect = getDialect();
  let payment: FinancePayment;
  if (dialect === "postgres") {
    const r = await getPgPool().query(`
      INSERT INTO portal_finans_odeme (kayit_id, tutar, odeme_tarihi, notlar)
      VALUES ($1,$2,$3,$4)
      RETURNING id, kayit_id, tutar, odeme_tarihi, notlar, created_at
    `, [entryId, amount, paidDate, note]);
    payment = mapPayment(r.rows[0]);
  } else if (dialect === "mysql") {
    const [result] = await getMysqlPool().query<mysql.ResultSetHeader>(`
      INSERT INTO PortalFinansOdeme (KayitID, Tutar, OdemeTarihi, Notlar)
      VALUES (?,?,?,?)
    `, [entryId, amount, paidDate, note]);
    payment = { id: result.insertId, entryId, amount, paidDate, note, createdAt: null };
  } else {
    const pool = await poolPromise;
    const r = await pool.request()
      .input("KayitID", entryId)
      .input("Tutar", mssql.Decimal(18, 2), amount)
      .input("OdemeTarihi", paidDate)
      .input("Notlar", note)
      .query(`
        INSERT INTO PortalFinansOdeme (KayitID, Tutar, OdemeTarihi, Notlar)
        OUTPUT INSERTED.ID, INSERTED.KayitID, INSERTED.Tutar, INSERTED.OdemeTarihi, INSERTED.Notlar, INSERTED.CreatedAt
        VALUES (@KayitID,@Tutar,@OdemeTarihi,@Notlar)
      `);
    payment = mapPayment(r.recordset[0]);
  }

  const payments = [...previousPayments, payment];
  const legacyPaid = previousPayments.length === 0 ? Number(current.paidAmount || 0) : 0;
  const totalPaid = legacyPaid + payments.reduce((sum, item) => sum + item.amount, 0);
  const status = totalPaid >= current.amount ? "odendi" : "kismi";
  const latestPaidDate = payments[payments.length - 1]?.paidDate || paidDate;
  const entry = await updateFinanceEntry(entryId, {
    ...current,
    paidAmount: totalPaid,
    status,
    paidDate: latestPaidDate,
  });
  return { payment, entry };
}

export async function createFinanceEntry(input: FinanceEntryInput): Promise<FinanceEntry> {
  const item = normalizeEntry(input);
  await ensureSchema();
  const dialect = getDialect();

  if (dialect === "postgres") {
    const r = await getPgPool().query(`
      INSERT INTO portal_finans_kayit
        (firma_id, firma_ad, tur, baslik, tutar, odenen_tutar, para_birimi, vade_tarihi, taksit_no,
         taksit_toplam, tekrar, otomatik_odeme, bildirim_tarihi, bildirim_saati,
         durum, odeme_tarihi, notlar)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      item.companyId, item.companyName, item.kind, item.title, item.amount, item.paidAmount, item.currency,
      item.dueDate, item.installmentNo, item.installmentTotal, item.recurrence, item.autoPayment,
      item.reminderDate, item.reminderTime, item.status, item.paidDate, item.notes,
    ]);
    return mapEntry(r.rows[0]);
  }

  if (dialect === "mysql") {
    const [result] = await getMysqlPool().query<mysql.ResultSetHeader>(`
      INSERT INTO PortalFinansKayit
        (FirmaID, FirmaAd, Tur, Baslik, Tutar, OdenenTutar, ParaBirimi, VadeTarihi, TaksitNo,
         TaksitToplam, Tekrar, OtomatikOdeme, BildirimTarihi, BildirimSaati,
         Durum, OdemeTarihi, Notlar)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      item.companyId, item.companyName, item.kind, item.title, item.amount, item.paidAmount, item.currency,
      item.dueDate, item.installmentNo, item.installmentTotal, item.recurrence, item.autoPayment ? 1 : 0,
      item.reminderDate, item.reminderTime, item.status, item.paidDate, item.notes,
    ]);
    return (await getFinanceEntry(result.insertId))!;
  }

  const pool = await poolPromise;
  const r = await pool.request()
    .input("FirmaID", item.companyId)
    .input("FirmaAd", item.companyName)
    .input("Tur", item.kind)
    .input("Baslik", item.title)
    .input("Tutar", mssql.Decimal(18, 2), item.amount)
    .input("OdenenTutar", mssql.Decimal(18, 2), item.paidAmount)
    .input("ParaBirimi", item.currency)
    .input("VadeTarihi", item.dueDate)
    .input("TaksitNo", item.installmentNo)
    .input("TaksitToplam", item.installmentTotal)
    .input("Tekrar", item.recurrence)
    .input("OtomatikOdeme", item.autoPayment)
    .input("BildirimTarihi", item.reminderDate)
    .input("BildirimSaati", item.reminderTime)
    .input("Durum", item.status)
    .input("OdemeTarihi", item.paidDate)
    .input("Notlar", item.notes)
    .query(`
      INSERT INTO PortalFinansKayit
        (FirmaID, FirmaAd, Tur, Baslik, Tutar, OdenenTutar, ParaBirimi, VadeTarihi, TaksitNo,
         TaksitToplam, Tekrar, OtomatikOdeme, BildirimTarihi, BildirimSaati,
         Durum, OdemeTarihi, Notlar)
      OUTPUT INSERTED.*
      VALUES (@FirmaID,@FirmaAd,@Tur,@Baslik,@Tutar,@OdenenTutar,@ParaBirimi,@VadeTarihi,@TaksitNo,
              @TaksitToplam,@Tekrar,@OtomatikOdeme,@BildirimTarihi,@BildirimSaati,
              @Durum,@OdemeTarihi,@Notlar)
    `);
  return mapEntry(r.recordset[0]);
}

export async function getFinanceEntry(id: number): Promise<FinanceEntry | null> {
  await ensureSchema();
  const dialect = getDialect();
  if (dialect === "postgres") {
    const r = await getPgPool().query("SELECT * FROM portal_finans_kayit WHERE id = $1", [id]);
    return r.rows[0] ? mapEntry(r.rows[0]) : null;
  }
  if (dialect === "mysql") {
    const [rows] = await getMysqlPool().query("SELECT * FROM PortalFinansKayit WHERE ID = ?", [id]);
    const first = (rows as FinanceRow[])[0];
    return first ? mapEntry(first) : null;
  }
  const pool = await poolPromise;
  const r = await pool.request().input("ID", id).query("SELECT * FROM PortalFinansKayit WHERE ID = @ID");
  return r.recordset[0] ? mapEntry(r.recordset[0]) : null;
}

export async function updateFinanceEntry(id: number, input: FinanceEntryInput): Promise<FinanceEntry | null> {
  const item = normalizeEntry(input, true);
  await ensureSchema();
  const dialect = getDialect();

  if (dialect === "postgres") {
    const r = await getPgPool().query(`
      UPDATE portal_finans_kayit SET
        firma_id=$2, firma_ad=$3, tur=$4, baslik=$5, tutar=$6, odenen_tutar=$7, para_birimi=$8,
        vade_tarihi=$9, taksit_no=$10, taksit_toplam=$11, tekrar=$12,
        otomatik_odeme=$13, bildirim_tarihi=$14, bildirim_saati=$15,
        durum=$16, odeme_tarihi=$17, notlar=$18, updated_at=CURRENT_TIMESTAMP
      WHERE id=$1
      RETURNING *
    `, [
      id, item.companyId, item.companyName, item.kind, item.title, item.amount, item.paidAmount,
      item.currency, item.dueDate, item.installmentNo, item.installmentTotal,
      item.recurrence, item.autoPayment, item.reminderDate, item.reminderTime,
      item.status, item.paidDate, item.notes,
    ]);
    return r.rows[0] ? mapEntry(r.rows[0]) : null;
  }

  if (dialect === "mysql") {
    await getMysqlPool().query(`
      UPDATE PortalFinansKayit SET
        FirmaID=?, FirmaAd=?, Tur=?, Baslik=?, Tutar=?, OdenenTutar=?, ParaBirimi=?,
        VadeTarihi=?, TaksitNo=?, TaksitToplam=?, Tekrar=?,
        OtomatikOdeme=?, BildirimTarihi=?, BildirimSaati=?,
        Durum=?, OdemeTarihi=?, Notlar=?
      WHERE ID=?
    `, [
      item.companyId, item.companyName, item.kind, item.title, item.amount, item.paidAmount,
      item.currency, item.dueDate, item.installmentNo, item.installmentTotal,
      item.recurrence, item.autoPayment ? 1 : 0, item.reminderDate,
      item.reminderTime, item.status, item.paidDate, item.notes, id,
    ]);
    return getFinanceEntry(id);
  }

  const pool = await poolPromise;
  await pool.request()
    .input("ID", id)
    .input("FirmaID", item.companyId)
    .input("FirmaAd", item.companyName)
    .input("Tur", item.kind)
    .input("Baslik", item.title)
    .input("Tutar", mssql.Decimal(18, 2), item.amount)
    .input("OdenenTutar", mssql.Decimal(18, 2), item.paidAmount)
    .input("ParaBirimi", item.currency)
    .input("VadeTarihi", item.dueDate)
    .input("TaksitNo", item.installmentNo)
    .input("TaksitToplam", item.installmentTotal)
    .input("Tekrar", item.recurrence)
    .input("OtomatikOdeme", item.autoPayment)
    .input("BildirimTarihi", item.reminderDate)
    .input("BildirimSaati", item.reminderTime)
    .input("Durum", item.status)
    .input("OdemeTarihi", item.paidDate)
    .input("Notlar", item.notes)
    .query(`
      UPDATE PortalFinansKayit SET
        FirmaID=@FirmaID, FirmaAd=@FirmaAd, Tur=@Tur, Baslik=@Baslik, Tutar=@Tutar, OdenenTutar=@OdenenTutar,
        ParaBirimi=@ParaBirimi, VadeTarihi=@VadeTarihi, TaksitNo=@TaksitNo,
        TaksitToplam=@TaksitToplam, Tekrar=@Tekrar, OtomatikOdeme=@OtomatikOdeme,
        BildirimTarihi=@BildirimTarihi, BildirimSaati=@BildirimSaati, Durum=@Durum,
        OdemeTarihi=@OdemeTarihi, Notlar=@Notlar, UpdatedAt=GETDATE()
      WHERE ID=@ID
    `);
  return getFinanceEntry(id);
}

export async function deleteFinanceEntry(id: number): Promise<void> {
  await ensureSchema();
  const dialect = getDialect();
  if (dialect === "postgres") {
    await getPgPool().query("DELETE FROM portal_finans_kayit WHERE id = $1", [id]);
    return;
  }
  if (dialect === "mysql") {
    await getMysqlPool().query("DELETE FROM PortalFinansKayit WHERE ID = ?", [id]);
    return;
  }
  const pool = await poolPromise;
  await pool.request().input("ID", id).query("DELETE FROM PortalFinansKayit WHERE ID = @ID");
}
