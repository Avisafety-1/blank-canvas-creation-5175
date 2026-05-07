import { createContext, useContext, useEffect, useState, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, ensureFreshSession } from "@/integrations/supabase/client";
import { broadcastSession, broadcastSignOut, onTabMessage, type TabSyncMessage } from "@/lib/authTabSync";
import type { PlanId, AddonId } from "@/config/subscriptionPlans";
import { normalizeTrainingModules, type TrainingModuleKey } from "@/config/trainingModules";

export type CompanyType = 'droneoperator' | 'flyselskap' | null;

const PROFILE_CACHE_KEY = (userId: string) => `avisafe_user_profile_${userId}`;
const SESSION_CACHE_KEY = 'avisafe_session_cache';

interface CachedSession {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

interface CachedProfile {
  companyId: string | null;
  companyName: string | null;
  parentCompanyId: string | null;
  parentCompanyName: string | null;
  companyType: CompanyType;
  companyLat: number | null;
  companyLon: number | null;
  isApproved: boolean;
  userRole: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
   djiFlightlogEnabled: boolean;
  ardupilotFlightlogEnabled: boolean;
  stripeExempt: boolean;
  departmentsEnabled: boolean;
  accessibleCompanies?: AccessibleCompany[];
  underTraining?: boolean;
  trainingModuleAccess?: TrainingModuleKey[];
  cachedAt?: number;
}

export interface AccessibleCompany {
  id: string;
  name: string;
  isParent: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  companyId: string | null;
  companyName: string | null;
  parentCompanyId: string | null;
  parentCompanyName: string | null;
  companyType: CompanyType;
  companyLat: number | null;
  companyLon: number | null;
  isSuperAdmin: boolean;
  djiFlightlogEnabled: boolean;
  ardupilotFlightlogEnabled: boolean;
  departmentsEnabled: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  profileLoaded: boolean;
  userRole: string | null;
  subscribed: boolean;
  subscriptionEnd: string | null;
  subscriptionLoading: boolean;
  cancelAtPeriodEnd: boolean;
  isTrial: boolean;
  trialEnd: string | null;
  stripeExempt: boolean;
  hadPreviousSubscription: boolean;
  subscriptionPlan: PlanId | null;
  subscriptionAddons: AddonId[];
  isBillingOwner: boolean;
  seatCount: number;
  accessibleCompanies: AccessibleCompany[];
  underTraining: boolean;
  trainingModuleAccess: TrainingModuleKey[];
  hasTrainingModuleAccess: (moduleKey: TrainingModuleKey) => boolean;
  authRefreshing: boolean;
  authInitialized: boolean;
  signOut: () => Promise<void>;
  refetchUserInfo: () => Promise<void>;
  checkSubscription: () => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
  ensureValidToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  companyId: null,
  companyName: null,
  parentCompanyId: null,
  parentCompanyName: null,
  companyType: null,
  companyLat: null,
  companyLon: null,
  isSuperAdmin: false,
  djiFlightlogEnabled: false,
  ardupilotFlightlogEnabled: false,
  departmentsEnabled: false,
  isAdmin: false,
  isApproved: false,
  profileLoaded: false,
  userRole: null,
  subscribed: false,
  subscriptionEnd: null,
  subscriptionLoading: true,
  cancelAtPeriodEnd: false,
  isTrial: false,
  trialEnd: null,
  stripeExempt: false,
  hadPreviousSubscription: false,
  subscriptionPlan: null,
  subscriptionAddons: [],
  isBillingOwner: false,
  seatCount: 1,
  accessibleCompanies: [],
  underTraining: false,
  trainingModuleAccess: [],
  hasTrainingModuleAccess: () => true,
  authRefreshing: false,
  authInitialized: false,
  signOut: async () => {},
  refetchUserInfo: async () => {},
  checkSubscription: async () => {},
  switchCompany: async () => {},
  ensureValidToken: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [authRefreshing, setAuthRefreshing] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);

