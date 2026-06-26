#!/bin/bash
# ============================================================================
# cPanel cron ile Next.js (standalone) tek-instance başlatıcı / restart edici
# ----------------------------------------------------------------------------
# SORUN: Cron her tetiklendiğinde / her upload sonrasında yeni bir `next-server`
# süreci açılıyor, eskisi ölmüyor → cPanel process limiti doluyor, site kilitleniyor.
#
# ÇÖZÜM: Bu script
#   1) FLOCK ile aynı anda iki kopyasının çalışmasını engeller (cron çakışması →
#      çift başlatma BİRİKMEZ),
#   2) pidfile + PORT doğrulamasıyla TEK instance garantisi verir (sadece PID canlı
#      değil, PORT da gerçekten dinleniyor mu kontrol edilir),
#   3) tmp/restart.txt "flag" dosyası varsa eskiyi (process group + PORT'u tutan
#      tüm stray'lerle birlikte) öldürüp yeniden başlatır,
#   4) Süreçleri PROCESS GROUP olarak başlatıp öldürür → Next'in spawn ettiği
#      yardımcı süreçler de birlikte temizlenir (orphan kalmaz).
#
# ⚠️ ÇOK ÖNEMLİ — ÇİFTE YÖNETİM: Bu uygulama AYNI ZAMANDA cPanel
# "Setup Node.js Application" (Phusion Passenger) altında KAYITLI OLMAMALI.
# Passenger uygulamayı cron'dan bağımsız ayrıca spawn eder → hiçbir script
# birikmeyi önleyemez. Node.js App kaydını SİL, yalnızca bu cron'u kullan.
# Kontrol: cPanel > Setup Node.js App → bu uygulama listede varsa "Destroy".
#
# KURULUM (SSH gerekmez, sadece cPanel arayüzü):
#   1. Bu dosyayı uygulama dizinine koy, örn: ~/portal/deploy/cpanel-start.sh
#   2. Aşağıdaki 3 değişkeni KENDİ kurulumuna göre düzenle (APP_DIR, SERVER_JS, PORT).
#   3. cPanel > Cron Jobs > her dakika çalışacak yeni bir cron ekle:
#        * * * * * /bin/bash "$HOME/portal/deploy/cpanel-start.sh" >/dev/null 2>&1
#      (Eski "uygulamayı başlatan" cron job'ı SİL — artık bu script yönetiyor.)
#   4. Yeni build upload edince: File Manager ile ~/portal/tmp/restart.txt adında
#      boş bir dosya oluştur. Sonraki cron tetiğinde eski süreç(ler) ölür, yenisi
#      başlar, flag dosyası silinir. (Birikmiş süreçleri temizlemek için de bunu kullan.)
# ============================================================================

# ── AYARLAR (kendi kurulumuna göre düzenle) ─────────────────────────────────
APP_DIR="$HOME/portal"                                   # uygulama kök dizini
# DİKKAT: standalone server.js çoğu zaman İÇ İÇE bir yolda olur (Next proje yolunu
# yansıtır), örn: .next/standalone/home/uniquea/portal/server.js. Aşağıya şu an
# çalışan cron komutundaki TAM yolu yaz. Boş/yanlışsa script otomatik bulmayı dener.
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
LOCK="$APP_DIR/tmp/cpanel-start.lock"
mkdir -p "$APP_DIR/tmp"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# ── FLOCK: aynı anda yalnızca BİR kopya çalışsın ────────────────────────────
# Cron çakışması (önceki çalışma uzun sürdüyse) çift başlatmaya yol açar; lock
# ile ikinci kopya sessizce çıkar. flock yoksa (nadiren) eski davranışa düşülür.
exec 9>"$LOCK" 2>/dev/null
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || exit 0
fi

# server.js verilen yolda yoksa standalone altında otomatik bul (iç içe yol koruması)
if [ ! -f "$SERVER_JS" ]; then
  found="$(find "$APP_DIR/.next/standalone" -name server.js -type f 2>/dev/null | head -n1)"
  [ -n "$found" ] && SERVER_JS="$found"
fi

# PORT'u DİNLEYEN PID'ler — sistemde hangi araç varsa onu kullan (graceful degrade).
port_pids() {
  if command -v fuser >/dev/null 2>&1; then
    fuser "${PORT}/tcp" 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+$'
  elif command -v lsof >/dev/null 2>&1; then
    lsof -t -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnpH "sport = :${PORT}" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u
  fi
}

# Çalışıyor mu? pidfile PID canlı; mümkünse PORT'u o PID'in tuttuğunu da doğrula.
is_running() {
  [ -f "$PIDFILE" ] || return 1
  local p; p="$(cat "$PIDFILE" 2>/dev/null)"
  [ -n "$p" ] && kill -0 "$p" 2>/dev/null || return 1
  local pp; pp="$(port_pids)"
  if [ -n "$pp" ]; then
    echo "$pp" | grep -qx "$p" && return 0 || return 1
  fi
  return 0   # port aracı yoksa sadece PID'e güven
}

stop() {
  # 1) pidfile süreci + onun PROCESS GROUP'u (Next yardımcıları dahil)
  if [ -f "$PIDFILE" ]; then
    local p; p="$(cat "$PIDFILE" 2>/dev/null)"
    if [ -n "$p" ]; then
      kill -TERM "-${p}" 2>/dev/null || kill -TERM "${p}" 2>/dev/null
      sleep 3
      kill -KILL "-${p}" 2>/dev/null; kill -KILL "${p}" 2>/dev/null
    fi
    rm -f "$PIDFILE"
  fi
  # 2) bu uygulamanın server.js yoluyla eşleşen stray'ler (diğer uygulamalara dokunmaz)
  pkill -f "$SERVER_JS" 2>/dev/null
  # 3) PORT'u HÂLÂ tutan stray'ler (yol eşleşmese bile yakala)
  local pid
  for pid in $(port_pids); do kill -KILL "$pid" 2>/dev/null; done
  sleep 1
}

start() {
  cd "$APP_DIR" || exit 1
  export PORT="$PORT"
  # Yeni oturum/process-group lideri olarak başlat → restart'ta tüm alt süreçler
  # birlikte ölür. stdin /dev/null'a bağlanır (stdin beklemesiyle takılmayı önler).
  if command -v setsid >/dev/null 2>&1; then
    setsid "$NODE_BIN" "$SERVER_JS" >> "$LOG" 2>&1 < /dev/null &
  else
    nohup "$NODE_BIN" "$SERVER_JS" >> "$LOG" 2>&1 < /dev/null &
  fi
  echo $! > "$PIDFILE"
  log "started pid=$(cat "$PIDFILE") port=$PORT server=$SERVER_JS"
}

# 1) Restart istendi mi? (yeni build sonrası File Manager'dan oluşturulan flag)
if [ -f "$FLAG" ]; then
  log "restart flag bulundu → stop + start"
  stop
  start
  rm -f "$FLAG"
  exit 0
fi

# 2) Çalışmıyorsa başlat; çalışıyorsa hiçbir şey yapma (pile-up önlenir)
if ! is_running; then
  log "çalışmıyor → temizle + başlat"
  stop          # olası untracked stray'leri temizle
  start
fi
exit 0
