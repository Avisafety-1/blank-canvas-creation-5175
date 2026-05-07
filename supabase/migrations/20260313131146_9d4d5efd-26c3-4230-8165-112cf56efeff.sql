-- Convert all legacy 'admin' roles to 'administrator'
UPDATE user_roles SET role = 'administrator' WHERE role = 'admin';