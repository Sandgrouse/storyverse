import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { WorldSchema } from "@/lib/world/schemas";
import Experience from "@/components/experience/Experience";
import seed from "@/data/seed/anukili.json";

afterEach(() => {
  delete (globalThis as unknown as Record<string, unknown>).window;
});

describe("Experience first paint", () => {
  it("renders the seed even when saved data exists", () => {
    const seedWorld = WorldSchema.parse(seed);
    const savedWorld = { ...seedWorld, title: "Saved World MARKER-XYZ" };
    const store = new Map<string, string>();
    store.set(
      "storyverse-world-v1",
      JSON.stringify({ world: savedWorld, sample: true }),
    );
    (globalThis as unknown as Record<string, unknown>).window = {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    };

    const html = renderToString(<Experience seed={seedWorld} />);

    expect(html).toContain(seedWorld.title);
    expect(html).not.toContain("Saved World MARKER-XYZ");
  });
});
