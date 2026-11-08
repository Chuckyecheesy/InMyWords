# In My Words — Post-demo Roadmap

From demo to a personal, private, daily-use communication app. Residents get their own dashboard, flexible input modes, and a planner they control. Staff get one updates feed and a records library.

**Timing guard:** Phase 1's demo-stripping items (pitch link, attribution, disclaimer) land **only after judging is finished**. Everything else can start immediately.

## Product rules (unchanged, non-negotiable)

1. Nothing is spoken, sent, saved as the resident's words, or booked without resident approval.
2. Facts keep source labels. Presentation gets simpler; provenance never disappears.
3. Imported records and staff observations stay distinct from resident-confirmed facts.
4. Residents can decline, undo, or leave a choice undecided. There is no "staff decided."
5. Input modes are optional. Eye tracking and gestures are never required.
6. Resident-facing controls stay accessible: 64px+ targets, clear feedback, no time limits, calm visuals. Copy style: plain sentences, no em dashes.

---

## Phase 0 — Security (NOW, before any feature work)

The deploy-log leak James cleaned up is one of four credentials that have been shared in plain text (team chat / logs). Deleting logs does not un-expose a key.

| Credential | Action | Owner |
|---|---|---|
| Gemini API key | Rotate in Google AI Studio console → update `.env` → `ops/deploy.sh --env-only` | Ahmed (key owner) + James (VM) |
| ElevenLabs `sk_` key | Rotate in ElevenLabs dashboard → same update path | James |
| Tiger Data `DATABASE_URL` | Reset the `tsdbadmin` password in the Tiger console → update `.env`s + VM | Tiffany |
| Vultr API key | Regenerate in Vultr console (it has root-level account permissions) | James |

Also: from now on secrets move only by DM/password manager, never group chat. The GitHub Actions deploy key already has its documented revocation path in `ops/DEPLOY.md`; revisit after the event.

**Gate:** all four rotated, old values confirmed dead, live site still healthy.

---

## Phase 1 — Navigation & cleanup (S, ~half a day) — Ahmed + William

Small, visible, zero-risk wins first.

- **Fix Home buttons** on `/staff` and `/resident/[id]`. Rule: staff Home → `/staff`; resident Home → `/resident/[id]` (their own dashboard). Add an e2e assertion per shell so this can't regress silently.
- **Copy pass:** remove em dashes from user-facing strings; sweep with a lint grep (`—` in `web/app` + `web/components`).
- **Images:** replace mismatched tile/demo photos. *(Decision 2 answered below: staff-uploaded personal photos via the existing Cloudinary pipeline are the product answer; for demo residents use a licensed/consistent set processed through the same one tile recipe so everything matches.)*
- **"Make it playable"** *(Decision 1 answered)*: the entry-page preview card becomes a real mini-interaction: tap one of its three tiles → the quote line updates → tap the speak chip → plays a pre-generated audio clip. Working, bounded, no backend writes. Anything that can't be made functional gets a visible "Preview" label instead.
- **After judging only:** remove pitch-deck link/section, the "Built with" stack row, and the CommuniHacks/fictional-people footer from `/`. Keep `/pitch` itself reachable by URL for posterity. While demo profiles remain public, badge them "Demo profile" instead of deleting the disclaimer silently.

**Gate:** no broken primary navigation, no dead controls, no em dashes in UI copy.

## Phase 2 — Accounts & privacy (L, the big one) — Tiffany (backend) + William (UI)

Today every route is public and the API trusts whatever `resident_id` it's given. The real work is **backend authorization**, not the login form.

