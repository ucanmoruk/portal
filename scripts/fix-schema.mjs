#!/usr/bin/env node
// Converter çıktısı 01-schema.sql üzerinde TÜM MySQL uyum düzeltmelerini yapar:
//   1) Mevcut tabloya çakışan VIEW'ları çıkar
//   2) AUTO_INCREMENT olup PK'siz tablolara PRIMARY KEY ekle
//   3) Filtered index (WHERE ...) → WHERE kaldır
//   4) View alias case normalize (M.x → m.x)
//   5) Statement sıralama: TABLE → INDEX → VIEW
//   6) Mevcut tablolara eksik kolonlar için ALTER üret (ayrı dosya)
//
// Kullanım:
//   node scripts/fix-schema.mjs <schema.sql> <existing-mysql.sql> <out-alter.sql>

import { readFileSync, writeFileSync } from "node:fs";

const [, , schemaPath, existingPath, alterOutPath] = process.argv;
if (!schemaPath || !existingPath) {
  console.error("Kullanım: node scripts/fix-schema.mjs <schema.sql> <existing.sql> [alter-out.sql]");
  process.exit(1);
}

let content = readFileSync(schemaPath, "utf8");
const existingSql = readFileSync(existingPath, "utf8");

// Mevcut tablo/view isimleri
const existingNames = new Set();
for (const m of existingSql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`/gi)) {
  existingNames.add(m[1].toLowerCase());
}

// ── 1) Çakışan VIEW'ları çıkar (mevcutta tablo olarak duranlar) ─────────────
let removedViews = 0;
content = content.replace(
  /CREATE\s+OR\s+REPLACE\s+VIEW\s+`([^`]+)`[\s\S]*?;\n/gi,
  (full, name) => {
    if (existingNames.has(name.toLowerCase())) { removedViews++; return ""; }
    return full;
  },
);

// ── 2) AUTO_INCREMENT olup PK'siz tablolara PK ekle ─────────────────────────
let pkAdded = 0;
content = content.replace(
  /(CREATE TABLE IF NOT EXISTS `([^`]+)`\(\n)([\s\S]*?)(\n\) ENGINE=)/gi,
  (full, head, name, body, tail) => {
    const ai = body.match(/`(\w+)`\s+\w+(?:\([^)]*\))?\s+AUTO_INCREMENT/i);
    if (!ai) return full;
    if (/\bPRIMARY\s+KEY\b|\bUNIQUE\s+KEY\b|\bUNIQUE\s*\(/i.test(body)) return full;
    const col = ai[1];
    const newBody = body.replace(/,\s*$/, "") + `,\nPRIMARY KEY (\`${col}\`)`;
    pkAdded++;
    return head + newBody + tail;
  },
);

// ── 3) Filtered index WHERE kaldır ──────────────────────────────────────────
let filteredFixed = 0;
content = content.replace(
  /(CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?[\s\S]*?\))\s*\nWHERE\s+\([^;]*?\);/gi,
  (full, idx) => { filteredFixed++; return idx + ";"; },
);

// ── 4) View alias case normalize ────────────────────────────────────────────
content = content.replace(
  /CREATE\s+OR\s+REPLACE\s+VIEW\s+`[^`]+`[\s\S]*?;\n/gi,
  (view) => {
    const aliases = new Set();
    for (const m of view.matchAll(/`[^`]+`(?:\s+AS)?\s+(\w+)\b/gi)) {
      const a = m[1];
      if (!["ON", "WHERE", "AND", "OR", "LEFT", "RIGHT", "INNER", "OUTER", "JOIN", "AS", "SELECT", "FROM"].includes(a.toUpperCase())) {
        aliases.add(a.toLowerCase());
      }
    }
    let v = view;
    for (const a of aliases) v = v.replace(new RegExp(`\\b${a}\\.`, "gi"), a + ".");
    return v;
  },
);

// ── 5) Sıralama: header → TABLE → INDEX → VIEW ──────────────────────────────
const firstCreate = content.search(/^CREATE\b/m);
const header = firstCreate >= 0 ? content.slice(0, firstCreate) : "";
const body = firstCreate >= 0 ? content.slice(firstCreate) : content;
const stmts = body.match(/CREATE\s+(?:TABLE|OR\s+REPLACE\s+VIEW|VIEW|(?:UNIQUE\s+)?INDEX)[\s\S]*?;\n/gi) || [];
const tables = [], indexes = [], views = [];
for (const s of stmts) {
  if (/^CREATE\s+TABLE\b/i.test(s)) tables.push(s);
  else if (/^CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\b/i.test(s)) views.push(s);
  else if (/^CREATE\s+(?:UNIQUE\s+)?INDEX/i.test(s)) indexes.push(s);
}
content = header + tables.join("") + "\n" + indexes.join("") + "\n" + views.join("") +
  "\nSET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n";

writeFileSync(schemaPath, content, "utf8");

// ── 6) Mevcut tablolara eksik kolon ALTER üret ──────────────────────────────
function parseCols(sql) {
  const t = new Map();
  for (const m of sql.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+`([^`]+)`\s*\(([\s\S]*?)\n\)/gi)) {
    const cols = new Map();
    for (let line of m[2].split("\n")) {
      line = line.trim().replace(/,$/, "");
      if (!line || /^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|CHECK)\b/i.test(line)) continue;
      const cm = line.match(/^`([^`]+)`\s+(.+)$/);
      if (cm) cols.set(cm[1].toLowerCase(), { name: cm[1], type: cm[2].replace(/,$/, "") });
    }
    t.set(m[1].toLowerCase(), cols);
  }
  return t;
}
const existingCols = parseCols(existingSql);
const freshCols = parseCols(content);
const alters = [];
for (const [name, cols] of freshCols) {
  if (!existingCols.has(name)) continue;
  const have = existingCols.get(name);
  for (const [lc, info] of cols) {
    if (!have.has(lc)) alters.push(`ALTER TABLE \`${info.name.split("`")[0] && name}\` ADD COLUMN IF NOT EXISTS \`${info.name}\` ${info.type};`);
  }
}
// name yerine orijinal tablo case'i lazım — düzelt
const alters2 = [];
for (const [name, cols] of freshCols) {
  if (!existingCols.has(name)) continue;
  const origName = [...existingSql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`/gi)]
    .map((m) => m[1]).find((n) => n.toLowerCase() === name) || name;
  const have = existingCols.get(name);
  for (const [lc, info] of cols) {
    if (!have.has(lc)) alters2.push(`ALTER TABLE \`${origName}\` ADD COLUMN IF NOT EXISTS \`${info.name}\` ${info.type};`);
  }
}

if (alterOutPath) {
  const out = `-- Mevcut tablolara MSSQL'deki eksik kolonları ekler\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET sql_mode = '';\n\n${alters2.join("\n")}\n\nSET FOREIGN_KEY_CHECKS = 1;\n`;
  writeFileSync(alterOutPath, out, "utf8");
}

console.log(`Çakışan view çıkarıldı : ${removedViews}`);
console.log(`PRIMARY KEY eklendi    : ${pkAdded}`);
console.log(`Filtered index fixed   : ${filteredFixed}`);
console.log(`Tablo: ${tables.length}, Index: ${indexes.length}, View: ${views.length}`);
console.log(`Eksik kolon ALTER      : ${alters2.length}${alterOutPath ? ` → ${alterOutPath}` : ""}`);
