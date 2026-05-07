-- Step 2: Update existing roles to new system
-- Map old roles to new ones
UPDATE user_roles SET role = 'operatør' WHERE role = 'operativ_leder';
UPDATE user_roles SET role = 'operatør' WHERE role = 'pilot';
UPDATE user_roles SET role = 'operatør' WHERE role = 'tekniker';