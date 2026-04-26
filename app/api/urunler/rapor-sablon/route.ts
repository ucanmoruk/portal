export const runtime = "nodejs";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import path from "path";
import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

// ── Helpers ──────────────────────────────────────────────────────────────────

function sv(v: unknown, fb = ""): string {
  if (v === null || v === undefined) return fb;
  const s = String(v).trim();
  return s || fb;
}

function calcSED(a: number, c: number, dap: number): number {
  return a * (c / 100) * (dap / 100);
}
function calcMOS(noael: string, sed: number): number | null {
  const n = parseFloat(noael);
  if (!n || !sed) return null;
  return n / sed;
}
function fmtSED(v: number): string {
  if (!v) return "—";
  return v < 0.0001 ? v.toExponential(3) : v.toFixed(5);
}
function fmtMOS(v: number | null): string {
  if (v === null) return "—";
  return v >= 10000 ? ">10000" : v.toFixed(1);
}

// ── EK-1 OOXML builder ───────────────────────────────────────────────────────

const ACCENT = "1F4788";

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmlCell(
  w: number,
  text: string,
  opts: { bold?: boolean; color?: string; bg?: string; center?: boolean } = {}
): string {
  const { bold = false, color = "000000", bg, center = false } = opts;
  const shd = bg ? `<w:shd w:val="clear" w:color="${bg}" w:fill="${bg}"/>` : "";
  const jc = center ? `<w:jc w:val="center"/>` : "";
  const b = bold ? "<w:b/>" : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="2" w:color="CCCCCC"/><w:left w:val="single" w:sz="2" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="2" w:color="CCCCCC"/><w:right w:val="single" w:sz="2" w:color="CCCCCC"/></w:tcBorders>${shd}<w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr><w:p><w:pPr>${jc}</w:pPr><w:r><w:rPr>${b}<w:color w:val="${color}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p></w:tc>`;
}

function todayTr(): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function exposureValue(text: string, label: string): string {
  const line = text
    .split(/\r?\n/)
    .find((item) => item.toLocaleLowerCase("tr-TR").startsWith(label.toLocaleLowerCase("tr-TR")));
  return sv(line?.split(":").slice(1).join(":"));
}

function imageInfo(dataUrl: string): { ext: "png" | "jpg"; contentType: string; data: Buffer } | null {
  const match = sv(dataUrl).match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;
  const ext = match[1].toLowerCase().startsWith("jp") ? "jpg" : "png";
  return {
    ext,
    contentType: ext === "jpg" ? "image/jpeg" : "image/png",
    data: Buffer.from(match[2], "base64"),
  };
}

function ensureImageContentType(zip: PizZip, ext: string, contentType: string) {
  const contentTypesPath = "[Content_Types].xml";
  const contentTypes = zip.file(contentTypesPath)?.asText();
  if (!contentTypes || contentTypes.includes(`Extension="${ext}"`)) return;
  zip.file(
    contentTypesPath,
    contentTypes.replace("</Types>", `<Default Extension="${ext}" ContentType="${contentType}"/></Types>`),
  );
}

function imageDrawingXml(rId: string, name: string) {
  const cx = 4389120;
  const cy = 2468880;
  const docPrId = Math.floor(Math.random() * 1000000) + 1000;
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="${xmlEsc(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${xmlEsc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

function injectSpecialPlaceholders(zip: PizZip, images: Record<string, string>) {
  const relsPath = "word/_rels/document.xml.rels";
  let rels = zip.file(relsPath)?.asText() || `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  let documentXml = zip.file("word/document.xml")!.asText();
  let maxRid = 0;
  for (const match of rels.matchAll(/Id="rId(\d+)"/g)) maxRid = Math.max(maxRid, Number(match[1]));

  documentXml = documentXml.replace(/<w:t[^>]*>__PAGE_BREAK__<\/w:t>/g, '<w:br w:type="page"/>');

  for (const [tag, dataUrl] of Object.entries(images)) {
    const marker = `__IMG_${tag}__`;
    const info = imageInfo(dataUrl);
    if (!info) {
      documentXml = documentXml.replaceAll(marker, "");
      continue;
    }

    const rId = `rId${++maxRid}`;
    const filename = `${tag}.${info.ext}`;
    zip.file(`word/media/${filename}`, info.data);
    ensureImageContentType(zip, info.ext, info.contentType);
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${filename}"/></Relationships>`,
    );
    documentXml = documentXml.replace(new RegExp(`<w:t[^>]*>${marker}</w:t>`, "g"), imageDrawingXml(rId, filename));
  }

  zip.file("word/document.xml", documentXml);
  zip.file(relsPath, rels);
}

