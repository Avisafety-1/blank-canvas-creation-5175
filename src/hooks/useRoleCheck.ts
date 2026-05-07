import { useAuth } from '@/contexts/AuthContext';

const roleHierarchy = ['bruker', 'administrator', 'superadmin'];

const normalizeRole = (role: string | null): string | null => {
  if (!role) return null;
  if (role === 'admin') return 'administrator';
  return role;
};

export const useRoleCheck = () => {
  const { userRole } = useAuth();

  const hasRole = (requiredRole: string): boolean => {
    const normalizedUserRole = normalizeRole(userRole);
    const normalizedRequiredRole = normalizeRole(requiredRole);

    if (!normalizedUserRole || !normalizedRequiredRole) return false;

    const userLevel = roleHierarchy.indexOf(normalizedUserRole);
    const requiredLevel = roleHierarchy.indexOf(normalizedRequiredRole);
    return userLevel >= requiredLevel;
  };

  return {
    userRole,
    hasRole,
    isAdmin: hasRole('administrator'),
    isSuperAdmin: hasRole('superadmin'),
  };
};
