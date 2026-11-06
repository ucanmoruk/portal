import { PDFDocument } from "pdf-lib";
import { getPortalUser } from "@/lib/portalYetki";
import { listDisKaynakliDokumanlar, type DisKaynakliDokumanRow } from "@/lib/kysDisKaynakliDokumanStore";
import { externalTrackingHtml, getListTemplate, listHeader, listPdfOptions } from "@/lib/kysListExport";
import { renderHtmlToPdf } from "@/lib/chromiumPdf";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function GET() {
  const user = await getPortalUser();
  if (!user) return Response.json({error:"Yetkisiz erişim"},{status:401});
  if (!user.can("laboratuvar.kys.dis-kaynakli-dokuman")) return Response.json({error:"Görüntüleme yetkiniz yok."},{status:403});
  try {
    const {data} = await listDisKaynakliDokumanlar({all:true,sort:"kod-asc"});
    const documents: DisKaynakliDokumanRow[] = data;
    const template = await getListTemplate("F102-01");
    const output = await PDFDocument.create();
    const units = [...new Set(documents.map(d=>d.birim))].sort((a,b)=>a.localeCompare(b,"tr"));
    for (const unit of units.length ? units : ["Tüm birimler"]) {
      const bytes = await renderHtmlToPdf(externalTrackingHtml(documents.filter(d=>d.birim===unit),unit),{...listPdfOptions,headerTemplate:listHeader(template,"DIŞ KAYNAKLI DOKÜMAN TAKİP FORMU")});
      const pdf = await PDFDocument.load(bytes);
      for (const page of await output.copyPages(pdf,pdf.getPageIndices())) output.addPage(page);
    }
    return new Response(new Uint8Array(await output.save()),{headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="F102-01-Dis-Kaynakli-Dokuman-Takip-Formu.pdf"',"Cache-Control":"private, no-store"}});
  } catch(error) { console.error("[external document export]",error);return Response.json({error:"PDF oluşturulamadı. Tekrar deneyin."},{status:500}); }
}
