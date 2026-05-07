-- Set billing_user_id for existing companies that have a subscription
-- The first administrator in the company becomes the billing owner
UPDATE companies SET billing_user_id = (
  SELECT p.id FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.id
  WHERE p.company_id = companies.id
    AND p.approved = true
    AND ur.role IN ('administrator', 'admin', 'superadmin')
  LIMIT 1
) WHERE billing_user_id IS NULL;