  // Version-based concurrency control: only the latest refresh writes state
  const refreshVersionRef = useRef(0);
  // Cache for getUser() to prevent call storms
  const getUserCacheRef = useRef<{ data: any; timestamp: number } | null>(null);
  // Flag to suppress onAuthStateChange echoes caused by cross-tab setSession
  const ignoreNextAuthEventRef = useRef(false);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [parentCompanyId, setParentCompanyId] = useState<string | null>(null);
  const [parentCompanyName, setParentCompanyName] = useState<string | null>(null);
  const [companyType, setCompanyType] = useState<CompanyType>(null);
  const [companyLat, setCompanyLat] = useState<number | null>(null);
  const [companyLon, setCompanyLon] = useState<number | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [djiFlightlogEnabled, setDjiFlightlogEnabled] = useState(false);
  const [ardupilotFlightlogEnabled, setArdupilotFlightlogEnabled] = useState(false);
  const [departmentsEnabled, setDepartmentsEnabled] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [trialEnd, setTrialEnd] = useState<string | null>(null);
  const [stripeExempt, setStripeExempt] = useState(false);
  const [hadPreviousSubscription, setHadPreviousSubscription] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState<PlanId | null>(null);
  const [subscriptionAddons, setSubscriptionAddons] = useState<AddonId[]>([]);
  const [isBillingOwner, setIsBillingOwner] = useState(false);
  const [seatCount, setSeatCount] = useState(1);
  const [accessibleCompanies, setAccessibleCompanies] = useState<AccessibleCompany[]>([]);
  const [underTraining, setUnderTraining] = useState(false);
  const [trainingModuleAccess, setTrainingModuleAccess] = useState<TrainingModuleKey[]>([]);

  const resetAuthState = () => {
    setSession(null);
    setUser(null);
    setCompanyId(null);
    setCompanyName(null);
    setParentCompanyId(null);
    setParentCompanyName(null);
    setCompanyType(null);
    setCompanyLat(null);
    setCompanyLon(null);
    setIsSuperAdmin(false);
    setIsAdmin(false);
    setIsApproved(false);
    setProfileLoaded(false);
    setDjiFlightlogEnabled(false);
    setArdupilotFlightlogEnabled(false);
    setDepartmentsEnabled(false);
    setUserRole(null);
    setStripeExempt(false);
    setSubscribed(false);
    setSubscriptionEnd(null);
    setCancelAtPeriodEnd(false);
    setIsTrial(false);
    setTrialEnd(null);
    setHadPreviousSubscription(false);
    setSubscriptionPlan(null);
    setSubscriptionAddons([]);
    setIsBillingOwner(false);
    setSeatCount(1);
    setAccessibleCompanies([]);
    setUnderTraining(false);
    setTrainingModuleAccess([]);
  };

  const getErrorMessage = (error: unknown): string => {
    if (!error) return '';
    if (typeof error === 'string') return error;

    const err = error as {
      message?: string;
      code?: string;
      context?: { error?: string; json?: { error?: string } };
      error_description?: string;
    };

    return [
      err.message,
      err.error_description,
      err.context?.error,
      err.context?.json?.error,
      err.code,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  };

  const isMissingAuthUserError = (error: unknown): boolean => {
    const message = getErrorMessage(error);
    return message.includes('user from sub claim in jwt does not exist') || message.includes('user_not_found');
  };

  const clearLocalAuthData = async (userId?: string) => {
    try {
      let cachedUserId = userId;
      if (!cachedUserId) {
        const raw = localStorage.getItem(SESSION_CACHE_KEY);
        if (raw) {
          const cached: CachedSession = JSON.parse(raw);
          cachedUserId = cached.id;
        }
      }

      localStorage.removeItem(SESSION_CACHE_KEY);
      getUserCacheRef.current = null;

      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // ignore localStorage errors
    }

    resetAuthState();

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore - local clean-up above is enough
    }
  };

  const applyCachedProfile = (userId: string): boolean => {
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY(userId));
      if (!raw) return false;

