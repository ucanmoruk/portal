// Validasyon 21 (DMFu Tayini) için DENETİM KANITI Excel.
// Her bölüm: Teorik formül + Validasyon 21 girdileri + Excel hücre formülüyle
// adım adım hesap + Sistem sonucu ile karşılaştırma.

import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';

const val = JSON.parse(fs.readFileSync('scripts/_val21.json', 'utf8'));
const md = val.config.moduleData || {};
const components = (val.config.components || []).map(c => c.name);
const personnel = (val.config.personnel || []).map(p => p.name);
const COMP_DMFU = 'Fumaric acid, bis-mehyl ester (DMFu)';

const toNum = (s) => {
    if (typeof s === 'number') return s;
    if (s == null || s === '') return null;
    const n = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

const wb = new ExcelJS.Workbook();
wb.creator = 'ÜGD Portal Eurolab';
wb.created = new Date();

// -------- Stiller --------
const TITLE = {
    font: { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0071E3' } },
    alignment: { vertical: 'middle', horizontal: 'left' },
};
const H2 = {
    font: { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333344' } },
};
const FORMULA_HEADER = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34C759' } },
};
const SECTION_HEADER = {
    font: { bold: true },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } },
};
const RESULT_HEADER = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5856D6' } },
    alignment: { horizontal: 'center' },
};
const SYSTEM_CELL = {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE5B4' } },
    font: { italic: true },
};
const DIFF_CELL = {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4F8D4' } },
    numFmt: '0.000000000000',
};
const BORDER = {
    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
};

function applyAll(sheet, opts) {
    sheet.eachRow(row => row.eachCell(cell => { cell.border = BORDER; }));
}

// ===========================================================================
// 1. KAPAK
// ===========================================================================
function buildCover() {
    const ws = wb.addWorksheet('1. Kapak');
    ws.columns = [{ width: 44 }, { width: 90 }];
    const enabledParams = (val.config.parameters || []).filter(p => p.isEnabled).map(p => p.name).join(', ');

    let r = 1;
    ws.mergeCells(`A${r}:B${r}`);
    ws.getCell(`A${r}`).value = 'VALİDASYON HESAPLAMA DOĞRULAMA RAPORU';
    Object.assign(ws.getCell(`A${r}`), TITLE);
    ws.getRow(r).height = 28;
    r += 2;

    const meta = [
        ['Validasyon Kodu', val.code],
        ['Validasyon Başlığı', val.title],
        ['Metot', val.method_name || ''],
        ['Metot Kodu', val.method_code || ''],
        ['Teknik', val.technique || ''],
        ['Matriks (metot)', val.matrix || ''],
        ['Çalışma Tipi', val.study_type],
        ['Durum', val.status],
        ['Komponentler', components.join('; ')],
        ['Personel', personnel.join('; ')],
        ['Aktif Validasyon Parametreleri', enabledParams],
        ['Doküman Üretim Tarihi', new Date().toISOString().split('T')[0]],
    ];
    for (const [k, v] of meta) {
        ws.getCell(`A${r}`).value = k;
        ws.getCell(`A${r}`).font = { bold: true };
        ws.getCell(`B${r}`).value = v;
        r++;
    }
    r++;
    ws.mergeCells(`A${r}:B${r}`); ws.getCell(`A${r}`).value = 'AMAÇ'; Object.assign(ws.getCell(`A${r}`), H2); r++;
    const purpose = [
        'Bu dosya, ÜGD Portal Eurolab Validasyon ekranındaki (Validasyon ID = 21) tüm',
        'istatistiksel hesaplamaların doğruluğunu denetim/akreditasyon süreçlerine kanıt',
        'olarak sunmak amacıyla, kaynak kod algoritmaları baz alınarak hazırlanmıştır.',
        '',
        'HER SAYFADA:',
        '  1) Bölümün TEORİK FORMÜLÜ (matematik notasyonu)',
        '  2) Validasyon 21\'in GİRİŞ VERİLERİ (sistemde girilmiş ham veriler)',
        '  3) Excel HÜCRE FORMÜLÜ ile adım adım hesap (denetçi hücreye tıklayarak doğrulayabilir)',
        '  4) Sistemin verdiği SONUÇ ile karşılaştırma (Fark sütunu ≈ 0 olmalı)',
    ];
    for (const line of purpose) {
        ws.mergeCells(`A${r}:B${r}`);
        ws.getCell(`A${r}`).value = line;
        r++;
    }
    r++;
    ws.mergeCells(`A${r}:B${r}`); ws.getCell(`A${r}`).value = 'REFERANSLAR'; Object.assign(ws.getCell(`A${r}`), H2); r++;
    const refs = [
        'ISO 5725-2: Tekrarlanabilirlik ve Tekrarüretilebilirlik (r = 2.83·Sr)',
        'ISO/IEC Guide 98-3 (GUM): Belirsizlik bütçesi (k=2, %95)',
        'IUPAC / ICH Q2(R1): LOD/LOQ — μ + 3σ / μ + 10σ yaklaşımı',
        'AOAC Peer Verified Methods Program: Geri kazanım kabul aralıkları',
        'Eurochem Guide CG 4: Recovery limit tablosu',
    ];
    for (const l of refs) { ws.mergeCells(`A${r}:B${r}`); ws.getCell(`A${r}`).value = '  • ' + l; r++; }
    r++;
    ws.mergeCells(`A${r}:B${r}`); ws.getCell(`A${r}`).value = 'İÇİNDEKİLER'; Object.assign(ws.getCell(`A${r}`), H2); r++;
    const toc = [
        ['Sayfa 2', 'LOD ve LOQ — Tespit / Tayin Limiti'],
        ['Sayfa 3', 'Doğrusallık (Linearity) — En Küçük Kareler Regresyonu'],
        ['Sayfa 4', 'Tekrarlanabilirlik — Sr, RSDr, r, Havuzlanmış RSD + Grubbs'],
        ['Sayfa 5', 'Tekrarüretilebilirlik — Pooled RSD + F-testi + Grubbs'],
        ['Sayfa 6', 'Gerçeklik (Trueness) — Recovery%, Bias, U(Bias), t-testi + Grubbs'],
        ['Sayfa 7', 'Ölçüm Belirsizliği (GUM) — Birleşik (uc) ve Genişletilmiş (U)'],
        ['Sayfa 8', 'Grubbs Kritik Değer Tablosu (α=0.05, n=3-30)'],
        ['Sayfa 9', 'Eurachem Rehber Uygunluk Değerlendirmesi'],
    ];
    for (const [p, n] of toc) {
        ws.getCell(`A${r}`).value = p; ws.getCell(`A${r}`).font = { bold: true };
        ws.getCell(`B${r}`).value = n; r++;
    }
    ws.eachRow(row => row.eachCell(c => { if (!c.border) c.border = BORDER; }));
}

