# web/ — Next.js app

**Owner: Teammate 4** (Frontend, media & pitch lead)

Tablet-first. Large type (≥22px body), 64px+ tap targets, calm colours, high-contrast theme.

## Planned routes (BUILD_PLAN §3)

```
app/resident/[id]            home tile grid (Speak For Me)
app/resident/[id]/story      story pages + PhotoChoiceGrid
app/resident/[id]/choice     supported choice screen
app/resident/[id]/confirm    "pattern noticed, confirm?" queue
app/resident/[id]/voice      voice picker (3 previews)
app/staff                    pick a resident
app/staff/[id]/onboarding    Essentials → Story → Routines path
app/staff/[id]/coach         Coach chat (text + voice), source badges
app/staff/handoff            since-last-shift summary
app/staff/activity           activity log
app/manager                  (stretch)
components/                  shared components incl. PhotoChoiceGrid, ApprovalCard
lib/api.ts                   ALL backend calls in one place
```

Setup (T4.1): `npx create-next-app@latest . --typescript`, then design tokens + Cloudinary tile recipe.

Tasks: T4.1–T4.8 in [docs/BUILD_PLAN.md](../docs/BUILD_PLAN.md).
