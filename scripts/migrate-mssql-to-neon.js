#!/usr/bin/env node

/**
 * Mirrors the MSSQL database structure and data into Neon/PostgreSQL.
 *
 * - Creates source schemas (for example dbo, cosmoroot) in PostgreSQL.
 * - Creates PostgreSQL tables with quoted source table/column names.
 * - Copies table data in batches.
 * - Skips tables that already have rows, so running it again is non-destructive.
 *
 * Usage:
 *   node scripts/migrate-mssql-to-neon.js
 *   node scripts/migrate-mssql-to-neon.js --tables dbo.RootTedarikci,dbo.StokAnalizListesi
 */

const fs = require("fs");
const path = require("path");
const mssql = require("mssql");
const { createPool } = require("@vercel/postgres");

const BATCH_SIZE = Number(process.env.MIGRATION_BATCH_SIZE || 500);

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!process.env[key.trim()]) process.env[key.trim()] = value.trim();
  }
}

function qIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function qMsIdent(value) {
  return `[${String(value).replace(/]/g, "]]")}]`;
}

function tableFullName(table) {
  return `${qIdent(table.schema_name)}.${qIdent(table.table_name)}`;
}

function msTableFullName(table) {
  return `${qMsIdent(table.schema_name)}.${qMsIdent(table.table_name)}`;
}

function pgType(col) {
  const t = String(col.data_type).toLowerCase();
  const max = Number(col.max_length);
  const precision = Number(col.precision || 18);
  const scale = Number(col.scale || 0);

  switch (t) {
    case "bigint": return "bigint";
    case "int": return "integer";
    case "smallint": return "smallint";
    case "tinyint": return "smallint";
    case "bit": return "boolean";
    case "decimal":
    case "numeric": return `numeric(${precision},${scale})`;
    case "money":
    case "smallmoney": return "numeric(19,4)";
    case "float": return "double precision";
    case "real": return "real";
    case "date": return "date";
    case "datetime":
    case "datetime2":
    case "smalldatetime": return "timestamp";
    case "datetimeoffset": return "timestamptz";
    case "time": return "time";
    case "uniqueidentifier": return "uuid";
    case "binary":
    case "varbinary":
    case "image": return "bytea";
    case "xml":
    case "text":
    case "ntext": return "text";
    case "char":
    case "varchar":
    case "nchar":
    case "nvarchar":
      return "text";
    default:
      return "text";
  }
}

async function getTables(msPool, filter) {
  const result = await msPool.request().query(`
    SELECT s.name AS schema_name, t.name AS table_name, SUM(p.rows) AS row_count
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    LEFT JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
    WHERE t.is_ms_shipped = 0
    GROUP BY s.name, t.name
    ORDER BY s.name, t.name
  `);

  let tables = result.recordset;
  if (filter.size) {
    tables = tables.filter((t) => filter.has(`${t.schema_name}.${t.table_name}`));
  }
  return tables;
}

async function getColumns(msPool, table) {
  const result = await msPool.request()
    .input("schema", table.schema_name)
    .input("table", table.table_name)
    .query(`
      SELECT
        c.COLUMN_NAME AS column_name,
        c.DATA_TYPE AS data_type,
        c.CHARACTER_MAXIMUM_LENGTH AS max_length,
        c.NUMERIC_PRECISION AS precision,
        c.NUMERIC_SCALE AS scale,
        c.IS_NULLABLE AS is_nullable,
        COLUMNPROPERTY(OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)), c.COLUMN_NAME, 'IsIdentity') AS is_identity,
        c.ORDINAL_POSITION AS ordinal_position
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @table
      ORDER BY c.ORDINAL_POSITION
    `);
  return result.recordset;
}

async function getPrimaryKey(msPool, table) {
  const result = await msPool.request()
    .input("schema", table.schema_name)
    .input("table", table.table_name)
    .query(`
      SELECT c.name AS column_name, ic.key_ordinal
      FROM sys.key_constraints kc
      JOIN sys.tables t ON t.object_id = kc.parent_object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      JOIN sys.index_columns ic ON ic.object_id = t.object_id AND ic.index_id = kc.unique_index_id
      JOIN sys.columns c ON c.object_id = t.object_id AND c.column_id = ic.column_id
      WHERE kc.type = 'PK' AND s.name = @schema AND t.name = @table
      ORDER BY ic.key_ordinal
    `);
  return result.recordset.map((row) => row.column_name);
}