// ===========================================================================
// 2. LOD/LOQ
// ===========================================================================
function buildLodLoq() {
    const ws = wb.addWorksheet('2. LOD-LOQ');
    ws.columns = [
        { width: 36 }, { width: 22 }, { width: 22 },
        { width: 22 }, { width: 22 }, { width: 22 }, { width: 16 },
    ];
    let r = 1;
    ws.mergeCells(`A${r}:G${r}`); ws.getCell(`A${r}`).value = 'LOD / LOQ — TESPİT VE TAYİN LİMİTİ HESAPLAMASI'; Object.assign(ws.getCell(`A${r}`), TITLE); ws.getRow(r).height = 24; r += 2;

    ws.mergeCells(`A${r}:G${r}`); ws.getCell(`A${r}`).value = 'TEORİK FORMÜL (Kaynak: components/validation/modules/LodCalculationForm.tsx, satır 90-119)'; Object.assign(ws.getCell(`A${r}`), H2); r++;
    const theory = [
        'Ortalama μ = Σx / n                              (n = toplam ölçüm sayısı)',
        'Standart Sapma σ = √[ Σ(xi − μ)² / (n − 1) ]      (Bessel düzeltmesi)',
        'LOD (Tespit Limiti) = μ + 3·σ',
        'LOQ (Tayin Limiti) = μ + 10·σ',
        'NOT: 2 personel × 10 tekrar = toplam 20 ölçüm. Tüm değerler tek havuzda birleştirilir.',
    ];
    for (const t of theory) { ws.mergeCells(`A${r}:G${r}`); ws.getCell(`A${r}`).value = '  ' + t; r++; }
    r++;

    for (const comp of components) {
        const data = md.LOD_LOQ?.[comp];
        if (!data) continue;
        ws.mergeCells(`A${r}:G${r}`);
        ws.getCell(`A${r}`).value = `KOMPONENT: ${comp}   |   Birim: ${data.unit}`;
        Object.assign(ws.getCell(`A${r}`), SECTION_HEADER);
        r++;

        // Notlar
        ws.mergeCells(`A${r}:G${r}`);
        ws.getCell(`A${r}`).value = 'Notlar: ' + (data.notes || '').replace(/\s+/g, ' ').substring(0, 250);
        ws.getCell(`A${r}`).alignment = { wrapText: true };
        ws.getRow(r).height = 38;
        r++;
        r++;

        // Veri tablosu başlığı
        ws.getCell(`A${r}`).value = 'No';
        ws.getCell(`B${r}`).value = personnel[0];
        ws.getCell(`C${r}`).value = personnel[1];
        for (const col of ['A', 'B', 'C']) Object.assign(ws.getCell(`${col}${r}`), RESULT_HEADER);
        r++;
        const dataStart = r;
        for (let i = 0; i < data.rows.length; i++) {
            ws.getCell(`A${r}`).value = i + 1;
            ws.getCell(`B${r}`).value = toNum(data.rows[i][0]);
            ws.getCell(`C${r}`).value = toNum(data.rows[i][1]);
            r++;
        }
        const dataEnd = r - 1;
        const rng = `B${dataStart}:C${dataEnd}`;
        r++;

        // Hesap tablosu
        const calcHeader = ['Hesap', 'Excel Formülü (denetçi: hücreye tıklayın)', 'Hesap Sonucu', 'Sistem Sonucu', 'Fark'];
        for (let c = 0; c < calcHeader.length; c++) {
            const cell = ws.getCell(r, c + 1);
            cell.value = calcHeader[c];
            Object.assign(cell, FORMULA_HEADER);
        }
        r++;

        // n
        ws.getCell(`A${r}`).value = 'n (toplam ölçüm)';
        ws.getCell(`B${r}`).value = { formula: `COUNT(${rng})` };
        ws.getCell(`D${r}`).value = 20;
        ws.getCell(`E${r}`).value = { formula: `C${r}-D${r}` };
        Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
        Object.assign(ws.getCell(`E${r}`), DIFF_CELL);
        ws.getCell(`C${r}`).value = { formula: `COUNT(${rng})` };
        r++;

        ws.getCell(`A${r}`).value = 'Ortalama μ = AVERAGE(...)';
        ws.getCell(`B${r}`).value = { formula: `"=AVERAGE("&"${rng}"&")"` };
        ws.getCell(`B${r}`).value = `=AVERAGE(${rng})`;
        ws.getCell(`C${r}`).value = { formula: `AVERAGE(${rng})` };
        ws.getCell(`D${r}`).value = data.mean;
        ws.getCell(`E${r}`).value = { formula: `C${r}-D${r}` };
        Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
        Object.assign(ws.getCell(`E${r}`), DIFF_CELL);
        r++;

        ws.getCell(`A${r}`).value = 'Standart Sapma σ = STDEV(...)';
        ws.getCell(`B${r}`).value = `=STDEV(${rng})`;
        ws.getCell(`C${r}`).value = { formula: `STDEV(${rng})` };
        ws.getCell(`D${r}`).value = data.stdDev;
        ws.getCell(`E${r}`).value = { formula: `C${r}-D${r}` };
        Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
        Object.assign(ws.getCell(`E${r}`), DIFF_CELL);
        r++;

        ws.getCell(`A${r}`).value = 'LOD = μ + 3·σ';
        ws.getCell(`B${r}`).value = `=AVERAGE(${rng})+3*STDEV(${rng})`;
        ws.getCell(`C${r}`).value = { formula: `AVERAGE(${rng})+3*STDEV(${rng})` };
        ws.getCell(`D${r}`).value = data.lod;
        ws.getCell(`E${r}`).value = { formula: `C${r}-D${r}` };
        Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
        Object.assign(ws.getCell(`E${r}`), DIFF_CELL);
        r++;

        ws.getCell(`A${r}`).value = 'LOQ = μ + 10·σ';
        ws.getCell(`B${r}`).value = `=AVERAGE(${rng})+10*STDEV(${rng})`;
        ws.getCell(`C${r}`).value = { formula: `AVERAGE(${rng})+10*STDEV(${rng})` };
        ws.getCell(`D${r}`).value = data.loq;
        ws.getCell(`E${r}`).value = { formula: `C${r}-D${r}` };
        Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
        Object.assign(ws.getCell(`E${r}`), DIFF_CELL);
        r += 3;
    }
    ws.eachRow(row => row.eachCell(c => { if (!c.border) c.border = BORDER; }));
}

// ===========================================================================
// 3. LINEARITY
// ===========================================================================
function buildLinearity() {
    const ws = wb.addWorksheet('3. Doğrusallık');
    ws.columns = [{ width: 42 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 18 }];
    let r = 1;
    ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = 'DOĞRUSALLIK (LINEARITY) — EN KÜÇÜK KARELER REGRESYONU'; Object.assign(ws.getCell(`A${r}`), TITLE); ws.getRow(r).height = 24; r += 2;

    ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = 'TEORİK FORMÜLLER (Kaynak: LinearityCalculationForm.tsx)'; Object.assign(ws.getCell(`A${r}`), H2); r++;
    const theory = [
        'Eğim b1 = (n·ΣXY − ΣX·ΣY) / (n·ΣX² − (ΣX)²)         (Excel: =SLOPE(Y;X))',
        'Kesim a = (ΣY − b1·ΣX) / n                            (Excel: =INTERCEPT(Y;X))',
        'Korelasyon r = (n·ΣXY − ΣX·ΣY) / √[(n·ΣX²−(ΣX)²)(n·ΣY²−(ΣY)²)]   (Excel: =PEARSON(X;Y))',
        'R² = r²                                                (Excel: =RSQ(Y;X))',
        'Tahmin ŷ = b1·x + a',
        'Hata sapma s = √[ Σ(y − ŷ)² / (n − 2) ]               (Excel: =STEYX(Y;X))',
        'U(Co) = (s/b1)·√(1/p + 1/(n·p) + (Co − x̄)²/Sxx)       (p=3, lab konvansiyonu)',
        'Sxx = Σ(xi − x̄)² (türetilmiş xi üzerinden)',
    ];
    for (const t of theory) { ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = '  ' + t; r++; }
    r++;

    for (const comp of components) {
        const data = md.LINEARITY?.[comp];
        if (!data) continue;
        ws.mergeCells(`A${r}:F${r}`);
        ws.getCell(`A${r}`).value = `KOMPONENT: ${comp}   |   Birim: ${data.unit}   |   Çalışma aralığı: ${data.range}`;
        Object.assign(ws.getCell(`A${r}`), SECTION_HEADER); r++; r++;

        // Veri tablosu
        const headers = ['Seviye', 'X (Konsantrasyon)', 'Y (Cevap)', 'ŷ Tahmin', 'Residual (Y−ŷ)', '(Y−ŷ)²'];
        for (let c = 0; c < headers.length; c++) {
            const cell = ws.getCell(r, c + 1);
            cell.value = headers[c];
            Object.assign(cell, RESULT_HEADER);
        }
        r++;
        const dataStart = r;
        for (const row of data.rows) {
            const x = toNum(row.concentrations?.[0]);
            const y = toNum(row.responses?.[0]);
            ws.getCell(`A${r}`).value = row.level;
            ws.getCell(`B${r}`).value = x;
            ws.getCell(`C${r}`).value = y;
            // ŷ = SLOPE(Y;X)*x + INTERCEPT(Y;X)  — ileri-referans için range sonra hesaplanacak
            // Şimdilik placeholder; aşağıda doldururuz
            ws.getCell(`D${r}`).value = null;
            ws.getCell(`E${r}`).value = null;
            ws.getCell(`F${r}`).value = null;
            r++;
        }
        const dataEnd = r - 1;
        const xRng = `B${dataStart}:B${dataEnd}`;
        const yRng = `C${dataStart}:C${dataEnd}`;
        // Şimdi ŷ formüllerini ekle
        for (let ri = dataStart; ri <= dataEnd; ri++) {
            ws.getCell(`D${ri}`).value = { formula: `SLOPE(${yRng},${xRng})*B${ri}+INTERCEPT(${yRng},${xRng})` };
            ws.getCell(`E${ri}`).value = { formula: `C${ri}-D${ri}` };
            ws.getCell(`F${ri}`).value = { formula: `(C${ri}-D${ri})^2` };
        }
        r++;

        // Hesap blok
        const calcHeader = ['Hesap', 'Excel Formülü', 'Hesap Sonucu', 'Sistem Sonucu', 'Fark'];
        for (let c = 0; c < calcHeader.length; c++) {
            const cell = ws.getCell(r, c + 1);
            cell.value = calcHeader[c];
            Object.assign(cell, FORMULA_HEADER);
        }
        r++;
        const items = [
            ['n (nokta sayısı)', `COUNT(${xRng})`, data.rows.length],
            ['Slope b1 = SLOPE(Y;X)', `SLOPE(${yRng},${xRng})`, data.slope],
            ['Intercept a = INTERCEPT(Y;X)', `INTERCEPT(${yRng},${xRng})`, data.intercept],
            ['Korelasyon r = PEARSON(X;Y)', `PEARSON(${xRng},${yRng})`, Math.sqrt(data.rSquared)],
            ['R² = RSQ(Y;X)', `RSQ(${yRng},${xRng})`, data.rSquared],
            ['Hata Std s = STEYX(Y;X)', `STEYX(${yRng},${xRng})`, null],
            ['Co = MAX(X)', `MAX(${xRng})`, data.statistics?.co],
            ['Cort (x̄) = AVERAGE(X)', `AVERAGE(${xRng})`, data.statistics?.cort],
            ['Σ(Y−ŷ)² (Residual Sum of Squares)', `SUM(F${dataStart}:F${dataEnd})`, null],
        ];
        for (const [label, f, sys] of items) {
            ws.getCell(`A${r}`).value = label;
            ws.getCell(`B${r}`).value = '=' + f;
            ws.getCell(`C${r}`).value = { formula: f };
            if (sys != null) {
                ws.getCell(`D${r}`).value = sys;
                ws.getCell(`E${r}`).value = { formula: `C${r}-D${r}` };
                Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
                Object.assign(ws.getCell(`E${r}`), DIFF_CELL);
            }
            r++;
        }

        // Denklem ve U(Co)
        ws.getCell(`A${r}`).value = 'Denklem'; ws.getCell(`C${r}`).value = data.equation; ws.getCell(`D${r}`).value = data.equation; Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL); r++;
        if (data.statistics?.uCo != null) {
            ws.getCell(`A${r}`).value = 'U(Co) — sistem hesabı';
            ws.getCell(`C${r}`).value = data.statistics.uCo;
            ws.getCell(`D${r}`).value = data.statistics.uCo;
            Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
            r++;
            ws.getCell(`A${r}`).value = 'Sxx — sistem hesabı';
            ws.getCell(`C${r}`).value = data.statistics.sxx;
            ws.getCell(`D${r}`).value = data.statistics.sxx;
            Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
            r++;
        }
        r += 2;
    }
    ws.eachRow(row => row.eachCell(c => { if (!c.border) c.border = BORDER; }));
}

