-- Legal certainty on rules, and per-evidence control over whether a source change flags the rule.
ALTER TABLE rules ADD COLUMN IF NOT EXISTS legal_certainty text NOT NULL DEFAULT 'UNVERIFIED'
  CHECK (legal_certainty IN ('PRIMARY_VERIFIED','OFFICIAL_GUIDANCE','UNVERIFIED'));
-- When false, a change to the source opens a review item but does NOT move the rule to CHANGE_DETECTED
-- (used for feeds that change constantly, e.g. a notifications page that is monitored for temporary orders).
ALTER TABLE rule_sources ADD COLUMN IF NOT EXISTS flag_on_change boolean NOT NULL DEFAULT true;
