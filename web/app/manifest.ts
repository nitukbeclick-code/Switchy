import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Switchy AI — השוואת תקשורת חכמה",
    short_name: "Switchy AI",
    description:
      "השוואה שקופה וחינמית של מסלולי סלולר, אינטרנט, טלוויזיה וחבילות תקשורת בישראל.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#F6F2E9",
    theme_color: "#087A5B",
    lang: "he",
    dir: "rtl",
    categories: ["finance", "utilities", "shopping"],
    icons: [
      {
        src: "/icons/Icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/Icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/Icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/Icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
