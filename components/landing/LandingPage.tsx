"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  BROWSER_SUB,
  BROWSER_TITLE,
  BROWSER_URL,
  CARDS,
  CARD_Z_BASE,
  CHAPTERS,
  CHANGE_LINE,
  CLOSE_HEADING,
  HERO_HEADING,
  HERO_IMAGES,
  HERO_LEDE,
  LANDING_COVER_TIMEOUT_MS,
  LANDING_IMAGES,
  LAYOUTS,
  PUBLISH_SECRETS,
  SCRIPT_LINES,
  SCRIPT_NOTE,
  TREE_LINES,
  TREE_SECRET,
  VIDEO_CAPTIONS,
  VIDEO_SHOT_CARD_IDS,
  cardBasePx,
  cardTag,
  clamp01,
  landingCoverDone,
  layoutRects,
  lerp,
  nearRest,
  segmentEase,
  smooth,
  stagger,
  videoPlayingAt,
  videoShotIndexAt,
  type CardRect,
} from "@/lib/landing";
import { ensureSample } from "@/lib/projects";
import { WorldSchema } from "@/lib/world/schemas";
import seedJson from "@/data/seed/anukili.json";
import LandingCard from "./LandingCard";
import LandingCover from "./LandingCover";
import { useFinePointer } from "./effects";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const DESKTOP = "(min-width: 901px) and (prefers-reduced-motion: no-preference)";
const STACKED = "(max-width: 900px), (prefers-reduced-motion: reduce)";

const PUBLISH_IDX = CHAPTERS.findIndex((c) => c.id === "publish");
const VIDEO_IDX = CHAPTERS.findIndex((c) => c.id === "video");
const CHANGE_IDX = CHAPTERS.findIndex((c) => c.id === "change");

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

