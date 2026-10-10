-- Live-restriction feeds, parsed-order candidates, per-event restriction checks, and change-after-application tracking.

-- A source can be a live-restriction feed with an order parser. The parser only ever PROPOSES candidates.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS parser text CHECK (parser IS NULL OR parser IN ('ORDER_NOTICES'));
ALTER TABLE sources ADD COLUMN IF NOT EXISTS feed_role text CHECK (feed_role IS NULL OR feed_role IN ('LIVE_RESTRICTIONS'));

-- Richer temporary restrictions (issuer, order date/reference, the text it was read from).
ALTER TABLE temporary_restrictions ADD COLUMN IF NOT EXISTS issuing_authority text NOT NULL DEFAULT '';
ALTER TABLE temporary_restrictions ADD COLUMN IF NOT EXISTS order_date date;
ALTER TABLE temporary_restrictions ADD COLUMN IF NOT EXISTS order_reference text NOT NULL DEFAULT '';
ALTER TABLE temporary_restrictions ADD COLUMN IF NOT EXISTS source_excerpt text NOT NULL DEFAULT '';

-- Parsed-order candidates: machine-suggested, human-reviewed. Accepting one creates a DRAFT restriction, never an ACTIVE one.
CREATE TABLE IF NOT EXISTS restriction_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  change_event_id uuid REFERENCES change_events(id) ON DELETE SET NULL,
  raw_text text NOT NULL,
  parsed jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
  restriction_id uuid REFERENCES temporary_restrictions(id) ON DELETE SET NULL,
  review_notes text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restriction_candidates_status_idx ON restriction_candidates (status, created_at DESC);

-- Every live-restriction check made for an event, at plan generation, recheck, document generation, T-72h and T-24h.
CREATE TABLE IF NOT EXISTS restriction_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('PLAN_GENERATED','RECHECK','DOCUMENT_GENERATION','T_72H','T_24H')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('RESTRICTIONS_APPLY','FEED_STALE','REVIEW_PENDING','NO_RESTRICTION_RECORDED')),
  overlay_ids uuid[] NOT NULL DEFAULT '{}',
  feed_source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  feed_last_checked_at timestamptz,
  pending_review integer NOT NULL DEFAULT 0,
  message text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS restriction_checks_event_idx ON restriction_checks (event_id, checked_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS restriction_checks_scheduled_idx ON restriction_checks (event_id, trigger_kind) WHERE trigger_kind IN ('T_72H','T_24H');

-- Change after application.
ALTER TABLE events ADD COLUMN IF NOT EXISTS application_submitted_at timestamptz;
CREATE TABLE IF NOT EXISTS event_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_fields text[] NOT NULL,
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  material boolean NOT NULL,
  rules_changed boolean NOT NULL DEFAULT false,
  after_application boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz
);
CREATE INDEX IF NOT EXISTS event_changes_event_idx ON event_changes (event_id, changed_at DESC);
