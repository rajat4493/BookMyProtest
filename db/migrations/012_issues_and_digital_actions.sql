-- v1.1 Find Your Hill + Digital Actions (behind feature flags). Additive only. Issue evidence is kept apart from the legal-rule source registry.

CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  why_discussed text NOT NULL DEFAULT '',
  scope_level text NOT NULL DEFAULT 'LOCAL' CHECK (scope_level IN ('LOCAL','STATE','NATIONAL')),
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'OTHER' CHECK (category IN ('ENVIRONMENT','TRANSPORT','EDUCATION','HEALTHCARE','CONSUMER_RIGHTS','CIVIC_INFRASTRUCTURE','EMPLOYMENT','PUBLIC_SERVICES','ECONOMY','OTHER')),
  perspectives jsonb NOT NULL DEFAULT '[]',        -- [{label, summary, sourceUrl?}]
  disputed_claims jsonb NOT NULL DEFAULT '[]',     -- [{claim, dispute, sourceUrl?}]
  developments jsonb NOT NULL DEFAULT '[]',        -- [{date, text, sourceTitle, sourceUrl}]
  unknowns text NOT NULL DEFAULT '',
  last_checked_on date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  moderation_status text NOT NULL DEFAULT 'OK' CHECK (moderation_status IN ('OK','HIDDEN','REMOVED')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(description,'') || ' ' || coalesce(city,'') || ' ' || coalesce(state,''))) STORED
);
CREATE INDEX IF NOT EXISTS issues_search_idx ON issues USING gin (search);
CREATE INDEX IF NOT EXISTS issues_place_idx ON issues (state, city);

CREATE TABLE IF NOT EXISTS issue_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('OFFICIAL_RECORD','RESEARCH','INDEPENDENT_REPORTING','ORGANIZATION_STATEMENT')),
  title text NOT NULL,
  url text NOT NULL CHECK (url ~* '^https://'),
  publisher text NOT NULL DEFAULT '',
  published_on date,
  note text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS issue_sources_issue_idx ON issue_sources (issue_id, sort);

CREATE TABLE IF NOT EXISTS issue_followers (
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, user_id)
);

CREATE TABLE IF NOT EXISTS issue_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'OTHER',
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','PROMOTED','DECLINED')),
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS issue_protest_links (
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  protest_id uuid NOT NULL REFERENCES public_protests(id) ON DELETE CASCADE,
  linked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, protest_id)
);

CREATE TABLE IF NOT EXISTS digital_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  issue_id uuid NOT NULL REFERENCES issues(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  requested_change text NOT NULL DEFAULT '',
  institution text NOT NULL DEFAULT '',
  evidence jsonb NOT NULL DEFAULT '[]',            -- [{claim, sourceTitle, sourceUrl}]
  closure_criteria text NOT NULL DEFAULT '',
  starts_on date,
  review_on date,
  organizer_display_name text NOT NULL,
  visibility text NOT NULL DEFAULT 'DRAFT' CHECK (visibility IN ('DRAFT','PUBLIC','UNLISTED','ARCHIVED')),
  outcome_state text NOT NULL DEFAULT 'ACTIVE' CHECK (outcome_state IN ('ACTIVE','RESPONSE_RECORDED','PARTIALLY_RESOLVED','RESOLVED_REPORTED','DISPUTED','CLOSED_WITHOUT_RESOLUTION','ARCHIVED')),
  moderation_status text NOT NULL DEFAULT 'OK' CHECK (moderation_status IN ('OK','HIDDEN','REMOVED')),
  identity_flags text[] NOT NULL DEFAULT '{}',
  identity_reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS digital_campaigns_issue_idx ON digital_campaigns (issue_id);

CREATE TABLE IF NOT EXISTS digital_campaign_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES digital_campaigns(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('CONSUMER_PAUSE','POSITIVE_PURCHASING','SUBSCRIPTION_DECISION','FEEDBACK_PUBLIC_CHANNEL','SHARE_SOURCED_INFO','FOLLOW_DEVELOPMENTS','SUPPORT_TRANSPARENCY_REQUEST')),
  label text NOT NULL,
  detail text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS digital_campaign_actions_idx ON digital_campaign_actions (campaign_id, sort);

-- Only a user id, a choice and a time. No lists are ever read back; counts are aggregates over confirmed, non-suspended accounts.
CREATE TABLE IF NOT EXISTS digital_campaign_participation (
  campaign_id uuid NOT NULL REFERENCES digital_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('FOLLOWING','INTERESTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id, kind)
);
CREATE TABLE IF NOT EXISTS digital_campaign_action_intents (
  action_id uuid NOT NULL REFERENCES digital_campaign_actions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('INTENDS','COMPLETED_SELF_REPORTED')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action_id, user_id)
);

CREATE TABLE IF NOT EXISTS digital_campaign_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES digital_campaigns(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Three lanes, never mixed: a documented response, an observed outcome (both need a source) and an organizer's unverified claim.
CREATE TABLE IF NOT EXISTS digital_campaign_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES digital_campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('DOCUMENTED_RESPONSE','OBSERVED_OUTCOME','UNVERIFIED_CLAIM')),
  body text NOT NULL,
  source_title text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '' CHECK (source_url = '' OR source_url ~* '^https://'),
  occurred_on date,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'UNVERIFIED_CLAIM' OR source_url <> '')
);

CREATE TABLE IF NOT EXISTS content_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('ISSUE','CAMPAIGN')),
  target_id uuid NOT NULL,
  claim_text text NOT NULL,
  correction_text text NOT NULL,
  source_url text NOT NULL DEFAULT '' CHECK (source_url = '' OR source_url ~* '^https://'),
  report_id uuid,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_corrections_target_idx ON content_corrections (target_type, target_id);

CREATE TABLE IF NOT EXISTS content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('ISSUE','CAMPAIGN')),
  target_id uuid NOT NULL,
  reporter_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reporter_hash text NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN ('FACTUAL_ERROR','VIOLENCE_OR_THREAT','HARASSMENT','DOXXING','IMPERSONATION','FRAUD','ILLEGAL_CONTENT','SPAM','OTHER')),
  note text NOT NULL DEFAULT '',
  disputed_text text NOT NULL DEFAULT '',        -- for FACTUAL_ERROR: the statement said to be wrong
  evidence_url text NOT NULL DEFAULT '' CHECK (evidence_url = '' OR evidence_url ~* '^https://'),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACTIONED','CORRECTED','DISMISSED')),
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS content_reports_one_open ON content_reports (target_type, target_id, reporter_hash) WHERE status = 'OPEN';

ALTER TABLE moderation_actions ADD COLUMN IF NOT EXISTS issue_id uuid REFERENCES issues(id) ON DELETE SET NULL;
ALTER TABLE moderation_actions ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES digital_campaigns(id) ON DELETE SET NULL;
