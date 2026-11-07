# db/ — Tiger Data schema & seed data

**Owner: Teammate 2** (Data & MCP lead)

Tiger Data = Postgres with vector search. Enable the vector extension at setup and **fix the embedding vector size once — never change it**.

## Planned contents

```
schema.sql        all tables (BUILD_PLAN §5)
seed/
  marcus.json     12 tiles, 2 draft chapters, preferences (double-double, quiet, bowling)
  dana.json       12 tiles, 2 draft chapters, weekly budget $60
  emh_notes.json  2 weeks of notes, checklist entries with reasons, significant events
  memories.json   2 weeks of memory history incl. the tea-vs-coffee pattern for Marcus
reset script      wipes and reloads everything — must run in under a minute
```

Key design: the resident "profile" is a **view over memories where status = confirmed**, grouped by section.

Seed must include: 3 staff (incl. new staff "Jordan" with no prior shifts), 2 homes, 1 manager, and a visible pattern (Marcus picked tea 5× this week after months of coffee) so the Memory demo works.

Tasks: T2.1–T2.2 in [docs/BUILD_PLAN.md](../docs/BUILD_PLAN.md). Table list in BUILD_PLAN §5.
