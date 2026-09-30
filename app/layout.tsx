import type { Metadata, Viewport } from "next";
import "./globals.css";
// Liquid Glass visual system. Imported after globals.css on purpose: it refines
// the base styles (tokens, surface hierarchy, materials) without globals.css
// needing to change.
import "./glass.css";

export const metadata: Metadata = {
  title: "Kill the King",
  description: "A game of instinct, strategy, and deception.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

// viewportFit: cover lets the WebView draw edge-to-edge on notched/gesture-nav
// devices so the app can honor env(safe-area-inset-*). Applies to the APK and
// mobile browsers alike; no functional regression for the web build.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050403",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body className="antialiased">
      
        {children}
      </body>
    </html>
  );
}
