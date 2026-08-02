import localFont from "next/font/local";

export const ttInterphases = localFont({
  src: [
    {
      path: "./TT_Interphases_Pro_Light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "./TT_Interphases_Pro_Light_Italic.otf",
      weight: "300",
      style: "italic",
    },
    {
      path: "./TT_Interphases_Pro_Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./TT_Interphases_Pro_Italic.otf",
      weight: "400",
      style: "italic",
    },
    {
      path: "./TT_Interphases_Pro_Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./TT_Interphases_Pro_Medium_Italic.otf",
      weight: "500",
      style: "italic",
    },
    {
      path: "./TT_Interphases_Pro_DemiBold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "./TT_Interphases_Pro_DemiBold_Italic.otf",
      weight: "600",
      style: "italic",
    },
    {
      path: "./TT_Interphases_Pro_Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-tt-interphases",
});
