INSERT INTO public.drone_models (name, eu_class, weight_kg, payload_kg, weight_without_payload_kg, standard_takeoff_weight_kg, endurance_min, max_wind_mps, sensor_type, category, comment)
VALUES
  ('DJI Matrice 4D', 'C2', 1.42, 0.2, 1.22, 1.42, 49, 12, 'mapping', 'enterprise', 'Dock 3-compatible mapping variant of Matrice 4 Series'),
  ('DJI Matrice 4TD', 'C2', 1.42, 0.2, 1.22, 1.42, 49, 12, 'thermal', 'enterprise', 'Dock 3-compatible thermal variant of Matrice 4 Series'),
  ('DJI Matrice 400', 'C3', 15.8, 6.0, 9.74, 15.8, 59, 12, 'interchangeable', 'enterprise', 'Heavy-lift enterprise drone, 59 min with H30T payload'),
  ('DJI FlyCart 100', 'C6', 170.0, 100.0, 55.2, 170.0, 14, 12, 'cargo', 'cargo', 'Cargo delivery drone, 14 min endurance at 149.9 kg total weight');