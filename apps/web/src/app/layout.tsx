import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import { getServerSession } from "next-auth";
import { cookies, headers } from "next/headers";
import { authOptions } from "@/lib/auth";
import { resolveLanguage } from "@/lib/preferences";
import "@excalidraw/excalidraw/index.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const lora = Lora({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Atlas Docs",
  description: "Collaborative knowledge, Markdown, and visual workspaces.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [cookieStore, requestHeaders, session] = await Promise.all([
    cookies(),
    headers(),
    getServerSession(authOptions),
  ]);
  const language = resolveLanguage(
    session?.user?.active
      ? session.user.language
      : cookieStore.get("atlas-language")?.value,
    requestHeaders.get("accept-language"),
  );

  return (
    <html lang={language} suppressHydrationWarning>
      <body className={`${inter.variable} ${lora.variable}`}>{children}</body>
    </html>
  );
}
