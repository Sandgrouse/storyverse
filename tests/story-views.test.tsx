import React from "react";
import { renderToString } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WorldSchema, type World } from "@/lib/world/schemas";
import WorldScene from "@/components/experience/WorldScene";

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

describe("Story Timeline/Book switch", () => {
  it("defaults to Timeline with the change bar and no Canon button", async () => {
    const world = await loadWorld();
    const html = render(
      <WorldScene active world={world} onWorld={() => {}} />,
    );
    expect(html).toContain("Timeline");
    expect(html).toContain("Book");
    expect(html).toContain("Follow the change");
    expect(html).toContain("Scene notes");
    expect(html).not.toContain("/canon");
    expect(html).not.toContain("Contents");
  });

  it("shows the Canon book in the Book view without the change bar", async () => {
    const world = await loadWorld();
    const html = render(
      <WorldScene active world={world} onWorld={() => {}} view="book" />,
    );
    expect(html).toContain("Timeline");
    expect(html).toContain("Book");
    expect(html).toContain("Contents");
    expect(html).toContain("Characters");
    expect(html).toContain("Places");
    for (const part of world.parts) {
      expect(html).toContain(part.title);
    }
    expect(html).not.toContain("Follow the change");
    // The drawers stay mounted but closed (aria-hidden); opening Scene
    // notes navigates to a section that always shows the timeline.
  });

  it("hides the switch while a drawer is open", async () => {
    const world = await loadWorld();
    const html = render(
      <WorldScene
        active
        world={world}
        onWorld={() => {}}
        drawer="cast"
        onDrawer={() => {}}
      />,
    );
    expect(html).not.toContain("viewswitch");
  });
});

describe("Story Timeline/Book switch row", () => {
  // The fixed top bar is ~76-80px tall (20px padding + ~36-40px content).
  const TOP_BAR_H = 80;
  // The pill is ~30px tall (2px padding + 13px buttons).
  const SWITCH_H = 32;
  const CLEAR = 12;

  function block(css: string, selector: string): string {
    const match = css.match(new RegExp(`(^|\\n)${selector}\\s*\\{[^}]*\\}`));
    if (!match) throw new Error(`missing ${selector} block`);
    return match[0];
  }

  function px(cssBlock: string, prop: string): number {
    const match = cssBlock.match(new RegExp(`${prop}:\\s*([\\d.]+)px`));
    if (!match) throw new Error(`missing ${prop}`);
    return Number(match[1]);
  }

  it("sits in its own row under the top bar with clear space above", async () => {
    const css = await readFile(join(process.cwd(), "app", "canon.css"), "utf-8");
    const top = px(block(css, "\\.viewswitch"), "top");
    expect(top - TOP_BAR_H).toBeGreaterThanOrEqual(CLEAR);
  });

  it("keeps the timeline desk and headline below the row", async () => {
    const [canon, globals] = await Promise.all([
      readFile(join(process.cwd(), "app", "canon.css"), "utf-8"),
      readFile(join(process.cwd(), "app", "globals.css"), "utf-8"),
    ]);
    const switchTop = px(block(canon, "\\.viewswitch"), "top");
    const rowBottom = switchTop + SWITCH_H;
    const deskTop = px(block(globals, "\\.desk"), "top");
    const headTop = px(block(globals, "\\.headline"), "top");
    expect(deskTop - rowBottom).toBeGreaterThanOrEqual(CLEAR);
    expect(headTop - rowBottom).toBeGreaterThanOrEqual(CLEAR);
    // The desk keeps its old bottom edge: top moved down by 44px, so the
    // height shrinks by the same 44px (was calc(100% - 350px)).
    expect(block(globals, "\\.desk")).toContain("calc(100% - 394px)");
  });

  it("starts the Book columns below the row", async () => {
    const css = await readFile(join(process.cwd(), "app", "canon.css"), "utf-8");
    const switchTop = px(block(css, "\\.viewswitch"), "top");
    const rowBottom = switchTop + SWITCH_H;
    const bookPad = block(css, "#world\\.bookview \\.canonbook");
    const tocTop = block(
      css,
      "#world\\.bookview \\.canon-toc,\\n#world\\.bookview \\.canon-side",
    );
    expect(px(bookPad, "padding-top") - rowBottom).toBeGreaterThanOrEqual(CLEAR);
    expect(px(tocTop, "top") - rowBottom).toBeGreaterThanOrEqual(CLEAR);
    expect(tocTop).toContain("calc(100vh - 166px)");
  });
});