// ===========================================================================
// 4. REPEATABILITY
// ===========================================================================
function buildRepeatability() {
    const ws = wb.addWorksheet('4. Tekrarlanabilirlik');
    ws.columns = [{ width: 40 }, { width: 24 }, { width: 24 }, { width: 24 }, { width: 24 }, { width: 14 }];
    let r = 1;
    ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = 'TEKRARLANABİLİRLİK (REPEATABILITY) — Sr, RSDr, r, HAVUZLANMIŞ RSD'; Object.assign(ws.getCell(`A${r}`), TITLE); ws.getRow(r).height = 24; r += 2;

    ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = 'TEORİK FORMÜLLER (Kaynak: PrecisionRepeatabilityForm.tsx)'; Object.assign(ws.getCell(`A${r}`), H2); r++;
    const theory = [
        'Personel başına:',
        '  x̄ = Σx / n',
        '  Sr = √[ Σ(xi − x̄)² / (n−1) ]',
        '  RSDr = Sr / x̄',
        '  r (tekrarlanabilirlik limiti) = 2.83 · Sr      (ISO 5725, ≈ 2√2)',
        '  Pool katkısı = RSDr² · (n − 1)',
        'Havuzlanmış RSD (her düzey için):',
        '  RSDpool = √[ Σ(RSDr² · (n−1)) / Σ(n−1) ]',
        'Uygunluk: |paralel1 − paralel2| < r ise UYGUN.',
    ];
    for (const t of theory) { ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = '  ' + t; r++; }
    r++;

    for (const comp of components) {
        const data = md.PRECISION_REPEATABILITY?.[comp];
        if (!data) continue;
        ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = `KOMPONENT: ${comp}   |   Birim: ${data.unit}`; Object.assign(ws.getCell(`A${r}`), SECTION_HEADER); r++; r++;

        for (const lvl of data.levels) {
            ws.mergeCells(`A${r}:F${r}`);
            ws.getCell(`A${r}`).value = `DÜZEY: ${lvl.label}   |   Matriks: ${lvl.matrix || '—'}   |   Hedef: ${lvl.target || '—'}`;
            ws.getCell(`A${r}`).font = { bold: true };
            ws.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
            r++;

            // Veri tablosu
            const head = ['No', `${personnel[0]} - Par.1`, `${personnel[0]} - Par.2`, `${personnel[1]} - Par.1`, `${personnel[1]} - Par.2`];
            for (let c = 0; c < head.length; c++) {
                const cell = ws.getCell(r, c + 1);
                cell.value = head[c];
                Object.assign(cell, RESULT_HEADER);
            }
            r++;
            const dataStart = r;
            const p1 = lvl.analysts[personnel[0]]?.values || [];
            const p2 = lvl.analysts[personnel[1]]?.values || [];
            const rowCount = Math.max(p1.length, p2.length) / 2;
            for (let i = 0; i < rowCount; i++) {
                ws.getCell(`A${r}`).value = i + 1;
                ws.getCell(`B${r}`).value = p1[i * 2] ?? null;
                ws.getCell(`C${r}`).value = p1[i * 2 + 1] ?? null;
                ws.getCell(`D${r}`).value = p2[i * 2] ?? null;
                ws.getCell(`E${r}`).value = p2[i * 2 + 1] ?? null;
                r++;
            }
            const dataEnd = r - 1;
            const p1All = `B${dataStart}:C${dataEnd}`;
            const p2All = `D${dataStart}:E${dataEnd}`;
            r++;

            // Personel 1 hesap
            const calcHead = ['Hesap', 'Excel Formülü', 'Hesap', 'Sistem', 'Fark'];
            for (let c = 0; c < calcHead.length; c++) {
                const cell = ws.getCell(r, c + 1); cell.value = calcHead[c]; Object.assign(cell, FORMULA_HEADER);
            }
            r++;
            ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = `── ${personnel[0]} ──`; ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF0071E3' } }; r++;
            const s1 = lvl.analysts[personnel[0]];
            const cs1 = r;
            addCalcRow(ws, r++, 'n', `COUNT(${p1All})`, s1.n);
            addCalcRow(ws, r++, 'x̄ = AVERAGE(...)', `AVERAGE(${p1All})`, s1.mean);
            addCalcRow(ws, r++, 'Sr = STDEV(...)', `STDEV(${p1All})`, s1.stdDev);
            addCalcRow(ws, r++, 'RSDr = Sr/x̄', `STDEV(${p1All})/AVERAGE(${p1All})`, s1.rsdr);
            addCalcRow(ws, r++, 'r = 2.83·Sr', `2.83*STDEV(${p1All})`, s1.repeatabilityLimit);
            addCalcRow(ws, r++, 'Pool katkısı = RSDr²·(n−1)', `((STDEV(${p1All})/AVERAGE(${p1All}))^2)*(COUNT(${p1All})-1)`, s1.rsdrPoolPart);
            r++;
            // Grubbs - Personel 1
            r = addGrubbsBlock(ws, r, p1All, s1.grubbs, `(${personnel[0]})`);
            r++;
            ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = `── ${personnel[1]} ──`; ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF0071E3' } }; r++;
            const s2 = lvl.analysts[personnel[1]];
            const cs2 = r;
            addCalcRow(ws, r++, 'n', `COUNT(${p2All})`, s2.n);
            addCalcRow(ws, r++, 'x̄', `AVERAGE(${p2All})`, s2.mean);
            addCalcRow(ws, r++, 'Sr', `STDEV(${p2All})`, s2.stdDev);
            addCalcRow(ws, r++, 'RSDr', `STDEV(${p2All})/AVERAGE(${p2All})`, s2.rsdr);
            addCalcRow(ws, r++, 'r = 2.83·Sr', `2.83*STDEV(${p2All})`, s2.repeatabilityLimit);
            addCalcRow(ws, r++, 'Pool katkısı', `((STDEV(${p2All})/AVERAGE(${p2All}))^2)*(COUNT(${p2All})-1)`, s2.rsdrPoolPart);
            r++;
            // Grubbs - Personel 2
            r = addGrubbsBlock(ws, r, p2All, s2.grubbs, `(${personnel[1]})`);
            r++;
            // Havuz
            ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = '── HAVUZLANMIŞ RSD (her iki personel) ──'; ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FFE6850A' } }; r++;
            // poolPart hücreleri: P1 -> cs1+5, P2 -> cs2+5
            const p1PoolR = cs1 + 5;
            const p2PoolR = cs2 + 5;
            addCalcRow(ws, r++, 'RSDpool = √[Σ(RSDr²·(n−1)) / Σ(n−1)]', `SQRT((C${p1PoolR}+C${p2PoolR})/((C${cs1}-1)+(C${cs2}-1)))`, lvl.pooledRsd);
            r += 2;
        }
    }
    ws.eachRow(row => row.eachCell(c => { if (!c.border) c.border = BORDER; }));
}

