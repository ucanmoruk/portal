import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, chmod, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import { loadDotenvOnce } from "@/lib/loadDotenv";

// ───── HTML → PDF (Chromium Page.printToPDF) ─────
// app/api/urunler/rapor-sablon/route.ts içindeki kanıtlanmış desenden türetilmiş,
// generic ve yeniden kullanılabilir renderer. Hem local (sistem Chrome) hem
// Vercel (bundled @sparticuz/chromium) ortamında çalışır.

export interface PdfRenderOptions {
  /** A4 dışı boyut için (inç). Varsayılan A4 portrait. */
  paperWidth?: number;
  paperHeight?: number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  printBackground?: boolean;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  /** Sayfa yüklendikten sonra render öncesi beklenecek ms (görseller/font için). */
  settleMs?: number;
  /** URL render'da PDF basmadan önce true dönmesi beklenen tarayıcı içi JS ifadesi. */
  readyExpression?: string;
  readyTimeoutMs?: number;
}

interface ChromeLaunchConfig {
  executablePath: string;
  args: string[];
}

const requireFromHere = createRequire(import.meta.url);

function sv(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function commandExists(command: string): boolean {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function findBundledChromiumInputs(): string[] {
  const candidates = new Set<string>();
  const configured = sv(process.env.SPARTICUZ_CHROMIUM_PATH || process.env.CHROMIUM_BIN_DIR);
  if (configured) candidates.add(configured);

  try {
    const packageJson = requireFromHere.resolve("@sparticuz/chromium/package.json");
    candidates.add(path.join(path.dirname(packageJson), "bin"));
  } catch {
    // Standalone paket require.resolve bilgisini her ortamda taşımayabilir.
  }

  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    candidates.add(path.join(dir, "node_modules", "@sparticuz", "chromium", "bin"));
    candidates.add(path.join(dir, ".next", "standalone", "node_modules", "@sparticuz", "chromium", "bin"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return [...candidates].filter((candidate) => existsSync(candidate));
}

async function configureChromiumTempDir(): Promise<string> {
  const configured = sv(process.env.CHROMIUM_TMPDIR || process.env.CHROME_TMPDIR);
  const tmpDir = configured || path.join(process.cwd(), "tmp", "chromium");
  await mkdir(tmpDir, { recursive: true });

  // @sparticuz/chromium os.tmpdir() üstünden extraction yapar. cPanel'de /tmp noexec
  // olabildiği için binary'yi uygulama altındaki çalıştırılabilir tmp klasörüne açtır.
  process.env.TMPDIR = tmpDir;
  process.env.TMP = tmpDir;
  process.env.TEMP = tmpDir;
  return tmpDir;
}

async function ensureExecutable(file: string): Promise<boolean> {
  if (!existsSync(file)) return false;

  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    // cPanel gibi ortamlarda @sparticuz/chromium /tmp altına izin biti eksik çıkabiliyor.
    // chmod başarılı olursa tekrar deneriz; /tmp noexec ise yine başarısız olur.
    try {
      await chmod(file, 0o755);
      await access(file, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
}

async function relocateTmpExecutable(file: string, targetDir: string): Promise<string> {
  if (process.platform === "win32") return file;

  const resolvedFile = path.resolve(file);
  const systemTmp = path.resolve(os.tmpdir());
  const resolvedTarget = path.resolve(targetDir);
  if (!resolvedFile.startsWith(`${systemTmp}${path.sep}`) || resolvedTarget.startsWith(`${systemTmp}${path.sep}`)) {
    return file;
  }

  try {
    await mkdir(resolvedTarget, { recursive: true });
    const target = path.join(resolvedTarget, path.basename(file) || "chromium");
    if (path.resolve(target) === resolvedFile) return file;
    await copyFile(resolvedFile, target);
    await chmod(target, 0o755);
    if (await ensureExecutable(target)) return target;
  } catch (error) {
    console.warn("[chromiumPdf] /tmp Chromium kopyalanamadı, mevcut yol denenecek:", error);
  }
  return file;
}

async function resolveChromeLaunchConfig(): Promise<ChromeLaunchConfig | null> {
  loadDotenvOnce();
  const chromiumTmpDir = await configureChromiumTempDir();

  const configured = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
  ]
    .map((item) => sv(item))
    .filter(Boolean);

  const platformCandidates =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : process.platform === "win32"
        ? [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          ]
        : [
            "/opt/google/chrome/chrome",
            "/usr/bin/chrome",
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/lib/chromium/chrome",
            "/snap/bin/chromium",
          ];

  const commandCandidates =
    process.platform === "win32"
      ? ["chrome", "chrome.exe"]
      : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

  for (const candidate of [...configured, ...platformCandidates]) {
    if (path.isAbsolute(candidate) && (await ensureExecutable(candidate))) {
      return { executablePath: candidate, args: [] };
    }
    if (!path.isAbsolute(candidate) && commandExists(candidate)) return { executablePath: candidate, args: [] };
  }

  for (const candidate of commandCandidates) {
    if (commandExists(candidate)) return { executablePath: candidate, args: [] };
  }

  try {
    chromium.setGraphicsMode = false;
    const bundledInputs = [undefined, ...findBundledChromiumInputs()];
    for (const input of bundledInputs) {
      const executablePath = await chromium.executablePath(input);
      if (executablePath && (await ensureExecutable(executablePath))) {
        const runnablePath = await relocateTmpExecutable(executablePath, chromiumTmpDir);
        return { executablePath: runnablePath, args: chromium.args };
      }
      if (executablePath) {
        console.warn(
          `[chromiumPdf] Bundled Chromium bulundu ancak çalıştırılamıyor: ${executablePath}`,
        );
      }
    }
  } catch (error) {
    console.warn("[chromiumPdf] Bundled Chromium başlatılamadı:", error);
  }

  return null;
}

function chromeStartupTimeoutMs(): number {
  const configured = Number(process.env.CHROME_DEVTOOLS_TIMEOUT_MS || process.env.CHROME_STARTUP_TIMEOUT_MS || 0);
  return Number.isFinite(configured) && configured >= 10000 ? configured : 45000;
}

function tail(value: string, maxLength = 1200): string {
  return value.length > maxLength ? value.slice(-maxLength) : value;
}

function waitForDevtoolsUrl(proc: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let stderr = "";
    const timeoutMs = chromeStartupTimeoutMs();
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `Chrome DevTools bağlantısı zaman aşımına uğradı (${timeoutMs} ms).` +
              (stderr ? ` Chrome çıktısı: ${tail(stderr)}` : ""),
          ),
        ),
      timeoutMs,
    );

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });

    proc.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Chrome PDF işlemi erken kapandı (${code ?? "unknown"}).` +
            (stderr ? ` Chrome çıktısı: ${tail(stderr)}` : ""),
        ),
      );
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrlForCompare(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/#.*$/, "").replace(/\/$/, "");
  }
}

async function closeChromeProcess(chrome: ChildProcessWithoutNullStreams | undefined): Promise<void> {
  if (!chrome || chrome.exitCode !== null || chrome.killed) return;

  chrome.kill("SIGTERM");
  await Promise.race([new Promise<void>((resolve) => chrome!.once("exit", () => resolve())), delay(900)]);

  if (chrome.exitCode === null && !chrome.killed) {
    chrome.kill("SIGKILL");
    await Promise.race([new Promise<void>((resolve) => chrome!.once("exit", () => resolve())), delay(500)]);
  }
}

async function cleanupWorkDir(workDir: string): Promise<void> {
  try {
    await rm(workDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  } catch (error: any) {
    if (error?.code === "EBUSY" || error?.code === "EPERM" || error?.code === "ENOTEMPTY") {
      console.warn("[chromiumPdf] Geçici Chrome klasörü kilitli, yok sayıldı:", error.message);
      return;
    }
    throw error;
  }
}

interface RenderTarget {
  /** Doğrudan HTML render edilecekse içerik (file:// ile servis edilir). */
  html?: string;
  /** Canlı bir URL render edilecekse adres. */
  url?: string;
  /** URL render'da iletilecek Cookie header (oturum aktarımı için). */
  cookieHeader?: string;
}

// Ortak Chromium yaşam döngüsü: başlat → DevTools'a bağlan → navigate → printToPDF → temizle.
async function renderTargetToPdf(target: RenderTarget, options: PdfRenderOptions): Promise<Buffer> {
  const chromeConfig = await resolveChromeLaunchConfig();
  if (!chromeConfig) {
    throw new Error(
      "PDF oluşturmak için Chrome/Chromium bulunamadı. Vercel için bundled Chromium veya CHROME_PATH/CHROME_EXECUTABLE_PATH gerekli.",
    );
  }

  const workDir = path.join(os.tmpdir(), `rapor-pdf-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const profilePath = path.join(workDir, "chrome-profile");
  let chrome: ChildProcessWithoutNullStreams | undefined;
  let ws: WebSocket | undefined;
  let messageId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

  try {
    // Hedef URL'i belirle: HTML verilmişse temp dosyaya yaz, yoksa canlı URL.
    let pageUrl: string;
    if (target.html != null) {
      const htmlPath = path.join(workDir, "report.html");
      await writeFile(htmlPath, target.html, "utf8");
      pageUrl = `file://${htmlPath}`;
    } else if (target.url) {
      pageUrl = target.url;
    } else {
      throw new Error("renderTargetToPdf: html veya url verilmeli.");
    }

    chrome = spawn(chromeConfig.executablePath, [
      ...chromeConfig.args,
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profilePath}`,
    ]);

    const wsUrl = await waitForDevtoolsUrl(chrome);
    ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws!.addEventListener("open", () => resolve(), { once: true });
      ws!.addEventListener("error", () => reject(new Error("Chrome DevTools WebSocket bağlantısı kurulamadı.")), {
        once: true,
      });
    });

    ws.addEventListener("message", (event) => {
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return; // Bozuk/parse edilemeyen DevTools frame'ini yok say.
      }
      if (msg.id && pending.has(msg.id)) {
        const item = pending.get(msg.id)!;
        pending.delete(msg.id);
        if (msg.error) item.reject(new Error(msg.error.message || "Chrome DevTools hatası"));
        else item.resolve(msg.result);
      }
    });

    const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => {
      const id = ++messageId;
      ws!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise<any>((resolve, reject) => pending.set(id, { resolve, reject }));
    };

    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);

    // Oturum aktarımı: canlı (auth'lu) sayfayı render ederken Cookie header'ı geçir.
    if (target.cookieHeader) {
      await send("Network.enable", {}, sessionId);
      await send("Network.setExtraHTTPHeaders", { headers: { Cookie: target.cookieHeader } }, sessionId);
    }

    await send("Page.navigate", { url: pageUrl }, sessionId);

    // Page.navigate hemen döner; printToPDF'i erken çağırırsak Chromium boş about:blank
    // sayfasını PDF'e basabiliyor. Gerçek URL ve DOM gelene kadar kısa polling yap.
    const expectedUrl = normalizeUrlForCompare(pageUrl);
    let navigationState: any = null;
    let reachedExpectedPage = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const result = await send(
          "Runtime.evaluate",
          {
            expression: `(() => ({
              href: location.href,
              readyState: document.readyState,
              bodyHtmlLength: document.body ? document.body.innerHTML.length : 0,
              bodyTextLength: document.body ? document.body.innerText.length : 0,
              title: document.title || ""
            }))()`,
            returnByValue: true,
          },
          sessionId,
        );
        navigationState = result?.result?.value ?? null;
        const href = normalizeUrlForCompare(String(navigationState?.href || ""));
        const ready = navigationState?.readyState === "interactive" || navigationState?.readyState === "complete";
        const hasBody = Number(navigationState?.bodyHtmlLength || 0) > 0;
        const isExpectedPage =
          pageUrl.startsWith("file://")
            ? href.startsWith("file://")
            : href === expectedUrl || href.startsWith(`${expectedUrl}?`) || href.startsWith(`${expectedUrl}&`);

        if (isExpectedPage && ready && hasBody) {
          reachedExpectedPage = true;
          break;
        }
      } catch {
        // Navigasyon sırasında execution context değişebilir; bir sonraki denemede toparlar.
      }
      await delay(150);
    }

    if (!navigationState || Number(navigationState.bodyHtmlLength || 0) === 0) {
      throw new Error(
        `PDF sayfası yüklenmeden boş kaldı. url=${pageUrl} state=${JSON.stringify(navigationState)}`,
      );
    }
    if (!reachedExpectedPage) {
      throw new Error(
        `PDF sayfası beklenen adrese ulaşamadı. url=${pageUrl} state=${JSON.stringify(navigationState)}`,
      );
    }

    if (options.readyExpression) {
      const startedAt = Date.now();
      const timeoutMs = options.readyTimeoutMs ?? 30000;
      let lastValue: unknown = null;
      while (Date.now() - startedAt < timeoutMs) {
        try {
          const ready = await send(
            "Runtime.evaluate",
            {
              expression: `Boolean((${options.readyExpression}))`,
              returnByValue: true,
            },
            sessionId,
          );
          lastValue = ready?.result?.value;
          if (lastValue === true) break;
        } catch (error) {
          lastValue = error instanceof Error ? error.message : String(error);
        }
        await delay(250);
      }
      if (lastValue !== true) {
        throw new Error(`PDF sayfası hazır hale gelmedi. url=${pageUrl} ready=${JSON.stringify(lastValue)}`);
      }
    }

    // ───────────────────────────────────────────────────────────
    // Render edilmeden once SAYFA + GORSELLER + FONT yuklenmesini bekle.
    // Sabit delay yerine olay-tabanli bekleme (sabit delay yetmiyorsa
    // PDF imza/seal/karekod gibi gorseller bos kaliyordu).
    // ───────────────────────────────────────────────────────────
    try {
      await send(
        "Runtime.evaluate",
        {
          expression: `(async () => {
            if (document.readyState !== "complete") {
              await new Promise(r => addEventListener("load", r, { once: true }));
            }
            const imgs = Array.from(document.images || []);
            await Promise.all(imgs.map(img =>
              img.complete && img.naturalWidth > 0
                ? null
                : new Promise(r => {
                    const done = () => r();
                    img.addEventListener("load", done, { once: true });
                    img.addEventListener("error", done, { once: true });
                    // Guvenli timeout - bir gorsel yuklenmiyorsa sonsuza dek bekleme
                    setTimeout(done, 5000);
                  })
            ));
            try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (_) {}
          })()`,
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId,
      );
    } catch (err) {
      console.warn("[chromiumPdf] Sayfa/gorsel bekleme atlandi:", err);
    }

    // Olay-tabanli bekleme yapildi; ek buffer (animasyon/transition icin) azaltildi.
    await delay(options.settleMs ?? (target.url ? 250 : 200));

    const result = await send(
      "Page.printToPDF",
      {
        printBackground: options.printBackground ?? true,
        displayHeaderFooter: options.displayHeaderFooter ?? false,
        headerTemplate: options.headerTemplate ?? "",
        footerTemplate: options.footerTemplate ?? "",
        preferCSSPageSize: false,
        paperWidth: options.paperWidth ?? 8.27,
        paperHeight: options.paperHeight ?? 11.69,
        marginTop: options.marginTop ?? 0.4,
        marginBottom: options.marginBottom ?? 0.4,
        marginLeft: options.marginLeft ?? 0.4,
        marginRight: options.marginRight ?? 0.4,
      },
      sessionId,
    );

    return Buffer.from(result.data, "base64");
  } finally {
    ws?.close();
    await closeChromeProcess(chrome);
    await cleanupWorkDir(workDir);
  }
}

// Verilen HTML'i A4 PDF'e dönüştürür. Buffer döner.
export async function renderHtmlToPdf(html: string, options: PdfRenderOptions = {}): Promise<Buffer> {
  return renderTargetToPdf({ html }, options);
}

// Canlı bir URL'i (opsiyonel oturum Cookie'si ile) A4 PDF'e dönüştürür.
// Auth'lu önizleme sayfasını birebir render etmek için kullanılır →
// /public görselleri ve next/font doğal olarak çözülür.
export async function renderUrlToPdf(
  url: string,
  options: PdfRenderOptions & { cookieHeader?: string } = {},
): Promise<Buffer> {
  const { cookieHeader, ...rest } = options;
  return renderTargetToPdf({ url, cookieHeader }, rest);
}
