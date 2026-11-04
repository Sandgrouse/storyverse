# Demo video and submission form

## The 3-minute video

Record the app at full width with real results, then speed up the waits and say so on screen ("sped up"). Do several takes of the ripple, because results vary, and keep your best honest one. Replace any line that doesn't sound like you.

| Time | On screen | You say |
|---|---|---|
| 0:00–0:20 | The world view, then type "Enyinyi told them how to kill him." and press **Follow the change**. The story spreads out, and scenes light up. | "One sentence just changed my whole story. And this tool found everything it breaks, in every channel I'm telling it on." |
| 0:20–0:45 | Your real workflow, as a few plain screenshots: Firefly, Flow, Tripo, Unity. | "I'm building a game. Every time I want to make a video, I rebuild my characters in another tool and retell the story somewhere else. Nothing knows what anything else says. So I built Storyverse, during this hackathon." |
| 0:45–1:10 | Back to the ripple. Open a fix card, press **Apply**, show the rewritten scene, and finish with the re-check. | "Muse Spark holds the whole canon. It knows the game can't reveal what only the series reveals. I approve each fix, it rewrites just that scene, and then it checks the whole story again." |
| 1:10–1:40 | Start over. **I already have material**, drop in the treatment and art, watch the fan, then the reading. Cut to "Here's what I understood" and the gaps. | "Starting from nothing takes a minute. Drop in whatever you've got. This is the Igbo myth of Anukili Ugama, from where I come from. It finds the people, the places, and the questions my story hasn't answered." |
| 1:40–1:55 | Channels, with the three secret cards. | "Then it splits the story, so each screen holds a secret the others don't. Fans have to follow all of them to get the truth." |
| 1:55–2:10 | Characters: a new character's **Generate full sheet** sped up, then **Cut out all**, then open the sheet in the viewer. | "This used to be hours across three tools. Muse Image draws the full sheet, the same character every time, and SAM 3.1 cuts it out, ready for a game." |
| 2:10–2:25 | Script: **Draft this scene**, then **Check this script** catching a line that gives away the game's secret. | "Muse writes each scene knowing what that channel is allowed to know, and catches me when I give a secret away." |
| 2:25–2:45 | Video: **Plan shots with Muse**, a character's voice line, then **Export video**. Play a few seconds of the result. | "Then that scene becomes a short, with my characters' voices, made right here in the browser." Use this only if voices worked in your test. |
| 2:45–2:53 | **Agent package**: the Game tab's map and design card, then open `secrets.json`, showing only the game's secret. | "When I hand this to a coding agent, it gets only what the game is allowed to know." |
| 2:53–3:00 | The landing page, scrolling. | "Change the story once, and every channel follows. Everything you saw was built during this hackathon, with Muse Code writing the app. Storyverse." |

**Before recording:**
- Use the human Anukili art.
- Avoid the war and slave-raid episodes. None of the demo needs them.
- Check for any "Sample result" label, and don't present sample results as real. Use a real run for the ripple.
- Don't show the API key or `.env` files.

## Submission form

Check each answer against what you actually show, and put them in your own voice.

**Track:** confirm which one you applied to. I assumed Indie.

**Problem statement:** Build for Your World

**Public GitHub repository:** https://github.com/Sandgrouse/storyverse

**Project description**

> Storyverse is a command centre for one story told across many channels. Give it your scripts and art, and it builds a single master copy of your story world, splits the story so that each channel holds its own secret, and produces what each channel needs: character sheets, scene art, scripts, storyboards, character voices, short videos and packages for coding agents. Change one fact and it finds every scene that breaks across every channel, proposes the smallest fix, and re-checks the whole story. I built it because I keep rebuilding the same characters in different tools for a game I'm making, and nothing keeps the story straight. The demo uses Anukili Ugama, an Igbo myth from where I come from.

**Describe your use of Meta products**

> Muse Spark 1.3 reads PDFs, text and images into a structured canon, plans the channels, runs the continuity ripple with structured output, rewrites scenes, re-checks the canon, drafts and checks scripts, plans storyboards and short videos, chooses character voices, and writes production material. Muse Image 1.0 draws character sheets, scene art and pencil storyboard frames, anchored on reference images and chained with previous_response_id to stay on-model. SAM 3.1 cuts characters out for transparent game assets. Muse Code wrote the application code from task specs, through pull requests. I used Claude Code to write those specs and design prototypes and to review the pull requests, and the repo records this.

**Why are Meta's models important to your solution?**

> The whole product depends on one model holding a complete story in context and reasoning about who may know what. Muse Spark's 1M-token context and multimodal input let it read raw material directly, with no retrieval system, and its structured output makes each fix safe to apply. Muse Image's anchoring is what makes one character sheet reusable, which was my original problem, and SAM 3.1 turns those sheets into usable assets.

**Partner technologies:** check the form's list. Non-Meta tools used: Fish Audio for speech, because Meta has no text-to-speech model, Remotion for video, and React Flow (MIT) for the agent package's story map. ElevenLabs code is included but was never tested live. Name a tool here only if it's actually in the version you submit.

**Most Viral Project:** post the video on X and add the link here, if you want to enter. Engagement counts up to Nov 8.

The form also grants Meta and Cerebral Valley permission to use and promote what you submit. Read that checkbox and the Official Rules before accepting.

## Final checklist

- [ ] Repo is public and has no secrets
- [ ] The video link works in a private browser window
- [ ] The live URL works in a private browser window
- [ ] Everyone who worked on it is listed
- [ ] Billing page checked, with a spend alert set
- [ ] Submitted by about 1 AM WAT on Nov 5, for the 3 AM deadline
