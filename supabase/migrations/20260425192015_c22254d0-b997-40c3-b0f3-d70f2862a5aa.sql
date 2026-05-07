ALTER TABLE public.drone_models
  ADD COLUMN IF NOT EXISTS characteristic_dimension_m NUMERIC(6,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS max_speed_mps NUMERIC(6,2) DEFAULT NULL;

UPDATE public.drone_models
SET characteristic_dimension_m = CASE
  WHEN name ILIKE '%FlyCart 100%' THEN 4.00
  WHEN name ILIKE '%FlyCart 30%' THEN 2.80
  WHEN name ILIKE '%Agras T40%' THEN 2.80
  WHEN name ILIKE '%Agras T30%' THEN 2.70
  WHEN name ILIKE '%Agras T25%' THEN 2.70
  WHEN name ILIKE '%Agras T10%' THEN 2.50
  WHEN name ILIKE '%Matrice 600%' THEN 1.70
  WHEN name ILIKE '%Matrice 400%' THEN 1.00
  WHEN name ILIKE '%Matrice 350%' THEN 0.90
  WHEN name ILIKE '%Matrice 300%' THEN 0.90
  WHEN name ILIKE '%Matrice 30%' THEN 0.70
  WHEN name ILIKE '%Matrice 4D%' THEN 0.45
  WHEN name ILIKE '%Matrice 4TD%' THEN 0.45
  WHEN name ILIKE '%Matrice 4E%' THEN 0.45
  WHEN name ILIKE '%Matrice 4T%' THEN 0.45
  WHEN name ILIKE '%Mavic 4%' THEN 0.35
  WHEN name ILIKE '%Mavic 3%' THEN 0.35
  WHEN name ILIKE '%Mavic 2%' THEN 0.35
  WHEN name ILIKE '%Air 3S%' THEN 0.33
  WHEN name ILIKE '%Air 3%' THEN 0.33
  WHEN name ILIKE '%Air 2S%' THEN 0.30
  WHEN name ILIKE '%Mini%' THEN 0.25
  WHEN name ILIKE '%Neo%' THEN 0.16
  WHEN name ILIKE '%Flip%' THEN 0.25
  WHEN name ILIKE '%Avata 2%' THEN 0.22
  WHEN name ILIKE '%Avata%' THEN 0.20
  WHEN name ILIKE '%DJI FPV%' THEN 0.32
  WHEN name ILIKE '%Inspire 3%' THEN 0.70
  WHEN name ILIKE '%WingtraOne%' THEN 1.25
  WHEN name ILIKE '%Wingcopter 198%' THEN 1.98
  WHEN name ILIKE '%Trinity F90%' THEN 2.39
  WHEN name ILIKE '%eBee X%' THEN 1.16
  WHEN name ILIKE '%Dragonfish Pro%' THEN 3.20
  WHEN name ILIKE '%Dragonfish Standard%' THEN 2.30
  WHEN name ILIKE '%EVO Max%' THEN 0.58
  WHEN name ILIKE '%EVO II%' THEN 0.46
  WHEN name ILIKE '%EVO Lite%' THEN 0.43
  WHEN name ILIKE '%EVO Nano%' OR name ILIKE '%Autel Nano%' THEN 0.26
  WHEN name ILIKE '%Skydio X10%' THEN 0.36
  WHEN name ILIKE '%Skydio X2%' THEN 0.30
  WHEN name ILIKE '%Skydio 2%' THEN 0.27
  WHEN name ILIKE '%Parrot Anafi AI%' THEN 0.32
  WHEN name ILIKE '%Parrot Anafi USA%' THEN 0.28
  WHEN name ILIKE '%Parrot Anafi%' THEN 0.24
  WHEN name ILIKE '%Freefly Astro%' THEN 1.10
  WHEN name ILIKE '%Yuneec H520%' THEN 0.55
  WHEN name ILIKE '%Yuneec Typhoon%' THEN 0.52
  ELSE CASE
    WHEN weight_kg >= 100 THEN 4.00
    WHEN weight_kg >= 20 THEN 2.80
    WHEN weight_kg >= 5 THEN 1.20
    WHEN weight_kg >= 1 THEN 0.60
    ELSE 0.30
  END
END,
max_speed_mps = CASE
  WHEN name ILIKE '%FlyCart 100%' THEN 20.0
  WHEN name ILIKE '%FlyCart 30%' THEN 20.0
  WHEN name ILIKE '%Agras%' THEN 10.0
  WHEN name ILIKE '%Matrice 400%' THEN 25.0
  WHEN name ILIKE '%Matrice 350%' THEN 23.0
  WHEN name ILIKE '%Matrice 300%' THEN 23.0
  WHEN name ILIKE '%Matrice 30%' THEN 23.0
  WHEN name ILIKE '%Matrice 4%' THEN 21.0
  WHEN name ILIKE '%Mavic 4%' THEN 25.0
  WHEN name ILIKE '%Mavic 3%' THEN 21.0
  WHEN name ILIKE '%Mavic 2%' THEN 20.0
  WHEN name ILIKE '%Air 3%' THEN 21.0
  WHEN name ILIKE '%Air 2S%' THEN 19.0
  WHEN name ILIKE '%Mini%' THEN 16.0
  WHEN name ILIKE '%Neo%' THEN 8.0
  WHEN name ILIKE '%Flip%' THEN 12.0
  WHEN name ILIKE '%Avata%' THEN 27.0
  WHEN name ILIKE '%DJI FPV%' THEN 39.0
  WHEN name ILIKE '%Inspire 3%' THEN 26.0
  WHEN name ILIKE '%WingtraOne%' THEN 16.0
  WHEN name ILIKE '%Wingcopter%' THEN 40.0
  WHEN name ILIKE '%Trinity F90%' THEN 35.0
  WHEN name ILIKE '%eBee X%' THEN 30.0
  WHEN name ILIKE '%Dragonfish%' THEN 30.0
  WHEN name ILIKE '%EVO Max%' THEN 23.0
  WHEN name ILIKE '%EVO II%' THEN 20.0
  WHEN name ILIKE '%EVO Lite%' THEN 18.0
  WHEN name ILIKE '%EVO Nano%' OR name ILIKE '%Autel Nano%' THEN 15.0
  WHEN name ILIKE '%Skydio%' THEN 16.0
  WHEN name ILIKE '%Parrot Anafi%' THEN 15.0
  WHEN name ILIKE '%Freefly Astro%' THEN 16.0
  WHEN name ILIKE '%Yuneec%' THEN 18.0
  ELSE COALESCE(max_wind_mps * 2, 15.0)
END
WHERE characteristic_dimension_m IS NULL
   OR max_speed_mps IS NULL;