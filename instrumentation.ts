// Next.js instrumentation — her server runtime'ı başlarken BİR KEZ çalışır.
// Node.js soket guard'ını (EPIPE/ECONNRESET yutma) kurar. process.on Edge
// Runtime'da olmadığından guard'ı DİNAMİK import ile yüklüyoruz — böylece edge
// bundle'ında process.on statik analizi tetiklenmez (uyarı çıkmaz).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installSocketGuard } = await import("./lib/socketGuard");
  installSocketGuard();
}
