
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn FROM public.companies
)
UPDATE public.companies c
SET
  navn = 'Testbedrift ' || n.rn,
  org_nummer = LPAD((900000000 + n.rn)::text, 9, '0'),
  adresse = 'Testveien ' || n.rn || ', 0001 Testby',
  kontakt_epost = 'kontakt+company' || n.rn || '@pentest.test',
  kontakt_telefon = '+47 900' || LPAD((10000 + n.rn)::text, 5, '0'),
  registration_code = 'TEST-' || LPAD(n.rn::text, 4, '0'),
  flighthub2_token = NULL, flighthub2_base_url = NULL,
  dronelog_api_key = NULL, adresse_lat = NULL, adresse_lon = NULL,
  before_takeoff_checklist_id = NULL, before_takeoff_checklist_ids = NULL
FROM numbered n WHERE c.id = n.id;

UPDATE public.profiles SET
  full_name = 'Test Bruker ' || SUBSTR(md5(id::text), 1, 6),
  email = 'user-' || SUBSTR(md5(id::text), 1, 8) || '@pentest.test',
  telefon = '+47 4' || SUBSTR(md5(id::text), 1, 7),
  adresse = NULL, tittel = NULL,
  "nødkontakt_navn" = NULL, "nødkontakt_telefon" = NULL,
  avatar_url = NULL, signature_url = NULL, uas_operator_number = NULL;

UPDATE public.customers SET
  navn = 'Testkunde ' || SUBSTR(md5(id::text), 1, 6),
  kontaktperson = 'Kontakt ' || SUBSTR(md5(id::text), 1, 5),
  telefon = '+47 9' || SUBSTR(md5(id::text), 1, 7),
  epost = 'customer-' || SUBSTR(md5(id::text), 1, 8) || '@pentest.test',
  adresse = 'Kundeveien 1, 0001 Testby', merknader = NULL;

UPDATE public.incidents SET
  tittel = 'Hendelse ' || COALESCE(incident_number, SUBSTR(md5(id::text), 1, 6)),
  beskrivelse = '[anonymisert beskrivelse]',
  lokasjon = '[anonymisert]',
  rapportert_av = NULL, bilde_url = NULL, pilot_id = NULL;

UPDATE public.incident_comments SET
  comment_text = '[anonymisert kommentar]',
  created_by_name = '[anonymisert]';

UPDATE public.personnel_competencies SET
  navn = 'Kompetanse ' || SUBSTR(md5(id::text), 1, 6),
  beskrivelse = NULL, fil_url = NULL;

TRUNCATE TABLE
  public.bulk_email_campaigns, public.newsletter_broadcasts,
  public.newsletter_templates, public.weekly_report_sends,
  public.email_template_attachments, public.email_templates,
  public.marketing_drafts, public.marketing_content_ideas,
  public.marketing_media, public.revenue_calculator_scenarios
RESTART IDENTITY CASCADE;

TRUNCATE TABLE
  public.company_fh2_credentials, public.dji_credentials,
  public.eccairs_integrations, public.eccairs_exports,
  public.linkedin_tokens, public.dronetag_devices,
  public.dronetag_positions, public.safesky_beacons,
  public.passkeys, public.push_subscriptions
RESTART IDENTITY CASCADE;

UPDATE public.training_course_folders SET created_by = NULL WHERE created_by IS NOT NULL;
UPDATE public.drones SET
  operations_checklist_id = NULL,
  post_flight_checklist_id = NULL,
  sjekkliste_id = NULL
WHERE operations_checklist_id IS NOT NULL
   OR post_flight_checklist_id IS NOT NULL
   OR sjekkliste_id IS NOT NULL;
UPDATE public.equipment SET sjekkliste_id = NULL WHERE sjekkliste_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._pentest_purge_users()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  DELETE FROM auth.users;
  DELETE FROM public.profiles;
  DELETE FROM public.user_roles;
  DELETE FROM public.user_companies;
END $$;
SELECT public._pentest_purge_users();
DROP FUNCTION public._pentest_purge_users();

