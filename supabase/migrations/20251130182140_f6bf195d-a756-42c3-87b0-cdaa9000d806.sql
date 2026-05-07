
-- Create approved profile for hauggard@gmail.com (role already exists)
INSERT INTO profiles (id, email, full_name, company_id, approved, approved_at, approved_by)
VALUES (
  'fee3165c-2573-4a54-b4a6-dae61c05a167',
  'hauggard@gmail.com',
  'Hauggard',
  'a6698b2d-8464-4f88-9bc4-ebcc072f629d', -- Avisafe company
  true,
  NOW(),
  'fee3165c-2573-4a54-b4a6-dae61c05a167' -- Self-approved for initial setup
)
ON CONFLICT (id) DO UPDATE
SET 
  approved = true,
  approved_at = NOW(),
  company_id = 'a6698b2d-8464-4f88-9bc4-ebcc072f629d';
