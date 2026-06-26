#!/bin/bash
# ============================================================================
# cPanel Next.js süreç teşhisi — "process limitten yiyor" sorununu pinpoint eder.
# Çalıştır (cPanel > Terminal varsa):  bash ~/portal/deploy/cpanel-diagnose.sh
# Çıktıyı kopyalayıp paylaş. HİÇBİR ŞEYİ ÖLDÜRMEZ/DEĞİŞTİRMEZ — sadece rapor.
# ============================================================================
APP_DIR="$HOME/portal"
PORT=3000

echo "=================== cPanel Next.js TEŞHİS ==================="
echo "Tarih: $(date '+%F %T')   Kullanıcı: $(whoami)"
echo

echo "── 1) Çalışan node/next süreçleri (server.js / next-server) ──"
ps -eo pid,ppid,pgid,etime,rss,comm,args 2>/dev/null \
  | grep -E 'server\.js|next-server|node' | grep -v grep
cnt=$(ps -eo args 2>/dev/null | grep -E 'server\.js|next-server' | grep -v grep | wc -l)
echo ">> server.js/next-server süreç sayısı: $cnt   (1 olmalı; >1 ise BİRİKME var)"
echo

echo "── 2) Toplam node süreç sayısı (hesabındaki) ──"
ps -eo args 2>/dev/null | grep -E '(^|/)node( |$)|node ' | grep -v grep | wc -l
echo

echo "── 3) PORT $PORT'u kim dinliyor? ──"
if command -v fuser >/dev/null 2>&1; then fuser "${PORT}/tcp" 2>/dev/null
elif command -v lsof >/dev/null 2>&1; then lsof -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null
elif command -v ss   >/dev/null 2>&1; then ss -ltnp "sport = :${PORT}" 2>/dev/null
else echo "fuser/lsof/ss yok — port aracı bulunamadı"; fi
echo

echo "── 4) PHUSION PASSENGER izi (cPanel Setup Node.js App ÇİFTE YÖNETİM?) ──"
pgX=$(ps -eo args 2>/dev/null | grep -iE 'passenger|Passenger' | grep -v grep)
if [ -n "$pgX" ]; then
  echo "!! PASSENGER TESPİT EDİLDİ — uygulama muhtemelen hem cron hem Passenger ile"
  echo "   yönetiliyor. cPanel > Setup Node.js App → bu uygulamayı DESTROY et."
  echo "$pgX"
else
  echo "Passenger süreci görünmüyor (iyi)."
fi
[ -d "$APP_DIR/.next/standalone" ] && echo "standalone build: VAR" || echo "standalone build: YOK (next.config output:'standalone' gerekli)"
echo

echo "── 5) pidfile durumu ──"
PF="$APP_DIR/tmp/app.pid"
if [ -f "$PF" ]; then
  p=$(cat "$PF" 2>/dev/null); echo "pidfile=$p  $(kill -0 "$p" 2>/dev/null && echo '(canlı)' || echo '(ÖLÜ — bayat pidfile)')"
else echo "pidfile yok ($PF)"; fi
echo

echo "── 6) Bu uygulamayı başlatan cron'lar ──"
crontab -l 2>/dev/null | grep -E 'portal|server\.js|cpanel-start' || echo "(crontab boş veya eşleşme yok)"
echo

echo "── 7) app.log son 15 satır ──"
tail -n 15 "$APP_DIR/tmp/app.log" 2>/dev/null || echo "(log yok)"
echo "============================================================"
