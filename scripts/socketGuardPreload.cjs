// node --require preload — NODE_OPTIONS ile TÜM node süreçlerine (Next dev ana
// süreci + Turbopack jest-worker child process'leri) en başta yüklenir.
// Amaç: MSSQL/tedious soketlerinin EPIPE/ECONNRESET uncaughtException'larını
// yutmak. Worker'lar bu hatadan ölünce "Jest worker exceeding retry limit" +
// /api/auth/session HTML 500 + next-auth CLIENT_FETCH_ERROR oluşuyordu.
//
// ÖNEMLİ: Bu preload SADECE dev'de (package.json "dev" → scripts/dev.mjs) kullanılır.
// Bu yüzden burada hata RETHROW EDİLMEZ — guard'ın kendisi asla süreci öldürmesin
// (rethrow, Next/Postgres'in zararsız rejection'larını fatal yapıp dev'i çökertiyordu).
// Geçici soket hatası → sessizce yut. Soket dışı hata → logla, devam et (Next dev
// overlay zaten gösterir). Prod'da bu preload yok; orada lib/socketGuard (rethrow)
// geçerli kalır.
(() => {
  const g = globalThis;
  if (g.__dbSocketGuardInstalled) return;
  g.__dbSocketGuardInstalled = true;

  const isTransient = (e) => {
    const code = e && e.code;
    const msg = String((e && e.message) || e || "").toLowerCase();
    return (
      code === "EPIPE" ||
      code === "ECONNRESET" ||
      code === "ECONNCLOSED" ||
      msg.includes("epipe") ||
      msg.includes("econnreset") ||
      msg.includes("socket hang up")
    );
  };

  process.on("uncaughtException", (err) => {
    if (isTransient(err)) return;
    console.error("[socketGuard-preload] uncaughtException:", err);
  });
  process.on("unhandledRejection", (reason) => {
    if (isTransient(reason)) return;
    console.error("[socketGuard-preload] unhandledRejection:", reason);
  });
})();
