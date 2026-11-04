"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The calm fallback when a scene throws. A button takes the reader back
 * to the start, in the existing style. Nothing here fetches or stores.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[storyverse] scene error:", error.message);
  }, [error]);

  return (
    <main>
      <section className="scene on" id="arrival">
        <div className="logo">Storyverse</div>
        <div className="hello">
          <h1 className="big">Something broke.</h1>
          <p className="lede">
            Your stories are safe. Try again, or head back home.
          </p>
          <div className="doors" style={{ marginTop: 24 }}>
            <button type="button" className="pill" onClick={() => reset()}>
              Try again
            </button>
            <Link className="pill light" href="/projects">
              Your projects
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
