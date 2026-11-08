# T4.4 Story Screens — Input/Output Breakdown

**Source:** `docs/BUILD_PLAN.md` § T4.4 (hours 6–10, William/T4)

**Success Criterion:** "A chapter can be built and played back"

---

## Test Structure (7 describe blocks)

### 1. PhotoChoiceGrid Component

#### Test: "renders a question with 2–4 photo options"
```
INPUT:
  Component props:
  {
    question: "What's a favorite memory?",
    options: [
      { label: "bowling", photo_id: "photo_1" },
      { label: "family", photo_id: "photo_2" },
      { label: "park", photo_id: "photo_3" }
    ],
    onChoice: jest.fn()
  }

EXPECTED OUTPUT (DOM):
  ✓ <p>{question}</p> displays: "What's a favorite memory?"
  ✓ 3 <button> elements (one per option)
  ✓ Each button shows label: "bowling", "family", "park"
  ✓ Each button has <img> with Cloudinary photo
  ✓ Buttons are role="button" (accessible)
```

---

#### Test: "shows tap targets ≥64px"
```
INPUT:
  PhotoChoiceGrid rendered with options

EXPECTED OUTPUT (CSS):
  button {
    min-height: 64px;    /* CSS var --tap-min */
    min-width: 64px;
  }
  Computed style ≥64px both dimensions
```

---

#### Test: "calls onChoice(label) when photo is tapped"
```
INPUT:
  User clicks the "bowling" tile
  Mock: onChoice = jest.fn()

EXPECTED OUTPUT:
  ✓ onChoice.mock.calls.length === 1
  ✓ onChoice.mock.calls[0][0] === "bowling"  (the label)
  ✓ No other side effects
```

---

#### Test: "long-press 600ms speaks label, does not select"
```
INPUT:
  User holds pointer down on "bowling" tile for 600ms, releases
  Mock: /speak endpoint

EXPECTED OUTPUT:
  ✓ fireEvent.pointerDown(button)
  ✓ setTimeout 600ms
  ✓ fireEvent.pointerUp(button)
  ✓ POST /speak { resident_id: "marcus", text: "bowling" }
  ✓ Audio plays
  ✓ onChoice() NOT called
  ✓ Tile NOT selected
```

---

#### Test: "displays real photos from Cloudinary"
```
INPUT:
  photo_id: "marcus_photo_bowling_1"

EXPECTED OUTPUT (DOM):
  <img src="https://res.cloudinary.com/inmywords/image/upload/
       c_thumb,g_face,w_400,h_400/marcus_photo_bowling_1.jpg"
       alt="Choice option"
       style="border-radius: 8px; object-fit: cover;" />
  ✓ Cloudinary URL with transformation recipe
  ✓ Face-focused, 400×400px
  ✓ Rounded corners
```

---

### 2. Story Interview Flow (Agent + UI)

#### Test: "T1.4 Story agent calls show_choices() → PhotoChoiceGrid renders"
```
INPUT (from ElevenLabs T1.4 Story agent):
  Agent calls client tool:
  show_choices({
    question: "What's a favorite memory?",
    options: [
      { label: "bowling", photo_id: "..." },
      { label: "family", photo_id: "..." }
    ]
  })

EXPECTED OUTPUT:
  ✓ T4.4 UI receives show_choices call
  ✓ PhotoChoiceGrid renders on screen
  ✓ Interview pauses
  ✓ Resident taps a tile
  ✓ onChoice("bowling") fires
  ✓ Agent receives label via return value
  ✓ Agent continues to next question
```

---

#### Test: "each answer saved via POST /story/answer"
```
INPUT (after resident taps):
  T1.4 agent calls webhook:
  save_answer({
    resident_id: "marcus",
    chapter: "about_me",
    question: "What's a favorite memory?",
    answer: "bowling"
  })

EXPECTED HTTP REQUEST:
  POST /story/answer
  Content-Type: application/json
  {
    "resident_id": "marcus",
    "chapter": "about_me",
    "question": "What's a favorite memory?",
    "answer": "bowling"
  }

EXPECTED HTTP RESPONSE:
  Status: 200
  Body: { "ok": true }

DATABASE STATE CHANGE:
  INSERT INTO story_answers VALUES (
    id: 1001,
    resident_id: "marcus",
    chapter: "about_me",
    question: "What's a favorite memory?",
    answer: "bowling",
    created_at: "2026-01-15T14:23:00Z"
  );
```

