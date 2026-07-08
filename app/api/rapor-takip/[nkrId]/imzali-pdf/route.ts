import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { type NextRequest } from "next/server";
import { loadRaporViewData } from "@/lib/raporViewData";
import { renderUrlToPdf } from "@/lib/chromiumPdf";
import { signPdfBuffer, pdfImzaYapilandirildi } from "@/lib/raporPdfSign";
import { getRaporPdfBaseUrl } from "@/lib/raporPdfBaseUrl";
import { cosmoPool } from "@/lib/db";
import { maybeMergeEk } from "@/lib/raporEkMerge";

const DATA_FORMAT_ALIAS: Record<string, string> = {
  GenelEn: "Genel",
  ChallengeEn: "Challenge",
  DetayRapor: "Genel",
  DetayFormat: "Genel",
};

function isEnglishReport(format: string) {
  return String(format || "").trim().toLocaleLowerCase("tr-TR").endsWith("en");
}

function sanitizeFileNamePart(value: unknown) {
  const cleaned = String(value ?? "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return cleaned.slice(0, 120);
}

function contentDispositionFileName(fileName: string) {
  const asciiFallback = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    || "rapor.pdf";
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

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
    // ECONNRESET retry'ı artık DB pool katmanında (lib/db.ts ResilientRequest).
    const data = await loadRaporViewData(nkrIdNum, DATA_FORMAT_ALIAS[format] ?? format, format);
    if (!data) return Response.json({ error: "Rapor bulunamadı." }, { status: 404 });
    // Onaylı / Yayınlanmış / Arşivlenmiş raporlar imzalı PDF olarak indirilebilir.
    // "Arşiv" = önceden onaylanmış, sonradan arşive alınmış rapor → indirilebilir olmalı.
    const durum = data.onay?.durum;
    if (!data.onay || (durum !== "Onaylandı" && durum !== "Yayınlandı" && durum !== "Arşiv")) {
      return Response.json(
        { error: "Bu rapor henüz onaylanmamış. Önce raporu onaylayın." },
        { status: 409 },
      );
    }

    // Chromium'u canlı önizleme sayfasına yönlendir; oturum cookie'sini aktar.
    const origin = getRaporPdfBaseUrl(request);
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

    // "Diğer" formatında: kayıtlı Ek-1 PDF'i ilk sayfanın arkasına ekle (merge).
    const pool = await cosmoPool;
    const merged = await maybeMergeEk(pool, pdf, nkrIdNum, format);

    // PAdES dijital imza göm (self-signed köprü sertifika) — Ek-1 dahil tüm belgeye.
    const signed = await signPdfBuffer(merged);

    // Dış kod öncelikli — yoksa iç rapor no fallback. "/" karakterleri "-" yapılır.
    const baseKod = (data.onay?.disRaporKodu || data.header.RaporNo || String(nkrIdNum)).replace(/\//g, "-");
    const englishName = sanitizeFileNamePart(data.header.Numune_Adi_En || data.header.Numune_Adi || baseKod);
    const fileName = isEnglishReport(format)
      ? `Eng_${englishName || nkrIdNum}-imzali.pdf`
      : `${baseKod}-imzali.pdf`;
    return new Response(new Uint8Array(signed), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDispositionFileName(fileName),
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
