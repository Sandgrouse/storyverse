import React from "react";
import { renderToString } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import ArrivalScene from "@/components/experience/ArrivalScene";
import IdeaScene from "@/components/experience/IdeaScene";
import BringScene from "@/components/experience/BringScene";
import ReadingScene from "@/components/experience/ReadingScene";
import UnderstoodScene from "@/components/experience/UnderstoodScene";
import ChannelsScene from "@/components/experience/ChannelsScene";
import WorldScene from "@/components/experience/WorldScene";
import { MissingStory } from "@/components/projects/ProjectContext";

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
      ["idea", <IdeaScene active idea="" onIdea={noop} onBegin={noop} />],
      ["bring", <BringScene active files={[]} onFiles={noop} seed={world} sample={false} onSample={noop} onRead={noop} />],
      ["reading", <ReadingScene files={[]} seed={world} sample onDone={noop} />],
      ["understood", <UnderstoodScene active world={world} onWorld={noop} onAddMaterial={noop} onOpen={noop} />],
      ["channels", <ChannelsScene active world={world} onWorld={noop} onOpen={noop} />],
      ["world", <WorldScene active world={world} onWorld={noop} />],
      ["missing", <MissingStory />],
    ];
    for (const [name, node] of scenes) {
      const { html, errors } = renderQuiet(node);
      expect(errors, `${name} logged console errors`).toEqual([]);
      expect(html.length, `${name} rendered empty`).toBeGreaterThan(0);
    }
  });

  it("shows the sample button only once, under the drop area", async () => {
    const world = await loadWorld();
    const noop = () => {};
    const countSample = (html: string) =>
      html.split("Use the sample project").length - 1;
    const { html: fresh } = renderQuiet(
      <BringScene active files={[]} onFiles={noop} seed={world} sample={false} onSample={noop} onRead={noop} />,
    );
    expect(countSample(fresh)).toBe(1);
    const { html: hidden } = renderQuiet(
      <BringScene active files={[]} onFiles={noop} seed={world} sample={false} hideSample onSample={noop} onRead={noop} />,
    );
    expect(countSample(hidden)).toBe(0);
  });

  it("keeps the file input visible when hideSample is set", async () => {
    const world = await loadWorld();
    const noop = () => {};
    const { html } = renderQuiet(
      <BringScene active files={[]} onFiles={noop} seed={world} sample={false} hideSample onSample={noop} onRead={noop} />,
    );
    expect(html).toContain("Drop files here");
    expect(html).toContain('type="file"');
  });

  it("renders story copy from the world data", async () => {
    const world = await loadWorld();
    const noop = () => {};
    const { html: reading } = renderQuiet(
      <ReadingScene files={[]} seed={world} sample onDone={noop} />,
    );
    const readingText = reading
      .replace(/<[^>]+>/g, "")
      .replace(/&#x27;/g, "'");
    expect(readingText).toContain(world.parts[0].summary.slice(0, 40));
    const { html: understood } = renderQuiet(
      <UnderstoodScene active world={world} onWorld={noop} onAddMaterial={noop} onOpen={noop} />,
    );
    expect(understood).toContain(world.logline.slice(0, 40));
    expect(understood).toContain(world.gaps[0].question);
    const { html: shelf } = renderQuiet(
      <WorldScene active world={world} onWorld={noop} />,
    );
    for (const part of world.parts) {
      expect(shelf).toContain(part.title);
    }
    for (const channel of world.channels) {
      expect(shelf).toContain(channel.name);
    }
    const { html: missing } = renderQuiet(<MissingStory />);
    expect(missing).toContain("Your projects");
  });
});