---

#### Test: "agent asks 3–5 questions per chapter"
```
INPUT (chapter template from T3.4):
  chapter_key: "about_me"
  questions: [
    "What's a favorite memory?",
    "Who's important to you?",
    "What's a goal for this year?"
  ]

EXPECTED FLOW:
  1. agent → show_choices(Q1) → UI renders
  2. resident taps → onChoice("bowling")
  3. agent → save_answer(Q1, "bowling") → HTTP 200
  4. agent → show_choices(Q2) → UI renders
  5. resident taps → onChoice("sister")
  6. agent → save_answer(Q2, "sister") → HTTP 200
  7. agent → show_choices(Q3) → UI renders
  8. resident taps → onChoice("bowling")
  9. agent → save_answer(Q3, "bowling") → HTTP 200
  10. agent → calls draft_chapter()
```

---

#### Test: "agent reads draft aloud + asks 'Is this right?'"
```
INPUT (after all 3 answers collected):
  T1.4 agent calls:
  draft_chapter()
  
  Which triggers:
  POST /story/draft {
    "resident_id": "marcus",
    "chapter": "about_me"
  }

BACKEND LOGIC:
  1. SELECT * FROM story_answers WHERE resident_id="marcus" AND chapter="about_me"
  2. Collect answers: ["bowling", "sister", "bowling"]
  3. Call T3's Gemini: "Combine these answers into 3–5 sentences, first person"
  4. Return text

EXPECTED HTTP RESPONSE:
  Status: 200
  Body: {
    "text": "My favorite memory is going bowling with my sister. She's really important to me. This year I want to go bowling even more."
  }

THEN (T1.5 narration):
  POST /story/approve { "chapter_id": 42 }
  ↓
  ElevenLabs TTS: generate audio in Marcus's voice (~30 sec)
  ↓
  Agent speaks the draft aloud
  ↓
  UI shows yes/no tiles:
    "Is this right?"
    [YES]  [NO]
```

---

#### Test: "resident taps Yes → chapter approved + narration"
```
INPUT:
  Resident taps "YES" tile (approval)

THEN (automatic):
  Backend calls:
  POST /story/approve { "chapter_id": 42 }

EXPECTED HTTP RESPONSE:
  Status: 200
  Body: {
    "audio_url": "https://cloudinary.com/.../story_about_me_marcus_approved.mp3"
  }

DATABASE STATE CHANGE:
  UPDATE story_chapters
  SET 
    status = "approved",
    audio_url = "https://cloudinary.com/.../story_about_me_marcus_approved.mp3"
  WHERE id = 42;
```

---

### 3. Story Page Display

#### Test: "story page shows chapter photo (full width)"
```
INPUT (from GET /story/marcus):
  chapters[0]: {
    photo_ids: ["marcus_photo_bowling_1"],
    ...
  }

EXPECTED OUTPUT (DOM):
  <img 
    src="https://res.cloudinary.com/inmywords/image/upload/
         c_fill,g_auto,w_600,h_400/marcus_photo_bowling_1.jpg"
    alt="Chapter photo"
    style="width: 100%; max-height: 400px; object-fit: cover;" 
  />
  ✓ Photo displayed at top
  ✓ Full width, centered
  ✓ Cloudinary transformation applied
```

---

#### Test: "shows chapter text (≥22px, high contrast, first-person)"
```
INPUT (from approved story_chapters):
  text: "My favorite memory is going bowling with my sister. She's really important to me. This year I want to bowl more."

EXPECTED OUTPUT (DOM):
  <p style="
    font-size: 24px;
    line-height: 1.6;
    color: #000;
    background: #fff;
    padding: 20px;
  ">
    My favorite memory is going bowling with my sister...
  </p>

ASSERTIONS:
  ✓ Font size ≥22px (accessibility)
  ✓ Contrast: black on white ≥7:1 WCAG AA
  ✓ First-person ("My...", not "Marcus's...")
  ✓ Generous line-height for readability
```

