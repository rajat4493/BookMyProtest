-- Rules platform architecture delta. Additive: V0 tables and columns are preserved.
-- Existing data is mapped into the new model at the bottom of this file.

/* ---------- Jurisdictions: generic parent/child, any depth ---------- */
ALTER TABLE jurisdictions DROP CONSTRAINT IF EXISTS jurisdictions_level_check;
ALTER TABLE jurisdictions ADD CONSTRAINT jurisdictions_level_check
  CHECK (level IN ('country','state','region','district','city','zone','venue'));
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';  -- country-specific extensions live here
ALTER TABLE jurisdictions ADD COLUMN IF NOT EXISTS archived_at timestamptz;

/* ---------- Authorities: first-class records ---------- */
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS authority_type text NOT NULL DEFAULT 'OTHER';
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT '';
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '';
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS submission_url text;
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS submission_method text NOT NULL DEFAULT 'UNKNOWN'
  CHECK (submission_method IN ('ONLINE','EMAIL','IN_PERSON','POST','UNKNOWN'));
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS office_address text NOT NULL DEFAULT '';
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS last_verified_at date;

/* ---------- Evidence: source registry ---------- */
CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('PRIMARY_LAW','BINDING_CASE_LAW','OFFICIAL_ADMINISTRATIVE_RULE','OFFICIAL_CURRENT_PRACTICE','SECONDARY_LEAD')),
  issuing_authority text NOT NULL DEFAULT '',
  jurisdiction_id uuid REFERENCES jurisdictions(id) ON DELETE SET NULL,
  canonical_url text,
  publication_date date,
  effective_date date,
  retrieved_at date,
  last_checked_at timestamptz,
  content_hash text,
  active boolean NOT NULL DEFAULT true,
  monitoring_enabled boolean NOT NULL DEFAULT false,
  monitoring_frequency text NOT NULL DEFAULT 'WEEKLY' CHECK (monitoring_frequency IN ('DAILY','WEEKLY','MONTHLY','MANUAL')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  raw_text text,
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'OK' CHECK (status IN ('OK','FETCH_FAILED'))
);
CREATE INDEX IF NOT EXISTS source_snapshots_source_idx ON source_snapshots (source_id, retrieved_at DESC);

/* ---------- Rules: families, versions, lifecycle ---------- */
ALTER TABLE rules ADD COLUMN IF NOT EXISTS rule_family_id text;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS rule_status text NOT NULL DEFAULT 'DRAFT'
  CHECK (rule_status IN ('DRAFT','UNDER_REVIEW','ACTIVE','CHANGE_DETECTED','SUPERSEDED','ARCHIVED'));
ALTER TABLE rules ADD COLUMN IF NOT EXISTS legal_statement text NOT NULL DEFAULT '';
ALTER TABLE rules ADD COLUMN IF NOT EXISTS user_action text NOT NULL DEFAULT '';
ALTER TABLE rules ADD COLUMN IF NOT EXISTS deadline_definition jsonb NOT NULL DEFAULT '{"kind":"UNKNOWN"}';
ALTER TABLE rules ADD COLUMN IF NOT EXISTS submission_method text NOT NULL DEFAULT '';
ALTER TABLE rules ADD COLUMN IF NOT EXISTS effective_from date;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS effective_until date;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS supersedes_rule_id uuid REFERENCES rules(id) ON DELETE SET NULL;
ALTER TABLE rules ADD COLUMN IF NOT EXISTS inheritance_mode text NOT NULL DEFAULT 'ADD' CHECK (inheritance_mode IN ('ADD','OVERRIDE','EXCLUDE'));
ALTER TABLE rules ADD COLUMN IF NOT EXISTS overrides_family_id text;

/* ---------- Evidence join: rule <-> source ---------- */
ALTER TABLE rule_sources RENAME TO rule_sources_legacy;
CREATE TABLE rule_sources (
  rule_id uuid NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  relevance text NOT NULL DEFAULT '',
  excerpt text NOT NULL DEFAULT '',
  section_ref text NOT NULL DEFAULT '',
  evidence_strength text NOT NULL DEFAULT 'SUPPORTING' CHECK (evidence_strength IN ('PRIMARY','SUPPORTING','LEAD')),
  interpretation_note text NOT NULL DEFAULT '',
  PRIMARY KEY (rule_id, source_id)
);

