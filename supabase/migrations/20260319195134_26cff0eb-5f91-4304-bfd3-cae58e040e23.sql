CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_missions_tittel_trgm ON missions USING gin (tittel gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_missions_lokasjon_trgm ON missions USING gin (lokasjon gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_missions_beskrivelse_trgm ON missions USING gin (beskrivelse gin_trgm_ops);