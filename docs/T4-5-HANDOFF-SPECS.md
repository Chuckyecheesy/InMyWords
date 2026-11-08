# T4.5 Test Specifications: Handoff Screen + Observation Form

**Source:** `docs/BUILD_PLAN.md` § T4.5 (hours 10–12, William/T4)

**Owner:** Staff experience lead

**Success Criteria:**
- ✅ Jordan's handoff renders T2's data
- ✅ Observations save successfully
- ✅ Milestone 2 display ready (hour 12)

---

## API Contracts

### `GET /handoff?staff_id={id}&resident_id={id}`

**Input:**
```
staff_id: "jordan"
resident_id: "marcus"
```

**Expected Output:**
```json
{
  "items": [
    {
      "type": "checklist",
      "date": "2026-11-06",
      "text": "Grocery shopping didn't happen. The bus was cancelled."
    },
    {
      "type": "observation",
      "date": "2026-11-05",
      "text": "Marcus asked to sit somewhere quiet after lunch."
    },
    {
      "type": "choice",
      "date": "2026-11-07T16:00:00Z",
      "text": "Marcus chose bowling over movie"
    },
    {
      "type": "emh",
      "date": "2026-11-04",
      "text": "EMH report: Marcus attended community center event"
    }
  ]
}
```

**Item types:**
- `emh`: EMH system notes
- `checklist`: Task/checklist misses with reasons
- `observation`: Staff observations
- `choice`: Resident choices made
- `task`: Staff tasks created
- `memory`: New memories confirmed

---

### `POST /observations`

**Input:**
```json
{
  "resident_id": "marcus",
  "staff_id": "jordan",
  "note": "Marcus was calm during lunch today"
}
```

**Expected Output:**
```json
{
  "ok": true
}
```

**HTTP Status:** 200

**Database:**
```sql
INSERT INTO observations (resident_id, staff_id, note, created_at)
VALUES ('marcus', 'jordan', 'Marcus was calm during lunch today', NOW());
```

---

## Test Suite Breakdown

### Suite 1: Handoff List Component (8 tests)

#### Test: "renders 'Since your last shift' header"
```
INPUT:
  Page load: /staff/handoff?resident=marcus&staff_id=jordan

EXPECTED OUTPUT (DOM):
  <header class="handoff-header">
    <h1>Handoff: Marcus</h1>
    <p class="eyebrow">Since your last shift</p>
    <span class="item-count">4 items</span>
  </header>

ASSERTIONS:
  ✓ Resident name in heading
  ✓ "Since your last shift" text
  ✓ Item count displayed
```

#### Test: "displays handoff items as list with type badges"
```
INPUT:
  handoffItems from GET /handoff response

EXPECTED OUTPUT (DOM):
  <div class="handoff-list">
    <article class="handoff-item" data-type="checklist">
      <span class="type-badge">📋 Checklist</span>
      <p class="item-text">Grocery shopping didn't happen...</p>
      <time>Nov 6</time>
    </article>
    <article class="handoff-item" data-type="observation">
      <span class="type-badge">👁️ Observation</span>
      <p class="item-text">Marcus asked to sit somewhere quiet...</p>
      <time>Nov 5</time>
    </article>
  </div>

ASSERTIONS:
  ✓ All items rendered
  ✓ Type badge for each
  ✓ Text displayed
  ✓ Dates shown
```

#### Test: "colors each item by type"
```
INPUT:
  6 items with different types

EXPECTED OUTPUT:
  .handoff-item[data-type="emh"] → CSS: background: blue-light
  .handoff-item[data-type="checklist"] → CSS: background: orange-light
  .handoff-item[data-type="observation"] → CSS: background: green-light
  .handoff-item[data-type="choice"] → CSS: background: purple-light
  .handoff-item[data-type="task"] → CSS: background: red-light
  .handoff-item[data-type="memory"] → CSS: background: teal-light

ASSERTIONS:
  ✓ Each type has distinct color
  ✓ Colors accessible (7:1 contrast)
```

