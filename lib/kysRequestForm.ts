import { kysRequestCompany } from "./kysRequestCompany";
import { REQUEST_FORM_CSS } from "./kysRequestFormStyle";

export type RequestFormData = {
  talepNo:string;seri:string;talepTuru?:string;firmaAdi?:string;olusturmaTarihi:string|null;
  olusturanAd?:string;onaylayanAd?:string;teknikSartname?:string;notlar?:string;
  kalemler:Array<{kod?:string;stokKod?:string;malzemeAdi:string;ozellik?:string;marka?:string;kullaniciNotu?:string;miktar:number;birim:string}>;
};
const escape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function requestFormMarkup(data:RequestFormData,options:{logo?:string;hideSignatures?:boolean;company?:string}={}){
  const brand=kysRequestCompany(data.seri),english=Boolean(brand&&data.talepTuru!=="Sipariş");
  const label=(tr:string,en:string)=>english?en:tr;
  const e=escape,cls=(name:string)=>`kys-request-form-${name}`;
  const date=data.olusturmaTarihi?.slice(0,10).split("-").reverse().join(".")||"—";
  const unit=(value:string)=>english?({Adet:"pcs",Kutu:"box",Paket:"pack",Şişe:"bottle",Litre:"L",Gram:"g",Kilogram:"kg"} as Record<string,string>)[value]||value:value;
  const footerCompany=JSON.stringify(brand?"":options.company||"UNIQUE Analiz").replace(/</g,"\\3c ");
  return `<style>@page{@bottom-left{content:${footerCompany};font-family:Arial,sans-serif;font-size:9px;color:#6e6e73}}</style><article class="${cls("paper")}"><header class="${cls("header")}"><div><img src="${e(options.logo||brand?.logo||"/unique-logo.png")}" alt="${e(brand?.name||"UNIQUE")}" class="${cls(data.seri==="Root"?"rootLogo":"logo")}"></div>
    <div class="${cls("title")}"><h1>${brand&&!english?"Sipariş Formu":label("Talep Formu","PURCHASE ORDER")}</h1>${brand?`<dl class="${cls("orderMeta")}"><div><dt>${label("Sipariş No","Order No")}</dt><dd>${e(data.talepNo)}</dd></div><div><dt>${label("Tarih","Date")}</dt><dd>${date}</dd></div></dl>`:`<strong>${e(data.talepNo)}</strong><p>${date}</p>`}</div></header>
    ${brand?`<section class="${cls("notes")}"><h2>${label("Firma","Company")}</h2><p>${e(data.firmaAdi)}</p></section>`:""}
    <h2>${label("Talep edilen malzeme / hizmetler","Requested materials / services")}</h2>
    <table class="${cls("table")}"><colgroup>${[5,12,33,32,10,8].map(width=>`<col style="width:${width}%">`).join("")}</colgroup><thead><tr><th>No</th><th>${label("Kod","Code")}</th><th>${label("Malzeme / hizmet adı","Material / service")}</th><th>${label("Özellik / açıklama","Specification / description")}</th><th>${label("Miktar","Quantity")}</th><th>${label("Birim","Unit")}</th></tr></thead>
    <tbody>${data.kalemler.map((item,index)=>`<tr><td>${index+1}</td><td>${e(item.kod||item.stokKod||"—")}</td><td>${e(item.malzemeAdi)}</td><td>${e([item.ozellik,item.kullaniciNotu,item.marka&&`${label("Marka","Brand")}: ${item.marka}`].filter(Boolean).join("\n")||"—")}</td><td class="${cls("numeric")}">${Number(item.miktar).toLocaleString(english?"en-GB":"tr-TR",{maximumFractionDigits:4})}</td><td>${e(unit(item.birim))}</td></tr>`).join("")}</tbody></table>
    ${data.teknikSartname?`<section class="${cls("notes")}"><h2>${label("Teknik şartname","Technical specification")}</h2><p>${e(data.teknikSartname)}</p></section>`:""}
    <section class="${cls("notes")}"><h2>${label("Notlar / teslimat bilgileri","Notes / delivery information")}</h2><p>${e(data.notlar||"—")}</p></section>
    ${brand?`<section class="${cls("companyDetails")}"><strong>${e(brand.name)}</strong><p>${e(brand.address)}</p><p><a href="https://${e(brand.website)}">${e(brand.website)}</a> , <a href="mailto:${e(brand.email)}">${e(brand.email)}</a></p><p>${e(brand.phone)}</p></section>`:options.hideSignatures?"":`<div class="${cls("signatures")}"><div><span>Talep eden</span><strong>${e(data.olusturanAd)}</strong></div><div><span>Onaylayan</span><strong>${e(data.onaylayanAd)}</strong></div><div><span>Tedarikçi / teslim tarihi</span></div></div>`}
    <footer class="${cls("footer")}"><span>${brand?"":e(options.company||"UNIQUE Analiz")}</span><span class="${cls("pageNumber")}">${label("Sayfa ","Page ")}</span></footer></article>`;
}
export function requestFormDocument(data:RequestFormData,logo:string,company?:string){
  return `<!doctype html><html lang="${kysRequestCompany(data.seri)&&data.talepTuru!=="Sipariş"?"en":"tr"}"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0}${REQUEST_FORM_CSS}</style></head><body><main class="kys-request-form-page">${requestFormMarkup(data,{logo,company,hideSignatures:true})}</main></body></html>`;
}