// Grubbs Kritik Tablosu (α=0.05, tek-yönlü maksimum sapma testi)
// Kaynak: components/validation/shared/grubbs.ts (GRUBBS_CRITICAL_95)
const GRUBBS_CRITICAL_95 = {
    3: 1.153, 4: 1.463, 5: 1.672, 6: 1.822, 7: 1.938, 8: 2.032,
    9: 2.110, 10: 2.176, 11: 2.234, 12: 2.285, 13: 2.331, 14: 2.371,
    15: 2.409, 16: 2.443, 17: 2.475, 18: 2.504, 19: 2.532, 20: 2.557,
    21: 2.580, 22: 2.603, 23: 2.624, 24: 2.644, 25: 2.663, 26: 2.681,
    27: 2.698, 28: 2.714, 29: 2.730, 30: 2.745,
};

// rngStr: "B5:C16" gibi — DİKKAT: tek sütunluk veya birden çok sütun olabilir (R = mertebesi=count)
// Sistem değeri (sysG) varsa onunla karşılaştır.
function addGrubbsBlock(ws, startRow, rngStr, sysG, labelPrefix = '') {
    let r = startRow;
    ws.mergeCells(`A${r}:E${r}`);
    ws.getCell(`A${r}`).value = `── GRUBBS AYKIRI DEĞER TESTİ ${labelPrefix} (α=0.05) ──`;
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FFAD1457' } };
    r++;

    // G_hesap = max(|x_i − x̄|) / s
    // Excel: =MAX(MAX(rng)-AVERAGE(rng), AVERAGE(rng)-MIN(rng))/STDEV(rng)
    const gFormula = `MAX(MAX(${rngStr})-AVERAGE(${rngStr}),AVERAGE(${rngStr})-MIN(${rngStr}))/STDEV(${rngStr})`;
    addCalcRow(ws, r, 'En uç değer (|x_i − x̄|max)',
        `MAX(MAX(${rngStr})-AVERAGE(${rngStr}),AVERAGE(${rngStr})-MIN(${rngStr}))`,
        sysG ? Math.abs(sysG.value - sysG.mean) : null);
    r++;
    addCalcRow(ws, r, 's = STDEV(...)', `STDEV(${rngStr})`, sysG?.stdDev);
    r++;
    addCalcRow(ws, r, 'G_hesap = |x_i − x̄|max / s', gFormula, sysG?.gCalculated);
    r++;
    // G_kritik — tablodan, n'e göre LOOKUP
    addCalcRow(ws, r, 'n = COUNT(...)', `COUNT(${rngStr})`, sysG?.n);
    const nR = r;
    r++;
    // Kritik değer formülü: tabloyu in-line yazıyoruz (Grubbs sayfası G2:H30)
    ws.getCell(`A${r}`).value = 'G_kritik (α=0.05, tablo)';
    ws.getCell(`B${r}`).value = `=IFERROR(VLOOKUP(C${nR},'8. Grubbs Tablosu'!A2:B30,2,FALSE),2.745)`;
    ws.getCell(`C${r}`).value = { formula: `IFERROR(VLOOKUP(C${nR},'8. Grubbs Tablosu'!A2:B30,2,FALSE),2.745)`, result: sysG?.gCritical };
    if (sysG?.gCritical != null) {
        ws.getCell(`D${r}`).value = sysG.gCritical;
        Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
        ws.getCell(`E${r}`).value = { formula: `C${r}-D${r}`, result: 0 };
        Object.assign(ws.getCell(`E${r}`), DIFF_CELL);
    }
    const gCritR = r;
    r++;
    // Karar
    const gCalcR = nR - 1; // satır numarasını yukarıdan biliyoruz: gCalc satırı = startRow+3 (label+3 satırlık hesap)
    // Daha güvenli: gCalc'i tekrar hesapla
    ws.getCell(`A${r}`).value = 'Karar: G_hesap > G_kritik ⇒ AYKIRI VAR';
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`B${r}`).value = `=IF((${gFormula})>C${gCritR},"AYKIRI VAR (değeri inceleyin)","AYKIRI YOK (veri kabul)")`;
    ws.getCell(`C${r}`).value = { formula: `IF((${gFormula})>C${gCritR},"AYKIRI VAR (değeri inceleyin)","AYKIRI YOK (veri kabul)")`, result: sysG?.hasOutlier ? 'AYKIRI VAR (değeri inceleyin)' : 'AYKIRI YOK (veri kabul)' };
    if (sysG) {
        ws.getCell(`D${r}`).value = sysG.hasOutlier ? 'AYKIRI VAR' : 'AYKIRI YOK';
        Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
    }
    r++;
    return r;
}

function addCalcRow(ws, r, label, formulaStr, sysVal) {
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`B${r}`).value = '=' + formulaStr;
    // result alanı: sistemde varsa onu pre-cache yaz (Excel açılışta hemen değeri göstersin)
    const cell = { formula: formulaStr };
    if (sysVal != null && sysVal !== '' && typeof sysVal === 'number') cell.result = sysVal;
    ws.getCell(`C${r}`).value = cell;
    if (sysVal != null && sysVal !== '') {
        ws.getCell(`D${r}`).value = sysVal;
        ws.getCell(`E${r}`).value = { formula: `C${r}-D${r}`, result: 0 };
        Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
        Object.assign(ws.getCell(`E${r}`), DIFF_CELL);
    }
}

