import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Unique Analyse Takvim",
    short_name: "Unique Takvim",
    description: "Görev ve duyuru takvimi",
    id: "/laboratuvar/kys/iletisim",
    start_url: "/laboratuvar/kys/iletisim?sekme=gorev&gorunum=takvim",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#ffffff",
    icons: [{ src: "/unique-icon.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
