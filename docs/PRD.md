# Storyverse PRD

Entry for the Meta Global AI Developer Hackathon. Theme: Build for Your World.

## One line

Change the story once, and every channel follows.

## Problem

A creator telling one story across a game, a series and articles re-creates the same characters and story in every tool. Nothing shows which channel reveals what, and a change in one place silently breaks the others.

## Product

Storyverse holds one master copy of a story world (the canon). Meta's models plan it, check it and produce each channel's material. The creator sees the whole story on one map.

## User

A solo creator or small team telling one story across several channels.

## Demo flow (this is the spec's priority order)

1. **Ripple (the hook).** A world is already laid out. The creator states one canon change. Storyverse lists every scene it breaks and why, proposes a fix per channel, regenerates the affected image with the same character, and updates the game brief. The creator approves or rejects each fix.
2. **Channel map.** Beats in story order against channels. Each beat shows which channel reveals it and who in the audience knows it after that channel.
3. **World from scratch.** A premise becomes canon: characters, locations, timeline, secrets, and a channel plan.
4. **Character sheet.** One character becomes a stored sheet: front, left, right and back views plus poses, all on-model.
5. **Agent package.** Export a folder an outside coding agent can use: brief, canon, character sheets, cutouts and a manifest.
6. **Generated clip.** Send a scene to one outside video provider, using the stored character sheet.

## Model roles

| Job | Model |
|---|---|
| Canon, channel planning, continuity checks, fix proposals | Muse Spark 1.3 (`muse-spark-1.3`, or `muse-spark-1.3-contributor` where cost matters) |
| Character sheets, scene images, edits | Muse Image (`muse-image-1.0`), chained with `previous_response_id` to stay on-model |
| Cutouts for the agent package | SAM 3.1 (`sam-3.1`) |
| Video clip | One outside provider (not a Meta model). Clearly labelled in the UI. |

The API is OpenAI-compatible at `https://api.meta.ai/v1`, using the Responses API. See `meta-models/meta-model-cookbook` on GitHub.

## Stack

- Next.js (App Router), TypeScript, Tailwind. Single-workspace app with no accounts.
- `lib/storage` interface with two adapters: local filesystem for development, Vercel Blob in production. The world is one JSON document plus image files.
- Deployed on Vercel. All model calls run on the server. `MODEL_API_KEY` never reaches the browser.
- Long generations are split into steps the client drives, so no single request outlives a serverless timeout.

## Public demo safety

The deployed app holds a real API key. Generation endpoints must enforce a server-side budget (a count of model calls per day) and fall back to read-only browsing of the seeded world when it runs out.

## Demo world

A new world created for this hackathon, with no war or political content. Working title: **Saltlight**, a mystery on a tidal island about a lighthouse keeper's disappearance. Channels: a small game, a web series, and the island's newspaper. The ripple: "Mara cut the lamp herself."

## Out of scope

Live Firefly or Flow connections, more than one outside provider, real publishing to YouTube or TikTok, accounts and multi-user features, engagement analytics, live voice with characters, 3D models, and live game building.

**Stretch, only after the feature freeze:** Muse Code builds a tiny browser game from the agent package, shown as a recording.

## Deadlines (WAT)

- Nov 4, 12:00: feature freeze, deployed
- Nov 4, 18:00: video finished
- Nov 4, 21:00: submitted (hard deadline Nov 5, 03:00)
