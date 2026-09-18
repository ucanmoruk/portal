import * as XLSX from "xlsx";
import { getPortalUser } from "@/lib/portalYetki";
import { getKysRequestDetail } from "@/lib/kysStore";

type ExportItem = { kod: string; stokKod: string; malzemeAdi: string; miktar: number; birim: string; ozellik: string; marka: string; kullaniciNotu: string; kabulMiktari: number; durum: string };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  if (!user.can("laboratuvar.kys.talep-listesi")) return Response.json({ error: "Yetkiniz yok." }, { status: 403 });
  const { id } = await params;
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) return Response.json({ error: "Geçersiz talep." }, { status: 400 });
  try {
    const detail = await getKysRequestDetail(Number(id));
    if (!detail) return Response.json({ error: "Talep bulunamadı." }, { status: 404 });
    const t = detail.talep;
    const date = (value: string | null) => value ? value.slice(0, 10).split("-").reverse().join(".") : "";
    const rows = [
      ["Talep Detayı", t.talepNo],
      ["Seri", t.seri], ["Talep türü", t.seri === "Spektrotek" && t.talepTuru !== "Sipariş" ? "Satın Alma" : t.talepTuru],
      ["Firma", t.firmaAdi], ["Durum", t.durum],
      ["Oluşturan", t.olusturanAd], ["Oluşturma tarihi", date(t.olusturmaTarihi)],
      ["Onaylayan", t.onaylayanAd], ["Onay tarihi", date(t.onayTarihi)],
      ["İşleme alan", t.islemeAlanAd], ["İşleme alma tarihi", date(t.islemeAlmaTarihi)],
      ["Not", t.notlar], ["Teknik şartname", t.teknikSartname], [],
      ["No", "Kod", "Malzeme / hizmet adı", "Miktar", "Birim", "Özellik", "Marka", "Kalem notu", "Kabul miktarı", "Durum"],
      ...detail.kalemler.map((k: ExportItem, i: number) => [i + 1, k.kod || k.stokKod, k.malzemeAdi, k.miktar, k.birim, k.ozellik, k.marka, k.kullaniciNotu, k.kabulMiktari, k.durum]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [8, 26, 48, 14, 12, 52, 22, 42, 18, 22].map(wch => ({ wch }));
    sheet["!autofilter"] = { ref: `A15:J${15 + detail.kalemler.length}` };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Talep Detayı");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    return new Response(bytes, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Talep-${t.talepNo}.xlsx`)}`,
      "Cache-Control": "no-store",
    } });
  } catch (e) {
    console.error("KYS Excel export failed", e);
    return Response.json({ error: "Excel çıktısı hazırlanamadı." }, { status: 500 });
  }
}