function ChapterExtras({
  chapter,
  panelRef,
}: {
  chapter: (typeof CHAPTERS)[number];
  panelRef: (el: HTMLDivElement | null) => void;
}) {
  if (chapter.feature === "script") {
    return (
      <div ref={panelRef} className="land-extra land-script" aria-label="Script excerpt">
        {SCRIPT_LINES.map(scriptLine)}
        <small>{SCRIPT_NOTE}</small>
      </div>
    );
  }
  if (chapter.feature === "line") {
    return (
      <div ref={panelRef} className="land-extra land-line">
        <span className="land-line-kicker">The change</span>
        {CHANGE_LINE}
      </div>
    );
  }
  if (chapter.feature === "tree") {
    return (
      <div ref={panelRef} className="land-extra land-tree" aria-label="Agent package contents">
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
      <div ref={panelRef} className="land-extra land-browser" aria-label="Story website preview">
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

type Geo = {
  W: number;
  H: number;
  rects: CardRect[][];
  base: Map<number, { w: number; h: number }>;
  capW: number;
  capH: number;
};

export default function LandingPage() {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<Array<HTMLButtonElement | null>>([]);
  const lenis = useRef<Lenis | null>(null);
  const trigger = useRef<ScrollTrigger | null>(null);
  const progress = useRef(0);

  const outerEls = useRef(new Map<number, HTMLDivElement>());
  const counterEls = useRef(new Map<number, HTMLDivElement>());
  const flagEls = useRef(new Map<number, HTMLSpanElement>());
  const flagText = useRef(new Map<number, string>());
  const secretEls = useRef(new Map<number, HTMLDivElement>());
  const copyEls = useRef(new Map<number, HTMLDivElement>());
  const extraEls = useRef(new Map<number, HTMLDivElement>());
  const tintEls = useRef<Array<HTMLDivElement | null>>([]);
  const heroEl = useRef<HTMLDivElement>(null);
  const closeEl = useRef<HTMLDivElement>(null);
  const hintEl = useRef<HTMLDivElement>(null);
  const capEl = useRef<HTMLDivElement>(null);
  const headEl = useRef<HTMLDivElement>(null);
  const stageEl = useRef<HTMLDivElement>(null);
  const geo = useRef<Geo | null>(null);
  // First-paint cover: hides once fonts, the hero images and the GSAP setup
  // are ready, or the timeout cap fires. `gsapReady` also reveals the rail.
  const [fontsReady, setFontsReady] = useState(false);
  const [heroReady, setHeroReady] = useState(false);
  const [gsapReady, setGsapReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [coverHidden, setCoverHidden] = useState(false);
  const [coverInstant, setCoverInstant] = useState(false);
  // Boundary caches so per-frame writes stay transform and opacity only:
  // visibility, z-index and classes change only when their state flips.
  const vis = useRef({
    card: new Map<number, boolean>(),
    flag: new Map<number, boolean>(),
    copy: new Map<number, boolean>(),
    extra: new Map<number, boolean>(),
    cap: false,
    head: false,
    hero: true,
    close: false,
    hint: true,
    round: -1,
    pulsed: false,
  });

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
    setCoverInstant(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    const load = (src: string) =>
      new Promise<void>((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = src;
      });
    // Hero images gate the cover; the full set refreshes the triggers.
    void Promise.all(HERO_IMAGES.map(load)).then(() => {
      if (live) setHeroReady(true);
    });
    void Promise.all(LANDING_IMAGES.map(load)).then(() => {
      if (live) ScrollTrigger.refresh();
    });
    return () => {
      live = false;
    };
  }, []);

  // Fonts gate the cover.
  useEffect(() => {
    let live = true;
    if (document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        if (live) setFontsReady(true);
      });
    } else {
      setFontsReady(true);
    }
    return () => {
      live = false;
    };
  }, []);

  // The cover never sticks: the cap hides it however slow the assets are.
  useEffect(() => {
    const t = window.setTimeout(
      () => setTimedOut(true),
      LANDING_COVER_TIMEOUT_MS,
    );
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (
      landingCoverDone({
        fontsReady,
        heroImagesReady: heroReady,
        gsapReady,
        elapsedMs: timedOut ? LANDING_COVER_TIMEOUT_MS : 0,
      })
    ) {
      setCoverHidden(true);
    }
  }, [fontsReady, heroReady, gsapReady, timedOut]);

  const goChapter = (index: number) => {
    const st = trigger.current;
    if (lenis.current && st) {
      const y =
        st.start + (index / (CHAPTERS.length - 1)) * (st.end - st.start);
      lenis.current.scrollTo(y);
    } else {
      document
        .querySelector(`.land-stack [data-stack="${CHAPTERS[index].id}"]`)
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

        const N = CHAPTERS.length;
        const byId = (rects: CardRect[], id: number) =>
          rects.find((r) => r.id === id);

        const buildGeo = () => {
          const W = window.innerWidth;
          const H = window.innerHeight;
          const rects = CHAPTERS.map((_, ch) => layoutRects(ch, W, H));
          const base = new Map<number, { w: number; h: number }>();
          for (const card of CARDS) base.set(card.id, cardBasePx(card.id, W, H));
          // Caption rests on the video chapter's film card (card 6).
          const film = byId(rects[VIDEO_IDX], 6);
          geo.current = {
            W,
            H,
            rects,
            base,
            capW: film ? film.wpx : W * 0.5,
            capH: 0,
          };
        };

        const applySizes = () => {
          const g = geo.current;
          if (!g) return;
          for (const card of CARDS) {
            const b = g.base.get(card.id);
            const outer = outerEls.current.get(card.id);
            if (b && outer) {
              outer.style.width = `${b.w}px`;
              outer.style.height = `${b.h}px`;
            }
          }
          const cap = capEl.current;
          if (cap) {
            cap.style.width = `${g.capW}px`;
            g.capH = cap.offsetHeight || 110;
          }
          const head = headEl.current;
          if (head) {
            // Thumb row geometry at rest; the head tracks it per frame.
            const rest = g.rects[VIDEO_IDX];
            const first = byId(rest, 3);
            const last = byId(rest, 4);
            head.style.height = `${g.H * 0.17}px`;
            if (first && last) {
              const run =
                last.cx + last.wpx / 2 - (first.cx - first.wpx / 2);
              head.style.setProperty("--run", `${run}px`);
            }
          }
        };

        const floats: gsap.core.Tween[] = [];
        if (window.matchMedia("(pointer: fine)").matches) {
          for (const card of CARDS) {
            const outer = outerEls.current.get(card.id);
            const mid = outer?.querySelector<HTMLElement>(".land-mid");
            if (!mid) continue;
            floats.push(
              gsap.to(mid, {
                y: `+=${1 + (card.id % 3) * 0.4}`,
                duration: 2.2 + (card.id % 4) * 0.3,
                yoyo: true,
                repeat: -1,
                ease: "sine.inOut",
                delay: card.id * 0.16,
              }),
            );
          }
        }
        const setters = CARDS.map((card) => {
          const outer = outerEls.current.get(card.id);
          const mid = outer?.querySelector<HTMLElement>(".land-mid");
          return {
            depth: Number(outer?.dataset.depth ?? 0.5),
            xTo: mid
              ? gsap.quickTo(mid, "x", { duration: 0.7, ease: "power3.out" })
              : () => {},
          };
        });
        const stage = scope.querySelector<HTMLElement>(".land-stage");
        const onPointer = (e: globalThis.PointerEvent) => {
          if (vis.current.round !== 0) return;
          const nx = e.clientX / window.innerWidth - 0.5;
          setters.forEach(({ depth, xTo }) => xTo(nx * 34 * depth));
        };

        const applyFrame = (raw: number) => {
          const g = geo.current;
          if (!g) return;
          const { W, H, rects } = g;
          const s = Math.min(N - 1, Math.max(0, raw));
          const i = Math.min(N - 2, Math.floor(s));
          const f = Math.min(1, Math.max(0, s - i));
          const e = segmentEase(f);
          const ri = Math.round(s);
          const v = vis.current;

          // Tint cross-fade between the two chapters in transition.
          tintEls.current.forEach((el, k) => {
            if (!el) return;
            const o = k === i ? 1 - e : k === i + 1 ? e : 0;
            el.style.opacity = String(o);
            el.style.visibility = o < 0.01 ? "hidden" : "visible";
          });

          let thumb: { cx: number; cy: number; w: number; h: number } | null =
            null;
          let film: { cx: number; cy: number; w: number; h: number } | null =
            null;
          for (const card of CARDS) {
            const A = byId(rects[i], card.id);
            const B = byId(rects[i + 1], card.id);
            const outer = outerEls.current.get(card.id);
            const counter = counterEls.current.get(card.id);
            if (!A || !B || !outer || !counter) continue;
            // Prototype frame(): per-card stagger, arc between layouts,
            // push-out from the hero. Transforms and opacity only.
            const st = smooth(stagger(e, card.id));
            const w = lerp(A.wpx, B.wpx, st);
            const h = lerp(A.hpx, B.hpx, st);
            const cx = lerp(A.cx, B.cx, st);
            const cy = lerp(A.cy, B.cy, st);
            const arc = Math.sin(st * Math.PI) * (A.o && B.o ? -26 : 0);
            const push =
              i === 0 && st === 0
                ? f * 2.2 * (A.x < 50 ? -1 : 1) * (W / 100)
                : 0;
            const base = g.base.get(card.id);
            const sx = base && base.w ? w / base.w : 1;
            const sy = base && base.h ? h / base.h : 1;
            gsap.set(outer, {
              x: cx + push,
              y: cy + arc,
              xPercent: -50,
              yPercent: -50,
              scaleX: sx,
              scaleY: sy,
              rotation: lerp(A.rz, B.rz, st),
              rotationY: lerp(A.ry, B.ry, st),
              z: lerp(A.tz, B.tz, st),
              transformPerspective: 1500,
            });
            // Counter-scale so the picture never stretches; the wrapper
            // clips, so the card visibly reshapes around a steady picture.
            gsap.set(counter, { scaleX: 1 / sx, scaleY: 1 / sy });
            const o = lerp(A.o, B.o, st);
            const shown = o >= 0.01;
            outer.style.opacity = String(o);
            if ((v.card.get(card.id) ?? true) !== shown) {
              v.card.set(card.id, shown);
              outer.style.visibility = shown ? "visible" : "hidden";
            }
            if (card.id === 6) film = { cx, cy, w, h };
            if (card.id === 3) thumb = { cx, cy, w, h };
            // Tag labels near the chapter rest, as in the prototype. Flags
            // are siblings of the clipped outer and track the card's
            // computed rect with transform only, so the counter-scale can
            // never push them outside the visible card.
            const flag = flagEls.current.get(card.id);
            if (flag) {
              const { text: tag, hit } = cardTag(ri, card.id);
              const near = nearRest(s);
              if (flagText.current.get(card.id) !== tag) {
                flagText.current.set(card.id, tag);
                flag.textContent = tag;
                flag.classList.toggle("hit", hit);
                flag.classList.toggle("shot", !hit && tag !== "");
              }
              gsap.set(flag, { x: cx - w / 2 + 10, y: cy - h / 2 + 10 });
              const fShown = Boolean(tag) && near && o >= 0.01;
              flag.style.opacity = fShown ? "1" : "0";
              if ((v.flag.get(card.id) ?? true) !== fShown) {
                v.flag.set(card.id, fShown);
                flag.style.visibility = fShown ? "visible" : "hidden";
              }
            }
            // Publish secret banners ride their card but show at rest.
            const secret = secretEls.current.get(card.id);
            if (secret) {
              const so = clamp01(1 - Math.abs(s - PUBLISH_IDX) * 2.8);
              const sShown = so >= 0.01;
              secret.style.opacity = String(so);
              if ((v.extra.get(100 + card.id) ?? true) !== sShown) {
                v.extra.set(100 + card.id, sShown);
                secret.style.visibility = sShown ? "visible" : "hidden";
              }
            }
          }

          // Chapter boundaries only: z order, rail, pulse, floats.
          if (v.round !== ri) {
            v.round = ri;
            for (const card of CARDS) {
              const outer = outerEls.current.get(card.id);
              if (!outer) continue;
              const A = byId(rects[Math.min(i, N - 1)], card.id);
              const B = byId(rects[Math.min(i + 1, N - 1)], card.id);
              const on = (A && A.o) || (B && B.o);
              outer.style.zIndex = on
                ? String(CARD_Z_BASE + (LAYOUTS[ri]?.[card.id] ? card.id : 0))
                : "0";
            }
            rail.current.forEach((button, k) => {
              button?.classList.toggle("on", k === ri);
            });
            if (ri === CHANGE_IDX && !v.pulsed) {
              v.pulsed = true;
              for (const id of [3, 4, 6]) {
                outerEls.current.get(id)?.classList.add("go");
              }
            }
            floats.forEach((tween) => (ri === 0 ? tween.play() : tween.pause()));
          }

          // Copy blocks drift against the scroll, fading with distance.
          copyEls.current.forEach((el, ch) => {
            const dist = s - ch;
            const o = clamp01(1 - Math.abs(dist) * 2.6);
            gsap.set(el, { y: -dist * 90 });
            el.style.opacity = String(o);
            const shown = o >= 0.01;
            if ((v.copy.get(ch) ?? true) !== shown) {
              v.copy.set(ch, shown);
              el.style.visibility = shown ? "visible" : "hidden";
            }
          });

          // Panels fade with their chapter; script/tree/browser also drift.
          extraEls.current.forEach((el, ch) => {
            const dist = s - ch;
            const o = clamp01(1 - Math.abs(dist) * 2.8);
            const feature = CHAPTERS[ch].feature;
            if (
              feature === "script" ||
              feature === "tree" ||
              feature === "browser"
            ) {
              gsap.set(el, { y: -dist * 70 });
            }
            el.style.opacity = String(o);
            const shown = o >= 0.01;
            if ((v.extra.get(ch) ?? true) !== shown) {
              v.extra.set(ch, shown);
              el.style.visibility = shown ? "visible" : "hidden";
            }
          });

          // Video caption tracks the film card; playhead tracks the thumbs.
          const cap = capEl.current;
          if (cap && film) {
            const co = clamp01(1 - Math.abs(s - VIDEO_IDX) * 2.8);
            gsap.set(cap, {
              x: film.cx - g.capW / 2,
              y: film.cy + film.h / 2 - (g.capH || 110),
            });
            cap.style.opacity = String(co);
            const shown = co >= 0.01;
            if (v.cap !== shown) {
              v.cap = shown;
              cap.style.visibility = shown ? "visible" : "hidden";
            }
          }
          const head = headEl.current;
          if (head && thumb) {
            const ho = clamp01(1 - Math.abs(s - VIDEO_IDX) * 2.8);
            gsap.set(head, {
              x: thumb.cx - thumb.w / 2,
              y: thumb.cy - thumb.h / 2 - H * 0.01,
            });
            head.style.opacity = String(ho);
            const shown = ho >= 0.01;
            if (v.head !== shown) {
              v.head = shown;
              head.style.visibility = shown ? "visible" : "hidden";
            }
          }

          const hero = heroEl.current;
          if (hero) {
            const ho = clamp01(1 - s * 3.2);
            hero.style.opacity = String(ho);
            const shown = s <= 0.32;
            if (v.hero !== shown) {
              v.hero = shown;
              hero.style.visibility = shown ? "visible" : "hidden";
            }
          }
          const hint = hintEl.current;
          if (hint) {
            const ho = clamp01(1 - raw * 5);
            hint.style.opacity = String(ho);
            const shown = ho >= 0.01;
            if (v.hint !== shown) {
              v.hint = shown;
              hint.style.visibility = shown ? "visible" : "hidden";
            }
          }
          const close = closeEl.current;
          if (close) {
            const co = clamp01(1 - Math.abs(s - (N - 1)) * 3);
            close.style.opacity = String(co);
            const shown = co >= 0.01;
            if (v.close !== shown) {
              v.close = shown;
              close.style.visibility = shown ? "visible" : "hidden";
            }
          }
        };

        buildGeo();
        applySizes();

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: ".land-pin",
            start: "top top",
            end: `+=${(N - 1) * 110}%`,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            onUpdate: (self) => {
              progress.current = self.progress * (N - 1);
              applyFrame(progress.current);
            },
          },
        });
        tl.to({}, { duration: N - 1 });
        trigger.current = tl.scrollTrigger as ScrollTrigger;
        progress.current = 0;
        applyFrame(0);
        setGsapReady(true);

        // Video mini-cut: the film card cross-fades through the four
        // thumbnail pictures (3s each) with a slow push-in, the matching
        // thumbnail is outlined, the caption follows, and the red playhead
        // runs the whole 12s loop in sync. It plays once the chapter's rest
        // is reached and pauses when it leaves; film and playhead animate
        // with transform and opacity only, driven by stage classes.
        const videoStage =
          stage ?? scope.querySelector<HTMLElement>(".land-stage");
        let shot = 0;
        let elapsed = 0;
        let lastTick = performance.now();
        let playing = false;
        const setShot = (next: number) => {
          shot = next;
          videoStage?.setAttribute("data-shot", String(next));
          if (capEl.current) {
            capEl.current.textContent =
              VIDEO_CAPTIONS[next] ?? VIDEO_CAPTIONS[0];
          }
          for (let k = 0; k < VIDEO_SHOT_CARD_IDS.length; k++) {
            outerEls.current
              .get(VIDEO_SHOT_CARD_IDS[k])
              ?.classList.toggle("shot-now", k === next);
          }
        };
        setShot(0);
        const videoTick = () => {
          const now = performance.now();
          const dt = (now - lastTick) / 1000;
          lastTick = now;
          const shouldPlay = videoPlayingAt(progress.current, VIDEO_IDX);
          if (shouldPlay !== playing) {
            playing = shouldPlay;
            videoStage?.classList.toggle("playing-video", shouldPlay);
            headEl.current?.classList.toggle("playing", shouldPlay);
          }
          if (playing) {
            elapsed += dt;
            const next = videoShotIndexAt(elapsed);
            if (next !== shot) setShot(next);
          }
        };
        const videoTimer = window.setInterval(videoTick, 200);

        const onResize = () => {
          buildGeo();
          applySizes();
          applyFrame(progress.current);
          ScrollTrigger.refresh();
        };
        window.addEventListener("resize", onResize);

        // Load-in: deal the gallery, rise the headline.
        const intro = gsap.timeline({ delay: 0.1 });
        intro.from(q(".land-hero .hero-line > span"), {
          yPercent: 110,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.1,
        });
        intro.from(
          q(".land-hero-fade"),
          { opacity: 0, y: 18, duration: 0.7, ease: "power3.out", stagger: 0.1 },
          0.15,
        );
        intro.from(
          q(".land-inner"),
          {
            y: 60,
            opacity: 0,
            duration: 0.9,
            ease: "power3.out",
            stagger: 0.07,
          },
          0.1,
        );

        if (window.matchMedia("(pointer: fine)").matches && stage) {
          stage.addEventListener("pointermove", onPointer);
        }

        return () => {
          gsap.ticker.remove(videoTick);
          videoStage?.classList.remove("playing-video");
          videoStage?.removeAttribute("data-shot");
          window.removeEventListener("resize", onResize);
          stage?.removeEventListener("pointermove", onPointer);
          floats.forEach((tween) => tween.kill());
          trigger.current = null;
          lenis.current = null;
          l.destroy();
          gsap.ticker.remove(tick);
        };
      });

      mm.add(STACKED, () => {
        // Stacked fallback (narrow screens, reduced motion): no scroll
        // engine to wait for, so the cover's GSAP condition is met here.
        // The mini-cut stays parked on its first shot with its caption.
        setGsapReady(true);
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

  return (
    <div ref={root} className={`land${gsapReady ? " land-ready" : ""}`}>
      <LandingCover hidden={coverHidden} instant={coverInstant} />
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
        <div
          ref={stageEl}
          className="land-stage"
          data-shot="0"
        >
          {CHAPTERS.map((chapter, k) => (
            <div
              key={chapter.id}
              className="land-tint"
              data-tint={chapter.tint}
              ref={(el) => {
                tintEls.current[k] = el;
              }}
              style={{
                background: chapter.tint,
                opacity: k === 0 ? 1 : 0,
                visibility: k === 0 ? "visible" : "hidden",
              }}
            />
          ))}
          {CARDS.map((card) => (
            <LandingCard
              key={card.id}
              card={card}
              secret={PUBLISH_SECRETS[card.id]}
              outerRef={(el) => {
                if (el) outerEls.current.set(card.id, el);
                else outerEls.current.delete(card.id);
              }}
              counterRef={(el) => {
                if (el) counterEls.current.set(card.id, el);
                else counterEls.current.delete(card.id);
              }}
              secretRef={(el) => {
                if (el) secretEls.current.set(card.id, el);
                else secretEls.current.delete(card.id);
              }}
            />
          ))}
          {CARDS.map((card) => (
            <span
              key={`flag-${card.id}`}
              ref={(el) => {
                if (el) flagEls.current.set(card.id, el);
                else flagEls.current.delete(card.id);
              }}
              className="land-flag"
              aria-hidden="true"
            />
          ))}
          {CHAPTERS.map((chapter, ch) =>
            chapter.heading ? (
              <div
                key={chapter.id}
                ref={(el) => {
                  if (el) copyEls.current.set(ch, el);
                  else copyEls.current.delete(ch);
                }}
                className={`land-copywrap${chapter.low ? " low" : ""}`}
              >
                <div className={`land-copy ${chapter.side ?? ""}`}>
                  {chapter.soon ? (
                    <span className="soon">Coming next</span>
                  ) : (
                    <div className="kicker">{chapter.kicker}</div>
                  )}
                  <h2>{chapter.heading}</h2>
                  <p>{chapter.body}</p>
                </div>
              </div>
            ) : null,
          )}
          {CHAPTERS.map((chapter, ch) =>
            chapter.feature !== "none" && chapter.feature !== "video" ? (
              <ChapterExtras
                key={chapter.id}
                chapter={chapter}
                panelRef={(el) => {
                  if (el) extraEls.current.set(ch, el);
                  else extraEls.current.delete(ch);
                }}
              />
            ) : null,
          )}
          <div ref={capEl} className="land-cap" data-cap>
            {VIDEO_CAPTIONS[0]}
          </div>
          <div ref={headEl} className="land-head" data-head>
            <div className="land-playhead" />
          </div>
          <div ref={heroEl} className="land-hero">
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
          <div ref={hintEl} className="land-hint">
            Scroll<i />
          </div>
          <div ref={closeEl} className="land-hero land-close">
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
        <section className="stack-reveal stack-hero" data-stack="start">
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
        {CHAPTERS.filter((c) => c.heading).map((chapter) => (
          <section
            key={chapter.id}
            className="stack-reveal"
            data-stack={chapter.id}
          >
            <Image
              src={`/anukili/${chapter.img}.webp`}
              alt={chapter.heading ?? chapter.label}
              width={800}
              height={533}
              quality={75}
              loading="lazy"
              decoding="async"
            />
            {chapter.soon ? <span className="soon">Coming next</span> : null}
            <h2>{chapter.heading}</h2>
            <p>{chapter.body}</p>
            {chapter.id === "video" ? (
              <p className="land-stack-cap">{VIDEO_CAPTIONS[0]}</p>
            ) : null}
          </section>
        ))}
        <section className="stack-reveal" data-stack="begin">
          <h2>Your story is bigger than one screen.</h2>
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
