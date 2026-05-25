// ─────────────────────────────────────────────────────────────────────────────
// Validasyon Raporu PDF Üretimi
//
// Bu endpoint chromium subprocess'i başlatır, mevcut rapor sayfasını
// (`/laboratuvar/eurolab/validasyon/[id]/rapor?pdfMode=1`) chromium'a açtırır,
// sayfa tamamen render olduktan sonra Page.printToPDF ile PDF üretir.
//
// Bu yaklaşımın avantajı: ValidationReportV2 React komponentinin tüm görsel
// formatı ekrandakiyle birebir aynı şekilde PDF'e yansır — server-side render
// gerektirmez.
//
// Parametreler:
//   ?download=1  → Content-Disposition: attachment (zorla indir)
//   (yoksa)      → Content-Disposition: inline (browser PDF viewer'ında aç)
// ─────────────────────────────────────────────────────────────────────────────

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
        if (executablePath) return { executablePath, args: chromium.args };
    } catch (error) {
        console.warn("[validation pdf] Bundled Chromium başlatılamadı:", error);
    }

    return null;
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
        proc.once("error", (error) => { clearTimeout(timer); reject(error); });
        proc.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Chrome erken kapandı (${code ?? "unknown"})`)); });
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

interface CdpMessage {
    id?: number;
    method?: string;
    params?: Record<string, unknown>;
    error?: { message?: string };
    result?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });

    const { id } = await params;
    const forceDownload = req.nextUrl.searchParams.get("download") === "1";
    const origin = req.nextUrl.origin;
    const reportUrl = `${origin}/laboratuvar/eurolab/validasyon/${encodeURIComponent(id)}/rapor?pdfMode=1`;
    const cookieHeader = req.headers.get("cookie") || "";

    const chromeConfig = await resolveChromeLaunchConfig();
    if (!chromeConfig) {
        return NextResponse.json({ error: "Chrome/Chromium bulunamadı. CHROME_PATH ortam değişkenini ayarlayın." }, { status: 500 });
    }

    const workDir = path.join(os.tmpdir(), `val-pdf-${randomUUID()}`);
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
            ws!.addEventListener("error", () => reject(new Error("DevTools WebSocket kurulamadı.")), { once: true });
        });

        ws.addEventListener("message", (event) => {
            const msg = JSON.parse(String(event.data)) as CdpMessage;
            if (msg.id && pending.has(msg.id)) {
                const item = pending.get(msg.id)!;
                pending.delete(msg.id);
                if (msg.error) item.reject(new Error(msg.error.message || "CDP hatası"));
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

        // Auth cookie'lerini aktar
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
            if (cookies.length > 0) {
                await send("Network.setCookies", { cookies }, sessionId);
            }
        }

        // Rapor sayfasını yükle
        const waitForReportReady = async () => {
            const startedAt = Date.now();
            let lastState = "";
            while (Date.now() - startedAt < 45000) {
                const ready = await send<{ result?: { value?: boolean } }>("Runtime.evaluate", {
                    expression: `
                        (function() {
                            var root = document.querySelector('.vr2-shell, .validation-report-shell');
                            if (!root) return false;
                            var page = document.querySelector('.vr2-page, .report-page');
                            var text = (root.innerText || '').trim();
                            var rect = root.getBoundingClientRect ? root.getBoundingClientRect() : { height: 0 };
                            var height = Math.max(root.scrollHeight || 0, rect.height || 0);
                            return Boolean(page && text.length > 500 && height > 500);
                        })();
                    `,
                    returnByValue: true,
                }, sessionId);
                if (ready.result?.value === true) return;
                const state = await send<{ result?: { value?: string } }>("Runtime.evaluate", {
                    expression: "document.readyState + ' | ' + (document.title || '') + ' | ' + (document.body ? document.body.innerText.slice(0, 180) : '')",
                    returnByValue: true,
                }, sessionId);
                lastState = state.result?.value || lastState;
                await delay(250);
            }
            throw new Error(`Rapor PDF icin hazir hale gelmeden zaman asimi olustu. Son durum: ${lastState}`);
        };

        await send("Page.navigate", { url: reportUrl, transitionType: "link" }, sessionId);

        // Sayfa tamamen yüklensin (data fetch'leri dahil) — sabit bekleme + opsiyonel network idle
        await waitForReportReady();

        // PDF'e basmadan önce dashboard chrome'unu gizle.
        //
        // Yaklaşım:
        //   1. Bulunan tüm <header>, <aside>, <nav> elementlerine agresif inline style
        //      uygula (display: none + off-screen + height: 0). Sadece display: none
        //      bazen yetmiyor — position: sticky / fixed elementler hala etki ediyor.
        //   2. Bir <style> tag enjekte et — CSS module class'larından bağımsız çalışan
        //      yüksek özgüllüklü kurallar.
        //   3. MutationObserver kur — React re-render edip elementi geri eklerse
        //      hemen tekrar gizle.
        await send("Runtime.evaluate", {
            expression: `
                (function() {
                    var HIDE_CSS = 'display:none !important;visibility:hidden !important;position:absolute !important;left:-99999px !important;top:-99999px !important;height:0 !important;min-height:0 !important;width:0 !important;min-width:0 !important;margin:0 !important;padding:0 !important;border:0 !important;overflow:hidden !important;opacity:0 !important;';
                    var SELECTOR = 'header, aside, nav, [role="banner"]';

                    // Yüksek özgüllüklü kuralları head'e enjekte et
                    var style = document.createElement('style');
                    style.id = 'pdf-mode-hide-chrome';
                    style.textContent = 'html body header, html body aside, html body nav, html body [role="banner"] { ' + HIDE_CSS + ' }';
                    document.head.appendChild(style);

                    // Mevcut elementlere agresif inline style
                    function hide(el) {
                        try {
                            el.setAttribute('style', HIDE_CSS);
                            el.setAttribute('aria-hidden', 'true');
                        } catch (e) {}
                    }
                    document.querySelectorAll(SELECTOR).forEach(hide);

                    // React re-render ettiğinde tekrar gizle
                    var observer = new MutationObserver(function(mutations) {
                        mutations.forEach(function(m) {
                            m.addedNodes.forEach(function(node) {
                                if (node.nodeType !== 1) return;
                                if (node.matches && node.matches(SELECTOR)) hide(node);
                                if (node.querySelectorAll) {
                                    node.querySelectorAll(SELECTOR).forEach(hide);
                                }
                            });
                        });
                    });
                    observer.observe(document.body, { childList: true, subtree: true });

                    // Body ve html reset
                    document.documentElement.style.cssText = 'margin:0 !important;padding:0 !important;background:#ffffff !important;';
                    document.body.style.cssText = 'margin:0 !important;padding:0 !important;background:#ffffff !important;';

                    return 'OK ' + document.querySelectorAll(SELECTOR).length;
                })();
            `,
            returnByValue: true,
        }, sessionId);
        // React reconciliation + observer yerleşim süresi
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
        await delay(750);

        const pdfResult = await send<{ data: string }>("Page.printToPDF", {
            printBackground: true,
            preferCSSPageSize: true,
            paperWidth: 8.27,
            paperHeight: 11.69,
            marginTop: 0.47,
            marginBottom: 0.55,
            marginLeft: 0.47,
            marginRight: 0.47,
        }, sessionId);

        const pdf = Buffer.from(pdfResult.data, "base64");
        const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
        const disposition = forceDownload ? "attachment" : "inline";

        return new Response(pdf as unknown as BodyInit, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `${disposition}; filename="Validasyon-${safeId}.pdf"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "PDF üretilemedi.";
        console.error("[validation pdf]", error);
        return NextResponse.json({ error: message }, { status: 500 });
    } finally {
        ws?.close();
        await closeChromeProcess(chrome);
        await cleanupWorkDir(workDir);
    }
}
