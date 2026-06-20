#!/usr/bin/env node
// MySQL/MariaDB Linux'ta tablo adları case-sensitive. MSSQL view body'lerinde
// yazılmış tablo referanslarını (FROM/JOIN sonrasında) canonical case ile değiştirir.
//
// Kullanım:
//   node scripts/fix-view-case.mjs <schema.sql> <existing-mysql.sql> [out.sql]

import { readFileSync, writeFileSync } from "node:fs";

const [, , schemaPath, existingPath, outArg] = process.argv;
if (!schemaPath || !existingPath) {
  console.error("Kullanım: node scripts/fix-view-case.mjs <schema.sql> <existing.sql> [out.sql]");
  process.exit(1);
}
const outPath = outArg || schemaPath;

// Canonical tablo adları topla — hem existing hem yeni (existing wins)
const canonical = new Map(); // lower → original case
function collectNames(sql) {
  for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`/gi)) {
    const name = m[1];
    if (!canonical.has(name.toLowerCase())) canonical.set(name.toLowerCase(), name);
  }
}
collectNames(readFileSync(existingPath, "utf8"));
collectNames(readFileSync(schemaPath, "utf8"));

console.log(`Canonical tablo: ${canonical.size}`);

const schema = readFileSync(schemaPath, "utf8");

// VIEW body'lerini parse et — CREATE [OR REPLACE] VIEW `X` AS ... ;
const fixedParts = [];
let cursor = 0;
const viewRe = /(CREATE\s+(?:OR\s+REPLACE\s+)?(?:SQL\s+SECURITY\s+\w+\s+)?VIEW\s+`[^`]+`\s+AS)([\s\S]*?)(?=;\s*\n)/gi;

let viewCount = 0;
let replaceCount = 0;
let m;
while ((m = viewRe.exec(schema)) !== null) {
  fixedParts.push(schema.slice(cursor, m.index));
  fixedParts.push(m[1]); // header
  let body = m[2];

  // FROM/JOIN/UPDATE/INSERT INTO sonrasındaki bare identifier'ları yakala
  body = body.replace(
    /\b(FROM|JOIN|UPDATE|INTO)\s+(`?)([A-Za-z_][\w]*)\2/gi,
    (full, kw, q, name) => {
      const c = canonical.get(name.toLowerCase());
      if (c && c !== name) {
        replaceCount++;
        return `${kw} \`${c}\``;
      }
      if (c) return `${kw} \`${c}\``;
      return full;
    },
  );

  // Single-quoted alias'ları backtick'e çevir: `AS 'X Y'` → `AS \`X Y\``
  body = body.replace(/\b(AS)\s+'([^']+)'/gi, (full, kw, alias) => "AS `" + alias + "`");

  // MSSQL ODBC scalar function: { fn CONCAT(a,b) } → CONCAT(a,b)
  body = body.replace(/\{\s*fn\s+([\s\S]*?)\s*\}/gi, "$1");

  // CAST(x AS varchar) → CAST(x AS CHAR) — MySQL CAST varchar desteklemez
  body = body.replace(/\bCAST\s*\(([\s\S]*?)\s+AS\s+VARCHAR(?:\s*\(\s*\d+\s*\))?\s*\)/gi, "CAST($1 AS CHAR)");
  body = body.replace(/\bCAST\s*\(([\s\S]*?)\s+AS\s+NVARCHAR(?:\s*\(\s*\d+\s*\))?\s*\)/gi, "CAST($1 AS CHAR)");

  fixedParts.push(body);
  cursor = m.index + m[1].length + m[2].length;
  viewCount++;
}
fixedParts.push(schema.slice(cursor));

writeFileSync(outPath, fixedParts.join(""), "utf8");
console.log(`${viewCount} view tarandı, ${replaceCount} tablo referansı düzeltildi.`);
console.log(`Çıktı: ${outPath}`);
