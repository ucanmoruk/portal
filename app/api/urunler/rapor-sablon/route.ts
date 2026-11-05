export const runtime = "nodejs";
export const maxDuration = 180;

import { renderHtmlToPdf } from "@/lib/chromiumPdf";
import HTMLtoDOCX from "html-to-docx";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise, { cosmoPool } from "@/lib/db";
import { liveReportDocument } from "@/lib/ugdLiveReport";
import { loadLiveReport } from "@/lib/ugdLiveReportStore";
import { enrichUgdFormulaRows } from "@/lib/ugdRegulationLookup";
import { renderUgdReportHtml } from "@/lib/ugdReportHtml";
import { renderUgdReportHtmlEn } from "@/lib/ugdReportHtmlEn";
import { renderUgdReportHtmlCpsr } from "@/lib/ugdReportHtmlCpsr";

type ReportLanguage = "tr" | "en" | "cpsr";
type ReportProfile = "ugd" | "lab";

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

function pickLanguage(value: unknown): ReportLanguage {
  if (value === "cpsr") return "cpsr";
  return value === "en" ? "en" : "tr";
}

function pickProfile(value: unknown): ReportProfile {
  return value === "lab" ? "lab" : "ugd";
}

function reportHeaderCopy(language: ReportLanguage, profile: ReportProfile) {
  const trSubtitleByProfile: Record<ReportProfile, string> = {
    ugd: "(EC) No 1223/2009 Kozmetik Regülasyonu ve 23 Mayıs 2005 tarihli, 25823 sayılı Kozmetik Yönetmeliği uyarınca hazırlanmıştır.",
    lab: "(EC) No 1223/2009 Kozmetik Regülasyonu ve 23 Mayıs 2005 tarihli, 25823 sayılı Kozmetik Yönetmeliği uyarınca hazırlanmıştır.",
  };
  const enSubtitleByProfile: Record<ReportProfile, string> = {
    ugd: "Prepared pursuant to Regulation (EC) No 1223/2009 and the Turkish Cosmetic Regulation published in the Official Gazette No. 25823 on 23 May 2005.",
    lab: "Prepared pursuant to Regulation (EC) No 1223/2009 and the Turkish Cosmetic Regulation published in the Official Gazette No. 25823 on 23 May 2005.",
  };

  if (language === "cpsr") {
    return {
      title: "COSMETIC PRODUCT SAFETY ASSESSMENT",
      subtitle: "It has been prepared According to REGULATION (EC) No 1223/2009 OF THE EUROPEAN PARLIAMENT AND OF THE COUNCIL on Cosmetic Products",
      formVersion: "Form / Version Nr:",
      docxLang: "en-US",
    };
  }

  if (language === "en") {
    return {
      title: "COSMETIC PRODUCT SAFETY ASSESSMENT",
      subtitle: enSubtitleByProfile[profile],
      formVersion: "Form / Version No:",
      docxLang: "en-US",
    };
  }

  return {
    title: "KOZMETİK ÜRÜN GÜVENLİLİK DEĞERLENDİRMESİ",
    subtitle: trSubtitleByProfile[profile],
    formVersion: "Form / Versiyon No:",
    docxLang: "tr-TR",
  };
}

function pdfHeaderTemplate(form: Record<string, unknown>, language: ReportLanguage, profile: ReportProfile) {
  const copy = reportHeaderCopy(language, profile);
  return `
    <div style="box-sizing:border-box;width:100%;margin:0 14mm;padding-bottom:5px;border-bottom:1px solid #1f4788;font-family:Arial,sans-serif;color:#143b6f;">
      <div style="display:flex;justify-content:space-between;gap:12px;width:100%;">
        <div style="min-width:0;">
          <div style="font-size:9.5pt;font-weight:700;letter-spacing:.02em;">${htmlEsc(copy.title)}</div>
          <div style="margin-top:2px;font-size:7.4pt;line-height:1.25;color:#000;">${htmlEsc(copy.subtitle)}</div>
        </div>
        <div style="width:38mm;text-align:right;font-size:7.5pt;color:#000;flex:none;">
          <span>${htmlEsc(copy.formVersion)}</span>
          <strong style="display:block;margin-top:2px;color:#111827;font-size:8.5pt;">${htmlEsc(form.RaporNo) || "—"} / ${htmlEsc(form.Versiyon) || "—"}</strong>
        </div>
      </div>
    </div>`;
}

