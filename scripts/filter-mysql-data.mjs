#!/usr/bin/env node
// Stream-based: 02-data.sql'i satır satır okur, multi-line INSERT'leri quote-aware
// tutar, mevcut tabloların INSERT'lerini atlar, kalanı yazar.
//
// Kullanım:
//   node scripts/filter-mysql-data.mjs <data.sql> <existing-mysql.sql> <output.sql>

import { readFileSync, createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";

const [, , dataPath, existingPath, outPath] = process.argv;
if (!dataPath || !existingPath || !outPath) {
  console.error("Kullanım: node scripts/filter-mysql-data.mjs <data.sql> <existing.sql> <out.sql>");
  process.exit(1);
}

const existing = new Set();
for (const m of readFileSync(existingPath, "utf8").matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`/gi)) {
  existing.add(m[1].toLowerCase());
}
console.log(`Mevcut tablo (skip): ${existing.size}`);

const out = createWriteStream(outPath, { encoding: "utf8" });
out.write(`-- Filtered: only INSERTs for new tables\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\nSET sql_mode = '';\n\n`);

const rl = createInterface({
  input: createReadStream(dataPath, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

let buffer = "";
let inString = false;
let kept = 0, skipped = 0, nonInsert = 0;

function flushStatement(stmt) {
  const trimmed = stmt.trim();
  if (!trimmed) return;
  const m = trimmed.match(/^INSERT\s+IGNORE\s+INTO\s+`([^`]+)`/i);
  if (!m) {
    nonInsert++;
    return;
  }
  const table = m[1];
  if (existing.has(table.toLowerCase())) {
    skipped++;
    return;
  }
  let s = trimmed;
  if (!s.endsWith(";")) s += ";";
  out.write(s + "\n");
  kept++;
}

// Quote-aware: bir string içinde miyiz?
function updateStringState(str) {
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "'") {
      if (inString && str[i + 1] === "'") { i++; continue; }
      inString = !inString;
    }
  }
}

rl.on("line", (line) => {
  if (buffer.length) buffer += "\n";
  buffer += line;
  updateStringState(line);
  // Statement bitti mi? Buffer'in sonu ; ve string dışında miyiz?
  if (!inString && buffer.trimEnd().endsWith(";")) {
    flushStatement(buffer);
    buffer = "";
  }
});

rl.on("close", () => {
  if (buffer.trim()) flushStatement(buffer);
  out.write(`\nSET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n`);
  out.end(() => {
    console.log(`Yazılan INSERT  : ${kept}`);
    console.log(`Atlanan (mevcut): ${skipped}`);
    console.log(`Atlanan (SET/yorum): ${nonInsert}`);
    console.log(`Çıktı: ${outPath}`);
  });
});
