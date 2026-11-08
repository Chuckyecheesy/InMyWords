# In My Words — Eye-Gaze and Gesture Input

Added Nov 8 | ~10 working hours for the core | Times relative to start (Hour +0)

*(Markdown version of `In_My_Words_Gaze_Gesture_Detailed_Plan.docx` + `In_My_Words_Gaze_Gesture_Build_Plan.docx` — the docx files are the originals.)*

> Pitch: **Not everyone can tap. In My Words lets residents speak with their eyes or a gesture, and learns how each person prefers to say things.**

## 1. What we're adding

- **Eye-gaze selection**: look at a tile and hold your gaze; a ring fills and the tile is selected.
- **Gesture input**: thumbs up to approve, open palm to cancel or stop.
- **Input profile**: the app learns how each resident communicates best (dwell time, default yes method, time-of-day patterns).
- **Staff knowledge**: a "How Marcus communicates" card in the Onboarding Coach, built from real input history.

| Priority | Items |
|---|---|
| Core (G1–G5) | Consent, calibration, gaze grid with dwell, approve/cancel gestures, event logging |
| Should (G6, G7) | Adaptive settings, How I Communicate card |
| Stretch (G8) | Teach a personal gesture |
| Out of scope | Server-side video processing, storing any video, intent guessing that acts without confirmation |

**Cut order: G8 → G6 → G7. G1–G5 are the core.**

## 2. Technical decisions

| Decision | Choice | Why |
|---|---|---|
| Eye tracking | WebGazer (brownhci/WebGazer) | Browser-only off a normal webcam. No special hardware. |
| Gestures | MediaPipe Gesture Recognizer (tasks-vision), VIDEO mode, 1 hand | Thumb_Up, Open_Palm etc. out of the box; 21 landmarks for the stretch. |
| Why not OpenCV | Evaluated, not used | Server video = slower + breaks the privacy story; OpenCV.js = hand detection from scratch overnight. |
| Loading in Next.js | **Client-side dynamic import only** | Both libraries touch `window` and the camera; SSR crashes. |
| Camera | **One stream, shared** | WebGazer opens the camera; MediaPipe reads WebGazer's video element. Two requests conflict. |
| Data to backend | **Outcome events only, batched every 2s** | No video, no raw gaze samples. Tiny traffic, strong privacy. |
| Gaze layout | 2×3 grid, very large tiles | Webcam gaze is accurate to large regions, not points. |
| Profile maths | Plain code over pre-calculated totals | Rates and medians are arithmetic; no LLM. |
| Coach card text | Templates | Fast and cannot invent behaviour. |
| Storage | Tiger Data **hypertable + continuous aggregate** | High-frequency timestamped events; daily totals keep profile reads instant. |
| Camera requirement | HTTPS | Browsers require it; the Vultr site is already HTTPS (localhost ok for dev). |

## 3. Architecture & new files

Flow: camera (browser only) → WebGazer gaze point + MediaPipe gesture → **Input Controller** (hit-testing, dwell state machine, gesture mapping) → existing Speak For Me flow (sentence strip → suggestions → approval; **nothing is spoken without approval**) → event queue → `POST /input-events` → memory MCP `log_input_event` → `input_events` hypertable. Profile: `GET /input-profile` → `get_input_profile` → daily totals → adaptive settings + Coach card.

```
web/lib/input/gaze.ts          WebGazer start/pause/stop, calibration, smoothing, current point
web/lib/input/gestures.ts      MediaPipe setup, per-frame recognition, held-gesture detection
web/lib/input/controller.ts    hit-testing, dwell state machine, gesture mapping, event emission
web/lib/input/queue.ts         batching, flush on interval + page-hide beacon, retry (max 3)
web/lib/input/profile.ts       fetch profile, expose adaptive settings
web/app/resident/[id]/calibrate/page.tsx    9-point calibration + accuracy check
web/components/CameraConsent.tsx            off by default, explanation, camera-on indicator
web/components/GazeTileGrid.tsx             2×3 grid with dwell rings (wraps existing Tile)
web/components/GestureHint.tsx              thumbs-up (yes) / open-palm (no) hints
web/components/HowICommunicateCard.tsx      Coach card
web/public/models/gesture_recognizer.task   MediaPipe model
api/            POST /input-events, GET /input-profile/{id}
mcp/memory_server.py   log_input_event, get_input_profile
db/             input_events hypertable + daily aggregate, seed history, reset
```

