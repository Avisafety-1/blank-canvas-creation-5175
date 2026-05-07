ALTER TABLE missions
  ADD COLUMN IF NOT EXISTS checklist_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS checklist_completed_ids uuid[] NOT NULL DEFAULT '{}';