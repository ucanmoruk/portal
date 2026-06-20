#!/bin/bash
# MSSQL → MySQL göç dosyalarını sıfırdan üretir (tekrarlanabilir tam pipeline).
# Kullanım: bash scripts/regen-mysql-migration.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$ROOT/migrations"
SRC="$MIG/massgrup_cosmo_full.sql"       # MSSQL kaynak (UTF-16)
EXIST="$MIG/uniqueanalyse_unipo.sql"     # Mevcut MySQL (27 tablo)
OUT="$MIG/mysql-out"

echo "1) Converter (MSSQL → MySQL)"
node "$ROOT/scripts/mssql-to-mysql-convert.mjs" "$SRC" "$OUT" | grep -E "INSERT|TABLE|VIEW" || true

echo "2) View case-fix (Linux case-sensitivity)"
node "$ROOT/scripts/fix-view-case.mjs" "$OUT/01-schema.sql" "$EXIST"

echo "3) Index'leri idempotent yap"
sed -i 's/^CREATE INDEX /CREATE INDEX IF NOT EXISTS /g; s/^CREATE UNIQUE INDEX /CREATE UNIQUE INDEX IF NOT EXISTS /g' "$OUT/01-schema.sql"

echo "4) Schema fix (PK, çakışan view, sıralama, eksik kolon ALTER)"
node "$ROOT/scripts/fix-schema.mjs" "$OUT/01-schema.sql" "$EXIST" "$OUT/00-alter-existing.sql"

echo "5) Birleşik schema"
cat "$OUT/00-alter-existing.sql" "$OUT/01-schema.sql" > "$OUT/01-full-schema.sql"

echo "6) Data filtrele (mevcut tabloları atla, multi-line güvenli)"
node "$ROOT/scripts/filter-mysql-data.mjs" "$OUT/02-data.sql" "$EXIST" "$OUT/02-data-new-tables.sql"

echo "7) Collation normalize SQL (tüm tablolar → utf8mb4_turkish_ci)"
{
  echo "-- Tüm tabloları utf8mb4_turkish_ci'ye normalize et (schema'dan SONRA çalıştır)"
  echo "SET FOREIGN_KEY_CHECKS=0;"
  grep -oE "CREATE TABLE IF NOT EXISTS \`[^\`]+\`" "$OUT/01-schema.sql" \
    | sed -E "s/CREATE TABLE IF NOT EXISTS \`([^\`]+)\`/ALTER TABLE \`\1\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;/"
  echo "SET FOREIGN_KEY_CHECKS=1;"
} > "$OUT/03-normalize-collation.sql"

echo "8) Doğrulama"
node "$ROOT/scripts/validate-mysql-sql.mjs" "$OUT/01-full-schema.sql" "$OUT/02-data-new-tables.sql"

echo ""
echo "TAMAM. Import edilecek dosyalar:"
echo "  $OUT/01-full-schema.sql"
echo "  $OUT/02-data-new-tables.sql"
