-- Re-create the profile for the orphaned auth user
INSERT INTO profiles (id, email, company_id, approved, created_at)
SELECT 
  'e884cc5f-7b38-46a8-9d35-762bec5c0a94',
  'contact@hh-vr.com',
  '4359f33b-e74a-4bac-8e5b-096f46c21742',
  false,
  '2025-12-19 13:55:52.133182+00'
WHERE NOT EXISTS (
  SELECT 1 FROM profiles WHERE id = 'e884cc5f-7b38-46a8-9d35-762bec5c0a94'
);