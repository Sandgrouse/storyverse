import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import Rail from "@/components/Rail";
import { createLocalStorage } from "@/lib/storage/local";
import "./globals.css";

const serif = Instrument_Serif({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
});

const sans = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Storyverse",
  description: "Change the story once, and every channel follows.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const world = await createLocalStorage().getWorld();
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
        <div className="app">
          <Rail worldTitle={world.title} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