      const cached: CachedProfile = JSON.parse(raw);
      setCompanyId(cached.companyId);
      setCompanyName(cached.companyName);
      setParentCompanyId(cached.parentCompanyId ?? null);
      setParentCompanyName(cached.parentCompanyName ?? null);
      setCompanyType(cached.companyType);
      setCompanyLat(cached.companyLat);
      setCompanyLon(cached.companyLon);
      setIsApproved(cached.isApproved);
      setUserRole(cached.userRole);
      setIsAdmin(cached.isAdmin);
      setIsSuperAdmin(cached.isSuperAdmin);
      setDjiFlightlogEnabled(cached.djiFlightlogEnabled ?? false);
      setArdupilotFlightlogEnabled(cached.ardupilotFlightlogEnabled ?? false);
      setDepartmentsEnabled(cached.departmentsEnabled ?? false);
      setStripeExempt(cached.stripeExempt ?? false);
      setUnderTraining(cached.underTraining ?? false);
      setTrainingModuleAccess(normalizeTrainingModules(cached.trainingModuleAccess));
      if (cached.accessibleCompanies?.length) {
        setAccessibleCompanies(cached.accessibleCompanies);
      }
      setProfileLoaded(true);
      console.log('AuthContext: Applied cached profile for offline use');
      return true;
    } catch {
      return false;
    }
  };

  const saveCachedProfile = (userId: string, profile: CachedProfile) => {
    try {
      const withTimestamp = { ...profile, cachedAt: Date.now() };
      localStorage.setItem(PROFILE_CACHE_KEY(userId), JSON.stringify(withTimestamp));
    } catch {
      // localStorage full - ignore
    }
  };

  const CACHE_FRESH_MS = 5 * 60_000; // 5 minutes

  /**
   * Check if a session's access token is stale (expired or expiring within bufferSec).
   * Used to force a refresh before marking auth as initialized.
   */
  const isTokenStale = (session: Session, bufferSec = 60): boolean => {
    if (!session.expires_at) return true;
    return session.expires_at * 1000 - Date.now() < bufferSec * 1000;
  };

  const isCacheFresh = (userId: string): boolean => {
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY(userId));
      if (!raw) return false;
      const cached: CachedProfile = JSON.parse(raw);
      if (!cached.cachedAt) return false;
      return Date.now() - cached.cachedAt < CACHE_FRESH_MS;
    } catch {
      return false;
    }
  };

  const cacheSession = (user: User) => {
    try {
      const cached: CachedSession = {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
        app_metadata: user.app_metadata,
      };
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cached));
    } catch {
      // localStorage full - ignore
    }
  };

  const restoreFromCache = (): boolean => {
    try {
      const raw = localStorage.getItem(SESSION_CACHE_KEY);
      if (!raw) return false;
      const cached: CachedSession = JSON.parse(raw);
      if (!cached.id) return false;
      setUser(cached as unknown as User);
      applyCachedProfile(cached.id);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Central auth state refresh. Fetches profile, role, accessible companies,
   * and subscription status in parallel. Uses version-based concurrency control
   * so only the LATEST refresh request can write state — prevents stale async
   * writes from overwriting fresh data.
   *
   * IMPORTANT: Does NOT nullify profile/company/subscription while refreshing.
   * Existing state stays intact until new data arrives.
   */
  const refreshAuthState = async (userId: string, reason: string = 'unknown') => {
    const myVersion = ++refreshVersionRef.current;
    setAuthRefreshing(true);
    console.log(`AuthContext: refreshAuthState v${myVersion} (${reason})`);

    // Fire-and-forget background user validation (deleted user check)
    // Only run on sign-in and visibility-return to avoid hammering /user endpoint
    const shouldCheckUser = ['signed-in', 'visibility', 'online', 'initial-session'].includes(reason);
    if (shouldCheckUser) {
      const backgroundUserCheck = async () => {
        try {
          const now = Date.now();
          const cached = getUserCacheRef.current;
          let userError: any = null;
          if (cached && now - cached.timestamp < 10_000) {
            userError = cached.data.error;
          } else {
            const result = await supabase.auth.getUser();
            getUserCacheRef.current = { data: result, timestamp: now };
            userError = result.error;
          }
          if (userError && isMissingAuthUserError(userError)) {
            console.warn('AuthContext: Stale session for deleted user, clearing');
            await clearLocalAuthData(userId);
          }
        } catch {
          // Network error — ignore
        }
      };
      backgroundUserCheck();
    }

    try {
      // === PHASE 1: Fast queries (profile, role, accessible companies) ===
      const [profileResult, roleResult, accessibleResult, passedTrainingResult] = await Promise.all([
        supabase
          .from('profiles')
          .select(`
            company_id,
            approved,
            under_training,
            training_module_access,
            companies (
              id,
              navn,
              selskapstype,
              adresse_lat,
              adresse_lon,
              dji_flightlog_enabled,
              ardupilot_enabled,
              dronelog_api_key,
              stripe_exempt,
              parent_company_id,
              departments_enabled
            )
          `)
          .eq('id', userId)
          .single(),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase.rpc('get_user_accessible_companies', { _user_id: userId }),
        supabase
          .from('training_assignments')
          .select('training_courses(unlocks_modules)')
          .eq('profile_id', userId)
          .eq('passed', true),
      ]);

      // Stale write guard — if a newer refresh has started, discard this result
      if (myVersion !== refreshVersionRef.current) {
        console.log(`AuthContext: refreshAuthState v${myVersion} superseded by v${refreshVersionRef.current}, discarding`);
        return;
      }

      // --- Build profile data ---
      // Preserve current state as fallback so transient failures don't reset approval
      let profileData: CachedProfile = {
        companyId: companyId,
        companyName: companyName,
        parentCompanyId: parentCompanyId,
        parentCompanyName: parentCompanyName,
        companyType: 'droneoperator',
        companyLat: null,
        companyLon: null,
        isApproved: isApproved,
        userRole: userRole,
        isAdmin: isAdmin,
        isSuperAdmin: isSuperAdmin,
        djiFlightlogEnabled: false,
        ardupilotFlightlogEnabled: false,
        stripeExempt: false,
        departmentsEnabled: false,
        underTraining: false,
        trainingModuleAccess: [],
      };

      if (profileResult.error && roleResult.error) {
        console.log('AuthContext: Both profile+role queries failed, using cached profile');
        applyCachedProfile(userId);
        // Still fire subscription check in background
        fireSubscriptionCheck(userId, myVersion, profileData.stripeExempt, profileData.companyId);
        return;
      }

      const company = profileResult.data?.companies as any;
      const resolvedParentCompanyId = company?.parent_company_id;

      if (profileResult.data) {
        const profile = profileResult.data;
        profileData.companyId = profile.company_id;
        profileData.isApproved = profile.approved ?? false;
        profileData.underTraining = (profile as any).under_training ?? false;
        profileData.trainingModuleAccess = normalizeTrainingModules((profile as any).training_module_access);
        profileData.companyName = company?.navn || null;
        profileData.parentCompanyId = resolvedParentCompanyId || null;
        profileData.parentCompanyName = null;
        profileData.companyType = company?.selskapstype || 'droneoperator';
        profileData.companyLat = company?.adresse_lat || null;
        profileData.companyLon = company?.adresse_lon || null;
        profileData.djiFlightlogEnabled = company?.dji_flightlog_enabled ?? false;
        profileData.ardupilotFlightlogEnabled = company?.ardupilot_enabled ?? false;
        profileData.stripeExempt = company?.stripe_exempt ?? false;
        profileData.departmentsEnabled = company?.departments_enabled ?? false;

        // Inherit parent company settings if needed
        if (resolvedParentCompanyId) {
          try {
            const { data: parentCompany } = await supabase
              .from('companies')
              .select('navn, stripe_exempt, dji_flightlog_enabled, dji_auto_sync_enabled, dronelog_api_key, eccairs_enabled, dronetag_enabled, ardupilot_enabled')
              .eq('id', resolvedParentCompanyId)
              .single();
            // Re-check version after await
            if (myVersion !== refreshVersionRef.current) return;
            if (parentCompany) {
              profileData.parentCompanyName = (parentCompany as any).navn || null;
              profileData.stripeExempt = parentCompany.stripe_exempt ?? profileData.stripeExempt;
              profileData.djiFlightlogEnabled = parentCompany.dji_flightlog_enabled ?? profileData.djiFlightlogEnabled;
              console.log('AuthContext: Inherited settings from parent company', resolvedParentCompanyId);
            }
          } catch { /* ignore */ }
        }
      }

      if (roleResult.data) {
        profileData.userRole = roleResult.data.role;
        profileData.isSuperAdmin = roleResult.data.role === 'superadmin';
        profileData.isAdmin = ['administrator', 'admin'].includes(roleResult.data.role) || roleResult.data.role === 'superadmin';
      } else if (roleResult.error) {
        console.warn('AuthContext: Role query failed, keeping previous role state');
        profileData.userRole = userRole;
        profileData.isSuperAdmin = isSuperAdmin;
        profileData.isAdmin = isAdmin;
      }

      if (!passedTrainingResult.error && passedTrainingResult.data) {
        const unlockedModules = (passedTrainingResult.data || []).flatMap((assignment: any) =>
          normalizeTrainingModules(assignment.training_courses?.unlocks_modules)
        );
        profileData.trainingModuleAccess = normalizeTrainingModules([
          ...(profileData.trainingModuleAccess || []),
          ...unlockedModules,
        ]);
      }

      // Final stale-write check before applying state
      if (myVersion !== refreshVersionRef.current) return;

      // --- Apply Phase 1 state immediately ---
      setCompanyId(profileData.companyId);
      setCompanyName(profileData.companyName);
      setParentCompanyId(profileData.parentCompanyId);
      setParentCompanyName(profileData.parentCompanyName);
      setCompanyType(profileData.companyType);
      setCompanyLat(profileData.companyLat);
      setCompanyLon(profileData.companyLon);
      setIsApproved(profileData.isApproved);
      setUserRole(profileData.userRole);
      setIsAdmin(profileData.isAdmin);
      setIsSuperAdmin(profileData.isSuperAdmin);
      setDjiFlightlogEnabled(profileData.djiFlightlogEnabled);
      setArdupilotFlightlogEnabled(profileData.ardupilotFlightlogEnabled);
      setDepartmentsEnabled(profileData.departmentsEnabled);
      setStripeExempt(profileData.stripeExempt);
      setUnderTraining(profileData.underTraining ?? false);
      setTrainingModuleAccess(profileData.trainingModuleAccess ?? []);
      setProfileLoaded(true);

      // Apply accessible companies
      let companiesList: AccessibleCompany[] = [];
      if (!accessibleResult.error && accessibleResult.data) {
        companiesList = (accessibleResult.data || []).map((c: any) => ({
          id: c.company_id,
          name: c.company_name,
          isParent: c.is_parent,
        }));
        setAccessibleCompanies(companiesList);
      }

      // Save cache including accessible companies
      profileData.accessibleCompanies = companiesList.length > 0 ? companiesList : undefined;
      saveCachedProfile(userId, profileData);

      // Phase 1 done — mark auth as ready (UI can render company switcher, admin badges, etc.)
      setAuthRefreshing(false);
      setAuthInitialized(true);

      // === PHASE 2: Slow subscription check (non-blocking) ===
      fireSubscriptionCheck(userId, myVersion, profileData.stripeExempt, profileData.companyId);

      // Auto-provision DroneLog API key if needed
      if (
        profileData.djiFlightlogEnabled &&
        !company?.dronelog_api_key &&
        profileData.companyId &&
        profileData.isAdmin
      ) {
        console.log('AuthContext: Auto-provisioning DroneLog API key for company', profileData.companyId);
        try {
          await supabase.functions.invoke('manage-dronelog-key', {
            body: { companyId: profileData.companyId, enable: true, selfProvision: true },
          });
        } catch (provisionError) {
          console.error('AuthContext: Failed to auto-provision DroneLog key:', provisionError);
        }
      }
    } catch (error) {
      if (myVersion !== refreshVersionRef.current) return;
      console.error('refreshAuthState failed:', reason, error);
      if (!navigator.onLine) {
        applyCachedProfile(userId);
      }
      setAuthRefreshing(false);
      setAuthInitialized(true);
      setSubscriptionLoading(false);
    }
  };

  const SUB_CACHE_MAX_AGE_MS = 10 * 60_000; // 10 minutes

  /**
   * Phase 2: Fire subscription check in background, apply when ready.
   *
   * Optimization: For stripe_exempt companies we skip Stripe entirely.
   * For non-exempt companies we first try to read from the company_subscriptions
   * table (populated by stripe-webhook + check-subscription). Only if that cache
   * is stale (>10 min) or missing do we call the Edge Function (which hits Stripe).
   */
  const fireSubscriptionCheck = async (userId: string, myVersion: number, stripeExemptVal?: boolean, effectiveCompanyId?: string | null) => {
    // Use passed values (fresh from caller) or fall back to current state
    const exemptFlag = stripeExemptVal ?? stripeExempt;
    const resolvedCompanyId = effectiveCompanyId !== undefined ? effectiveCompanyId : companyId;

    // --- FAST PATH: stripe_exempt companies never need Stripe ---
    if (exemptFlag) {
      console.log('AuthContext: stripe_exempt — skipping subscription check');
      setSubscribed(true);
      setSubscriptionLoading(false);
      return;
    }

    // --- Try reading cached subscription from Supabase ---
    try {
      if (resolvedCompanyId) {
        // Resolve parent company for subscription lookup
        let subCompanyId = resolvedCompanyId;
        const { data: comp } = await supabase
          .from('companies')
          .select('parent_company_id')
          .eq('id', resolvedCompanyId)
          .single();
        if (myVersion !== refreshVersionRef.current) return;
        if (comp?.parent_company_id) {
          subCompanyId = comp.parent_company_id;
        }

        const { data: cachedSub } = await supabase
          .from('company_subscriptions')
          .select('*')
          .eq('company_id', subCompanyId)
          .maybeSingle();
        if (myVersion !== refreshVersionRef.current) return;

        if (cachedSub?.updated_at) {
          const age = Date.now() - new Date(cachedSub.updated_at).getTime();
          if (age < SUB_CACHE_MAX_AGE_MS) {
            console.log(`AuthContext: Using cached subscription (age ${Math.round(age / 1000)}s)`);
            const isActive = cachedSub.status === 'active' || cachedSub.status === 'trialing';
            applySubscriptionData({
              subscribed: isActive,
              plan: cachedSub.plan,
              seat_count: cachedSub.seat_count,
              addons: cachedSub.addons ?? [],
              subscription_end: cachedSub.current_period_end,
              cancel_at_period_end: cachedSub.cancel_at_period_end,
              is_trial: cachedSub.is_trial,
              trial_end: cachedSub.trial_end,
              had_previous_subscription: true,
              is_billing_owner: cachedSub.billing_user_id === userId,
            });
            return;
          }
          console.log(`AuthContext: Cached subscription stale (age ${Math.round(age / 1000)}s), calling Stripe`);
        }
      }
    } catch (e) {
      console.warn('AuthContext: Failed to read cached subscription, falling back to Edge Function', e);
    }

    // --- SLOW PATH: Call Edge Function (Stripe API) ---
    fireSubscriptionEdgeFunction(userId, myVersion);
  };

  /** Call the check-subscription Edge Function (Stripe API) */
  const fireSubscriptionEdgeFunction = (userId: string, myVersion: number) => {
    supabase.functions.invoke('check-subscription').then((result) => {
      if (myVersion !== refreshVersionRef.current) return;
      if (result.error) {
        console.error('check-subscription error:', result.error);
        if (isMissingAuthUserError(result.error)) {
          clearLocalAuthData(userId);
        }
        setSubscriptionLoading(false);
        return;
      }
      applySubscriptionData(result.data);
    }).catch((e) => {
      if (myVersion !== refreshVersionRef.current) return;
      console.error('check-subscription error:', e);
      if (isMissingAuthUserError(e)) {
        clearLocalAuthData(userId);
      }
      setSubscriptionLoading(false);
    });
  };

  /** Apply subscription data from check-subscription response */
  const applySubscriptionData = (data: any) => {
    if (!data) return;
    setSubscribed(data.subscribed ?? false);
    setSubscriptionEnd(data.subscription_end ?? null);
    setCancelAtPeriodEnd(data.cancel_at_period_end ?? false);
    setIsTrial(data.is_trial ?? false);
    setTrialEnd(data.trial_end ?? null);
    setHadPreviousSubscription(data.had_previous_subscription ?? false);
    setSubscriptionPlan(data.plan ?? null);
    setSubscriptionAddons(data.addons ?? []);
    setIsBillingOwner(data.is_billing_owner ?? false);
    setSeatCount(data.seat_count ?? 1);
    setSubscriptionLoading(false);
  };

  // --- Auth state change listener & initial session ---
  useEffect(() => {
    const lastHiddenAtRef_local = { current: 0 };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        lastHiddenAtRef_local.current = Date.now();
        return;
      }
      // Only act if away for >5 seconds (PWA background / tab switch)
      if (Date.now() - lastHiddenAtRef_local.current < 5_000) return;
      console.log('AuthContext: Returning from background, forcing session check');
      supabase.auth.getSession().then(({ data: { session: freshSession } }) => {
        if (freshSession?.user) {
          setSession(freshSession);
          setUser(freshSession.user);
          cacheSession(freshSession.user);
          refreshAuthState(freshSession.user.id, 'visibility');
        }
      }).catch(() => {});
    };

    const handleOnline = () => {
      console.log('AuthContext: Back online, forcing session check');
      supabase.auth.getSession().then(({ data: { session: freshSession } }) => {
        if (freshSession?.user) {
          setSession(freshSession);
          setUser(freshSession.user);
          cacheSession(freshSession.user);
          refreshAuthState(freshSession.user.id, 'online');
        }
      }).catch(() => {});
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // If this event was triggered by a cross-tab setSession, skip to avoid loops
        if (ignoreNextAuthEventRef.current) {
          ignoreNextAuthEventRef.current = false;
          console.log('AuthContext: Ignoring auth event triggered by cross-tab sync');
          return;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          setSession(session);
          setUser(session.user);
          setLoading(false);
          cacheSession(session.user);
          // Apply cached profile immediately for instant UI
          applyCachedProfile(session.user.id);
          try {
            localStorage.setItem('avisafe_last_activity', Date.now().toString());
          } catch {}
          // Broadcast to other tabs
          broadcastSession(session);
          if (navigator.onLine) {
            refreshAuthState(session.user.id, 'signed-in');
          }
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setSession(session);
          setUser(session.user);
          cacheSession(session.user);
          // Broadcast refreshed token to other tabs so they don't try to refresh
          broadcastSession(session);
          // Light refresh: token rotation does NOT require re-fetching profile/role/companies.
          // Only run background subscription check to keep billing status current.
          console.log('AuthContext: TOKEN_REFRESHED — light refresh (session+user only)');
          if (navigator.onLine) {
            const ver = ++refreshVersionRef.current;
            fireSubscriptionCheck(session.user.id, ver);
          }
        } else if (event === 'SIGNED_OUT') {
          if (!navigator.onLine) {
            console.log('AuthContext: Ignoring SIGNED_OUT while offline');
            return;
          }
          // Broadcast sign-out to other tabs
          broadcastSignOut();
          resetAuthState();
          setLoading(false);
          setAuthInitialized(true);
        } else {
          // Transient null session during token refresh — DO NOT reset state.
          // This is the key fix: a null session mid-refresh is NOT a real sign-out.
          if (!session && user && navigator.onLine) {
            console.log('AuthContext: Ignoring transient null session during token refresh (user still set)');
            return;
          }
          if (!session && !navigator.onLine) {
            console.log('AuthContext: Ignoring null session event while offline');
            if (!user) {
              restoreFromCache();
            }
            setLoading(false);
            return;
          }
          setSession(session);
          setUser(session?.user ?? null);
          if (session?.user && !navigator.onLine) {
            applyCachedProfile(session.user.id);
          }
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (session?.user) {
          setSession(session);
          setUser(session.user);
          cacheSession(session.user);
          // Apply cached profile immediately so UI renders with data
          applyCachedProfile(session.user.id);
          setLoading(false);

          if (navigator.onLine) {
            // Ensure JWT is actually valid before marking auth as ready
            if (isTokenStale(session)) {
              console.log('AuthContext: Token stale at startup, forcing refresh before init');
              try {
                const { data: refreshed } = await supabase.auth.refreshSession();
                if (refreshed.session) {
                  session = refreshed.session;
                  setSession(session);
                  setUser(session.user);
                  cacheSession(session.user);
                }
              } catch (refreshErr) {
                console.warn('AuthContext: Startup token refresh failed', refreshErr);
              }
            }

            if (isCacheFresh(session.user.id)) {
              console.log('AuthContext: Cache fresh, validating profile access from server');
            }
            refreshAuthState(session.user.id, 'initial-session');
          } else {
            // Offline — mark as initialized with cached data
            setAuthInitialized(true);
            setSubscriptionLoading(false);
          }
        } else if (!navigator.onLine) {
          console.log('AuthContext: Offline with no session, trying cache');
          const restored = restoreFromCache();
          setLoading(false);
          setAuthInitialized(true);
          setSubscriptionLoading(false);
          if (restored) {
            console.log('AuthContext: Restored user from offline cache');
          }
        } else {
          resetAuthState();
          setLoading(false);
          setAuthInitialized(true);
          setSubscriptionLoading(false);
        }
      })
      .catch(() => {
        resetAuthState();
        setLoading(false);
        setAuthInitialized(true);
        setSubscriptionLoading(false);
      });

    // --- Cross-tab auth sync via BroadcastChannel ---
    const cleanupTabSync = onTabMessage(async (msg: TabSyncMessage) => {
      if (msg.type === 'SESSION_UPDATE') {
        console.log('AuthContext: Received session from another tab via BroadcastChannel');
        // Mark that the next onAuthStateChange event is from our setSession call
        ignoreNextAuthEventRef.current = true;
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: msg.access_token,
            refresh_token: msg.refresh_token,
          });
          if (error) {
            console.warn('AuthContext: Failed to apply cross-tab session:', error.message);
            ignoreNextAuthEventRef.current = false;
          } else if (data.session) {
            setSession(data.session);
            setUser(data.session.user);
            cacheSession(data.session.user);
            console.log('AuthContext: Applied cross-tab session successfully');
          }
        } catch (err) {
          console.warn('AuthContext: Cross-tab setSession error:', err);
          ignoreNextAuthEventRef.current = false;
        }
      } else if (msg.type === 'SIGNED_OUT') {
        console.log('AuthContext: Received sign-out from another tab');
        resetAuthState();
        setLoading(false);
        setAuthInitialized(true);
      }
    });

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      cleanupTabSync();
    };
  }, []);

  // Periodic soft-refresh: re-fetch profile/role/companies every 15 minutes
  // to catch admin-side changes without overloading the database on every token refresh.
  useEffect(() => {
    if (!session) return;
    const SOFT_REFRESH_INTERVAL = 15 * 60_000; // 15 minutes
    const interval = setInterval(() => {
      if (session?.user && navigator.onLine && document.visibilityState === 'visible') {
        console.log('AuthContext: Periodic soft-refresh (15min)');
        refreshAuthState(session.user.id, 'periodic-soft');
      }
    }, SOFT_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    if (!user?.id || !navigator.onLine) return;

    const channel = supabase
      .channel(`current-profile-access-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => {
          refreshAuthState(user.id, 'profile-access-change');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const signOut = async () => {
    await clearLocalAuthData(user?.id);
  };

  /**
   * Atomic company switch. Validates access, updates profile, refreshes token,
   * then refreshes ALL auth state (profile, role, subscription, companies).
   * Works for both regular users and superadmins.
   */
  const switchCompany = async (newCompanyId: string) => {
    if (!user) return;

    // Superadmins bypass the can_user_access_company check
    if (!isSuperAdmin) {
      const { data: canAccess, error: accessError } = await supabase.rpc('can_user_access_company', {
        _user_id: user.id,
        _company_id: newCompanyId,
      });
      if (accessError) throw accessError;
      if (!canAccess) throw new Error('No access to this company');
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ company_id: newCompanyId })
      .eq('id', user.id);
    if (updateError) throw updateError;

    await ensureValidToken();
    await refreshAuthState(user.id, 'switch-company');
  };

  const refetchUserInfo = async () => {
    if (user) {
      await refreshAuthState(user.id, 'manual-refetch');
    }
  };

  /**
   * Manual subscription check — for use after checkout success etc.
   * Uses version guard so it won't overwrite a concurrent refreshAuthState.
   */
  const checkSubscription = async () => {
    if (!session) {
      setSubscriptionLoading(false);
      return;
    }

    // Stripe-exempt companies never need to call Stripe
    if (stripeExempt) {
      setSubscribed(true);
      setSubscriptionLoading(false);
      return;
    }

    // Manual check always calls Edge Function (e.g. after checkout)
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) {
        console.error('check-subscription error:', error);
        if (isMissingAuthUserError(error)) {
          await clearLocalAuthData(session.user.id);
        }
        setSubscriptionLoading(false);
        return;
      }
      applySubscriptionData(data);
    } catch (e) {
      console.error('check-subscription failed:', e);
      if (isMissingAuthUserError(e)) {
        await clearLocalAuthData(session.user.id);
      }
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const ensureValidToken = async (): Promise<void> => {
    if (!navigator.onLine) return;
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession && isTokenStale(currentSession)) {
      console.log('ensureValidToken: token stale, refreshing via shared ensureFreshSession');
      await ensureFreshSession();
      // Re-fetch updated session after refresh
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      if (freshSession) {
        setSession(freshSession);
        setUser(freshSession.user);
      }
    } else if (currentSession) {
      setSession(currentSession);
      setUser(currentSession.user);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      companyId, 
      companyName, 
      parentCompanyId,
      parentCompanyName,
      companyType, 
      companyLat,
      companyLon,
      isSuperAdmin, 
      djiFlightlogEnabled,
      ardupilotFlightlogEnabled,
      departmentsEnabled,
      isAdmin,
      isApproved,
      profileLoaded,
      userRole, 
      subscribed,
      subscriptionEnd,
      subscriptionLoading,
      cancelAtPeriodEnd,
      isTrial,
      trialEnd,
      stripeExempt,
      hadPreviousSubscription,
      subscriptionPlan,
      subscriptionAddons,
      isBillingOwner,
      seatCount,
      accessibleCompanies,
      underTraining,
      trainingModuleAccess,
      hasTrainingModuleAccess: (moduleKey) => !underTraining || trainingModuleAccess.includes(moduleKey),
      authRefreshing,
      authInitialized,
      signOut, 
      refetchUserInfo,
      checkSubscription,
      switchCompany,
      ensureValidToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
