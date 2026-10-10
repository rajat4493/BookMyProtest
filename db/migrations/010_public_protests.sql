-- v1.0 public launch foundation: public protest pages, supporter intent (aggregate-only), support offers, moderation.
-- Additive: planning data stays in `events`; a public protest is a separate, explicitly created record that links to one plan.

ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public_protests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  event_id uuid NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,   -- one public page per plan; planning data stays private in events
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  organizer_display_name text NOT NULL,
  organizer_type text,
  city text NOT NULL,
  state text NOT NULL DEFAULT '',
  venue_name text NOT NULL DEFAULT '',
  venue_jurisdiction_id uuid REFERENCES jurisdictions(id) ON DELETE SET NULL,
  event_date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  category text NOT NULL DEFAULT 'OTHER',
  expected_format text NOT NULL DEFAULT 'static' CHECK (expected_format IN ('static','march')),
  logistics text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'DRAFT' CHECK (visibility IN ('DRAFT','PRIVATE','UNLISTED','PUBLIC','ARCHIVED','CANCELLED')),
  moderation_status text NOT NULL DEFAULT 'OK' CHECK (moderation_status IN ('OK','HIDDEN','REMOVED')),
  permission_mode text NOT NULL DEFAULT 'SYNC' CHECK (permission_mode IN ('SYNC','NOT_PROVIDED')),   -- SYNC: shows what the organizer recorded in their tracker
  public_fields jsonb NOT NULL DEFAULT '{"organizerType":true,"logistics":true,"officialInfo":true}',
  support_options jsonb NOT NULL DEFAULT '[]',   -- [{type, note, link}] organizer-provided
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS public_protests_list_idx ON public_protests (visibility, moderation_status, event_date);
CREATE INDEX IF NOT EXISTS public_protests_venue_idx ON public_protests (venue_jurisdiction_id, event_date);

CREATE TABLE IF NOT EXISTS protest_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protest_id uuid NOT NULL REFERENCES public_protests(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS protest_updates_idx ON protest_updates (protest_id, created_at DESC);

-- Supporter intent. Identity lives here and is NEVER returned by any public or organizer-facing query: aggregates only.
CREATE TABLE IF NOT EXISTS protest_supports (
  protest_id uuid NOT NULL REFERENCES public_protests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('FOLLOWING','INTERESTED','PLANNING_TO_ATTEND')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (protest_id, user_id, kind)      -- one of each per person: no duplicate counting
);
CREATE TABLE IF NOT EXISTS protest_support_offers (
  protest_id uuid NOT NULL REFERENCES public_protests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_type text NOT NULL CHECK (option_type IN ('ATTEND','SHARE','VOLUNTEER','TRANSPORT_HELP','WATER_HELP','PRINTING_HELP','FIRST_AID_HELP','OTHER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (protest_id, user_id, option_type)
);

-- Platform-rule enforcement log. Reasons are conduct/content categories only; there is no viewpoint category.
CREATE TABLE IF NOT EXISTS moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protest_id uuid REFERENCES public_protests(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('HIDE','RESTORE','REMOVE','SUSPEND_ORGANIZER','REINSTATE_ORGANIZER')),
  reason_code text NOT NULL CHECK (reason_code IN ('VIOLENCE_OR_THREAT','HARASSMENT','DOXXING','IMPERSONATION','FRAUD','ILLEGAL_CONTENT','SPAM','OTHER')),
  note text NOT NULL DEFAULT '',
  admin_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_actions_idx ON moderation_actions (created_at DESC);
