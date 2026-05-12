export const runtime = "nodejs";
export const maxDuration = 60;

import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { enrichUgdFormulaRows } from "@/lib/ugdRegulationLookup";
import { renderUgdReportHtml } from "@/lib/ugdReportHtml";

function sv(v: unknown, fb = ""): string {
  if (v === null || v === undefined) return fb;
  const s = String(v).trim();
  return s || fb;
}

function safeReportName(value: unknown) {
  return sv(value, "rapor").replace(/[^a-zA-Z0-9_\-]/g, "_");
}

function htmlEsc(v: unknown) {
  return sv(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pdfHeaderTemplate(form: Record<string, unknown>) {
  return `
    <div style="box-sizing:border-box;width:100%;margin:0 14mm;padding-bottom:5px;border-bottom:1px solid #1f4788;font-family:Arial,sans-serif;color:#143b6f;">
      <div style="display:flex;justify-content:space-between;gap:12px;width:100%;">
        <div style="min-width:0;">
          <div style="font-size:9.5pt;font-weight:700;letter-spacing:.02em;">KOZMETİK ÜRÜN GÜVENLİLİK DEĞERLENDİRMESİ</div>
          <div style="margin-top:2px;font-size:7.4pt;line-height:1.25;color:#000;">(EC) No 1223/2009 Kozmetik Regülasyonu ve 23 Mayıs 2005 tarihli, 25823 sayılı Kozmetik Yönetmeliği uyarınca hazırlanmıştır.</div>
        </div>
        <div style="width:38mm;text-align:right;font-size:7.5pt;color:#000;flex:none;">
          <span>Form / Versiyon No:</span>
          <strong style="display:block;margin-top:2px;color:#111827;font-size:8.5pt;">${htmlEsc(form.RaporNo) || "—"} / ${htmlEsc(form.Versiyon) || "—"}</strong>
        </div>
      </div>
    </div>`;
}

function commandExists(command: string) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], {
    stdio: "ignore",
  });
  return result.status === 0;
}

interface ChromeLaunchConfig {
  executablePath: string;
  args: string[];
}

async function resolveChromeLaunchConfig(): Promise<ChromeLaunchConfig | null> {
  const configured = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
  ].map((item) => sv(item)).filter(Boolean);

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
    if (executablePath) {
      return {
        executablePath,
        args: chromium.args,
      };
    }
  } catch (error) {
    console.warn("[rapor-sablon] Bundled Chromium başlatılamadı:", error);
  }

  return null;
}

async function getFirmaDetails(firmaId: unknown) {
  if (!firmaId) return { firmaAdres: "", firmaTelefon: "", firmaMail: "" };

  try {
    const pool = await poolPromise;
    const firmaRes = await pool
      .request()
      .input("id", firmaId)
      .query("SELECT TOP 1 * FROM RootTedarikci WHERE ID = @id");
    const firma = firmaRes.recordset[0] ?? {};

    return {
      firmaAdres: sv(firma.Adres ?? firma.adres ?? firma.ADRES),
      firmaTelefon: sv(firma.Telefon ?? firma.telefon ?? firma.TELEFON),
      firmaMail: sv(firma.Mail ?? firma.mail ?? firma.Email ?? firma.email),
    };
  } catch {
    return { firmaAdres: "", firmaTelefon: "", firmaMail: "" };
  }
}

function waitForDevtoolsUrl(proc: ChildProcessWithoutNullStreams) {
  return new Promise<string>((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error("Chrome DevTools bağlantısı zaman aşımına uğradı.")), 10000);

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
      reject(new Error(`Chrome PDF işlemi erken kapandı (${code ?? "unknown"}).`));
    });
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function closeChromeProcess(chrome: ChildProcessWithoutNullStreams | undefined) {
  if (!chrome || chrome.exitCode !== null || chrome.killed) return;

  chrome.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => chrome!.once("exit", () => resolve())),
    delay(900),
  ]);

  if (chrome.exitCode === null && !chrome.killed) {
    chrome.kill("SIGKILL");
    await Promise.race([
      new Promise<void>((resolve) => chrome!.once("exit", () => resolve())),
      delay(500),
    ]);
  }
}

async function cleanupWorkDir(workDir: string) {
  try {
    await rm(workDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  } catch (error: any) {
    if (error?.code === "EBUSY" || error?.code === "EPERM" || error?.code === "ENOTEMPTY") {
      console.warn("[rapor-sablon] Geçici Chrome klasörü şu an kilitli, rapor oluşturma başarısız sayılmadı:", error.message);
      return;
    }
    throw error;
  }
}

async function renderPdf(html: string, form: Record<string, unknown>) {
  const chromeConfig = await resolveChromeLaunchConfig();
  if (!chromeConfig) {
    throw new Error("PDF oluşturmak için Chrome/Chromium bulunamadı. Vercel için bundled Chromium veya CHROME_PATH/CHROME_EXECUTABLE_PATH ortam değişkeni gerekli.");
  }

  const workDir = path.join(os.tmpdir(), `ugd-report-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const htmlPath = path.join(workDir, "report.html");
  const profilePath = path.join(workDir, "chrome-profile");
  let chrome: ChildProcessWithoutNullStreams | undefined;
  let ws: WebSocket | undefined;
  let messageId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();

  try {
    await writeFile(htmlPath, html, "utf8");
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
      ws!.addEventListener("error", () => reject(new Error("Chrome DevTools WebSocket bağlantısı kurulamadı.")), { once: true });
    });

    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
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

    const pageUrl = `file://${htmlPath}`;
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    await send("Page.navigate", { url: pageUrl }, sessionId);
    await new Promise((resolve) => setTimeout(resolve, 750));

    const result = await send("Page.printToPDF", {
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: pdfHeaderTemplate(form),
      footerTemplate: "<div></div>",
      preferCSSPageSize: false,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 0.8,
      marginBottom: 0.45,
      marginLeft: 0.55,
      marginRight: 0.55,
    }, sessionId);

    return Buffer.from(result.data, "base64");
  } finally {
    ws?.close();
    await closeChromeProcess(chrome);
    await cleanupWorkDir(workDir);
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  let form: Record<string, unknown>, formulResults: any[], firmaAd: string;
  try {
    const b = await request.json();
    form = b.form || {};
    formulResults = b.formulResults || [];
    firmaAd = b.firmaAd || "";
  } catch {
    return Response.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  try {
    const format = new URL(request.url).searchParams.get("format") || "doc";
    const firmaDetails = await getFirmaDetails(form.FirmaID);
    const enrichedFormulResults = await enrichUgdFormulaRows(formulResults);
    const html = renderUgdReportHtml({ form, formulResults: enrichedFormulResults, firmaAd, ...firmaDetails });
    const safeName = safeReportName(form.RaporNo);

    if (format === "html") {
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    if (format === "pdf") {
      const pdf = await renderPdf(html, form);
      return new Response(pdf as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="UGD_Rapor_${safeName}.pdf"`,
        },
      });
    }

    return new Response(Buffer.from(`\ufeff${html}`, "utf8") as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/msword; charset=utf-8",
        "Content-Disposition": `attachment; filename="UGD_Rapor_${safeName}.doc"`,
      },
    });
  } catch (e: any) {
    console.error("[rapor-sablon]", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
