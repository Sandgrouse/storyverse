import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SheetLightbox from "@/components/experience/SheetLightbox";

const VIEWS = [
  { view: "front", imagePath: "front-marker" },
  { view: "left", imagePath: "left-marker" },
  { view: "back", imagePath: "back-marker" },
];

function render(index: number): string {
  return renderToString(
    <SheetLightbox
      name="Ada"
      views={VIEWS}
      index={index}
      onIndex={() => {}}
      onClose={() => {}}
      onRedraw={() => {}}
      redrawing={false}
      tabIndex={0}
    />,
  );
}

describe("SheetLightbox", () => {
  it("shows the pose large with its name, arrows and Close", () => {
    const html = render(0);
    expect(html).toContain("Ada character sheet");
    expect(html).toContain("Front");
    expect(html).toContain("front-marker");
    expect(html).toContain("1 of 3");
    expect(html).toContain("Previous pose");
    expect(html).toContain("Next pose");
    expect(html).toContain("Close");
  });

  it("shows the pose at the given index", () => {
    const html = render(2);
    expect(html).toContain("Back");
    expect(html).toContain("back-marker");
    expect(html).toContain("3 of 3");
    expect(html).not.toContain("Front");
  });

  it("wraps an out-of-range index instead of rendering nothing", () => {
    const html = render(3);
    expect(html).toContain("Front");
    expect(html).toContain("1 of 3");
  });

  it("offers only a quiet per-pose redraw with a confirm line, never redraw-all", () => {
    const html = render(1);
    expect(html).toContain("Redraw this pose");
    expect(html).not.toContain("This replaces the current picture.");
    expect(html).not.toContain("Generate full sheet");
    expect(html).not.toContain("Make the missing poses");
  });

});