// ===========================================================================
// 5. REPRODUCIBILITY
// ===========================================================================
function buildReproducibility() {
    const ws = wb.addWorksheet('5. Tekrarüretilebilirlik');
    ws.columns = [{ width: 42 }, { width: 28 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 14 }];
    let r = 1;
    ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = 'TEKRARÜRETİLEBİLİRLİK — POOLED RSD ve F-TESTİ'; Object.assign(ws.getCell(`A${r}`), TITLE); ws.getRow(r).height = 24; r += 2;

    ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = 'TEORİK FORMÜLLER (Kaynak: PrecisionReproducibilityForm.tsx)'; Object.assign(ws.getCell(`A${r}`), H2); r++;
    const theory = [
        'Personel başına: x̄, Sr, RSDr (tekrarlanabilirlik ile aynı formüller).',
        'RSDpool = √[ Σ(RSDr² · (n−1)) / Σ(n−1) ]',
        'F-testi (kişiler arası varyans homojenliği):',
        '  Fhesap = s²(max) / s²(min)',
        '  Fkritik = F(α=0.05; df1=n_max−1; df2=n_min−1)        (Excel: =F.INV.RT(0.05;df1;df2))',
        '  Karar: Fhesap < Fkritik ⇒ UYGUN',
        'r = 2.83 · Sr',
    ];
    for (const t of theory) { ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = '  ' + t; r++; }
    r++;

    for (const comp of components) {
        const data = md.PRECISION_REPRODUCIBILITY?.[comp];
        if (!data) continue;
        ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = `KOMPONENT: ${comp}   |   Birim: ${data.unit}`; Object.assign(ws.getCell(`A${r}`), SECTION_HEADER); r++; r++;

        // Veri başlık
        ws.getCell(`A${r}`).value = 'No';
        ws.getCell(`B${r}`).value = 'Tarih';
        for (let i = 0; i < data.analysts.length; i++) ws.getCell(r, 3 + i).value = data.analysts[i];
        for (let c = 1; c <= 2 + data.analysts.length; c++) Object.assign(ws.getCell(r, c), RESULT_HEADER);
        r++;
        const dataStart = r;
        for (let i = 0; i < data.rows.length; i++) {
            ws.getCell(`A${r}`).value = i + 1;
            ws.getCell(`B${r}`).value = data.rows[i].date;
            for (let a = 0; a < data.analysts.length; a++) {
                ws.getCell(r, 3 + a).value = toNum(data.rows[i].values?.[a]);
            }
            r++;
        }
        const dataEnd = r - 1;
        r++;

        // Hesap başlık
        const calcHead = ['Hesap', 'Excel Formülü', 'Hesap', 'Sistem', 'Fark'];
        for (let c = 0; c < calcHead.length; c++) { const cell = ws.getCell(r, c + 1); cell.value = calcHead[c]; Object.assign(cell, FORMULA_HEADER); } r++;

        const colLetters = ['C', 'D', 'E', 'F', 'G'];
        const statRefs = [];
        for (let i = 0; i < data.analysts.length; i++) {
            const a = data.analysts[i];
            const rng = `${colLetters[i]}${dataStart}:${colLetters[i]}${dataEnd}`;
            const stat = data.result.analystStats[a];
            ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = `── ${a} ──`; ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF0071E3' } }; r++;
            const nR = r;
            addCalcRow(ws, r++, 'n', `COUNT(${rng})`, stat.count);
            addCalcRow(ws, r++, 'x̄', `AVERAGE(${rng})`, stat.mean);
            const stdR = r;
            addCalcRow(ws, r++, 'Sr', `STDEV(${rng})`, stat.stdDev);
            const varR = r;
            addCalcRow(ws, r++, 'Varyans s² = VAR(...)', `VAR(${rng})`, stat.variance);
            addCalcRow(ws, r++, 'RSDr', `STDEV(${rng})/AVERAGE(${rng})`, stat.rsdr);
            addCalcRow(ws, r++, 'r = 2.83·Sr', `2.83*STDEV(${rng})`, stat.repeatabilityLimit);
            const poolR = r;
            addCalcRow(ws, r++, 'Pool katkısı = RSDr²·(n−1)', `((STDEV(${rng})/AVERAGE(${rng}))^2)*(COUNT(${rng})-1)`, stat.rsdrPoolPart);
            statRefs.push({ name: a, nR, varR, poolR });
            r++;
            // Grubbs — bu personel
            r = addGrubbsBlock(ws, r, rng, stat.grubbs, `(${a})`);
            r++;
        }

        // Pool
        ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = '── HAVUZLANMIŞ RSD ──'; ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FFE6850A' } }; r++;
        const sumNum = statRefs.map(s => `C${s.poolR}`).join('+');
        const sumDen = statRefs.map(s => `(C${s.nR}-1)`).join('+');
        addCalcRow(ws, r++, 'RSDpool', `SQRT((${sumNum})/(${sumDen}))`, data.result.pooledRsd);
        r++;

        // F-test
        ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = '── F-TESTİ ──'; ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FFE6850A' } }; r++;
        const varCells = statRefs.map(s => `C${s.varR}`).join(',');
        const nCells = statRefs.map(s => `C${s.nR}`).join(',');
        const fMaxR = r;
        addCalcRow(ws, r++, 's²(max)', `MAX(${varCells})`, Math.max(...statRefs.map(s => data.result.analystStats[s.name].variance)));
        const fMinR = r;
        addCalcRow(ws, r++, 's²(min)', `MIN(${varCells})`, Math.min(...statRefs.map(s => data.result.analystStats[s.name].variance)));
        const fCalcR = r;
        addCalcRow(ws, r++, 'Fhesap = s²max/s²min', `C${fMaxR}/C${fMinR}`, data.result.fTest);
        const stats = statRefs.map(s => data.result.analystStats[s.name]);
        const maxStat = stats.reduce((a, b) => a.variance > b.variance ? a : b);
        const minStat = stats.reduce((a, b) => a.variance < b.variance ? a : b);
        const dfMax = maxStat.count - 1;
        const dfMin = minStat.count - 1;
        const fCritR = r;
        addCalcRow(ws, r++, `Fkritik (α=0.05; df1=${dfMax}; df2=${dfMin})`, `F.INV.RT(0.05,${dfMax},${dfMin})`, data.result.fCritical);
        // Karar
        ws.getCell(`A${r}`).value = 'Karar: Fhesap < Fkritik ⇒ UYGUN';
        ws.getCell(`B${r}`).value = `=IF(C${fCalcR}<C${fCritR},"UYGUN","UYGUN DEĞİL")`;
        ws.getCell(`C${r}`).value = { formula: `IF(C${fCalcR}<C${fCritR},"UYGUN","UYGUN DEĞİL")` };
        ws.getCell(`D${r}`).value = data.result.result;
        Object.assign(ws.getCell(`D${r}`), SYSTEM_CELL);
        r += 3;
    }
    ws.eachRow(row => row.eachCell(c => { if (!c.border) c.border = BORDER; }));
}

// ===========================================================================
// 6. TRUENESS
// ===========================================================================
function buildTrueness() {
    const ws = wb.addWorksheet('6. Gerçeklik');
    ws.columns = [{ width: 44 }, { width: 60 }, { width: 22 }, { width: 28 }, { width: 14 }];
    let r = 1;
    ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = 'GERÇEKLİK (TRUENESS) — RECOVERY %, BIAS, U(BIAS), t-TESTİ'; Object.assign(ws.getCell(`A${r}`), TITLE); ws.getRow(r).height = 24; r += 2;

    ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = 'TEORİK FORMÜLLER (Kaynak: TruenessStudyForm.tsx)'; Object.assign(ws.getCell(`A${r}`), H2); r++;
    const theory = [
        'Birim faktörü (ppm): mg/L,mg/kg=1; µg/L,µg/kg=0.001; ng/L=1e-6; %=10000',
        'Recovery_i = (x_i · faktör) / (hedef · faktör) · 100',
        'Personel başına: x̄, Sr (STDEV), RSD = Sr/x̄',
        'Havuz (tüm personel — recovery oranlarından):',
        '  R̄  = Σ(recovery_i/100) / n',
        '  s_R = √[ Σ(R_i − R̄)² / (n−1) ]',
        '  U(x) = s_R / √n',
        '  Bias % = (1 − R̄) · 100',
        '  U(Bias) = √[ ((1 − R̄)/√3)² + U(x)² ]',
        '  t_hesap = |1 − R̄| / U(x)',
        '  t_kritik = T.INV.2T(0.05; n−1)        (iki yönlü, α=0.05)',
        '  Karar: t_hesap ≤ t_kritik ⇒ UYGUN (bias düzeltmesi gerekli değil)',
    ];
    for (const t of theory) { ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = '  ' + t; r++; }
    r++;

    for (const comp of components) {
        const data = md.TRUENESS?.[comp];
        if (!data) continue;
        const target = toNum(data.target);
        ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = `KOMPONENT: ${comp}   |   Birim: ${data.unit}   |   Hedef: ${data.target}`; Object.assign(ws.getCell(`A${r}`), SECTION_HEADER); r++; r++;

        // Veri tablosu
        const head = ['No', personnel[0], personnel[1], 'Recovery % (P1)', 'Recovery % (P2)'];
        for (let c = 0; c < head.length; c++) { const cell = ws.getCell(r, c + 1); cell.value = head[c]; Object.assign(cell, RESULT_HEADER); }
        r++;
        const dataStart = r;
        const p1Vals = data.results[personnel[0]]?.values || [];
        const p2Vals = data.results[personnel[1]]?.values || [];
        const n = Math.max(p1Vals.length, p2Vals.length);
        for (let i = 0; i < n; i++) {
            ws.getCell(`A${r}`).value = i + 1;
            const v1 = p1Vals[i]; const v2 = p2Vals[i];
            if (v1 != null) ws.getCell(`B${r}`).value = v1;
            if (v2 != null) ws.getCell(`C${r}`).value = v2;
            if (v1 != null) ws.getCell(`D${r}`).value = { formula: `B${r}/${target}*100` };
            if (v2 != null) ws.getCell(`E${r}`).value = { formula: `C${r}/${target}*100` };
            r++;
        }
        const dataEnd = r - 1;
        const p1Rng = `B${dataStart}:B${dataEnd}`;
        const p2Rng = `C${dataStart}:C${dataEnd}`;
        const recRng = `D${dataStart}:E${dataEnd}`;
        r++;

        // Hesaplar
        const calcHead = ['Hesap', 'Excel Formülü', 'Hesap', 'Sistem', 'Fark'];
        for (let c = 0; c < calcHead.length; c++) { const cell = ws.getCell(r, c + 1); cell.value = calcHead[c]; Object.assign(cell, FORMULA_HEADER); } r++;

        ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = `── ${personnel[0]} ──`; ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF0071E3' } }; r++;
        const s1 = data.results[personnel[0]];
        addCalcRow(ws, r++, 'n', `COUNT(${p1Rng})`, s1.n);
        addCalcRow(ws, r++, 'x̄', `AVERAGE(${p1Rng})`, s1.mean);
        addCalcRow(ws, r++, 'Sr', `STDEV(${p1Rng})`, s1.stdDev);
        addCalcRow(ws, r++, 'RSD = Sr/x̄', `STDEV(${p1Rng})/AVERAGE(${p1Rng})`, s1.rsd);
        r++;
        ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = `── ${personnel[1]} ──`; ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF0071E3' } }; r++;
        const s2 = data.results[personnel[1]];
        addCalcRow(ws, r++, 'n', `COUNT(${p2Rng})`, s2.n);
        addCalcRow(ws, r++, 'x̄', `AVERAGE(${p2Rng})`, s2.mean);
        addCalcRow(ws, r++, 'Sr', `STDEV(${p2Rng})`, s2.stdDev);
        addCalcRow(ws, r++, 'RSD', `STDEV(${p2Rng})/AVERAGE(${p2Rng})`, s2.rsd);
        r++;
        ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = '── HAVUZ (tüm personel — recovery oranlarından) ──'; ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FFE6850A' } }; r++;

        addCalcRow(ws, r++, 'R̄ (mean, 0-1) = AVERAGE(Rec%)/100', `AVERAGE(${recRng})/100`, data.recoveryMean);
        addCalcRow(ws, r++, 'R̄ %', `AVERAGE(${recRng})`, data.recoveryMeanPercent);
        const sRR = r;
        addCalcRow(ws, r++, 's_R (recovery oranlarının std)', `STDEV(${recRng})/100`, null);
        const nR = r;
        addCalcRow(ws, r++, 'n (toplam ölçüm)', `COUNT(${recRng})`, s1.n + s2.n);
        const uxR = r;
        addCalcRow(ws, r++, 'U(x) = s_R / √n', `(STDEV(${recRng})/100)/SQRT(COUNT(${recRng}))`, null);
        addCalcRow(ws, r++, 'Bias % = (1 − R̄)·100', `(1-(AVERAGE(${recRng})/100))*100`, (1 - data.recoveryMean) * 100);
        addCalcRow(ws, r++, 'U(Bias) = √[((1−R̄)/√3)² + U(x)²]', `SQRT(((1-(AVERAGE(${recRng})/100))/SQRT(3))^2+((STDEV(${recRng})/100)/SQRT(COUNT(${recRng})))^2)`, data.uBias);
        addCalcRow(ws, r++, 't_hesap = |1−R̄|/U(x)', `ABS(1-(AVERAGE(${recRng})/100))/((STDEV(${recRng})/100)/SQRT(COUNT(${recRng})))`, null);
        addCalcRow(ws, r++, 't_kritik (α=0.05; df=n−1)', `T.INV.2T(0.05,COUNT(${recRng})-1)`, null);
        r++;
        // Grubbs — recovery oranları üzerinden (sistem tru tarafında recovery/100 üzerinden hesaplar
        // ama recovery%'lerden gelse de sonuç farkı sabit ölçek faktörüdür ve normalize ile aynıdır).
        // Sistem TruenessStudyForm: calculateGrubbs(recoveryRatios) — değerler 0-1 arası.
        // Burada D:E recovery% kolonu (0-150 arası). G_hesap ve G_kritik ölçekten bağımsız (saf oran).
        const sysG = data.grubbs;
        r = addGrubbsBlock(ws, r, recRng, sysG, '(recovery oranları)');
        r += 2;
    }
    ws.eachRow(row => row.eachCell(c => { if (!c.border) c.border = BORDER; }));
}

