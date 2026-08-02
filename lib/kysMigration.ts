import { cosmoPool, legacyCosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { ensureKysSchema } from "@/lib/kysStore";

type MigrationMode = "dry-run" | "run";
type DbRow = Record<string, unknown>;

type MigrationTableResult = {
  table: string;
  sourceExists: boolean;
  sourceCount: number;
  inserted: number;
  updated: number;
  skipped: number;
  message?: string;
};

export type KysMigrationResult = {
  mode: MigrationMode;
  target: "mysql";
  tables: MigrationTableResult[];
};

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function nullable(value: unknown): string | null {
  const text = str(value);
  return text || null;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

async function sourceTableExists(table: string) {
  const source = await legacyCosmoPool;
  const res = await source.request()
    .input("table", table)
    .query("SELECT 1 AS x FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @table");
  return res.recordset.length > 0;
}

async function sourceColumns(table: string) {
  const source = await legacyCosmoPool;
  const res = await source.request()
    .input("table", table)
    .query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @table");
  return new Set(res.recordset.map((r: DbRow) => str(r.COLUMN_NAME)));
}

function selectColumn(cols: Set<string>, name: string, fallback: string, alias = name) {
  return cols.has(name) ? `${name} AS ${alias}` : `${fallback} AS ${alias}`;
}

async function countSource(table: string) {
  const source = await legacyCosmoPool;
  const res = await source.request().query(`SELECT COUNT(*) AS total FROM ${table}`);
  return Number(res.recordset[0]?.total ?? res.recordset[0]?.TOTAL ?? 0);
}

async function migrateBirimler(mode: MigrationMode): Promise<MigrationTableResult> {
  const table = "RootFirmaBirim";
  const sourceExists = await sourceTableExists(table);
  if (!sourceExists) return { table, sourceExists, sourceCount: 0, inserted: 0, updated: 0, skipped: 0, message: "Kaynak tablo yok, atlandı." };

  const sourceCount = await countSource(table);
  if (mode === "dry-run") return { table, sourceExists, sourceCount, inserted: 0, updated: 0, skipped: 0 };

  const source = await legacyCosmoPool;
  const target = await cosmoPool;
  const rows = (await source.request().query(`
    SELECT ID, Birim, FirmaID, Durum
    FROM RootFirmaBirim
    WHERE ISNULL(Birim, '') <> ''
    ORDER BY ID
  `)).recordset;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const legacyId = num(row.ID);
    const ad = str(row.Birim);
    if (!legacyId || !ad) {
      skipped += 1;
      continue;
    }
    const durum = str(row.Durum) || "Aktif";
    const exists = await target.request()
      .input("LegacyID", legacyId)
      .input("Ad", ad)
      .query("SELECT ID FROM KysLaboratuvarBirim WHERE LegacyID = @LegacyID OR Ad = @Ad");

    if (exists.recordset[0]) {
      await target.request()
        .input("ID", Number(exists.recordset[0].ID))
        .input("LegacyID", legacyId)
        .input("Kod", nullable(row.FirmaID))
        .input("Ad", ad)
        .input("Durum", durum)
        .query(`
          UPDATE KysLaboratuvarBirim
          SET LegacyID = @LegacyID, Kod = @Kod, Ad = @Ad, Durum = @Durum, UpdatedAt = GETDATE()
          WHERE ID = @ID
        `);
      updated += 1;
    } else {
      await target.request()
        .input("LegacyID", legacyId)
        .input("Kod", nullable(row.FirmaID))
        .input("Ad", ad)
        .input("Durum", durum)
        .query(`
          INSERT INTO KysLaboratuvarBirim (LegacyID, Kod, Ad, Durum)
          VALUES (@LegacyID, @Kod, @Ad, @Durum)
        `);
      inserted += 1;
    }
  }

  return { table, sourceExists, sourceCount, inserted, updated, skipped };
}

async function migrateSStokListe(mode: MigrationMode): Promise<MigrationTableResult> {
  const table = "SStokListe";
  const sourceExists = await sourceTableExists(table);
  if (!sourceExists) return { table, sourceExists, sourceCount: 0, inserted: 0, updated: 0, skipped: 0, message: "Kaynak tablo yok, atlandı." };

  const sourceCount = await countSource(table);
  if (mode === "dry-run") return { table, sourceExists, sourceCount, inserted: 0, updated: 0, skipped: 0 };

  const cols = await sourceColumns(table);
  const source = await legacyCosmoPool;
  const target = await cosmoPool;
  const rows = (await source.request().query(`
    SELECT
      ${selectColumn(cols, "ID", "NULL")},
      ${selectColumn(cols, "Kod", "NULL")},
      ${selectColumn(cols, "Ad", "NULL")},
      ${selectColumn(cols, "Kategori", "NULL")},
      ${selectColumn(cols, "Marka", "NULL")},
      ${selectColumn(cols, "Stok", "0")},
      ${selectColumn(cols, "Birim", "NULL")},
      ${selectColumn(cols, "Durum", "'Aktif'")}
    FROM SStokListe
    ORDER BY ${cols.has("ID") ? "ID" : "Ad"}
  `)).recordset;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const legacyId = num(row.ID);
    const kod = str(row.Kod) || (legacyId ? `SSTOK-${legacyId}` : "");
    const ad = str(row.Ad);
    if (!kod || !ad) {
      skipped += 1;
      continue;
    }
    const malzemeTuru = str(row.Kategori) || "Sarf";
    const birim = str(row.Birim) || "Adet";
    const stokMiktari = num(row.Stok);
    const durum = str(row.Durum) || "Aktif";

    const exists = await target.request()
      .input("LegacyID", legacyId || null)
      .input("Kod", kod)
      .query("SELECT ID FROM KysStokKart WHERE (LegacyID = @LegacyID AND @LegacyID IS NOT NULL) OR Kod = @Kod");

    if (exists.recordset[0]) {
      await target.request()
        .input("ID", Number(exists.recordset[0].ID))
        .input("LegacyID", legacyId || null)
        .input("Barkod", kod)
        .input("MalzemeTuru", malzemeTuru)
        .input("Kod", kod)
        .input("Ad", ad)
        .input("Ozellik", nullable(row.Marka))
        .input("StokMiktari", stokMiktari)
        .input("StokDurumu", durum)
        .input("Birim", birim)
        .query(`
          UPDATE KysStokKart
          SET LegacyID = @LegacyID, Barkod = @Barkod, MalzemeTuru = @MalzemeTuru,
              Kod = @Kod, Ad = @Ad, Ozellik = @Ozellik, StokMiktari = @StokMiktari,
              StokDurumu = @StokDurumu, Birim = @Birim, UpdatedAt = GETDATE()
          WHERE ID = @ID
        `);
      updated += 1;
    } else {
      await target.request()
        .input("LegacyID", legacyId || null)
        .input("Barkod", kod)
        .input("MalzemeTuru", malzemeTuru)
        .input("Kod", kod)
        .input("Ad", ad)
        .input("Ozellik", nullable(row.Marka))
        .input("StokMiktari", stokMiktari)
        .input("StokDurumu", durum)
        .input("Birim", birim)
        .query(`
          INSERT INTO KysStokKart
            (LegacyID, Barkod, MalzemeTuru, Kod, Ad, Ozellik, StokMiktari, StokDurumu, Birim)
          VALUES
            (@LegacyID, @Barkod, @MalzemeTuru, @Kod, @Ad, @Ozellik, @StokMiktari, @StokDurumu, @Birim)
        `);
      inserted += 1;
    }
  }

  return { table, sourceExists, sourceCount, inserted, updated, skipped };
}

export async function migrateKysCosmoToMysql(mode: MigrationMode = "dry-run"): Promise<KysMigrationResult> {
  if (!hasMysqlConfig()) {
    throw new Error("MySQL hedef bağlantısı yok. MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE tanımlı olmalı.");
  }

  if (mode === "run") await ensureKysSchema();

  const tables: MigrationTableResult[] = [];
  tables.push(await migrateBirimler(mode));
  tables.push(await migrateSStokListe(mode));

  return { mode, target: "mysql", tables };
}