DO $$
DECLARE c1 uuid; c2 uuid; sub uuid;
BEGIN
  SELECT id INTO c1 FROM public.companies ORDER BY created_at LIMIT 1;
  IF c1 IS NULL THEN
    INSERT INTO public.companies (navn, registration_code, kontakt_epost, kontakt_telefon, adresse)
    VALUES ('Testbedrift 1', 'TEST-0001', 'kontakt+company1@pentest.test', '+47 90010001', 'Testveien 1, 0001 Testby')
    RETURNING id INTO c1;
  END IF;

  SELECT id INTO c2 FROM public.companies WHERE id <> c1 AND parent_company_id IS NULL ORDER BY created_at LIMIT 1;
  IF c2 IS NULL THEN
    INSERT INTO public.companies (navn, registration_code, kontakt_epost, kontakt_telefon, adresse)
    VALUES ('Testbedrift 2', 'TEST-0002', 'kontakt+company2@pentest.test', '+47 90010002', 'Testveien 2, 0002 Testby')
    RETURNING id INTO c2;
  END IF;

  UPDATE public.companies SET navn='Testbedrift 1', registration_code='TEST-0001', parent_company_id=NULL WHERE id=c1;
  UPDATE public.companies SET navn='Testbedrift 2', registration_code='TEST-0002', parent_company_id=NULL WHERE id=c2;

  UPDATE public.companies SET parent_company_id = c1
  WHERE id NOT IN (c1, c2) AND parent_company_id IS NULL;

  SELECT id INTO sub FROM public.companies WHERE parent_company_id = c1 ORDER BY created_at LIMIT 1;
  IF sub IS NULL THEN
    INSERT INTO public.companies (navn, registration_code, parent_company_id, kontakt_epost, kontakt_telefon, adresse)
    VALUES ('Testbedrift 1 - Underavdeling', 'TEST-0001-SUB', c1, 'kontakt+sub@pentest.test', '+47 90010003', 'Testveien 3, 0001 Testby')
    RETURNING id INTO sub;
  ELSE
    UPDATE public.companies SET navn='Testbedrift 1 - Underavdeling', registration_code='TEST-0001-SUB' WHERE id=sub;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._pentest_create_user(
  p_email text, p_password text, p_full_name text, p_role public.app_role, p_company_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions AS $$
DECLARE v_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    jsonb_build_object('provider','email','providers',ARRAY['email']),
    jsonb_build_object('full_name', p_full_name),
    '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  INSERT INTO public.profiles (id, full_name, email, company_id, approved, approved_at)
  VALUES (v_user_id, p_full_name, p_email, p_company_id, true, now())
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name, email = EXCLUDED.email,
    company_id = EXCLUDED.company_id, approved = true, approved_at = now();

  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, p_role) ON CONFLICT DO NOTHING;

  INSERT INTO public.user_companies (user_id, company_id, role)
  VALUES (v_user_id, p_company_id,
    CASE WHEN p_role = 'superadmin' THEN 'admin' ELSE p_role::text END)
  ON CONFLICT DO NOTHING;

  RETURN v_user_id;
END $$;

DO $$
DECLARE c1 uuid; c2 uuid; sub uuid;
BEGIN
  SELECT id INTO c1 FROM public.companies WHERE registration_code='TEST-0001';
  SELECT id INTO c2 FROM public.companies WHERE registration_code='TEST-0002';
  SELECT id INTO sub FROM public.companies WHERE registration_code='TEST-0001-SUB';

  PERFORM public._pentest_create_user('superadmin@pentest.test', 'Pentest!Super2026', 'Super Admin', 'superadmin'::public.app_role, c1);
  PERFORM public._pentest_create_user('admin-a@pentest.test', 'Pentest!AdminA26', 'Admin Selskap A', 'admin'::public.app_role, c1);
  PERFORM public._pentest_create_user('user-a@pentest.test', 'Pentest!UserA26', 'Bruker Selskap A', 'bruker'::public.app_role, c1);
  PERFORM public._pentest_create_user('admin-b@pentest.test', 'Pentest!AdminB26', 'Admin Selskap B', 'admin'::public.app_role, c2);
  PERFORM public._pentest_create_user('user-b@pentest.test', 'Pentest!UserB26', 'Bruker Selskap B', 'bruker'::public.app_role, c2);
  PERFORM public._pentest_create_user('user-sub@pentest.test', 'Pentest!Sub26', 'Bruker Underavd', 'bruker'::public.app_role, sub);
END $$;

DROP FUNCTION public._pentest_create_user(text, text, text, public.app_role, uuid);