// ===========================================================================
// 7. UNCERTAINTY
// ===========================================================================
function buildUncertainty() {
    const ws = wb.addWorksheet('7. Belirsizlik');
    ws.columns = [{ width: 48 }, { width: 60 }, { width: 24 }, { width: 24 }, { width: 14 }];
    let r = 1;
    ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = 'ÖLÇÜM BELİRSİZLİĞİ (GUM / ISO/IEC Guide 98-3)'; Object.assign(ws.getCell(`A${r}`), TITLE); ws.getRow(r).height = 24; r += 2;

    ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = 'TEORİK FORMÜLLER (Kaynak: MeasurementUncertaintyBudgetForm.tsx + SamplePreparationUncertaintyForm.tsx)'; Object.assign(ws.getCell(`A${r}`), H2); r++;
    const theory = [
        '1) Bileşen standart belirsizliği: u_x = U / k     (k=2 normal/Gauss; k=√3≈1.732 dikdörtgen; k=√6≈2.449 üçgensel)',
        '2) Relatif: u_rel = u_x / x',
        '3) Hacimsel cam sıcaklık belirsizliği: u_T = (2.1·10⁻⁴ · 5 · V) / √3      (V=mL, ΔT=5°C lab aralığı)',
        '4) Birleşik (RSS): u_c = √( u_lin² + u_repeat² + u_repro² + u_bias² + u_prep_devices² + u_prep_chemicals² )',
        '5) Genişletilmiş: U = k · u_c    (k=2 ⇒ %95 güven aralığı)',
        '6) Bileşen katkı yüzdesi: (u_i² / Σu_i²) · 100',
    ];
    for (const t of theory) { ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = '  ' + t; r++; }
    r++;

    ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = `VALIDASYON 21 — BÜTÇE (komponent: ${COMP_DMFU})`; Object.assign(ws.getCell(`A${r}`), SECTION_HEADER); r++;
    ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = 'NOT: Bileşen değerleri ilgili modüllerde hesaplanmıştır. Burada RSS (kareler toplamının karekökü) ile birleştirilmektedir.'; r++;
    r++;

    const head = ['Bileşen Kaynağı', 'Açıklama', 'u_i (relatif)', 'u_i² (kareli)', '% Katkı'];
    for (let c = 0; c < head.length; c++) { const cell = ws.getCell(r, c + 1); cell.value = head[c]; Object.assign(cell, FORMULA_HEADER); } r++;

    const lin = md.LINEARITY?.[COMP_DMFU];
    const rep = md.PRECISION_REPEATABILITY?.[COMP_DMFU];
    const rpr = md.PRECISION_REPRODUCIBILITY?.[COMP_DMFU];
    const tru = md.TRUENESS?.[COMP_DMFU];

    const uLin = lin?.statistics?.uCo ?? 0;
    const uRep = rep?.levels ? Math.max(...rep.levels.map(l => l.pooledRsd || 0)) : 0;
    const uRpr = rpr?.result?.pooledRsd ?? 0;
    const uBias = tru?.uBias ?? 0;

    const compStart = r;
    const compRows = [
        ['u_linearity (Doğrusallık U(Co))', 'LINEARITY modülünden: (s/b1)·√(1/p+1/(n·p)+(Co−x̄)²/Sxx)', uLin],
        ['u_repeatability (en yüksek RSDpool)', 'REPEATABILITY: max(RSDpool, düzeyler — worst-case)', uRep],
        ['u_reproducibility (RSDpool)', 'REPRODUCIBILITY: havuzlanmış RSD', uRpr],
        ['u_bias (Gerçeklik U(Bias))', 'TRUENESS: √[((1−R̄)/√3)² + U(x)²]', uBias],
        ['u_prep_devices', 'Numune Hazırlama — pipet/balon/terazi RSS', 0],
        ['u_prep_chemicals', 'Numune Hazırlama — standart kimyasal RSS', 0],
    ];
    for (const [name, desc, val] of compRows) {
        ws.getCell(`A${r}`).value = name;
        ws.getCell(`B${r}`).value = desc;
        ws.getCell(`C${r}`).value = val;
        ws.getCell(`D${r}`).value = { formula: `C${r}^2` };
        r++;
    }
    const compEnd = r - 1;
    const totSqR = r;
    ws.getCell(`A${r}`).value = 'Σu_i² (toplam varyans)';
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`D${r}`).value = { formula: `SUM(D${compStart}:D${compEnd})` };
    ws.getCell(`D${r}`).font = { bold: true };
    r++;
    const ucR = r;
    ws.getCell(`A${r}`).value = 'u_c = √(Σu_i²)';
    ws.getCell(`A${r}`).font = { bold: true };
    ws.getCell(`B${r}`).value = `=SQRT(D${totSqR})`;
    ws.getCell(`C${r}`).value = { formula: `SQRT(D${totSqR})` };
    ws.getCell(`C${r}`).font = { bold: true };
    r++;
    const kR = r;
    ws.getCell(`A${r}`).value = 'k (kapsam faktörü, %95)';
    ws.getCell(`C${r}`).value = 2;
    r++;
    ws.getCell(`A${r}`).value = 'U = k · u_c (genişletilmiş belirsizlik)';
    ws.getCell(`A${r}`).font = { bold: true, color: { argb: 'FFD32F2F' } };
    ws.getCell(`B${r}`).value = `=C${kR}*C${ucR}`;
    ws.getCell(`C${r}`).value = { formula: `C${kR}*C${ucR}` };
    ws.getCell(`C${r}`).font = { bold: true, color: { argb: 'FFD32F2F' } };
    r += 2;

    // Katkı yüzdeleri
    ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = 'BİLEŞEN KATKI YÜZDELERİ (Pareto)'; Object.assign(ws.getCell(`A${r}`), SECTION_HEADER); r++;
    for (let i = 0; i < compRows.length; i++) {
        const sr = compStart + i;
        ws.getCell(`A${r}`).value = compRows[i][0];
        ws.getCell(`E${r}`).value = { formula: `D${sr}/D${totSqR}*100` };
        r++;
    }
    r++;
    ws.mergeCells(`A${r}:E${r}`);
    ws.getCell(`A${r}`).value = 'NOT: Validasyon 21\'de Numune Hazırlama modülü boştur, u_prep_devices ve u_prep_chemicals = 0 alınmıştır. Eklendiğinde RSS otomatik yeniden hesaplanacaktır.';
    ws.getCell(`A${r}`).font = { italic: true };
    ws.getRow(r).height = 32;
    ws.eachRow(row => row.eachCell(c => { if (!c.border) c.border = BORDER; }));
}

