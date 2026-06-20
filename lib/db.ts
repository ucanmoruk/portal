import mssql from "mssql";
import { createPool } from "@vercel/postgres";
import { installSocketGuard } from "./socketGuard";
import { MysqlCompatPool, hasMysqlConfig } from "./mysqlCompat";

type InputValue = string | number | boolean | Date | null | undefined | Buffer;

const usePostgres = Boolean(process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL);

// MSSQL/tedious soketlerinin EPIPE/ECONNRESET uncaughtException'larını yutan guard
// (worker/lambda çökmesini önler) — tek kaynak lib/socketGuard, bir kez kurulur.
// instrumentation.ts da kurar; globalThis bayrağı çift kurulumu engeller.
if (typeof process !== "undefined" && typeof process.on === "function") {
  installSocketGuard();
}

// Sunucu/kimlik ortak; yalnızca veritabanı adı değişir (massgrup_cosmo, massgrup_root, ...)
const mssqlConfigFor = (database: string): mssql.config => ({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database,
  server: process.env.DB_SERVER || "",
  port: 1433,
  // 8K+ kayıt × birden fazla join içeren agreg sorgular default 15s'i aşabiliyor.
  // 60s, dashboard sayma/listeleme için gerçekçi tavan.
  requestTimeout: 60000,
  // HIZLI-FAIL: cPanel'den MSSQL'e erişim yoksa (mssql04 ulaşılamaz) istek
  // 90s (30s×3) yerine ~5s'de hata versin → process birikmesini önler.
  connectionTimeout: 5000,
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 10000,
    acquireTimeoutMillis: 8000,
  },
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
});

// Her MSSQL veritabanı için ayrı, cache'lenen bağlantı havuzu.
const mssqlPools = new Map<string, Promise<mssql.ConnectionPool>>();

// ── Circuit breaker ──────────────────────────────────────────────────────────
// MSSQL sunucusu erişilemezse (cPanel→mssql04 ulaşamıyor) her istek 5s timeout
// bekleyip process meşgul ediyor; istekler birikince hesabın process limiti
// doluyor ve TÜM site (login dahil) kilitleniyor. Breaker: ardarda fail'den
// sonra COOLDOWN boyunca HİÇ bağlanmayı denemez, anında hata döner → process
// birikmez. Cooldown bitince tek deneme (half-open) yapar.
const CB_COOLDOWN_MS = 30_000;
const cbState = new Map<string, { failedAt: number }>();

const getMssqlPoolFor = (database: string) => {
  if (!process.env.DB_SERVER || !process.env.DB_USER) {
    throw new Error("MSSQL environment variables are missing. Set DB_SERVER, DB_USER and DB_PASSWORD.");
  }
  if (!database) {
    throw new Error("MSSQL database name is empty.");
  }

  // Breaker açıksa (yakın zamanda fail) — bağlanmayı DENEME, anında hata ver.
  const cb = cbState.get(database);
  if (cb && Date.now() - cb.failedAt < CB_COOLDOWN_MS) {
    throw new Error(
      `MSSQL (${database}) circuit-breaker açık — son ${Math.round(
        (Date.now() - cb.failedAt) / 1000,
      )}s önce erişilemedi, ${Math.round(CB_COOLDOWN_MS / 1000)}s cooldown.`,
    );
  }

  let connection = mssqlPools.get(database);
  if (!connection) {
    connection = createFreshPool(database);
    mssqlPools.set(database, connection);
  }
  return connection;
};

// Geçici (transient) bağlantı hatası mı? — ECONNRESET, half-open socket vb.
function isTransientDbError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("econnreset") ||
    msg.includes("connection lost") ||
    msg.includes("connection is closed") ||
    msg.includes("connection closed") ||
    msg.includes("etimedout") ||
    msg.includes("esockettimedout") ||
    msg.includes("epipe") ||
    msg.includes("socket hang up") ||
    err?.code === "ECONNRESET" ||
    err?.code === "ECONNCLOSED"
  );
}

