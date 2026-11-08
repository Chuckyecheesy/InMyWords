# In My Words — demo video voiceover script

Record one MP3 per scene, drop it in `public/audio/` with the exact file
name, run `npm run manifest`, and it lands at the right moment automatically.
Keep each read inside its time budget. Conversational, warm, unhurried.

| File | Budget | Script |
|---|---|---|
| `vo-cold-open.mp3` | 13s | *(play over the charades scene)* Every day, in supported living homes, this game gets played for real. Except it isn't a game — it's someone's Saturday. |
| `vo-presenter.mp3` | 30s | For people who don't speak, the hard part isn't having something to say. It's being understood — and understanding. And when your story gets told, it's usually told by someone else. We built In My Words to change who holds the pen. |
| `vo-logo.mp3` | 15s | In My Words. Your story, told once, in your own voice. This is Marcus. He communicates with picture cards and short phrases. The app is his. |
| `vo-login.mp3` | 12s | Marcus signs in by tapping his own photo and a big-key PIN. No passwords. No time limits. Ever. |
| `vo-categories.mp3` | 5s | On a tired day, three big choices are enough. |
| `vo-speak.mp3` | 21s | And when he has more to say: his own pictures, his own words. He taps coffee — now — and asks for help saying it. The suggestions come from *his* history, phrased his way. He picks one. And only then — in a voice designed with him — the app speaks. Nothing is ever spoken without his approval. |
| `vo-picture-card.mp3` | 6s | New words? He makes his own cards. |
| `vo-letter-board.mp3` | 6s | And the letter board already knows his vocabulary. |
| `vo-builder.mp3` | 8s | A guided path when he wants it — skippable at every step. |
| `vo-eye-typing.mp3` | 10s | No hands? He can spell by looking. Each look halves the alphabet — about five looks per letter. |
| `vo-one-finger.mp3` | 7s | One-finger mode widens everything. And his draft follows him between boards. |
| `vo-choice.mp3` | 30s | Remember what they were trying to say? Bowling versus a movie — with the real costs, against his real weekly budget. That math is plain code, never AI. Marcus chooses. It lands in his planner, and on a real calendar staff actually use. Anything that needs a person becomes a staff task — never an automatic action. |
| `vo-help.mp3` | 13s | And if he needs a person right now: one tap. Every staff screen lights up until someone says "I'm coming." |
| `vo-story.mp3` | 14s | *(mostly Marcus's own narration — keep VO minimal)* His story, told once. Every new staff member hears it from him. |
| `vo-updates.mp3` | 7s | For staff, one feed answers the only question that matters: what changed? |
| `vo-staff.mp3` | 10s | The Onboarding Coach answers from the record — and shows its sources. His words are labelled his. |
| `vo-memory.mp3` | 10s | When the app notices a pattern, it stays a dashed guess — until Marcus confirms it. Only then does it become his. |
| `vo-architecture.mp3` | 10s | Under the hood: plain code where it matters, AI only phrases. Gemini, ElevenLabs, Cloudinary, Tiger Data, Vultr, and MCP. |
| `vo-closing.mp3` | 10s | *(over the callback)* No more charades. In My Words — your story, told once, in your own voice. |

## Captions

When the VO is recorded, put the full subtitle file at `public/captions.srt`
(one caption per phrase, max ~2 lines). It burns in automatically.

## Live-action footage

- `public/footage/cold-open.mp4` — two actors, charades, everyday items (15s+ of usable material; it plays at 2x).
- `public/footage/presenter.mp4` — presenter on camera, 30s.
- `public/footage/closing.mp4` — the same two actors; resident taps the tablet, it speaks the bowling line, staff: "Bowling! Let's go." (7s used).

1080p landscape, decent light, phone footage is fine.

## Music

Any royalty-free track at `public/audio/music.mp3`. It plays at full volume
in the cold open, cuts at the freeze-frame, sits at 30% under the voiceover,
and automatically ducks to zero whenever Marcus's voice speaks.
