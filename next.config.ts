import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["nodemailer", "mssql", "jszip"],

};

export default nextConfig;
