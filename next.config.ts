import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer", "mssql", "jszip", "docx", "pizzip", "docxtemplater"],
  outputFileTracingIncludes: {
    "/api/urunler/rapor-sablon": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
