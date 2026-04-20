import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer", "mssql", "jszip", "docx", "pizzip", "docxtemplater"],

};

export default nextConfig;