## 4. Algorithms (key numbers)

- **Gaze smoothing**: drop off-screen/null points and single-frame jumps >40% screen width; median of last 10 valid points at ~30 Hz; no valid point for 1s → "I can't see your eyes" message.
- **Hit-testing**: tile rects + 10% padding; overlaps → nearest centre; 150 ms hysteresis when switching tiles.
- **Dwell state machine**: Idle → Fixating (150 ms on tile) → Selected (ring full at `dwell_ms`) → Cooldown (800 ms) → Idle. Off-tile >200 ms drains the ring; look-aways <200 ms (blinks) don't reset it. Pause tile pauses. **Midas-touch mitigations: dwell, cooldown, Pause tile, and the existing confirmation step.**
- **Gestures**: top gesture/score per frame; fire when score ≥0.7 in ≥80% of a 500 ms window; 1s cooldown after firing; only listened for on screens that accept them (suggestions, approval cards, confirm memory); <15 fps → process every 2nd frame. Map: Thumb_Up → approve, Open_Palm → cancel.
- **Event batching**: one event per OUTCOME (select/approve/cancel/timeout), never per frame; flush every 2s or 20 events; beacon on page hide; 3 retries.
- **Profile rules** (plain code): preferred select = highest confirmed rate over 14 days (min 10 events, default touch); preferred yes = most-used approve input; dwell = median confirmed gaze hold ×1.1 clamped 600–1500 ms (default 1000); time-of-day note when a window's confirmed rate is 20+ points below overall; confidence low <10 / medium 10–50 / high >50 events.
- **Worked example (Marcus, seeded)**: gaze 120 selections, 102 confirmed (85%) vs touch 70% → preferred select gaze; Thumb_Up 88 vs touch 12 → preferred yes thumbs up; median hold 950 ms → dwell 1045 ms; evening gaze 62% vs 85% → "In the evening, offer touch."

## 5. UI