#### Test: "shows dates in readable format"
```
INPUT:
  ISO date: "2026-11-06T14:10:00Z"

EXPECTED OUTPUT:
  <time datetime="2026-11-06T14:10:00Z">Nov 6, 2:10 PM</time>

OR (alternate):
  <time datetime="2026-11-06T14:10:00Z">Nov 6</time>

ASSERTIONS:
  ✓ Readable format (not raw ISO)
  ✓ ISO preserved in datetime attribute
  ✓ Timezone handled correctly
```

#### Test: "groups items by date (most recent first)"
```
INPUT:
  Items unsorted:
    - Nov 4 (oldest)
    - Nov 6 (newest)
    - Nov 5 (middle)

EXPECTED OUTPUT (rendered order):
  1. Nov 6 item
  2. Nov 5 item
  3. Nov 4 item

ASSERTIONS:
  ✓ Newest first
  ✓ Reverse chronological order
```

#### Test: "handles empty handoff gracefully"
```
INPUT:
  handoffItems: []

EXPECTED OUTPUT:
  <div class="handoff-empty">
    <p class="empty-message">
      ✨ No changes since your last shift. Great work!
    </p>
  </div>

ASSERTIONS:
  ✓ Friendly message
  ✓ No blank space
  ✓ No errors
```

#### Test: "shows item count"
```
INPUT:
  4 items in list

EXPECTED OUTPUT:
  <span class="item-count">4 items since your last shift</span>

ASSERTIONS:
  ✓ Accurate count
  ✓ Plural handling:
    - 1 item since your last shift
    - 2 items since your last shift
    - 0 items (or custom empty message)
```

#### Test: "optional: links/expandable details for items"
```
INPUT:
  Handoff item (type: observation)

EXPECTED OUTPUT (MVP):
  Static text display (no interaction needed)

EXPECTED OUTPUT (Stretch):
  <article class="handoff-item" role="button" tabindex="0">
    → could open modal with full details
    → or link to related Coach question

ASSERTIONS:
  ✓ MVP: static list is sufficient
  ✓ Stretch: interactions welcome but not required
```

---

### Suite 2: Add Observation Form (10 tests)

#### Test: "renders form with textarea and submit button"
```
INPUT:
  Component mounts

EXPECTED OUTPUT (DOM):
  <form class="observation-form">
    <fieldset>
      <legend>Add an observation</legend>
      <label for="obs-text">What did you notice?</label>
      <textarea
        id="obs-text"
        name="observation"
        placeholder="E.g., 'Marcus seemed happy during bowling' or 'Skipped lunch'"
        minlength="1"
        maxlength="500"
      />
      <span class="char-count">0 / 500</span>
      <button type="submit" disabled>Save observation</button>
    </fieldset>
  </form>

ASSERTIONS:
  ✓ Textarea present
  ✓ Helpful placeholder
  ✓ Submit button (initially disabled)
  ✓ Label accessible
```

#### Test: "validates non-empty observation"
```
INPUT:
  User clicks Submit with empty textarea

EXPECTED OUTPUT:
  - Button remains disabled
  OR
  - Error message: "Please enter an observation"
  - No API call made

ASSERTIONS:
  ✓ Empty submission blocked
  ✓ User feedback shown
  ✓ No API call
```

#### Test: "limits text to 500 characters"
```
INPUT:
  User types 501 characters

EXPECTED OUTPUT:
  - HTML5 maxlength enforced
  - 501st character not entered

ASSERTIONS:
  ✓ Input clamped to 500
  ✓ Browser enforces maxlength
```

#### Test: "shows character counter"
```
INPUT:
  User types: "Marcus was calm" (15 chars)

EXPECTED OUTPUT:
  <span class="char-count">15 / 500</span>

ASSERTIONS:
  ✓ Counter updates on each keystroke
  ✓ Format: N / 500
  ✓ Accurate count
```

#### Test: "disables submit until text entered"
```
INPUT (State 1):
  Textarea empty

EXPECTED OUTPUT:
  <button type="submit" disabled>Save observation</button>

INPUT (State 2):
  User types: "a"

EXPECTED OUTPUT:
  <button type="submit">Save observation</button>

ASSERTIONS:
  ✓ Initially disabled
  ✓ Enabled after min 1 char entered
  ✓ Re-disables if text cleared
```

