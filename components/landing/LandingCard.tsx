"use client";

import Image from "next/image";
import type { PointerEvent } from "react";
import {
  CARDS,
  VIDEO_CAPTIONS,
  VIDEO_SHOT_CARD_IDS,
  type CardDef,
} from "@/lib/landing";
import { pointerRatio, tiltBack, tiltTo, useFinePointer } from "./effects";

/** Pictures the film card cross-fades through, in shot order. */
const FILM_SHOTS: CardDef[] = VIDEO_SHOT_CARD_IDS.map(
  (id) => CARDS.find((card) => card.id === id)!,
);

/**
 * One persistent landing card. Four nested layers so effects never fight
 * over one transform:
 * - outer: scroll engine (x, y, scaleX/Y, rotation, rotationY, opacity)
 * - mid: pointer parallax and hero float
 * - counter: inverse scale (1/scaleX, 1/scaleY) so the picture never stretches
 * - inner: hover lift and tilt
 *
 * The outer clips (overflow hidden), so as it morphs from portrait to wide
 * the picture is cropped, never distorted. Tag badges cannot live in here:
 * the counter-scale pushes the inner's top-left outside the clipped window,
 * so they render as siblings of the outer (see LandingPage) and track the
 * card's computed rect with transform only. The secret banner rides on the
 * outer and settles exact at the publish rest.
 */
export default function LandingCard({
  card,
  secret,
  outerRef,
  counterRef,
  secretRef,
}: {
  card: CardDef;
  secret?: { channel: string; text: string; tint: string };
  outerRef?: (el: HTMLDivElement | null) => void;
  counterRef?: (el: HTMLDivElement | null) => void;
  secretRef?: (el: HTMLDivElement | null) => void;
}) {
  const fine = useFinePointer();

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const { px, py } = pointerRatio(e.currentTarget, e.clientX, e.clientY);
    tiltTo(e.currentTarget, px, py);
  };
  const onLeave = (e: PointerEvent<HTMLDivElement>) => {
    tiltBack(e.currentTarget);
  };

  return (
    <div
      ref={outerRef}
      className="land-outer"
      data-card={card.id}
      data-depth={0.4 + (card.id % 4) * 0.2}
    >
      <div className="land-mid">
        <div ref={counterRef} className="land-counter">
          <div
            className="land-inner"
            onPointerMove={fine ? onMove : undefined}
            onPointerLeave={fine ? onLeave : undefined}
          >
            {card.id === 6 ? (
              <div className="land-film">
                {FILM_SHOTS.map((shot, index) => (
                  <div
                    key={shot.id}
                    className="land-shot"
                    data-shot={index}
                    data-caption={VIDEO_CAPTIONS[index]}
                  >
                    <Image
                      src={shot.src}
                      alt={index === 0 ? card.alt : ""}
                      fill
                      sizes="(max-width: 900px) 100vw, 800px"
                      quality={75}
                      loading="eager"
                      decoding="async"
                      draggable={false}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Image
                src={card.src}
                alt={card.alt}
                fill
                sizes="(max-width: 900px) 100vw, 800px"
                quality={75}
                loading="eager"
                decoding="async"
                draggable={false}
              />
            )}
          </div>
        </div>
      </div>
      {secret ? (
        <div
          ref={secretRef}
          className="land-secret"
          style={{ background: secret.tint }}
        >
          <b>{secret.channel}</b>
          {secret.text}
        </div>
      ) : null}
    </div>
  );
}