async function ensurePgTable(pgPool, table, columns, primaryKey) {
  await pgPool.query(`CREATE SCHEMA IF NOT EXISTS ${qIdent(table.schema_name)}`);

  const columnSql = columns.map((col) => {
    const nullable = col.is_nullable === "NO" ? "NOT NULL" : "";
    return `${qIdent(col.column_name)} ${pgType(col)} ${nullable}`.trim();
  });

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ${tableFullName(table)} (
      ${columnSql.join(",\n      ")}
    )
  `);

  for (const col of columns) {
    await pgPool.query(`
      ALTER TABLE ${tableFullName(table)}
      ADD COLUMN IF NOT EXISTS ${qIdent(col.column_name)} ${pgType(col)}
    `);

    if (["char", "varchar", "nchar", "nvarchar", "text", "ntext", "xml"].includes(String(col.data_type).toLowerCase())) {
      await pgPool.query(`
        ALTER TABLE ${tableFullName(table)}
        ALTER COLUMN ${qIdent(col.column_name)} TYPE text
      `);
    }
  }

  if (primaryKey.length) {
    const constraintName = `${table.schema_name}_${table.table_name}_pk`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 55);
    await pgPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = ${literal(constraintName)}
            AND conrelid = to_regclass(${literal(`${qIdent(table.schema_name)}.${qIdent(table.table_name)}`)})
        ) THEN
          ALTER TABLE ${tableFullName(table)}
          ADD CONSTRAINT ${qIdent(constraintName)}
          PRIMARY KEY (${primaryKey.map(qIdent).join(", ")});
        END IF;
      END $$;
    `);
  }
}

function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function pgRowCount(pgPool, table) {
  const result = await pgPool.query(`SELECT COUNT(*)::int AS count FROM ${tableFullName(table)}`);
  return result.rows[0].count;
}

function sanitizeValue(value) {
  if (value === undefined) return null;
  return value;
}

async function copyTable(msPool, pgPool, table, columns, primaryKey, totalRows) {
  const existingRows = await pgRowCount(pgPool, table);
  if (existingRows > 0) {
    console.log(`  skip: Neon table already has ${existingRows} rows`);
    return { copied: 0, skipped: true };
  }

  const colNames = columns.map((c) => c.column_name);
  const selectCols = colNames.map(qMsIdent).join(", ");
  const insertCols = colNames.map(qIdent).join(", ");
  const orderCols = primaryKey.length ? primaryKey.map(qMsIdent).join(", ") : qMsIdent(colNames[0]);

  let copied = 0;
  while (copied < totalRows) {
    const rowsResult = await msPool.request()
      .input("offset", copied)
      .input("limit", BATCH_SIZE)
      .query(`
        SELECT ${selectCols}
        FROM ${msTableFullName(table)}
        ORDER BY ${orderCols}
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    const rows = rowsResult.recordset;
    if (!rows.length) break;

    const values = [];
    const placeholders = rows.map((row, rowIndex) => {
      const rowPlaceholders = colNames.map((name, colIndex) => {
        values.push(sanitizeValue(row[name]));
        return `$${rowIndex * colNames.length + colIndex + 1}`;
      });
      return `(${rowPlaceholders.join(", ")})`;
    });

    await pgPool.query(
      `INSERT INTO ${tableFullName(table)} (${insertCols}) VALUES ${placeholders.join(", ")}`,
      values
    );

    copied += rows.length;
    console.log(`  copied ${copied}/${totalRows}`);
  }

  return { copied, skipped: false };
}

async function main() {
  loadEnv();

  const neonUrl = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
  if (!neonUrl) throw new Error("UGD_POSTGRESS_URL or UGD_POSTGRES_URL is required.");

  const tableArg = process.argv.find((arg) => arg.startsWith("--tables="));
  const filter = new Set(
    tableArg
      ? tableArg.replace("--tables=", "").split(",").map((x) => x.trim()).filter(Boolean)
      : []
  );

  const msPool = await new mssql.ConnectionPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    server: process.env.DB_SERVER,
    port: 1433,
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    options: { encrypt: true, trustServerCertificate: true },
    requestTimeout: 180000,
  }).connect();

  const pgPool = createPool({ connectionString: neonUrl });

  try {
    const tables = await getTables(msPool, filter);
    console.log(`Found ${tables.length} MSSQL tables to mirror.`);

    let totalCopied = 0;
    for (const [index, table] of tables.entries()) {
      const totalRows = Number(table.row_count || 0);
      console.log(`\n[${index + 1}/${tables.length}] ${table.schema_name}.${table.table_name} (${totalRows} rows)`);

      const columns = await getColumns(msPool, table);
      const primaryKey = await getPrimaryKey(msPool, table);
      await ensurePgTable(pgPool, table, columns, primaryKey);

      const result = await copyTable(msPool, pgPool, table, columns, primaryKey, totalRows);
      totalCopied += result.copied;
    }

    console.log(`\nDone. Copied ${totalCopied} rows into Neon.`);
  } finally {
    await msPool.close();
    await pgPool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
