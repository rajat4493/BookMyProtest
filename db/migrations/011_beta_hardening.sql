-- v1.0.1 public beta hardening: verified email, durable rate limiting, user reports, organizer identity signals.
-- Additive. Existing accounts stay unverified (admins are marked verified) and must confirm their email to publish or to be counted as supporters.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
UPDATE users SET email_verified_at = now() WHERE role = 'admin' AND email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS email_verifications (
  token_hash text PRIMARY KEY,                      -- sha256 of the emailed token; the token itself is never stored
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,                              -- the address the token proves (an email change invalidates it)
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verifications_user_idx ON email_verifications (user_id);

-- Every outgoing message is recorded. Delivery is by a provider adapter (src/lib/mail.ts); without one configured, rows stay PENDING.
CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  kind text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- Shared fixed-window counters: every app instance increments the same row atomically.
CREATE TABLE IF NOT EXISTS rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE IF NOT EXISTS protest_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protest_id uuid NOT NULL REFERENCES public_protests(id) ON DELETE CASCADE,
  reporter_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reporter_hash text NOT NULL,                      -- stable pseudonymous key (account id or network address) used only to stop duplicates
  reason_code text NOT NULL CHECK (reason_code IN ('VIOLENCE_OR_THREAT','HARASSMENT','DOXXING','IMPERSONATION','FRAUD','ILLEGAL_CONTENT','SPAM','OTHER')),
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACTIONED','DISMISSED')),
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text NOT NULL DEFAULT '',
  moderation_action_id uuid REFERENCES moderation_actions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS protest_reports_one_open ON protest_reports (protest_id, reporter_hash) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS protest_reports_status_idx ON protest_reports (status, created_at);

-- Organizer identity signals: automatic flags for human review (never an automatic penalty) and the review outcome.
ALTER TABLE public_protests ADD COLUMN IF NOT EXISTS identity_flags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public_protests ADD COLUMN IF NOT EXISTS identity_reviewed_at timestamptz;
