import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer", "mssql", "jszip", "docx"],

};

export default nextConfig;
