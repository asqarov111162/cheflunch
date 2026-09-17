import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CHEF LUNCH — Bugungi menyu",
  description: "Har kuni yangi uy taomlari. CHEF LUNCH bilan buyurtma bering.",
  other: {
    "codex-preview": "development",
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz">
      <body className="antialiased">{children}</body>
    </html>
  );
}
