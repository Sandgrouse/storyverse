import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  useVideoConfig,
} from "remotion";
import { useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import {
  VIDEO_CROSSFADE_FRAMES,
  shotFrames,
  shotObjectPosition,
  shotStartFrames,
} from "@/lib/video";
import type { ShortShot } from "@/lib/world/schemas";

/**
 * The short video itself, shared by the player and the browser export:
 * one Sequence per shot over the same frame math, so what the creator
 * sees is what the file holds.
 */

export type StoryShortShot = Pick<
  ShortShot,
  "imagePath" | "caption" | "durationSec" | "motion"
> & {
  audioSrc?: string;
  /**
   * True when the art's natural size is portrait. The page loads each
   * image once and passes the flag down, so the player and the export
   * frame heads the same way without each reading the size itself.
   */
  portrait?: boolean;
};

/** Slow zoom for "push", slight sideways drift for "pan". */
function motionTransform(
  motion: StoryShortShot["motion"],
  progress: number,
): string | undefined {
  if (motion === "push") {
    const scale = interpolate(progress, [0, 1], [1, 1.09]);
    return `scale(${scale})`;
  }
  if (motion === "pan") {
    const x = interpolate(progress, [0, 1], [1.2, -1.2]);
    return `scale(1.09) translateX(${x}%)`;
  }
  return undefined;
}

function ShotView({
  shot,
  fadeIn,
  tall,
}: {
  shot: StoryShortShot;
  fadeIn: boolean;
  tall: boolean;
}) {
  const frame = useCurrentFrame();
  const duration = shotFrames(shot.durationSec);
  const progress = duration <= 1 ? 1 : frame / (duration - 1);
  const opacity = fadeIn
    ? interpolate(frame, [0, VIDEO_CROSSFADE_FRAMES], [0, 1], {
        extrapolateRight: "clamp",
      })
    : 1;
  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill
        style={{
          transform: motionTransform(shot.motion, progress),
        }}
      >
        <Img
          src={shot.imagePath}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: shotObjectPosition(shot.portrait ?? false, tall),
          }}
        />
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "44px 26px 20px",
          textAlign: "center",
          color: "#fff",
          fontFamily: "Newsreader, Georgia, serif",
          fontSize: 23,
          lineHeight: 1.25,
          background: "linear-gradient(transparent, rgba(0,0,0,0.76))",
        }}
      >
        {shot.caption}
      </div>
      {shot.audioSrc ? <Audio src={shot.audioSrc} /> : null}
    </AbsoluteFill>
  );
}

export function StoryShort({ shots }: { shots: StoryShortShot[] }) {
  const starts = shotStartFrames(shots);
  const { width, height } = useVideoConfig();
  const tall = height > width;
  return (
    <AbsoluteFill style={{ backgroundColor: "#111" }}>
      {shots.map((shot, index) => (
        <Sequence
          key={index}
          from={starts[index] ?? 0}
          durationInFrames={shotFrames(shot.durationSec)}
          name={`Shot ${index + 1}`}
        >
          <ShotView shot={shot} fadeIn={index > 0} tall={tall} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
