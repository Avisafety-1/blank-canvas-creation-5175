// Domain configuration for AviSafe
export const LOGIN_DOMAIN = 'login.avisafe.no';
export const APP_DOMAIN = 'app.avisafe.no';

/**
 * Check if current hostname is the login domain
 */
export const isLoginDomain = (): boolean => {
  return window.location.hostname === LOGIN_DOMAIN;
};

/**
 * Check if current hostname is the app domain
 */
export const isAppDomain = (): boolean => {
  return window.location.hostname === APP_DOMAIN;
};

/**
 * Check if running in production (custom domains)
 */
export const isProductionDomain = (): boolean => {
  return isLoginDomain() || isAppDomain();
};

/**
 * Check if running in development (localhost or preview)
 */
export const isDevelopment = (): boolean => {
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname.includes('lovableproject.com');
};

/**
 * Build URL for login domain
 */
export const getLoginUrl = (path: string = '/'): string => {
  if (isDevelopment()) {
    return path;
  }
  return `https://${LOGIN_DOMAIN}${path}`;
};

/**
 * Build URL for app domain
 */
export const getAppUrl = (path: string = '/'): string => {
  if (isDevelopment()) {
    return path;
  }
  return `https://${APP_DOMAIN}${path}`;
};

/**
 * Redirect to login domain
 */
export const redirectToLogin = (path: string = '/auth') => {
  const url = getLoginUrl(path);
  window.location.href = url;
};

/**
 * Redirect to app domain
 */
export const redirectToApp = (path: string = '/') => {
  const url = getAppUrl(path);
  window.location.href = url;
};