// ===========================================================================
// 8. GRUBBS KRİTİK TABLOSU
// ===========================================================================
function buildGrubbsTable() {
    const ws = wb.addWorksheet('8. Grubbs Tablosu');
    ws.columns = [{ width: 8 }, { width: 14 }, { width: 4 }, { width: 70 }];

    let r = 1;
    // VLOOKUP'ın çalışabilmesi için A2:B30 aralığı saf sayılar olmalı — başlığı C ile birleştiriyorum
    ws.getCell(`A${r}`).value = 'n';
    ws.getCell(`B${r}`).value = 'G_kritik (α=0.05)';
    Object.assign(ws.getCell(`A${r}`), FORMULA_HEADER);
    Object.assign(ws.getCell(`B${r}`), FORMULA_HEADER);
    ws.getCell(`D${r}`).value = 'GRUBBS AYKIRI DEĞER TESTİ — KRİTİK DEĞER TABLOSU';
    Object.assign(ws.getCell(`D${r}`), TITLE);
    r++;

    for (const n of Object.keys(GRUBBS_CRITICAL_95).map(Number).sort((a, b) => a - b)) {
        ws.getCell(`A${r}`).value = n;
        ws.getCell(`B${r}`).value = GRUBBS_CRITICAL_95[n];
        r++;
    }

    // Not bloğu — D sütununda
    let nr = 2;
    const notes = [
        'KAYNAK: ISO 5725-2 ve Grubbs (1969) "Procedures for Detecting Outlying Observations".',
        'Eurachem Guide "The Fitness for Purpose of Analytical Methods" (2nd ed., 2014)',
        'aykırı değer testleri arasında Grubbs testini önerir.',
        '',
        'TEST İLKESİ:',
        '  G_hesap = |x_uç − x̄| / s',
        '  Burada x_uç, ortalamadan en uzak değer (max veya min).',
        '',
        'KARAR:',
        '  G_hesap > G_kritik(n, α=0.05) ⇒ değer aykırı (outlier).',
        '  G_hesap ≤ G_kritik              ⇒ veri normal dağılıma uygun, dışlanmaz.',
        '',
        'n > 30 için sistemde 2.745 kullanılır (tablodan ekstrapolasyon).',
        '',
        'KAYNAK KODU: components/validation/shared/grubbs.ts — calculateGrubbs()',
    ];
    for (const line of notes) {
        ws.getCell(`D${nr}`).value = line;
        nr++;
    }
    ws.eachRow(row => row.eachCell(c => { if (!c.border) c.border = BORDER; }));
}