// Pool oluştur (connect retry ile) + idle/error handler bağla.
// Vercel cold start'ta uzak (Türkiye) MSSQL'e TLS handshake bazen reset olur →
// 3 denemeye kadar artan bekleme ile yeniden dene.
function createFreshPool(database: string): Promise<mssql.ConnectionPool> {
  const attempt = async (n: number): Promise<mssql.ConnectionPool> => {
    try {
      const pool = await new mssql.ConnectionPool(mssqlConfigFor(database)).connect();
      console.log(`MSSQL veritabanina baglanildi: ${database}`);
      cbState.delete(database); // başarı → breaker'ı kapat
      const cachedRef = mssqlPools.get(database);
      const invalidate = (reason: string) => (err?: unknown) => {
        console.log(`MSSQL pool invalidated (${database}, ${reason}):`, err);
        if (mssqlPools.get(database) === cachedRef) mssqlPools.delete(database);
        try { pool.close(); } catch { /* ignore */ }
      };
      pool.on("error", invalidate("pool error"));
      pool.on("close", invalidate("pool close"));
      return pool;
    } catch (err) {
      if (n < 3 && isTransientDbError(err)) {
        console.log(`MSSQL connect retry ${n}/3 (${database})…`);
        await new Promise((r) => setTimeout(r, 250 * n));
        return attempt(n + 1);
      }
      console.log(`MSSQL baglanti hatasi (${database}): `, err);
      throw err;
    }
  };
  const p = attempt(1).catch((err) => {
    // Başarısız pool'u cache'te bırakma + breaker'ı aç (cooldown başlat)
    if (mssqlPools.get(database) === p) mssqlPools.delete(database);
    cbState.set(database, { failedAt: Date.now() });
    throw err;
  });
  return p;
}

// ── Resilient pool/request — stale target'a ASLA bağlı kalmaz ──────────────
// Sorun: route `await cosmoPool` ile pool'u bir kez alıp tutuyor, sonra çok
// kez .request() çağırıyor. Vercel Lambda thaw sonrası pool ölmüşse, sabit
// target'lı bir sarmalayıcı ölü pool'a takılı kalır. Bu sınıf her .query()'de
// o anki sağlıklı pool'u getMssqlPoolFor ile yeniden edinir ve ECONNRESET'te
// pool'u invalidate edip 1 kez retry eder. Routes hiç değişmez.

class ResilientRequest {
  private inputCalls: unknown[][] = [];
  constructor(private database: string) {}

  input(...args: unknown[]) {
    this.inputCalls.push(args);
    return this;
  }

  private buildReal(pool: mssql.ConnectionPool) {
    const r = pool.request();
    for (const args of this.inputCalls) (r.input as (...a: unknown[]) => unknown)(...args);
    return r;
  }

  private async run(method: "query" | "batch", sql: string): Promise<any> {
    let pool = await getMssqlPoolFor(this.database);
    try {
      return await (this.buildReal(pool) as any)[method](sql);
    } catch (err) {
      if (!isTransientDbError(err)) throw err;
      console.log(`MSSQL transient (${this.database}) → fresh pool + retry`);
      mssqlPools.delete(this.database);
      try { (await pool.close?.()); } catch { /* ignore */ }
      pool = await getMssqlPoolFor(this.database);
      return await (this.buildReal(pool) as any)[method](sql);
    }
  }

  query(sql: string) { return this.run("query", sql); }
  batch(sql: string) { return this.run("batch", sql); }
}

class ResilientPool {
  // ÖNEMLI: gerçek mssql.ConnectionPool'da `.config` olur. Bazı helper'lar
  // (örn. lib/labUgdrStorage.ts) dialect'i `pool.config` varlığıyla belirler:
  // config varsa MSSQL, yoksa Postgres. ResilientPool MSSQL'i temsil ettiği için
  // config'i MUTLAKA expose etmeliyiz; aksi halde MSSQL'e Postgres SQL'i gider
  // ("Incorrect syntax near ..." hatası).
  readonly config: mssql.config;
  constructor(private database: string) {
    this.config = mssqlConfigFor(database);
  }
  request() { return new ResilientRequest(this.database); }
  // transaction cosmo/root'ta kullanılmıyor; gerekirse gerçek pool'a düşer.
  async transaction() {
    const pool = await getMssqlPoolFor(this.database);
    return pool.transaction();
  }
}