#### Test: "sends POST /observations on submit"
```
INPUT:
  User submits form with:
    resident_id: "marcus"
    staff_id: "jordan"
    note: "Marcus was calm during lunch"

EXPECTED HTTP REQUEST:
  POST /observations
  Content-Type: application/json
  {
    "resident_id": "marcus",
    "staff_id": "jordan",
    "note": "Marcus was calm during lunch"
  }

EXPECTED HTTP RESPONSE:
  Status 200
  { "ok": true }

ASSERTIONS:
  ✓ Correct endpoint
  ✓ Correct HTTP method (POST)
  ✓ Correct schema
  ✓ Successful response
```

#### Test: "shows success message after save"
```
INPUT:
  HTTP 200 response received

EXPECTED OUTPUT (DOM):
  <div class="success-message" role="status">
    ✓ Observation saved.
  </div>
  (appears for 2–3 seconds)

ASSERTIONS:
  ✓ Success feedback shown
  ✓ Message clear and brief
  ✓ Auto-dismisses
```

#### Test: "clears textarea after successful save"
```
INPUT:
  Form submitted successfully

EXPECTED OUTPUT:
  <textarea>""</textarea>
  (empty, ready for next observation)

ASSERTIONS:
  ✓ Field reset for next entry
  ✓ Character counter resets to "0 / 500"
```

#### Test: "shows error message on HTTP failure"
```
INPUT:
  HTTP 500 error

EXPECTED OUTPUT (DOM):
  <div class="error-message" role="alert">
    Failed to save observation. Please try again.
  </div>

ASSERTIONS:
  ✓ Error shown
  ✓ Textarea NOT cleared (preserve user input)
  ✓ Submit button re-enabled
  ✓ User can retry
```

#### Test: "records staff_id and resident_id"
```
INPUT:
  Observation submitted

DATABASE:
  INSERT INTO observations
  (resident_id, staff_id, note, created_at)
  VALUES ('marcus', 'jordan', 'text', NOW())

ASSERTIONS:
  ✓ Both IDs stored
  ✓ Timestamp added by backend
  ✓ No ambiguity about who observed
```

---

### Suite 3: Page Layout (4 tests)

#### Test: "renders handoff list and form on same page"
```
INPUT:
  Page load

EXPECTED OUTPUT:
  <main>
    <section class="handoff-section">
      <h2>Since your last shift</h2>
      <div class="handoff-list">{items}</div>
    </section>
    <section class="observation-section">
      <h2>Add an observation</h2>
      <form>{form}</form>
    </section>
  </main>

ASSERTIONS:
  ✓ Both sections present
  ✓ Logical order (handoff first, form second)
```

#### Test: "resident selector available"
```
INPUT:
  Page shows: "Viewing: [Marcus ▼]"

EXPECTED OUTPUT:
  <select name="resident_id">
    <option value="marcus">Marcus</option>
    <option value="dana">Dana</option>
  </select>

On change:
  Navigate to /staff/handoff?resident=dana&staff_id={current}

ASSERTIONS:
  ✓ Dropdown lists all residents
  ✓ Selection changes URL
  ✓ Data reloads for new resident
```

#### Test: "shows current staff context"
```
INPUT:
  Logged in as jordan

EXPECTED OUTPUT:
  <p>You: Jordan | Marcus</p>

ASSERTIONS:
  ✓ Staff aware of their identity
  ✓ Confirms observations attributed correctly
```

#### Test: "responsive on mobile (720px breakpoint)"
```
INPUT:
  Viewport: 375px wide (mobile)

EXPECTED OUTPUT:
  - Items stack vertically
  - Form spans full width
  - Text readable (≥18px)
  - Tap targets ≥64px
  - No horizontal scroll

ASSERTIONS:
  ✓ Mobile-friendly layout
```

---

### Suite 4: Integration (3 tests)

#### Test: "fetches handoff from T2's GET /handoff"
```
INPUT:
  Page mounts

EXPECTED HTTP REQUEST:
  GET /handoff?staff_id=jordan&resident_id=marcus

EXPECTED OUTPUT:
  Items display

ASSERTIONS:
  ✓ API called on mount
  ✓ Data rendered
```

