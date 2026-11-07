# In My Words — Project Plan & Work Split

CommuniHacks 2026 | KW Habilitation: Communication Profile App (Problem 11)

> Pitch line: **Your story, told once, in your own voice. Your choices, made by you.**

*(Markdown version of `In_My_Words_Project_Plan.docx` — the docx is the original; keep both in sync if either changes.)*

## 1. Overview

### Problem
- Some residents in Inclusive Living homes do not communicate verbally.
- New staff learn about residents from a paper binder that may be years out of date.
- Residents' routines, preferences and plans get described by someone else, or not at all.
- Input cannot depend on spelling or typing.

### What we learned from KW Habilitation
- No AAC tools in use today. They like AAC as the foundation.
- No substitute decision-makers. Residents are adults who make their own decisions.
- Staff can see all info. No privacy hiding needed.
- Supported decision-making: if a resident cannot decide yet, keep supporting them until they can. Staff should not take decisions away.
- AI is welcome for AAC, including full-sentence suggestions the resident approves or rejects.
- Onboarding is the big pain: binder reading plus 2+ weeks of shadowing.
- Stories matter. Residents should not have to retell their background.
- EMH is the current system: contact notes, significant events, home checklist (happened / didn't happen / why).
- Varied independence. Some residents budget and shop in the community.
- A manager oversees 3 to 6 homes.

### Goals
- A resident who cannot type can communicate a full thought in under 30 seconds.
- New staff learn a resident's essentials in 2 minutes and full story in 10.
- Every fact shows who said it: the resident or staff.
- Every choice is the resident's, or "not decided yet". Never "staff decided".

### Users
- **Resident**: builds profile and story, communicates, makes choices.
- **Staff**: onboards, starts shifts, learns about residents, adds observations.
- **Manager**: oversees quality of support across homes.

### Demo personas (fictional)
- **Marcus, 34**: single words and gestures. Loves the Raptors, Saturday bowling, double-double from Tim Hortons. Loud rooms upset him. Wants to see a live basketball game.
- **Dana, 52**: more independent, manages a weekly budget with support. Uses picture tiles. Loves gardening; sister visits Sundays. Wants a balcony herb garden.

## 2. Features

### Core (never cut)

**Speak For Me (AAC)**
- Tap photo tiles to build a fragment ("coffee" + "now").
- AI suggests 2–3 sentences based on the profile ("Can I get a double-double from Tim's?").
- Resident approves or rejects. Nothing is spoken without approval.
- Original tiles stay visible. "Speak tiles only" works without AI.
- Spoken in a voice the resident chose from 3 previews.

**My Story**
- Picture-based interview, one question at a time, 2–4 photo choices per question.
- Chapters: About me, Where I'm from, People who matter, Things I love, What upsets me and what helps, My day, What I want next.
- Each chapter read back for approval, then becomes a page with photos and narration in the resident's voice.

**Onboarding Coach**
- Guided path: Essentials (2 min), Story (10 min), Routines timeline, Check understanding (stretch).
- Staff ask questions by voice or text. Every answer has a source label: "In Marcus's words", "Staff observation, date", "From EMH", or "From records, 2019" (imported binder facts).
- Says "I don't know, ask Marcus" when unsure.

**Memory Layer (keeps the profile current)**
- **Base layer**: existing binder and record documents are imported once (Gemini document understanding). Facts arrive labelled "From records" with the document's date — never shown as the resident's words, and first in line for "Is this still true?" confirmation.
- Learns from every interaction: spoken sentences, choices, staff notes, EMH entries.
- Three kinds of memory: **preferences** ("likes a double-double"), **events** ("went bowling Nov 8, asked to go again"), **routines** ("coffee around 7:30, asks to go out most Tuesdays").
- Anything the system figures out is labelled "pattern noticed", never shown as fact.
- The resident confirms it ("Yes, I like tea now"), then it becomes "in Marcus's words".
- Makes every other feature smarter: tiles ordered by habit, Coach answers stay current, Handoff mentions changes, Actions know usual details.

### Should ship
- **Shift Handoff**: "since your last shift" summary from EMH notes, checklist, observations and choices.
- **Supported Choice**: options as photos with simple consequences (cost, money left this week). Logged as resident's choice or "not decided yet".
- **Staff Observations**: stored separately from the resident's words, never overwrite them.
- **Actions (agents do things for residents)**:
  - If something can be done online, an agent does it. If it needs a person physically there, the agent creates a staff task instead.
  - Example: Marcus picks bowling. One approval card books the lane, adds it to his calendar and texts his sister. A staff task "drive Marcus Saturday 1:30" is created automatically.
  - First actions (cap at 2 or 3): message a family member, add to calendar, book an activity (mock site). Optional: next bus from Grand River Transit open data.
  - Guardrails: picture approval card for every action, allowlist of actions, spending limits with cost shown, never sends money to people or shares personal info, activity log visible to staff, short cancel window.

### Stretch
- Manager view across homes (profile freshness, checklist patterns, choice stats).
- Scenario questions in the Coach.
- "Is this still true?" re-asking for entries older than 90 days.
- Camera mode: hold up an object to start a fragment.
- Gemini Computer Use: agent visibly operates a real website (recorded clip, not live).
- Extra actions beyond the first 2 or 3.
- Same MCP server shown working in Claude Desktop.

## 3. Architecture

### Components
- **Frontend**: Next.js, React, TypeScript, tablet first.
- **Backend API + MCP servers**: Python.
- **AI**: Gemini for all agents.
- **Voice**: ElevenLabs Voice Design, text to speech, Agents.
- **Database**: Tiger Data (Postgres with search).
- **Media**: Cloudinary.
- **MCP servers (4)**: resident-profile, memory, actions, emh (mock).
- **Rule: agents reach data only through the MCP servers.**

### Agents

| Agent | Job | Guardrails |
|---|---|---|
| Voice | Tiles to sentence suggestions | Short, faithful, never spoken without approval |
| Story | Picture interview, writes chapters | First person, approved chapter by chapter |
| Coach | Answers staff questions, runs onboarding path | Always labels source, admits when unsure |
| Handoff | Since-last-shift summary | Facts only, no guessing causes |
| Choice | Options with consequences | No recommendations, no "staff decided" |
| Action | Plans online actions vs. staff tasks, runs approved actions | Approval card first, allowlist only, spending limits |
| Memory: Observer | Pulls possible memories from every interaction | Labels everything "pattern noticed" until confirmed |
| Memory: Consolidator | Merges duplicates, counts sightings, notices changes | Flags changes for resident confirmation, never overwrites resident's words |
| Memory: Routine finder | Spots time-based patterns from timestamps | Suggests routines, does not add them unconfirmed |
| Memory: Retriever | Gives the right memories to other agents | Returns source and confirmation status with every memory |
| Manager (stretch) | Summary across homes | Patterns, not blame |

### MCP server: resident-profile

| Tool | Input | Output |
|---|---|---|
| get_profile | resident | Routines, likes, dislikes, goals, communication style |
| get_story | resident | Chapters with photos, text, narration audio |
| save_story_chapter | resident, chapter, text, photos | Saved draft chapter |
| ask_about | resident, question | Answer + source label + date |
| suggest_sentence | resident, tiles, time of day | 2–3 sentence options |
| log_sentence | resident, sentence, approved | Saved to history |
| log_choice | resident, options, chosen or not_yet_decided | Saved choice |
| add_observation | resident, staff, note | Saved as staff observation |

### MCP server: memory

| Tool | Input | Output |
|---|---|---|
| remember | resident, event, source | Candidate memory saved |
| recall | resident, query, type (preference \| event \| routine) | Matching memories with source and confirmation status |
| get_routines | resident | Confirmed and suggested routines with times |
| propose_update | resident, memory, reason | Item added to resident's "confirm?" queue |
| confirm_memory | resident, memory, yes/no | Becomes "in resident's words" or is dismissed |

**Confirmed memories are the profile.** The resident-profile server reads from the memory store.

### MCP server: actions

| Tool | Input | Output |
|---|---|---|
| plan_actions | resident, goal | Online steps + staff tasks + total cost |
| send_message | resident, contact, text | Message sent (real email or SMS) |
| add_to_calendar | resident, event, time | Calendar entry |
| book_activity | resident, activity, time | Booking confirmation (mock site) |
| next_bus | from, to | Next departures (Grand River Transit data, optional) |
| create_staff_task | resident, task, time | Task in staff Handoff |

Every action tool only runs after the resident approves the plan. Swap mock services for real ones later, same as EMH.

### MCP server: emh (mock)

| Tool | Input | Output |
|---|---|---|
| get_contact_notes | resident, since | Notes with dates and authors |
| get_checklist | home, date | Items: happened / didn't happen / why |
| get_significant_events | resident | Events with dates |

Pitch point: swap the mock EMH server for a real EMH connection and no agent code changes.

### Data model (Tiger Data)

| Entity | Key fields |
|---|---|
| homes | name, manager |
| residents | name, home, voice_id, communication style |
| profile_items | resident, section, content, source (resident \| staff), confirmed_at (built from confirmed memories) |
| story_chapters | resident, chapter, text, photo_ids, audio_url, approved |
| tiles | resident, label, category, photo_id, times_used |
| sentences | resident, tiles, sentence, approved, created_at |
| choices | resident, options, chosen, status, created_at |
| staff | name, role (staff \| manager), homes |
| observations | resident, staff, note, created_at |
| memories | resident, type, content, embedding, source, times_seen, first_seen, last_seen, confirmed (yes \| no \| pending) |
| action_plans | resident, goal, steps, cost, approved, status, created_at |
| staff_tasks | resident, task, due, status |
| emh_notes, emh_checklist | mock, timestamped entries |

## 4. Team roles

| Person | Role | Owns |
|---|---|---|
| James (T1) | Voice lead | ElevenLabs voices, narration, Story interview agent, Coach voice mode, spoken approval cards and memory confirmations, all demo audio |
| Tiffany (T2) | Data and MCP lead | Tiger Data, seed data, all four MCP servers (incl. memory store and mock action services), backend API, Handoff agent |
| Ahmed (T3) | Resident experience & pitch lead (AI + screens) | Gemini wrapper; Voice agent + Speak For Me screen; Story chapter writer, interview questions, story screens + PhotoChoiceGrid; Choice agent + choice screen; approval card, "confirm?" screen, voice picker; accessibility; deck, demo video, Devpost, domain |
| William (T4) | Staff experience lead (AI + screens) | App shell, design system, Cloudinary pipeline; Coach agent + Coach chat + onboarding path; memory subagents + binder importer; Action agent; Handoff screen, observations, activity log; judge AI-safety answers |

## 5. Work split by person

### James (T1): Voice lead

**Owns**: everything the user hears. ElevenLabs account, credits, voices, agents. Story interview experience end to end (with Ahmed (T3) on chapter text). Demo audio quality and backup audio.

**Deliverables**
- 3 voice options each for Marcus and Dana (Voice Design).
- Text-to-speech service: sentence in, audio out, with caching.
- Story interview agent (ElevenLabs Agent) with tools to show photo choices and save answers.
- Chapter readback and narration of approved chapters.
- Coach voice mode: staff ask out loud, hear the answer.
- Spoken approval cards for actions ("Book bowling Saturday at 2pm, $15. Text Lisa.").
- Spoken memory confirmations ("Do you like tea now?").
- Pre-generated audio for every demo line.

| Hours | Tasks |
|---|---|
| 0–1 | Set up ElevenLabs, claim participant credits. Generate 3 voices each for Marcus and Dana. Agree interface contracts. |
| 1–6 | Build TTS service with caching. Wire to T3's suggestions so approved sentences are spoken. **Milestone 1.** |
| 6–12 | Story interview agent: prompt, chapter template, photo-choice tool, save tool. Chapter readback. Narrate approved chapters. **Milestone 2.** |
| 12–16 | Coach voice mode. Voice readout for Shift Handoff. Spoken approval cards and memory confirmations. |
| 16–18 | Latency pass. Cache common phrases and story audio. Voice picker screen audio. |
| 18–20 | Help with stretch if stable, otherwise bug fixes. |
| 20–24 | Pre-generate all demo audio. Lead demo rehearsals. Record voice-over for backup video. Present the demo. |

**Needs from others**: T2 — save_story_chapter, ask_about, get_profile working (or mocked) by hour 6. T3 — suggestion output format by hour 2; chapter questions by hour 7; PhotoChoiceGrid by hour 7; voice picker screen. T4 — Coach answer format by hour 8; Coach chat embed.

**Hands off**: audio URLs (to T4 for playback); voice IDs per resident (to T2 for the residents table).

**Done when**: a resident can pick a voice, approve a sentence and hear it in under 5 seconds. One full chapter can be interviewed, approved and narrated. Staff can ask the Coach a question out loud and hear a sourced answer. Every approval card and memory confirmation is spoken.

### Tiffany (T2): Data and MCP lead

**Owns**: Tiger Data database and schema. Seed data for both residents, homes, staff and 2 weeks of EMH mock data. All four MCP servers. Memory store (vectors + timestamps). Mock action services. Backend API. Handoff agent.

**Deliverables**
- Database schema (§3). Seed data: Marcus and Dana profiles, tiles, 2 draft story chapters, 2 weeks of contact notes, checklist entries with reasons, 3 staff, 2 homes.
- resident-profile MCP server (8 tools). emh mock MCP server (3 tools). memory MCP server (5 tools) with vector search. actions MCP server (6 tools) with a mock booking site and real message sending.
- Seeded memory history: 2 weeks of events so patterns exist (e.g. Marcus switching to tea).
- Backend API exposing MCP tools to the frontend and ElevenLabs agents. Handoff agent.
- Stretch: Claude Desktop connection demo; manager view data.

| Hours | Tasks |
|---|---|
| 0–1 | Create Tiger Data service. Write schema. Agree contracts. Publish mock responses so others are not blocked. |
| 1–6 | Seed data. Build get_profile, get_story, suggest_sentence (calls T3's prompt), log_sentence. Milestone 1 support. |
| 6–12 | ask_about with source labels, save_story_chapter, add_observation. emh mock server. Milestone 2 support. |
| 12–16 | log_choice. Memory server + seeded memory history. Actions server with mock booking and message sending. Handoff agent. |
| 16–18 | Feature freeze. Test every tool. Fix data issues. Deploy backend. |
| 18–20 | Stretch: Claude Desktop demo, manager view queries. |
| 20–24 | Reset seed data to a clean demo state. Write README setup and architecture diagram. |

**Needs from others**: T3 — suggest_sentence prompt by hour 4; embedding function by hour 10. T4 — Coach wording for ask_about by hour 8; binder extraction prompt by hour 2; memory and Action agent functions by hours 12–17; Cloudinary photo IDs by hour 3. T1 — voice IDs.

**Hands off**: working API endpoints and mock responses (to everyone, hour 1). Seed data the demo depends on.

**Done when**: every MCP tool returns correct data for Marcus and Dana. Every Coach answer includes a source label. Handoff summary matches the seeded EMH data. recall returns relevant memories with source and confirmation status. Approved actions run; staff tasks appear in Handoff. One command resets the demo data.

### Ahmed (T3): Resident experience & pitch lead (AI + screens)

**Owns**: everything the resident directly uses — both the prompts and the screens. Speak For Me, My Story, Supported Choice, approvals and confirmations. Accessibility lead. Shared Gemini wrapper. The pitch: deck, demo video, Devpost, domain.

**Deliverables**
- Gemini wrapper: structured JSON output + embeddings (used by T4 and T2 too).
- Voice agent: profile-based sentence suggestions (2–3 short options), tested on 15 tile combinations.
- Speak For Me screen: tile grid, sentence strip, suggestions with approve/reject, audio playback.
- Story: 7 chapter templates + 3–5 picture-answerable questions each, chapter writer, story pages, PhotoChoiceGrid the Story agent triggers.
- Choice agent (consequences, never recommends) + choice screen.
- Action approval card, "pattern noticed, confirm?" screen, voice picker.
- Accessibility pass on all resident screens (§9).
- Pitch deck (5–6 slides), backup demo video, Devpost write-up, GoDaddy domain.

| Hours | Tasks |
|---|---|
| 0–1 | Set up Gemini, build the wrapper. Agree output formats and contracts. |
| 1–5 | Voice agent prompt and logic. Test with 15 tile combinations for both residents. |
| 4–6 | Speak For Me screen on T4's design system. **Milestone 1.** |
| 6–7 | PhotoChoiceGrid (to T1) + chapter questions (with T1). |
| 7–9 | Story chapter writer (`/story/draft` by hour 9). Story pages. |
| 9–12 | Sleep. Up for **Milestone 2**. |
| 12–16 | Choice agent + choice screen. Approval card, "confirm?" screen, voice picker. |
| 16–18 | Accessibility pass across resident screens. Tablet testing. Freeze. |
| 18–20 | Pitch deck draft. Bug fixes. |
| 20–24 | Record and edit backup video (hour 20, with James's voice-over). Final deck. Devpost write-up. Point the GoDaddy domain at the app. |

**Needs from others**: T2 — mock endpoints hour 1, profile/EMH data by hour 2. T4 — design system + shared components by hour 3. T1 — audio URLs (hour 4), interview answer format (hour 7).

**Hands off**: Gemini wrapper (to T4, T2 — hour 1). Suggestion format (to T1, T2). Chapter questions and text, PhotoChoiceGrid (to T1). Embedding function (to T2, hour 10).

**Done when**: Milestone 1 flow works end to end with suggestions that sound like Marcus and Dana on 15/15 tests. One chapter can be interviewed by taps only and read back. Choice agent never recommends and always offers "not decided yet". All resident screens usable on a tablet with no explanation. Deck, video, Devpost and live URL ready by hour 23.

### William (T4): Staff experience lead (AI + screens)

**Owns**: everything staff use — both the prompts and the screens. The shared frontend foundation (app shell, design system, Cloudinary). The memory intelligence. Judge AI-safety answers.

**Deliverables**
- Next.js app shell, design tokens, one Cloudinary tile recipe + pipeline.
- Coach agent (source labels, "I don't know, ask Marcus") + Coach chat + onboarding path.
- Memory subagents: Observer, Consolidator (simple), Retriever; Routine finder on seeded data. Binder importer extraction prompt.
- Action agent (online steps vs. staff tasks) + activity log.
- Staff screens: pick-a-resident, Handoff list, add-observation form.
- Test sets: 15 staff questions, 5 action goals.
- Task board. Judge AI-safety answers (memory + actions). Stretch: manager view.

| Hours | Tasks |
|---|---|
| 0–1 | Set up Next.js app, design tokens, Cloudinary, tile recipe, task board. Agree contracts. |
| 1–3 | Cloudinary pipeline; process seed photos → IDs to T2. Binder extraction prompt (with T2's seed). |
| 3–6 | Shared components (tiles, big buttons) for T3's Speak screen. Pick-a-resident + staff shell. Milestone 1 support. |
| 6–10 | Coach agent with source labels and "I don't know" behaviour. Coach chat + onboarding path. |
| 10–12 | Handoff screen + observation form. **Milestone 2.** |
| 12–13 | Memory subagents core (Observer + Retriever) against mocks. |
| 13–16 | Sleep. |
| 16–18 | Action agent + wire memory and actions end to end with T2. Activity log. Consolidator + Routine finder. Freeze. |
| 18–24 | Judge AI-safety answers (memory + actions). Bug fixes. Support Ahmed on the demo video. Stretch: manager view. |

**Needs from others**: T2 — mock endpoints hour 1, memory + actions servers hours 12–16. T3 — Gemini wrapper hour 1, suggestion format for screens. T1 — audio URLs, Coach voice agent wiring (hour 12).

**Hands off**: Cloudinary photo IDs (to T2, hour 3). Design system + shared components (to T3, hour 3). Coach wording for ask_about (to T2, hour 8). Action plan format → approval card data (to T3, hour 13). Memory agent functions (to T2).

**Done when**: 15/15 Coach test questions answered with correct source labels incl. "From records"; unknowns handled. The tea pattern reaches Marcus's "confirm?" queue (subagents, or seeded fallback). Action agent splits 5/5 goals correctly. A new staff member can complete Essentials and Handoff. Every tile uses the same style. Judge AI-safety answers written.

## 6. Shared timeline

| Hours | Team goal |
|---|---|
| 0–1 | Kickoff. Agree interface contracts. Everyone set up. |
| 6 | **Milestone 1**: tap tiles → suggestions → approve → spoken. End to end. |
| 12 | **Milestone 2**: one story chapter interviewed and narrated; Coach answers with sources. |
| 16 | Handoff, Supported Choice, memory layer and first 2 actions working. |
| 18 | **Feature freeze.** Only bug fixes and stretch after this. |
| 20 | Two full rehearsals. Record backup video. |
| 23 | Submission complete. |
| 24 | Buffer. |

**Check-ins**: 5-minute stand-up at hours 3, 6, 9, 12, 15, 18, 21. Each person says: done, next, blocked. Integration test at every milestone: run the demo flow end to end.

**Sleep shifts** (staggered so at least three people are always up): T2 hours 7–10, T1 + T3 hours 9–12 (up for Milestone 2), T4 hours 13–16. Nobody sleeps through a milestone or the freeze.

## 7. Interface contracts

See [CONTRACTS.md](CONTRACTS.md) — frozen at hour 1. Tiffany (T2) publishes mock responses for all of them at hour 1 so nobody waits.

## 8. Demo script (3 minutes)

| Time | Beat | What happens | Driver |
|---|---|---|---|
| 0:00 | Hook | "Imagine learning about someone from a binder written years ago, by someone else." | T1 |
| 0:20 | Story | Marcus's About me page plays in his voice. "Told once, heard by everyone." | T1 |
| 0:45 | Speak | coffee + now → "Can I get a double-double from Tim's?" → approve → spoken. | T3 |
| 1:10 | Choice + Action | Marcus picks bowling. One approval card: book lane, add to calendar, text Lisa. He approves. Staff task for the ride appears. | T3 |
| 1:40 | Memory | Coach: "Marcus has been choosing tea lately (pattern noticed)." Marcus taps yes; now "in Marcus's words." | T4 |
| 2:05 | Coach | Judge plays new staff, asks "What upsets Marcus?" Answer labelled "In Marcus's words." | T4 |
| 2:25 | Handoff | "Since your last shift: bowling booked for Saturday, ride needed 1:30. Grocery shopping didn't happen, bus cancelled." | T2 |
| 2:45 | Close | Architecture slide: four MCP servers, swap mocks for real services. | T2 |

## 9. Accessibility principles

- Tap targets at least 64px with generous spacing.
- Same layout on every screen. Nothing moves unexpectedly.
- Real photos over icons, with simple word labels.
- Every button can speak its label (long press).
- No time limits.
- High-contrast and large-text modes.
- Undo for every action.
- One question at a time.
- Calm visuals, no flashing.

## 10. Prize plan

| Category | Integration | Owner |
|---|---|---|
| Overall 1st/2nd/3rd | AAC, stories and onboarding: the partner's priorities | Everyone |
| Cloudinary Community Impact | Residents' real photos become accessible tiles and story pages | T4 |
| ElevenLabs | Chosen voices, narration, Story and Coach agents | T1 |
| Gemini | All agents incl. memory subagents and Action agent; Computer Use (stretch) | T3 + T4 |
| Tiger Data | Memory layer: vector search + timestamps in one database; EMH history; action log | T2 |
| Entire | Team coding sessions through Entire | Everyone |
| GoDaddy | Project domain (e.g. inmywords.xyz) | T3 |

## 11. Judge Q&A prep

- **AI speaking for someone?** Never without approval. Original tiles visible. "Speak tiles only" works without AI.
- **Resident can't decide?** Logged as "not decided yet" with a reminder. No "staff decided" option.
- **Different from existing AAC apps?** Suggestions from the person's own life, story in their own voice, staff onboarding in the same tool.
- **Why MCP?** One shared data layer. Swap mock EMH for real without changing agents. Works in other AI tools.
- **Accessibility?** Large targets, consistent layout, no time limits, spoken labels, high contrast.
- **Data?** Fictional for the demo. Every fact labels its source. Design supports Canadian data storage.
- **Can agents be misused to exploit residents?** Actions are an allowlist. Every action needs a picture approval card, has spending limits and a cancel window. Agents never send money to people or share personal info. Everything is logged for staff.
- **Does the AI decide what residents like?** No. It notices patterns and labels them "pattern noticed". Only the resident can confirm them.
- **What about years of existing binder history?** Imported once as "From records" facts with the document's date. Nothing imported is ever shown as the resident's words; the resident confirms what's still true, and stale binder facts get flagged when current behaviour contradicts them — the out-of-date binder is the problem we're fixing, so we never treat it as ground truth.
- **Cost?** Mostly free tiers. Main ongoing cost is voice minutes, reduced by caching.

## 12. Risks and cut list

| Risk | Mitigation | Owner |
|---|---|---|
| Voice delay on venue wifi | Pre-generate demo audio; backup video | T1 |
| Generic AI suggestions | Rich seed profiles; test set | T3 |
| Scope creep | Feature freeze at hour 18; strict cut order | Everyone |
| ElevenLabs agent setup slow | Fall back to TTS + on-screen questions | T1 |
| Inconsistent tile style | One Cloudinary recipe, chosen at hour 1 | T4 |
| Integration breaks late | Mock responses at hour 1; test at every milestone | T2 |
| Memory layer too big | Build Observer, simple Consolidator, Retriever only; Routine finder runs on seeded data | T4 |
| Real message sending fails at venue | Pre-test; fall back to showing the sent message in the log | T2 |

**Cut order**: manager view → camera mode → Computer Use → scenario questions → extra actions beyond the first → Supported Choice → Handoff.

**Never cut**: Speak For Me, My Story, Onboarding Coach, Memory Layer (minimal version).

## 13. Submission checklist

| Item | Owner | Due |
|---|---|---|
| Demo video under 3 minutes | T3 | Hour 21 |
| Pitch deck | T3 | Hour 22 |
| README with setup and architecture diagram | T2 | Hour 22 |
| Devpost write-up | T3 | Hour 23 |
| Sponsor categories selected | T1 | Hour 23 |
| Live URL on GoDaddy domain | T3 | Hour 23 |
| Demo data reset to clean state | T2 | Before judging |