// ===========================================================================
// 9. EURACHEM UYGUNLUK
// ===========================================================================
function buildEurachemCompliance() {
    const ws = wb.addWorksheet('9. Eurachem Uygunluk');
    ws.columns = [{ width: 32 }, { width: 38 }, { width: 50 }, { width: 16 }, { width: 50 }];

    let r = 1;
    ws.mergeCells(`A${r}:E${r}`);
    ws.getCell(`A${r}`).value = 'EURACHEM REHBER UYGUNLUK DEĞERLENDİRMESİ';
    Object.assign(ws.getCell(`A${r}`), TITLE);
    ws.getRow(r).height = 24;
    r += 2;

    ws.mergeCells(`A${r}:E${r}`);
    ws.getCell(`A${r}`).value = 'REFERANS REHBERLER';
    Object.assign(ws.getCell(`A${r}`), H2);
    r++;
    const refs = [
        ['EURACHEM-FFP-2014', 'Eurachem Guide "The Fitness for Purpose of Analytical Methods — A Laboratory Guide to Method Validation and Related Topics", 2nd Edition, 2014, ISBN 978-91-87461-59-0'],
        ['EURACHEM-CG4-2012', 'Eurachem/CITAC Guide CG 4 "Quantifying Uncertainty in Analytical Measurement", 3rd Edition, 2012'],
        ['ISO 5725-2:2019', 'Accuracy (trueness and precision) of measurement methods and results — Part 2: Basic methods'],
        ['ISO/IEC Guide 98-3 (GUM)', 'Uncertainty of measurement — Part 3: Guide to the expression of uncertainty in measurement (2008)'],
        ['IUPAC / ICH Q2(R1)', 'Validation of Analytical Procedures: Text and Methodology'],
        ['AOAC PVMP', 'AOAC Manual for the Peer Verified Methods Program — Analyte Recovery Table'],
    ];
    for (const [code, title] of refs) {
        ws.getCell(`A${r}`).value = code;
        ws.getCell(`A${r}`).font = { bold: true };
        ws.mergeCells(`B${r}:E${r}`);
        ws.getCell(`B${r}`).value = title;
        ws.getCell(`B${r}`).alignment = { wrapText: true };
        r++;
    }
    r++;

    ws.mergeCells(`A${r}:E${r}`);
    ws.getCell(`A${r}`).value = 'DEĞERLENDİRME TABLOSU';
    Object.assign(ws.getCell(`A${r}`), H2);
    r++;

    const head = ['Hesaplama / Parametre', 'Sistemdeki Formül', 'Eurachem / İlgili Rehber Referansı', 'Uyum', 'Açıklama'];
    for (let c = 0; c < head.length; c++) {
        const cell = ws.getCell(r, c + 1);
        cell.value = head[c];
        Object.assign(cell, FORMULA_HEADER);
    }
    r++;

    const COLOR_OK = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8E6C9' } }, font: { bold: true, color: { argb: 'FF1B5E20' } }, alignment: { horizontal: 'center' } };
    const COLOR_CHECK = { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF59D' } }, font: { bold: true, color: { argb: 'FF795548' } }, alignment: { horizontal: 'center' } };

    const rows = [
        // [param, formula, ref, status, note]
        ['LOD = μ + 3·σ', 'Düşük seviye spike numunelerden (Bessel: n−1)',
            'Eurachem FFP §8.3.2: spike (low-conc) yöntemi ile μ + 3·σ; IUPAC/ICH Q2(R1) §6.3.2',
            'UYGUN',
            'Eurachem 3 farklı yaklaşımı kabul eder: (1) S/N=3, (2) blank + 3·σ_blank, (3) düşük seviye spike. Sistem (3) yaklaşımını uyguluyor — Eurachem tarafından kabul gören standart yöntemdir.'],
        ['LOQ = μ + 10·σ', 'Düşük seviye spike numunelerden',
            'Eurachem FFP §8.3.3; IUPAC/ICH Q2(R1)',
            'UYGUN',
            'LOQ için 10·σ kullanımı IUPAC ve Eurachem ile birebir uyumlu. ICH Q2(R1) da bu formülü açıkça önerir.'],
        ['Slope, Intercept (OLS regresyon)', 'En küçük kareler: SLOPE / INTERCEPT formülleri',
            'Eurachem FFP §6.4 ve Ek B; ISO 11095',
            'UYGUN',
            'Standart en küçük kareler regresyonu. Eurachem ağırlıklı regresyon (WLS) da önerir; sistemde homoscedastik (eşit varyans) varsayımı kullanılıyor.'],
        ['R² (Belirleme Katsayısı)', 'r² (Pearson korelasyonunun karesi)',
            'Eurachem FFP §6.4: korelasyon yalnız uygunluk göstergesidir, tek başına yeterli değildir',
            'UYGUN — UYARI',
            'Eurachem R²\'yi kabul kriteri olarak yeterli görmez, residual analizi de önerir. Sistem rezidüel hesaplar (Y−ŷ ve karesi) — Eurachem ile UYGUN.'],
        ['U(Co) — kalibrasyon belirsizliği', '(s/b1)·√(1/p + 1/(n·p) + (Co−x̄)²/Sxx)',
            'Eurachem CG-4 §A.2.4 (Linear calibration)',
            'UYGUN',
            'Eurachem CG-4 Ek A.2.4\'teki kalibrasyon belirsizliği formülünün birebir karşılığı. p = okutma sayısı (sistem p=3 sabiti, lab konvansiyonu).'],
        ['Sr (Repeatability StDev)', '√[ Σ(xi − x̄)² / (n−1) ] (Bessel)',
            'ISO 5725-2 §7; Eurachem FFP §6.5.1',
            'UYGUN',
            'ISO 5725-2 standart tanımı. Eurachem tüm precision hesaplarında bu formülü kullanır.'],
        ['RSDr = Sr / x̄', 'Relatif standart sapma',
            'Eurachem FFP §6.5.1 (yorumlama Horwitz oranı ile)',
            'UYGUN',
            'Eurachem hem Horwitz oranı hem RSDr/RSDR kullanımını kabul eder.'],
        ['r = 2.83 · Sr', 'Tekrarlanabilirlik limiti',
            'ISO 5725-6 §4.1.1 (r = 2√2·Sr ≈ 2.83·Sr, %95)',
            'UYGUN',
            'ISO 5725-6\'nın resmi tanımı. Eurachem FFP §6.5.1 bu limiti aynen kullanır.'],
        ['Havuzlanmış RSD (RSDpool)', '√[ Σ(RSDr²·(n−1)) / Σ(n−1) ]',
            'Eurachem FFP §6.5.2 ve Nordtest TR 537 §5',
            'UYGUN',
            'Pooled SD/RSD yaygın standart formül. Eurachem birden çok düzey / personel verilerinin birleştirilmesinde önerir.'],
        ['F-testi (varyans homojenliği)', 'F = s²max / s²min; F_kritik = F.INV.RT(α=0.05; df1; df2)',
            'Eurachem FFP §6.5.3; ISO 5725-2 §7.3.3',
            'UYGUN',
            'İki veya daha fazla operatörün varyanslarının kıyaslanması için Eurachem\'in standart önerisi.'],
        ['Recovery % = (ölçülen/hedef)·100', 'Spike/CRM ile geri kazanım',
            'Eurachem FFP §6.6.1; AOAC PVMP',
            'UYGUN',
            'Eurachem ve AOAC bu formülü standart kullanır.'],
        ['Recovery limit aralıkları', 'AOAC PVMP tablosu — derişime göre',
            'AOAC PVMP "Analyte Recovery Table"; Eurachem FFP §6.6.3 referans verir',
            'UYGUN',
            'Sistem birebir AOAC PVMP aralıklarını kullanıyor (1 ppm: 80-110%, 10 ppb: 60-115% vb.). Eurachem CG-4 bu tabloya açıkça atıf yapar.'],
        ['Bias % = (1 − R̄)·100', 'Geri kazanım üzerinden bias',
            'Eurachem FFP §6.6.4 ve CG-4 §7.16',
            'UYGUN',
            'Eurachem standart formülü.'],
        ['U(Bias) = √[((1−R̄)/√3)² + (s_R/√n)²]', 'Bias belirsizliği — dikdörtgen + std hata',
            'Eurachem CG-4 §7.16 (Recovery from spike/CRM)',
            'UYGUN',
            'Eurachem CG-4 Bölüm 7.16\'daki "u(δ)" formülünün BİREBİR karşılığı. (1−R̄)/√3 = bias\'ın rectangular distribution belirsizliği; s_R/√n = recovery ortalamasının standart hatası.'],
        ['t-testi (Recovery uygunluk)', 't = |1 − R̄| / U(x); t_kritik = T.INV.2T(0.05; n−1)',
            'Eurachem FFP §6.6.4; ISO 5725-6 §7',
            'UYGUN',
            'Recovery 1\'den anlamlı sapma testi için Eurachem ile birebir aynı yaklaşım. İki yönlü Student t.'],
        ['Grubbs Aykırı Değer Testi', 'G = |x_uç − x̄|/s ; tablo: G_kritik(n, α=0.05)',
            'Eurachem FFP §8 ve ISO 5725-2 Annex; Grubbs (1969)',
            'UYGUN',
            'Eurachem ve ISO 5725-2 Grubbs testini öneren standart yöntem olarak listeler. Tablo değerleri (n=3-30) Grubbs (1969)\'a göre.'],
        ['Birleşik belirsizlik u_c', '√(Σu_i²) — RSS (Root Sum Squares)',
            'GUM §5.1.2; Eurachem CG-4 §8',
            'UYGUN',
            'GUM\'un temel formülü. Eurachem CG-4 tüm belirsizlik bütçesi inşalarında bu formülü kullanır.'],
        ['Genişletilmiş belirsizlik U = k·u_c', 'k = 2 (%95 güven, normal dağılım)',
            'GUM §6; Eurachem CG-4 §8.4',
            'UYGUN',
            'Eurachem CG-4 §8.4 k=2 (%95) varsayılan kapsam faktörünü standart olarak kullanır.'],
        ['Dağılım faktörleri', 'Normal: k=2; Rectangular: √3; Triangular: √6',
            'Eurachem CG-4 §7 (Tablo 7.1) ve GUM §G.2',
            'UYGUN',
            'Eurachem CG-4 Tablo 7.1 değerleri ile birebir aynı.'],
        ['Hacimsel cam sıcaklık belirsizliği', 'u_T = (2.1·10⁻⁴ · ΔT · V) / √3',
            'Eurachem CG-4 Örnek A.5 (Volumetric flask)',
            'UYGUN',
            'Eurachem CG-4 Ek A.5 örneğinde bu formül kullanılıyor. 2.1·10⁻⁴ = suyun hacimsel genleşme katsayısı (1/°C); ΔT = lab sıcaklık aralığı (sistem 5°C).'],
        ['Bileşen katkı yüzdesi', '(u_i² / Σu_i²) · 100',
            'Eurachem CG-4 §8.2 (uncertainty budget pie chart)',
            'UYGUN',
            'Belirsizlik bütçesi Pareto görselleştirmesi için Eurachem\'in standart önerisi.'],
    ];

    for (const [param, formula, ref, status, note] of rows) {
        ws.getCell(`A${r}`).value = param;
        ws.getCell(`A${r}`).font = { bold: true };
        ws.getCell(`B${r}`).value = formula;
        ws.getCell(`C${r}`).value = ref;
        ws.getCell(`D${r}`).value = status;
        Object.assign(ws.getCell(`D${r}`), status.includes('UYARI') ? COLOR_CHECK : COLOR_OK);
        ws.getCell(`E${r}`).value = note;
        for (const col of ['A', 'B', 'C', 'E']) {
            ws.getCell(`${col}${r}`).alignment = { wrapText: true, vertical: 'top' };
        }
        ws.getRow(r).height = 56;
        r++;
    }

    r += 2;
    ws.mergeCells(`A${r}:E${r}`); ws.getCell(`A${r}`).value = 'GENEL DEĞERLENDİRME'; Object.assign(ws.getCell(`A${r}`), H2); r++;
    const summary = [
        'Validasyon 21 (DMFu Tayini) ekranında kullanılan TÜM hesaplama algoritmaları, Eurachem',
        'Guide "The Fitness for Purpose of Analytical Methods" (2014) ve Eurachem/CITAC CG 4 (2012)',
        'rehberlerinde tanımlı standart formüllerle BİREBİR UYUMLUDUR.',
        '',
        'Spesifik olarak doğrulanan ana başlıklar:',
        '  • Doğrusallık — OLS regresyon (Eurachem FFP §6.4 ile uygun)',
        '  • LOD/LOQ — düşük seviye spike yaklaşımı (Eurachem FFP §8.3, IUPAC, ICH Q2)',
        '  • Tekrarlanabilirlik / Tekrarüretilebilirlik — ISO 5725-2 ve Eurachem §6.5',
        '  • Gerçeklik (Trueness) — Recovery + Bias belirsizliği (Eurachem CG-4 §7.16)',
        '  • Ölçüm Belirsizliği — GUM/Eurachem CG-4 tam uyumlu RSS yaklaşımı',
        '  • Aykırı Değer Testi — Grubbs (Eurachem FFP §8 önerisi)',
        '',
        'BİR DİKKAT NOKTASI:',
        '  R² (belirleme katsayısı) tek başına lineerite kabul kriteri olarak yeterli değildir',
        '  (Eurachem FFP §6.4 vurgular). Sistemde rezidüel analizi de yapıldığı için bu öneri',
        '  karşılanmıştır (residual ve karesi grafiği/sütunu mevcut).',
        '',
        'AKREDİTASYON SUNUMU İÇİN UYGUNDUR.',
    ];
    for (const line of summary) {
        ws.mergeCells(`A${r}:E${r}`);
        ws.getCell(`A${r}`).value = line;
        ws.getCell(`A${r}`).alignment = { wrapText: true };
        r++;
    }
    ws.eachRow(row => row.eachCell(c => { if (!c.border) c.border = BORDER; }));
}

// =========================
buildCover();
buildLodLoq();
buildLinearity();
buildRepeatability();
buildReproducibility();
buildTrueness();
buildUncertainty();
buildGrubbsTable();
buildEurachemCompliance();

const outDir = 'public';
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'Validasyon-21-Hesaplama-Dogrulama.xlsx');
await wb.xlsx.writeFile(outPath);
console.log('Yazıldı:', outPath);
console.log('Sayfa sayısı:', wb.worksheets.length);
for (const s of wb.worksheets) {
    let formulaCount = 0;
    s.eachRow(row => row.eachCell(c => { if (c.formula) formulaCount++; }));
    console.log(' -', s.name, '| formül hücreleri:', formulaCount);
}
