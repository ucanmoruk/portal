export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { renderUrlToPdf } from "@/lib/chromiumPdf";
import { getRaporPdfBaseUrl } from "@/lib/raporPdfBaseUrl";
import { cosmoPool } from "@/lib/db";

function downloadFileName(prefix: string, firmaAdi: unknown) {
  const firstWord = String(firmaAdi || "").trim().split(/\s+/)[0] || "Firma";
  const safeWord = firstWord.replace(/[^\p{L}\p{N}_-]+/gu, "_");
  return `${prefix}_${safeWord || "Firma"}.pdf`;
}

function contentDisposition(disposition: string, fileName: string) {
  const ascii = fileName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 401 });

  const { id } = await params;
  const forceDownload = req.nextUrl.searchParams.get("download") === "1";
  const origin = getRaporPdfBaseUrl(req);
  const reportUrl = `${origin}/proforma-print/${encodeURIComponent(id)}?pdfMode=1`;
  const cookieHeader = req.headers.get("cookie") || "";

  try {
    const pool = await cosmoPool;
    const firmaPromise = pool.request().input("ID", Number(id)).query(`
      SELECT TOP 1 ISNULL(f.Firma_Adi, '') AS FirmaAd
      FROM ProformaBaslik p
      LEFT JOIN Firma f ON f.ID=p.FirmaID
      WHERE p.ID=@ID AND p.SilindiMi=0
    `);
    const pdfPromise = renderUrlToPdf(reportUrl, {
      cookieHeader,
      printBackground: true,
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
      settleMs: 700,
      readyTimeoutMs: 30000,
      readyExpression: `
        (function() {
          // ProformaPrintDocument kök sınıfı .prof-root (eski .quote-print-page kaldırıldı).
          var page = document.querySelector('.prof-root') || document.querySelector('.quote-print-page');
          if (!page) return false;
          var text = (page.innerText || '').trim();
          return Boolean(text.length > 250 && page.scrollHeight > 500);
        })()
      `,
    });
    const [pdf, firmaResult] = await Promise.all([pdfPromise, firmaPromise]);

    const fileName = downloadFileName("Proforma", firmaResult.recordset?.[0]?.FirmaAd);
    const disposition = forceDownload ? "attachment" : "inline";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(disposition, fileName),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF uretilemedi.";
    console.error("[proforma pdf]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
