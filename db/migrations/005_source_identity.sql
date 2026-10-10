-- Richer instrument identity on sources: a stable code, the order number, and separate index vs document URLs.
-- An "index only" source (index_url set, document_url NULL) proves an instrument EXISTS (title/date), not what it says.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS source_code text;
CREATE UNIQUE INDEX IF NOT EXISTS sources_code_idx ON sources (source_code) WHERE source_code IS NOT NULL;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS order_number text NOT NULL DEFAULT '';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS document_url text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS index_url text;
