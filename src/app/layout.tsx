import type { Metadata, Viewport } from "next";
import { Caveat, Nunito } from "next/font/google";
import { Toaster } from "sonner";

import { PushBridge } from "@/components/push/PushBridge";

import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
});

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
});

export const metadata: Metadata = {
  title: "Family Memories",
  description: "Our family photo timeline: every trip, down memory lane.",
  robots: { index: false, follow: false },
  // Installable home-screen app (iOS needs a linked manifest). The push-only
  // service worker is public/sw.js. Icons regenerate via node scripts/gen-app-icons.mjs.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Memories",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // Single warm light theme (no dark mode in v1), same cream as the icon tile.
  themeColor: "#f5efe3",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${nunito.variable} ${caveat.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <PushBridge />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
