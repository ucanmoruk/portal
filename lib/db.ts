import mssql from "mssql";
import { createPool } from "@vercel/postgres";

type InputValue = string | number | boolean | Date | null | undefined | Buffer;

const usePostgres = Boolean(process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL);

const mssqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  server: process.env.DB_SERVER || "",
  port: 1433,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

let mssqlConnectionPromise: Promise<mssql.ConnectionPool> | undefined;

const getMssqlPool = () => {
  if (!process.env.DB_SERVER || !process.env.DB_NAME || !process.env.DB_USER) {
    throw new Error("MSSQL environment variables are missing. Set DB_SERVER, DB_NAME, DB_USER and DB_PASSWORD.");
  }

  mssqlConnectionPromise ??= new mssql.ConnectionPool(mssqlConfig)
    .connect()
    .then((pool) => {
      console.log("MSSQL veritabanina basariyla baglanildi.");
      return pool;
    })
    .catch((err) => {
      console.log("Veritabani baglantisi basarisiz! Hata: ", err);
      mssqlConnectionPromise = undefined;
      throw err;
    });

  return mssqlConnectionPromise;
};

interface DbMetadata {
  tables: { name: string; schema: string }[];
  columns: string[];
}

let pgPool: ReturnType<typeof createPool> | undefined;
let metadataPromise: Promise<DbMetadata> | undefined;

const getPgPool = () => {
  const connectionString = process.env.UGD_POSTGRESS_URL || process.env.UGD_POSTGRES_URL;
  if (!connectionString) {
    throw new Error("UGD PostgreSQL environment variable is missing. Set UGD_POSTGRESS_URL or UGD_POSTGRES_URL.");
  }

  pgPool ??= createPool({ connectionString });
  return pgPool;
};

const getMetadata = async (): Promise<DbMetadata> => {
  metadataPromise ??= getPgPool()
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
    /SELECT\s+name\s+FROM\s+sys\.columns\s+WHERE\s+object_id\s*=\s*OBJECT_ID\(\s*'([^']+)'\s*\)\s+AND\s+name\s+IN\s*\(([^)]+)\)/gi,
    (_, tableName, names) => `
      SELECT column_name AS name
      FROM information_schema.columns
      WHERE table_schema IN ('dbo', 'cosmoroot')
        AND table_name = '${String(tableName).replace(/'/g, "''")}'
        AND column_name IN (${names})
    `,
  );

const translateDateFunctions = (sql: string) =>
  sql
    .replace(/CONVERT\s*\(\s*varchar\s*\(\s*10\s*\)\s*,\s*([^,()]+(?:\([^)]*\))?)\s*,\s*(?:23|120)\s*\)/gi, "TO_CHAR($1::date, 'YYYY-MM-DD')")
    .replace(/CONVERT\s*\(\s*date\s*,\s*([^)]+?)\s*\)/gi, "($1)::date")
    .replace(/YEAR\s*\(\s*\(([^)]+)\)::date\s*\)/gi, "EXTRACT(YEAR FROM $1::date)::int")
    .replace(/YEAR\s*\(\s*([^)]+?)\s*\)/gi, "EXTRACT(YEAR FROM $1)::int");

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
  if (/^(IF\s+NOT\s+EXISTS|IF\s+COL_LENGTH|ALTER\s+TABLE|CREATE\s+TABLE|SELECT\s+SCOPE_IDENTITY\(\))/i.test(trimmed)) {
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
    .replace(/FORMAT\(([^,]+),\s*'dd\.MM\.yyyy'\)/gi, "TO_CHAR($1, 'DD.MM.YYYY')")
    .replace(/'Maks'/g, '"Maks"')
    .replace(/'Diger'/g, '"Diger"')
    .replace(/'Etiket'/g, '"Etiket"')
    .replace(/'%'\s*\+\s*(@[A-Za-z0-9_]+)\s*\+\s*'%'/g, "('%' || $1 || '%')")
    .replace(/OFFSET\s+(@[A-Za-z0-9_]+|\d+)\s+ROWS\s+FETCH\s+NEXT\s+(@[A-Za-z0-9_]+|\d+)\s+ROWS\s+ONLY/gi, "OFFSET $1 LIMIT $2");

  sql = translateSysColumns(sql);
  sql = translateDateFunctions(sql);
  sql = translateStringConcat(sql);
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
    return getMssqlPool().then(onfulfilled, onrejected);
  },
};

export default poolPromise;
