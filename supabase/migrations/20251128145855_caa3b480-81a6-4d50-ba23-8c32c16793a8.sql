-- Step 1: Add new roles to the enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'operatør';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'saksbehandler';