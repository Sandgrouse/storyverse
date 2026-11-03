import { readFile } from "node:fs/promises";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import Experience from "@/components/experience/Experience";
import ArrivalScene from "@/components/experience/ArrivalScene";
import IdeaScene from "@/components/experience/IdeaScene";
import BringScene from "@/components/experience/BringScene";
import ReadingScene from "@/components/experience/ReadingScene";
import UnderstoodScene from "@/components/experience/UnderstoodScene";
import ChannelsScene from "@/components/experience/ChannelsScene";
import WorldScene from "@/components/experience/WorldScene";

async function loadWorld(): Promise<World> {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "anukili.json"),
    "utf-8",
  );
  return WorldSchema.parse(JSON.parse(raw));
}

function renderQuiet(node: React.ReactElement) {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    const html = renderToString(node);
    return { html, errors };
  } finally {
    console.error = original;
  }
}

describe("experience scenes", () => {
  it("renders every scene without console errors", async () => {
    const world = await loadWorld();
    const noop = () => {};
    const scenes: Array<[string, React.ReactElement]> = [
      ["arrival", <ArrivalScene active images={[]} onBring={noop} onIdea={noop} />],
      ["idea", <IdeaScene active onBack={noop} onBegin={noop} />],
      ["bring", <BringScene active world={world} onBack={noop} onRead={noop} />],
      ["reading", <ReadingScene active world={world} onDone={noop} />],
      ["understood", <UnderstoodScene active world={world} onBack={noop} onOpen={noop} />],
      ["channels", <ChannelsScene active world={world} onOpen={noop} />],
      ["world", <WorldScene active world={world} onSecrets={noop} />],
      ["experience", <Experience seed={world} />],
    ];
    for (const [name, node] of scenes) {
      const { html, errors } = renderQuiet(node);
      expect(errors, `${name} logged console errors`).toEqual([]);
      expect(html.length, `${name} rendered empty`).toBeGreaterThan(0);
    }
  });

  it("renders story copy from the world data", async () => {
    const world = await loadWorld();
    const noop = () => {};
    const { html: reading } = renderQuiet(
      <ReadingScene active world={world} onDone={noop} />,
    );
    const readingText = reading
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;/g, "'");
    expect(readingText).toContain(world.parts[0].summary.slice(0, 40));
    const { html: understood } = renderQuiet(
      <UnderstoodScene active world={world} onBack={noop} onOpen={noop} />,
    );
    expect(understood).toContain(world.logline.slice(0, 40));
    expect(understood).toContain(world.gaps[0].question);
    const { html: shelf } = renderQuiet(
      <WorldScene active world={world} onSecrets={noop} />,
    );
    for (const part of world.parts) {
      expect(shelf).toContain(part.title);
    }
    for (const channel of world.channels) {
      expect(shelf).toContain(channel.name);
    }
  });
});
