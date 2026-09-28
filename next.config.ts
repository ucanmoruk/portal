import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["nodemailer", "mssql", "mysql2", "jszip", "docx", "pizzip", "docxtemplater", "pdf-parse", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/urunler/rapor-sablon": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/eurolab/validations/[id]/pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    // Rapor Takip — imzalı PDF indirme ve toplu mail (her ikisi de Chromium ile
    // PDF render eder). Binary'nin serverless paketine dahil edilmesi şart.
    "/api/rapor-takip/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/rapor-takip/[nkrId]/imzali-pdf": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/rapor-takip/[nkrId]/yayinla": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/rapor-takip/mail-gonder": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    // DOCX şablonları — public/ dizininden okunduğunda serverless paketine
    // dahil edilmeleri gerekir, aksi halde production'da template bulunamaz.
    "/api/eurolab/rawdata/[id]/docx": ["./public/templates/**/*"],
    "/api/eurolab/validations/[id]/protocol-docx": ["./public/templates/**/*"],
    "/api/kys/dokumanlar/import": ["./node_modules/pdf-parse/dist/**/*", "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