// Varsayılan MSSQL havuzu — eski davranışı korur (DB_NAME).
// Menü bazlı MSSQL veritabanı adları (bkz. DB yönlendirme haritası).
const MSSQL_COSMO_DB = process.env.MSSQL_COSMO_DB || "massgrup_cosmo";
const MSSQL_ROOT_DB = process.env.MSSQL_ROOT_DB || "massgrup_root";

interface DbMetadata {
  tables: { name: string; schema: string }[];
  columns: string[];
}

let pgPool: ReturnType<typeof createPool> | undefined;
let metadataPromise: Promise<DbMetadata> | undefined;
let metadataLoadedAt = 0;
// 60s TTL — DDL (ALTER TABLE, CREATE TABLE) sonrası sunucu restart gerektirmesin.
// Önceki davranış: bir kez yüklenir hiç tazelenmezdi → yeni kolon/tablo
// metadata'da görünmediği için unquoted kalıyor, Postgres lowercase'liyor,
// "relation/column does not exist" hatası veriyordu.
const METADATA_TTL_MS = 60_000;

const getPgPool = () => {
  const connectionString = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
  if (!connectionString) {
    throw new Error("UGD PostgreSQL environment variable is missing. Set UGD_POSTGRESS_URL or UGD_POSTGRES_URL.");
  }

  pgPool ??= createPool({ connectionString });
  return pgPool;
};

const getMetadata = async (): Promise<DbMetadata> => {
  if (metadataPromise && Date.now() - metadataLoadedAt < METADATA_TTL_MS) {
    return metadataPromise;
  }
  metadataLoadedAt = Date.now();
  metadataPromise = getPgPool()
    .query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema IN ('dbo', 'cosmoroot')
        AND table_type = 'BASE TABLE'
    `)
    .then(async (tablesResult) => {
      const colsResult = await getPgPool().query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema IN ('dbo', 'cosmoroot')
      `);

      const tableMap = new Map<string, string>();
      for (const row of tablesResult.rows) {
        const name = row.table_name as string;
        const schema = row.table_schema as string;
        if (!tableMap.has(name) || schema === "dbo") tableMap.set(name, schema);
      }
      const tables = [...tableMap.entries()]
        .map(([name, schema]) => ({ name, schema }))
        .sort((a, b) => b.name.length - a.name.length);
      const columns = [...new Set(colsResult.rows.map((row) => row.column_name as string))]
        .sort((a, b) => b.length - a.length);

      return { tables, columns };
    })
    .catch((err) => {
      // Hata olursa cache'i temizle, bir sonraki çağrı tekrar denesin
      metadataPromise = undefined;
      metadataLoadedAt = 0;
      throw err;
    });

  return metadataPromise;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const quoteIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;
const identPattern = (value: string) =>
  new RegExp(`(?<![@"\.\\p{L}\\p{N}_])${escapeRegExp(value)}(?![".\\p{L}\\p{N}_])`, "gu");

const splitSqlStrings = (sql: string) => {
  const parts: { value: string; quoted: boolean }[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") {
      current += char;
      if (quoted && sql[i + 1] === "'") {
        current += sql[i + 1];
        i++;
        continue;
      }
      parts.push({ value: current, quoted });
      current = "";
      quoted = !quoted;
      continue;
    }
    current += char;
  }

  if (current) parts.push({ value: current, quoted });
  return parts;
};

