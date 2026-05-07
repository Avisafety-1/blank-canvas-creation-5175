-- Legg til route_data kolonne for å lagre rute-kopi i active_flights
ALTER TABLE active_flights ADD COLUMN route_data jsonb;

-- Fjern policyen som eksponerer oppdrag på tvers av selskaper
DROP POLICY IF EXISTS "Authenticated users can view missions with active flights" ON missions;