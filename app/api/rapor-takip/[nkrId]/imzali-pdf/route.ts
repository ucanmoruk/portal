import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { loadRaporViewData } from "@/lib/raporViewData";
import { renderUrlToPdf } from "@/lib/chromiumPdf";
import { signPdfBuffer, pdfImzaYapilandirildi } from "@/lib/raporPdfSign";

// GET /api/rapor-takip/[nkrId]/imzali-pdf?format=Genel
// Onaylı raporu sunucuda PDF'e çevirir + dijital imza (PAdES) gömer →
// indirilen PDF "imzalı/korumalı" olur, editlenince imza geçersiz olur.
//
// ÖNEMLI: PDF, CANLI önizleme sayfası (rapor-onay-print) render edilerek üretilir.
// Böylece içerik ekrandakiyle birebir aynıdır (tek kaynak: aynı sayfa + aynı veri).
// Oturum, gelen isteğin Cookie header'ı Chromium'a aktarılarak korunur.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Chromium başlatma + render + imza süre alabilir (rapor-sablon ile aynı limit).
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nkrId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const { nkrId } = await params;
  const nkrIdNum = parseInt(nkrId, 10);
  const format = (request.nextUrl.searchParams.get("format") || "").trim();

  if (!/^\d+$/.test(nkrId) || !Number.isFinite(nkrIdNum) || !format) {
    return Response.json({ error: "Geçersiz rapor / format." }, { status: 400 });
  }

  if (!pdfImzaYapilandirildi()) {
    return Response.json(
      {
        error:
          "PDF imza sertifikası yapılandırılmadı. 'node scripts/gen-imza-cert.mjs' çalıştırıp " +
          "RAPOR_IMZA_P12_BASE64 ve RAPOR_IMZA_P12_PASS ortam değişkenlerini ekleyin.",
      },
      { status: 503 },
    );
  }

  try {
    // Onay durumu kapısı (yalnızca onaylı raporlar imzalı PDF olarak indirilebilir).
    const data = await loadRaporViewData(nkrIdNum, format);
    if (!data) return Response.json({ error: "Rapor bulunamadı." }, { status: 404 });
    // Onaylı VEYA Yayınlanmış raporlar imzalı PDF olarak indirilebilir.
    const durum = data.onay?.durum;
    if (!data.onay || (durum !== "Onaylandı" && durum !== "Yayınlandı")) {
      return Response.json(
        { error: "Bu rapor henüz onaylanmamış. Önce raporu onaylayın." },
        { status: 409 },
      );
    }

    // Chromium'u canlı önizleme sayfasına yönlendir; oturum cookie'sini aktar.
    const origin = request.nextUrl.origin;
    const previewUrl =
      `${origin}/rapor-onay-print/${nkrIdNum}?format=${encodeURIComponent(format)}`;
    const cookieHeader = request.headers.get("cookie") || undefined;

    const pdf = await renderUrlToPdf(previewUrl, {
      cookieHeader,
      printBackground: true,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      settleMs: 1500,
    });

    // PAdES dijital imza göm (self-signed köprü sertifika).
    const signed = await signPdfBuffer(pdf);

    const fileName = `Rapor-${data.header.RaporNo || nkrIdNum}-imzali.pdf`;
    return new Response(new Uint8Array(signed), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    // İç hata detayını (Chrome yolu, DB sürücü mesajı vb.) istemciye sızdırma.
    console.error("[imzali-pdf]", e);
    return Response.json({ error: "İmzalı PDF oluşturulamadı." }, { status: 500 });
  }
}
