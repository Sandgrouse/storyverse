# Task 009: The scrolling landing page and Your projects

The project owner approved these designs. Build them to match, and make them feel alive.

- `docs/design/landing.html` is the landing page. Open it and follow its order, copy, chapter layouts, tints and art choices. Its copy is final, so use it word for word.
- `docs/design/projects.html` is Your projects, including its hover and its dialogs.

The prototype's scroll engine is **choppy, and you must not copy it**. It changes `width` and `height` on every frame, and it uses full-size art. Rebuild the motion as below. You must not deploy anything.

## 1. Libraries

Add `gsap`, `@gsap/react` and `lenis`. Use `ScrollTrigger`, with Lenis for smooth scrolling, wired the standard way: `lenis.on("scroll", ScrollTrigger.update)` and `gsap.ticker.add((t) => lenis.raf(t * 1000))`, with `gsap.ticker.lagSmoothing(0)`. Add both libraries and their licenses to the README's third-party section. Lenis runs only on `/`, and is destroyed on unmount.

## 2. Smoothness rules

These are the point of this task.

- **Animate only `transform` and `opacity`.** Nothing may change `width`, `height`, `top`, `left`, `box-shadow` or `filter` during scroll. Run one scrubbed GSAP timeline, pinned with ScrollTrigger (`scrub: 1`), holding all chapters, with a hold at each chapter so that it rests before moving on.
- **Cards keep one size and one shape.** Render each card at its largest size in the layout, then scale it down with `scale` only. Never scale X and Y differently.
  - Story art cards have a fixed 3:4 shape, using `object-fit: cover`.
  - Character sheet cards have a fixed 2:3 shape.
  - Adjust the prototype's layouts to fit these shapes. Channels, Change and the rest should still read the same.
  - The Video chapter's wide player and thumbnails are separate 16:9 elements that fade in as the Omabala card arrives. They are not the same card stretched.
- **Small images.** Use `next/image` with `width` no more than 800 and quality 75, `loading="eager"` and `decoding="async"`. Do not load 1920px art for these cards. Preload all of them before the first scroll.
- **Layers.** Each card gets `will-change: transform`. Shadows are static. Do not change `z-index` on every frame; set it at chapter boundaries only.
- **Background tint:** use one fixed layer per tint, cross-fading with opacity. Do not repaint a full-screen colour each frame.
- Keep one scroll length per chapter, about 110vh, tuned so a normal wheel flick moves through a transition without jumping past a chapter.
- `gsap.matchMedia()` chooses the mode. Clean up everything through `useGSAP` so route changes leave no triggers or tickers behind.

## 3. Make it juicy

Use three nested elements per card, so effects never fight over one transform: outer for scroll, middle for pointer parallax and float, inner for hover.

- **Load-in:** cards deal into the curved gallery with a stagger, and the headline lines rise in.
- **Hero is alive:** cards drift very slightly with a looping sine float, and shift with pointer position by depth, using `gsap.quickTo`.
- **Card hover:** on landing and on Your projects, the card lifts and tilts toward the pointer by up to 6 degrees, using `quickTo`, and settles back with `power3.out`. Only do this for fine pointers.
- **Buttons:** a slight magnetic pull toward the pointer on the main pills, and a quick press-down on click. Add the press to the shared `.pill` style, so the whole app gets it.
- **Copy:** each chapter's kicker, heading and paragraph rise in with a short stagger.
- **Change chapter:** the three "Breaks" cards pulse their outline once as they arrive.
- **Right-hand marks:** clicking one scrolls smoothly to that chapter through Lenis, and the current one stays highlighted.

Keep it tasteful. Nothing bounces, and every effect is small.

## 4. Page details

- `/` becomes the landing page. Remove `ArrivalHome` and any scene code only it used. Only `/` scrolls this way, so make sure global `overflow: hidden` no longer applies here, and check other pages are unchanged.
- Buttons: "Start your story" goes to `/projects/new`. "Explore a sample story" calls `ensureSample` and goes to `/projects/anukili/story`. The top bar has the logo, "Your projects" and a small "Start your story" pill.
- The script text in the Story chapter and the file tree in the Game chapter are as in the prototype.
- The website chapter keeps its "Coming next" label.
- **Narrow screens (900px and under):** no pin or Lenis. Show the stacked version in the prototype, with cards revealing on scroll through `ScrollTrigger.batch`. No "larger screen" note on `/`, and no horizontal scroll.
- **`prefers-reduced-motion`:** no Lenis, no pin, no float. Show the stacked version.
- **Your projects:** restyle `/projects` to match `docs/design/projects.html`: heading and "New story" at opposite ends, "Saved in this browser." below the heading, a grid of covers with a title and meta row under each, a dashed "+ New story" tile, and the dialogs. Keep existing behaviour and the store. Do not show the prototype's "Example story".

## 5. Structure and tests

Keep it small: `components/landing/*`, with chapter data and layouts in `lib/landing.ts`. Add a unit test that every chapter has copy where expected, and that every image path in `lib/landing.ts` exists under `public/`.

You can't run a server in your sandbox, so don't claim you checked motion. In your final message, say what you could not check.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch.
