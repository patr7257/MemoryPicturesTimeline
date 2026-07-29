import type { Metadata, Viewport } from "next";
import { Caveat, Nunito } from "next/font/google";
import { Toaster } from "sonner";

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
  // Installable home-screen app (iOS needs a linked manifest, no service
  // worker). Icons regenerate via node scripts/gen-app-icons.mjs.
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
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
