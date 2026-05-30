import { PDFDocument } from "pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";

// ───── Rapor PDF dijital imzası (PAdES) ─────
// PDF içeriğini imzalar → Adobe Reader "imzalı" gösterir, editlenince imza geçersiz olur.
//
// Signer KATMANI bilerek soyutlandı (pluggable):
//   - Şimdi: SelfSignedP12Signer (kurumsal self-signed sertifika, köprü çözüm).
//   - İleride: bulut e-Mühür API signer'ı eklenip getRaporSigner() içinden döndürülür.
// Böylece bulut e-Mühür gelince route/render kodu DEĞİŞMEZ, sadece bu dosya genişler.

export interface RaporSigner {
  readonly tur: string;
  sign(pdf: Buffer): Promise<Buffer>;
}

interface P12Creds {
  p12: Buffer;
  pass: string;
}

// Env'den self-signed .p12 sertifikasını okur (gen-imza-cert.mjs ile üretilir).
function loadP12(): P12Creds | null {
  const b64 = (process.env.RAPOR_IMZA_P12_BASE64 || "").trim();
  const pass = (process.env.RAPOR_IMZA_P12_PASS || "").trim();
  if (!b64 || !pass) return null;
  try {
    return { p12: Buffer.from(b64, "base64"), pass };
  } catch {
    return null;
  }
}

// İmza sertifikası yapılandırılmış mı? (UI butonunu göstermek/gizlemek için)
export function pdfImzaYapilandirildi(): boolean {
  return loadP12() !== null;
}

class SelfSignedP12Signer implements RaporSigner {
  readonly tur = "self-signed";
  constructor(private readonly creds: P12Creds) {}

  async sign(pdf: Buffer): Promise<Buffer> {
    // 1) İmza alanı (placeholder) ekle — pdf-lib ile.
    const pdfDoc = await PDFDocument.load(pdf);
    pdflibAddPlaceholder({
      pdfDoc,
      reason: "Rapor butunlugu dogrulamasi - UNIQUE Analiz dijital imzasi",
      contactInfo: "info@uniqueanalyse.com",
      name: "UNIQUE Analiz Belgelendirme ve Gozetim Hizmetleri Ltd. Sti.",
      location: "Turkiye",
      signingTime: new Date(),
    });
    const withPlaceholder = Buffer.from(await pdfDoc.save());

    // 2) İmzala — detached PKCS#7 (PAdES).
    const signer = new P12Signer(this.creds.p12, { passphrase: this.creds.pass });
    return new SignPdf().sign(withPlaceholder, signer);
  }
}

// Yapılandırılmış signer'ı döndürür (yoksa null).
export function getRaporSigner(): RaporSigner | null {
  // İleride: if (bulutEmuhurYapilandirildi()) return new BulutEmuhurSigner(...)
  const creds = loadP12();
  if (!creds) return null;
  return new SelfSignedP12Signer(creds);
}

// PDF buffer'ını imzalar. Sertifika yoksa açıklayıcı hata fırlatır.
export async function signPdfBuffer(pdf: Buffer): Promise<Buffer> {
  const signer = getRaporSigner();
  if (!signer) {
    throw new Error(
      "PDF imza sertifikası yapılandırılmadı. 'node scripts/gen-imza-cert.mjs' çalıştırıp " +
        "RAPOR_IMZA_P12_BASE64 ve RAPOR_IMZA_P12_PASS değerlerini ortam değişkenlerine ekleyin.",
    );
  }
  return signer.sign(pdf);
}
