#!/bin/bash
# cPanel deploy extract script.
# Cron tarafından her dakika çalıştırılır. Yeni tarball varsa açar, deploy eder.
# Kurulum:
#   1) cPanel File Manager → ~/lab.uniqueanalyse.com/_incoming/ klasörü oluştur
#   2) Bu dosyayı _incoming/ içine yükle veya yapıştır
#   3) Permissions: 0755 (Execute izni)
#   4) Cron Jobs: * * * * * /home/uniqueanalyse/lab.uniqueanalyse.com/_incoming/extract-deploy.sh >> /home/uniqueanalyse/lab.uniqueanalyse.com/_incoming/extract-deploy.log 2>&1

set -euo pipefail

DEPLOY_ROOT="$HOME/lab.uniqueanalyse.com"
INCOMING="$DEPLOY_ROOT/_incoming"
TARBALL="$INCOMING/deploy.tar.gz"
STAGING="$INCOMING/.staging"
LOCK="$INCOMING/.lock"
STAMP="[$(date '+%Y-%m-%d %H:%M:%S')]"

[ -f "$TARBALL" ] || exit 0

exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$STAMP Önceki çalıştırma sürüyor, atlanıyor."
  exit 0
fi

echo "$STAMP Yeni tarball algılandı."

rm -rf "$STAGING"
mkdir -p "$STAGING"

if ! tar -xzf "$TARBALL" -C "$STAGING"; then
  echo "$STAMP HATA: tarball bozuk, siliniyor."
  rm -rf "$STAGING"
  rm -f "$TARBALL"
  exit 1
fi

# Eski deploy içeriğini sil — cPanel/Passenger dosyaları ve env korunur
find "$DEPLOY_ROOT" -mindepth 1 -maxdepth 1 \
  ! -name '_incoming' \
  ! -name '.env' \
  ! -name '.env.local' \
  ! -name '.env.production' \
  ! -name '.htaccess' \
  ! -name '.well-known' \
  -exec rm -rf {} +

# Yeni içeriği kopyala (gizli dosyalar dahil)
cp -R "$STAGING/." "$DEPLOY_ROOT/"

mkdir -p "$DEPLOY_ROOT/tmp"
touch "$DEPLOY_ROOT/tmp/restart.txt"

rm -rf "$STAGING"
rm -f "$TARBALL"

echo "$STAMP Deploy tamamlandı, Passenger restart sinyali gönderildi."
