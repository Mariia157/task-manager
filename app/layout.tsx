import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import "./globals.css";

const onest = Onest({ variable: "--font-onest", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Taskflow",
  description: "Задачі команди: дошки, строки, щоденні справи",
  applicationName: "Taskflow",
  // внутренняя система команды — не индексировать
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  appleWebApp: { capable: true, title: "Taskflow", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#efece6", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={`${onest.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
