CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

-- Country -> State -> City. `supported` gates the planner; adding a city is a row, not code.
CREATE TABLE IF NOT EXISTS jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES jurisdictions(id) ON DELETE RESTRICT,
  level text NOT NULL CHECK (level IN ('country','state','city')),
  name text NOT NULL,
  supported boolean NOT NULL DEFAULT false,
  is_dev_seed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, name)
);

CREATE TABLE IF NOT EXISTS authorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
  name text NOT NULL,
  website text
);

CREATE TABLE IF NOT EXISTS rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
  authority_id uuid REFERENCES authorities(id) ON DELETE SET NULL,
  assembly_type text NOT NULL DEFAULT 'any' CHECK (assembly_type IN ('any','static','march')),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('permissions','documents','logistics','safety')),
  requirement_type text NOT NULL DEFAULT 'general',
  level text NOT NULL CHECK (level IN ('REQUIRED','LIKELY_REQUIRED','RECOMMENDED','NOT_REQUIRED','UNKNOWN')),
  else_level text CHECK (else_level IN ('REQUIRED','LIKELY_REQUIRED','RECOMMENDED','NOT_REQUIRED','UNKNOWN')),
  severity text NOT NULL CHECK (severity IN ('CRITICAL','REQUIRED','RECOMMENDED')),
  condition jsonb NOT NULL DEFAULT '{"all":[],"any":[]}',
  complete_when jsonb,
  deadline_days_before integer CHECK (deadline_days_before IS NULL OR deadline_days_before >= 0),
  deadline_note text NOT NULL DEFAULT '',
  official_link text,
  required_documents text[] NOT NULL DEFAULT '{}',
  vendor_category text,
  last_verified_at date,
  needs_review boolean NOT NULL DEFAULT true,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('low','medium','high')),
  rule_owner text NOT NULL DEFAULT '',
  admin_notes text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 100,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rules_jurisdiction_idx ON rules (jurisdiction_id) WHERE archived_at IS NULL;

-- Evidence ledger
CREATE TABLE IF NOT EXISTS rule_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  url text,
  title text NOT NULL DEFAULT '',
  retrieved_at date,
  notes text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  anon_id text NOT NULL,
  jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id),
  name text NOT NULL,
  event_date date NOT NULL,
  answers jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_anon_idx ON events (anon_id);
CREATE INDEX IF NOT EXISTS events_user_idx ON events (user_id);

-- Manual completion state per event/rule (requirements themselves are evaluated live from rules).
CREATE TABLE IF NOT EXISTS event_requirements (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  done boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, rule_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_categories (
  slug text PRIMARY KEY,
  label text NOT NULL,
  sort integer NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_slugs text[] NOT NULL DEFAULT '{}',
  contact text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS vendor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category text NOT NULL REFERENCES vendor_categories(slug),
  quantity text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','matching','matched','closed')),
  admin_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  country text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  city text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_user_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  anon_id text,
  props jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_name_idx ON analytics_events (name, created_at);