/* ---------- Document requirements + templates ---------- */
CREATE TABLE IF NOT EXISTS rule_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  name text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  conditional boolean NOT NULL DEFAULT false,
  template_key text,
  authority_id uuid REFERENCES authorities(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  source_reference text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL,
  name text NOT NULL,
  jurisdiction_id uuid REFERENCES jurisdictions(id) ON DELETE CASCADE,  -- NULL = global default
  authority_id uuid REFERENCES authorities(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  content text NOT NULL,
  disclaimer text NOT NULL DEFAULT 'Draft generated by BookMyProtest. Verify requirements with the relevant authority before submission.',
  active boolean NOT NULL DEFAULT true,
  effective_from date,
  effective_until date,
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS document_templates_version_idx
  ON document_templates (template_key, COALESCE(jurisdiction_id, '00000000-0000-0000-0000-000000000000'::uuid), version);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES document_templates(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS template_version integer;

/* ---------- Temporary restrictions (time-sensitive overlays) ---------- */
CREATE TABLE IF NOT EXISTS temporary_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
  title text NOT NULL,
  geographic_scope text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  legal_basis text NOT NULL DEFAULT '',
  affected_activities text[] NOT NULL DEFAULT '{}',
  effect text NOT NULL DEFAULT 'RESTRICTED' CHECK (effect IN ('PROHIBITED','RESTRICTED','CONDITIONAL')),
  plain_explanation text NOT NULL DEFAULT '',
  source_id uuid REFERENCES sources(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','EXPIRED','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

/* ---------- Regulatory Watch: change events + review queue ---------- */
CREATE TABLE IF NOT EXISTS change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  detected_at timestamptz NOT NULL DEFAULT now(),
  previous_snapshot_id uuid REFERENCES source_snapshots(id) ON DELETE SET NULL,
  current_snapshot_id uuid REFERENCES source_snapshots(id) ON DELETE SET NULL,
  change_summary text NOT NULL DEFAULT '',
  summary_origin text NOT NULL DEFAULT 'SYSTEM' CHECK (summary_origin IN ('SYSTEM','AI','HUMAN')),
  diff_excerpt text NOT NULL DEFAULT '',
  materiality text NOT NULL DEFAULT 'UNKNOWN' CHECK (materiality IN ('COSMETIC','UNKNOWN','POTENTIALLY_MATERIAL','MATERIAL')),
  review_priority text NOT NULL DEFAULT 'NORMAL' CHECK (review_priority IN ('LOW','NORMAL','HIGH')),
  affected_rule_ids uuid[] NOT NULL DEFAULT '{}',
  review_status text NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','DISMISSED','APPROVED_UPDATE')),
  review_notes text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS change_events_status_idx ON change_events (review_status, detected_at DESC);

CREATE TABLE IF NOT EXISTS change_event_rules (
  change_event_id uuid NOT NULL REFERENCES change_events(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  replacement_rule_id uuid REFERENCES rules(id) ON DELETE SET NULL,
  PRIMARY KEY (change_event_id, rule_id)
);

/* ---------- Events: venue + immutable evaluation snapshots ---------- */
ALTER TABLE events ADD COLUMN IF NOT EXISTS venue_jurisdiction_id uuid REFERENCES jurisdictions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS event_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  as_of_date date NOT NULL,
  answers jsonb NOT NULL,
  rule_ids uuid[] NOT NULL,
  ruleset_fingerprint text NOT NULL,
  rules jsonb NOT NULL,          -- [{ruleId, familyId, version, title, level, status, evidence, sourceIds, lastVerifiedAt}]
  sources jsonb NOT NULL,        -- [{id, title, type, url, lastCheckedAt}]
  requirements jsonb NOT NULL,   -- generated requirement list as the user saw it
  restrictions jsonb NOT NULL DEFAULT '[]',
  readiness_pct integer NOT NULL,
  reason text NOT NULL DEFAULT 'GENERATED'
);
CREATE INDEX IF NOT EXISTS event_evaluations_event_idx ON event_evaluations (event_id, evaluated_at DESC);

CREATE OR REPLACE FUNCTION forbid_update() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS event_evaluations_immutable ON event_evaluations;
CREATE TRIGGER event_evaluations_immutable BEFORE UPDATE ON event_evaluations FOR EACH ROW EXECUTE FUNCTION forbid_update();

/* ---------- Audit log: before/after/reason ---------- */
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS before jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS after jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '';

/* =====================  DATA MIGRATION FROM V0  ===================== */

-- Rules: family id + lifecycle from existing flags. Dev-seed rules stay ACTIVE but unverified (they still render "Needs verification").
UPDATE rules SET rule_family_id = 'LEGACY-' || substr(id::text, 1, 8) WHERE rule_family_id IS NULL;
UPDATE rules SET rule_status = CASE WHEN archived_at IS NOT NULL THEN 'ARCHIVED' ELSE 'ACTIVE' END WHERE rule_status = 'DRAFT';
UPDATE rules SET deadline_definition = jsonb_build_object('kind','STRUCTURED','minimumDaysBeforeEvent',deadline_days_before,'dayType','CALENDAR','specialNotes',deadline_note)
  WHERE deadline_days_before IS NOT NULL;
UPDATE rules SET deadline_definition = jsonb_build_object('kind','UNKNOWN','specialNotes',deadline_note)
  WHERE deadline_days_before IS NULL AND deadline_note <> '';
ALTER TABLE rules ALTER COLUMN rule_family_id SET NOT NULL;
ALTER TABLE rules ALTER COLUMN rule_status SET DEFAULT 'DRAFT';
CREATE UNIQUE INDEX IF NOT EXISTS rules_family_version_idx ON rules (rule_family_id, version);
CREATE INDEX IF NOT EXISTS rules_status_idx ON rules (rule_status);

-- Legacy per-rule source rows -> registry + join. Type is conservatively SECONDARY_LEAD until an admin classifies the source.
INSERT INTO sources (id, title, source_type, canonical_url, retrieved_at, notes)
  SELECT id, COALESCE(NULLIF(title,''), COALESCE(url,'Untitled source')), 'SECONDARY_LEAD', url, retrieved_at,
         'Migrated from V0. Classify the source type before relying on it. ' || notes
  FROM rule_sources_legacy;
INSERT INTO rule_sources (rule_id, source_id, evidence_strength, interpretation_note)
  SELECT rule_id, id, 'LEAD', notes FROM rule_sources_legacy;

-- Required documents text[] -> rows
INSERT INTO rule_documents (rule_id, name, required)
  SELECT id, d, true FROM rules, unnest(required_documents) AS d WHERE array_length(required_documents,1) > 0;
