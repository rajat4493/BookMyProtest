-- v0.9.2: permission lifecycle, readiness snapshots, source integration statuses, structured rule facts.

-- The police-permission lifecycle for an event. Append-only history; the latest row is the current status. Nothing infers APPROVED.
CREATE TABLE IF NOT EXISTS event_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('NOT_STARTED','PREPARED','SUBMITTED','ACKNOWLEDGED','APPROVED','REJECTED','WITHDRAWN','EXPIRED')),
  occurred_at timestamptz,                -- submission date/time, acknowledgement time, decision time
  method text CHECK (method IS NULL OR method IN ('IN_PERSON','POST','EMAIL','ONLINE','OTHER')),
  reference text NOT NULL DEFAULT '',     -- acknowledgement / diary / permission number
  evidence_ref text NOT NULL DEFAULT '',  -- where the organizer keeps the stamped copy (no upload is supported)
  approval_date date,
  conditions text NOT NULL DEFAULT '',    -- permission conditions / notes
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_permissions_idx ON event_permissions (event_id, recorded_at DESC);

-- Each readiness result at plan generation, recheck, document generation, T-72h and T-24h. Immutable history of what the organizer was told.
CREATE TABLE IF NOT EXISTS readiness_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('PLAN_GENERATED','RECHECK','DOCUMENT_GENERATION','T_72H','T_24H')),
  computed_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL CHECK (state IN ('READY','READY_WITH_WARNINGS','NOT_READY','STATUS_UNKNOWN')),
  reasons jsonb NOT NULL,
  inputs jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS readiness_snapshots_idx ON readiness_snapshots (event_id, computed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS readiness_snapshots_scheduled_idx ON readiness_snapshots (event_id, trigger_kind) WHERE trigger_kind IN ('T_72H','T_24H');

-- Distinct, explicit integration statuses for a source (never collapsed into "unknown").
ALTER TABLE sources ADD COLUMN IF NOT EXISTS verification_flags text[] NOT NULL DEFAULT '{}'
  CHECK (verification_flags <@ ARRAY['SOURCE_VERIFIED','FETCH_IN_THIS_ENVIRONMENT_BLOCKED','PARSER_REAL_PAGE_VERIFICATION_PENDING','PARSER_REAL_PAGE_VERIFIED']::text[]);

-- Structured, labelled facts about a rule (e.g. issuer context, submission route, certainty note), shown under Details.
ALTER TABLE rules ADD COLUMN IF NOT EXISTS facts jsonb NOT NULL DEFAULT '[]';
