# web/ — Next.js app

**Owners: William (T4)** — app shell, design system, shared components, staff routes **· Ahmed (T3)** — resident routes: Speak For Me, story, choice, confirm, voice picker

Tablet-first. Design tokens enforce body ≥22px, tap targets ≥64px, calm colours, plus high-contrast and large-text modes in the header.

## Run

```bash
cd web
npm install
npm run dev
```

The app reads `API_BASE_URL` and `CLOUDINARY_CLOUD_NAME` from the repo-root `.env` (see `.env.example`). If the API is down, screens fall back to sample data for Marcus and Dana and say so.

## Routes

```
app/                         home — open a resident, or enter as staff
app/tasks                    task board, one card per BUILD_PLAN §7 task id
app/resident/[id]            home tile grid (Speak For Me)
app/resident/[id]/story      story pages
app/resident/[id]/choice     supported choice
app/resident/[id]/confirm    "is this still true?" queue
app/resident/[id]/voice      voice picker
app/staff                    pick a resident
app/staff/[id]/onboarding    Essentials, Story, Routines
app/staff/[id]/coach         Coach answer with source labels
app/staff/handoff            since-last-shift summary
app/staff/activity           activity log
app/manager                  stretch placeholder
components/                  shell, tiles, source labels, contrast + text-size toggles
app/tokens.css               design tokens (type, tap, colour, space)
lib/tokens.ts                JS mirrors for Cloudinary pad colours
lib/api.ts                   every backend call from CONTRACTS.md
lib/cloudinary.ts            the one tile recipe
```

Demo resident ids until T2 publishes real ones: `marcus`, `dana`. Staff handoff uses `jordan`.

Task cards follow the staff-experience split in BUILD_PLAN §7 (the §8 schedule). The older frontend-lead list later in that file repeats the same ids and is not a second board.

## Design tokens

Frozen in `app/tokens.css` (CSS) and `lib/tokens.ts` (JS mirrors for Cloudinary pads).

| Token | Value | Why |
|---|---|---|
| `--text-body` | 22px (26px large) | BUILD_PLAN T4.1 / AAC body floor |
| `--tap-min` | 64px (72px large) | PROJECT_PLAN §9 tap targets |
| `--paper` / `--ink` / `--card` | `#E4EFEA` / `#1A2E28` / `#F7FBFA` | Calm residential surfaces |
| Source chips | voice, staff, record, emh, pattern | CONTRACTS source labels |
| High contrast | black on white via `data-theme` | Header toggle, `imw-theme` |
| Large text | `data-text="large"` | Header toggle, `imw-text` |

Body face is Atkinson Hyperlegible. Names use Bricolage Grotesque. Component styles in `app/globals.css` consume these vars — do not hardcode sizes or colours there.

## Cloudinary tile recipe

Frozen in `lib/cloudinary.ts`.

- Calm: `c_fill,g_auto,w_640,h_640/e_background_removal/c_pad,w_720,h_720,b_rgb:F7FBFA/r_48`
- High contrast: `c_fill,g_auto,w_640,h_640/e_background_removal/e_contrast:50,e_sharpen:80/c_pad,w_720,h_720,b_rgb:FFFFFF/r_48`

Square crop, automatic subject/face focus, background removed, 40px padding, 48px corners. `tileImageUrl(publicId, mode)` builds the URL.

**Background removal:** `e_background_removal` is a built-in transformation (billed as a special transformation). Accounts created after 1 Feb 2026 cannot subscribe to the legacy add-on — just use the URL. Older accounts: Console → Add-ons → **Cloudinary AI Remove the Background** → Install Free. First request for a new public_id may return 423 until processing finishes; reload once.

## API client

`lib/api.ts` is the only place that calls the backend. Reads fall back to `lib/mock.ts` when the API is unreachable. Writes (`suggest`, `speak`, `sentences`, story, coach, choices, actions, memory confirm, observations) never pretend they succeeded.
