import type { RaporHeader, HizmetRow } from "@/app/rapor-onay-print/[nkrId]/reportTypes";
import type { RaporMeta } from "@/lib/raporViewData";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { applyManualServiceOrder } from "@/lib/raporServiceOrder";

export interface RaporEditPayload {
  header?: Partial<RaporHeader>;
  hizmetler?: HizmetRow[];
  meta?: Partial<RaporMeta>;
}

export interface RaporEditRecord {
  payload: RaporEditPayload | null;
  kilitli: boolean;
}

const EDITABLE_HEADER_KEYS = [
  "Numune_Adi",
  "Numune_Adi_En",
  "Urun_Tipi",
  "Karar",
  "Aciklamalar",
] as const satisfies readonly (keyof RaporHeader)[];

function sanitizeHeaderEdit(header: RaporEditPayload["header"]): RaporEditPayload["header"] {
  if (!header) return undefined;
  const sanitized: Partial<RaporHeader> = {};
  for (const key of EDITABLE_HEADER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(header, key)) {
      sanitized[key] = header[key] as never;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizePayload(payload: RaporEditPayload): RaporEditPayload {
  return {
    ...payload,
    header: sanitizeHeaderEdit(payload.header),
  };
}

export function buildRaporSnapshotPayload(data: {
  header: RaporHeader;
  hizmetler: HizmetRow[];
  meta: RaporMeta;
}): RaporEditPayload {
  return {
    header: data.header,
    hizmetler: data.hizmetler,
    meta: data.meta,
  };
}

async function ensureRaporDuzenlemeTable(pool: any) {
  if (hasMysqlConfig()) {
    await pool.request().query(`
      CREATE TABLE IF NOT EXISTS NKR_RaporDuzenleme (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        NkrID INT NOT NULL,
        RaporFormati VARCHAR(80) NOT NULL,
        Payload LONGTEXT NULL,
        Kilitli TINYINT(1) NOT NULL DEFAULT 0,
        CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CreatedBy INT NULL,
        UpdatedBy INT NULL,
        UNIQUE KEY UX_NKR_RaporDuzenleme_Nkr_Format (NkrID, RaporFormati)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci
    `);
    return;
  }

  await pool.request().query(`
    IF OBJECT_ID('dbo.NKR_RaporDuzenleme', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.NKR_RaporDuzenleme (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        NkrID INT NOT NULL,
        RaporFormati NVARCHAR(80) NOT NULL,
        Payload NVARCHAR(MAX) NULL,
        Kilitli BIT NOT NULL CONSTRAINT DF_NKR_RaporDuzenleme_Kilitli DEFAULT 0,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_NKR_RaporDuzenleme_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_NKR_RaporDuzenleme_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CreatedBy INT NULL,
        UpdatedBy INT NULL
      );
      CREATE UNIQUE INDEX UX_NKR_RaporDuzenleme_Nkr_Format
        ON dbo.NKR_RaporDuzenleme (NkrID, RaporFormati);
    END
  `);
}

export async function loadRaporEdit(pool: any, nkrId: number, format: string): Promise<RaporEditRecord> {
  await ensureRaporDuzenlemeTable(pool);
  let row: any;
  try {
    const result = await pool.request()
      .input("nkrId", nkrId)
      .input("format", format)
      .query(`
        SELECT TOP 1 Payload, Kilitli
        FROM dbo.NKR_RaporDuzenleme
        WHERE NkrID = @nkrId AND RaporFormati = @format
      `);
    row = result.recordset[0];
  } catch {
    // Tablo yoksa (MySQL'de CREATE TABLE compat katmanında no-op'lanır → tablo
    // migration ile gelir) düzenleme verisi yok kabul edilir; ham rapor içeriği
    // kullanılır. Onay/önizleme akışı bu yüzden patlamamalı.
    return { payload: null, kilitli: false };
  }
  if (!row) return { payload: null, kilitli: false };
  let payload: RaporEditPayload | null = null;
  try {
    payload = row.Payload ? JSON.parse(String(row.Payload)) : null;
  } catch {
    payload = null;
  }
  return { payload, kilitli: Boolean(row.Kilitli) };
}

export async function saveRaporEdit(pool: any, nkrId: number, format: string, payload: RaporEditPayload, userId: number | null) {
  await ensureRaporDuzenlemeTable(pool);
  const body = JSON.stringify(sanitizePayload(payload));
  if (hasMysqlConfig()) {
    await pool.request()
      .input("nkrId", nkrId)
      .input("format", format)
      .input("payload", body)
      .input("userId", userId)
      .query(`
        INSERT INTO NKR_RaporDuzenleme (NkrID, RaporFormati, Payload, Kilitli, CreatedBy, UpdatedBy)
        VALUES (@nkrId, @format, @payload, 0, @userId, @userId)
        ON DUPLICATE KEY UPDATE
          Payload = IF(Kilitli = 0, VALUES(Payload), Payload),
          UpdatedAt = IF(Kilitli = 0, NOW(), UpdatedAt),
          UpdatedBy = IF(Kilitli = 0, VALUES(UpdatedBy), UpdatedBy)
      `);
    return;
  }

  await pool.request()
    .input("nkrId", nkrId)
    .input("format", format)
    .input("payload", body)
    .input("userId", userId)
    .query(`
      MERGE dbo.NKR_RaporDuzenleme AS target
      USING (SELECT @nkrId AS NkrID, @format AS RaporFormati) AS src
        ON target.NkrID = src.NkrID AND target.RaporFormati = src.RaporFormati
      WHEN MATCHED AND target.Kilitli = 0 THEN
        UPDATE SET Payload = @payload, UpdatedAt = SYSUTCDATETIME(), UpdatedBy = @userId
      WHEN NOT MATCHED THEN
        INSERT (NkrID, RaporFormati, Payload, Kilitli, CreatedBy, UpdatedBy)
        VALUES (@nkrId, @format, @payload, 0, @userId, @userId);
    `);
}

export async function lockRaporEdit(pool: any, nkrId: number, format: string, snapshot?: RaporEditPayload | null) {
  await ensureRaporDuzenlemeTable(pool);
  // Kilitleme "best-effort": düzenleme tablosu yoksa kilitlenecek bir kayıt da
  // yoktur. Onay akışını (rapor onayla) bu yüzden BLOKLAMAMALI — tablo migration
  // ile gelene kadar sessiz geçilir.
  try {
    if (hasMysqlConfig()) {
      await pool.request()
        .input("nkrId", nkrId)
        .input("format", format)
        .input("payload", snapshot ? JSON.stringify(snapshot) : null)
        .query(`
          INSERT INTO NKR_RaporDuzenleme (NkrID, RaporFormati, Payload, Kilitli)
          VALUES (@nkrId, @format, @payload, 1)
          ON DUPLICATE KEY UPDATE
            Payload = COALESCE(VALUES(Payload), Payload),
            Kilitli = 1,
            UpdatedAt = NOW()
        `);
      return;
    }

    await pool.request()
      .input("nkrId", nkrId)
      .input("format", format)
      .input("payload", snapshot ? JSON.stringify(snapshot) : null)
      .query(`
        MERGE dbo.NKR_RaporDuzenleme AS target
        USING (SELECT @nkrId AS NkrID, @format AS RaporFormati) AS src
          ON target.NkrID = src.NkrID AND target.RaporFormati = src.RaporFormati
        WHEN MATCHED THEN
          UPDATE SET Payload = COALESCE(@payload, Payload),
                     Kilitli = 1,
                     UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (NkrID, RaporFormati, Payload, Kilitli)
          VALUES (@nkrId, @format, @payload, 1);
      `);
  } catch {
    // Tablo yok / kilitlenemedi → onay yine de geçerli.
  }
}

function serviceKey(row: HizmetRow): string | null {
  if (row.X1ID != null) return `x1:${row.X1ID}`;
  if (row.AnalizID != null) return `analiz:${row.AnalizID}:${row.Kod || ""}`;
  return row.Kod ? `kod:${row.Kod}` : null;
}

function applyEditedServicesInDbOrder(baseRows: HizmetRow[], editedRows: HizmetRow[]): HizmetRow[] {
  const editedByKey = new Map<string, HizmetRow>();
  for (const row of editedRows) {
    const key = serviceKey(row);
    if (key) editedByKey.set(key, row);
  }

  const used = new Set<HizmetRow>();
  const ordered = baseRows.map((base) => {
    const key = serviceKey(base);
    const edited = key ? editedByKey.get(key) : undefined;
    if (!edited) return base;
    used.add(edited);
    return { ...edited, RaporSira: base.RaporSira };
  });

  for (const row of editedRows) {
    if (!used.has(row)) ordered.push(row);
  }

  return applyManualServiceOrder(ordered);
}

export function applyRaporEdit<T extends { header: RaporHeader; hizmetler: HizmetRow[]; meta: RaporMeta }>(
  data: T,
  edit: RaporEditPayload | RaporEditRecord | null,
): T {
  if (!edit) return data;
  const isRecord = "payload" in edit || "kilitli" in edit;
  const payload = isRecord ? edit.payload : edit;
  const kilitli = isRecord ? Boolean(edit.kilitli) : false;
  if (!payload) return data;
  const headerEdit = kilitli ? payload.header : sanitizeHeaderEdit(payload.header);
  return {
    ...data,
    header: headerEdit ? { ...data.header, ...headerEdit } : data.header,
    hizmetler: Array.isArray(payload.hizmetler)
      ? applyEditedServicesInDbOrder(data.hizmetler, payload.hizmetler)
      : data.hizmetler,
    meta: payload.meta ? { ...data.meta, ...payload.meta } : data.meta,
  };
}
