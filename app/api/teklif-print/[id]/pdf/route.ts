export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { renderUrlToPdf } from "@/lib/chromiumPdf";
import { getRaporPdfBaseUrl } from "@/lib/raporPdfBaseUrl";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Yetkisiz erisim" }, { status: 401 });

  const { id } = await params;
  const forceDownload = req.nextUrl.searchParams.get("download") === "1";
  const origin = getRaporPdfBaseUrl(req);
  const reportUrl = `${origin}/teklif-print/${encodeURIComponent(id)}?pdfMode=1`;
  const cookieHeader = req.headers.get("cookie") || "";

  try {
    const pdf = await renderUrlToPdf(reportUrl, {
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
          var page = document.querySelector('.quote-print-page');
          if (!page) return false;
          var text = (page.innerText || '').trim();
          return Boolean(text.length > 250 && page.scrollHeight > 500);
        })()
      `,
    });

    const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
    const disposition = forceDownload ? "attachment" : "inline";
    return new Response(new Uint8Array(pdf), {
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
  }
}
