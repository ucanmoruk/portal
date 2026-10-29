import { requestFormDocument } from "./kysRequestForm";
export const PURCHASING_FROM = "purchasing@uniquealphabet.com";
export const PURCHASING_CC = ["oguzhan@uniquealphabet.com", "selin@uniquealphabet.com"];

export function supplierEmails(value: unknown) {
  const addresses = String(value ?? "").split(/[;,\s]+/).map(address=>address.trim().toLowerCase()).filter(Boolean);
  if (addresses.some(address=>address.length>254||!/^[^\s@<>,;:\x00-\x1f\x7f]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(address))) {
    throw new Error("Tedarikçi e-posta adresleri geçersiz. Adresleri virgül veya noktalı virgülle ayırın.");
  }
  return [...new Set(addresses)];
}

export type PurchaseMailSnapshot = {
  talepNo: string; seri: string; talepTuru?: string; firmaAdi: string; olusturanAd: string; onaylayanAd: string;
  olusturmaTarihi: string | null; teknikSartname: string; notlar: string;
  kalemler: Array<{kod:string;stokKod:string;malzemeAdi:string;ozellik:string;marka:string;kullaniciNotu:string;miktar:number;birim:string}>;
};
export const mailEscape = (value: unknown) => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

export function purchaseFormHtml(snapshot: PurchaseMailSnapshot, logoData: string, company?:string) {
  return requestFormDocument(snapshot,logoData,company);
}

export function supplierMailContent(){
  const text="Sayın Yetkili,\n\nEkte yer alan talep formumuzdaki ürünler için fiyat teklifinizi ve teslim sürenizi paylaşabilir misiniz ?\n\nİyi çalışmalar dilerim.\n\nSaygılarımla,\n\nOğuzhan EKER\nManaging Director\nMobile: +90 (551) 734 13 04\nWeb: www.uniqueanalyse.com\nAdres: Atatürk Mahallesi Hadımköy Yolu Cad. No:10 / 7 Esenyurt, İstanbul";
  const html=`<div style="font-family:Tahoma,Arial,sans-serif;font-size:10pt;line-height:1.5;color:#000">
    <p>Sayın Yetkili,</p><p>Ekte yer alan talep formumuzdaki ürünler için fiyat teklifinizi ve teslim sürenizi paylaşabilir misiniz ?</p>
    <p>İyi çalışmalar dilerim.</p><p style="color:#5b45ff">Saygılarımla,</p>
    <table role="presentation" style="font-family:Tahoma,Arial,sans-serif;font-size:10pt;line-height:1.4;border:0"><tr><td style="padding:0;border:0;font-family:Tahoma,Arial,sans-serif;font-size:10pt;line-height:1.4">
    <strong>Oğuzhan EKER</strong><br><span style="color:#5b45ff">Managing Director</span><br><br>
    <strong style="color:#5b45ff">Mobile:</strong> +90 (551) 734 13 04<br>
    <strong style="color:#5b45ff">Web:</strong> <a href="https://www.uniqueanalyse.com" style="color:#28788c">www.uniqueanalyse.com</a><br>
    <strong style="color:#5b45ff">Adres:</strong> Atatürk Mahallesi Hadımköy Yolu Cad. No:10 / 7 Esenyurt, İstanbul<br><br>
    <img src="cid:purchasing-signature" alt="UNIQUE ANALYSE" width="320" style="display:block;width:320px;max-width:100%;height:auto;border:0">
    </td></tr></table></div>`;
  return {text,html};
}