- **Camera consent**: big "Use my eyes and hands" toggle, **off by default**; "The camera stays on this tablet. No video is saved."; camera-on indicator whenever running; per-resident; one tap off.
- **Calibration**: 9 targets (3×3 at 10/50/90%), look + tap 5× each, optional spoken prompts; accuracy check on 5 random points — Good <15% screen width, Okay 15–25%, Try again >25%. **Session-only.**
- **Gaze grid**: 2×3 below the sentence strip, ≥5% gaps; resident's top 5 tiles by time of day + a Pause tile; clockwise dwell ring, soft tick; Touch grid / Eye grid toggle on the home screen.
- **Gesture hints**: thumbs-up "yes" / open-palm "no" icons by the approve/cancel buttons; a held gesture fills the matching button like a dwell ring, then fires.
- **How I Communicate card**: top of Essentials; header "How Marcus communicates", source label **"From Marcus's input history"** (never presented as the resident's words); ≤4 template sentences + "based on N interactions"; low confidence adds "Still learning. Ask Marcus how he likes to answer."

## 6. Data (Tiger Data — the prize story)

**`input_events`** hypertable on `ts`: resident_id, session_id, input_type (touch|gaze|gesture), action (select|approve|cancel|custom), target, hold_ms, gesture (nullable), confidence, outcome (confirmed|cancelled|timeout). Index (resident_id, ts).

**Daily totals** continuous aggregate: 1-day buckets per resident × input_type × action — totals, confirmed counts, median hold_ms (confirmed only), counts per time window. Refresh every 5 min covering last 2 days; refresh manually after seeding.

**Seed (add to `db/reset.py`)**: Marcus — ~150 selections mostly gaze (85% confirmed), ~100 approvals mostly thumbs-up, median hold ~950 ms, evening gaze ~62%. Dana — mostly touch (~90% confirmed), a few gaze attempts with frequent cancels.

## 7. Contracts

| Endpoint / tool | Input | Output |
|---|---|---|
| `POST /input-events` | `{"events": [{ts, resident_id, session_id, input_type, action, target, hold_ms, gesture, confidence, outcome}]}` | `{"saved": N}` |
| `GET /input-profile/{resident_id}` | — | `{preferred_select, preferred_yes, dwell_ms, rates, notes, events_counted, confidence}` |
| MCP memory `log_input_event` | one event | ok |
| MCP memory `get_input_profile` | resident | profile object |

## 8. Tasks

- **G1 Setup + consent (+0 → +0.5)**: install WebGazer + tasks-vision, model in `web/public/models`, dynamic imports only, CameraConsent. ✅ Camera only after consent; everything works with camera off. Confirm camera works on the deployed HTTPS site.
- **G2 WebGazer + calibration (+0.5 → +2.5)**: ridge regression, hide previews/dots, session-only calibration, smoothing, debug cursor toggle, calibration + accuracy screens; stop mouse-movement learning after calibration. ✅ Good/Okay at 50–70 cm in normal light.
- **G3 Gaze grid + dwell (+2.5 → +4)**: GazeTileGrid, hit-testing with padding + hysteresis, dwell machine with ring/tick/cooldown/Pause, wire into sentence strip, grid toggle. ✅ Select coffee by looking; ≤1 accidental selection in 30s of looking around.
- **G4 Gestures (+4 → +6.5)**: recognizer in VIDEO mode reading WebGazer's video element, held-gesture detection, map on suggestion/approval/confirm screens, GestureHint + filling-button feedback, frame-rate check. ✅ Thumbs up approves and speaks; open palm cancels; no false triggers in 30s of hand-talking. **Record the backup clip as soon as G4 works.**
- **G5 Logging + storage (+6.5 → +8)**: controller emits outcomes, queue flushes, hypertable + aggregate + refresh policy, seed generator in reset.py, `log_input_event`/`get_input_profile` tools + the two endpoints, profile rules in the backend. ✅ Live events in Tiger Data within seconds; Marcus's profile matches the worked example.
- **G6 Adaptive settings (+8 → +9)**: fetch profile on load; apply dwell_ms; default approval to preferred yes; time-of-day note → open Touch grid first with an "Eye grid" button. ✅ Marcus gets 1045 ms dwell + thumbs-up emphasis; evening starts on Touch grid.
- **G7 How I Communicate card (+9 → +10)**: templates, top of Essentials, source label, refreshes with the profile. ✅ Correct sentences for both residents; updates after new events.
- **G8 Stretch — teach a personal gesture**: 5 samples, normalize 21 landmarks (wrist origin, scale by hand size), `custom_gestures` table, nearest-match + 500 ms hold, still goes through confirmation. ✅ 4 of 5 tries, no false triggers from built-ins.

### Integration points

| Area | Needed | By |
|---|---|---|
| Tile grid | Tile exposes its rectangle + onSelect callback | Hour +2 |
| Sentence strip | Add a tile programmatically; trigger approve/cancel | Hour +3 |
| Speech | Optional spoken calibration prompts; existing /speak | Hour +2 |
| Coach screens | Slot at top of Essentials for the card | Hour +9 |
| Backend | Two endpoints + two memory tools deployed to the VM | Hour +8 |
| Demo | Agree the gaze beat and who performs it | Next stand-up |

## 9. Test cases (TC1–TC15)

Camera off → everything works by touch, no indicator (TC1). Calibration Good/Okay at 60 cm (TC2). 30s of aimless looking → ≤1 accidental selection, Pause works (TC3). Steady look → ring, tick, tile in strip (TC4). Blink/glance doesn't reset the ring (TC5). Thumbs up approves + speaks (TC6); open palm cancels (TC7); 30s of hand-talking → no false approvals (TC8). Glasses → Okay or clear Try-again (TC9). Dim room → lost-eyes message, not random selections (TC10). Network tab: only small JSON batches, no video/gaze stream (TC11). Navigate away → beacon saves queued events (TC12). `db/reset.py` restores seeded history + worked-example profile (TC13). Marcus in the evening → Touch grid first (TC14). Coach card shows gaze/thumbs-up/dwell/evening note (TC15).

**Also test**: bright/dim/venue lighting; with/without glasses; 50/60/70 cm; the actual demo camera.

## 10. Demo beat (20 seconds)

| Time | Action | Line |
|---|---|---|
| 0:00 | Switch to Eye grid | "Not everyone can tap. Marcus can use his eyes." |
| 0:05 | Marcus looks at coffee; ring fills | *(let the ring speak)* |
| 0:10 | Suggestion appears; thumbs up | "And a thumbs up means yes." |
| 0:13 | Sentence spoken in Marcus's voice | *(audio)* |
| 0:16 | Coach card visible | "The app learned how Marcus communicates, so a new staff member knows on day one." |

Prep: same teammate performs every time; calibrate under venue lighting 5 min before; face lit from the front, laptop at eye level, 50–70 cm; reset demo data before judging; **backup clip ready — if gaze misbehaves, demo gestures live and play the gaze clip**.

## 11. Guardrails

1. **Inferred intent never triggers an action directly** — every selection goes through confirmation (which can itself be done by gaze or gesture, so residents stay independent).
2. **Camera only with consent**; one-tap off; visible indicator.
3. **Video is processed only on the device and never stored or sent.**
4. **Input profile is labelled "from input history"** — never presented as the resident's own words.

## 12. Troubleshooting quick table

`window is not defined` → dynamic import with SSR disabled · camera won't start → HTTPS/permissions · gaze jumpy → lighting/distance/recalibrate · drift → head moved, recalibrate · MediaPipe fails → WASM/model paths (check 404s) · laggy gestures → every-2nd-frame, lower resolution · false approvals → raise threshold to 0.8 or window to 700 ms · empty profile → refresh the aggregate after seeding · missing events → backend logs, retries, beacon.

## 13. Prize impact & definition of done

- **Tiger Data**: high-frequency input events in a hypertable with a continuous aggregate + refresh policy is a textbook use case.
- **Overall**: directly answers the brief's "input cannot depend on spelling or typing", with privacy by design.
- **Done**: G1–G5 pass TC1–TC13; the 20-second beat runs cleanly 3× in a row; backup clip recorded; seeded history restores with `db/reset.py`.

## WebGazer integration and verification

WebGazer 3.5.3 runs in the browser. Run npm ci in web, then npm run dev
or npm run build; asset preparation copies WebGazer and all face-mesh files into
public/models. Missing required assets fail preparation. Optional gesture downloads
may fail without disabling eye tracking. The runtime sets faceMeshSolutionPath
to /models/mediapipe/face_mesh. Use HTTPS or localhost.

On Speak For Me, enable **Use my eyes and hands**, then choose **Eye grid** or
**Set up my eyes**. Complete nine stars (five taps each) and five accuracy checks.
Face samples are required for training; checks require a fresh gaze prediction.
A Good or Okay result enables the eye grid when returning to the tiles.
Calibration remains in memory across resident routes and is reset by reload,
resident change, recalibration, or withdrawing consent. WebGazer cross-session
storage is disabled. Camera tracks are stopped explicitly on leaving a tracking
screen or turning consent off; calibration itself does not keep the webcam open.

Only outcome events are posted to /input-events. The API returns 503 when the
memory MCP cannot save the complete batch; the browser retries failed requests.
The existing input-profile endpoint and database schema are unchanged.

Automated checks:
- npm test (frontend logic, lifecycle, and component checks)
- npx playwright test gaze.spec.ts (mock predictions through calibration,
  selection, memory MCP storage, Pause, loss, consent withdrawal, and retry)
- python -m unittest discover -s api/tests -p test_input_events.py

Browser tests run local profile and memory MCP services with seed storage and
require installed Python dependencies plus npx playwright install chromium.
Mock predictions verify integration, not webcam accuracy. For a real-device check,
complete calibration over HTTPS/localhost, dwell on a tile, look away to interrupt
selection, use Pause/Resume, and turn consent off while checking the browser's
camera indicator. Speech still requires the existing approval flow.
