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
    const variables: Record<string, string> = {
      Urun:                  sv(f.Urun),
      firmaAd:               firmaAd,
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
      pH:                    sv(f.PH),   // template uses {pH}, form uses PH
      Kaynama:               sv(f.Kaynama),
      Erime:                 sv(f.Erime),
      Yogunluk:              sv(f.Yogunluk),
      Viskozite:             sv(f.Viskozite),
      SudaCozunebilirlik:    sv(f.SudaCozunebilirlik),
      DigerCozunebilirlik:   sv(f.DigerCozunebilirlik),
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
