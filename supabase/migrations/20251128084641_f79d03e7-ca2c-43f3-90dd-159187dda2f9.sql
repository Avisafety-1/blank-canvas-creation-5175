-- Set user as approved and superadmin
-- User ID from auth logs: fee3165c-2573-4a54-b4a6-dae61c05a167

-- First, insert or update the profile
INSERT INTO profiles (id, full_name, company_id, approved)
VALUES (
  'fee3165c-2573-4a54-b4a6-dae61c05a167',
  'Gard Haug-Hansen',
  (SELECT id FROM companies WHERE navn = 'Avisafe' LIMIT 1),
  true
)
ON CONFLICT (id) DO UPDATE
SET approved = true,
    approved_at = now();

-- Add superadmin role
INSERT INTO user_roles (user_id, role)
VALUES ('fee3165c-2573-4a54-b4a6-dae61c05a167', 'superadmin')
ON CONFLICT (user_id, role) DO NOTHING;