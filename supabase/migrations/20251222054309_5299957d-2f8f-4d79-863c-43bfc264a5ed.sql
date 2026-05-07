-- Delete orphaned user roles that don't have a matching profile
DELETE FROM user_roles 
WHERE user_id NOT IN (SELECT id FROM profiles);