function buildEK1Xml(formulResults: any[], a: number): string {
  // Column widths (total 9638 twips)
  const cols = [1900, 1100, 700, 1600, 1100, 550, 850, 800, 1038];
  const headers = [
    "INCI Adı / Bileşen", "CAS No", "EC No",
    "Fonksiyon", "Yönetmelik", "C (%)", "SED", "MoS", "Değerlendirme",
  ];

  const gridCols = cols.map(w => `<w:gridCol w:w="${w}"/>`).join("");

  const headerRow =
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
    headers.map((h, i) => xmlCell(cols[i], h, { bold: true, color: "FFFFFF", bg: ACCENT, center: true })).join("") +
    `</w:tr>`;

  const dataRows = formulResults.map((row: any, idx: number) => {
    const c = parseFloat(sv(row.inputAmount ?? row.miktar, "0").replace(",", ".")) || 0;
    const dap = typeof row.dap === "number" ? row.dap : parseFloat(sv(row.dap, "100")) || 100;
    const sed = calcSED(a, c, dap);
    const mos = calcMOS(sv(row.noael), sed);
    const evaluated = row.matched ? "UYGUN" : "KONTROL EDİNİZ";
    const evalColor = row.matched ? "1A7340" : "C0392B";
    const bg = idx % 2 !== 0 ? "F7F9FC" : "";

    return (
      `<w:tr>` +
      xmlCell(cols[0], sv(row.INCIName ?? row.inputName), { bg }) +
      xmlCell(cols[1], sv(row.Cas), { bg }) +
      xmlCell(cols[2], sv(row.Ec), { bg, center: true }) +
      xmlCell(cols[3], sv(row.Functions), { bg }) +
      xmlCell(cols[4], sv(row.Regulation), { bg, center: true }) +
      xmlCell(cols[5], c ? String(c) : "—", { bg, center: true }) +
      xmlCell(cols[6], fmtSED(sed), { bg, center: true }) +
      xmlCell(cols[7], fmtMOS(mos), { bg, center: true }) +
      xmlCell(cols[8], evaluated, { bold: true, color: evalColor, bg, center: true }) +
      `</w:tr>`
    );
  });

  const sectionHeading =
    `<w:p><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>` +
    `<w:r><w:rPr><w:b/><w:color w:val="${ACCENT}"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>` +
    `<w:t>EK-1: Formülasyon ve Toksikoloji Tablosu</w:t></w:r></w:p>`;

  const table =
    `<w:tbl>` +
    `<w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblLook w:val="04A0"/></w:tblPr>` +
    `<w:tblGrid>${gridCols}</w:tblGrid>` +
    headerRow +
    dataRows.join("") +
    `</w:tbl>`;

  return sectionHeading + table;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz" }, { status: 401 });

  let form: any, formulResults: any[], firmaAd: string;
  try {
    const b = await request.json();
    form = b.form || {};
    formulResults = b.formulResults || [];
    firmaAd = b.firmaAd || "";
  } catch {
    return Response.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  try {
    const f = form;

    // ── Firma adres/telefon/mail ─────────────────────────────────────────────
    let firmaAdres = "", firmaTelefon = "", firmaMail = "";
    if (f.FirmaID) {
      try {
        const pool = await poolPromise;
        const firmaRes = await pool
          .request()
          .input("id", f.FirmaID)
          .query("SELECT TOP 1 * FROM RootTedarikci WHERE ID = @id");
        const firma = firmaRes.recordset[0] ?? {};
        firmaAdres   = sv(firma.Adres   ?? firma.adres   ?? firma.ADRES);
        firmaTelefon = sv(firma.Telefon ?? firma.telefon ?? firma.TELEFON);
        firmaMail    = sv(firma.Mail    ?? firma.mail    ?? firma.Email ?? firma.email);
      } catch {
        // Columns may not exist — continue with empty strings
      }
    }

    // ── Template variables ───────────────────────────────────────────────────
    const maruziyet = sv(f.MaruziyetAciklama);
    const variables: Record<string, string> = {
      Urun:                  sv(f.Urun),
      firmaAd:               firmaAd,
      RaporNo:               sv(f.RaporNo),
      Versiyon:              sv(f.Versiyon),
      Barkod:                sv(f.Barkod),
      Miktar:                sv(f.Miktar),
      Tip1:                  sv(f.Tip1),
      Uygulama:              sv(f.Uygulama),
      Hedef:                 sv(f.Hedef),
      firmaAdres:            firmaAdres,
      firmaTelefon:          firmaTelefon,
      firmaMail:             firmaMail,
      Gorunum:               sv(f.Gorunum),
      Renk:                  sv(f.Renk),
      Koku:                  sv(f.Koku),
      pH:                    sv(f.PH),
      Kaynama:               sv(f.Kaynama),
      Erime:                 sv(f.Erime),
      Yogunluk:              sv(f.Yogunluk),
      Viskozite:             sv(f.Viskozite),
      SudaCozunebilirlik:    sv(f.SudaCozunebilirlik),
      DigerCozunebilirlik:   sv(f.DigerCozunebilirlik),
      stabilitenot:          sv(f.Stabilite),
      challengenot:          sv(f.KoruyucuEtkinlik),
      mikroaciklama:         sv(f.Mikrobiyoloji),
      stabilitefoto:         sv(f.StabiliteGorsel) ? "__IMG_stabilitefoto__" : "",
      challengefoto:         sv(f.KoruyucuEtkinlikGorsel) ? "__IMG_challengefoto__" : "",
      mikrofoto:             sv(f.MikrobiyolojiGorsel) ? "__IMG_mikrofoto__" : "",
      ["kullan\u0131m"]:     sv(f.Kullanim),
      kullanim:              sv(f.Kullanim),
      uyarilar:              sv(f.Uyarilar),
      kutufoto:              sv(f.EtiketGorsel) ? "__IMG_kutufoto__" : "",
      uruntipi:              sv(f.Tip1),
      uygulamayeri:          sv(f.Uygulama),
      uygulamaalani:         exposureValue(maruziyet, "Uygulanan \u00fcr\u00fcn\u00fcn deriye temas etti\u011fi alan"),
      uygulamamiktari:       exposureValue(maruziyet, "Uygulanan \u00fcr\u00fcn\u00fcn miktar\u0131"),
      ["temass\u00fcre"]:    exposureValue(maruziyet, "Temas s\u00fcresi ve uygulama s\u0131kl\u0131\u011f\u0131"),
      temassure:             exposureValue(maruziyet, "Temas s\u00fcresi ve uygulama s\u0131kl\u0131\u011f\u0131"),
      hedefkisi:             sv(f.Hedef),
      Adegeri:               sv(f.A),
      AdSoyad:               sv(f.SorumluAd),
      Adres:                 sv(f.SorumluAdres),
      yeterlilikkanit:       sv(f.SorumluKanit),
      today:                 todayTr(),
      PageBreak:             "__PAGE_BREAK__",
    };

    // ── Load & render template ───────────────────────────────────────────────
    const sablonPath = path.join(process.cwd(), "sablon", "UGDR_Sablon.docx");
    const content = fs.readFileSync(sablonPath);
    const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
    });

    doc.render(variables);

    // ── Inject EK-1 formula table ────────────────────────────────────────────
    const aVal = parseFloat(sv(f.A, "0").replace(",", ".")) || 0;
    const renderedZip = doc.getZip();

    if (formulResults.length > 0) {
      const docXmlStr = renderedZip.file("word/document.xml")!.asText();
      const ek1Xml = buildEK1Xml(formulResults, aVal);
      // Inject just before </w:body>
      const injected = docXmlStr.replace("</w:body>", ek1Xml + "</w:body>");
      renderedZip.file("word/document.xml", injected);
    }

    // ── Emit buffer ──────────────────────────────────────────────────────────
    injectSpecialPlaceholders(renderedZip, {
      stabilitefoto: sv(f.StabiliteGorsel),
      challengefoto: sv(f.KoruyucuEtkinlikGorsel),
      mikrofoto: sv(f.MikrobiyolojiGorsel),
      kutufoto: sv(f.EtiketGorsel),
    });

    const buf = renderedZip.generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    }) as Buffer;

    const safeName = sv(f.RaporNo, "rapor").replace(/[^a-zA-Z0-9_\-]/g, "_");
    const filename = `UGD_Rapor_${safeName}.docx`;

    return new Response(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    console.error("[rapor-sablon]", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
