# In My Words

**Your story, told once, in your own voice. Your choices, made by you.**

CommuniHacks 2026. KW Habilitation, Problem 11. An AAC, life-story, and staff-onboarding app for residents in supported living.

## Inspiration

Staff often meet a resident through a binder someone else wrote years ago. The notes go stale. The person's coffee order, their sister's name, and what a hard day looks like get retold by whoever is on shift. We wanted the resident to say it once, in a voice they picked, and have every new staff member hear that same version.

## What it does

A resident taps photo tiles. The app offers two or three short sentences from their own life. Nothing is spoken until they approve it. They can also set their own routine in a planner — "meet staff at 1:00 for 2 hours, every day" — and the app books that recurring staff visit on a shared calendar, pick an outing and see what it costs, and confirm or reject a pattern the app noticed. Staff get a coach with a source on every fact, and a handoff of what changed since the last shift.

A choice is theirs, or it is "not decided yet." There is no "staff decided."

## How we built it

- Next.js screens, tablet first, with 64px targets, large type, high contrast, and a long-press that speaks a button's name.
- FastAPI in front of four MCP servers: profile, memory, actions, and a mock EMH record.
- Gemini writes sentences, phrases the planner's visit proposals, and writes consequence phrases. Code, not the model, does the budget and recurrence math.
- ElevenLabs speaks only after approval, and caches the line.
- Tiger Data holds memories with a source and a time. Until a resident confirms a pattern, it stays labelled "pattern noticed."

## Challenges

Keeping the resident in charge meant every path had a gate: suggestions are not spoken, plans are not run, and inferred facts are not "his words" until he says so. The approval card shows each step as a picture, the total cost, and a few seconds to cancel before anything is booked.

## Accomplishments

Marcus can go from tiles to a spoken sentence and from "bowling" to one approval card. Dana sets a routine and her 1:00–3:00 staff visit books itself across the week — her call, on her calendar. The tea-versus-coffee contradiction stays a question until he taps yes.

## What's next

Connect a real EMH record and an organization calendar. Keep production data in Canada. Point the GoDaddy domain at the app with the three A records in [ops/DEPLOY.md](../ops/DEPLOY.md). The resident still approves every word and every plan.

## Sponsor categories

Built to enter these tracks:

| Category | What we used |
|---|---|
| Overall | AAC, life story, and staff onboarding together |
| Cloudinary Community Impact | One tile recipe so messy photos become the same kind of picture |
| ElevenLabs | Three voices each for Marcus and Dana, and spoken approval cards |
| Gemini | Sentence, planner, choice, coach, memory, and action wording; Google Calendar MCP |
| Tiger Data | Memories with vectors, timestamps, and the action log |
| Entire | The team's coding sessions |
| GoDaddy | The project domain, pointed at the app with `DEPLOY_DOMAIN` |

## Demo

Live app on the project domain once the DNS records are set. Backup walkthrough: home, Speak For Me, Choice and the approval card, Confirm, Voice, then the six pitch slides at `/pitch`.
