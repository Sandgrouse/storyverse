# Task 035: The download includes art that ships with the app

This builds on Tasks 033 and 034, so run it on a branch that already has that work. You must not deploy anything. Touch only `lib/package.ts`, `components/package/PackageDashboard.tsx`, `README.md` and their tests. Add no dependency, and change no styling or wording on the page.

## The bug

Reproduced on the Anukili sample. The Agent package page says "Scene art 5 of 5", but the exported ZIP holds no scene art and no character sheets. The game's `raea/story.ts` comes out with `HERO = null` and `art: null`, and a short that uses `/anukili/fire.webp` loses that shot.

Cause: the sample's art is saved as public paths such as `/anukili/fire.webp`. Generated art is saved as data URLs. `planAgentFiles` is pure and decodes only data URLs with `dataUrlToBytes`, so it drops every public path.

Keep `planAgentFiles` and `planGameFiles` pure and synchronous. Turn public paths into data URLs before calling them.

## 1. `inlinePublicArt` in `lib/package.ts`

```ts
export async function inlinePublicArt(
  world: World,
  load: (path: string) => Promise<string | null>,
): Promise<World>
```

- It returns a new world and leaves the input unchanged.
- It covers these image fields: `characters[].sheet[].imagePath`, `characters[].sheet[].cutoutPath`, `parts[].imagePath`, `storyboards[].frames[].imagePath` and `shorts[].shots[].imagePath`.
- It replaces a value only when it starts with exactly one `/`, so not `//`. Data URLs, `idb:` references, `http` URLs and empty values stay as they are.
- It calls `load` once per distinct path, even when several fields share it.
- It keeps the original value when `load` returns null, rejects or returns anything that does not start with `data:image/`. One bad file must not fail the export. That image is then left out as it is today.
- It returns the same `world` object when no field needs replacing, so a project with only generated art does no extra work.

## 2. `components/package/PackageDashboard.tsx`

Use `artToDataUrl` from `lib/images.ts` as the loader.

- **Export:** `exportZip` must await `inlinePublicArt(world, artToDataUrl)` and pass the result to `buildAgentZip`, whatever the state of the preview below.
- **Files view and counts:** the file list comes from `planAgentFiles`, so it must also show this art. Hold the inlined world in state, filled by an effect when `world` changes. Ignore a result that arrives after `world` has changed again. Use it for the `files` memo and fall back to `world` until it is ready. Everything else on the page keeps using `world`.
- The page must not pause or show a new loading state while this runs.

## 3. `README.md`

Leave the README alone unless it says something this fix makes untrue. Add no new known issue.

## Tests

Add these to a new `tests/package-public-art.test.ts`, with a fake `load` and a small real PNG data URL:

- A sheet image, a cut-out, a part image, a storyboard frame and a shot image on public paths are all replaced.
- Data URLs, `idb:` references, `http` URLs, `//` paths and empty values are unchanged, and `load` is not called for them.
- A path used in three fields calls `load` once.
- `load` returning null, rejecting, or returning `data:text/html,...` keeps the original value, and the other images are still replaced.
- The input world is not changed.
- A world with nothing to replace returns the same object.
- After inlining, `planAgentFiles` for a series channel includes the sheet and scene art, and a short's public-path shot gets its media file with no "Left out" line.
- After inlining, `planAgentFiles` for a game channel gives `raea/story.ts` a non-null `HERO` and scene `art`, with the matching files in `raea/media/`.
- Inlining does not add a part this channel doesn't cover, or another channel's secret marker, to the package.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say honestly what you could not check, including anything you could not see in a browser.
