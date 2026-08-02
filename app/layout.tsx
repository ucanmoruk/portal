import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import { ttInterphases } from "@/app/fonts/reportFonts";

export const metadata: Metadata = {
  title: {
    template: "%s | Online Portal",
    default: "Online Portal",
  },
  description: "Laboratuvar Yönetim ve ÜGD Analiz Portalı",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={ttInterphases.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
