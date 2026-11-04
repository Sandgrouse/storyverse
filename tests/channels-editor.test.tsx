import React from "react";
import { renderToString } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import ChannelsScene from "@/components/experience/ChannelsScene";

async function loadWorld(): Promise<World> {
  const raw = await readFile(
    join(process.cwd(), "data", "seed", "anukili.json"),
    "utf-8",
  );
  return WorldSchema.parse(JSON.parse(raw));
}

function render(node: React.ReactElement): string {
  const original = console.error;
  console.error = () => {};
  try {
    return renderToString(node);
  } finally {
    console.error = original;
  }
}

function channels(world: World): string {
  return render(
    <ChannelsScene active world={world} onWorld={() => {}} onOpen={() => {}} />,
  );
}

describe("channel cards open an editor", () => {
  it("renders every screen as a keyboard-operable card", async () => {
    const world = await loadWorld();
    const html = channels(world);
    for (const channel of world.channels) {
      expect(html).toContain(channel.title);
    }
    expect(html.match(/role="button"/g)?.length).toBeGreaterThanOrEqual(
      world.channels.length,
    );
    expect(html).toContain('tabindex="0"');
  });

  it("keeps a single Open my world button and no editor at first", async () => {
    const world = await loadWorld();
    const html = channels(world);
    expect(html.match(/Open my world/g)).toHaveLength(1);
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Edit this screen");
  });
});