const splitSqlStatements = (sql: string) => {
  const statements: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") {
      current += char;
      if (quoted && sql[i + 1] === "'") {
        current += sql[i + 1];
        i++;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (char === ";" && !quoted) {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
};


const quoteKnownIdentifiers = (sql: string, metadata: DbMetadata) => {
  const parts = splitSqlStrings(sql);

  return parts.map((part) => {
    if (part.quoted) return part.value;

    let value = part.value.replace(/\[([^\]]+)\]/g, (_, ident) => quoteIdent(ident));

    for (const table of metadata.tables) {
      const schemaQualified = new RegExp(
        `(?<![".\\p{L}\\p{N}_])(?:dbo|cosmoroot)\\s*\\.\\s*${escapeRegExp(table.name)}(?![".\\p{L}\\p{N}_])`,
        "giu",
      );
      value = value.replace(schemaQualified, `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`);
    }

    for (const table of metadata.tables) {
      const tableReference = new RegExp(
        `\\b(FROM|JOIN|UPDATE|INTO)\\s+${escapeRegExp(table.name)}(?![".\\p{L}\\p{N}_])`,
        "giu",
      );
      value = value.replace(tableReference, (_, keyword) => `${keyword} ${quoteIdent(table.schema)}.${quoteIdent(table.name)}`);
    }

    for (const name of metadata.columns) {
      const pattern = identPattern(name);
      value = value.replace(pattern, quoteIdent(name));
      value = value.replace(
        new RegExp(`(?<=\\.)${escapeRegExp(name)}(?![".\\p{L}\\p{N}_])`, "gu"),
        quoteIdent(name),
      );
    }
    return value;
  }).join("");
};

const translateOutputInserted = (sql: string) =>
  sql.replace(/\)\s*OUTPUT\s+INSERTED\."?([A-Za-z0-9_İıĞğÜüŞşÖöÇç]+)"?\s*VALUES\s*\(/i, ") VALUES (")
    .replace(/\)\s*OUTPUT\s+INSERTED\."?([A-Za-z0-9_İıĞğÜüŞşÖöÇç]+)"?\s*$/i, ")")
    .replace(/OUTPUT\s+INSERTED\."?([A-Za-z0-9_İıĞğÜüŞşÖöÇç]+)"?/i, "")
    .replace(/(INSERT\s+INTO[\s\S]+?VALUES\s*\([\s\S]+?\))(?![\s\S]*RETURNING)/i, (match, insert) => {
      const outputMatch = sql.match(/OUTPUT\s+INSERTED\."?([A-Za-z0-9_İıĞğÜüŞşÖöÇç]+)"?/i);
      return outputMatch ? `${insert} RETURNING ${quoteIdent(outputMatch[1])}` : match;
    });

const translateTryCast = (sql: string) =>
  sql.replace(/TRY_CAST\(([^()]+)\s+AS\s+INT\)/gi, (_, expr) =>
    `(CASE WHEN (${expr})::text ~ '^-?[0-9]+$' THEN (${expr})::integer ELSE NULL END)`
  );

const translateTop = (sql: string) => {
  const match = sql.match(/^\s*SELECT\s+TOP\s+(\d+)\s+/i);
  if (!match) return sql;
  const limit = match[1];
  const withoutTop = sql.replace(/^\s*SELECT\s+TOP\s+\d+\s+/i, "SELECT ");
  return /\bLIMIT\b/i.test(withoutTop) ? withoutTop : `${withoutTop} LIMIT ${limit}`;
};

const translateSubqueryTop = (sql: string) =>
  sql.replace(
    /\(\s*SELECT\s+TOP\s+(\d+)\s+([\s\S]+?)\s+FROM\s+([\s\S]+?)\)/gi,
    (_, limit, selectList, fromAndWhere) => `(SELECT ${selectList} FROM ${fromAndWhere} LIMIT ${limit})`,
  );

