// MSSQL/tedious soketlerinin yarı-açık bağlantıda fırlattığı EPIPE/ECONNRESET
// uncaughtException'larını process seviyesinde yutar → worker/lambda çökmesini
// önler ("Jest worker exceeding retry limit" + /api/auth/session HTML 500).
// Yalnızca Node.js runtime'da çağrılmalı (process.on Edge'de yok). Bir kez kurulur.
export function installSocketGuard(): void {
  const g = globalThis as typeof globalThis & { __dbSocketGuardInstalled?: boolean };
  if (g.__dbSocketGuardInstalled) return;
  g.__dbSocketGuardInstalled = true;

  const isTransientSocketError = (e: unknown): boolean => {
    const code = (e as { code?: string } | null)?.code;
    const msg = String((e as { message?: string } | null)?.message ?? e ?? "").toLowerCase();
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
    if (isTransientSocketError(err)) {
      console.warn("[socketGuard] geçici soket hatası yutuldu (uncaughtException):", (err as { code?: string })?.code ?? err);
      return;
    }
    throw err; // soket dışı hatalar normal şekilde çöksün
  });
  process.on("unhandledRejection", (reason) => {
    if (isTransientSocketError(reason)) {
      console.warn("[socketGuard] geçici soket reddi yutuldu (unhandledRejection):", (reason as { code?: string })?.code ?? reason);
      return;
    }
    throw reason; // soket dışı rejection'lar normal şekilde yüzeye çıksın
  });
}
