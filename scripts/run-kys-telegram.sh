#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=$(dirname -- "$SCRIPT_DIR")
ACCOUNT_DIR=$(dirname -- "$APP_DIR")
APP_NAME=$(basename -- "$APP_DIR")
cd "$APP_DIR"

# cPanel cron does not load the Node.js App virtual environment or its PATH.
# This runner uses built-in Node APIs only, so any Node with native fetch works.
supports_runner() {
  [ -n "$1" ] && [ -x "$1" ] && "$1" -e 'process.exit(typeof fetch === "function" && typeof AbortSignal.timeout === "function" ? 0 : 1)' >/dev/null 2>&1
}

CRON_NODE=${KYS_TELEGRAM_NODE_BINARY:-$(command -v node || true)}
if ! supports_runner "$CRON_NODE"; then
  CRON_NODE=""
  for candidate in "$ACCOUNT_DIR/nodevenv/$APP_NAME"/*/bin/node /opt/alt/alt-nodejs*/root/usr/bin/node /usr/local/bin/node /usr/bin/node; do
    if supports_runner "$candidate"; then CRON_NODE=$candidate; break; fi
  done
fi

if [ -z "$CRON_NODE" ]; then
  printf '%s\n' 'Node bulunamadı. cPanel Node.js App aktivasyonundaki Node yolunu KYS_TELEGRAM_NODE_BINARY ile belirtin.' >&2
  exit 1
fi

printf 'Telegram cron Node: %s\n' "$CRON_NODE"
exec "$CRON_NODE" "$APP_DIR/scripts/run-kys-telegram.mjs" "$@"
