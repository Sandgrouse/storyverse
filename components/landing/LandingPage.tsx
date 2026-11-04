"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import {
  BROWSER_SUB,
  BROWSER_TITLE,
  BROWSER_URL,
  CHANGE_LINE,
  CHAPTERS,
  CLOSE_HEADING,
  HERO_HEADING,
  HERO_LEDE,
  LANDING_IMAGES,
  SCRIPT_LINES,
  SCRIPT_NOTE,
  TREE_LINES,
  TREE_SECRET,
  VIDEO_CAPTION,
  type Chapter,
} from "@/lib/landing";
import { ensureSample } from "@/lib/projects";
import { WorldSchema } from "@/lib/world/schemas";
import seedJson from "@/data/seed/anukili.json";
import LandingCard from "./LandingCard";
import { useFinePointer } from "./effects";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const DESKTOP = "(min-width: 901px) and (prefers-reduced-motion: no-preference)";
const STACKED = "(max-width: 900px), (prefers-reduced-motion: reduce)";

function scriptLine(
  line: (typeof SCRIPT_LINES)[number],
  index: number,
): React.ReactNode {
  if (line.type === "head") return <div key={index} className="h">{line.text}</div>;
  if (line.type === "who") return <div key={index} className="who">{line.text}</div>;
  if (line.type === "say") return <div key={index} className="say">{line.text}</div>;
  const parts: React.ReactNode[] = [];
  let rest = line.text;
  let k = 0;
  for (const mark of line.marks ?? []) {
    const at = rest.indexOf(mark);
    if (at < 0) continue;
    parts.push(<span key={k++}>{rest.slice(0, at)}</span>);
    parts.push(<mark key={k++}>{mark}</mark>);
    rest = rest.slice(at + mark.length);
  }
  parts.push(<span key={k++}>{rest}</span>);
  return <div key={index}>{parts}</div>;
}

function ChapterExtras({ chapter }: { chapter: Chapter }) {
  if (chapter.feature === "script") {
    return (
      <div className="land-extra land-script" aria-label="Script excerpt">
        {SCRIPT_LINES.map(scriptLine)}
        <small>{SCRIPT_NOTE}</small>
      </div>
    );
  }
  if (chapter.feature === "video") {
    // Playhead line sweeping across the thumbnail row, which spans the
    // player's width. Thumbs sit at y 22vh; the track covers their height.
    return (
      <div
        className="land-extra land-track"
        style={{ left: "18vw", width: "40vw", "--run": "40vw" } as CSSProperties}
        aria-hidden
      >
        <div className="land-playhead" />
      </div>
    );
  }
  if (chapter.feature === "line") {
    return (
      <div className="land-extra land-line">
        <span className="land-line-kicker">The change</span>
        {CHANGE_LINE}
      </div>
    );
  }
  if (chapter.feature === "tree") {
    return (
      <div className="land-extra land-tree" aria-label="Agent package contents">
        <b>the-hunt-at-the-stream/</b>
        {TREE_LINES.slice(1).map((line) => (
          <div key={line.text} className={line.indent ? "in" : ""}>
            {line.text}
          </div>
        ))}
        <div className="sec">{TREE_SECRET}</div>
      </div>
    );
  }
  if (chapter.feature === "browser") {
    return (
      <div className="land-extra land-browser" aria-label="Story website preview">
        <div className="chrome">
          <i />
          <i />
          <i />
          <span>{BROWSER_URL}</span>
        </div>
        <div className="art">
          <Image
            src="/anukili/storm.webp"
            alt="Anukili Ugama story art"
            width={800}
            height={450}
            quality={75}
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </div>
        <div className="txt">
          {BROWSER_TITLE}
          <small>{BROWSER_SUB}</small>
        </div>
      </div>
    );
  }
  return null;
}

function ChapterCopy({ chapter }: { chapter: Chapter }) {
  return (
    <div className={`land-copywrap${chapter.low ? " low" : ""}`}>
      <div className={`land-copy ${chapter.side ?? ""}`}>
        {chapter.soon ? (
          <span className="soon">Coming next</span>
        ) : (
          <div className="kicker">{chapter.kicker}</div>
        )}
        {chapter.heading ? <h2>{chapter.heading}</h2> : null}
        {chapter.body ? <p>{chapter.body}</p> : null}
      </div>
    </div>
  );
}

