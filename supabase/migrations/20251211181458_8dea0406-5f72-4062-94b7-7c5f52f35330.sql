-- Add publish_mode column to active_flights table
ALTER TABLE active_flights 
ADD COLUMN IF NOT EXISTS publish_mode text DEFAULT 'none';