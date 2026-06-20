#!/bin/bash
# cPanel MySQL import script — Türkçe karakter güvenli, idempotent, log'lu.
# Cron'la her dakika çalışır, _import/ altındaki .sql dosyalarını sırayla import eder.
# Başarılı olanı _import/done/'a, hatalıyı _import/failed/'a taşır.
#
# Kurulum:
#   1) cPanel File Manager → ~/lab.uniqueanalyse.com/_import/ klasörü oluştur
#   2) Bu dosyayı _import/ içine koy, chmod 0755
#   3) _import/.db.conf dosyası oluştur, chmod 0600, içeriği:
#         MYSQL_HOST=localhost
#         MYSQL_USER=uniqueanalyse_xxx
#         MYSQL_PASSWORD=...
#         MYSQL_DATABASE=uniqueanalyse_unipo
#   4) Cron: * * * * * /home/uniqueanalyse/lab.uniqueanalyse.com/_import/sql-import.sh
#   5) SQL dosyalarını _import/ içine yükle, 1 dk içinde otomatik çalışır

set -euo pipefail

IMPORT_DIR="$HOME/lab.uniqueanalyse.com/_import"
DONE_DIR="$IMPORT_DIR/done"
FAILED_DIR="$IMPORT_DIR/failed"
LOG="$IMPORT_DIR/import.log"
LOCK="$IMPORT_DIR/.lock"
CONF="$IMPORT_DIR/.db.conf"
STAMP="[$(date '+%Y-%m-%d %H:%M:%S')]"

mkdir -p "$DONE_DIR" "$FAILED_DIR"

# Lock — non-blocking, eş zamanlı çalışmayı engelle
exec 9>"$LOCK"
if ! flock -n 9; then exit 0; fi

# Config kontrolü
if [ ! -f "$CONF" ]; then
  echo "$STAMP HATA: $CONF dosyası yok. Kurulum talimatına bak." >> "$LOG"
  exit 1
fi
# CRLF temizle (Windows'tan kopyalandıysa)
sed -i 's/\r$//' "$CONF"
# shellcheck disable=SC1090
source "$CONF"

# Boş işse sessizce çık
shopt -s nullglob
files=("$IMPORT_DIR"/*.sql)
[ ${#files[@]} -eq 0 ] && exit 0

# Alfabetik sıraya göre çalıştır
IFS=$'\n' sorted=($(printf '%s\n' "${files[@]}" | sort))
unset IFS

for sql in "${sorted[@]}"; do
  base=$(basename "$sql")
  ts=$(date '+%Y%m%d-%H%M%S')
  err_file="$FAILED_DIR/${ts}-${base}.err"

  echo "$STAMP $base import başlıyor..." >> "$LOG"

  if mysql --default-character-set=utf8mb4 \
           --init-command="SET NAMES utf8mb4; SET sql_mode = ''; SET FOREIGN_KEY_CHECKS = 0;" \
           -h "$MYSQL_HOST" \
           -u "$MYSQL_USER" \
           --password="$MYSQL_PASSWORD" \
           "$MYSQL_DATABASE" \
           < "$sql" 2> "$err_file"; then
    mv "$sql" "$DONE_DIR/${ts}-${base}"
    rm -f "$err_file"
    echo "$STAMP   ✓ BAŞARILI → done/${ts}-${base}" >> "$LOG"
  else
    mv "$sql" "$FAILED_DIR/${ts}-${base}"
    echo "$STAMP   ✗ BAŞARISIZ → failed/${ts}-${base}" >> "$LOG"
    echo "$STAMP     Hata özeti: $(tail -3 "$err_file" | tr '\n' ' ')" >> "$LOG"
  fi
done
