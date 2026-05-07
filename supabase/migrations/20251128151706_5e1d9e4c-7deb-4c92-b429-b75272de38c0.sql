-- Opprett manglende profil for gard@avisafe.no
INSERT INTO public.profiles (id, full_name, company_id, approved)
VALUES (
  'd6747977-b8e9-4ee0-a618-c305f22f52a2',
  'Gard',
  'a6698b2d-8464-4f88-9bc4-ebcc072f629d',
  false
)
ON CONFLICT (id) DO NOTHING;

-- Opprett notification preferences
INSERT INTO public.notification_preferences (user_id)
VALUES ('d6747977-b8e9-4ee0-a618-c305f22f52a2')
ON CONFLICT (user_id) DO NOTHING;