- **Model:** `users` table (id, role: resident|staff|manager, resident_id?, password hash or PIN hash), `staff_assignments` (staff_id → resident_id). Sessions as signed HTTP-only cookies; FastAPI dependency resolves the session → scope.
- **Enforcement at the API layer:** every endpoint that takes `resident_id` validates it against the session scope (residents: self only; staff: assigned residents only). The MCP servers stay internal (localhost on the VM) — the API is the sole gatekeeper, which matches the existing architecture rule.
- **Login UX for shared tablets:** photo-tile login for residents (tap your face, enter a large-key PIN), standard email/password for staff. Logout + fast "switch person" on the shared device. No time-limited sessions on the resident side (no-time-limits rule); staff sessions expire.
- **Create-a-resident (staff):** form for preferred name, communication preferences, assigned staff; creates the resident row + tiles starter set. Everything staff enters is labelled staff-provided until the resident confirms it (existing memory-confirm flow already does this — reuse it).
- **Tests are the gate:** direct-URL and direct-API attempts to read another resident's dashboard/data must 403, as e2e tests.

**Gate:** cross-resident access tests pass at both UI and API level; staff can create and assign a resident without code.

## Phase 3 — Staff workflow (M) — William + Tiffany

- **Unified Updates page** replacing Since-last-shift + Activity log. The two existing endpoints (`/handoff`, `/activity/{id}`) already cover the data; add one merged endpoint `/updates` (staff_id, resident?, since?, types?) that dedupes (an approved action currently appears in both feeds — dedupe on source event id). Old routes 301 to the new page. Keep the empty/loading/error states the current handoff page already does well.
- **Compact Coach citations:** replace the big SOURCES banner with a "View sources" disclosure per answer (chip count collapsed by default). Provenance stays; presentation shrinks. The "resident's own words" label shows only when a resident-confirmed fact supports the answer.
- **Records library** per resident: list/search/open past records by date + category; "Add record" (document upload via existing Cloudinary/binder-import path, or a typed staff update). New `documents` table (id, resident_id, title, category, author, doc_date, uploaded_at, cloudinary_id/text). The existing binder importer becomes the ingest path for uploads; extracted facts keep `source=document` with the doc's date, land in the confirm queue, and never overwrite — `propose_update` already handles contradictions. Update history is append-only.

**Gate:** one page answers "what changed"; a staff-added dated update is findable in Records and citable by the Coach; history never disappears.

## Phase 4 — Core communication (M) — Ahmed

