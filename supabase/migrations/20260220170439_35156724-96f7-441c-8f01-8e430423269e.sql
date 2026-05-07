
-- Migration 1: Add new enum values only (must be committed before they can be used)
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'bruker';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'administrator';
