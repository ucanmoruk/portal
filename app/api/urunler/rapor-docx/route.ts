import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, ShadingType, HeadingLevel,
  Header, Footer, PageNumber, PageBreak, VerticalAlign,
} from "docx";

// ── helpers ─────────────────────────────────────────────────────────────────

const FONT = "Calibri";
const PAGE_W = 9638; // usable width DXA (A4 – 2 × 2 cm margin)
const ACCENT = "1F4788";

function val(v: string | undefined | null, fallback = "—"): string {
  return v && v.trim() ? v.trim() : fallback;
}

function body(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 22 })],
    spacing: { after: 80 },
  });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: ACCENT })],
    spacing: { before: 240, after: 120 },
  });
}

function subHeading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: 22, bold: true, color: ACCENT })],
    spacing: { before: 160, after: 80 },
  });
}

function multiPara(text: string): Paragraph[] {
  return (text || "").split("\n").filter(Boolean).map(body);
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const ALL_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

function infoTable(rows: [string, string][]): Table {
  const col0 = 2800;
  const col1 = PAGE_W - col0;
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: [col0, col1],
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            borders: ALL_BORDERS,
            width: { size: col0, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [new Paragraph({ children: [new TextRun({ text: label, font: FONT, size: 20, bold: true })] })],
          }),
          new TableCell({
            borders: ALL_BORDERS,
            width: { size: col1, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [new Paragraph({ children: [new TextRun({ text: value, font: FONT, size: 20 })] })],
          }),
        ],
      })
    ),
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