---

#### Test: "has Play button (≥64px tap target)"
```
INPUT (chapter with audio_url):
  audio_url: "https://cloudinary.com/.../story_about_me_marcus_approved.mp3"

EXPECTED OUTPUT (DOM):
  <button 
    aria-label="Play narration"
    style="
      min-height: 64px;
      min-width: 64px;
      font-size: 24px;
    "
    onClick={handlePlay}
  >
    ▶ Play Narration
  </button>

WHEN CLICKED:
  <audio 
    src="https://cloudinary.com/.../story_about_me_marcus_approved.mp3"
    autoPlay={true}
    controls={false}
  />
```

---

#### Test: "audio plays within 2 seconds (cached by T1.2)"
```
INPUT:
  User clicks Play button
  Audio pre-generated + cached by T1.5 (hours 9–10)
  Cache key: (voice_id="marcus_warm", text=chapter_text)

EXPECTED OUTPUT:
  ✓ <audio>.play() called immediately
  ✓ Audio plays within <2 seconds (latency target)
  ✓ Duration: ~30 seconds (seeded chapter)
  ✓ Repeated plays instant (cache hit)
```

---

#### Test: "shows friendly 'listening' state (no time limits)"
```
INPUT:
  Audio is playing

EXPECTED OUTPUT (DOM):
  ✓ Play button changes to pause icon: "⏸ Pause"
  ✓ Spinner or "Playing..." text (visual feedback)
  ✓ NO timer showing (accessibility: no time limits)
  ✓ Tiles remain visible for context
  ✓ User can seek/pause indefinitely
```

---

### 4. Full End-to-End Flow

