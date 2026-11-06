// MSSQL (mssql paketi) arayüzünü MySQL/MariaDB üzerinde taklit eden uyumluluk
// katmanı. cosmoPool / rootPool'u kullanan ~68 route HİÇ değişmeden MySQL'e
// bağlanabilsin diye `.request().input(name,val).query(sql)` API'sini sunar ve
// `{ recordset, recordsets, rowsAffected }` döndürür.
//
// PgCompatPool (lib/db.ts) Postgres için ne yapıyorsa, bu da MySQL için yapar.
// mysql2'nin namedPlaceholders özelliğiyle @param → :param eşlemesi kullanır.

import mysql from "mysql2/promise";

type InputValue = string | number | boolean | Date | null | undefined | Buffer;

let pool: mysql.Pool | undefined;

export const hasMysqlConfig = () =>
  Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);

const getPool = (): mysql.Pool => {
  if (!pool) {
    if (!hasMysqlConfig()) {
      throw new Error(
        "MySQL environment variables eksik. MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE tanımlanmalı.",
      );
    }
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_POOL_MAX || 10),
      maxIdle: 10,
      idleTimeout: 30000,
      queueLimit: 0,
      // Mevcut tablolar utf8mb4_turkish_ci. Connection collation'ı buna sabitle ki
      // string ifadeleri (UPPER/REPLACE/temp tablo kolonları) kolonlarla aynı
      // collation'da olsun → "Illegal mix of collations" hatası önlenir.
      charset: "utf8mb4_turkish_ci",
      namedPlaceholders: true,
      // DATETIME/DATE kolonlarını string olarak döndür (MSSQL davranışına yakın,
      // timezone kaymasını önler) — route'lar Date beklemiyorsa stringi kullanır.
      dateStrings: true,
      timezone: "Z",
    });
  }
  return pool;
};

// ── MSSQL → MySQL SQL çevirisi ───────────────────────────────────────────────

// String literal'leri koruyarak (tek tırnak içine dokunmadan) çeviri yapmak için
// önce string parçalarını maskele, çeviriyi uygula, sonra geri koy.
function splitOutStrings(sql: string): { template: string; strings: string[] } {
  const strings: string[] = [];
  let template = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {
      let str = "'";
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          str += "''";
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          str += "'";
          i++;
          break;
        }
        str += sql[i];
        i++;
      }
      strings.push(str);
      template += `\u0000${strings.length - 1}\u0000`;
      continue;
    }
    template += c;
    i++;
  }
  return { template, strings };
}

function restoreStrings(template: string, strings: string[]): string {
  return template.replace(/\u0000(\d+)\u0000/g, (_, n) => strings[Number(n)]);
}

// SQL yorumlarını sil — STRING-AWARE. Yorum içindeki apostrof (örn "view'da")
// aşağıdaki string-aware walker'ları yanıltıp bracket/çeviriyi bozuyordu.
// '--' satır yorumu ve '/* */' blok yorumu, string literal İÇİNDE değilse silinir.
function stripSqlComments(sql: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) {
      out += c;
      if (c === "'") {
        if (sql[i + 1] === "'") { out += sql[i + 1]; i++; continue; }
        inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; out += c; continue; }
    // -- satır yorumu → satır sonuna kadar at
    if (c === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      if (nl === -1) break;
      out += "\n";
      i = nl;
      continue;
    }
    // /* */ blok yorumu
    if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) break;
      out += " ";
      i = end + 1;
      continue;
    }
    out += c;
  }
  return out;
}

