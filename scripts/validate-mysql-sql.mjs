#!/usr/bin/env node
// MySQL'e göndermeden önce .sql dosyasını tarar, kalan MSSQL artifact'larını
// ve syntax riskli desenleri raporlar. Stream-based (büyük dosya güvenli).
//
// Kullanım:
//   node scripts/validate-mysql-sql.mjs <file.sql> [...more files]

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Kullanım: node scripts/validate-mysql-sql.mjs <file.sql> [...]");
  process.exit(1);
}

// String literal'leri maskele ('...' → ''). String state SATIRLAR ARASI korunur
// (multi-line string değerleri içindeki [ ] yanlış alarm vermesin).
let _inStr = false;
function maskStrings(line) {
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (_inStr) {
      if (c === "'") {
        if (line[i + 1] === "'") { i++; continue; }
        _inStr = false;
        out += "'";
      }
      continue;
    }
    if (c === "'") { _inStr = true; out += "'"; continue; }
    out += c;
  }
  return out;
}

const CHECKS = [
  { name: "MSSQL bracket identifier [X]", re: /\[[A-Za-z_]/ },
  { name: "SET IDENTITY_INSERT", re: /\bSET\s+IDENTITY_INSERT\b/i },
  { name: "GO batch separator", re: /^\s*GO\s*$/i },
  { name: "MSSQL CAST tipi (SmallDateTime/DateTime2/UniqueIdentifier/NVarChar)", re: /\bAS\s+(SmallDateTime|DateTime2|UniqueIdentifier|N?VarChar|Money|Bit|Image)\b/i },
  { name: "NVARCHAR/NCHAR/NTEXT tip", re: /\bN(?:VARCHAR|CHAR|TEXT)\b/i },
  { name: "DATETIME2/SMALLDATETIME tip", re: /\b(DATETIME2|SMALLDATETIME|DATETIMEOFFSET)\b/i },
  { name: "MSSQL fonksiyon (GETDATE/ISNULL/SCOPE_IDENTITY)", re: /\b(GETDATE|ISNULL|SCOPE_IDENTITY|NEWID|SYSDATETIME)\s*\(/i },
  { name: "N'unicode' prefix", re: /[(,]\s*N'/ },
  { name: "CLUSTERED/NONCLUSTERED", re: /\b(?:NON)?CLUSTERED\b/i },
  { name: "ON [PRIMARY] / WITH(...) index hint", re: /\bON\s+\[?PRIMARY\]?|WITH\s*\(\s*PAD_INDEX/i },
  { name: "ODBC scalar { fn ... }", re: /\{\s*fn\s+/i },
  { name: "schema.tablo prefix (dbo./cosmoroot.)", re: /\b(dbo|cosmoroot)\.[A-Za-z`]/i },
];

let grandTotal = 0;

for (const file of files) {
  const findings = new Map(); // checkName → {count, firstLine, sample}
  let lineNo = 0;
  _inStr = false; // her dosya başında string state sıfırla

  await new Promise((resolve) => {
    const rl = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
    rl.on("line", (raw) => {
      lineNo++;
      const masked = maskStrings(raw);
      for (const chk of CHECKS) {
        if (chk.re.test(masked)) {
          const f = findings.get(chk.name) || { count: 0, firstLine: lineNo, sample: raw.slice(0, 120) };
          f.count++;
          findings.set(chk.name, f);
        }
      }
    });
    rl.on("close", resolve);
  });

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Dosya: ${file}  (${lineNo} satır)`);
  console.log("=".repeat(70));
  if (findings.size === 0) {
    console.log("  ✓ TEMİZ — MSSQL artifact bulunamadı.");
  } else {
    for (const [name, f] of findings) {
      grandTotal += f.count;
      console.log(`  ✗ ${name}`);
      console.log(`      ${f.count} kez, ilk: satır ${f.firstLine}`);
      console.log(`      örnek: ${f.sample}`);
    }
  }
}

console.log(`\n${"=".repeat(70)}`);
console.log(grandTotal === 0 ? "SONUÇ: ✓ Tüm dosyalar temiz, import edilebilir." : `SONUÇ: ✗ Toplam ${grandTotal} sorunlu satır var.`);
process.exit(grandTotal === 0 ? 0 : 1);
