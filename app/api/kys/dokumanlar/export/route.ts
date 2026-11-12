import { getListTemplate, listHeader } from "@/lib/kysListExport";
import { getPortalUser } from "@/lib/portalYetki";
import { dokumanYetkileri } from "@/lib/kysDokumanYetki";
import { listKysDokumanlar } from "@/lib/kysDokumanStore";
import { createDocumentWorkbook, documentMasterHtml } from "@/lib/kysDokumanExport";
import { renderHtmlToPdf } from "@/lib/chromiumPdf";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(request: Request) {
  const user = await getPortalUser();
  if (!user) return Response.json({error:"Yetkisiz erişim"},{status:401});
  if (!dokumanYetkileri(user).goruntule) return Response.json({error:"Görüntüleme yetkiniz yok."},{status:403});
  const params = new URL(request.url).searchParams;
  const format = params.get("format");
  if (format !== "excel" && format !== "master") return Response.json({error:"Geçersiz dışa aktarma biçimi."},{status:400});
  try {
    const {data} = await listKysDokumanlar(format === "master" ? { all:true } : {search:params.get("search")||"",searchMode:params.get("searchMode")||"title-code",tur:params.get("tur")||"",durum:params.get("durum")||"",sort:params.get("sort")||"",all:true});
    let buffer: Buffer;
    if (format === "excel") buffer = createDocumentWorkbook(data);
    else {
      const template = await getListTemplate("L102-01");
      const {html} = documentMasterHtml(data,template.logo);
      const headerTemplate = listHeader(template,"DOKÜMAN MASTER LİSTESİ");
      buffer = await renderHtmlToPdf(html,{headerTemplate,displayHeaderFooter:true,footerTemplate:"<div></div>",paperWidth:11,paperHeight:8.5025,marginTop:1.14,marginBottom:.35,marginLeft:.35,marginRight:.35,printBackground:true});
    }
    const filename = format === "excel" ? "KYS-Dokumanlar.xlsx" : "L102-01-Dokuman-Master-Listesi.pdf";
    return new Response(new Uint8Array(buffer),{headers:{"Content-Type":format==="excel"?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"application/pdf","Content-Disposition":`attachment; filename="${filename}"`,"Cache-Control":"private, no-store"}});
  } catch(error) {
    console.error("[kys export]",error);
    return Response.json({error:"Dışa aktarma tamamlanamadı. Lütfen tekrar deneyin."},{status:500});
  }
}
