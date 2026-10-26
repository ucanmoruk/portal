/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
require("@next/env").loadEnvConfig(process.cwd());

(async () => {
  const db = require("mysql2/promise").createPool({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  try {
    const [rows] = await db.query(`SELECT d.ID,d.Kod,d.Baslik,d.Durum,f.DosyaAdi,f.Dosya
      FROM KysDokuman d JOIN KysDokumanDosya f ON f.DokumanID=d.ID
      WHERE d.Tur='Form' AND d.Durum<>'Silindi'
        AND f.MimeType IN ('application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      ORDER BY d.ID`);
    const root = path.resolve("outputs/kys-form-pdf-2026-10-26");
    const sources = path.resolve(".tmp/kys-pdf/sources");
    await fs.mkdir(path.join(root, "pdfs"), { recursive: true });
    await fs.mkdir(sources, { recursive: true });
    const token = await require("next-auth/jwt").encode({ secret: process.env.NEXTAUTH_SECRET,
      token: { sub: "2", userId: "2", name: "KYS PDF conversion", firmalar: ["Unique", "Root"] }, maxAge: 7200 });
    const manifest = [];
    for (const row of rows) {
      const sourceSha = createHash("sha256").update(row.Dosya).digest("hex");
      const sourcePath = path.join(sources, `${row.ID}${path.extname(row.DosyaAdi)}`);
      await fs.writeFile(sourcePath, row.Dosya);
      const response = await fetch(`http://127.0.0.1:1038/api/kys/dokumanlar/${row.ID}/pdf`, {
        headers: { cookie: `next-auth.session-token=${token}` }, signal: AbortSignal.timeout(180000),
      });
      const pdf = Buffer.from(await response.arrayBuffer());
      if (!response.ok || pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${row.Kod}: ${pdf.toString().slice(0, 400)}`);
      const pdfPath = path.join(root, "pdfs", `${row.ID}-${row.Kod.replace(/[^\w.-]/g, "_")}.pdf`);
      await fs.writeFile(pdfPath, pdf);
      const [current] = await db.execute("SELECT SHA2(Dosya,256) AS Sha FROM KysDokumanDosya WHERE DokumanID=?", [row.ID]);
      if (current[0]?.Sha !== sourceSha) throw new Error(`${row.Kod}: source changed during conversion`);
      manifest.push({ id: row.ID, code: row.Kod, title: row.Baslik, state: row.Durum, originalName: row.DosyaAdi,
        sourcePath, sourceSha, pdfPath, pdfSha: createHash("sha256").update(pdf).digest("hex"), bytes: pdf.length });
      await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
      console.log(`PASS ${manifest.length}/${rows.length} ${row.Kod} (${pdf.length} bytes; original SHA unchanged)`);
    }
    console.log(`COMPLETE ${manifest.length} Word forms converted; originals preserved.`);
  } finally { await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
