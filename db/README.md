# db/ — Tiger Data schema & seed data

**Owner: Tiffany (T2)** (Data & MCP lead)

Tiger Data = Postgres with vector search. Enable the vector extension at setup and **fix the embedding vector size once — never change it**.

## Contents

```
schema.sql           all tables (BUILD_PLAN §5) — embedding size FIXED at 768
reset.py             wipes and reloads everything: python db/reset.py (needs DATABASE_URL)
seed/
  core.json          2 homes, 3 staff (Jordan has no prior shifts), 1 manager
  marcus.json        12 tiles, 2 draft chapters
  dana.json          12 tiles, 2 draft chapters, weekly budget $60
  emh_notes.json     2 weeks of notes, checklist entries with reasons, significant events
  memories.json      memory history incl. the PENDING tea-vs-coffee pattern for Marcus
  marcus_binder.md   fictional 2021 binder — input for William's document-import extraction
```

Embeddings are seeded NULL and backfilled via Ahmed's embedding function (T3.1); `recall` uses keyword match until then.

Key design: the resident "profile" is a **view over memories where status = confirmed**, grouped by section.

Seed must include: 3 staff (incl. new staff "Jordan" with no prior shifts), 2 homes, 1 manager, and a visible pattern (Marcus picked tea 5× this week after months of coffee) so the Memory demo works.

Tasks: T2.1–T2.2 in [docs/BUILD_PLAN.md](../docs/BUILD_PLAN.md). Table list in BUILD_PLAN §5.
