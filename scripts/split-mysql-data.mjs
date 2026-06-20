#!/usr/bin/env node
// 02-data.sql'i mevcut MySQL tablolarındaki INSERT'leri çıkararak,
// kalan INSERT'leri tablo bazlı chunk'lara böler.
//
// Kullanım:
//   node scripts/split-mysql-data.mjs <data.sql> <existing-mysql-schema.sql> <out-dir>

import { readFileSync, createReadStream, createWriteStream, mkdirSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

const [, , dataPath, existingPath, outDirArg] = process.argv;
if (!dataPath || !existingPath) {
  console.error("Kullanım: node scripts/split-mysql-data.mjs <data.sql> <existing.sql> [out-dir]");
  process.exit(1);
}
const outDir = path.resolve(outDirArg || path.join(path.dirname(dataPath), "data-split"));
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

// Mevcut MySQL'deki tablo isimlerini topla
const existingSql = readFileSync(existingPath, "utf8");
const existing = new Set();
for (const m of existingSql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`/gi)) {
  existing.add(m[1].toLowerCase());
}
console.log(`Mevcut MySQL tabloları (data'sı atlanacak): ${existing.size}`);

// Per-table chunk'lar — ~30 MB sınırı (phpMyAdmin import için güvenli)
const MAX_CHUNK = 30 * 1024 * 1024;
const writers = new Map(); // tableName -> { stream, bytes, idx }
const skipped = new Set(); // mevcut tabloların INSERT'ı atlandı

function getWriter(table) {
  let w = writers.get(table);
  if (!w) {
    w = { idx: 1, bytes: 0, stream: null };
    writers.set(table, w);
    w.stream = openChunk(table, w.idx);
  }
  return w;
}

function openChunk(table, idx) {
  const file = path.join(outDir, `${table}__${String(idx).padStart(2, "0")}.sql`);
  const s = createWriteStream(file, { encoding: "utf8" });
  s.write(`-- Data: ${table} (chunk ${idx})\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\nSET sql_mode = '';\n\n`);
  return s;
}

function writeToTable(table, line) {
  const w = getWriter(table);
  if (w.bytes > MAX_CHUNK) {
    w.stream.end();
    w.idx++;
    w.bytes = 0;
    w.stream = openChunk(table, w.idx);
  }
  w.stream.write(line + "\n");
  w.bytes += Buffer.byteLength(line, "utf8") + 1;
}

const rl = createInterface({
  input: createReadStream(dataPath, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

let inserts = 0;
let skippedInserts = 0;

rl.on("line", (line) => {
  // INSERT IGNORE INTO `TableName` (...) VALUES (...);
  const m = line.match(/^INSERT\s+IGNORE\s+INTO\s+`([^`]+)`/i);
  if (!m) return;
  const table = m[1];
  if (existing.has(table.toLowerCase())) {
    skipped.add(table);
    skippedInserts++;
    return;
  }
  writeToTable(table, line);
  inserts++;
});

rl.on("close", () => {
  // Tüm stream'leri kapat
  for (const [, w] of writers) w.stream.end();
  console.log(`İşlenen INSERT       : ${inserts}`);
  console.log(`Mevcut tabloya atlanan: ${skippedInserts} (${skipped.size} tablodan)`);
  console.log(`Yeni tablo dosyalar  : ${writers.size}`);
  console.log(`Çıktı                 : ${outDir}`);
});
