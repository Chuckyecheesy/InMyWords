-- In My Words — Tiger Data (Postgres) schema
-- BUILD_PLAN §5. Owner: Tiffany (T2).
--
-- EMBEDDING VECTOR SIZE IS FIXED AT 768 (Gemini embedding, truncated output).
-- Never change it after setup — re-embedding everything mid-hackathon is the
-- failure mode this comment exists to prevent.

CREATE EXTENSION IF NOT EXISTS vector;

DROP VIEW IF EXISTS profile_items;
DROP MATERIALIZED VIEW IF EXISTS input_daily CASCADE;
DROP TABLE IF EXISTS input_events CASCADE;
DROP TABLE IF EXISTS custom_gestures CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS calendar_imports, visit_events, routines CASCADE;
DROP TABLE IF EXISTS emh_events, emh_checklist, emh_notes, bookings, calendar_events,
  staff_tasks, action_results, action_plans, observations, memories, choices,
  sentences, story_answers, story_chapters, tiles, staff, residents, homes CASCADE;

CREATE TABLE homes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  manager_id  TEXT
);

CREATE TABLE residents (
  id                  TEXT PRIMARY KEY,
  home_id             TEXT REFERENCES homes(id),
  first_name          TEXT NOT NULL,
  voice_id            TEXT,                -- ElevenLabs voice chosen by the resident
  communication_style TEXT,
  weekly_budget       NUMERIC
);

CREATE TABLE staff (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('staff', 'manager')),
  last_shift_end TIMESTAMPTZ               -- NULL = new staff, Handoff shows everything
);

CREATE TABLE tiles (
  id            SERIAL PRIMARY KEY,
  resident_id   TEXT REFERENCES residents(id),
  label         TEXT NOT NULL,
  category      TEXT,
  cloudinary_id TEXT,
  times_used    INT DEFAULT 0,
  archived      BOOLEAN NOT NULL DEFAULT false  -- custom cards hide, never delete
);

CREATE TABLE story_chapters (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  chapter_key TEXT NOT NULL,
  text        TEXT,
  photo_ids   TEXT[] DEFAULT '{}',
  audio_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved'))
);

