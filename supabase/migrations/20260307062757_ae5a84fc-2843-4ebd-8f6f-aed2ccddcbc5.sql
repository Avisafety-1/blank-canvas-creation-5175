
INSERT INTO public.changelog_entries (title, description, status, created_at, completed_at) VALUES
  ('ECCAIRS 2.0-integrasjon', 'Full integrasjon med ECCAIRS E2-gateway for automatisk rapportering av luftfartshendelser. Støtter taksonomimapping, vedlegg og eksport til Luftfartstilsynet.', 'implementert', '2025-02-10', '2025-03-01'),
  ('SafeSky-integrasjon', 'Live-sporing av bemannet lufttrafikk (fly, helikoptre, seilfly) vist direkte på kartet med ikoner og info-popup.', 'implementert', '2025-02-15', '2025-02-28'),
  ('DJI Cloud flylogg-import', 'Automatisk import av flylogg fra DJI Cloud med lagring av innlogging (kryptert) for enklere bruk.', 'implementert', '2025-02-20', '2025-03-05'),
  ('Dronetag-integrasjon', 'Remote ID via Dronetag — registrering av enheter, live-posisjon på kart og kobling til droner.', 'implementert', '2025-02-01', '2025-02-25'),
  ('Oppdragshåndtering med ressurser', 'Komplett oppdragssystem med tilknytning av droner, utstyr og personell. Inkluderer ressurskonfliktvarsling og KMZ-eksport.', 'implementert', '2025-01-15', '2025-02-20'),
  ('SORA risikovurdering', 'SORA-basert risikoanalyse med Ground Risk Class, Air Risk Class og befolkningstetthet. Genererer PDF-rapport.', 'implementert', '2025-02-05', '2025-03-02'),
  ('Kalenderabonnement (ICS)', 'ICS-feed for oppdrag og hendelser som kan abonneres på i Google Calendar, Apple Calendar, Outlook etc.', 'implementert', '2025-02-18', '2025-03-01'),
  ('Push-varsler (PWA)', 'Web push-notifikasjoner for oppdragspåminnelser, vedlikeholdsvarsler og dokumentutløp.', 'implementert', '2025-02-12', '2025-03-03'),
  ('Flerspråklig støtte (NO/EN)', 'Fullstendig i18n med norsk og engelsk grensesnitt. Språkbytte via header.', 'implementert', '2025-02-25', '2025-03-04'),
  ('Offline-modus og caching', 'Service worker med offline-cache, React Query-persistering og offline-kø for mutasjoner.', 'implementert', '2025-02-08', '2025-02-28'),
  ('Driftstatus og endringslogg', 'Denne siden — viser systemstatus, vedlikeholdsmeldinger og fremdriftsplan. Redigerbar for superadmin.', 'implementert', '2025-03-06', '2025-03-07'),
  ('AI-basert risikovurdering', 'AI-drevet risikovurdering basert på oppdragsdata, vær og lokasjon. Genererer anbefalinger.', 'testing', '2025-03-01', NULL),
  ('Vedlikeholdsplanlegger med varsler', 'Automatiske e-postvarsler ved kommende vedlikeholdsfrister for droner og utstyr.', 'testing', '2025-02-28', NULL),
  ('Kompetansevarsel og utløpskontroll', 'Automatisk sjekk og varsling av utløpende kompetansebevis for personell.', 'pågår', '2025-03-03', NULL),
  ('Bulk e-postutsending', 'Masseutsending av e-post til brukere/kunder med maler og vedlegg fra dokumentbiblioteket.', 'implementert', '2025-02-22', '2025-03-05');
