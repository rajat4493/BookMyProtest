-- Source lifecycle: a historical (superseded) or placeholder source stays in the registry for provenance
-- but can never support a current rule.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS lifecycle text NOT NULL DEFAULT 'CURRENT'
  CHECK (lifecycle IN ('CURRENT','HISTORICAL','PLACEHOLDER'));
ALTER TABLE sources ADD COLUMN IF NOT EXISTS superseded_by_source_id uuid REFERENCES sources(id) ON DELETE SET NULL;
