import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LandingCover from "@/components/landing/LandingCover";
import {
  HERO_IMAGES,
  LANDING_COVER_FADE_MS,
  LANDING_COVER_TIMEOUT_MS,
  LANDING_IMAGES,
  landingCoverDone,
  landingCoverFadeMs,
} from "@/lib/landing";

const css = () =>
  readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("landing cover logic", () => {
  it("waits for fonts, hero images and the GSAP setup", () => {
    const base = {
      fontsReady: true,
      heroImagesReady: true,
      gsapReady: true,
      elapsedMs: 0,
    };
    expect(landingCoverDone(base)).toBe(true);
    expect(
      landingCoverDone({ ...base, fontsReady: false }),
    ).toBe(false);
    expect(
      landingCoverDone({ ...base, heroImagesReady: false }),
    ).toBe(false);
    expect(landingCoverDone({ ...base, gsapReady: false })).toBe(false);
  });

  it("never sticks past the timeout cap, however slow the assets are", () => {
    expect(LANDING_COVER_TIMEOUT_MS).toBe(3000);
    expect(
      landingCoverDone({
        fontsReady: false,
        heroImagesReady: false,
        gsapReady: false,
        elapsedMs: LANDING_COVER_TIMEOUT_MS,
      }),
    ).toBe(true);
    expect(
      landingCoverDone({
        fontsReady: false,
        heroImagesReady: false,
        gsapReady: false,
        elapsedMs: LANDING_COVER_TIMEOUT_MS - 1,
      }),
    ).toBe(false);
  });

  it("fades in 400ms, instantly with reduced motion", () => {
    expect(LANDING_COVER_FADE_MS).toBe(400);
    expect(landingCoverFadeMs(false)).toBe(400);
    expect(landingCoverFadeMs(true)).toBe(0);
  });

  it("waits for the eight hero gallery images", () => {
    expect(HERO_IMAGES).toHaveLength(8);
    for (const src of HERO_IMAGES) {
      expect(LANDING_IMAGES).toContain(src);
      expect(existsSync(join(process.cwd(), "public", src.slice(1)))).toBe(
        true,
      );
    }
  });
});

describe("landing cover element", () => {
  it("renders a quiet paper cover with the logo on first paint", () => {
    const html = renderToString(
      <LandingCover hidden={false} instant={false} />,
    );
    expect(html).toContain("land-cover");
    expect(html).toContain("Storyverse");
    expect(html).not.toContain("hide");
  });

  it("fades via the hide class, with no fade when instant", () => {
    const html = renderToString(
      <LandingCover hidden={true} instant={false} />,
    );
    expect(html).toContain("land-cover hide");
    const instantHtml = renderToString(
      <LandingCover hidden={true} instant={true} />,
    );
    expect(instantHtml).toContain("land-cover hide instant");
  });

  it("holds full-screen in paper colour and fades in 400ms", () => {
    const style = css();
    const cover = style.match(/\.land-cover\s*\{([^}]*)\}/);
    expect(cover, ".land-cover rule exists").not.toBeNull();
    expect(cover![1]).toMatch(/position\s*:\s*fixed/);
    expect(cover![1]).toMatch(/inset\s*:\s*0/);
    expect(cover![1]).toMatch(/background\s*:\s*var\(--paper\)/);
    const hide = style.match(/\.land-cover\.hide\s*\{([^}]*)\}/);
    expect(hide, ".land-cover.hide rule exists").not.toBeNull();
    expect(hide![1]).toMatch(/opacity\s*:\s*0/);
    expect(hide![1]).toMatch(/400ms/);
  });

  it("skips the fade with reduced motion", () => {
    const style = css();
    expect(style).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.land-cover\.hide\s*\{[^}]*transition\s*:\s*none/,
    );
  });
});

describe("landing first-frame state", () => {
  it("hides the rail until the scroll engine is ready", () => {
    const style = css();
    const rail = style.match(/\.land-rail\s*\{([^}]*)\}/);
    expect(rail, ".land-rail rule exists").not.toBeNull();
    expect(rail![1]).toMatch(/opacity\s*:\s*0/);
    expect(rail![1]).toMatch(/visibility\s*:\s*hidden/);
    expect(style).toMatch(
      /\.land-ready\s+\.land-rail\s*\{[^}]*visibility\s*:\s*visible/,
    );
    const source = readFileSync(
      join(process.cwd(), "components/landing/LandingPage.tsx"),
      "utf8",
    );
    expect(source).toContain("land-ready");
  });

  it("reserves card sizes and hides cards before the engine places them", () => {
    const style = css();
    const outer = style.match(/\.land-outer\s*\{([^}]*)\}/);
    expect(outer, ".land-outer rule exists").not.toBeNull();
    expect(outer![1]).toMatch(/aspect-ratio/);
    expect(outer![1]).toMatch(/opacity\s*:\s*0/);
    expect(outer![1]).toMatch(/visibility\s*:\s*hidden/);
  });

  it("server-renders the first tint visible and the hero copy", () => {
    const source = readFileSync(
      join(process.cwd(), "components/landing/LandingPage.tsx"),
      "utf8",
    );
    expect(source).toContain("opacity: k === 0 ? 1 : 0");
    expect(source).toContain("<LandingCover");
  });
});
