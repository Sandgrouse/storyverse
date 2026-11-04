import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const serif = localFont({
  src: [
    {
      path: "./fonts/newsreader-normal-latin.woff2",
      weight: "200 800",
      style: "normal",
    },
    {
      path: "./fonts/newsreader-italic-latin.woff2",
      weight: "200 800",
      style: "italic",
    },
  ],
  variable: "--font-serif",
  display: "swap",
});

const sans = localFont({
  src: [
    {
      path: "./fonts/instrumentsans-latin.woff2",
      weight: "400 700",
      style: "normal",
    },
  ],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Storyverse",
  description: "Change the story once, and every channel follows.",
  openGraph: {
    title: "Storyverse",
    description: "Change the story once, and every channel follows.",
    images: ["/anukili/storm.webp"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
