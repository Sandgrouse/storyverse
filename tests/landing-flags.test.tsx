import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CARDS, maxCardZ } from "@/lib/landing";
import LandingCard from "@/components/landing/LandingCard";

const css = () =>
  readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const pageSource = () =>
  readFileSync(
    join(process.cwd(), "components/landing/LandingPage.tsx"),
    "utf8",
  );

function ruleBody(name: string): string {
  const rule = css().match(new RegExp(`\\${name}\\s*\\{([^}]*)\\}`));
  expect(rule, `${name} rule exists in app/globals.css`).not.toBeNull();
  return rule![1];
}

describe("landing tag flags", () => {
  it("renders no flag inside the clipped card", () => {
    const html = renderToString(<LandingCard card={CARDS[0]} />);
    expect(html).toContain("land-outer");
    expect(html).not.toContain("land-flag");
  });

  it("renders one flag per card as a sibling of the clipped outer", () => {
    const source = pageSource();
    // Flags are their own elements, not a prop handed into the card.
    expect(source).toContain('className="land-flag"');
    expect(source).not.toContain("flagRef");
  });

  it("positions each flag from its card rect with transform only", () => {
    const source = pageSource();
    expect(source).toContain("gsap.set(flag, { x: cx - w / 2 + 10");
    expect(source).toContain("y: cy - h / 2 + 10");
    // Hidden while the card travels: shown only near the chapter rest.
    expect(source).toContain("nearRest(s)");
    expect(source).toContain("flag.style.visibility");
  });

  it("paints flags above every card but below the rail and top bar", () => {
    const zOf = (name: string): number => {
      const body = ruleBody(name);
      const z = body.match(/z-index\s*:\s*(\d+)/)?.[1];
      expect(z, `${name} sets a z-index`).toBeDefined();
      return Number(z);
    };
    const flag = zOf(".land-flag");
    expect(flag).toBeGreaterThan(maxCardZ());
    expect(flag).toBeLessThan(zOf(".land-rail"));
    expect(flag).toBeLessThan(zOf(".land-bar"));
  });

  it("keeps the reshape clipping on the outer only", () => {
    expect(ruleBody(".land-outer")).toMatch(/overflow\s*:\s*hidden/);
    // The flag parks at the stage origin; its 10px inset comes from the
    // per-frame transform, so no clipped ancestor offsets it.
    expect(ruleBody(".land-flag")).toMatch(/left\s*:\s*0/);
    expect(ruleBody(".land-flag")).toMatch(/top\s*:\s*0/);
    for (const layer of [".land-mid", ".land-counter", ".land-inner"]) {
      expect(ruleBody(layer), layer).not.toMatch(/overflow/);
    }
  });
});
