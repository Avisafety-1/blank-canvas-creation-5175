-- Create drone_models catalog table
CREATE TABLE public.drone_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  eu_class TEXT NOT NULL,
  weight_kg NUMERIC(10,3) NOT NULL,
  payload_kg NUMERIC(10,3) NOT NULL DEFAULT 0,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS with open read access for authenticated users
ALTER TABLE public.drone_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read drone models"
  ON public.drone_models FOR SELECT
  TO authenticated
  USING (true);

-- Populate with 22 popular drone models from PDF
INSERT INTO public.drone_models (name, eu_class, weight_kg, payload_kg, comment) VALUES
  ('DJI Mini 2 SE', 'C0', 0.249, 0, 'Rimelig og svært utbredt C0-drone'),
  ('DJI Mini 3 / 3 Pro', 'C0', 0.249, 0, 'Svært populær blant hobby og proff'),
  ('DJI Mini 4 Pro', 'C0', 0.249, 0, 'Avansert sensorteknologi i C0-klassen'),
  ('DJI Air 2S', 'C1', 0.595, 0, '1-tommers sensor, foto/video'),
  ('DJI Air 3', 'C1', 0.720, 0, 'Dual-kamera, god rekkevidde'),
  ('DJI Mavic 3 Classic', 'C1', 0.895, 0, 'Profesjonell bildekvalitet'),
  ('DJI Mavic 3 Pro / Cine', 'C1', 0.958, 0, 'Trippelkamera for avansert filming'),
  ('Autel EVO Lite+', 'C1', 0.835, 0, 'DJI-alternativ i prosumer-segmentet'),
  ('DJI Mavic 3 Enterprise', 'C2', 0.915, 0, 'Kartlegging og inspeksjon'),
  ('DJI Mavic 3 Thermal', 'C2', 0.920, 0, 'Termisk sensor for SAR/beredskap'),
  ('Autel EVO II Pro Enterprise', 'C2', 1.190, 0, 'Enterprise-inspeksjon'),
  ('DJI Matrice 30', 'C2', 3.770, 0.7, 'Kompakt industri- og inspeksjonsdrone'),
  ('DJI Matrice 30T', 'C2', 3.850, 0.7, 'Industri + termisk kamera'),
  ('DJI Inspire 3', 'C3', 3.995, 0.4, 'Film- og kinoformål'),
  ('DJI Matrice 300 RTK', 'C3', 6.300, 2.7, 'Industriell inspeksjon'),
  ('DJI Matrice 350 RTK', 'C3', 6.500, 2.7, 'Ny industristandard'),
  ('WingtraOne Gen II', 'C3', 4.500, 0.8, 'VTOL mapping-drone'),
  ('DJI Matrice 600 Pro', 'C4', 9.600, 6.0, 'Tung løfteplattform'),
  ('DJI Agras T30', 'C4', 26.000, 30.0, 'Landbruk og sprøyting'),
  ('DJI Agras T40', 'C4', 38.000, 40.0, 'Storskala landbruk'),
  ('senseFly eBee X', 'C5', 1.600, 0.2, 'BVLOS / SORA-operasjoner'),
  ('Trinity F90+', 'C5', 5.200, 1.0, 'Profesjonell BVLOS mapping'),
  ('Wingcopter 198', 'C5', 4.900, 6.0, 'BVLOS logistikkplattform');