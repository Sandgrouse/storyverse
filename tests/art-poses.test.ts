import { describe, expect, it } from "vitest";
import {
  ALL_KNOWN_VIEW_IDS,
  EXTRA_POSES,
  EXTRA_POSE_IDS,
  SHEET_VIEWS,
  SHEET_VIEW_IDS,
  isSupportedSheetView,
  orderedSheetViews,
  poseIdFor,
  poseLabelFor,
  sheetViewLine,
} from "@/lib/art";

describe("extra pose list", () => {
  it("offers the six More-poses chips in order", () => {
    expect(EXTRA_POSE_IDS).toEqual([
      "sitting",
      "running",
      "fighting-stance",
      "looking-back",
      "arms-raised",
      "close-up-face",
    ]);
    expect(EXTRA_POSES.map((pose) => pose.label)).toEqual([
      "Sitting",
      "Running",
      "Fighting stance",
      "Looking back",
      "Arms raised",
      "Close-up face",
    ]);
  });

  it("keeps every pose id distinct from the base sheet views", () => {
    for (const id of EXTRA_POSE_IDS) {
      expect(SHEET_VIEW_IDS).not.toContain(id);
    }
    expect(new Set(ALL_KNOWN_VIEW_IDS).size).toBe(
      SHEET_VIEW_IDS.length + EXTRA_POSE_IDS.length,
    );
  });

  it("slugs free text into a safe view id", () => {
    expect(poseIdFor("Dancing joyfully")).toBe("dancing-joyfully");
    expect(poseIdFor("  Arms  raised!  ")).toBe("arms-raised");
    expect(poseIdFor("")).toBe("");
    expect(poseIdFor("a".repeat(100)).length).toBeLessThanOrEqual(40);
  });

  it("labels any view, known or custom", () => {
    expect(poseLabelFor("front")).toBe("Front");
    expect(poseLabelFor("fighting-stance")).toBe("Fighting stance");
    expect(poseLabelFor("dancing-joyfully")).toBe("Dancing joyfully");
  });

  it("draws every known view through the same likeness prompt", () => {
    const character = { name: "Ada", canon: "Brave and tall." };
    for (const pose of EXTRA_POSES) {
      const prompt = sheetViewLine(pose.id);
      expect(prompt).toContain(pose.line);
    }
    expect(sheetViewLine("front")).toContain("Front view");
  });

  it("supports the base views, the poses and safe custom slugs", () => {
    for (const id of [...SHEET_VIEW_IDS, ...EXTRA_POSE_IDS]) {
      expect(isSupportedSheetView(id)).toBe(true);
    }
    expect(isSupportedSheetView("dancing-joyfully")).toBe(true);
    expect(isSupportedSheetView("upside down!")).toBe(false);
    expect(isSupportedSheetView("")).toBe(false);
  });
});

describe("sheet grid ordering", () => {
  it("keeps the six base views first in their canonical order", () => {
    const sheet = [...SHEET_VIEWS]
      .reverse()
      .map((view) => ({ view: view.id, imagePath: `${view.id}.webp` }));
    const ordered = orderedSheetViews(sheet).map((entry) => entry.view);
    expect(ordered).toEqual(SHEET_VIEW_IDS);
  });

  it("appends extra poses after the base views, in canonical pose order", () => {
    const sheet = [
      { view: "dancing-joyfully", imagePath: "dancing.webp" },
      { view: "back", imagePath: "back.webp" },
      { view: "sitting", imagePath: "sitting.webp" },
      { view: "front", imagePath: "front.webp" },
    ];
    const ordered = orderedSheetViews(sheet).map((entry) => entry.view);
    expect(ordered).toEqual(["front", "back", "sitting", "dancing-joyfully"]);
  });

  it("keeps custom views in the order they were made", () => {
    const sheet = [
      { view: "spin-jump", imagePath: "a.webp" },
      { view: "front", imagePath: "front.webp" },
      { view: "bow-low", imagePath: "b.webp" },
    ];
    const ordered = orderedSheetViews(sheet).map((entry) => entry.view);
    expect(ordered).toEqual(["front", "spin-jump", "bow-low"]);
  });

  it("holds the base six even when extra views exist", () => {
    const sheet = [
      ...SHEET_VIEW_IDS.map((view) => ({ view, imagePath: `${view}.webp` })),
      { view: "running", imagePath: "running.webp" },
    ];
    const ordered = orderedSheetViews(sheet).map((entry) => entry.view);
    expect(ordered.slice(0, 6)).toEqual(SHEET_VIEW_IDS);
    expect(ordered[6]).toBe("running");
  });
});
