# In My Words — product demo video (Remotion)

A 4:10, 1920x1080, 30fps YouTube demo. Everything that can be generated is
already in `public/`; live-action footage, voiceover, music and captions
drop in later without touching code.

## Quick start

```bash
cd video
npm install
npm run studio    # preview in the browser
npm run render    # out/in-my-words-demo.mp4
```

## What's already in public/

- `screens/*.webm` — 18 real app captures recorded with Playwright against
  the current build (re-record: start the stack, then
  `node ../web/scripts/record-demo-screens.mjs` from `web/`).
- `audio/marcus-*.mp3` — the app's actual ElevenLabs voice for Marcus.
- `in-my-words-logo*.svg`, `demo/*.jpg` — brand + demo photos.

## What you drop in (see VO-SCRIPT.md for every file name)

- `footage/cold-open.mp4`, `footage/presenter.mp4`, `footage/closing.mp4`
- `audio/vo-*.mp3` (one per scene), `audio/music.mp3`
- `captions.srt`
- optional `architecture.png` (otherwise the built-in diagram renders)

After adding files run `npm run manifest` (studio/render do it
automatically). Missing files show as dashed "DROP IN FOOTAGE" slots so the
cut always previews at full length.

## Scene map

Timing lives in `src/InMyWordsDemo.tsx` (`SCENES`). The simulated Speak For
Me interaction is `src/scenes/simulated-speak.tsx` — pure React, no screen
recording, so it stays crisp at 1080p.