function wordHeaderTemplate(form: Record<string, unknown>, language: ReportLanguage, profile: ReportProfile) {
  const copy = reportHeaderCopy(language, profile);
  return `
    <div style="width:100%;border-bottom:1px solid #1f4788;padding-bottom:5px;color:#143b6f;">
      <div style="font-size:9.5pt;font-weight:700;">${htmlEsc(copy.title)}</div>
      <div style="margin-top:2px;font-size:7.4pt;line-height:1.25;color:#000;">${htmlEsc(copy.subtitle)}</div>
      <div style="margin-top:2px;text-align:right;font-size:7.5pt;color:#000;">${htmlEsc(copy.formVersion)} <strong style="color:#111827;font-size:8.5pt;">${htmlEsc(form.RaporNo) || "—"} / ${htmlEsc(form.Versiyon) || "—"}</strong></div>
    </div>`;
}

function pdfFooterTemplate() {
  return `
    <div style="box-sizing:border-box;width:100%;padding:0 14mm;text-align:right;font-family:Arial,sans-serif;font-size:8pt;color:#4b5563;">
      <span class="pageNumber"></span> / <span class="totalPages"></span>
    </div>`;
}

function sanitizeDocxHtml(html: string) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { color: #111827; font-size: 9.5pt; line-height: 1.45; }
    h1 { font-size: 25pt; text-align: center; color: #000000; }
    h2 { margin-top: 8px; padding-bottom: 5px; border-bottom: 2px solid #000000; font-size: 14.5pt; color: #000000; }
    h3 { margin-top: 12px; font-size: 9.5pt; color: #ffffff; padding: 5px; background-color: #003366; }
    p { margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; }
    th, td { border: 1px solid #cfd8e3; padding: 5px 6px; vertical-align: top; }
    th { background: #dedede; color: #000000; font-weight: 700; text-align: left; }
    .kv th { width: 40%; }
    .compact { font-size: 8.2pt; }
    .compact th, .compact td { padding: 4px; }
    .num { text-align: right; }
    .ok { color: #166534; font-weight: 700; text-align: center; }
    .warn { color: #b91c1c; font-weight: 700; text-align: center; }
    .danger-row td { background: #fee2e2; border-color: #ef4444; }
    .muted { color: #6b7280; font-style: italic; }
    .note { margin: 10px 0; padding: 9px 11px; background: #f8fafc; border-left: 4px solid #94a3b8; }
    .page-break { page-break-before: always; }
    .image-block { box-sizing: border-box; max-width: 100%; margin: 10px 0; overflow: hidden; text-align: center; }
    .image-block img { width: auto; height: auto; max-width: 100%; max-height: 150mm; display: block; margin: 0 auto; object-fit: contain; border: 1px solid #d1d5db; }
    .image-block figcaption { margin-top: 4px; color: #6b7280; font-size: 8.5pt; }
  </style>
</head>
<body>
${body
  .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "")
  .replace(/\sstyle="[^"]*(?:mso-|page:\s*WordSection1)[^"]*"/gi, "")
  .replace(/font-family\s*:[^;"]*;?/gi, "")
  .replace(/\sonclick="[^"]*"/gi, "")}
</body>
</html>`;
}

async function renderDocx(html: string, form: Record<string, unknown>, language: ReportLanguage, profile: ReportProfile) {
  const docxHtml = sanitizeDocxHtml(html);
  const copy = reportHeaderCopy(language, profile);

  return HTMLtoDOCX(
    docxHtml,
    wordHeaderTemplate(form, language, profile),
    {
      orientation: "portrait",
      pageSize: { width: 11906, height: 16838 },
      margins: {
        top: 1440,
        right: 792,
        bottom: 864,
        left: 792,
        header: 360,
        footer: 360,
      },
      title: safeReportName(form.RaporNo),
      creator: "Root Portal",
      font: "Arial",
      fontSize: 19,
      complexScriptFontSize: 19,
      header: true,
      headerType: "default",
      footer: false,
      table: { row: { cantSplit: true } },
      lang: copy.docxLang,
    },
  );
}

async function getFirmaDetails(firmaId: unknown, profile: ReportProfile) {
  if (!firmaId) return { firmaAd: "", firmaAdres: "", firmaTelefon: "", firmaMail: "" };

  try {
    const pool = await (profile === "lab" ? cosmoPool : poolPromise);
    const firmaRes = await pool.request().input("id", firmaId).query(
      profile === "lab"
        ? "SELECT TOP 1 Firma_Adi AS Ad, Adres, Telefon, Mail AS Email FROM Firma WHERE ID = @id"
        : "SELECT TOP 1 Ad, Adres, Telefon, Email FROM RootTedarikci WHERE ID = @id",
    );
    const firma = firmaRes.recordset[0] ?? {};

    return {
      firmaAd: sv(firma.Ad ?? firma.ad ?? firma.Firma_Adi ?? firma.firma_adi),
      firmaAdres: sv(firma.Adres ?? firma.adres ?? firma.ADRES),
      firmaTelefon: sv(firma.Telefon ?? firma.telefon ?? firma.TELEFON),
      firmaMail: sv(firma.Mail ?? firma.mail ?? firma.Email ?? firma.email),
    };
  } catch (error) {
    console.error("[rapor-sablon] Firma bilgileri okunamadı:", error);
    throw new Error("Firma bilgileri alınamadığı için rapor oluşturulamadı. Lütfen yeniden deneyin.");
  }
}

async function renderPdf(html: string, form: Record<string, unknown>, language: ReportLanguage, profile: ReportProfile) {
  return renderHtmlToPdf(html, {
    printBackground: true, displayHeaderFooter: true,
    headerTemplate: pdfHeaderTemplate(form, language, profile), footerTemplate: pdfFooterTemplate(),
    paperWidth: 8.27, paperHeight: 11.69,
    marginTop: 0.8, marginBottom: 0.45, marginLeft: 0.55, marginRight: 0.55,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  let form: Record<string, unknown>, formulResults: any[], firmaAd: string, bodyLanguage: ReportLanguage, bodyProfile: ReportProfile, editedHtml: string, recordId: number;
  try {
    const b = await request.json();
    form = b.form || {};
    formulResults = b.formulResults || [];
    firmaAd = b.firmaAd || "";
    bodyLanguage = pickLanguage(b.language);
    bodyProfile = pickProfile(b.profile);
    editedHtml = sv(b.editedHtml);
    recordId = Number(b.recordId || form.ID || 0);
  } catch {
    return Response.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  try {
    const searchParams = new URL(request.url).searchParams;
    const format = searchParams.get("format") || "doc";
    const language = pickLanguage(searchParams.get("language") || bodyLanguage);
    const profile = pickProfile(searchParams.get("profile") || bodyProfile);
    const saved = !editedHtml && format !== "html" && Number.isSafeInteger(recordId) && recordId > 0
      ? await loadLiveReport({ source: profile, recordId, language, profile }) : null;
    const snapshotHtml = editedHtml || (saved?.bodyHtml ? liveReportDocument(saved.headHtml, saved.bodyHtml) : "");
    // A saved or explicitly edited report is the final document. Regenerating tables
    // here discards changes to concentrations, supplier details and removed rows.
    if (snapshotHtml) {
      const suffix = language === "cpsr" ? "_CPSR" : language === "en" ? "_EN" : "";
      const name = `${safeReportName(form.RaporNo)}${suffix}`;
      if (format === "html") return new Response(snapshotHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      if (format === "pdf") return new Response(await renderPdf(snapshotHtml, form, language, profile) as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="UGD_Rapor_${name}.pdf"` } });
      const docx = await renderDocx(snapshotHtml, form, language, profile);
      return new Response(docx as unknown as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="UGD_Rapor_${name}.docx"` } });
    }
    const firmaDetails = await getFirmaDetails(form.FirmaID, profile);
    const reportFirmaAd = firmaDetails.firmaAd || sv(firmaAd);
    const enrichedFormulResults = await enrichUgdFormulaRows(formulResults);
    const generatedHtml = (language === "cpsr"
      ? renderUgdReportHtmlCpsr({ form, formulResults: enrichedFormulResults, ...firmaDetails, firmaAd: reportFirmaAd, language, profile })
      : language === "en"
        ? renderUgdReportHtmlEn({ form, formulResults: enrichedFormulResults, ...firmaDetails, firmaAd: reportFirmaAd, language, profile })
        : renderUgdReportHtml({ form, formulResults: enrichedFormulResults, ...firmaDetails, firmaAd: reportFirmaAd, language, profile }));
    const html = generatedHtml;
    const languageSuffix = language === "cpsr" ? "_CPSR" : language === "en" ? "_EN" : "";
    const safeName = `${safeReportName(form.RaporNo)}${languageSuffix}`;

    if (format === "html") {
      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    if (format === "pdf") {
      const pdf = await renderPdf(html, form, language, profile);
      return new Response(pdf as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="UGD_Rapor_${safeName}.pdf"`,
        },
      });
    }

    if (format === "docx" || format === "doc" || format === "word") {
      const wordInput = {
        form,
        formulResults: enrichedFormulResults,
        ...firmaDetails,
        firmaAd: reportFirmaAd,
        profile,
        output: "word" as const,
      };
      const wordHtml = language === "cpsr"
        ? renderUgdReportHtmlCpsr({ ...wordInput, language })
        : language === "en"
          ? renderUgdReportHtmlEn({ ...wordInput, language })
          : renderUgdReportHtml({ ...wordInput, language });
      const docx = await renderDocx(wordHtml, form, language, profile);
      return new Response(docx as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="UGD_Rapor_${safeName}.docx"`,
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