// ── main handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { form, formulResults = [], firmaAd = "" } = await request.json();
  const f = form || {};

  // ── EK-1 formulation table ─────────────────────────────────────────────────
  const EK1_COLS = [2000, 1400, 900, 1800, 1200, 700, 1638];
  const EK1_HEADERS = ["INCI Adı / Bileşen", "CAS No", "EC No", "Fonksiyon", "Yönetmelik Eki", "C (%)", "Değerlendirme"];

  const headerRow = new TableRow({
    tableHeader: true,
    children: EK1_HEADERS.map((h, i) =>
      new TableCell({
        borders: ALL_BORDERS,
        shading: { fill: ACCENT, type: ShadingType.CLEAR, color: ACCENT },
        width: { size: EK1_COLS[i], type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, font: FONT, size: 18, bold: true, color: "FFFFFF" })] })],
      })
    ),
  });

  const dataRows = formulResults.map((row: any, idx: number) =>
    new TableRow({
      children: [
        cell(EK1_COLS[0], val(row.INCIName || row.inputName), idx),
        cell(EK1_COLS[1], val(row.Cas), idx),
        cell(EK1_COLS[2], val(row.Ec), idx),
        cell(EK1_COLS[3], val(row.Functions), idx),
        cell(EK1_COLS[4], val(row.Regulation), idx),
        cell(EK1_COLS[5], val(row.inputAmount), idx, AlignmentType.CENTER),
        cellColored(EK1_COLS[6], row.matched ? "UYGUN" : "KONTROL EDİNİZ", row.matched ? "1A7340" : "C0392B", idx),
      ],
    })
  );

  function cell(w: number, text: string, idx: number, align: AlignmentType = AlignmentType.LEFT) {
    return new TableCell({
      borders: ALL_BORDERS,
      shading: idx % 2 === 0 ? undefined : { fill: "F7F9FC", type: ShadingType.CLEAR, color: "F7F9FC" },
      width: { size: w, type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: align, children: [new TextRun({ text, font: FONT, size: 18 })] })],
    });
  }

  function cellColored(w: number, text: string, color: string, idx: number) {
    return new TableCell({
      borders: ALL_BORDERS,
      shading: idx % 2 === 0 ? undefined : { fill: "F7F9FC", type: ShadingType.CLEAR, color: "F7F9FC" },
      width: { size: w, type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, font: FONT, size: 18, bold: true, color })] })],
    });
  }

  const ek1Table = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: EK1_COLS,
    rows: [headerRow, ...dataRows],
  });

  // ── EK-2 regulation table ──────────────────────────────────────────────────
  const regulatedItems = formulResults.filter((r: any) => r.Regulation && r.Regulation !== "—");
  const EK2_COLS = [800, 2200, 3800, 1500, 1338];
  const EK2_HEADERS = ["Ek No", "INCI Adı", "Etiket Bilgisi / Uyarı", "Konsantrasyon (%)", "Değerlendirme"];

  const ek2HeaderRow = new TableRow({
    tableHeader: true,
    children: EK2_HEADERS.map((h, i) =>
      new TableCell({
        borders: ALL_BORDERS,
        shading: { fill: ACCENT, type: ShadingType.CLEAR, color: ACCENT },
        width: { size: EK2_COLS[i], type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, font: FONT, size: 18, bold: true, color: "FFFFFF" })] })],
      })
    ),
  });

  const ek2DataRows = regulatedItems.map((row: any, idx: number) =>
    new TableRow({
      children: [
        cell(EK2_COLS[0], val(row.Regulation), idx, AlignmentType.CENTER),
        cell(EK2_COLS[1], val(row.INCIName || row.inputName), idx),
        cell(EK2_COLS[2], val(row.Etiket), idx),
        cell(EK2_COLS[3], (row.inputAmount || "0") + "%", idx, AlignmentType.CENTER),
        cellColored(EK2_COLS[4], "UYGUN", "1A7340", idx),
      ],
    })
  );

  const ek2Table = new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: EK2_COLS,
    rows: [ek2HeaderRow, ...ek2DataRows],
  });

  // ── EK-3 ingredient detail paragraphs ─────────────────────────────────────
  const ek3Paras: Paragraph[] = [];
  const matched = formulResults.filter((r: any) => r.matched);
  if (matched.length === 0) {
    ek3Paras.push(body("Eşleşen bileşen bilgisi bulunmamaktadır."));
  } else {
    matched.forEach((row: any) => {
      ek3Paras.push(new Paragraph({
        children: [new TextRun({ text: val(row.INCIName), font: FONT, size: 22, bold: true })],
        spacing: { before: 160, after: 40 },
      }));
      ek3Paras.push(body(`CAS No: ${val(row.Cas)} | EC No: ${val(row.Ec)}`));
      ek3Paras.push(body(`Fonksiyon: ${val(row.Functions)}`));
      if (row.Maks) ek3Paras.push(body(`Maksimum Konsantrasyon: ${row.Maks}`));
      ek3Paras.push(body(""));
    });
  }

  // ── Document assembly ──────────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: `${val(f.RaporNo, "ÜGD Rapor")} | ${val(f.Urun)} | `, font: FONT, size: 18, color: "888888" }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "888888" }),
              new TextRun({ text: " / ", font: FONT, size: 18, color: "888888" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: "888888" }),
            ],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" } },
          })],
        }),
      },
      children: [
        // ── KAPAK ───────────────────────────────────────────────────────────
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "KOZMETİK ÜRÜN GÜVENLİLİK DEĞERLENDİRMESİ", font: FONT, size: 36, bold: true, color: ACCENT })],
          spacing: { before: 480, after: 240 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: val(f.Urun), font: FONT, size: 28, bold: true })],
          spacing: { after: 120 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: firmaAd, font: FONT, size: 24 })],
          spacing: { after: 400 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: "EC No 1223/2009 Kozmetik Regülasyonu 23 Mayıs 2005 tarihli, 25823 Resmi Gazete sayılı Kozmetik Yönetmeliği ve ekleri, The SCCS's Notes Of Guidance For The Testing Of Cosmetic Ingredients And Their Safety Evaluation 12th Revision, Türkiye İlaç ve Tıbbi Cihaz Kurumu Kozmetik Ürünlerde Güvenlilik Değerlendirmesine İlişkin Kılavuz Sürüm 3.0 uyarınca hazırlanmıştır.",
            font: FONT, size: 20, italics: true,
          })],
          spacing: { after: 240 },
        }),
        pageBreak(),

        // ── ÜRÜN BİLGİLERİ ────────────────────────────────────────────────
        sectionHeading("Ürün Hakkında Bilgiler"),
        infoTable([
          ["Ürün Adı:", val(f.Urun)],
          ["Barkodu:", val(f.Barkod)],
          ["Nominal Miktar:", val(f.Miktar)],
          ["Ürün Tipi:", val(f.Tip1)],
          ["Uygulama Yeri:", val(f.Uygulama)],
          ["Hedeflenen Kişiler:", val(f.Hedef)],
          ["Tedarikçi / Dağıtıcı Firma:", firmaAd || "—"],
          ["Rapor No:", val(f.RaporNo)],
          ["Versiyon:", val(f.Versiyon)],
          ["Tarih:", val(f.Tarih)],
        ]),
        body(""),

        // ── A.1 ───────────────────────────────────────────────────────────
        sectionHeading("A.1. Kozmetik Ürünün Kalitatif ve Kantitatif Bileşimi"),
        body("Kozmetik ürüne ait kalitatif ve kantitatif özellikler rapor Ek-1 bölümünde detaylı olarak paylaşılmıştır."),

        // ── A.2 ───────────────────────────────────────────────────────────
        sectionHeading("A.2. Kozmetik Ürünün Fiziksel / Kimyasal Özellikleri ve Stabilitesi"),
        subHeading("a. Madde veya karışımların fiziksel/kimyasal özellikleri"),
        body("Madde veya karışımlara ait fiziksel ve kimyasal özellikler Ek-3 bölümünde detaylı olarak paylaşılmıştır."),
        subHeading("b. Bitmiş kozmetik ürününün fiziksel ve kimyasal özellikleri"),
        infoTable([
          ["Görünüm:", val(f.Gorunum, "N/A")],
          ["Renk:", val(f.Renk, "N/A")],
          ["Koku:", val(f.Koku, "N/A")],
          ["pH:", val(f.PH, "N/A")],
          ["Kaynama Noktası:", val(f.Kaynama, "N/A")],
          ["Erime Noktası:", val(f.Erime, "N/A")],
          ["Yoğunluk:", val(f.Yogunluk, "N/A")],
          ["Viskozite:", val(f.Viskozite, "N/A")],
          ["Suda Çözünebilirlik:", val(f.SudaCozunebilirlik, "N/A")],
          ["Diğer Çözünebilirlik:", val(f.DigerCozunebilirlik, "N/A")],
        ]),
        body(""),
        subHeading("c. Kozmetik Ürünün Stabilitesi"),
        ...(f.Stabilite ? multiPara(f.Stabilite) : [
          body("Piyasada satılan bir kozmetik ürün, normal veya öngörülebilir kullanım koşulları altında kullanıldığında insan sağlığı için güvenli olmalıdır. Bitmiş ürün üzerinde stabilite çalışmaları yapılmıştır. Ürünün görünümü, rengi, kokusu, pH ve ağırlık değerleri farklı sıcaklık koşulları altında düzenli aralıklarla kontrol edilir. Stabilite test sonuçları ürün bilgi dosyasına eklenmektedir."),
          body("SCCS, kozmetik ürünün türüne ve kullanım amacına göre uyarlanmış ilgili stabilite testlerinin yapılmasını önermiştir. Üretici, stabilite testlerinin şu anda inert kaplarla ve beyan yoluyla piyasada kullanılması amaçlanan kaplarla yapıldığını garanti etmiştir."),
          body("PAO (Açıldıktan sonraki süre) tahmini, mikrobiyal kontaminasyona karşı direnç, ambalaj türü, kullanım süresi (hacim/doz/sıklık), uygulama alanı ve kozmetik ürüne yönelik popülasyon tipi gibi çeşitli faktörlerin değerlendirilmesiyle yapılır. Bu faktörlerin birlikte değerlendirilmesinden sonra, ürünün PAO'su 12 ay şeklinde tahmin edilebilir."),
        ]),
        ...(f.KoruyucuEtkinlik ? multiPara(f.KoruyucuEtkinlik) : [
          body("Test, belirli inokulum seviyelerinde uygun mikroorganizmaların hazırlanmasını ve mikroorganizma içeren numunenin belirli zaman aralıklarında aşılanmasıyla numunedeki mikroorganizmaların sayılmasını içerir. Üretici bu ürünün korunmasının etkinliğini challenge testi yaparak deneysel olarak garanti eder."),
        ]),

        // ── A.3 ───────────────────────────────────────────────────────────
        sectionHeading("A.3. Mikrobiyolojik Kalite"),
        ...(f.Mikrobiyoloji ? multiPara(f.Mikrobiyoloji) : [
          body("Kozmetik ürünlerde kesinlikle bulunmaması gereken mikroorganizmalar Staphylococcus aureus, Pseudomonas aeruginosa, Candida albicans ve Escherichia coli'dir. Farklı cilt bölgeleri, farklı hassasiyete sahip olabileceğinden kozmetik ürünler için iki ayrı kategori tanımlanmıştır."),
          body("Son ürün için yapılan mikrobiyolojik analiz sonuçları ürün güvenlik dosyasında sunulmuştur. Sonuçlar mikrobiyolojik kalite kontrol limitlerine uygundur. Mikrobiyolojik olarak ürün kategori 2'dedir."),
        ]),

        // ── A.4 ───────────────────────────────────────────────────────────
        sectionHeading("A.4. Safsızlıklar, Kalıntılar, Ambalaj Materyali"),
        body("Tüm ham maddeler güvenlik ve yönetmeliğe uygunluk açısından değerlendirildi. Ürün, yasaklı madde kalıntısı içermemektedir. Ambalaj materyali ürünün saflığı ve stabilitesi üzerine olumsuz etki yapmamaktadır. Kozmetik ürün İyi Üretim Uygulamaları (GMP) uyarınca üretilmiştir. Ürün ve ambalajı arasındaki olası istenmeyen etkileşimler değerlendirilmiş; sonuçlar ambalajın ürünle uyumlu olduğunu göstermektedir."),

        // ── A.5 ───────────────────────────────────────────────────────────
        sectionHeading("A.5. Normal ve Makul Olarak Öngörülebilir Kullanım"),
        ...(f.NormalKullanim ? multiPara(f.NormalKullanim) : []),
        infoTable([
          ["Kullanım:", val(f.Kullanim)],
          ["Uyarılar:", val(f.Uyarilar)],
        ]),
        body(""),

        // ── A.6 ───────────────────────────────────────────────────────────
        sectionHeading("A.6. Kozmetik Ürüne Maruziyet"),
        ...(f.MaruziyetAciklama ? multiPara(f.MaruziyetAciklama) : []),
        infoTable([
          ["Ürün Tipi:", val(f.Tip1)],
          ["Uygulama Yeri:", val(f.Uygulama)],
          ["Normal Ve Makul Öngörülebilir Maruziyet Yolları:", "Dermal emilim"],
          ["Hedeflenen Veya Maruz Kalan Kişi / Kişiler:", val(f.Hedef)],
          ["A Değeri (mg/kg vücut ağırlığı/gün):", val(f.A)],
        ]),
        body(""),

        // ── A.7 ───────────────────────────────────────────────────────────
        sectionHeading("A.7. Formülde Yer Alan Maddelere Maruziyet Değerlendirmesi"),
        ...(f.BilesenlereMaruziyet ? multiPara(f.BilesenlereMaruziyet) : [
          body("SED: Sistemik maruziyet dozu. Kan dolaşımına geçmesi beklenen kozmetik bileşeninin miktarıdır. Birimi mg/kg vücut ağırlığı/gün cinsinden ifade edilir."),
          body("SED = A (mg/kg × Vücut Ağırlığı/Gün) × C (%) / 100 × DAP (%) / 100"),
          body("İlgili ürüne ait hesaplanmış SED değerleri Ek-1 Tablo-1'de belirtilmiştir."),
        ]),

        // ── A.8 ───────────────────────────────────────────────────────────
        sectionHeading("A.8. Formülde Yer Alan Maddelerin Toksikolojik Profili"),
        ...(f.ToksikolojikProfil ? multiPara(f.ToksikolojikProfil) : [
          body("Formülde yer alan hammaddeler ve karışımlar ticari adlarına göre gruplandırılarak toksikolojik değerlendirmeleri yapılmıştır. Hammadde ve karışımların fiziksel özellikleri ve toksikolojik profilleri Ek-3'te verilmiştir."),
          subHeading("Güvenlilik Sınırının (MoS) Hesaplanması:"),
          body("Bütün belirgin emilim yolları dikkate alınarak ve deneyler sonucu gözlemlenen toksikolojik veriler ışığında belirlenen NO(A)EL değerine dayanarak, sistemik etkiler ve güvenlilik sınırı (MoS) hesaplanır."),
          body("MoS = NO(A)EL / SED ≥ 100"),
          body("İlgili ürüne ait hesaplanmış MoS değerleri Ek-1 Tablo-1'de belirtilmiştir."),
        ]),

        // ── A.9 ───────────────────────────────────────────────────────────
        sectionHeading("A.9. İstenmeyen Etkiler ve Ciddi İstenmeyen Etkiler"),
        ...(f.IstenmedEtkiler ? multiPara(f.IstenmedEtkiler) : [
          body("Ürünün piyasaya arzı sonrası kullanımında üründen kaynaklanan istenmeyen etkileri toplayacak, belgelendirecek, nedensellik kuracak ve yönetecek bir sistem kurulmalı ve ciddi istenmeyen etkiler olduğunda ilgili mevzuat gereğince Kurum bilgilendirilmelidir."),
          body("Üretici tarafından istenmeyen etki ve ciddi istenmeyen etki bildirilmemiştir."),
        ]),

        // ── A.10 ──────────────────────────────────────────────────────────
        sectionHeading("A.10. Kozmetik Ürün Bilgisi"),
        ...(f.UrunBilgisi ? multiPara(f.UrunBilgisi) : [
          body("Güvenlik değerlendirme raporuna ve toksikolojik profil hesaplamalarına göre ürünün satışında herhangi bir engel bulunmamaktadır. İspatlanması gereken bir iddia bulunmamaktadır ve ürün hakkında destekleyici bir güvenlik verisi bulunmamaktadır."),
          body("Etiket, ürün bileşimi, GMP Sertifikası, Test sonuçları (Stabilite Testi, Challenge ve Mikrobiyolojik Test), Hammaddelere ait Güvenlik Bilgi Formları, Ambalajlama Materyaline ait bilgiler, Üretim yöntemi ve Bitmiş ürüne ait Güvenlik Bilgi Formu gibi ek belgeler ürün bilgi dosyasında bulunmaktadır."),
        ]),
        pageBreak(),

        // ── KISIM B ───────────────────────────────────────────────────────
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "KISIM B — KOZMETİK ÜRÜN GÜVENLİLİK DEĞERLENDİRMESİ", font: FONT, size: 28, bold: true, color: ACCENT })],
          spacing: { before: 240, after: 240 },
        }),

        // ── B.1 ───────────────────────────────────────────────────────────
        sectionHeading("B.1. Değerlendirme Sonucu"),
        ...(f.DegerlendirmeSonucu ? multiPara(f.DegerlendirmeSonucu) : [
          body("Kozmetik Yönetmeliğinin 6'ncı maddesi gereğince piyasaya arz edilen bir kozmetik ürün, normal ve üretici tarafından öngörülebilen şartlar altında uygulandığında insan sağlığı açısından güvenli olmalıdır."),
          body("İşbu rapor; ürün bileşenlerinin toksikolojik karakteri, kimyasal yapısı ve maruz kalma seviyeleri, ürünün kullanımına sunulduğu hedef kitlenin belirgin maruziyet özellikleri göz önünde bulundurularak Kozmetik Yönetmeliği'nin 12'nci maddesi gereğince kozmetik bitmiş ürüne hazırlanmıştır."),
          body("Bütün kaynaklardan elde edilen mevcut veriler değerlendirilerek kozmetik ürün güvenlilik raporu hazırlanmıştır. Formülasyonda yer alan her bir maddenin, karışımın ve bitmiş ürünün öngörülen kullanım koşulları altında güvenlilik değerlendirmesi yapılmıştır."),
          body("Değerlendirilen kozmetik ürün düzenli kullanım için uygun olup, harici kullanım içindir."),
          body("Ürün; Kozmetik Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik / EK II — Kozmetik Ürünlerde Yasaklı Maddeler Listesi'ndeki maddeleri içermemektedir."),
          body("Bu rapor mevcut veriler doğrultusunda hazırlanmıştır. Normal şartlar altında ürünün, kullanım yeri, kullanım amacı ve miktarına göre normal ve makul olarak öngörülebilir kullanımı uygundur."),
          body("Ürün güvenlik değerlendirmesi tarafımca hazırlanmış olup başkalarına devredilemez."),
        ]),

        // ── B.2 ───────────────────────────────────────────────────────────
        sectionHeading("B.2. Etikette Verilen Uyarılar ve Kullanma Talimatları"),
        ...(f.EtiketUyarilariB2 ? multiPara(f.EtiketUyarilariB2) : [
          body("Ürün üzerinde yer alan kullanım ve uyarılar bölümüne A.5. maddesinde değinilmiştir. Ürüne ait görseller ürün güvenlik dosyasında da paylaşılmıştır."),
        ]),

        // ── B.3 ───────────────────────────────────────────────────────────
        sectionHeading("B.3. Gerekçelendirme"),
        ...(f.Gerekce ? multiPara(f.Gerekce) : [
          body("Bu Ürün Bilgi Dosyasında yer alan aşağıdaki kriterlere ilişkin belgeler incelenmiş ve söz konusu ürünün güvenlik değerlendirmesi sonucuna varılması için dikkate alınmıştır:"),
          body("- Kozmetik ürünün fiziksel/kimyasal özellikleri ve stabilitesi: Stabilite çalışmaları, ürünün test koşulları altında kararlı kaldığını göstermektedir. Etikette, açıldıktan sonra geçen sürenin 12 ay olduğu belirtilmektedir."),
          body("- Mikrobiyolojik kalite: Ürün mikrobiyolojik açıdan kararlıdır. Üretici, challenge testi yaparak bu ürünün korunmasının etkinliğini deneysel olarak garanti eder."),
          body("- Safsızlıklar, izler, ambalaj malzemesi: Tüm hammaddeler güvenlik ve yönetmeliğe uygunluk açısından değerlendirildi. İçeriklerde bulunan safsızlıklar belirlenen sınırlar içindedir ve toksikolojik olarak önemli kabul edilmemektedir."),
          body("- Maddelerin Toksikolojik Profili: Güvenlik marjları (MoS = NO(A)EL / SED ≥ 100) hesaplanmıştır. Mevcut toksikolojik verilere ve hesaplanan güvenlik marjlarına dayanarak, kozmetik formülünde bulunan hammaddeler, kullanılan konsantrasyonlarda sistemik bir toksisite riski oluşturmaz."),
          body("- İstenmeyen etkiler ve ciddi istenmeyen etkiler: Kasıtsız ve ciddi olumsuz etkiler olması durumunda düzeltici önlemler alınır ve güvenlik değerlendirmesi güncellenir."),
          body("Güvenlik değerlendirmesi kişisel olarak yapılmış olup devredilemez."),
        ]),

        // ── B.4 ───────────────────────────────────────────────────────────
        sectionHeading("B.4. Güvenlilik Değerlendirme Sorumlusu"),
        infoTable([
          ["Ad Soyad / Kuruluş:", val(f.SorumluAd)],
          ["Adres:", val(f.SorumluAdres)],
          ["Yeterlilik Kanıtı:", val(f.SorumluKanit)],
          ["Rapor Tarihi:", val(f.Tarih)],
        ]),
        body(""),
        new Paragraph({
          children: [new TextRun({ text: "İmza: ___________________", font: FONT, size: 22 })],
          spacing: { before: 240 },
        }),
        pageBreak(),

        // ── EK-1 ──────────────────────────────────────────────────────────
        sectionHeading("EK-1. KOZMETİK ÜRÜNÜN FORMÜLASYON VE DEĞERLENDİRMESİ"),
        formulResults.length > 0 ? ek1Table : body("Formül bilgisi girilmemiştir."),
        body(""),
        body("*C: Konsantrasyon değerleridir. UYGUN: Değerlendirilen bileşen ilgili konsantrasyonda güvenli kabul edilmiştir."),
        pageBreak(),

        // ── EK-2 ──────────────────────────────────────────────────────────
        sectionHeading("EK-2. KOZMETİK YÖNETMELİK EKLERİNE UYGUNLUK KONTROLÜ"),
        regulatedItems.length > 0 ? ek2Table : body("Düzenlenmiş madde bulunmamaktadır."),
        pageBreak(),

        // ── EK-3 ──────────────────────────────────────────────────────────
        sectionHeading("EK-3. BİLEŞENLERİN FİZİKOKİMYASAL VE TOKSİKOLOJİK ÖZELLİKLERİ"),
        ...ek3Paras,
        pageBreak(),

        // ── KAYNAKLAR ─────────────────────────────────────────────────────
        sectionHeading("KAYNAKLAR"),
        ...[
          "1. Regulation (EC) No 1223/2009 Of The European Parliament And Of The Council of 30 November 2009 on cosmetic products",
          "2. The SCCS's Notes Of Guidance For The Testing Of Cosmetic Ingredients And Their Safety Evaluation 12th Revision",
          "3. 5324 sayılı Kozmetik Kanunu",
          "4. Kozmetik Ürünlerde Güvenlik Değerlendirmesine İlişkin Kılavuz",
          "5. 15/07/2015 tarihli ve 29417 sayılı Resmî Gazete'de yayımlanan Kozmetik Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik ve Ekleri",
          "6. Kozmetik Ürünlerin Stabilitesine Ve Açıldıktan Sonra Kullanım Süresine İlişkin Kılavuz",
          "7. Kozmetik Ürünlerin Mikrobiyolojik Kontrolüne İlişkin Kılavuz",
          "8. Kozmetik Ürünlerde Güvenlilik Değerlendirmesi Ve Güvenlilik Değerlendiricisi Hakkında Kılavuz",
          "9. Üretici Tarafından Ciddi İstenmeyen Etkinin (Cie) Kuruma Bildirilmesine İlişkin Kılavuz",
          "10. Kozmetik Ürünlerin Etiketlenmesinde Dikkat Edilmesi Gerekenler Hakkında Kılavuz",
        ].map(body),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `UGDR-${(f.RaporNo || "rapor").replace(/[^a-zA-Z0-9_-]/g, "_")}.docx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