#### Test: "one chapter completes from start to finish"
```
═══════════════════════════════════════════════════════════════════
STEP 1: Agent interview starts (T1.4)
═══════════════════════════════════════════════════════════════════

T1.4 Story agent calls:
show_choices({
  question: "What's a favorite memory?",
  options: [
    { label: "bowling", photo_id: "..." },
    { label: "family", photo_id: "..." },
    { label: "park", photo_id: "..." }
  ]
})

T4.4 renders:
✓ PhotoChoiceGrid on screen
✓ Question: "What's a favorite memory?"
✓ 3 photo tiles with labels

═══════════════════════════════════════════════════════════════════
STEP 2: Resident taps option
═══════════════════════════════════════════════════════════════════

Resident clicks "bowling" tile

T4.4 response:
✓ Tile shows selected state (highlight)
✓ onChoice("bowling") callback fires
✓ Agent receives "bowling" as return value

═══════════════════════════════════════════════════════════════════
STEP 3: Agent saves answer (webhook)
═══════════════════════════════════════════════════════════════════

T1.4 agent calls:
POST /story/answer {
  resident_id: "marcus",
  chapter: "about_me",
  question: "What's a favorite memory?",
  answer: "bowling"
}

Backend response:
✓ Status 200
✓ story_answers table: new row inserted

═══════════════════════════════════════════════════════════════════
STEP 4: Agent asks questions 2–5 (repeat steps 1–3)
═══════════════════════════════════════════════════════════════════

Questions:
1. "What's a favorite memory?" → answer: "bowling"
2. "Who's important to you?" → answer: "my sister"
3. "What's a goal for this year?" → answer: "bowling more"

All saved to story_answers

═══════════════════════════════════════════════════════════════════
STEP 5: Agent calls draft_chapter()
═══════════════════════════════════════════════════════════════════

T1.4 agent triggers:
POST /story/draft {
  resident_id: "marcus",
  chapter: "about_me"
}

T3.5 backend:
1. Fetch all story_answers for marcus + "about_me"
2. Call Gemini: "Combine into 3–5 sentences, first person"
3. Return text

Response:
{
  "text": "My favorite memory is going bowling with my sister. She's really important to me. This year I want to go bowling more often."
}

═══════════════════════════════════════════════════════════════════
STEP 6: T1.5 generates narration (TTS)
═══════════════════════════════════════════════════════════════════

Agent speaks draft aloud:
"My favorite memory is going bowling with my sister..."

Then calls:
POST /story/approve { "chapter_id": 42 }

ElevenLabs TTS:
✓ Generate audio in Marcus's voice (~30 seconds)
✓ Cache by (voice_id, text)
✓ Return audio_url

Response:
{
  "audio_url": "https://cloudinary.com/.../story_about_me_marcus_approved.mp3"
}

Database:
✓ story_chapters.id = 42
✓ status: "draft" → "approved"
✓ audio_url: "https://..."

═══════════════════════════════════════════════════════════════════
STEP 7: Story page displays
═══════════════════════════════════════════════════════════════════

Frontend calls:
GET /story/marcus

Response:
{
  chapters: [{
    id: 42,
    chapter_key: "about_me",
    text: "My favorite memory is...",
    photo_ids: ["marcus_photo_bowling_1"],
    audio_url: "https://cloudinary.com/.../story_about_me_marcus_approved.mp3",
    status: "approved"
  }]
}

T4.4 renders:
┌─────────────────────────────────────┐
│ [bowling photo]                     │
│                                     │
│ "My favorite memory is going        │
│  bowling with my sister. She's      │
│  really important to me. This       │
│  year I want to bowl more."         │
│                                     │
│       [▶ Play Narration]            │
│                                     │
│  ◆ Back  ◆ Next Chapter            │
└─────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════
STEP 8: Resident taps Play
═══════════════════════════════════════════════════════════════════

Resident clicks [▶ Play Narration] button

T4.4 triggers:
✓ <audio src={audio_url} autoPlay={true} />
✓ Audio starts playing
✓ Button changes to [⏸ Pause]
✓ "Playing..." indicator shows

Audio plays for ~30 seconds in Marcus's voice:
"My favorite memory is going bowling with my sister..."

═══════════════════════════════════════════════════════════════════
✅ MILESTONE 2 SUCCESS
═══════════════════════════════════════════════════════════════════

The full flow completes end-to-end:
  ✓ Interview conducted by agent
  ✓ Answers saved to DB
  ✓ Draft generated from answers
  ✓ Narration generated in resident's voice
  ✓ Story page displays chapter
  ✓ Audio plays when resident taps Play
```

---

### 5. Accessibility

| Requirement | Test | Assertion |
|---|---|---|
| Tap ≥64px | PhotoChoiceGrid options | min-height/width ≥64px |
| Text ≥22px | Chapter text, buttons | font-size ≥22px |
| High contrast | Story page | Color contrast ≥7:1 WCAG AA |
| No time limits | Interview + audio | No countdown, indefinite pause/play |
| Long-press speak | Any button | 600ms hold → `/speak` |
| Undo | Interview answers | Can retract or restart |
| Consistent layout | All chapters | Photo → text → play button order |
| Real photos | PhotoChoiceGrid | Cloudinary tiles, not icons |

---

## Dependencies & Timing

| Component | Owner | Due | Blocks T4.4 |
|---|---|---|---|
| PhotoChoiceGrid component | T3 (T3.4) | Hour 7 | Yes |
| 7 chapter templates + questions | T3 (T3.4) | Hour 7 | Yes |
| POST /story/draft endpoint | T3 (T3.5) | Hour 9 | Yes |
| Story agent (show_choices, save_answer) | T1 (T1.4) | Hour 9 | Yes |
| Narration + caching (POST /story/approve) | T1 (T1.5) | Hour 10 | Yes |
| Real /story routes | T2 (T2.4) | Hour 9 | Yes |

---

## Files

- **Tests:** `/web/test/t4-4.test.ts`
- **Run:** `npm test -- --testPathPattern=t4-4`
- **Expected:** All fail RED until implementation complete

