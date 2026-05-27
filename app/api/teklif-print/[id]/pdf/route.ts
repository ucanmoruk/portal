export const runtime = "nodejs";
export const maxDuration = 60;

import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import chromium from "@sparticuz/chromium";

interface ChromeLaunchConfig {
  executablePath: string;
  args: string[];
}

interface CdpMessage {
  id?: number;
  error?: { message?: string };
  result?: unknown;
}

function commandExists(command: string) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
  return result.status === 0;
}

async function resolveChromeLaunchConfig(): Promise<ChromeLaunchConfig | null> {
  const configured = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
  ].map(item => (item ?? "").trim()).filter(Boolean);

  const platformCandidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
          ];

  const commandCandidates = process.platform === "win32"
    ? ["chrome", "chrome.exe"]
    : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

  for (const candidate of [...configured, ...platformCandidates]) {
    if (path.isAbsolute(candidate) && existsSync(candidate)) return { executablePath: candidate, args: [] };
    if (!path.isAbsolute(candidate) && commandExists(candidate)) return { executablePath: candidate, args: [] };
  }

  for (const candidate of commandCandidates) {
    if (commandExists(candidate)) return { executablePath: candidate, args: [] };
  }

  try {
    chromium.setGraphicsMode = false;
    const executablePath = await chromium.executablePath();
    if (executablePath) return { executablePath, args: chromium.args };
  } catch (error) {
    console.warn("[teklif pdf] Bundled Chromium baslatilamadi:", error);
  }

  return null;
}

function waitForDevtoolsUrl(proc: ChildProcessWithoutNullStreams) {
  return new Promise<string>((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error("Chrome DevTools baglantisi zaman asimina ugradi.")), 10000);
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
      reject(new Error(`Chrome erken kapandi (${code ?? "unknown"})`));
    });
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function closeChromeProcess(chrome: ChildProcessWithoutNullStreams | undefined) {
  if (!chrome || chrome.exitCode !== null || chrome.killed) return;
  chrome.kill("SIGTERM");
  await Promise.race([new Promise<void>(r => chrome!.once("exit", () => r())), delay(900)]);
  if (chrome.exitCode === null && !chrome.killed) {
    chrome.kill("SIGKILL");
    await Promise.race([new Promise<void>(r => chrome!.once("exit", () => r())), delay(500)]);
  }
}

async function cleanupWorkDir(workDir: string) {
  try {
    await rm(workDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY") return;
    throw error;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 401 });

  const { id } = await params;
  const forceDownload = req.nextUrl.searchParams.get("download") === "1";
  const origin = req.nextUrl.origin;
  const reportUrl = `${origin}/teklif-print/${encodeURIComponent(id)}?pdfMode=1`;
  const cookieHeader = req.headers.get("cookie") || "";

  const chromeConfig = await resolveChromeLaunchConfig();
  if (!chromeConfig) {
    return NextResponse.json({ error: "Chrome/Chromium bulunamadi. CHROME_PATH ortam degiskenini ayarlayin." }, { status: 500 });
  }

  const workDir = path.join(os.tmpdir(), `teklif-pdf-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  const profilePath = path.join(workDir, "chrome-profile");

  let chrome: ChildProcessWithoutNullStreams | undefined;
  let ws: WebSocket | undefined;
  let messageId = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();

  try {
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
      ws!.addEventListener("error", () => reject(new Error("DevTools WebSocket kurulamadi.")), { once: true });
    });

    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as CdpMessage;
      if (msg.id && pending.has(msg.id)) {
        const item = pending.get(msg.id)!;
        pending.delete(msg.id);
        if (msg.error) item.reject(new Error(msg.error.message || "CDP hatasi"));
        else item.resolve(msg.result);
      }
    });

    const send = <T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string) => {
      const id = ++messageId;
      ws!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise<T>((resolve, reject) => pending.set(id, {
        resolve: v => resolve(v as T),
        reject,
      }));
    };

    const { targetId } = await send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });

    await send("Network.enable", {}, sessionId);
    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
    await send("Emulation.setEmulatedMedia", { media: "print" }, sessionId);

    if (cookieHeader) {
      const url = new URL(origin);
      const cookies = cookieHeader.split(";").map(c => c.trim()).filter(Boolean).map(c => {
        const eqIndex = c.indexOf("=");
        if (eqIndex === -1) return null;
        return {
          name: c.slice(0, eqIndex).trim(),
          value: c.slice(eqIndex + 1).trim(),
          url: origin,
          path: "/",
          httpOnly: false,
          secure: url.protocol === "https:",
        };
      }).filter(Boolean);
      if (cookies.length > 0) await send("Network.setCookies", { cookies }, sessionId);
    }

    await send("Page.navigate", { url: reportUrl, transitionType: "link" }, sessionId);

    const startedAt = Date.now();
    let lastState = "";
    while (Date.now() - startedAt < 30000) {
      const ready = await send<{ result?: { value?: boolean } }>("Runtime.evaluate", {
        expression: `
          (function() {
            var page = document.querySelector('.quote-print-page');
            if (!page) return false;
            var text = (page.innerText || '').trim();
            return Boolean(text.length > 250 && page.scrollHeight > 500);
          })();
        `,
        returnByValue: true,
      }, sessionId);
      if (ready.result?.value === true) break;

      const state = await send<{ result?: { value?: string } }>("Runtime.evaluate", {
        expression: "document.readyState + ' | ' + (document.body ? document.body.innerText.slice(0, 160) : '')",
        returnByValue: true,
      }, sessionId);
      lastState = state.result?.value || lastState;
      await delay(250);
    }

    const isReady = await send<{ result?: { value?: boolean } }>("Runtime.evaluate", {
      expression: "Boolean(document.querySelector('.quote-print-page'))",
      returnByValue: true,
    }, sessionId);
    if (isReady.result?.value !== true) {
      throw new Error(`Teklif PDF icin hazir hale gelmeden zaman asimi olustu. Son durum: ${lastState}`);
    }

    await send("Runtime.evaluate", {
      expression: `
        Promise.all([
          document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
          new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        ]).then(() => true)
      `,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);

    const pdfResult = await send<{ data: string }>("Page.printToPDF", {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `
        <div style="width:100%;font-family:'JetBrains Mono','Cascadia Mono',Consolas,monospace;font-size:8.5px;color:#6e6e73;padding:0 12mm 4mm 12mm;text-align:right;">
          Sayfa: <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0,
      marginBottom: 0.24,
      marginLeft: 0,
      marginRight: 0,
    }, sessionId);

    const pdf = Buffer.from(pdfResult.data, "base64");
    const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const disposition = forceDownload ? "attachment" : "inline";

    return new Response(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="Teklif-${safeId}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF uretilemedi.";
    console.error("[teklif pdf]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    ws?.close();
    await closeChromeProcess(chrome);
    await cleanupWorkDir(workDir);
  }
}
