import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: "Storyverse — One story. Every screen.",
  description:
    "Build your story once. Publish it as a series, a game, shorts and more.",
};

export default function HomePage() {
  return (
    <>
      {/* Without JS the cover (rendered for first paint) would stick: drop it. */}
      <noscript>
        <style>{".land-cover{display:none}"}</style>
      </noscript>
      <LandingPage />
    </>
  );
}
