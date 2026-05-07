import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isLoginDomain, isAppDomain, isProductionDomain, redirectToLogin, redirectToApp } from '@/config/domains';

interface DomainGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

/**
 * DomainGuard ensures users are on the correct domain based on authentication state.
 * - Login domain (login.avisafe.no): For unauthenticated users
 * - App domain (app.avisafe.no): For authenticated users
 * - Development: No domain restrictions
 * 
 * IMPORTANT: Does NOT redirect during auth refresh or before auth is initialized.
 * A transient null session during token refresh is NOT treated as a real sign-out.
 */
export const DomainGuard = ({ children, requireAuth = true }: DomainGuardProps) => {
  const { user, session, loading, authRefreshing, authInitialized } = useAuth();
  const location = useLocation();
  
  const isAuthPage = location.pathname === '/auth' || location.pathname === '/reset-password';

  useEffect(() => {
    if (!isProductionDomain() || loading) return;
    if (!navigator.onLine) return;
    if (isAuthPage) return;

    // Don't redirect until auth system is fully initialized
    if (!authInitialized) return;
    // Don't redirect while a refresh is in progress — session may be transiently null
    if (authRefreshing) return;

    // User logged in on login domain → redirect to app domain
    if (user && isLoginDomain()) {
      console.log('DomainGuard: User logged in on login domain, redirecting to app domain');
      redirectToApp('/');
      return;
    }

    // User NOT logged in and on app domain → redirect to login
    // Only redirect when we are CERTAIN user is signed out (auth initialized, not refreshing, no session, no user)
    if (!user && !session && isAppDomain() && requireAuth) {
      console.log('DomainGuard: User confirmed signed out on app domain, redirecting to login');
      redirectToLogin('/auth');
      return;
    }
  }, [user, session, loading, requireAuth, isAuthPage, authRefreshing, authInitialized]);

  // Development — no domain restrictions
  if (!isProductionDomain()) return <>{children}</>;

  // Auth page — let Auth.tsx handle its own redirects
  if (isAuthPage) return <>{children}</>;

  // Not yet initialized — keep rendering children (cached state) to avoid flash
  if (!authInitialized) return <>{children}</>;

  // Refreshing — keep rendering children, don't blank the screen
  if (loading || authRefreshing) return <>{children}</>;

  // User on login domain while logged in — will redirect
  if (user && isLoginDomain()) return null;

  // User confirmed signed out on app domain — will redirect
  if (!user && !session && isAppDomain() && requireAuth) return null;

  return <>{children}</>;
};
