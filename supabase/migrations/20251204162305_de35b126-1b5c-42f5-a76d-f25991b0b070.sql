-- Add route column to missions table
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS route JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.missions.route IS 'Stores route data as JSON: { coordinates: [{lat, lng}], totalDistance: number }';
