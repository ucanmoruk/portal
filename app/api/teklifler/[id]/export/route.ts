export const runtime = "nodejs";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import poolPromise from "@/lib/db";
import { getAllSettings } from "@/lib/settings";
import fs from "fs";
import path from "path";

// ── Yardımcı fonksiyonlar ──────────────────────────────────────────────────────

function teklifLabel(no: number | null, rev: number) {
  if (!no) return "000000";
  const yy  = String(no).slice(0, 2);
  const seq = String(no).slice(2).padStart(4, "0");
  return rev > 0 ? `${yy}${seq}/${rev}` : `${yy}${seq}`;
}

function fmt(n: any) {
  const num = parseFloat(n);
  if (isNaN(num)) return "0,00";
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escXml(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Word, değişken adlarını birden fazla run'a bölebilir.
 * Bu fonksiyon "{" içeren ve kapatılmamış run'ları, "}" bulunana kadar
 * iteratif olarak sonraki run'larla birleştirir.
 */
function mergeVariables(xml: string): string {
  for (let i = 0; i < 20; i++) {
    const prev = xml;
    // Bir w:t içinde "{" açık (} yok) ise, biten </w:t></w:r>'dan sonra gelen
    // bir sonraki run'un metnini bu run'a ekle, o run'u sil.
    xml = xml.replace(
      /(<w:t(?:\s[^>]*)?>(?:[^<]*)\{[^}<]*)<\/w:t><\/w:r><w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>([^<]*)<\/w:t><\/w:r>/g,
      (_, p1, p2) => `${p1}${p2}</w:t></w:r>`
    );
    if (xml === prev) break;
  }
  return xml;
}

/**
 * Template row içindeki {hizmet_adi} vb. değişkenleri her satır için doldurur.
 * Template row'u tekrarlar, orijinali kaldırır.
 */
/**
 * {hizmet_adi} içeren tablo satırını her hizmet için doldurur.
 * {hizmet_adi} = [* ][HizmetAdı][ / Metot]  (akreditasyon varsa * önde, metot varsa / sonda)
 */
function fillHizmetRows(xml: string, satirlar: any[]): string {
  const rowRegex = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
  let templateRow: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(xml)) !== null) {
    if (m[0].includes("{hizmet_adi}")) { templateRow = m[0]; break; }
  }
  if (!templateRow) return xml;

  const filledRows = satirlar.map((s: any, idx: number) => {
    const adet    = parseInt(s.Adet)      || 1;
    const fiyat   = parseFloat(s.Fiyat)   || 0;
    const iskonto = parseFloat(s.Iskonto) || 0;
    const net     = adet * fiyat * (1 - iskonto / 100);
    const pb      = s.ParaBirimi || "TRY";
    const fiyatStr = iskonto > 0
      ? `${fmt(fiyat)} ${pb} (-%${iskonto})`
      : `${fmt(fiyat)} ${pb}`;

    // Hizmet adı kombinasyonu: [* ][HizmetAdı][ / Metot]
    const parts: string[] = [];
    if (s.Akreditasyon) parts.push("*");
    parts.push(s.HizmetAdi || "");
    if (s.Metot) parts.push(`/ ${s.Metot}`);
    const hizmetLabel = parts.join(" ");

    return templateRow!
      .split("{no}")           .join(String(idx + 1))
      .split("{hizmet_adi}")   .join(escXml(hizmetLabel))
      .split("{adet}")         .join(String(adet))
      .split("{birim_fiyat}")  .join(escXml(fiyatStr))
      .split("{toplam_fiyat}") .join(escXml(`${fmt(net)} ${pb}`));
  }).join("");

  return xml.replace(templateRow, filledRows || templateRow);
}

/**
 * {toplam_iskonto} içeren tablo satırını, iskonto yoksa tamamen kaldırır.
 */
function removeIskontoRow(xml: string, hasIskonto: boolean): string {
  if (hasIskonto) return xml;
  // {toplam_iskonto} içeren <w:tr>...</w:tr> satırını bul ve kaldır
  return xml.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (match) =>
    match.includes("{toplam_iskonto}") ? "" : match
  );
}

