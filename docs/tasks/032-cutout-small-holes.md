# Task 032: Cut-outs no longer have small holes

You must not deploy anything. Touch only `lib/cutout.ts`, `README.md` and their tests.

Character cut-outs can have holes, especially where clothing or props meet the body. The mask comes from SAM 3.1 and `compositeCutout` in `lib/cutout.ts` applies it as alpha, so any gap in the mask becomes a transparent hole.

## What to change

Add a pure function to `lib/cutout.ts`:

```ts
export function fillSmallMaskHoles(
  raster: Uint8Array,
  width: number,
  height: number,
  maxHoleArea: number,
): Uint8Array
```

- A hole is a 4-connected region of zero pixels that does not touch the edge of the raster.
- Set every pixel in a hole of `maxHoleArea` pixels or fewer to 255.
- Leave larger holes and any region touching the edge unchanged. Larger enclosed regions can be real background, such as the gap between an arm and the body.
- Return a new array, and do not change the input.
- Use an iterative fill, not recursion, because a raster can be millions of pixels.

Add `export const CUTOUT_MAX_HOLE_SHARE = 0.003;` with a one-line comment saying what it is. In `compositeCutout`, call `fillSmallMaskHoles` straight after `base64ToRaster`, with `maxHoleArea` set to `Math.floor(cutout.width * cutout.height * CUTOUT_MAX_HOLE_SHARE)`.

Do not change the SAM request, `selectLargestMask`, the route or any UI. Saved cut-outs stay as they are, and **Cut out again** makes one with the fix.

## Tests

- A small enclosed hole is filled.
- A hole just over the limit is not filled.
- A region touching any edge is not filled.
- Two holes are judged separately.
- The input array is unchanged.
- A 2000 by 2000 raster finishes without a stack overflow.

## README

In `README.md`, change the **Known issues** line to say that small holes are now filled and that a larger hole may still need **Cut out again**. Do not tick the roadmap's "Better cut-out quality" line. The owner decides that after trying it on real art.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say honestly what you could not check. You cannot judge cut-out quality without real art, so say so.
