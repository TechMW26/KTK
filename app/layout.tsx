import type { Metadata, Viewport } from "next";
import "./globals.css";
// Liquid Glass visual system. Imported after globals.css on purpose: it refines
// the base styles (tokens, surface hierarchy, materials) without globals.css
// needing to change.
import "./glass.css";
// Opaque matte card art and board finish, after the older glass treatment.
import "./cards.css";
import "./royal.css";

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
  // `suppressHydrationWarning` on <html> is the one justified use of it here:
  // the vinext/Vite RSC dev server serves the app as an inner markup fragment
  // and lets the browser's own document shell own <html>/<body>, so the shell's
  // lang/data-theme differ from this layout's on the initial dev paint. The
  // attributes below are static literals (deterministic), and the production
  // server emits them verbatim, so there is nothing to reconcile — React would
  // otherwise warn on every dev load. It is scoped to this element only and
  // does not hide mismatches in any child tree.
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Warm the complete deck before the first deal/reveal animation. */}
        <link rel="preload" as="image" href="/cards/back-texture.webp" />
        <link rel="preload" as="image" href="/cards/ktk-emblem-gold.webp" />
        <link rel="preload" as="image" href="/cards/front-king.webp" />
        <link rel="preload" as="image" href="/cards/front-heart.webp" />
        <link rel="preload" as="image" href="/cards/front-empty.webp" />
        <link rel="preload" as="image" href="/gauntlet-hand.png" />
        <link rel="preload" as="image" href="/dealer-swipe-hand.png" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