function MagPill({
  href,
  children,
  light,
  small,
  onClick,
}: {
  href?: string;
  children: React.ReactNode;
  light?: boolean;
  small?: boolean;
  onClick?: () => void;
}) {
  const fine = useFinePointer();
  const cls = `pill${light ? " light" : ""}${small ? " small" : ""} mag`;
  const move = (e: PointerEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - box.left) / box.width - 0.5;
    const py = (e.clientY - box.top) / box.height - 0.5;
    gsap.to(e.currentTarget, {
      x: px * 14,
      y: py * 10,
      duration: 0.4,
      ease: "power3.out",
      overwrite: "auto",
    });
  };
  const leave = (e: PointerEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    gsap.to(e.currentTarget, {
      x: 0,
      y: 0,
      duration: 0.6,
      ease: "power3.out",
      overwrite: "auto",
    });
  };
  const props = fine
    ? { onPointerMove: move, onPointerLeave: leave }
    : {};
  if (href) {
    return (
      <Link href={href} className={cls} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} {...props}>
      {children}
    </button>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<Array<HTMLButtonElement | null>>([]);
  const lenis = useRef<Lenis | null>(null);
  const trigger = useRef<ScrollTrigger | null>(null);
  const active = useRef(0);
  const pulsed = useRef(false);

  const exploreSample = () => {
    ensureSample(WorldSchema.parse(seedJson));
    router.push("/projects/anukili/story");
  };

  // Stacked fallback for narrow screens and reduced motion.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      const stacked = window.innerWidth <= 900 || mq.matches;
      root.current?.classList.toggle("land-static", stacked);
    };
    apply();
    window.addEventListener("resize", apply);
    mq.addEventListener("change", apply);
    return () => {
      window.removeEventListener("resize", apply);
      mq.removeEventListener("change", apply);
    };
  }, []);

  // Preload every card image before the first scroll.
  useEffect(() => {
    let live = true;
    void Promise.all(
      LANDING_IMAGES.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new window.Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = src;
          }),
      ),
    ).then(() => {
      if (live) ScrollTrigger.refresh();
    });
    return () => {
      live = false;
    };
  }, []);

  const setRail = (index: number) => {
    active.current = index;
    rail.current.forEach((button, i) => {
      button?.classList.toggle("on", i === index);
    });
  };

  const goChapter = (index: number) => {
    const st = trigger.current;
    if (lenis.current && st) {
      const y =
        st.start + (index / (CHAPTERS.length - 1)) * (st.end - st.start);
      lenis.current.scrollTo(y);
    } else {
      document
        .querySelector(`.land-ch-${index}`)
        ?.scrollIntoView({ behavior: "smooth" });
    }
  };

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(DESKTOP, () => {
        const scope = root.current;
        if (!scope) return () => {};
        const q = gsap.utils.selector(scope);

        const l = new Lenis();
        lenis.current = l;
        l.on("scroll", ScrollTrigger.update);
        const tick = (time: number) => l.raf(time * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);

        const groups = q<HTMLElement>(".land-ch");
        const outers = q<HTMLElement>(".land-outer");
        gsap.set(outers, { xPercent: -50, yPercent: -50 });
        groups.forEach((group, i) => {
          gsap.set(group, { autoAlpha: i === 0 ? 1 : 0, zIndex: i === 0 ? 10 : 1 });
        });
        // Park every card on its seat; entrances use relative offsets.
        CHAPTERS.forEach((chapter, i) => {
          const seats = groups[i].querySelectorAll<HTMLElement>(".land-outer");
          seats.forEach((seat, k) => {
            const card = chapter.cards[k];
            if (!card) return;
            gsap.set(seat, {
              x: `${card.x}vw`,
              y: `${card.y}vh`,
              rotation: card.r,
              rotationY: card.ry,
              z: card.z,
              scale: card.s,
              // Each outer carries its own perspective, so rotationY reads
              // as a curved wall even through the nested wrappers.
              transformPerspective: 1500,
            });
          });
        });

        const floats: gsap.core.Tween[] = [];
        if (window.matchMedia("(pointer: fine)").matches) {
          q<HTMLElement>(".land-ch-0 .land-mid").forEach((mid, k) => {
            floats.push(
              gsap.to(mid, {
                y: `+=${1 + (k % 3) * 0.4}`,
                duration: 2.2 + (k % 4) * 0.3,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                delay: k * 0.16,
              }),
            );
          });
        }
        const setters = q<HTMLElement>(".land-ch-0 .land-mid").map((mid) => ({
          depth: Number(mid.parentElement?.dataset.depth ?? 0.5),
          xTo: gsap.quickTo(mid, "x", { duration: 0.7, ease: "power3.out" }),
        }));
        const stage = scope.querySelector<HTMLElement>(".land-stage");
        const onPointer = (e: globalThis.PointerEvent) => {
          if (active.current !== 0) return;
          const nx = e.clientX / window.innerWidth - 0.5;
          setters.forEach(({ depth, xTo }) => xTo(nx * 34 * depth));
        };

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: ".land-pin",
            start: "top top",
            end: `+=${(CHAPTERS.length - 1) * 110}%`,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            onUpdate: (self) => {
              const index = Math.round(self.progress * (CHAPTERS.length - 1));
              setRail(index);
              const run = index === 0;
              floats.forEach((f) => (run ? f.play() : f.pause()));
              if (index === 5 && !pulsed.current) {
                pulsed.current = true;
                scope
                  .querySelectorAll(".land-pulse")
                  .forEach((el) => el.classList.add("go"));
              }
            },
          },
        });
        trigger.current = tl.scrollTrigger as ScrollTrigger;
        setRail(0);

        const layerFor = (i: number) =>
          scope.querySelector<HTMLElement>(
            `.land-tint[data-tint="${CSS.escape(CHAPTERS[i].tint)}"]`,
          );

        for (let i = 1; i < CHAPTERS.length; i++) {
          const prev = groups[i - 1];
          const curr = groups[i];
          const prevLayer = layerFor(i - 1);
          const currLayer = layerFor(i);
          const pos = tl.duration();
          tl.set(curr, { zIndex: 10 }, pos);
          tl.set(prev, { zIndex: 1 }, pos + 0.01);
          if (prevLayer && currLayer && prevLayer !== currLayer) {
            tl.to(prevLayer, { opacity: 0, duration: 0.5 }, pos);
            tl.to(currLayer, { opacity: 1, duration: 0.5 }, pos);
          }
          tl.to(prev, { autoAlpha: 0, y: "-4vh", duration: 0.45 }, pos);
          tl.fromTo(
            curr,
            { autoAlpha: 0, y: "4vh" },
            { autoAlpha: 1, y: "0vh", duration: 0.45 },
            pos + 0.05,
          );
          const cards = curr.querySelectorAll(
            ".land-outer:not([data-fade])",
          );
          if (cards.length) {
            tl.from(
              cards,
              {
                opacity: 0,
                y: "+=10vh",
                rotation: "+=5",
                duration: 0.5,
                stagger: 0.06,
              },
              pos + 0.1,
            );
          }
          if (CHAPTERS[i].id === "video") {
            // The story art sits on the player's seat, then fades out as
            // the player fades in, leaving the player and the timeline.
            const out = curr.querySelector("[data-fade='out']");
            const inn = curr.querySelector("[data-fade='in']");
            if (out && inn) {
              tl.fromTo(
                out,
                { opacity: 1 },
                { opacity: 0, duration: 0.3 },
                pos + 0.35,
              );
              tl.fromTo(
                inn,
                { opacity: 0 },
                { opacity: 1, duration: 0.3 },
                pos + 0.35,
              );
            }
          }
          const kids = curr.querySelectorAll(
            ".land-copy > *, .land-extra, .land-hero > *",
          );
          if (kids.length) {
            tl.from(
              kids,
              { opacity: 0, y: 26, duration: 0.4, stagger: 0.08 },
              pos + 0.15,
            );
          }
          tl.to({}, { duration: 0.55 });
        }

        // Load-in: deal the gallery, rise the headline.
        const intro = gsap.timeline({ delay: 0.1 });
        intro.from(q(".land-ch-0 .land-inner"), {
          y: 60,
          opacity: 0,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.07,
        });
        intro.from(
          q(".hero-line span"),
          { yPercent: 110, duration: 0.9, ease: "power3.out", stagger: 0.1 },
          0.15,
        );
        intro.from(
          q(".land-hero-fade"),
          { opacity: 0, y: 18, duration: 0.7, ease: "power3.out", stagger: 0.1 },
          0.4,
        );

        if (window.matchMedia("(pointer: fine)").matches && stage) {
          stage.addEventListener("pointermove", onPointer);
        }

        return () => {
          stage?.removeEventListener("pointermove", onPointer);
          floats.forEach((f) => f.kill());
          trigger.current = null;
          lenis.current = null;
          l.destroy();
          gsap.ticker.remove(tick);
        };
      });

      mm.add(STACKED, () => {
        const targets = gsap.utils.toArray<HTMLElement>(".stack-reveal");
        gsap.set(targets, { opacity: 0, y: 28 });
        ScrollTrigger.batch(targets, {
          start: "top 88%",
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              opacity: 1,
              y: 0,
              duration: 0.7,
              ease: "power3.out",
              stagger: 0.08,
              overwrite: true,
            }),
        });
      });

      return () => mm.revert();
    },
    { scope: root },
  );

  const uniqueTints = Array.from(new Set(CHAPTERS.map((c) => c.tint)));

  return (
    <div ref={root} className="land">
      <header className="land-bar">
        <Link className="logo" href="/">
          Storyverse
        </Link>
        <nav>
          <Link className="quiet" href="/projects">
            Your projects
          </Link>
          <MagPill href="/projects/new" small>
            Start your story
          </MagPill>
        </nav>
      </header>

      <div className="land-pin">
        <div className="land-stage">
          {uniqueTints.map((tint, i) => (
            <div
              key={tint}
              className="land-tint"
              data-tint={tint}
              style={{ background: tint, opacity: i === 0 ? 1 : 0 }}
            />
          ))}
          {CHAPTERS.map((chapter, i) =>
            chapter.id === "start" ? (
              <section key={chapter.id} className={`land-ch land-ch-${i}`} aria-label="Intro">
                {chapter.cards.map((card, k) => (
                  <LandingCard key={`${card.src}-${k}`} card={card} caption={card.kind === "player" ? VIDEO_CAPTION : undefined} />
                ))}
                <div className="land-hero">
                  <h1 className="big">
                    {HERO_HEADING.map((line) => (
                      <span key={line} className="hero-line">
                        <span>{line}</span>
                      </span>
                    ))}
                  </h1>
                  <p className="lede land-hero-fade">{HERO_LEDE}</p>
                  <div className="doors land-hero-fade">
                    <MagPill href="/projects/new">Start your story</MagPill>
                    <MagPill light onClick={exploreSample}>
                      Explore a sample story
                    </MagPill>
                  </div>
                </div>
                <div className="land-hint land-hero-fade">
                  Scroll<i />
                </div>
              </section>
            ) : chapter.id === "begin" ? (
              <section key={chapter.id} className={`land-ch land-ch-${i}`} aria-label="Begin">
                {chapter.cards.map((card, k) => (
                  <LandingCard key={`${card.src}-${k}`} card={card} />
                ))}
                <div className="land-hero">
                  <h2 className="big">
                    {CLOSE_HEADING.map((line) => (
                      <span key={line} className="hero-line">
                        <span>{line}</span>
                      </span>
                    ))}
                  </h2>
                  <div className="doors" style={{ marginTop: 26 }}>
                    <MagPill href="/projects/new">Start your story</MagPill>
                  </div>
                </div>
              </section>
            ) : (
              <section key={chapter.id} className={`land-ch land-ch-${i}`} aria-label={chapter.label}>
                {chapter.cards.map((card, k) => (
                  <LandingCard key={`${card.src}-${k}`} card={card} caption={card.kind === "player" ? VIDEO_CAPTION : undefined} />
                ))}
                <ChapterExtras chapter={chapter} />
                <ChapterCopy chapter={chapter} />
              </section>
            ),
          )}
        </div>
      </div>

      <nav className="land-rail" aria-label="Sections">
        {CHAPTERS.map((chapter, i) => (
          <button
            key={chapter.id}
            ref={(el) => {
              rail.current[i] = el;
            }}
            type="button"
            className={i === 0 ? "on" : ""}
            onClick={() => goChapter(i)}
          >
            <span>{chapter.label}</span>
            <i />
          </button>
        ))}
      </nav>

      <div className="land-stack">
        <section className="stack-reveal stack-hero">
          <h1 className="big">
            One story.
            <br />
            Every screen.
          </h1>
          <p className="lede">{HERO_LEDE}</p>
          <div className="doors">
            <Link className="pill" href="/projects/new">
              Start your story
            </Link>
            <button type="button" className="pill light" onClick={exploreSample}>
              Explore a sample story
            </button>
          </div>
        </section>
        {CHAPTERS.filter((c) => c.heading).map((chapter) => {
          const img =
            chapter.cards.find((c) => c.kind === "art" || c.kind === "sheet")
              ?.src ?? "/anukili/storm.webp";
          const alt =
            chapter.cards.find((c) => c.kind === "art" || c.kind === "sheet")
              ?.alt ?? "Story art";
          return (
            <section key={chapter.id} className="stack-reveal">
              <Image
                src={img}
                alt={alt}
                width={800}
                height={533}
                quality={75}
                loading="lazy"
                decoding="async"
              />
              {chapter.soon ? <span className="soon">Coming next</span> : null}
              <h2>{chapter.heading}</h2>
              <p>{chapter.body}</p>
            </section>
          );
        })}
        <section className="stack-reveal">
          <h2>
            Your story is bigger than one screen.
          </h2>
          <div className="doors">
            <Link className="pill" href="/projects/new">
              Start your story
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
