import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LandingCard from "@/components/landing/LandingCard";
import {
  CARDS,
  CHAPTERS,
  LAYOUTS,
  VIDEO_CAPTION,
  VIDEO_CAPTIONS,
  VIDEO_LOOP_SECONDS,
  VIDEO_SHOT_CARD_IDS,
  VIDEO_SHOT_SECONDS,
  videoPlayingAt,
  videoShotIndexAt,
} from "@/lib/landing";

const VIDEO_IDX = CHAPTERS.findIndex((c) => c.id === "video");

const css = () =>
  readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
const pageSource = () =>
  readFileSync(
    join(process.cwd(), "components/landing/LandingPage.tsx"),
    "utf8",
  );

describe("video mini-cut data", () => {
  it("holds the four captions in shot order", () => {
    expect(VIDEO_CAPTIONS).toEqual([
      "One night they run across the Omabala to escape him.",
      "He finds them.",
      "And they run back across the river to endure him again.",
      "Owl's droppings blind him.",
    ]);
    // The legacy single caption is the first shot's caption.
    expect(VIDEO_CAPTION).toBe(VIDEO_CAPTIONS[0]);
  });

  it("orders the four thumbnail shots left to right", () => {
    expect(VIDEO_SHOT_CARD_IDS).toEqual([3, 7, 2, 4]);
    const ids = new Set(CARDS.map((c) => c.id));
    for (const id of VIDEO_SHOT_CARD_IDS) {
      expect(ids.has(id), `card ${id} exists`).toBe(true);
      expect(LAYOUTS[VIDEO_IDX][id], `card ${id} is a video thumb`).toBeDefined();
    }
    const xs = VIDEO_SHOT_CARD_IDS.map((id) => LAYOUTS[VIDEO_IDX][id].x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("cuts every 3 seconds and loops the whole timeline", () => {
    expect(VIDEO_SHOT_SECONDS).toBe(3);
    expect(VIDEO_LOOP_SECONDS).toBe(12);
    expect(videoShotIndexAt(0)).toBe(0);
    expect(videoShotIndexAt(2.99)).toBe(0);
    expect(videoShotIndexAt(3)).toBe(1);
    expect(videoShotIndexAt(5.99)).toBe(1);
    expect(videoShotIndexAt(6)).toBe(2);
    expect(videoShotIndexAt(9)).toBe(3);
    expect(videoShotIndexAt(11.99)).toBe(3);
    // Loops back to the first shot and wraps negatives.
    expect(videoShotIndexAt(12)).toBe(0);
    expect(videoShotIndexAt(15)).toBe(1);
    expect(videoShotIndexAt(-0.5)).toBe(3);
  });

  it("plays at the chapter rest and pauses when it leaves", () => {
    expect(videoPlayingAt(VIDEO_IDX, VIDEO_IDX)).toBe(true);
    expect(videoPlayingAt(VIDEO_IDX + 0.05, VIDEO_IDX)).toBe(true);
    expect(videoPlayingAt(VIDEO_IDX + 0.2, VIDEO_IDX)).toBe(false);
    expect(videoPlayingAt(VIDEO_IDX - 0.5, VIDEO_IDX)).toBe(false);
    expect(videoPlayingAt(VIDEO_IDX + 1, VIDEO_IDX)).toBe(false);
    expect(videoPlayingAt(0, VIDEO_IDX)).toBe(false);
  });
});

describe("video mini-cut rendering", () => {
  it("stacks the four shot pictures inside the film card, captioned in order", () => {
    const film = CARDS.find((c) => c.id === 6)!;
    const html = renderToString(<LandingCard card={film} />);
    expect(html).toContain("land-film");
    const shots = [...html.matchAll(/data-shot="(\d)"/g)].map((m) => m[1]);
    expect(shots).toEqual(["0", "1", "2", "3"]);
    const captions = [...html.matchAll(/data-caption="([^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(captions).toHaveLength(4);
    // Order check on filenames (Next encodes src URLs in SSR output).
    let at = -1;
    for (const shot of ["pots", "storm", "hippo", "fire"] as const) {
      const next = html.indexOf(shot, at + 1);
      expect(next, `${shot} follows in shot order`).toBeGreaterThan(at);
      at = next;
    }
  });

  it("drives the cut from the chapter rest: shot, caption, outline, playhead", () => {
    const source = pageSource();
    expect(source).toContain("videoPlayingAt(progress.current, VIDEO_IDX)");
    expect(source).toContain("videoShotIndexAt(elapsed)");
    expect(source).toContain("VIDEO_CAPTIONS[next]");
    expect(source).toContain("shot-now");
    expect(source).toContain("playing-video");
    expect(source).toContain('classList.toggle("playing", shouldPlay)');
    expect(source).toContain("setInterval(videoTick, 200)");
    // First shot with its caption is the server-rendered state.
    expect(source).toContain("VIDEO_CAPTIONS[0]");
    expect(source).toContain('data-shot="0"');
  });

  it("cross-fades with opacity and pushes in with transform only", () => {
    const style = css();
    expect(style).toMatch(
      /\.land-stage\[data-shot="0"\] \.land-shot\[data-shot="0"\]/,
    );
    const push = style.match(/@keyframes landpush\s*\{([\s\S]*?)\n\}/);
    expect(push, "@keyframes landpush exists").not.toBeNull();
    expect(push![1]).toMatch(/scale\(1\)/);
    expect(push![1]).toMatch(/scale\(1\.08\)/);
    expect(push![1]).not.toMatch(/width|height|left|top/);
    const shot = style.match(/\.land-shot\s*\{([^}]*)\}/);
    expect(shot, ".land-shot rule exists").not.toBeNull();
    expect(shot![1]).toMatch(/transition\s*:\s*opacity/);
  });

  it("runs the red playhead across the whole 12s loop, paused off-rest", () => {
    const style = css();
    const head = style.match(/\.land-playhead\s*\{([^}]*)\}/);
    expect(head, ".land-playhead rule exists").not.toBeNull();
    expect(head![1]).toMatch(/animation\s*:\s*landplay 12s linear infinite/);
    expect(head![1]).toMatch(/animation-play-state\s*:\s*paused/);
    expect(style).toMatch(
      /\.land-head\.playing \.land-playhead\s*\{[^}]*animation-play-state\s*:\s*running/,
    );
  });

  it("outlines the current thumbnail and stills the cut without motion", () => {
    const style = css();
    const now = style.match(/\.land-outer\.shot-now\s*\{([^}]*)\}/);
    expect(now, ".land-outer.shot-now rule exists").not.toBeNull();
    expect(style).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.land-shot img\s*\{[^}]*animation\s*:\s*none/,
    );
    expect(style).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.land-playhead\s*\{[^}]*animation\s*:\s*none/,
    );
  });
});