- **Custom cards ("Add card")**: start on Say my words, then label → photo (upload via existing `PhotoUpload` or pick from library) → preview → confirm. Writes a `tiles` row (table already supports it). My picture cards is hidden from navigation but remains available at its direct URL to hide cards and undo; archived cards are hidden, not deleted.
- **Broader activities:** seed tiles and the Choice agent's option set beyond bowling (swimming, basketball, walk, movie, music, "Something else", "Not yet decided"). The Action agent already grounds per-activity; add a small activity→venue map for the mock booking site. Expressing interest (log_choice) and booking (plan + approval card) stay separate steps — they already are; make the UI distinction explicit.
- **Guided builder (optional path):** What → Where (skippable) → When (skippable), assembling the tile strip. Free tile selection remains the default; the guide is a button, not a gate.
- **Typing + suggestions:** large letter board; word suggestions appear after typed letters (start from the resident's own tile labels + confirmed-memory vocabulary before reaching for an LLM — fast, personal, offline-safe). Suggestions are always tap-to-accept, never auto-inserted, never auto-spoken; "none of these" always present.

**Gate:** a resident creates a custom card, uses it in a sentence, communicates a non-bowling activity, and nothing plays before approval.

## Phase 5 — Planner & messaging (M/L) — Ahmed (resident UI) + Tiffany (data)

- **My Planner replaces the Story nav slot** (route `/resident/[id]/planner`). Story pages and approved narrations stay at their URLs and remain linked from the staff onboarding flow; nothing is deleted *(Decision 6 answered: archive from resident nav, keep content reachable)*.
- **Data:** extend `calendar_events` with `kind` (routine|event|visit_offer|visit_confirmed) + `recurrence` + `proposed_by`. Residents add/edit routines (approval = their own save); staff propose visits (`visit_offer`) which render as offers, never as confirmed; resident confirmation flips them. Conflicts are shown, not resolved automatically.
- **Calendar-aware choices:** the Choice screen shows that day's planner items next to the options and explains conflicts in plain words ("Bowling is at 2pm. Lisa's visit offer is at 2pm too."). Outcome stays Chosen / Not yet decided; selecting never books (already true — keep it).
- **Mailbox** *(Decision 5 answered: in-app)*: `drafts` table; drafting from a choice/plan pre-fills recipient + message; resident can edit/discard/save; sending is a separate approval through the existing `send_message` allowlist with sending/sent/failed states. Nothing auto-sends.

**Gate:** routine add→review→approve works; a visit offer never displays as confirmed; a draft never sends without its own approval.

## Phase 6 — Advanced access & staff help (L, device-dependent) — Ahmed + William

Builds directly on the shipped gaze stack (calibration, dwell, smoothing, consent).

- **One-finger mode:** spacing/size preset over the existing letter board + tiles; undo-first correction flow.
- **Eye-tracking typing:** reuse dwell infrastructure for an **alphabet-halving board** (binary letter narrowing — each dwell halves the remaining alphabet; ~5 dwells per letter). Pause tile and touch fallback always on screen; profile's dwell_ms applies.
- **Voice** *(Decision 3 answered)*: "voice augmentation" = the resident's personalized ElevenLabs voice speaking their composed text (already built), plus standard TTS as default. Speech-to-text input is out of scope until a concrete use case is defined.
- **Get staff help** *(Decision 4 answered: notify on-duty staff in-app/urgent task first — a real phone call via Twilio is a later upgrade)*: persistent, large control on resident screens → confirmation ("Ask the on-duty staff member to come?") → creates an **urgent** staff task (new priority flag on `staff_tasks`) + a prominent banner/sound on staff screens → shows requesting/acknowledged/failed, with "try again / ask someone else" fallback. Explicitly labelled that it is **not** emergency services.
- Every mode switch preserves the current draft (shared composer state).

**Gate:** tested on the actual tablet with real residents' workflows simulated; every mode has a working fallback; the help flow is acknowledged end-to-end.

---

## Answers to the open decisions (proposed defaults — veto anything)

1. **"Playable"** = the entry preview becomes a real bounded mini-interaction (tap tile → sentence updates → hear pre-generated audio). Full flows stay in the app itself.
2. **Images** = residents' own photos via the existing Cloudinary upload + tile recipe; licensed consistent placeholder set for demo profiles.
3. **Voice augmentation** = personalized voice output (exists) + standard TTS; no speech-to-text yet. Why: "STT" is three different features — resident speech input, staff dictation, amplified output — and the first is the risky one: core personas don't speak, the residents it would serve (partial/dysarthric speech) are exactly where standard ASR error rates are worst, and misrecognition puts plausible-but-wrong words into the approval card, turning approval into fatigue instead of protection. It also needs the full mic-consent architecture (indicator, one-tap off, on-device processing) to keep the "stays on this tablet" promise. Path in, when wanted: staff dictation first (standard ASR, transcript shown before save) → resident read-back-before-approval → specialized atypical-speech input only with a named resident's needs, on-device processing, and per-resident consent mirroring the camera flow.
4. **Get staff help** = in-app urgent notification to on-duty staff now; telephony later.
5. **Mailbox** = in-app, backed by the existing approval-gated `send_message`.
6. **Story** = removed from resident navigation, content kept and reachable (staff onboarding still links it).

## Sequencing notes

- Phase 0 is independent and immediate. Phases 1 and 3 can run in parallel lanes. Phase 2 blocks nothing visually but should land before any real-resident pilot — it is the privacy foundation.
- Biggest single risk is Phase 2 scope creep; keep it to sessions + scoping + assignments, not a full identity system.
- Every phase keeps the existing test gauntlet green (unit, contract smoke, e2e, a11y audit ≥ current scores).
