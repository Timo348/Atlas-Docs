import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "@excalidraw/excalidraw/index.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const lora = Lora({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Atlas Docs",
  description: "Kollaboratives Wissen, Markdown und visuelle Arbeitsflächen.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className={`${inter.variable} ${lora.variable}`}>{children}</body>
    </html>
  );
}
