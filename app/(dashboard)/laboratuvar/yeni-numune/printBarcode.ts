// Barkod yazdırma yardımcısı — Yeni Numune / Çoklu Giriş
// Sayfa boyutu: 327 × 235 px (DevExpress legacy ölçüleri)
// Her (numune × bölüm) için ayrı sayfa basar.

import type { HizmetRow } from "../numune-form/numuneFormTypes";

// Sağ üstte basılacak logo (public/ dizininden). Boyut .head-right .logo CSS ile ayarlanır.
const LOGO_PATH = "/unique-logo.png";

export interface BarcodeNumune {
  RaporNo: string;
  NumuneAd: string;
  FirmaAd?: string;
  Tarih?: string;
  hizmetler: HizmetRow[];
}

const PAGE_W = 327;
const PAGE_H = 235;
const UNASSIGNED = "Atanmamış";

function escapeHtml(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "2026-05-28" → "28-05-2026"  (zaten gg-aa-yyyy gelirse aynen döner)
function formatTarihTR(s: string): string {
  if (!s) return "";
  const v = s.trim();
  // ISO formatı: YYYY-MM-DD veya YYYY-MM-DDT...
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  // Zaten DD-MM-YYYY veya DD.MM.YYYY ise olduğu gibi bırak
  return v;
}

function groupByBolum(hizmetler: HizmetRow[]): Map<string, HizmetRow[]> {
  const map = new Map<string, HizmetRow[]>();
  for (const h of hizmetler) {
    const raw = h.BolumAdi == null ? "" : String(h.BolumAdi).trim();
    const key = raw || UNASSIGNED;
    const arr = map.get(key);
    if (arr) arr.push(h);
    else map.set(key, [h]);
  }
  return map;
}

interface LabelPage {
  raporNo: string;
  numuneAd: string;
  firmaAd: string;
  tarih: string;
  bolum: string;
  hizmetler: HizmetRow[];
}

function buildPages(numuneler: BarcodeNumune[]): LabelPage[] {
  const pages: LabelPage[] = [];
  for (const n of numuneler) {
    const groups = groupByBolum(n.hizmetler);
    if (groups.size === 0) {
      // Hizmet eklenmemiş — sadece bilgi etiketi
      pages.push({
        raporNo: n.RaporNo,
        numuneAd: n.NumuneAd,
        firmaAd: n.FirmaAd || "",
        tarih: n.Tarih || "",
        bolum: "—",
        hizmetler: [],
      });
      continue;
    }
    // Bölüm adına göre sırala
    const sortedBolumler = [...groups.keys()].sort((a, b) =>
      a.localeCompare(b, "tr")
    );
    for (const bolum of sortedBolumler) {
      pages.push({
        raporNo: n.RaporNo,
        numuneAd: n.NumuneAd,
        firmaAd: n.FirmaAd || "",
        tarih: n.Tarih || "",
        bolum,
        hizmetler: groups.get(bolum) || [],
      });
    }
  }
  return pages;
}

function renderPageHtml(p: LabelPage, logoUrl: string): string {
  const hizmetItems = p.hizmetler.length
    ? p.hizmetler
        .map(
          (h) =>
            `<li><span class="kod">${escapeHtml(h.Kod || "")}</span> ${escapeHtml(h.Ad || "")}</li>`
        )
        .join("")
    : `<li class="empty">Hizmet yok</li>`;

  return `
    <section class="label">
      <header class="lbl-head">
        <div class="head-left">
          <div class="line"><span class="lbl">Rapor No:</span> <span class="val">${escapeHtml(p.raporNo || "—")}</span></div>
          <div class="line"><span class="lbl">Numune:</span> <span class="val">${escapeHtml(p.numuneAd || "—")}</span></div>
          <div class="line"><span class="lbl">Kabul Tarihi:</span> <span class="val">${p.tarih ? escapeHtml(formatTarihTR(p.tarih)) : "—"}</span></div>
          <div class="line small"><span class="lbl">Bölüm:</span> <strong>${escapeHtml(p.bolum)}</strong></div>
        </div>
        <div class="head-right">
          <img src="${escapeHtml(logoUrl)}" alt="Logo" class="logo" />
        </div>
      </header>
      <ul class="hizmet-list">
        ${hizmetItems}
      </ul>
    </section>
  `;
}

export function printBarcodes(numuneler: BarcodeNumune[]): void {
  const validNumuneler = numuneler.filter((n) => n.RaporNo || n.NumuneAd);
  if (validNumuneler.length === 0) {
    alert("Barkod basılacak numune yok.");
    return;
  }

  const pages = buildPages(validNumuneler);
  // Yeni pencerede public/ asset'leri için tam URL gerekiyor
  const logoUrl = (typeof window !== "undefined" ? window.location.origin : "") + LOGO_PATH;
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>Numune Barkodları</title>
<style>
  @page { size: ${PAGE_W}px ${PAGE_H}px; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #111; }
  .label {
    width: ${PAGE_W}px;
    height: ${PAGE_H}px;
    padding: 10px 12px;
    page-break-after: always;
    page-break-inside: avoid;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .label:last-child { page-break-after: auto; }
  .lbl-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    border-bottom: 1px solid #000;
    padding-bottom: 6px;
    margin-bottom: 6px;
  }
  .head-left { flex: 1; min-width: 0; }
  .head-right { flex-shrink: 0; text-align: right; display: flex; align-items: center; justify-content: flex-end; }
  .head-right .logo {
    max-width: 90px;
    max-height: 56px;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
  }
  .line { font-size: 8px; }
  .line.small { font-size: 8px; color: #000000; }
  .lbl { color: #000000; font-weight: 600; }
  .val { font-weight: 700; font-size: 8px; }
  .hizmet-list {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    overflow: hidden;
    font-size: 8px;
    line-height: 1.4;
  }
  .hizmet-list li {
    padding: 1px 0;
    border-bottom: 1px dotted #ddd;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hizmet-list li:last-child { border-bottom: none; }
  .hizmet-list li.empty { color: #999; font-style: italic; text-align: center; padding-top: 10px; }
  .kod { font-family: "Tahoma", monospace; color: #666; margin-right: 5px; }
  @media print {
    html, body { background: #fff; }
    .label { box-shadow: none; }
  }
</style>
</head>
<body>
  ${pages.map(p => renderPageHtml(p, logoUrl)).join("\n")}
  <script>
    // Logo yüklendikten sonra yazdır (boş baskı olmasın)
    function doPrint() { setTimeout(function () { window.print(); }, 80); }
    window.addEventListener("load", function () {
      var imgs = Array.prototype.slice.call(document.images);
      if (imgs.length === 0) { doPrint(); return; }
      var pending = imgs.length;
      var done = function () { if (--pending <= 0) doPrint(); };
      imgs.forEach(function (img) {
        if (img.complete) done();
        else { img.addEventListener("load", done); img.addEventListener("error", done); }
      });
    });
    window.addEventListener("afterprint", function () { window.close(); });
  </script>
</body>
</html>`;

  // Yazdırma önizleme penceresi — ekrana göre büyük ve ortalanmış aç
  const screenW = typeof window !== "undefined" ? window.screen.availWidth  : 1280;
  const screenH = typeof window !== "undefined" ? window.screen.availHeight : 800;
  const winW = Math.min(1100, Math.max(900, Math.floor(screenW * 0.7)));
  const winH = Math.min(900,  Math.max(700, Math.floor(screenH * 0.85)));
  const left = Math.max(0, Math.floor((screenW - winW) / 2));
  const top  = Math.max(0, Math.floor((screenH - winH) / 2));

  const features = [
    `width=${winW}`,
    `height=${winH}`,
    `left=${left}`,
    `top=${top}`,
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "scrollbars=yes",
    "resizable=yes",
  ].join(",");

  const win = window.open("", "_blank", features);
  if (!win) {
    alert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kontrol edin.");
    return;
  }
  // Bazı tarayıcılar feature flag'leri ilk açılışta yok sayıyor — manuel resize/move dene
  try {
    win.resizeTo(winW, winH);
    win.moveTo(left, top);
  } catch { /* yetkisi yoksa sessizce geç */ }

  win.document.open();
  win.document.write(html);
  win.document.close();
}
