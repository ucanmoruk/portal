#!/usr/bin/env node
// Iki MySQL .sql dosyasındaki CREATE TABLE bloklarını karşılaştırır.
// Kolon ekle/sil/tip-fark raporu üretir.
//
// Kullanım:
//   node scripts/schema-diff.mjs <existing.sql> <new.sql>

import { readFileSync } from "node:fs";

const [, , existingPath, newPath] = process.argv;
if (!existingPath || !newPath) {
  console.error("Kullanım: node scripts/schema-diff.mjs <existing.sql> <new.sql>");
  process.exit(1);
}

function parseTables(sql) {
  const tables = new Map();
  // CREATE TABLE [IF NOT EXISTS] `Name` ( ... ) ENGINE=...;
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`([^`]+)`\s*\(([\s\S]*?)\n\)\s*(?:ENGINE|;)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1];
    const body = m[2];
    const cols = new Map();
    // Her satır ya kolon ya constraint
    for (let line of body.split(/\n/)) {
      line = line.trim().replace(/,$/, "");
      if (!line) continue;
      // Constraint/Key satırlarını atla
      if (/^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN|CHECK)\b/i.test(line)) continue;
      const colMatch = line.match(/^`([^`]+)`\s+(.+)$/);
      if (!colMatch) continue;
      const colName = colMatch[1];
      // Tipi normalleştir: küçük harfle yaz, CHARACTER SET... COLLATE... 'ı at
      let type = colMatch[2]
        .replace(/\s+CHARACTER\s+SET\s+\S+/gi, "")
        .replace(/\s+COLLATE\s+\S+/gi, "")
        .replace(/\s+DEFAULT\s+[^,]+/gi, "")
        .replace(/\s+AUTO_INCREMENT/gi, "")
        .trim()
        .toLowerCase();
      // Trailing comment varsa at
      type = type.replace(/\s*--.*$/, "");
      cols.set(colName.toLowerCase(), { name: colName, type });
    }
    tables.set(name.toLowerCase(), { name, cols });
  }
  return tables;
}

function normalizeType(t) {
  // VARCHAR(20) NULL ile VARCHAR(20) NOT NULL: nullability diff'i ayrı raporlayacağız
  // Default: sadece tip + nullability'yi tut
  return t
    .replace(/\s+/g, " ")
    .replace(/\btinyint\(1\)\b/g, "bit")
    .trim();
}

const existing = parseTables(readFileSync(existingPath, "utf8"));
const fresh = parseTables(readFileSync(newPath, "utf8"));

console.log(`Mevcut: ${existing.size} tablo, Yeni: ${fresh.size} tablo`);
console.log();

const common = [];
for (const [k, t] of existing) if (fresh.has(k)) common.push(k);

console.log(`Ortak tablo: ${common.length}`);
console.log("=".repeat(70));

let totalIssues = 0;
for (const k of common.sort()) {
  const a = existing.get(k);
  const b = fresh.get(k);
  const aNames = new Set([...a.cols.keys()]);
  const bNames = new Set([...b.cols.keys()]);

  const onlyInExisting = [...aNames].filter((c) => !bNames.has(c));
  const onlyInNew = [...bNames].filter((c) => !aNames.has(c));
  const typeDiffs = [];
  for (const col of aNames) {
    if (!bNames.has(col)) continue;
    const ta = normalizeType(a.cols.get(col).type);
    const tb = normalizeType(b.cols.get(col).type);
    if (ta !== tb) typeDiffs.push({ col, existing: ta, fresh: tb });
  }

  if (!onlyInExisting.length && !onlyInNew.length && !typeDiffs.length) continue;

  totalIssues++;
  console.log(`\n--- ${a.name} (mevcut ${a.cols.size} kolon, yeni ${b.cols.size} kolon) ---`);
  if (onlyInNew.length) {
    console.log(`  Yeni'de var, mevcutta YOK (eklemek lazım):`);
    for (const c of onlyInNew) console.log(`    + ${b.cols.get(c).name}  ${b.cols.get(c).type}`);
  }
  if (onlyInExisting.length) {
    console.log(`  Mevcutta var, yeni'de YOK (manuel eklenmis kolonlar):`);
    for (const c of onlyInExisting) console.log(`    - ${a.cols.get(c).name}  ${a.cols.get(c).type}`);
  }
  if (typeDiffs.length) {
    console.log(`  Tip farkları:`);
    for (const d of typeDiffs) {
      console.log(`    ~ ${d.col}`);
      console.log(`        mevcut: ${d.existing}`);
      console.log(`        yeni  : ${d.fresh}`);
    }
  }
}

console.log();
console.log("=".repeat(70));
console.log(`Toplam ${totalIssues} ortak tabloda fark var.`);