const translateSysColumns = (sql: string) =>
  sql.replace(
    /SELECT\s+(name|1\s+AS\s+([A-Za-z_][A-Za-z0-9_]*))\s+FROM\s+sys\.columns\s+WHERE\s+object_id\s*=\s*OBJECT_ID\(\s*'([^']+)'\s*\)(?:\s+AND\s+name\s+(?:IN\s*\(([^)]+)\)|=\s*'([^']+)'))?/gi,
    (_, selectExpr, oneAlias, tableName, names, singleName) => {
      const select = /^name$/i.test(selectExpr) ? "column_name AS name" : `1 AS ${quoteIdent(oneAlias || "x")}`;
      const filter = names
        ? `AND column_name IN (${names})`
        : singleName
          ? `AND column_name = '${String(singleName).replace(/'/g, "''")}'`
          : "";

      return `
        SELECT ${select}
        FROM information_schema.columns
        WHERE table_schema IN ('dbo', 'cosmoroot')
          AND table_name = '${String(tableName).replace(/'/g, "''")}'
          ${filter}
      `;
    },
  );

const translateDateFunctions = (sql: string) =>
  sql
    .replace(/CONVERT\s*\(\s*varchar\s*\(\s*(\d+)\s*\)\s*,\s*([^,()]+(?:\([^)]*\))?)\s*,\s*(\d+)\s*\)/gi, (_, len, expr, style) => {
      if (style === "104") return `TO_CHAR(${expr}::date, 'DD.MM.YYYY')`;
      if (style === "120" && Number(len) > 10) return `TO_CHAR(${expr}::timestamp, 'YYYY-MM-DD HH24:MI:SS')`;
      if (style === "120" || style === "23") return `TO_CHAR(${expr}::date, 'YYYY-MM-DD')`;
      return `TO_CHAR(${expr}::date, 'YYYY-MM-DD')`;
    })
    .replace(/CONVERT\s*\(\s*date\s*,\s*([^)]+?)\s*\)/gi, "($1)::date")
    .replace(/YEAR\s*\(\s*COALESCE\s*\(([^,]+),\s*([^)]+)\)\s*\)/gi, "EXTRACT(YEAR FROM COALESCE($1, $2)::date)::int")
    .replace(/YEAR\s*\(\s*\(([^)]+)\)::date\s*\)/gi, "EXTRACT(YEAR FROM $1::date)::int")
    .replace(/YEAR\s*\(\s*([^)]+?)\s*\)/gi, "EXTRACT(YEAR FROM $1)::int")
    .replace(/MONTH\s*\(\s*([^)]+?)\s*\)/gi, "EXTRACT(MONTH FROM $1)::int");

const translateStringConcat = (sql: string) =>
  sql
    .replace(
      /([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)\s*\+\s*'([^']*)'\s*\+\s*([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)/g,
      "COALESCE($1::text, '') || '$2' || COALESCE($3::text, '')",
    )
    .replace(
      /([A-Za-z_][A-Za-z0-9_]*)\s*\+\s*'([^']*)'\s*\+\s*([A-Za-z_][A-Za-z0-9_]*)/g,
      "COALESCE($1::text, '') || '$2' || COALESCE($3::text, '')",
    );

const translateBitComparisons = (sql: string) =>
  sql
    .replace(/((?:[A-Za-z_][A-Za-z0-9_]*\.)?(?:Dahil|SilindiMi))\s*=\s*1\b/g, "$1 = TRUE")
    .replace(/((?:[A-Za-z_][A-Za-z0-9_]*\.)?(?:Dahil|SilindiMi))\s*=\s*0\b/g, "$1 = FALSE")
    .replace(/((?:[A-Za-z_][A-Za-z0-9_]*\.)?(?:Dahil|SilindiMi))\s*<>\s*1\b/g, "$1 <> TRUE")
    .replace(/((?:[A-Za-z_][A-Za-z0-9_]*\.)?(?:Dahil|SilindiMi))\s*<>\s*0\b/g, "$1 <> FALSE");

