import * as XLSX from "xlsx";

export type ExportDocument = {
  kod: string; baslik: string; tur: string; durum: string; revizyonEtiket: string;
  yururlukTarihi: string | null; hazirlayanAd: string; onaylayanAd: string;
  updatedAt: string | null;
};
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]!));
const dateLabel = (value: string | null) => {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "-";
};
const excelDate = (value: string | null) => value ? new Date(value.slice(0,10) + "T00:00:00Z") : null;

export function createDocumentWorkbook(documents: ExportDocument[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Kod", "Doküman Adı", "Tür", "Revizyon", "Durum", "Hazırlayan", "Onaylayan", "Yürürlük Tarihi", "Son Güncelleme"],
    ...documents.map(doc => [doc.kod, doc.baslik, doc.tur, doc.revizyonEtiket, doc.durum, doc.hazirlayanAd, doc.onaylayanAd, excelDate(doc.yururlukTarihi), doc.updatedAt ? new Date(doc.updatedAt) : null]),
  ], { cellDates: true, dateNF: 'dd"."mm"."yyyy' });
  sheet["!cols"] = [18,65,20,12,22,26,26,20,20].map(wch => ({ wch }));
  sheet["!autofilter"] = { ref: sheet["!ref"]! };
  documents.forEach((_, index) => {
    const cell = sheet[`I${index+2}`];
    if (cell?.t === "d") cell.z = 'dd"."mm"."yyyy hh:mm';
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Dokümanlar");
  return XLSX.write(workbook, { type:"buffer", bookType:"xlsx" }) as Buffer;
}

export function documentMasterHtml(documents: ExportDocument[], logoData: string) {
  const typeOrder = ["Prosedür", "Talimat", "SOP", "Form", "Liste", "Plan", "Politika", "Rehber"];
  const collator = new Intl.Collator("tr", { numeric:true, sensitivity:"base" });
  const rank = (type: string) => {
    const index = typeOrder.indexOf(type);
    return index < 0 ? typeOrder.length : index;
  };
  const sorted = [...documents].sort((a,b) => rank(a.tur)-rank(b.tur) || collator.compare(a.tur,b.tur) || collator.compare(a.kod,b.kod) || collator.compare(a.baslik,b.baslik));
  const rows = sorted.map((doc,index) => `<tr><td>${index+1}</td><td>${escape(doc.tur)}</td><td>${escape(doc.kod)}</td><td class="name">${escape(doc.baslik)}</td><td>${escape(doc.durum)}</td><td>${escape(doc.revizyonEtiket)}</td><td>${dateLabel(doc.yururlukTarihi)}</td></tr>`).join("");
  const headerTemplate = `<div style="width:100%;padding:0 9mm;font-family:Arial,sans-serif;box-sizing:border-box;color:#000">
    <div style="display:flex;align-items:center;border:1px solid #000;height:22mm">
      <img src="${logoData}" style="width:53mm;height:auto;margin:0 4mm"/>
      <strong style="flex:1;text-align:center;font-size:18pt">DOKÜMAN MASTER LİSTESİ</strong>
      <table style="border-collapse:collapse;width:59mm;font-size:8pt;height:100%"><tbody>
        ${[["Doküman No","L102-01"],["Revizyon","02"],["Yürürlük Tarihi","01.09.2026"],["Sayfa",'<span class="pageNumber"></span> / <span class="totalPages"></span>']].map(([label,value])=>`<tr><td style="border:1px solid #000;padding:2px 5px">${label}</td><td style="border:1px solid #000;padding:2px 5px">${value}</td></tr>`).join("")}
      </tbody></table>
    </div></div>`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;font:9pt Arial,sans-serif;color:#000}
    table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #000;padding:5px 6px;vertical-align:middle;overflow-wrap:anywhere}
    th{background:#5038ed;color:#fff;font-weight:700;text-align:center;height:9mm}
    td{text-align:center;height:8.5mm}.name{text-align:left}thead{display:table-header-group}tr{break-inside:avoid}
    .signatures{margin-top:5mm;break-inside:avoid}.signatures th{height:7mm;background:white;color:black}
    .signatures td{text-align:left;height:20mm;vertical-align:top;line-height:1.55;font-weight:700}
  </style></head><body><table><colgroup>${[4,10,12,42,10,9,13].map(width=>`<col style="width:${width}%">`).join("")}</colgroup>
    <thead><tr>${["No","Doküman Türü","Doküman Kodu","Doküman Adı","Durumu","Revizyon","Yürürlük Tarihi"].map(label=>`<th>${label}</th>`).join("")}</tr></thead>
    <tbody>${rows || '<tr><td colspan="7">Seçili filtrelere uyan doküman bulunamadı.</td></tr>'}</tbody></table>
    <table class="signatures"><thead><tr><th>Hazırlayan</th><th>Kontrol Eden ve Onaylayan</th></tr></thead><tbody><tr>${Array.from({length:2},()=>'<td>Ad / Soyad:<br>Tarih&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:<br>İmza&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</td>').join("")}</tr></tbody></table>
    </body></html>`;
  return { html, headerTemplate };
}