// ── API Route ──────────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Yetkisiz erişim", { status: 401 });

  const { id } = await params;
  if (!id || isNaN(Number(id))) return new Response("Geçersiz ID", { status: 400 });

  // Şablon dosyasını kontrol et
  const templatePath = path.join(process.cwd(), "sablon", "teklifsablon.docx");
  if (!fs.existsSync(templatePath)) {
    return new Response("Şablon dosyası bulunamadı: sablon/teklifsablon.docx", { status: 404 });
  }

  try {
    const pool = await poolPromise;

    const hRes = await pool.request()
      .input("ID", Number(id))
      .query(`
        SELECT
          t.ID, t.TeklifNo, t.RevNo,
          FORMAT(t.Tarih, 'dd.MM.yyyy') AS Tarih,
          t.Notlar,
          ISNULL(t.TeklifKonusu,'Fiyat teklifimiz') AS TeklifKonusu,
          ISNULL(t.TeklifVeren,'')                  AS TeklifVeren,
          ISNULL(t.KdvOran, 20)                     AS KdvOran,
          ISNULL(t.GenelIskonto, 0)                 AS GenelIskonto,
          ISNULL(m.Ad,'')           AS MusteriAd,
          ISNULL(m.Adres,'')        AS MusteriAdres,
          ISNULL(m.Telefon,'')      AS MusteriTelefon,
          ISNULL(m.Email,'')        AS MusteriEmail,
          ISNULL(m.Yetkili,'')      AS MusteriYetkili,
          ISNULL(m.VergiDairesi,'') AS VergiDairesi,
          ISNULL(m.VergiNo,'')      AS VergiNo
        FROM TeklifX1 t
        LEFT JOIN RootTedarikci m ON m.ID = t.MusteriID
        WHERE t.ID = @ID
      `);

    if (!hRes.recordset.length) return new Response("Teklif bulunamadı", { status: 404 });
    const h = hRes.recordset[0];

    const sRes = await pool.request()
      .input("TeklifID", Number(id))
      .query(`
        SELECT HizmetAdi,
               ISNULL(Adet,1)          AS Adet,
               ISNULL(Metot,'')        AS Metot,
               ISNULL(Akreditasyon,'') AS Akreditasyon,
               Fiyat, ParaBirimi, Iskonto, Notlar
        FROM TeklifX2
        WHERE TeklifID = @TeklifID
        ORDER BY ID
      `);

    const satirlar: any[] = sRes.recordset;
    const no = teklifLabel(h.TeklifNo, h.RevNo);

    // Hesaplamalar
    const kdvOran    = parseInt(h.KdvOran)     || 20;
    const genelIsk   = parseFloat(h.GenelIskonto) || 0;
    let araToplam = 0;
    for (const s of satirlar) {
      const adet    = parseInt(s.Adet)      || 1;
      const fiyat   = parseFloat(s.Fiyat)   || 0;
      const iskonto = parseFloat(s.Iskonto) || 0;
      araToplam += adet * fiyat * (1 - iskonto / 100);
    }
    const tutar       = araToplam * (1 - genelIsk / 100);
    const kdvTutar    = tutar * kdvOran / 100;
    const genelToplam = tutar + kdvTutar;

    // Şablonu yükle (JSZip ile)
    const JSZip = (await import("jszip")).default;
    const templateBuf = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(templateBuf);

    // document.xml'i oku
    const docXmlFile = zip.file("word/document.xml");
    if (!docXmlFile) return new Response("Şablon geçersiz: word/document.xml bulunamadı", { status: 500 });

    let xml = await docXmlFile.async("string");

    // 1. Bölünmüş değişkenleri birleştir
    xml = mergeVariables(xml);

    // 2. İskonto yoksa {toplam_iskonto} satırını kaldır
    xml = removeIskontoRow(xml, genelIsk > 0);

    // 3. Hizmet satırlarını doldur (tekrarlayan template row)
    xml = fillHizmetRows(xml, satirlar);

    // Çoğunluk para birimi
    const pbCount: Record<string, number> = {};
    satirlar.forEach(s => { const p = s.ParaBirimi || "TRY"; pbCount[p] = (pbCount[p] || 0) + 1; });
    const pb = Object.entries(pbCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "TRY";

    // 4. Değişken haritası
    //    {tutar}          = ara toplam (satır iskontoları dahil, sadece sayı + para birimi)
    //    {toplam_iskonto} = genel iskonto tutarı (satır varsa doldurulur, yoksa satır zaten silindi)
    //    {kdv}            = KDV tutarı (şablonda "KDV (%20):" başlığı sabit kalıyor)
    //    {sayfa_no}       = "1" (dinamik sayfa numarası Word alanı değil, statik)
    const vars: Record<string, string> = {
      teklif_no:       `ROT${no}`,
      revizyon_no:     h.RevNo > 0 ? String(h.RevNo) : "--",
      teklif_tarihi:   h.Tarih || "",
      teklifi_veren:   h.TeklifVeren || "",
      sayfa_no:        "1",
      musteri_adi:     h.MusteriAd || "",
      musteri_adresi:  h.MusteriAdres || "",
      tutar:           `${fmt(araToplam)} ${pb}`,
      toplam_iskonto:  `${fmt(araToplam * genelIsk / 100)} ${pb}`,
      kdv:             `${fmt(kdvTutar)} ${pb}`,
      genel_toplam:    `${fmt(genelToplam)} ${pb}`,
    };

    // Değişkenleri document.xml'e uygula
    for (const [key, value] of Object.entries(vars)) {
      xml = xml.split(`{${key}}`).join(escXml(value));
    }

    // 5. Aynı değişkenleri header1.xml'e de uygula (teklif_no, tarih, teklifi_veren, sayfa_no burada)
    const headerFile = zip.file("word/header1.xml");
    if (headerFile) {
      let hXml = await headerFile.async("string");
      hXml = mergeVariables(hXml);
      for (const [key, value] of Object.entries(vars)) {
        hXml = hXml.split(`{${key}}`).join(escXml(value));
      }
      zip.file("word/header1.xml", hXml);
    }

    // 6. Güncellenen XML'i zip'e yaz
    zip.file("word/document.xml", xml);

    // 7. Buffer olarak üret
    const outBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const filename = `Teklif-ROT${no}.docx`;

    return new Response(new Uint8Array(outBuf), {
      headers: {
        "Content-Type":        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });

  } catch (e: any) {
    return new Response(`Hata: ${e.message}`, { status: 500 });
  }
}
