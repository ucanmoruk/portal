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
    // Vercel hot Lambda'da MSSQL pool ölü kalabilir → ECONNRESET olursa 1 kez retry.
    let data: Awaited<ReturnType<typeof loadRaporViewData>> = null;
    try {
      data = await loadRaporViewData(nkrIdNum, format);
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "").toLowerCase();
      if (msg.includes("econnreset") || msg.includes("connection lost")) {
        console.log("[imzali-pdf] ECONNRESET, retry…");
        await new Promise(r => setTimeout(r, 300));
        data = await loadRaporViewData(nkrIdNum, format);
      } else {
        throw e;
      }
    }
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

    // Dış kod öncelikli — yoksa iç rapor no fallback. "/" karakterleri "-" yapılır.
    const baseKod = (data.onay?.disRaporKodu || data.header.RaporNo || String(nkrIdNum)).replace(/\//g, "-");
    const fileName = `${baseKod}-imzali.pdf`;
    return new Response(new Uint8Array(signed), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("[imzali-pdf]", e);
    // Hata mesajını yüzeyle çıkar — sertifika/Chromium/cookie/network sorunu net görünsün.
    // (Geçici teşhis modu; hassas detay yoksa kalabilir.)
    const detay =
      typeof e?.message === "string" ? e.message :
      typeof e === "string" ? e : "Bilinmeyen hata";
    return Response.json(
      { error: `İmzalı PDF oluşturulamadı: ${detay.slice(0, 400)}` },
      { status: 500 },
    );
  }
}
