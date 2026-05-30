// Rapor PDF imzası için self-signed (kuruma ait) sertifika üretir.
// Çıktı: bir .p12 (PKCS#12) dosyası + .env için base64 + parola.
//
// Kullanım:
//   node scripts/gen-imza-cert.mjs
//   node scripts/gen-imza-cert.mjs "Kurum Adı" "parola"
//
// NOT: Bu self-signed sertifika, PDF'i kurcalamaya karşı korur (editlenince
// imza geçersiz olur). Adobe'da "imzalı ama kimliği doğrulanamadı" (sarı) görünür.
// Bulut e-Mühür gelince signer değiştirilir; bu sertifika köprü çözümdür.
import forge from "node-forge";
import { writeFileSync } from "node:fs";
import path from "node:path";

const CN = process.argv[2] || "UNIQUE Analiz Belgelendirme ve Gozetim Hizmetleri Ltd. Sti.";
const PASS = process.argv[3] || forge.util.bytesToHex(forge.random.getBytesSync(16));

function generate() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01" + forge.util.bytesToHex(forge.random.getBytesSync(8));
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: "commonName", value: CN },
    { name: "organizationName", value: "UNIQUE Analiz" },
    { name: "countryName", value: "TR" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // self-signed
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
    { name: "extKeyUsage", emailProtection: true, clientAuth: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASS, { algorithm: "3des" });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(der, "binary");
}

const p12 = generate();
const outPath = path.join(process.cwd(), "rapor-imza.p12");
writeFileSync(outPath, p12);
const b64 = p12.toString("base64");

console.log("✓ Self-signed sertifika üretildi.");
console.log("  CN:", CN);
console.log("  Dosya:", outPath, `(${p12.length} bytes)`);
console.log("");
console.log("─── .env.local / Vercel ortam değişkenleri ───");
console.log(`RAPOR_IMZA_P12_PASS=${PASS}`);
console.log(`RAPOR_IMZA_P12_BASE64=${b64}`);
console.log("");
console.log("⚠  rapor-imza.p12 ve parolayı GIZLI tutun, repoya COMMIT ETMEYIN.");
console.log("⚠  Bu değerleri Vercel > Settings > Environment Variables'a ekleyin.");
