#!/bin/bash
# ============================================================================
# cPanel cron ile Next.js (standalone) tek-instance başlatıcı / restart edici
# ----------------------------------------------------------------------------
# SORUN: Cron her tetiklendiğinde / her upload sonrasında yeni bir `next-server`
# süreci açılıyor, eskisi ölmüyor → cPanel process limiti doluyor, site kilitleniyor.
#
# ÇÖZÜM: Bu script
#   1) pidfile ile TEK instance garantisi verir (zaten çalışıyorsa hiçbir şey yapmaz
#      → cron her dakika çalışsa bile süreç BİRİKMEZ),
#   2) tmp/restart.txt "flag" dosyası varsa eskiyi öldürüp yeniden başlatır
#      (yeni build upload edince File Manager'dan bu dosyayı oluştur → temiz restart),
#   3) pidfile dışında kalmış "stray" süreçleri de (yalnızca BU uygulamanın server.js
#      yoluyla eşleşenleri) temizler — diğer uygulamalara dokunmaz.
#
# KURULUM (SSH gerekmez, sadece cPanel arayüzü):
#   1. Bu dosyayı uygulama dizinine koy (File Manager ile), örn: ~/portal/deploy/cpanel-start.sh
#   2. Aşağıdaki 3 değişkeni KENDİ kurulumuna göre düzenle (APP_DIR, SERVER_JS, PORT).
#      SERVER_JS ve PORT değerlerini şu an çalışan cron komutundan al.
#   3. cPanel > Cron Jobs > her dakika çalışacak yeni bir cron ekle:
#        * * * * * /bin/bash "$HOME/portal/deploy/cpanel-start.sh" >/dev/null 2>&1
#      (Eski "uygulamayı başlatan" cron job'ı SİL — artık bu script yönetiyor.)
#   4. Yeni build upload edince: File Manager ile ~/portal/tmp/restart.txt adında
#      boş bir dosya oluştur. Sonraki cron tetiğinde eski süreç ölür, yenisi başlar,
#      flag dosyası silinir. (Mevcut birikmiş süreçleri temizlemek için de bunu kullan.)
# ============================================================================

# ── AYARLAR (kendi kurulumuna göre düzenle) ─────────────────────────────────
APP_DIR="$HOME/portal"                                   # uygulama kök dizini
# DİKKAT: standalone server.js çoğu zaman İÇ İÇE bir yolda olur (Next proje yolunu
# yansıtır), örn: .next/standalone/home/uniquea/portal/server.js veya
# .next/standalone/Desktop/Portal/server.js. Aşağıya şu an çalışan cron komutundaki
# TAM yolu yaz. Boş bırakırsan/yanlışsa script otomatik bulmayı dener.
SERVER_JS="$APP_DIR/.next/standalone/server.js"          # standalone server.js'in TAM yolu
PORT=3000                                                # uygulamanın dinlediği port
export HOSTNAME="0.0.0.0"
export NODE_ENV="production"
# Node sürümü cPanel'de farklı bir yolda olabilir; gerekiyorsa NODE_BIN'i ayarla:
NODE_BIN="${NODE_BIN:-node}"
# ────────────────────────────────────────────────────────────────────────────

PIDFILE="$APP_DIR/tmp/app.pid"
LOG="$APP_DIR/tmp/app.log"
FLAG="$APP_DIR/tmp/restart.txt"
mkdir -p "$APP_DIR/tmp"

# server.js verilen yolda yoksa standalone altında otomatik bul (iç içe yol koruması)
if [ ! -f "$SERVER_JS" ]; then
  found="$(find "$APP_DIR/.next/standalone" -name server.js -type f 2>/dev/null | head -n1)"
  [ -n "$found" ] && SERVER_JS="$found"
fi

is_running() {
  [ -f "$PIDFILE" ] || return 1
  local p; p="$(cat "$PIDFILE" 2>/dev/null)"
  [ -n "$p" ] && kill -0 "$p" 2>/dev/null
}

stop() {
  # 1) pidfile'daki süreç
  if [ -f "$PIDFILE" ]; then
    local p; p="$(cat "$PIDFILE" 2>/dev/null)"
    if [ -n "$p" ]; then
      kill "$p" 2>/dev/null
      sleep 3
      kill -9 "$p" 2>/dev/null
    fi
    rm -f "$PIDFILE"
  fi
  # 2) pidfile dışında kalmış strays — SADECE bu uygulamanın server.js yoluyla eşleşenler
  #    (tam yol eşleşmesi → hesaptaki diğer node uygulamalarına DOKUNMAZ)
  pkill -f "$SERVER_JS" 2>/dev/null
  sleep 1
}

start() {
  cd "$APP_DIR" || exit 1
  export PORT="$PORT"
  nohup "$NODE_BIN" "$SERVER_JS" >> "$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  echo "[$(date '+%F %T')] started pid=$(cat "$PIDFILE")" >> "$LOG"
}

# 1) Restart istendi mi? (yeni build sonrası File Manager'dan oluşturulan flag)
if [ -f "$FLAG" ]; then
  stop
  start
  rm -f "$FLAG"
  exit 0
fi

# 2) Çalışmıyorsa başlat; çalışıyorsa hiçbir şey yapma (pile-up önlenir)
if ! is_running; then
  stop          # olası untracked stray'leri temizle
  start
fi
exit 0