#### Test: "renders Jordan's handoff data (Milestone 2)"
```
INPUT:
  Jordan's shift handoff for Marcus

EXPECTED OUTPUT:
  Seeded items display:
  - "Grocery shopping didn't happen..."
  - "Marcus asked to sit somewhere quiet..."

ASSERTIONS:
  ✓ T2's data flows through
  ✓ Milestone 2 requirement met
```

#### Test: "handles missing staff_id/resident_id"
```
INPUT:
  /staff/handoff (no query params)

EXPECTED OUTPUT:
  Error or redirect:
  "Please select a resident"

ASSERTIONS:
  ✓ No crashes
  ✓ Helpful guidance
```

---

### Suite 5: Milestone 2 Success (3 tests)

#### Test: "Jordan's handoff renders T2's data"
```
SCENARIO:
  - New staff member Jordan
  - First shift for Marcus
  - Seeded handoff items from T2.2

EXPECTED:
  - Handoff items display
  - Types shown (checklist, observation)
  - Dates formatted
  - Count accurate

ASSERTION:
  ✓ Milestone 2 handoff requirement met
```

#### Test: "observations save via T2's /observations"
```
SCENARIO:
  - Jordan adds: "Marcus was happy today"
  - Clicks Save

EXPECTED:
  - POST /observations succeeds
  - Success message shown
  - Textarea cleared
  - Observation appears in next handoff fetch

ASSERTION:
  ✓ Milestone 2 observation requirement met
```

#### Test: "full end-to-end flow (Handoff + Observation)"
```
SCENARIO (Complete T4.5 flow):
  1. Open /staff/handoff?resident=marcus
  2. Load handoff items (T2 data)
  3. Read: "Bus cancelled (grocery didn't happen)"
  4. Read: "Marcus asked for quiet space"
  5. Type observation: "Marcus was calm all day"
  6. Click Save
  7. See: "Observation saved"
  8. Textarea clears
  9. (Optional) Refresh handoff, see new observation

ASSERTIONS:
  ✓ Handoff displays past items
  ✓ Observation form accepts input
  ✓ Data saves
  ✓ No errors
  ✓ Milestone 2 complete
```

---

### Suite 6: Accessibility (7 tests)

- Form inputs have labels
- Error/success messages have `role="alert"` or `role="status"`
- Buttons have clear text (not just icons)
- Heading hierarchy (h1 → h2, not h1 → h3)
- Touch targets ≥64px
- Text ≥18px
- Color contrast ≥7:1
- No time limits

---

## Data Model

### HandoffItem (from T2)
```typescript
type HandoffItem = {
  type: "emh" | "checklist" | "observation" | "choice" | "task" | "memory";
  date: string; // ISO 8601
  text: string;
  source?: SourceType;
};
```

### Observation (from T4)
```typescript
type Observation = {
  resident_id: string;
  staff_id: string;
  note: string;
  created_at: string; // ISO 8601, server-side
};
```

---

## Files to Create

| File | Lines | Purpose |
|------|-------|---------|
| `/web/app/staff/handoff/page.tsx` | ~120 | Handoff page (server) |
| `/web/components/HandoffList.tsx` | ~80 | Handoff items display |
| `/web/components/ObservationForm.tsx` | ~100 | Form + submit logic |
| `/web/app/globals.css` | +100 | Handoff + form styles |
| `/web/test/t4-5.test.ts` | 659+ | RED tests |

---

## Files to Enhance

| File | Changes | Purpose |
|------|---------|---------|
| `/web/lib/api.ts` | Add `getHandoff()`, `addObservation()` | API calls |
| `/web/lib/mock.ts` | Already has handoff + activity data | No change needed |

---

## Latency Targets

| Step | Target | Notes |
|------|--------|-------|
| Page load (handoff list) | <2s | Fetch from T2 |
| Observation submit | <1s | POST /observations |
| Success/error feedback | Instant | DOM update only |

---

## Milestone 2 Checklist

✅ Handoff screen displays T2's data
✅ Observation form works end-to-end
✅ Staff can see what changed since last shift
✅ Staff can add new observations
✅ Data saves to backend
✅ No errors or crashes
✅ Accessibility met
✅ Mobile responsive

