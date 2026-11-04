"use client";

import { useEffect, useState } from "react";
import { LANDING_COVER_FADE_MS } from "@/lib/landing";

/**
 * Quiet full-screen cover over the landing's first paint (paper colour, the
 * Storyverse logo). The parent hides it once fonts, the hero images and the
 * GSAP setup are ready (or the timeout cap fires); it then fades out and
 * unmounts. With reduced motion (`instant`) there is no fade.
 */
export default function LandingCover({
  hidden,
  instant,
}: {
  hidden: boolean;
  instant: boolean;
}) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!hidden) return;
    if (instant) {
      setGone(true);
      return;
    }
    const t = window.setTimeout(() => setGone(true), LANDING_COVER_FADE_MS + 50);
    return () => window.clearTimeout(t);
  }, [hidden, instant]);

  if (gone) return null;
  return (
    <div
      className={`land-cover${hidden ? " hide" : ""}${instant ? " instant" : ""}`}
      aria-hidden="true"
    >
      <span className="land-cover-logo">Storyverse</span>
    </div>
  );
}
