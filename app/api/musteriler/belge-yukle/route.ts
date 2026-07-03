import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cosmoPool } from "@/lib/db";
import { type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { isRaporFtpConfigured, uploadRaporPdfToFtp } from "@/lib/raporPdfUpload";

// FTP yükleme süre alabilir.
export const runtime = "nodejs";
export const maxDuration = 120;

const DIGER_FIRMA_ID = 5487; // "DİĞER" — varsayılan proje
const GECERLI_TUR = new Set(["Rapor", "Sertifika", "Diğer"]);

interface ItemMeta {
  raporNo?: string | number | null;
  tur?: string;
  numuneAdi?: string;
}
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

    // RaporNo boş bırakılırsa otomatik sıradaki numarayı ver.
    const maxRes = await pool.request().query(
      `SELECT ISNULL(MAX(RaporNo), 0) AS mx FROM Rapor`
    );
    let autoNo = Number(maxRes.recordset[0]?.mx ?? 0) + 1;

    const sonuc: { fileName: string; raporNo: number; id: number }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const it = meta.items[i] || {};
      const tur = GECERLI_TUR.has(String(it.tur)) ? String(it.tur) : "Diğer";
      const numuneAdi = String(it.numuneAdi ?? "").trim() || file.name;

      // Rapor No: kullanıcı girdiyse onu, yoksa otomatik.
      const girilenNo = it.raporNo != null && String(it.raporNo).trim() !== ""
        ? parseInt(String(it.raporNo).trim(), 10)
        : NaN;
      const raporNo = Number.isFinite(girilenNo) ? girilenNo : autoNo++;

      // Sadece PDF — portal görüntüleyici PDF bekliyor.
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length < 5 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
        return Response.json(
          { error: `"${file.name}" bir PDF değil. Yalnızca PDF belge yüklenebilir.` },
          { status: 400 },
        );
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
