export const runtime = "nodejs";
export const maxDuration = 180;

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { getKysDokuman } from "@/lib/kysDokumanStore";
import { getUploadedKysPdf } from "@/lib/kysDokumanPdf";
import { isWordFile } from "@/lib/officePdf";
import { renderUrlToPdf } from "@/lib/chromiumPdf";
import { getRaporPdfBaseUrl } from "@/lib/raporPdfBaseUrl";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] || char));

const formatDate = (value: string | null | undefined) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "-";
};

const downloadFileName = (kod: string, baslik: string, extension: string) => {
  const baseName = `${kod} ${baslik}`.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/\s+/g, " ").trim();
  return `${baseName || "KYS Dokumani"}.${extension}`;
};

const contentDisposition = (fileName: string, disposition: "inline" | "attachment" = "inline") => {
  const asciiFallback = fileName.normalize("NFKD").replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!dokumanYetkileri(user).goruntule) return NextResponse.json({ error: "Görüntüleme yetkiniz yok." }, { status: 403 });
  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) return NextResponse.json({ error: "Geçersiz doküman." }, { status: 400 });
  const doc = await getKysDokuman(documentId);
  if (!doc) return NextResponse.json({ error: "Doküman bulunamadı." }, { status: 404 });
  try {
    const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    if (doc.hasDosya) {
      if (doc.dosyaMimeType !== "application/pdf" && !(doc.tur === "Form" && isWordFile(doc.dosyaMimeType || "", doc.dosyaAdi || ""))) {
        return NextResponse.json({ error: "Bu dosya PDF veya Word formu değil." }, { status: 415 });
      }
      const pdf = await getUploadedKysPdf(doc.id);
      return new Response(new Uint8Array(pdf), { headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": contentDisposition(downloadFileName(doc.kod, doc.baslik, "pdf"), disposition),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      } });
    }
    const logo = await readFile(path.join(process.cwd(), "public", "kys-document-logo.png"));
    const logoData = `data:image/png;base64,${logo.toString("base64")}`;
    const origin = getRaporPdfBaseUrl(req);
    const pageUrl = `${origin}/kys-dokuman-yazdir/${doc.id}?pdfMode=1`;
    const pdf = await renderUrlToPdf(pageUrl, {
      cookieHeader: req.headers.get("cookie") || "",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <style>
          .kys-header-meta { border-spacing:0; font:8pt/1.2 Arial,sans-serif; }
          .kys-header-meta th,.kys-header-meta td {
            height:17px; box-sizing:border-box; text-align:left !important;
            vertical-align:middle !important; font-size:8pt; line-height:1.2;
          }
          .kys-header-meta th { font-weight:700; }
          .kys-header-meta td { font-weight:400; }
        </style>
        <div style="width:100%;padding:0 14mm 2.5mm;font-family:Arial,sans-serif;color:#111827;box-sizing:border-box;">
          <div style="display:grid;grid-template-columns:50mm minmax(0,1fr) max-content;align-items:center;gap:4mm;min-height:29mm;border-bottom:1px solid #9ca3af;">
            <img src="${logoData}" style="display:block;width:48mm;height:auto;object-fit:contain;" />
            <strong style="text-align:center;font-size:17px;line-height:1.22;">${escapeHtml(doc.baslik.toLocaleUpperCase("tr-TR"))}</strong>
            <table class="kys-header-meta" style="width:max-content;border-collapse:collapse;font-size:8pt;line-height:1.2;"><tbody>
              <tr><th style="white-space:nowrap;border:1px solid #9ca3af;padding:2px 5px;text-align:left;vertical-align:middle;background:#f4f6f8;">Doküman No</th><td style="border:1px solid #9ca3af;padding:2px 5px;white-space:nowrap;text-align:left;vertical-align:middle;">${escapeHtml(doc.kod)}</td></tr>
              <tr><th style="white-space:nowrap;border:1px solid #9ca3af;padding:2px 5px;text-align:left;vertical-align:middle;background:#f4f6f8;">Revizyon</th><td style="border:1px solid #9ca3af;padding:2px 5px;white-space:nowrap;text-align:left;vertical-align:middle;">${escapeHtml(doc.revizyonEtiket)}</td></tr>
              <tr><th style="white-space:nowrap;border:1px solid #9ca3af;padding:2px 5px;text-align:left;vertical-align:middle;background:#f4f6f8;">Yürürlük Tarihi</th><td style="border:1px solid #9ca3af;padding:2px 5px;white-space:nowrap;text-align:left;vertical-align:middle;">${formatDate(doc.yururlukTarihi)}</td></tr>
            </tbody></table>
          </div>
        </div>`,
      footerTemplate: `
        <div style="width:100%;padding:2mm 14mm 0;font-family:Arial,sans-serif;font-size:8px;color:#111827;box-sizing:border-box;">
          <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid #9ca3af;padding-top:4px;">
            <span>Sayfa <span class="pageNumber"></span>/<span class="totalPages"></span></span>
            <strong>ELEKTRONİK NÜSHA. BASILMIŞ HALİ KONTROLSÜZ KOPYADIR.</strong>
          </div>
        </div>`,
      paperWidth: 8.27,
      paperHeight: 11.69,
      marginTop: 1.48,
      marginBottom: 0.67,
      marginLeft: 0.55,
      marginRight: 0.55,
      settleMs: 350,
      readyExpression: `document.body && document.body.innerText.length > 200`,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(downloadFileName(doc.kod, doc.baslik, "pdf"), disposition),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[kys dokuman pdf]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF oluşturulamadı." }, { status: 500 });
  }
}
