
-- Step 1: Create new mission for Avisafe
INSERT INTO missions (
  company_id, user_id, tittel, lokasjon, beskrivelse, tidspunkt, status, risk_nivå, route, merknader
)
SELECT
  'a6698b2d-8464-4f88-9bc4-ebcc072f629d',
  '6fd888df-6a2f-4a43-b753-21f9dcd53575',
  'Demo dronetag (kopi)',
  lokasjon, beskrivelse, tidspunkt, status, risk_nivå, route, merknader
FROM missions
WHERE id = 'f3354b65-949f-4c62-8899-db87f3cfa354';

-- Step 2: Copy flight log with track data (NULL drone_id and dronetag_device_id)
INSERT INTO flight_logs (
  company_id, user_id, mission_id, drone_id, dronetag_device_id,
  flight_date, flight_duration_minutes, departure_location, landing_location,
  movements, notes, flight_track, completed_checklists, safesky_mode
)
SELECT
  'a6698b2d-8464-4f88-9bc4-ebcc072f629d',
  '6fd888df-6a2f-4a43-b753-21f9dcd53575',
  (SELECT id FROM missions WHERE company_id = 'a6698b2d-8464-4f88-9bc4-ebcc072f629d' AND tittel = 'Demo dronetag (kopi)' ORDER BY opprettet_dato DESC LIMIT 1),
  NULL,
  NULL,
  flight_date, flight_duration_minutes, departure_location, landing_location,
  movements, notes, flight_track, completed_checklists, safesky_mode
FROM flight_logs
WHERE id = 'ff4a68e0-2ae3-4c71-a181-fa816bfef7ec';

-- Step 3: Copy risk assessment with all required NOT NULL fields
INSERT INTO mission_risk_assessments (
  mission_id, pilot_id, company_id, recommendation, ai_analysis,
  overall_score, weather_score, airspace_score, pilot_experience_score,
  mission_complexity_score, equipment_score, pilot_inputs, weather_data, airspace_warnings
)
SELECT
  (SELECT id FROM missions WHERE company_id = 'a6698b2d-8464-4f88-9bc4-ebcc072f629d' AND tittel = 'Demo dronetag (kopi)' ORDER BY opprettet_dato DESC LIMIT 1),
  '6fd888df-6a2f-4a43-b753-21f9dcd53575',
  'a6698b2d-8464-4f88-9bc4-ebcc072f629d',
  recommendation, ai_analysis,
  overall_score, weather_score, airspace_score, pilot_experience_score,
  mission_complexity_score, equipment_score, pilot_inputs, weather_data, airspace_warnings
FROM mission_risk_assessments
WHERE id = 'f4278b2c-ce5b-42fd-8a6f-9403fffa4a35';
