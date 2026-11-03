"use client";

import { useEffect, useState } from "react";

const LINES = [
  "A story too big for one screen deserves a series, a game and a thousand shorter tellings.",
  "Give each screen its own secret, so fans follow you across all of them.",
  "Keep your characters and canon in one place. Change the story once, and see what follows.",
];

type Props = {
  active: boolean;
  images: string[];
  onBring: () => void;
  onIdea: () => void;
};

export default function ArrivalScene({ active, images, onBring, onIdea }: Props) {
  const [width, setWidth] = useState(1280);
  const [line, setLine] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setFading(true);
      window.setTimeout(() => {
        setLine((prev) => (prev + 1) % LINES.length);
        setFading(false);
      }, 500);
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const half = Math.ceil(images.length / 2);

  return (
    <section className={`scene${active ? " on" : ""}`} id="arrival">
      <div className="logo">Storyverse</div>
      <div className="ring" aria-hidden="true">
        {images.map((src, i) => {
          const left = i < half;
          const k = left ? half - 1 - i : i - half;
          const h = 210 + k * k * 34 + k * 40;
          const w = h * (0.62 + k * 0.05);
          const x = (left ? -1 : 1) * (width * 0.265 + k * width * 0.07 + k * k * width * 0.012);
          const angle = left ? 26 + k * 13 : -(26 + k * 13);
          return (
            <div
              key={src}
              className="card"
              style={{
                width: w,
                height: h,
                marginLeft: -w / 2,
                marginTop: -h / 2,
                backgroundImage: `url(${src})`,
                transform: `translateX(${x}px) rotateY(${angle}deg) translateZ(${k * 34}px)`,
                animationDelay: `${k * 0.16}s`,
              }}
            />
          );
        })}
      </div>
      <div className="hello">
        <h1 className="big">
          One story.
          <br />
          Every screen.
        </h1>
        <p className="lede" style={{ opacity: fading ? 0 : 1 }}>
          {LINES[line]}
        </p>
        <div className="doors" style={{ marginTop: 6 }}>
          <button className="pill" onClick={onBring}>
            I already have material
          </button>
          <button className="pill light" onClick={onIdea}>
            I have an idea
          </button>
        </div>
      </div>
    </section>
  );
}
