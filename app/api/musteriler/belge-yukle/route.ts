import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { hasMysqlConfig } from "@/lib/mysqlCompat";
import { type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { isRaporFtpConfigured, uploadRaporPdfToFtp } from "@/lib/raporPdfUpload";

// FTP yükleme süre alabilir.
export const runtime = "nodejs";
export const maxDuration = 120;

const DIGER_FIRMA_ID = 5487; // "DİĞER" — varsayılan proje
const GECERLI_TUR = new Set(["Rapor", "Sertifika", "Claim", "ÜGDR", "Diğer"]);

interface ItemMeta {
  raporNo?: string | number | null;
  tur?: string;
  numuneAdi?: string;
  /** Doldurulursa: bu PDF, o token'lı ONAYLI raporun yayın (müşteri) versiyonunu
   *  override eder. Yeni Rapor kaydı açılmaz; NKR_RaporOnay güncellenir. */
  onayToken?: string;
}

const TERMINAL_ONAY = new Set([
  "Onaylandı", "Onaylandi", "Yayınlandı", "Yayinlandi", "Arşiv", "Arsiv",
]);
interface UploadMeta {
  firmaId: number;
  firmaAd?: string | null;
  projeId?: number | null;
  projeAd?: string | null;
  items: ItemMeta[];
}

function genToken(): string {
  return randomBytes(18).toString("base64url"); // ~24 char, base64url
}

// QR altındaki 8 karakterlik doğrulama kodu — lib/raporViewData.ts ile BİREBİR aynı türetim.
function deriveDogrulamaKod(token: string): string {
  return token
    .replace(/[^A-Z0-9]/gi, "")
    .replace(/[ILO01]/gi, "")
    .toUpperCase()
    .slice(0, 8)
    .padEnd(8, "X");
}

// Kullanıcı ya tam KarekodToken'ı (~24 char) ya da QR altındaki 8-karakter kodu
// girebilir. Onay kaydını (tam token dahil) çöz. Dönüş: kayıt | null | "ambiguous".
async function resolveOnay(
  pool: any,
  input: string,
): Promise<{ ID: number; KarekodToken: string; Durum: string } | null | "ambiguous"> {
  const cleaned = input.replace(/\s+/g, "");
  if (cleaned.length >= 16) {
    const r = await pool.request().input("tok", cleaned)
      .query(`SELECT ID, KarekodToken, Durum FROM NKR_RaporOnay WHERE KarekodToken = @tok`);
    return r.recordset[0] ?? null;
  }
  // 8-karakter kod → terminal onaylar arasında türetip eşleştir.
  const up = cleaned.toUpperCase();
  const r = await pool.request().query(`
    SELECT ID, KarekodToken, Durum FROM NKR_RaporOnay
    WHERE KarekodToken IS NOT NULL
      AND Durum IN (N'Onaylandı', N'Onaylandi', N'Yayınlandı', N'Yayinlandi', N'Arşiv', N'Arsiv')
  `);
  const matches = r.recordset.filter(
    (row: any) => deriveDogrulamaKod(String(row.KarekodToken)) === up,
  );
  if (matches.length === 0) return null;
  if (matches.length > 1) return "ambiguous";
  return matches[0];
}

// POST /api/musteriler/belge-yukle
// FormData: files (çoklu) + meta (JSON string)
// Her dosya → VerifiedFiles'a yüklenir + Rapor tablosuna kayıt (Durum='Aktif').
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return Response.json({ error: "Yetkisiz erişim" }, { status: 401 });
  const userId = ((session.user as any)?.userId ?? null) as number | null;

  if (!isRaporFtpConfigured()) {
    return Response.json(
      { error: "FTP yapılandırılmadı (RAPOR_FTP_* ortam değişkenleri eksik)." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Geçersiz form verisi." }, { status: 400 });
  }

  let meta: UploadMeta;
  try {
    meta = JSON.parse(String(form.get("meta") ?? "{}"));
  } catch {
    return Response.json({ error: "meta JSON çözümlenemedi." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "Yüklenecek dosya yok." }, { status: 400 });
  if (!meta.firmaId) return Response.json({ error: "Firma seçilmedi." }, { status: 400 });
  if (meta.items?.length !== files.length) {
    return Response.json({ error: "Dosya sayısı ile bilgi sayısı uyuşmuyor." }, { status: 400 });
  }

  const projeId = meta.projeId ?? DIGER_FIRMA_ID;
  const projeAd = (meta.projeAd ?? "DİĞER").trim() || "DİĞER";
  const firmaAd = (meta.firmaAd ?? "").trim() || null;

  try {
    const pool = await cosmoPool;

    // RaporNo bos birakilirsa otomatik siradaki sayisal numarayi ver.
    // Manuel girilen rapor numaralari alfanumerik olabilir (or. 26SE1026).
    const maxNoSql = hasMysqlConfig()
      ? `SELECT IFNULL(MAX(CAST(RaporNo AS UNSIGNED)), 0) AS mx FROM Rapor WHERE CAST(RaporNo AS CHAR) REGEXP '^[0-9]+$'`
      : `SELECT ISNULL(MAX(TRY_CAST(RaporNo AS INT)), 0) AS mx FROM Rapor`;
    const maxRes = await pool.request().query(maxNoSql);
    let autoNo = Number(maxRes.recordset[0]?.mx ?? 0) + 1;

    const sonuc: { fileName: string; raporNo: string; id: number }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const it = meta.items[i] || {};
      const tur = GECERLI_TUR.has(String(it.tur)) ? String(it.tur) : "Diğer";
      const numuneAdi = String(it.numuneAdi ?? "").trim() || file.name;

      // Rapor No: kullanici girdiyse metin olarak aynen koru, yoksa otomatik.
      const girilenNo = it.raporNo != null ? String(it.raporNo).trim() : "";
      const raporNo = girilenNo || String(autoNo++);

      // Sadece PDF — portal görüntüleyici PDF bekliyor.
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
        return Response.json(
          { error: `"${file.name}" bir PDF değil. Yalnızca PDF belge yüklenebilir.` },
          { status: 400 },
        );
      }

      // ── ONAY TOKEN OVERRIDE ──
      // onayToken verildiyse: bu PDF, o token'lı ONAYLI raporun yayın (müşteri
      // doğrulama) versiyonunu değiştirir. FTP'ye {token}.pdf olarak yazılır
      // (mevcut yayın PDF'inin üzerine) ve NKR_RaporOnay güncellenir. Yeni Rapor
      // kaydı AÇILMAZ. Müşteri o token'ı sorguladığında bu PDF'i alır.
      const onayInput = String(it.onayToken ?? "").trim();
      if (onayInput) {
        const onay = await resolveOnay(pool, onayInput);
        if (onay === "ambiguous") {
          return Response.json(
            { error: `"${file.name}": "${onayInput}" kodu birden fazla rapora uyuyor. Lütfen tam token (QR bağlantısındaki uzun değer) girin.` },
            { status: 409 },
          );
        }
        if (!onay) {
          return Response.json(
            { error: `"${file.name}": "${onayInput}" ile onaylı rapor bulunamadı. (QR altındaki 8 karakterlik kodu ya da tam token'ı girin.)` },
            { status: 404 },
          );
        }
        if (!TERMINAL_ONAY.has(String(onay.Durum))) {
          return Response.json(
            { error: `"${file.name}": bu rapor onaylı değil (durum: ${onay.Durum ?? "yok"}).` },
            { status: 409 },
          );
        }
        // FTP dosya adı = TAM KarekodToken (yayın PDF'i {token}.pdf olarak servis edilir).
        const fullToken = String(onay.KarekodToken);
        let overrideUrl: string;
        try {
          const up = await uploadRaporPdfToFtp({ pdfBuffer: buf, token: fullToken });
          overrideUrl = up.publicUrl;
        } catch (e) {
          const d = e instanceof Error ? e.message : "Bilinmeyen hata";
          return Response.json(
            { error: `"${file.name}" sunucuya yüklenemedi: ${d.slice(0, 300)}` },
            { status: 502 },
          );
        }
        await pool.request()
          .input("id", onay.ID)
          .input("url", overrideUrl)
          .query(`
            UPDATE NKR_RaporOnay
            SET Durum = N'Yayınlandı', YayinTarihi = GETDATE(), YayinUrl = @url
            WHERE ID = @id
          `);
        sonuc.push({ fileName: file.name, raporNo: `override:${onayInput}`, id: 0 });
        continue; // Rapor tablosuna kayıt YOK
      }

      // FTP'ye yükle (VerifiedFiles) — dosya adı {token}.pdf
      const token = genToken();
      let publicUrl: string;
      try {
        const up = await uploadRaporPdfToFtp({ pdfBuffer: buf, token });
        publicUrl = up.publicUrl;
      } catch (e) {
        const d = e instanceof Error ? e.message : "Bilinmeyen hata";
        return Response.json(
          { error: `"${file.name}" sunucuya yüklenemedi: ${d.slice(0, 300)}` },
          { status: 502 },
        );
      }

      // Rapor tablosuna kayıt — Yol = tam public URL (http…) → portalda "yeni yükleme"
      // olarak ayrışır ve /api/belge dış URL'den servisler.
      const ins = await pool.request()
        .input("raporNo", raporNo)
        .input("raporId", token)
        .input("numuneAd", numuneAdi)
        .input("durum", "Aktif")
        .input("firmaId", meta.firmaId)
        .input("projeId", projeId)
        .input("tur", tur)
        .input("yol", publicUrl)
        .input("firmaAd", firmaAd)
        .input("proje", projeAd)
        .input("yukleyenId", userId != null ? String(userId) : null)
        .query(`
          INSERT INTO Rapor
            (RaporNo, RaporID, NumuneAd, Tarih, Durum, FirmaID, ProjeID, NumuneTur, Yol, FirmaAd, Proje, YukleyenID)
          OUTPUT INSERTED.ID
          VALUES
            (@raporNo, @raporId, @numuneAd, GETDATE(), @durum, @firmaId, @projeId, @tur, @yol, @firmaAd, @proje, @yukleyenId)
        `);
      sonuc.push({ fileName: file.name, raporNo, id: ins.recordset[0]?.ID });
    }

    return Response.json({ ok: true, count: sonuc.length, items: sonuc });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
