# Task 027: Agent package: tabs on top, accordions, and a map

The owner tested the Agent package dashboard and wants it readable and visual. You have no API keys and must not look for any: test with mocks. You must not deploy anything. Other tasks run at the same time, so **do not touch** `components/landing/*`, `components/experience/{WorldScene,ReadingScene,UnderstoodScene,ChannelsScene,CanonBook,CastDrawer}.tsx`, `app/projects/[id]/script`, `lib/script.ts`, `lib/art.ts`, `lib/world/schemas.ts`, or the game-layout functions in `lib/package.ts`. Put new CSS in `app/package.css` and new components in `components/package/`.

## 1. Layout

- **Channel tabs on top:** Series, Game and Shorts (whatever channels exist) are tabs at the top of the page, under the heading, not at the bottom. The summary tiles stay under them for the chosen channel.
- **View switch:** beside the tabs, a switch between "Map" and "Files" (and "Readiness" for the current readiness cards). Default is "Map". The choice is in the URL (`?view=`) and remembered.
- **Accordions:** every long list is an accordion: a header with a name, a made/total count and a small bar, that opens and closes (keyboard accessible, closed by default except the first). No tall flat columns.
- **Organised, not dumped:** "Not made yet" and the readiness lists are grouped per scene. One row per scene (its title and channel), with chips for Script, Storyboard, Video and Art, each either made (solid, with a link to open it) or not made (dashed, with a link to make it). Character sheets are one row per character with the same kind of chips (Sheet, Cutouts, Voice).

## 2. The Map (a canvas)

A pan-and-zoom canvas, like a workflow editor, showing how the pieces of the chosen channel connect. Use `@xyflow/react` (React Flow, MIT), exactly pinned, and record it in `package.json` and the README's third-party section.
- **Nodes:** one for the Story (canon, with the visual style and logline); one per character; one per place; one per scene; per scene a Script node, a Storyboard node and a Video node; one for the channel's Secret (only this channel's; never another channel's) and one for the Package (the output, with the file count).
- **Edges:** Story to characters and places; characters and places to the scenes they appear in; scene to script to storyboard to video; everything flowing into Package; the secret into Package.
- **Style:** nodes are cards in the app's style. A made node is solid with its small thumbnail where it has art; a not-made node is dashed and quiet with a "Make it" link. Edges are thin, with a faint animation along edges that lead to made nodes. Colour by kind, using the channel's colour for its own nodes.
- **Layout:** left to right in columns (Story, Characters and places, Scenes, Script, Storyboard, Video, Package), computed in a pure function (no layout library needed), spacing generous, fit-to-view on load, with zoom controls, a mini-map and a "Fit" button.
- **Interaction:** clicking a node opens its page (character on the Characters page with `?c=`, scene on Script, Storyboard or Video with `?channel=&part=`). Read only: no dragging of nodes or edges now. Structure the code so editing and automation can be added later, and say so in a comment at the top of the component.
- **Narrow screens:** the map is scrollable and zoomable by touch, and the Files and Readiness views are the default under 900px.
- Add tests for the layout function (columns, no overlaps, only this channel's secret), the graph builder (made and not-made, edges, the secret rule) and the grouped readiness rows.

## 3. Keep what works

The summary tiles, the Export package button and its behaviour, the game layout and its file tree, and the game channel's "coming next" note stay as they are.

## Acceptance

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. Commit on the current branch. Say what you could not check, including the map's interaction.
