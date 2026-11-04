"use client";

import { forwardRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { StoryShort, type StoryShortShot } from "./StoryShort";
import { VIDEO_FPS } from "@/lib/video";

/**
 * The Remotion player, kept in its own module so the page can load it
 * with SSR off: the player only runs in the browser.
 */
export const ShortPlayer = forwardRef<
  PlayerRef,
  {
    shots: StoryShortShot[];
    width: number;
    height: number;
    durationInFrames: number;
  }
>(function ShortPlayer({ shots, width, height, durationInFrames }, ref) {
  return (
    <Player
      ref={ref}
      component={StoryShort}
      inputProps={{ shots }}
      durationInFrames={Math.max(1, durationInFrames)}
      compositionWidth={width}
      compositionHeight={height}
      fps={VIDEO_FPS}
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      acknowledgeRemotionLicense
      style={{ width: "100%", height: "100%" }}
    />
  );
});
