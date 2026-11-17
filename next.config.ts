import type { NextConfig } from "next";

const prod = process.env.NODE_ENV === "production";

/**
 * CSP: всё своё, без внешних скриптов. 'unsafe-inline' для скриптов нужен самому Next (инлайн-данные гидрации);
 * в dev ещё 'unsafe-eval' и websocket для HMR — поэтому строгий вариант только в production.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${prod ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${prod ? "" : " ws: wss:"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // кликджекинг: страницы нельзя встроить во фрейм (дубль frame-ancestors для старых браузеров)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS имеет смысл только по HTTPS — браузер игнорирует его на http://localhost
  ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // не раскрываем стек в заголовке X-Powered-By
  poweredByHeader: false,
  // pdfkit читает свои файлы шрифтов с диска — не бандлим его
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // вложения до 20 МБ за раз: запас на multipart-обвязку
    serverActions: { bodySizeLimit: "25mb" },
    // proxy.ts по умолчанию буферизует только 10 МБ тела — иначе большие файлы обрезались бы
    proxyClientMaxBodySize: "25mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // внутренняя CRM: все страницы персональные и динамические — Cache Components не нужен
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