// [identifier] → `identifier` — STRING-AWARE (tek tırnak içindeki [ ] korunur).
// Regex ile yapmak tehlikeli: string değer içindeki bir '[' sonraki ']'ye kadar
// her şeyi yutup identifier'ları bozar.
function translateBrackets(sql: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) {
      out += c;
      if (c === "'") {
        if (sql[i + 1] === "'") { out += sql[i + 1]; i++; continue; }
        inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; out += c; continue; }
    if (c === "[") {
      const close = sql.indexOf("]", i + 1);
      if (close !== -1) {
        const ident = sql.slice(i + 1, close);
        if (!/['\n]/.test(ident)) { out += "`" + ident + "`"; i = close; continue; }
      }
    }
    out += c;
  }
  return out;
}

// N'unicode' → 'unicode' (MariaDB N'' destekler ama concat tespiti için normalize)
function translateNPrefix(sql: string): string {
  return sql.replace(/\bN'/g, "'");
}

// MSSQL temp tablo (#X) → MySQL TEMPORARY TABLE. Temp tablolar connection-scoped
// olduğu için bu SQL'ler TEK connection'da çalıştırılmalı (bkz. query()).
function translateTempTables(sql: string): string {
  // IF OBJECT_ID('tempdb..#X') IS NOT NULL DROP TABLE #X → DROP TEMPORARY TABLE IF EXISTS `X`
  sql = sql.replace(
    /IF\s+OBJECT_ID\s*\(\s*'tempdb\.\.#(\w+)'\s*\)\s+IS\s+NOT\s+NULL\s+DROP\s+TABLE\s+#\1/gi,
    "DROP TEMPORARY TABLE IF EXISTS `$1`",
  );
  // SELECT <cols> INTO #X FROM ... → CREATE TEMPORARY TABLE `X` AS SELECT <cols> FROM ...
  sql = sql.replace(
    /SELECT\s+([\s\S]*?)\s+INTO\s+#(\w+)\s+FROM\b/gi,
    "CREATE TEMPORARY TABLE `$2` AS SELECT $1 FROM",
  );
  // Kalan #X referansları → `X`
  sql = sql.replace(/#(\w+)/g, "`$1`");
  return sql;
}

// Şema prefix'ini at: cosmoroot.X / dbo.X / `cosmoroot`.`X` → X
function translateSchema(sql: string): string {
  sql = sql.replace(/`(?:dbo|cosmoroot)`\s*\.\s*`([^`]+)`/gi, "`$1`");
  sql = sql.replace(/\b(?:dbo|cosmoroot)\s*\.\s*(`?[A-Za-z_][\w]*`?)/gi, "$1");
  return sql;
}

// MSSQL CAST tipleri → MySQL CAST tipleri. MySQL CAST yalnız belirli tipleri
// kabul eder (CHAR, SIGNED, UNSIGNED, DATE, DATETIME, DECIMAL...).
// YAKLAŞIM: tüm CAST(...) gövdesini eşleştirmek yerine SADECE "AS <tip>)" kısmını
// değiştir — böylece içinde CASE/EXISTS/iç paren olan CAST'ler de çevrilir.
// "AS <tip>)" deseni CAST/CONVERT'e özgü (subquery alias'ı ") AS ad" tersidir).
function translateCast(sql: string): string {
  // TRY_CAST → CAST (MySQL'de TRY_CAST yok; MariaDB CAST hatada NULL/0 döner)
  sql = sql.replace(/\bTRY_CAST\s*\(/gi, "CAST(");
  return sql
    .replace(/\bAS\s+N?VARCHAR(?:\s*\(\s*(?:\w+|max)\s*\))?\s*\)/gi, "AS CHAR)")
    .replace(/\bAS\s+N?CHAR(?:\s*\(\s*\w+\s*\))?\s*\)/gi, "AS CHAR)")
    .replace(/\bAS\s+(?:SMALL)?DATETIME(?:2)?(?:\s*\(\s*\d+\s*\))?\s*\)/gi, "AS DATETIME)")
    .replace(/\bAS\s+(?:BIGINT|INT|SMALLINT|TINYINT|NUMERIC)\s*\)/gi, "AS SIGNED)")
    .replace(/\bAS\s+BIT\s*\)/gi, "AS UNSIGNED)")
    .replace(/\bAS\s+FLOAT\s*\)/gi, "AS DECIMAL(38,10))")
    .replace(/\bAS\s+MONEY\s*\)/gi, "AS DECIMAL(19,4))");
}

// MSSQL string concat (+) → CONCAT(). KONSERVATIF: yalnızca bir tarafı string
// literal olan ifadeleri çevirir (saf sayısal + bozulmaz). term = string/CAST/
// COALESCE/kolon. İç içe paren tek seviye varsayılır (bu route'larda yeterli).
function translateStringConcat(sql: string): string {
  const TERM = "(?:'[^']*'|@\\w+|CONCAT\\s*\\([^()]*\\)|CAST\\s*\\([^()]*\\)|COALESCE\\s*\\([^()]*\\)|[A-Za-z_][\\w.]*)";
  const reStrLeft = new RegExp(`('[^']*')\\s*\\+\\s*(${TERM})`, "g");
  const reStrRight = new RegExp(`(${TERM})\\s*\\+\\s*('[^']*')`, "g");
  let prev: string;
  let n = 0;
  do {
    prev = sql;
    sql = sql.replace(reStrLeft, "CONCAT($1, $2)");
    sql = sql.replace(reStrRight, "CONCAT($1, $2)");
    n++;
  } while (sql !== prev && n < 6);
  return sql;
}

// Şema prefix'ini at: cosmoroot.X / dbo.X / `cosmoroot`.`X` → X
// (MySQL'de şema = database; tablolar tek DB'de, prefix'siz erişilir)
// ISNULL(a,b) → IFNULL(a,b)
function translateIsnull(sql: string): string {
  return sql.replace(/\bISNULL\s*\(/gi, "IFNULL(");
}

// GETDATE() → NOW()
function translateGetdate(sql: string): string {
  return sql
    .replace(/\bGETDATE\s*\(\s*\)/gi, "NOW()")
    .replace(/\bSYSDATETIME\s*\(\s*\)/gi, "NOW(6)");
}

// LEN( → CHAR_LENGTH(
function translateLen(sql: string): string {
  return sql.replace(/\bLEN\s*\(/gi, "CHAR_LENGTH(");
}

// STRING_AGG(expr, sep) [WITHIN GROUP (ORDER BY ...)] → GROUP_CONCAT(expr [ORDER BY ...] SEPARATOR sep)
function translateStringAgg(sql: string): string {
  // WITHIN GROUP'lu varyant
  sql = sql.replace(
    /\bSTRING_AGG\s*\(\s*([^,()]+(?:\([^()]*\))?)\s*,\s*('[^']*'|[^)]+?)\s*\)\s*WITHIN\s+GROUP\s*\(\s*ORDER\s+BY\s+([^()]+?)\s*\)/gi,
    "GROUP_CONCAT($1 ORDER BY $3 SEPARATOR $2)",
  );
  // Sade varyant
  sql = sql.replace(
    /\bSTRING_AGG\s*\(\s*([^,()]+(?:\([^()]*\))?)\s*,\s*('[^']*'|[^)]+?)\s*\)/gi,
    "GROUP_CONCAT($1 SEPARATOR $2)",
  );
  return sql;
}

// Subquery TOP: (SELECT TOP n ...) → (SELECT ... LIMIT n)
// PAREN-DENGELI tarayıcı: iç içe derived table'lı subquery'lerde (örn
// "LEFT JOIN (SELECT...) rt") doğru kapanış paren'ini bulup LIMIT'i oraya koyar.
function translateSubqueryTop(sql: string): string {
  const re = /\(\s*SELECT\s+TOP\s*\(?\s*(\d+)\s*\)?\s+/gi;
  let m: RegExpExecArray | null;
  const edits: { open: number; close: number; n: string; topStart: number; topEnd: number }[] = [];
  while ((m = re.exec(sql)) !== null) {
    const openParen = m.index;          // '(' konumu
    const n = m[1];
    const topStart = m.index + m[0].indexOf("TOP");
    const topEnd = m.index + m[0].length; // TOP n sonrası
    // Dengeli kapanışı bul
    let depth = 0, close = -1;
    for (let i = openParen; i < sql.length; i++) {
      if (sql[i] === "(") depth++;
      else if (sql[i] === ")") { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close === -1) continue;
    // Bu subquery'de zaten LIMIT varsa atla
    if (/\bLIMIT\b/i.test(sql.slice(topEnd, close))) continue;
    edits.push({ open: openParen, close, n, topStart, topEnd });
  }
  if (!edits.length) return sql;
  // Sondan başa uygula (indeksler kaymasın)
  edits.sort((a, b) => b.open - a.open);
  for (const e of edits) {
    sql = sql.slice(0, e.close) + ` LIMIT ${e.n}` + sql.slice(e.close);
    sql = sql.slice(0, e.topStart) + sql.slice(e.topEnd); // "TOP n " kaldır
  }
  return sql;
}

// SELECT TOP n ... → SELECT ... LIMIT n   (statement başı; LIMIT zaten varsa dokunma)
function translateTop(sql: string): string {
  const m = sql.match(/^\s*SELECT\s+TOP\s*\(?\s*(\d+)\s*\)?\s+/i);
  if (!m) return sql;
  const limit = m[1];
  const without = sql.replace(/^\s*SELECT\s+TOP\s*\(?\s*\d+\s*\)?\s+/i, "SELECT ");
  return /\bLIMIT\b/i.test(without) ? without : `${without.replace(/\s*$/, "")} LIMIT ${limit}`;
}

// OFFSET @x ROWS FETCH NEXT @y ROWS ONLY → LIMIT @y OFFSET @x
function translateOffsetFetch(sql: string): string {
  return sql.replace(
    /OFFSET\s+(@\w+|\d+)\s+ROWS\s+FETCH\s+NEXT\s+(@\w+|\d+)\s+ROWS\s+ONLY/gi,
    "LIMIT $2 OFFSET $1",
  );
}

// CONVERT(varchar(n), expr, style) / CONVERT(date, expr) → MySQL DATE_FORMAT / CAST
function translateConvert(sql: string): string {
  return sql
    .replace(
      /CONVERT\s*\(\s*varchar\s*\(\s*\d+\s*\)\s*,\s*([^,()]+(?:\([^)]*\))?)\s*,\s*104\s*\)/gi,
      "DATE_FORMAT($1, '%d.%m.%Y')",
    )
    .replace(
      /CONVERT\s*\(\s*varchar\s*\(\s*\d+\s*\)\s*,\s*([^,()]+(?:\([^)]*\))?)\s*,\s*23\s*\)/gi,
      "DATE_FORMAT($1, '%Y-%m-%d')",
    )
    // style 120: varchar(10) → MSSQL ilk 10 karaktere keser = sadece tarih.
    // varchar(>=19 veya max) → tam datetime.
    .replace(
      /CONVERT\s*\(\s*varchar\s*\(\s*10\s*\)\s*,\s*([^,()]+(?:\([^)]*\))?)\s*,\s*120\s*\)/gi,
      "DATE_FORMAT($1, '%Y-%m-%d')",
    )
    .replace(
      /CONVERT\s*\(\s*varchar\s*\(\s*\d+\s*\)\s*,\s*([^,()]+(?:\([^)]*\))?)\s*,\s*120\s*\)/gi,
      "DATE_FORMAT($1, '%Y-%m-%d %H:%i:%s')",
    )
    .replace(/CONVERT\s*\(\s*date\s*,\s*([^,()]+?)\s*\)/gi, "CAST($1 AS DATE)")
    .replace(/CONVERT\s*\(\s*datetime\s*,\s*([^,()]+?)\s*\)/gi, "CAST($1 AS DATETIME)");
}

// FORMAT(expr,'dd.MM.yyyy') → DATE_FORMAT(expr,'%d.%m.%Y')
function translateFormat(sql: string): string {
  return sql
    .replace(/FORMAT\s*\(\s*([^,]+?)\s*,\s*'dd\.MM\.yyyy HH:mm:ss'\s*\)/gi, "DATE_FORMAT($1, '%d.%m.%Y %H:%i:%s')")
    .replace(/FORMAT\s*\(\s*([^,]+?)\s*,\s*'dd\.MM\.yyyy'\s*\)/gi, "DATE_FORMAT($1, '%d.%m.%Y')")
    .replace(/FORMAT\s*\(\s*([^,]+?)\s*,\s*'yyyy-MM-dd'\s*\)/gi, "DATE_FORMAT($1, '%Y-%m-%d')")
    .replace(/FORMAT\s*\(\s*([^,]+?)\s*,\s*'HH:mm'\s*\)/gi, "DATE_FORMAT($1, '%H:%i')");
}

// NOLOCK hint kaldır
function translateNolock(sql: string): string {
  return sql.replace(/\s+WITH\s*\(\s*NOLOCK\s*\)/gi, "").replace(/\s*\(\s*NOLOCK\s*\)/gi, "");
}

// MSSQL sys.columns + OBJECT_ID → MySQL INFORMATION_SCHEMA.COLUMNS.
// "SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('X') [AND name IN (...)|= '...']"
// → "SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS
//     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'X' [AND COLUMN_NAME ...]"
function translateSysColumns(sql: string): string {
  return sql.replace(
    /SELECT\s+(name|1\s+AS\s+[A-Za-z_]\w*)\s+FROM\s+sys\.columns\s+WHERE\s+object_id\s*=\s*OBJECT_ID\(\s*'([^']+)'\s*\)(?:\s+AND\s+name\s+(?:IN\s*\(([^)]+)\)|=\s*'([^']+)'))?/gi,
    (_full, selectExpr, tableName, inList, singleName) => {
      const select = /^name$/i.test(selectExpr) ? "COLUMN_NAME AS name" : selectExpr;
      const tbl = String(tableName).replace(/'/g, "''");
      const filter = inList
        ? `AND COLUMN_NAME IN (${inList})`
        : singleName
        ? `AND COLUMN_NAME = '${String(singleName).replace(/'/g, "''")}'`
        : "";
      return `SELECT ${select} FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tbl}' ${filter}`;
    },
  );
}

// INFORMATION_SCHEMA sorgularında MSSQL şema adları (dbo/cosmoroot) → DATABASE().
// MySQL'de TABLE_SCHEMA = aktif veritabanı adı. "TABLE_SCHEMA IN ('dbo','cosmoroot')"
// veya "= 'dbo'" geçen tablo/kolon varlık kontrolleri aksi halde HİÇ satır
// bulamıyor (örn hasLabKabul=false → sayımlar yanlış).
function translateInfoSchema(sql: string): string {
  sql = sql.replace(
    /\bTABLE_SCHEMA\s+IN\s*\(\s*(?:N?'(?:dbo|cosmoroot)'\s*,?\s*)+\)/gi,
    "TABLE_SCHEMA = DATABASE()",
  );
  sql = sql.replace(/\bTABLE_SCHEMA\s*=\s*N?'(?:dbo|cosmoroot)'/gi, "TABLE_SCHEMA = DATABASE()");
  return sql;
}

// MSSQL collation'larını sil: COLLATE Turkish_CI_AS / SQL_Latin1_... → (kalkar).
// MySQL bu collation adlarını tanımaz; kolon/bağlantı default'una düşülür.
function translateCollate(sql: string): string {
  const { template, strings } = splitOutStrings(sql);
  return restoreStrings(template.replace(/\s+COLLATE\s+([A-Za-z0-9_]+)/gi, (match, name: string) =>
    /^(?:utf8mb4|utf8mb3|utf8|latin1|ascii|binary)(?:_|$)/i.test(name) ? match : "",
  ), strings);
}

// YEAR(x)/MONTH(x)/DAY(x) MySQL'de aynı isimle var — dokunmaya gerek yok.

// MSSQL string concat: a + b → CONCAT(a, b) — riskli olduğu için sadece
// belirgin `'lit' + col` / `col + 'lit'` desenlerinde uygula. Çoğu route zaten
// CONCAT veya tek string kullanıyor; agresif çeviri yanlış sonuç verebilir.

// @param → :param (mysql2 namedPlaceholders)
function translateParams(sql: string): string {
  return sql.replace(/@(\w+)/g, ":$1");
}

// Çeviri sırası önemli: format/convert string literal'leri GÖRMELİ (maskeleme yok).
// Bracket dönüşümü string-aware olduğu için ham SQL üzerinde güvenle çalışır.
function translateSelect(sql: string): string {
  sql = stripSqlComments(sql);    // yorumları sil (apostrof tuzağı)
  sql = translateTempTables(sql); // #temp → TEMPORARY TABLE, SELECT..INTO → CREATE..AS
  sql = translateBrackets(sql);   // string-aware
  sql = translateSchema(sql);
  sql = translateNolock(sql);
  sql = translateCollate(sql);
  sql = translateSysColumns(sql);
  sql = translateInfoSchema(sql);
  sql = translateConvert(sql);     // CONVERT(...,104) → DATE_FORMAT (literal görür)
  sql = translateFormat(sql);      // FORMAT(x,'dd.MM.yyyy') → DATE_FORMAT (literal görür)
  sql = translateCast(sql);        // CAST(x AS NVARCHAR) → CHAR
  sql = translateNPrefix(sql);     // N'x' → 'x'
  sql = translateStringConcat(sql);// 'a' + b → CONCAT('a', b)
  sql = translateIsnull(sql);
  sql = translateGetdate(sql);
  sql = translateLen(sql);
  sql = translateStringAgg(sql);
  sql = translateOffsetFetch(sql);
  sql = translateSubqueryTop(sql);
  sql = translateTop(sql);
  sql = translateParams(sql);
  return sql;
}

// INSERT ... OUTPUT INSERTED.col VALUES (...) → INSERT ... VALUES (...)
// OUTPUT edilen kolonu döndürmek için insertId kullanılır.
function extractOutputColumn(sql: string): { sql: string; outputCol: string | null } {
  const m = sql.match(/\bOUTPUT\s+INSERTED\.\[?(\w+)\]?/i);
  if (!m) return { sql, outputCol: null };
  const cleaned = sql.replace(/\s*OUTPUT\s+INSERTED\.\[?\w+\]?/i, "");
  return { sql: cleaned, outputCol: m[1] };
}

// ── Compat sınıfları ─────────────────────────────────────────────────────────

interface QueryResult {
  recordset: Record<string, unknown>[];
  recordsets: Record<string, unknown>[][];
  rowsAffected: number[];
  output?: Record<string, unknown>;
}

export type MysqlCompatOptions = { prepareSql?: (sql: string) => string; normalizeRows?: (rows: Record<string, unknown>[]) => Record<string, unknown>[] };

class MysqlCompatRequest {
  private inputs: Record<string, InputValue> = {};

  constructor(private connection?: mysql.PoolConnection, private options: MysqlCompatOptions = {}) {}

  input(name: string, valueOrType: unknown, typedValue?: InputValue): this {
    const value = (arguments.length >= 3 ? typedValue : valueOrType) as InputValue;
    // undefined → null (mysql2 undefined'ı reddeder)
    this.inputs[name] = value === undefined ? null : value;
    return this;
  }

  // exec: pool veya tek connection (temp tablo işlemleri tek connection ister)
  private async execStatement(
    rawSql: string,
    exec: Pick<mysql.Pool, "query"> = this.connection || getPool(),
  ): Promise<QueryResult> {
    const trimmed = rawSql.trim();
    if (!trimmed) return { recordset: [], recordsets: [[]], rowsAffected: [0] };

    // T-SQL blok ayraçları (BEGIN/END) — self-migration IF...BEGIN...END blokları
    // splitStatements ile içteki ;'lerden bölününce bare "END"/"BEGIN" kalır.
    // Bunlar MySQL'de geçersiz; NO-OP. (Self-migration CREATE/ALTER zaten no-op.)
    if (/^(BEGIN|END|GO)\s*;?\s*$/i.test(trimmed) || /^BEGIN\s+/i.test(trimmed)) {
      return { recordset: [], recordsets: [[]], rowsAffected: [0] };
    }

    // Native CHECK replacements must run: skipping them leaves old status rules active.
    const replacesCheck = /^ALTER\s+TABLE\s+`?\w+`?\s+DROP\s+CONSTRAINT\s+`?\w+`?\s*,\s*ADD\s+CONSTRAINT\s+`?\w+`?\s+CHECK\s*\(/i.test(trimmed);
    // Self-migration DDL'leri NO-OP — şema zaten MySQL'e taşındı. (# temp HARİÇ)
    if (!/#/.test(trimmed) && !/\btempdb\b/i.test(trimmed) && (
      /^IF\s+NOT\s+EXISTS\s*\(\s*SELECT/i.test(trimmed) ||
      /^IF\s+COL_LENGTH/i.test(trimmed) ||
      /^IF\s+OBJECT_ID/i.test(trimmed) ||
      /^IF\s+EXISTS\s*\(\s*SELECT/i.test(trimmed) ||
      (!replacesCheck && /^ALTER\s+TABLE\b(?![\s\S]*\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b)(?![\s\S]*\bCONVERT\s+TO\s+CHARACTER\s+SET\b)/i.test(trimmed)) ||
      /^CREATE\s+TABLE\b(?!\s+IF\s+NOT\s+EXISTS)/i.test(trimmed) ||
      /^CREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+|CLUSTERED\s+)?INDEX\b/i.test(trimmed)
    )) {
      return { recordset: [], recordsets: [[]], rowsAffected: [0] };
    }

    // SCOPE_IDENTITY() → LAST_INSERT_ID
    if (/^SELECT\s+SCOPE_IDENTITY\s*\(\s*\)/i.test(trimmed)) {
      const [rows] = await exec.query("SELECT LAST_INSERT_ID() AS id");
      const id = (rows as any[])[0]?.id ?? null;
      const alias = trimmed.match(/\bAS\s+\[?(\w+)\]?/i)?.[1] || "id";
      const row = { "": id, id, [alias]: id };
      return { recordset: [row], recordsets: [[row]], rowsAffected: [0] };
    }

    // INSERT + OUTPUT INSERTED.col → insertId döndür
    if (/^INSERT\b/i.test(trimmed) && /OUTPUT\s+INSERTED/i.test(trimmed)) {
      const { sql: noOutput, outputCol } = extractOutputColumn(trimmed);
      const translated = translateInsertUpdate(noOutput);
      const [result] = await this.run<mysql.ResultSetHeader>(exec, translated, trimmed);
      const insertId = result.insertId;
      const row = outputCol ? { [outputCol]: insertId } : { id: insertId };
      return { recordset: [row], recordsets: [[row]], rowsAffected: [result.affectedRows] };
    }

    // SELECT/WITH (CTE)/SHOW → recordset döner. Temp tablo CREATE/DROP ve diğer
    // DDL/DML INSERT branch'ine düşer (recordset boş).
    const isSelect = /^\s*(SELECT|WITH|SHOW)\b/i.test(trimmed);
    if (isSelect) {
      const translated = translateSelect(trimmed);
      const [rows] = await this.run<mysql.RowDataPacket[]>(exec, translated, trimmed);
      // SELECT..INTO #X → CREATE TEMPORARY TABLE oldu (recordset yok). Temp tabloya
      // join kolonlarında index ekle (CTE'deki LEFT JOIN'ler index'siz full-scan
      // yapıyordu → numune-takip/rapor-takip çok yavaştı).
      if (!Array.isArray(rows)) {
        const tm = trimmed.match(/\bINTO\s+#(\w+)\b/i);
        if (tm) await this.indexTempTable(exec, tm[1]);
        return { recordset: [], recordsets: [[]], rowsAffected: [0] };
      }
      const recordset = this.options.normalizeRows ? this.options.normalizeRows(rows as Record<string, unknown>[]) : rows as Record<string, unknown>[];
      return { recordset, recordsets: [recordset], rowsAffected: [recordset.length] };
    }

    const translated = translateInsertUpdate(trimmed);
    const [result] = await this.run<mysql.ResultSetHeader>(exec, translated, trimmed);
    return { recordset: [], recordsets: [[]], rowsAffected: [(result as any)?.affectedRows ?? 0] };
  }

  // Temp tabloya join-key index'i ekle. CREATE TEMPORARY TABLE AS SELECT index
  // üretmez; CTE join'leri (NkrID + NormFmt/RaporFormati) bu yüzden çok yavaş.
  private async indexTempTable(exec: Pick<mysql.Pool, "query">, table: string): Promise<void> {
    try {
      const [cols] = await exec.query<mysql.RowDataPacket[]>(`SHOW COLUMNS FROM \`${table}\``);
      const names = new Set((cols as any[]).map((c) => String(c.Field)));
      const idx: string[][] = [];
      const has = (n: string) => names.has(n);
      if (has("NkrID") && has("NormFmt")) idx.push(["NkrID", "NormFmt"]);
      if (has("NkrID") && has("RaporFormati")) idx.push(["NkrID", "RaporFormati"]);
      if (!idx.length && has("NkrID")) idx.push(["NkrID"]);
      if (has("RaporID")) idx.push(["RaporID"]);
      for (let i = 0; i < idx.length; i++) {
        const cols2 = idx[i].map((c) => `\`${c}\``).join(",");
        await exec.query(`ALTER TABLE \`${table}\` ADD INDEX \`ix_t${i}\` (${cols2})`);
      }
    } catch {
      // index eklenemezse sessiz geç — sorgu yine çalışır (sadece yavaş)
    }
  }

  // Tek noktadan çalıştır — hata anında ÇEVRİLMİŞ SQL'i stderr'e bas (teşhis).
  private async run<T>(exec: Pick<mysql.Pool, "query">, translated: string, original: string): Promise<[T, any]> {
    try {
      return (await exec.query<any>({ sql: this.options.prepareSql?.(translated) ?? translated }, this.inputs)) as unknown as [T, any];
    } catch (err) {
      console.error(
        "[MysqlCompat] SORGU HATASI:\n  err:", (err as Error)?.message,
        "\n  çeviri:", translated.replace(/\s+/g, " ").slice(0, 600),
        "\n  orijinal:", original.replace(/\s+/g, " ").slice(0, 400),
      );
      throw err;
    }
  }

  async query(sql: string): Promise<QueryResult> {
    sql = this.options.prepareSql?.(sql) ?? sql;
    // Temp tablo (#) içeren batch'ler TEK connection'da çalışmalı (temp tablolar
    // connection-scoped). Pool'dan ayrı bir connection al, tüm statement'ları
    // sırayla çalıştır, SON anlamlı recordset'i döndür (MSSQL son result-set davranışı).
    if (/#/.test(sql) || splitStatements(sql).filter(s => s.trim()).length > 1) {
      const conn = this.connection || await getPool().getConnection();
      try {
        const statements = splitStatements(sql);
        const results: QueryResult[] = [];
        for (const stmt of statements) {
          if (stmt.trim()) results.push(await this.execStatement(stmt, conn));
        }
        const lastWithRows = [...results].reverse().find((r) => r.recordset.length > 0);
        return {
          recordset: lastWithRows?.recordset ?? results[results.length - 1]?.recordset ?? [],
          recordsets: results.flatMap((r) => r.recordsets),
          rowsAffected: results.flatMap((r) => r.rowsAffected),
        };
      } finally {
        if (!this.connection) conn.release();
      }
    }

    const statements = splitStatements(sql);
    if (statements.length <= 1) {
      return this.execStatement(sql);
    }
    const results: QueryResult[] = [];
    for (const stmt of statements) {
      if (stmt.trim()) results.push(await this.execStatement(stmt));
    }
    return {
      recordset: results[0]?.recordset ?? [],
      recordsets: results.flatMap((r) => r.recordsets),
      rowsAffected: results.flatMap((r) => r.rowsAffected),
    };
  }

  async batch(sql: string): Promise<QueryResult> {
    return this.query(sql);
  }
}

function translateInsertUpdate(sql: string): string {
  sql = stripSqlComments(sql);    // yorumları sil (apostrof tuzağı)
  sql = translateTempTables(sql); // #temp → TEMPORARY TABLE
  sql = translateBrackets(sql);   // string-aware
  sql = translateSchema(sql);
  sql = translateCollate(sql);
  sql = translateConvert(sql);
  sql = translateFormat(sql);
  sql = translateCast(sql);
  sql = translateNPrefix(sql);
  sql = translateStringConcat(sql);
  sql = translateIsnull(sql);
  sql = translateGetdate(sql);
  sql = translateLen(sql);
  sql = translateParams(sql);
  return sql;
}

// SQL'i ; ile ayır (string-aware)
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current = "";
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") {
      current += c;
      if (inStr && sql[i + 1] === "'") {
        current += sql[i + 1];
        i++;
        continue;
      }
      inStr = !inStr;
      continue;
    }
    if (c === ";" && !inStr) {
      out.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim()) out.push(current);
  return out;
}

class MysqlTransaction {
  readonly config = { __mysql: true };
  constructor(private conn: mysql.PoolConnection, private options: MysqlCompatOptions = {}) {}

  async begin() {
    await this.conn.beginTransaction();
    return this;
  }
  async commit() {
    await this.conn.commit();
    this.conn.release();
  }
  async rollback() {
    await this.conn.rollback();
    this.conn.release();
  }
  request() {
    return new MysqlCompatRequest(this.conn, this.options);
  }
}

export class MysqlCompatPool {
  constructor(private options: MysqlCompatOptions = {}) {}
  request(): MysqlCompatRequest {
    return new MysqlCompatRequest(undefined, this.options);
  }

  async transaction(): Promise<MysqlTransaction> {
    const conn = await getPool().getConnection();
    return new MysqlTransaction(conn, this.options);
  }

  // mssql.ConnectionPool.config uyumluluğu — bazı helper'lar pool.config ile
  // dialect ayırt ediyor. MySQL için boş ama tanımlı bir config sun.
  readonly config = { __mysql: true } as unknown as Record<string, unknown>;
}
