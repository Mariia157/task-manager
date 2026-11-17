import type { MetadataRoute } from "next";

/** PWA: «Установить на главный экран» — команда работает в том числе с телефонов. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Taskflow",
    short_name: "Taskflow",
    description: "Задачі команди: дошки, строки, щоденні справи",
    start_url: "/",
    display: "standalone",
    background_color: "#efece6",
    theme_color: "#efece6",
    lang: "uk",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