CREATE TABLE story_answers (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  chapter_key TEXT NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sentences (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  tiles       TEXT[] NOT NULL,
  options     TEXT[] DEFAULT '{}',
  chosen_text TEXT,
  approved    BOOLEAN NOT NULL DEFAULT false,  -- nothing is spoken unless true
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE choices (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  question    TEXT,
  options     JSONB NOT NULL,              -- [{label, photo, cost, consequence}]
  chosen      TEXT,
  status      TEXT NOT NULL DEFAULT 'not_yet_decided'
              CHECK (status IN ('chosen', 'not_yet_decided')),  -- never "staff decided"
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE memories (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  type        TEXT NOT NULL CHECK (type IN ('preference', 'event', 'routine')),
  content     TEXT NOT NULL,
  embedding   VECTOR(768),                 -- backfilled by Ahmed's embedding fn; keyword search until then
  source      TEXT NOT NULL CHECK (source IN ('resident', 'staff', 'emh', 'document', 'inferred')),
  source_date DATE,                        -- for document facts: the binder's date
  times_seen  INT DEFAULT 1,
  first_seen  TIMESTAMPTZ DEFAULT now(),
  last_seen   TIMESTAMPTZ DEFAULT now(),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('confirmed', 'pending', 'dismissed'))
);

CREATE INDEX memories_embedding_idx ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX memories_resident_idx ON memories (resident_id, type, status);

CREATE TABLE observations (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  staff_id    TEXT REFERENCES staff(id),
  note        TEXT NOT NULL,               -- stored separately; never overwrites the resident's words
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE action_plans (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  goal        TEXT NOT NULL,
  steps       JSONB NOT NULL,              -- [{step, kind: online|staff, detail, cost}]
  total_cost  NUMERIC DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'proposed'
              CHECK (status IN ('proposed', 'approved', 'cancelled', 'done')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE action_results (
  id         SERIAL PRIMARY KEY,
  plan_id    INT REFERENCES action_plans(id),
  step       TEXT NOT NULL,
  result     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE staff_tasks (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  task        TEXT NOT NULL,
  due_at      TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done'))
);

CREATE TABLE calendar_events (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  title       TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL
);

-- My Planner (PROJECT_PLAN §2.5). The resident's routine, expanded in plain
-- code into one visit_events row per day. visit_events is the source of
-- truth; google_event_id is set once the visit is on staff's Google Calendar.
CREATE TABLE routines (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  staff_id    TEXT REFERENCES staff(id),
  start_time  TEXT NOT NULL,               -- '13:00', local
  length_min  INT  NOT NULL CHECK (length_min > 0),
  days        JSONB NOT NULL,              -- ["mon", ...]; all 7 by default
  source      TEXT NOT NULL DEFAULT 'resident',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE visit_events (
  id              SERIAL PRIMARY KEY,
  resident_id     TEXT REFERENCES residents(id),
  routine_id      INT REFERENCES routines(id) ON DELETE CASCADE,
  staff_id        TEXT REFERENCES staff(id),
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  source          TEXT NOT NULL DEFAULT 'resident'
                  CHECK (source IN ('resident', 'staff', 'inferred')),
  google_event_id TEXT,
  approved        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Staff calendar import (stretch): a proposal from an uploaded .zip, kept
-- until staff approve it. committed maps event id -> google_event_id.
CREATE TABLE calendar_imports (
  id         TEXT PRIMARY KEY,
  staff_id   TEXT REFERENCES staff(id),
  events     JSONB NOT NULL,
  approved   BOOLEAN NOT NULL DEFAULT false,
  approved_ids JSONB NOT NULL DEFAULT '[]'::jsonb,  -- event ids staff ticked
  committed  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bookings (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  activity    TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL         -- the mock booking site reads this table
);

-- EMH mock tables (swap the emh MCP server for a real connection later)
CREATE TABLE emh_notes (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  author      TEXT NOT NULL,
  note        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE emh_checklist (
  id       SERIAL PRIMARY KEY,
  home_id  TEXT REFERENCES homes(id),
  date     DATE NOT NULL,
  item     TEXT NOT NULL,
  happened BOOLEAN NOT NULL,
  reason   TEXT                            -- why, when it didn't happen
);

CREATE TABLE emh_events (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  event       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Gaze/gesture/touch outcome events (GAZE_GESTURE_PLAN §6). One row per
-- OUTCOME (select/approve/cancel/timeout), never per frame — no video,
-- no raw gaze samples, ever. Becomes a Timescale hypertable with a daily
-- continuous aggregate in db/timescale_setup (run by reset.py — those
-- statements can't run inside this transaction).
CREATE TABLE input_events (
  ts          TIMESTAMPTZ NOT NULL,
  resident_id TEXT REFERENCES residents(id),
  session_id  TEXT,
  input_type  TEXT NOT NULL CHECK (input_type IN ('touch', 'gaze', 'gesture')),
  action      TEXT NOT NULL CHECK (action IN ('select', 'approve', 'cancel', 'custom')),
  target      TEXT,
  hold_ms     INT,
  gesture     TEXT,
  confidence  REAL,
  outcome     TEXT NOT NULL CHECK (outcome IN ('confirmed', 'cancelled', 'timeout'))
);

CREATE INDEX input_events_resident_ts_idx ON input_events (resident_id, ts);

-- G8: taught personal gestures. samples = 5 normalized 63-float arrays
-- (wrist at origin, scaled by hand size). One row per resident + tile;
-- re-teaching replaces it. Landmarks only — never video.
CREATE TABLE custom_gestures (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  tile_label  TEXT NOT NULL,
  samples     JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (resident_id, tile_label)
);

-- Records library (ROADMAP Phase 3): the resident's documents and dated
-- staff updates. Append-only; updates never overwrite older records.
-- The Coach retrieves from these with source = 'document' labels.
CREATE TABLE documents (
  id          SERIAL PRIMARY KEY,
  resident_id TEXT REFERENCES residents(id),
  title       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'update'
              CHECK (category IN ('binder', 'care plan', 'update', 'medical', 'other')),
  author      TEXT,
  doc_date    DATE,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  body        TEXT NOT NULL
);

CREATE INDEX documents_resident_idx ON documents (resident_id, doc_date DESC);

-- The profile IS the confirmed memory store (PROJECT_PLAN §3).
CREATE VIEW profile_items AS
SELECT resident_id,
       type AS section,
       content,
       source,
       source_date,
       last_seen AS confirmed_at
FROM memories
WHERE status = 'confirmed';