const extractAliases = (sql: string) => {
  const aliases = new Set<string>();
  const typeNames = new Set(["INT", "INTEGER", "BIGINT", "DATE", "DATETIME", "BIT", "TEXT", "NVARCHAR", "VARCHAR", "DECIMAL", "NUMERIC", "FLOAT"]);
  for (const match of sql.matchAll(/\bAS\s+("?)([A-Za-z_][A-Za-z0-9_]*)\1/gi)) {
    const alias = match[2];
    if (!typeNames.has(alias.toUpperCase())) aliases.add(alias);
  }
  return [...aliases];
};

const translateSql = async (rawSql: string, inputs: Record<string, InputValue>) => {
  const trimmed = rawSql.trim();
  const aliases = extractAliases(rawSql);

  // Legacy self-migrations are not needed after the MSSQL mirror has been created in Neon.
  if (/^(IF\s+NOT\s+EXISTS|IF\s+COL_LENGTH|ALTER\s+TABLE|SELECT\s+SCOPE_IDENTITY\(\))/i.test(trimmed)) {
    return { sql: "", values: [] as InputValue[], noOp: true, aliases };
  }

  let sql = rawSql
    .replace(/\bN'/g, "'")
    .replace(/\bGETDATE\(\)/gi, "NOW()")
    .replace(/\bISNULL\s*\(/gi, "COALESCE(")
    .replace(/\bNVARCHAR\s*\(\s*MAX\s*\)/gi, "text")
    .replace(/\bNVARCHAR\s*\((\d+)\)/gi, "varchar($1)")
    .replace(/\bNVARCHAR\b/gi, "text")
    .replace(/\bDATETIME\b/gi, "timestamp")
    .replace(/\bBIT\b/gi, "boolean")
    .replace(/\s+WITH\s*\(\s*NOLOCK\s*\)/gi, "")
    .replace(/\s+COLLATE\s+[A-Za-z0-9_]+/gi, "")
    .replace(/\bAS\s+'([A-Za-z_][A-Za-z0-9_]*)'/gi, (_, alias) => `AS ${quoteIdent(alias)}`)
    .replace(/FORMAT\(([^,]+),\s*'dd\.MM\.yyyy'\)/gi, "TO_CHAR($1, 'DD.MM.YYYY')")
    .replace(/'Maks'/g, '"Maks"')
    .replace(/'Diger'/g, '"Diger"')
    .replace(/'Etiket'/g, '"Etiket"')
    .replace(/'%'\s*\+\s*(@[A-Za-z0-9_]+)\s*\+\s*'%'/g, "('%' || $1 || '%')")
    .replace(/(@[A-Za-z0-9_]+)\s*\+\s*'%'/g, "($1 || '%')")
    .replace(/OFFSET\s+(@[A-Za-z0-9_]+|\d+)\s+ROWS\s+FETCH\s+NEXT\s+(@[A-Za-z0-9_]+|\d+)\s+ROWS\s+ONLY/gi, "OFFSET $1 LIMIT $2");

  sql = translateSysColumns(sql);
  sql = translateDateFunctions(sql);
  sql = translateStringConcat(sql);
  sql = translateBitComparisons(sql);
  sql = translateTryCast(sql);
  sql = translateSubqueryTop(sql);
  sql = translateTop(sql);
  sql = quoteKnownIdentifiers(sql, await getMetadata());
  sql = translateOutputInserted(sql);

  const values: InputValue[] = [];
  const paramOrder = new Map<string, number>();
  sql = sql.replace(/@([A-Za-z0-9_]+)/g, (_, name) => {
    if (!paramOrder.has(name)) {
      values.push(inputs[name] ?? null);
      paramOrder.set(name, values.length);
    }
    return `$${paramOrder.get(name)}`;
  });

  return { sql, values, noOp: false, aliases };
};

class PgCompatRequest {
  private inputs: Record<string, InputValue> = {};

  input(name: string, value: InputValue) {
    this.inputs[name] = value;
    return this;
  }

  private async executeSingle(sql: string) {
    const translated = await translateSql(sql, this.inputs);
    if (translated.noOp) return { recordset: [], rowsAffected: [0] };

    if (process.env.DB_DEBUG_SQL === "1") {
      console.log("PG SQL:", translated.sql, translated.values);
    }

    const result = await getPgPool().query(translated.sql, translated.values);
    const recordset = result.rows.map((row) => {
      const next: Record<string, unknown> = { ...row };
      for (const alias of translated.aliases) {
        const lower = alias.toLowerCase();
        if (!(alias in next) && lower in row) next[alias] = row[lower];
      }
      for (const key of Object.keys(row)) {
        const upper = key.toUpperCase();
        if (!(upper in next)) next[upper] = row[key];
      }
      return next;
    });

    return {
      recordset,
      rowsAffected: [result.rowCount ?? 0],
    };
  }

  async query(sql: string) {
    const statements = splitSqlStatements(sql);
    if (statements.length > 1) {
      const results = [];
      for (const statement of statements) {
        results.push(await this.executeSingle(statement));
      }
      return {
        recordset: results[0]?.recordset ?? [],
        recordsets: results.map((result) => result.recordset),
        rowsAffected: results.flatMap((result) => result.rowsAffected),
      };
    }

    return this.executeSingle(sql);
  }

  async batch(sql: string) {
    return this.query(sql);
  }
}

class PgCompatPool {
  request() {
    return new PgCompatRequest();
  }

  transaction() {
    return {
      begin: async () => undefined,
      commit: async () => undefined,
      rollback: async () => undefined,
      request: () => new PgCompatRequest(),
    };
  }
}

const poolPromise: PromiseLike<mssql.ConnectionPool> = {
  then: (onfulfilled, onrejected) => {
    if (usePostgres) {
      return Promise.resolve(new PgCompatPool() as any).then(onfulfilled, onrejected);
    }
    // MSSQL dalı da resilient (lazy retry) — varsayılan DB_NAME üzerinden.
    return Promise.resolve(
      new ResilientPool(process.env.DB_NAME || "") as unknown as mssql.ConnectionPool,
    ).then(onfulfilled, onrejected);
  },
};

export default poolPromise;

// ── Menü bazlı havuzlar (DB yönlendirme haritası) ───────────────────────────
// Step 1: ADDITIVE — varsayılan poolPromise davranışı değişmez. Route grupları
// Step 2'de tek tek bu havuzlara taşınacak. Hepsi `await cosmoPool` gibi kullanılır.

// MySQL'e geçiş: MYSQL_HOST tanımlıysa cosmo/root havuzları MySQL'e gider
// (cPanel'de massgrup_cosmo MySQL'e taşındı). Tanımsızsa eski MSSQL davranışı
// korunur — lokal geliştirme veya rollback için.
// LAZY: instrumentation .env'i yükledikten sonra her erişimde kontrol edilir.

/** Müşteriler + Laboratuvar → MySQL (massgrup_cosmo göçü) | fallback MSSQL */
export const cosmoPool: PromiseLike<mssql.ConnectionPool> = {
  then: (onfulfilled, onrejected) =>
    Promise.resolve(
      (hasMysqlConfig()
        ? new MysqlCompatPool()
        : new ResilientPool(MSSQL_COSMO_DB)) as unknown as mssql.ConnectionPool,
    ).then(onfulfilled, onrejected),
};

/** RootKullanici lookup (personel adı) → Postgres mirror (login ile aynı kaynak).
 *  RootKullanici MySQL'e taşınmadı; Neon Postgres mirror'da yaşıyor. MySQL moduna
 *  geçtiğimizde bile bu havuz Postgres'e gider — fallback MSSQL massgrup_root. */
export const rootPool: PromiseLike<mssql.ConnectionPool> = {
  then: (onfulfilled, onrejected) =>
    Promise.resolve(
      (usePostgres
        ? new PgCompatPool()
        : new ResilientPool(MSSQL_ROOT_DB)) as unknown as mssql.ConnectionPool,
    ).then(onfulfilled, onrejected),
};

/** Formül Kontrol + ÜGD + Root Kozmetik → Neon Postgres (compat).
 *  Global bayraktan BAĞIMSIZ — her zaman Postgres döner. */
export const ugdPool: PromiseLike<mssql.ConnectionPool> = {
  then: (onfulfilled, onrejected) =>
    Promise.resolve(new PgCompatPool() as unknown as mssql.ConnectionPool).then(onfulfilled, onrejected),
};
