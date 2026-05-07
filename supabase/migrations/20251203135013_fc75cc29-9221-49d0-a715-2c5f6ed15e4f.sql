-- Legg til nye kolonner i incidents-tabellen
ALTER TABLE incidents ADD COLUMN hovedaarsak text;
ALTER TABLE incidents ADD COLUMN medvirkende_aarsak text;

-- Hovedårsak oppslagstabell
CREATE TABLE incident_cause_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  navn text NOT NULL UNIQUE,
  beskrivelse text,
  rekkefolge integer NOT NULL DEFAULT 0,
  aktiv boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Medvirkende årsak oppslagstabell  
CREATE TABLE incident_contributing_causes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  navn text NOT NULL UNIQUE,
  beskrivelse text,
  rekkefolge integer NOT NULL DEFAULT 0,
  aktiv boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Sett inn forhåndsdefinerte verdier for hovedårsak
INSERT INTO incident_cause_types (navn, rekkefolge) VALUES
  ('Menneskelig feil/svikt', 1),
  ('Materiellsvikt', 2),
  ('Metode eller systemfeil', 3),
  ('Management/ledelse', 4),
  ('Ytre miljøpåvirkning', 5);

-- Sett inn forhåndsdefinerte verdier for medvirkende årsak
INSERT INTO incident_contributing_causes (navn, rekkefolge) VALUES
  ('Uhell', 1),
  ('Brukerfeil', 2),
  ('Brudd på prosedyre', 3),
  ('Mangelfull prosedyre', 4),
  ('Mangelfull opplæring', 5),
  ('Annen menneskelig feil/svikt', 6),
  ('Stress/høy belastning', 7),
  ('Forandring i rutiner', 8),
  ('Sykdom', 9),
  ('Mangelfull årvåkenhet', 10),
  ('Teknisk svikt', 11),
  ('Uegnet teknisk løsning', 12),
  ('Værforhold', 13),
  ('Fugler/dyr', 14),
  ('ATC-klarering', 15),
  ('Nærpassering', 16),
  ('Annet', 17),
  ('Ukjent', 18);

-- RLS policies for autentiserte brukere (kun lesing)
ALTER TABLE incident_cause_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_contributing_causes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view cause types" ON incident_cause_types
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view contributing causes" ON incident_contributing_causes
  FOR SELECT USING (auth.role() = 'authenticated');