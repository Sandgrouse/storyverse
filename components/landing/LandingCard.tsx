"use client";

import Image from "next/image";
import type { CSSProperties, PointerEvent } from "react";
import type { LandingCard as LandingCardData } from "@/lib/landing";
import { pointerRatio, tiltBack, tiltTo, useFinePointer } from "./effects";

const SIZES: Record<LandingCardData["kind"], { w: number; h: number }> = {
  art: { w: 600, h: 800 },
  sheet: { w: 520, h: 780 },
  player: { w: 640, h: 360 },
  thumb: { w: 320, h: 180 },
};

/** Display width of each kind, so the browser picks a matching resource. */
const DISPLAY_WIDTH: Record<LandingCardData["kind"], string> = {
  art: "300px",
  sheet: "270px",
  player: "620px",
  thumb: "170px",
};

/**
 * One landing card. Three nested layers so scroll, pointer and hover
 * effects never fight over one transform:
 * - outer: scroll engine (scrubbed timeline)
 * - middle: pointer parallax and hero float
 * - inner: hover lift and tilt
 */
export default function LandingCard({
  card,
  eager = true,
  caption,
}: {
  card: LandingCardData;
  eager?: boolean;
  caption?: string;
}) {
  const fine = useFinePointer();
  const { w, h } = SIZES[card.kind];

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const { px, py } = pointerRatio(e.currentTarget, e.clientX, e.clientY);
    tiltTo(e.currentTarget, px, py);
  };
  const onLeave = (e: PointerEvent<HTMLDivElement>) => {
    tiltBack(e.currentTarget);
  };

  return (
    <div
      className={`land-outer land-${card.kind}`}
      data-depth={card.depth}
      data-fade={card.fade}
      style={{ "--seat-r": `${card.r}deg` } as CSSProperties}
    >
      <div className="land-mid">
        <div
          className={`land-inner${card.pulse ? " land-pulse" : ""}`}
          onPointerMove={fine ? onMove : undefined}
          onPointerLeave={fine ? onLeave : undefined}
        >
          <Image
            src={card.src}
            alt={card.alt}
            width={w}
            height={h}
            sizes={`(max-width: 900px) 100vw, ${DISPLAY_WIDTH[card.kind]}`}
            quality={75}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
          />
          {card.flag ? <span className="land-flag">{card.flag}</span> : null}
          {caption ? <span className="land-cap">{caption}</span> : null}
        </div>
        {card.secret ? (
          <div
            className="land-secret"
            style={{ background: card.secret.tint }}
          >
            <b>{card.secret.channel}</b>
            {card.secret.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
