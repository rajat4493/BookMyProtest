-- Venue scheduling and date signals. Signals are evidence of what is known about a venue on a date; they never prove availability.

ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS scheduling_mode text NOT NULL DEFAULT 'UNKNOWN'
  CHECK (scheduling_mode IN ('EXCLUSIVE','SHARED_CAPACITY','AUTHORITY_MANAGED','UNKNOWN'));

CREATE TABLE IF NOT EXISTS venue_date_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
  signal_date date NOT NULL,
  start_time time,
  end_time time,
  signal_type text NOT NULL CHECK (signal_type IN ('OFFICIAL_BOOKING','POLICE_APPROVAL','POLICE_APPLICATION','PUBLIC_EVENT_NOTICE','BMP_APPLICATION','BMP_APPROVAL')),
  event_status text NOT NULL CHECK (event_status IN ('CONFIRMED','PENDING','REPORTED','CANCELLED','REJECTED')),
  expected_attendance integer CHECK (expected_attendance IS NULL OR expected_attendance >= 0),
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  source_url text,
  confidence text NOT NULL CHECK (confidence IN ('low','medium','high')),
  checked_at timestamptz NOT NULL DEFAULT now(),
  label text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- public reports can only ever be low-confidence, unconfirmed signals
  CHECK (signal_type <> 'PUBLIC_EVENT_NOTICE' OR (confidence = 'low' AND event_status <> 'CONFIRMED'))
);
CREATE INDEX IF NOT EXISTS venue_date_signals_idx ON venue_date_signals (venue_id, signal_date);

-- A record that an official calendar/register was actually looked at for a venue and date range. Without one, official status is UNKNOWN.
CREATE TABLE IF NOT EXISTS venue_official_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
  authority text NOT NULL CHECK (authority IN ('BOOKING','POLICE')),
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  covers_from date NOT NULL,
  covers_to date NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN ('OK','FAILED')),
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS venue_official_checks_idx ON venue_official_checks (venue_id, authority, checked_at DESC);

-- Evidence explaining why a venue is scheduled the way it is (case law / operational learning).
CREATE TABLE IF NOT EXISTS venue_evidence (
  venue_id uuid NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('CASE_LAW','OPERATIONAL_LEARNING')),
  lesson text NOT NULL,
  PRIMARY KEY (venue_id, source_id, kind)
);

-- BookMyProtest's own users: a recorded approval (reported by the organiser, not verified).
ALTER TABLE events ADD COLUMN IF NOT EXISTS approval_recorded_at timestamptz;
