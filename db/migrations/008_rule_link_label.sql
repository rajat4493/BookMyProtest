-- A rule's official link can carry its own label (e.g. "View official Annexure B"), so the UI never guesses.
ALTER TABLE rules ADD COLUMN IF NOT EXISTS official_link_label text NOT NULL DEFAULT '';
