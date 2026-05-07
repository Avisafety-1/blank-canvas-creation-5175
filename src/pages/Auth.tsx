import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase, ensureFreshSession } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { redirectToApp, isDevelopment } from "@/config/domains";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Chrome, CheckCircle2, Building2, KeyRound, Fingerprint, Loader2 } from "lucide-react";
import droneBackground from "@/assets/drone-background.webp";
import type { User } from "@supabase/supabase-js";
import { MfaChallengeDialog } from "@/components/MfaChallengeDialog";
import { startAuthentication } from "@simplewebauthn/browser";
import { PasswordRequirements, isPasswordValid, passwordErrorMessage } from "@/components/PasswordRequirements";


const Auth = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    user,
    loading: authLoading
  } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [validatedCompany, setValidatedCompany] = useState<{ id: string; name: string } | null>(null);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  
  // Registration mode: 'code' (existing company) or 'new' (create company)
  const [regMode, setRegMode] = useState<'code' | 'new'>('code');
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyOrgNr, setNewCompanyOrgNr] = useState("");
  
  // Google OAuth registration state
  const [showGoogleRegistration, setShowGoogleRegistration] = useState(false);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleFullName, setGoogleFullName] = useState("");
  const [googleRegistrationCode, setGoogleRegistrationCode] = useState("");
  const [googleValidatedCompany, setGoogleValidatedCompany] = useState<{ id: string; name: string } | null>(null);
  const [googleRegMode, setGoogleRegMode] = useState<'code' | 'new'>('code');
  const [googleNewCompanyName, setGoogleNewCompanyName] = useState("");
  const [googleNewCompanyOrgNr, setGoogleNewCompanyOrgNr] = useState("");
  const [checkingGoogleUser, setCheckingGoogleUser] = useState(false);
  const [showMfaChallenge, setShowMfaChallenge] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  const passkeySupported = typeof window !== "undefined" && !!window.PublicKeyCredential;
  const passkeyRegistered = typeof window !== "undefined" && !!localStorage.getItem("avisafe_passkey_registered");
  const isDevEnv = isDevelopment();
  const googleProfileCheckedRef = useRef(false);

  // Handle email confirmation messages from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const error = params.get('error');
      const errorDescription = params.get('error_description');
      const type = params.get('type');
      
      // Check if this is an OAuth callback (has access_token with provider tokens)
      const isOAuthCallback = hash.includes('access_token') && 
        (params.has('provider_token') || params.has('provider_refresh_token'));
      
      if (error === 'access_denied' || errorDescription?.includes('already been consumed')) {
        toast.error(t('auth.linkExpired'));
        // Clean up URL for error cases immediately
        window.history.replaceState(null, '', window.location.pathname);
      } else if (!error && hash.includes('access_token') && !isOAuthCallback) {
        // Only show email confirmed message for actual email confirmations (signup, invite, recovery, magiclink)
        // NOT for OAuth callbacks
        if (type === 'signup' || type === 'invite' || type === 'recovery' || type === 'magiclink') {
          toast.success(t('auth.emailConfirmed'));
        }
        // Clean up URL for non-OAuth callbacks
        window.history.replaceState(null, '', window.location.pathname);
      }
      
      // IMPORTANT: For OAuth callbacks, do NOT clean up the URL hash immediately!
      // Supabase needs time to read the access_token from the URL.
      // The URL will be cleaned up after the session is established via onAuthStateChange.
      // This fixes the "blinking screen" issue on mobile devices where the hash was
      // being removed before Supabase could process the OAuth tokens.
    }
  }, [t]);


  // Handle Google OAuth users - check if they have a valid profile
  useEffect(() => {
    const checkGoogleUserProfile = async () => {
      if (authLoading || !user) return;
      
      // Check if this is an OAuth user (no password, has Google provider)
      const isOAuthUser = user.app_metadata?.provider === 'google' || 
                          user.app_metadata?.providers?.includes('google');
      
      if (!isOAuthUser) {
        // Regular email user - let normal flow handle it
        return;
      }

      // Guard: only run once per user session to prevent duplicate calls
      if (googleProfileCheckedRef.current) return;
      googleProfileCheckedRef.current = true;

      setCheckingGoogleUser(true);
      
      try {
        // Ensure token is fresh before querying profiles (RLS depends on valid JWT)
        try {
          await ensureFreshSession();
        } catch {
          console.warn('checkGoogleUserProfile: could not refresh session, skipping');
          googleProfileCheckedRef.current = false;
          setCheckingGoogleUser(false);
          return;
        }

        // Check if user has a profile with a valid company_id
        let { data: profile, error } = await supabase
          .from('profiles')
          .select('id, company_id, approved')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error) {
          console.error('Error checking profile, retrying once:', error);
          // Retry once after 1s to handle transient network/RLS failures
          await new Promise(r => setTimeout(r, 1000));
          const { data: retryProfile, error: retryErr } = await supabase
            .from('profiles')
            .select('id, company_id, approved')
            .eq('id', user.id)
            .maybeSingle();
          
          if (retryErr || !retryProfile) {
            console.warn('Profile check failed twice, redirecting to app domain');
            googleProfileCheckedRef.current = false; // allow future retry
            setCheckingGoogleUser(false);
            redirectToApp('/');
            return;
          }
          profile = retryProfile;
        }

        if (profile && profile.company_id) {
          // User has a profile with company_id
          if (profile.approved) {
            // Check MFA requirement before redirecting
            const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel === 'aal1') {
              console.log('Google user requires MFA verification');
              setShowMfaChallenge(true);
              setCheckingGoogleUser(false);
              return;
            }

            // Approved user - redirect to app with delay for session stability
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const redirectDelay = isMobile ? 600 : 300;
            console.log(`Google user approved, preparing redirect to app (delay: ${redirectDelay}ms, mobile: ${isMobile})`);
            
            if (window.location.hash) {
              window.history.replaceState(null, '', window.location.pathname);
            }
            
            setTimeout(() => {
              console.log('Google user approved, executing redirect to app');
              redirectToApp('/');
            }, redirectDelay);
          } else {
            // Not approved - show message and sign out
            toast.error(t('auth.accountPendingApproval'));
            await supabase.auth.signOut();
          }
        } else {
          // New Google user without profile - show registration dialog
          console.log('New Google user, showing registration dialog');
          setGoogleUser(user);
          setGoogleFullName(user.user_metadata?.full_name || user.user_metadata?.name || '');
          setShowGoogleRegistration(true);
        }
      } catch (err) {
        console.error('Error in Google user check:', err);
      } finally {
        setCheckingGoogleUser(false);
      }
    };

    checkGoogleUserProfile();
  }, [user, authLoading, t]);

  // Regular redirect for non-OAuth users
  useEffect(() => {
    if (authLoading || checkingGoogleUser || showGoogleRegistration || showMfaChallenge) return;

    const isOAuthUser = user?.app_metadata?.provider === 'google' || 
                        user?.app_metadata?.providers?.includes('google');

    if (!isOAuthUser && user) {
      // Check MFA requirement before redirecting
      const checkMfaAndRedirect = async () => {
        const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel === 'aal1') {
          console.log('User requires MFA verification before redirect');
          setShowMfaChallenge(true);
          return;
        }
        console.log('Redirecting to app domain');
        redirectToApp('/');
      };
      checkMfaAndRedirect();
    }
  }, [user, authLoading, checkingGoogleUser, showGoogleRegistration, showMfaChallenge]);

  // Validate registration code when it changes
  useEffect(() => {
    const validateCode = async () => {
      if (registrationCode.length === 6) {
        const { data, error } = await supabase.rpc('get_company_by_registration_code', {
          p_code: registrationCode
        });
        
        if (!error && data && data.length > 0) {
          setValidatedCompany({ id: data[0].company_id, name: data[0].company_name });
        } else {
          setValidatedCompany(null);
        }
      } else {
        setValidatedCompany(null);
      }
    };

    if (!isLogin && registrationCode) {
      validateCode();
    }
  }, [registrationCode, isLogin]);

  // Validate Google registration code
  useEffect(() => {
    const validateCode = async () => {
      if (googleRegistrationCode.length === 6) {
        const { data, error } = await supabase.rpc('get_company_by_registration_code', {
          p_code: googleRegistrationCode
        });
        
        if (!error && data && data.length > 0) {
          setGoogleValidatedCompany({ id: data[0].company_id, name: data[0].company_name });
        } else {
          setGoogleValidatedCompany(null);
        }
      } else {
        setGoogleValidatedCompany(null);
      }
    };

    if (googleRegistrationCode) {
      validateCode();
    }
  }, [googleRegistrationCode]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error(t('auth.fillAllFields'));
      return;
    }
    if (!isLogin && !fullName) {
      toast.error(t('auth.fillFullName'));
      return;
    }
    if (!isLogin && regMode === 'code' && !validatedCompany) {
      toast.error(t('auth.enterValidCode'));
      return;
    }
    if (!isLogin && regMode === 'new' && !newCompanyName.trim()) {
      toast.error('Skriv inn selskapsnavn');
      return;
    }
    if (!isLogin) {
      const pwErr = passwordErrorMessage(password);
      if (pwErr) {
        toast.error(pwErr);
        return;
      }
    }
    setLoading(true);
    try {
      if (isLogin) {
        const {
          data,
          error
        } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        if (data.user) {
          // Check MFA requirement
          const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel === 'aal1') {
            setShowMfaChallenge(true);
            setLoading(false);
            return;
          }

          // Check if user is approved
          const {
            data: profileData
          } = await supabase.from("profiles").select("approved").eq("id", data.user.id).maybeSingle();
          if (profileData && !(profileData as any).approved) {
            await supabase.auth.signOut();
            toast.error(t('auth.accountPendingApproval'));
            return;
          }
          toast.success(t('auth.loginSuccess'));
          redirectToApp('/');
        }
      } else if (regMode === 'new') {
        // --- New company registration ---
        // Company/profile/role creation is handled server-side by the
        // handle_new_user() database trigger using user metadata.
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: 'https://login.avisafe.no/auth',
            data: {
              full_name: fullName,
              new_company_name: newCompanyName.trim(),
              new_company_org_nr: newCompanyOrgNr.trim() || null,
            }
          }
        });

        if (error) throw error;

        toast.success('Bekreft e-posten din for å aktivere kontoen.');
        setEmail("");
        setPassword("");
        setFullName("");
        setNewCompanyName("");
        setNewCompanyOrgNr("");
        setIsLogin(true);
      } else {
        // --- Existing company with code ---
        const {
          data,
          error
        } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: 'https://login.avisafe.no/auth',
            data: {
              full_name: fullName,
              company_id: validatedCompany!.id
            }
          }
        });
        if (error) throw error;
        if (data.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: data.user.id,
              full_name: fullName,
              company_id: validatedCompany!.id,
              email: email,
              approved: false
            }, {
              onConflict: 'id'
            });

          if (profileError) {
            console.error('Error creating profile:', profileError);
          }

          await supabase.functions.invoke('send-notification-email', {
            body: {
              type: 'notify_admins_new_user',
              companyId: validatedCompany!.id,
              newUser: {
                fullName: fullName,
                email: email,
                companyName: validatedCompany!.name
              }
            }
          });

          toast.success(t('auth.accountCreated'));
          setEmail("");
          setPassword("");
          setFullName("");
          setRegistrationCode("");
          setValidatedCompany(null);
          setIsLogin(true);
        }
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      toast.error(error.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      // IMPORTANT: For split-domain setup (login.avisafe.no -> app.avisafe.no),
      // the OAuth callback must land on the APP domain so the session is stored
      // in the correct origin (localStorage is per-domain).
      const redirectTo = window.location.hostname.includes('lovableproject.com') || window.location.hostname === 'localhost'
        ? `${window.location.origin}/auth`
        : 'https://app.avisafe.no/auth';

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      toast.error(error.message || t('auth.couldNotSignInGoogle'));
      setLoading(false);
    }
  };

  const handleGoogleRegistrationSubmit = async () => {
    if (!googleUser || !googleFullName.trim()) {
      toast.error(t('auth.fillAllFields'));
      return;
    }

    if (googleRegMode === 'code' && !googleValidatedCompany) {
      toast.error(t('auth.enterValidCode'));
      return;
    }

    if (googleRegMode === 'new' && !googleNewCompanyName.trim()) {
      toast.error('Skriv inn selskapsnavn');
      return;
    }

    setLoading(true);
    try {
      if (googleRegMode === 'new') {
        // Create new company
        const regCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { data: companyData, error: companyError } = await supabase
          .from('companies')
          .insert({
            navn: googleNewCompanyName.trim(),
            org_nummer: googleNewCompanyOrgNr.trim() || null,
            registration_code: regCode,
          })
          .select('id')
          .single();

        if (companyError || !companyData) {
          console.error('Error creating company:', companyError);
          toast.error(t('errors.generic'));
          return;
        }

        // Create profile as approved admin (founder)
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: googleUser.id,
            full_name: googleFullName.trim(),
            company_id: companyData.id,
            email: googleUser.email,
            approved: true
          });

        if (profileError) {
          console.error('Error creating profile:', profileError);
          toast.error(t('errors.generic'));
          return;
        }

        // Assign admin role
        await supabase.from('user_roles').insert({
          user_id: googleUser.id,
          role: 'administrator' as any
        });

        toast.success('Selskap opprettet! Du er nå logget inn.');
        
        // Redirect to app
        setShowGoogleRegistration(false);
        setGoogleUser(null);
        redirectToApp('/');
      } else {
        // Existing company with code
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: googleUser.id,
            full_name: googleFullName.trim(),
            company_id: googleValidatedCompany!.id,
            email: googleUser.email,
            approved: false
          });

        if (profileError) {
          console.error('Error creating profile:', profileError);
          toast.error(t('errors.generic'));
          return;
        }

        // Send notifications to admins
        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'notify_admins_new_user',
            companyId: googleValidatedCompany!.id,
            newUser: {
              fullName: googleFullName.trim(),
              email: googleUser.email,
              companyName: googleValidatedCompany!.name
            }
          }
        });

        toast.success(t('auth.accountCreated'));
        
        // Sign out and reset state
        await supabase.auth.signOut();
        setShowGoogleRegistration(false);
        setGoogleUser(null);
        setGoogleFullName("");
        setGoogleRegistrationCode("");
        setGoogleValidatedCompany(null);
      }
    } catch (error: any) {
      console.error('Google registration error:', error);
      toast.error(error.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancelGoogleRegistration = async () => {
    if (!googleUser) {
      setShowGoogleRegistration(false);
      return;
    }

    setLoading(true);
    try {
      // Delete the auth user via edge function
      await supabase.functions.invoke('admin-delete-user', {
        body: { email: googleUser.email }
      });

      // Sign out
      await supabase.auth.signOut();

      toast.info(t('auth.registrationCancelled'));
    } catch (error: any) {
      console.error('Error cancelling Google registration:', error);
      // Still try to sign out even if delete fails
      await supabase.auth.signOut();
    } finally {
      setShowGoogleRegistration(false);
      setGoogleUser(null);
      setGoogleFullName("");
      setGoogleRegistrationCode("");
      setGoogleValidatedCompany(null);
      setGoogleRegMode('code');
      setGoogleNewCompanyName("");
      setGoogleNewCompanyOrgNr("");
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    try {
      // Step 1: Get discoverable authentication options (no email needed)
      const { data: optionsData, error: optionsError } = await supabase.functions.invoke("webauthn", {
        body: { action: "login-options-discoverable" },
      });
      if (optionsError || optionsData?.error) {
        throw new Error(optionsData?.error || t('passkey.loginError'));
      }

      // Step 2: Authenticate with browser — shows all available passkeys
      const credential = await startAuthentication({ optionsJSON: optionsData.options });

      // Step 3: Verify with server
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke("webauthn", {
        body: {
          action: "login-verify",
          credential,
          signedChallenge: optionsData.signedChallenge,
        },
      });
      if (verifyError || verifyData?.error) {
        throw new Error(verifyData?.error || t('passkey.loginError'));
      }

      if (verifyData.verified && verifyData.token_hash) {
        // Step 4: Complete login with the token
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: verifyData.token_hash,
          type: 'magiclink',
        });
        if (otpError) throw otpError;

        toast.success(t('auth.loginSuccess'));
        redirectToApp('/');
      }
    } catch (err: any) {
      console.error("Passkey login error:", err);
      if (err.name === "NotAllowedError") return;
      toast.error(err.message || t('passkey.loginError'));
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      toast.error(t('auth.enterEmailAddress'));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-password-reset', {
        body: { email: resetEmail }
      });
      
      if (error) throw error;
      
      toast.success(t('auth.resetEmailSent'));
      setShowResetPassword(false);
      setResetEmail("");
    } catch (error: any) {
      console.error("Reset password error:", error);
      toast.error(error.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center">
      {/* Background */}
      <div className="fixed inset-0 z-0" style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.4)), url(${droneBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center"
      }} />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-4">
        <Card className="bg-card/95 backdrop-blur-sm border-border/50">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-center">
              <img 
                src="/avisafe-logo-text.png" 
                alt="AviSafe" 
                className="h-24 w-auto" 
                width={301}
                height={96}
                fetchPriority="high"
              />
            </div>
            <div className="text-center">
              <CardTitle className="text-xl">
                {isLogin ? t('auth.signIn') : t('auth.signUp')}
              </CardTitle>
              <CardDescription>
                {isLogin ? t('auth.enterCredentials') : t('auth.fillForm')}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t('auth.fullName')}</Label>
                  <Input 
                    id="fullName" 
                    type="text" 
                    placeholder="Ola Nordmann" 
                    value={fullName} 
                    onChange={e => setFullName(e.target.value)} 
                    required={!isLogin} 
                  />
                </div>
              )}
              {!isLogin && (
                <>
                  <Tabs value={regMode} onValueChange={(v) => setRegMode(v as 'code' | 'new')} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="code" className="text-xs gap-1">
                        <KeyRound className="h-3.5 w-3.5" />
                        Selskapskode
                      </TabsTrigger>
                      <TabsTrigger value="new" className="text-xs gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        Nytt selskap
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {regMode === 'code' ? (
                    <div className="space-y-2">
                      <Label htmlFor="registrationCode">{t('auth.registrationCode')}</Label>
                      <div className="relative">
                        <Input 
                          id="registrationCode" 
                          type="text" 
                          placeholder="ABC123" 
                          value={registrationCode} 
                          onChange={e => setRegistrationCode(e.target.value.toUpperCase().slice(0, 6))} 
                          required={regMode === 'code'}
                          maxLength={6}
                          className="font-mono uppercase tracking-wider"
                        />
                        {validatedCompany && (
                          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />
                        )}
                      </div>
                      {validatedCompany && (
                        <p className="text-sm text-primary flex items-center gap-1">
                          {t('auth.company')}: {validatedCompany.name}
                        </p>
                      )}
                      {registrationCode.length === 6 && !validatedCompany && (
                        <p className="text-sm text-destructive">{t('auth.invalidCode')}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t('auth.contactAdmin')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Selskapsnavn *</Label>
                      <Input 
                        id="companyName" 
                        type="text" 
                        placeholder="Mitt Droneselskap AS" 
                        value={newCompanyName} 
                        onChange={e => setNewCompanyName(e.target.value)} 
                        required={regMode === 'new'}
                      />
                      <Label htmlFor="orgNr">Organisasjonsnummer (valgfritt)</Label>
                      <Input 
                        id="orgNr" 
                        type="text" 
                        placeholder="123 456 789" 
                        value={newCompanyOrgNr} 
                        onChange={e => setNewCompanyOrgNr(e.target.value)} 
                      />
                      <p className="text-xs text-muted-foreground">
                        Du blir administrator for det nye selskapet. 5 dager gratis prøveperiode.
                      </p>
                    </div>
                  )}
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder={t('forms.placeholder.email')} 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t('auth.password')}</Label>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                  minLength={isLogin ? 6 : 8} 
                />
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(true)}
                    className="text-xs text-primary hover:underline block mt-1"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                )}
                {!isLogin && <PasswordRequirements password={password} className="mt-2" />}
              </div>
              <Button type="submit" className="w-full" disabled={loading || (!isLogin && regMode === 'code' && !validatedCompany) || (!isLogin && regMode === 'new' && !newCompanyName.trim()) || (!isLogin && !isPasswordValid(password))}>
                {loading ? t('common.processing') : isLogin ? t('auth.signIn') : regMode === 'new' ? 'Opprett selskap og konto' : t('auth.signUp')}
              </Button>
            </form>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                
              </div>
            </div>

            <Button 
              type="button" 
              variant="outline" 
              onClick={handleGoogleSignIn} 
              disabled={loading} 
              className="w-full text-center py-0 my-[19px] bg-blue-200 hover:bg-blue-100"
            >
              <Chrome className="mr-2 h-4 w-4" />
              {t('auth.signInWithGoogle')}
            </Button>

            {isLogin && passkeySupported && passkeyRegistered && !isDevEnv && (
              <Button
                type="button"
                variant="outline"
                onClick={handlePasskeyLogin}
                disabled={loading || passkeyLoading}
                className="w-full mb-3"
              >
                {passkeyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fingerprint className="mr-2 h-4 w-4" />}
                {t('passkey.loginButton')}
              </Button>
            )}

            <div className="text-center text-sm">
              <button 
                type="button" 
                onClick={() => {
                  setIsLogin(!isLogin);
                  setRegistrationCode("");
                  setValidatedCompany(null);
                }} 
                className="text-primary hover:underline"
              >
                {isLogin ? t('auth.noAccount') : t('auth.hasAccount')}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reset Password Dialog */}
      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('auth.resetPassword')}</DialogTitle>
            <DialogDescription>
              {t('auth.resetPasswordDesc')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resetEmail">{t('auth.email')}</Label>
              <Input 
                id="resetEmail" 
                type="email" 
                placeholder={t('forms.placeholder.email')} 
                value={resetEmail} 
                onChange={e => setResetEmail(e.target.value)} 
                required 
              />
            </div>
            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowResetPassword(false);
                  setResetEmail("");
                }} 
                className="flex-1"
              >
                {t('actions.cancel')}
              </Button>
              <Button type="submit" disabled={loading} className="flex-1">
                {loading ? t('auth.sending') : t('auth.sendEmail')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Google Registration Dialog */}
      <Dialog open={showGoogleRegistration} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t('auth.completeRegistration')}</DialogTitle>
            <DialogDescription>
              {googleRegMode === 'new' 
                ? 'Opprett et nytt selskap og kom i gang.'
                : t('auth.enterRegistrationCodeToComplete')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="googleFullName">{t('auth.fullName')}</Label>
              <Input 
                id="googleFullName" 
                type="text" 
                placeholder="Ola Nordmann" 
                value={googleFullName} 
                onChange={e => setGoogleFullName(e.target.value)} 
              />
            </div>

            <Tabs value={googleRegMode} onValueChange={(v) => setGoogleRegMode(v as 'code' | 'new')} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="code" className="text-xs gap-1">
                  <KeyRound className="h-3.5 w-3.5" />
                  Selskapskode
                </TabsTrigger>
                <TabsTrigger value="new" className="text-xs gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  Nytt selskap
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {googleRegMode === 'code' ? (
              <div className="space-y-2">
                <Label htmlFor="googleRegistrationCode">{t('auth.registrationCode')}</Label>
                <div className="relative">
                  <Input 
                    id="googleRegistrationCode" 
                    type="text" 
                    placeholder="ABC123" 
                    value={googleRegistrationCode} 
                    onChange={e => setGoogleRegistrationCode(e.target.value.toUpperCase().slice(0, 6))} 
                    maxLength={6}
                    className="font-mono uppercase tracking-wider"
                  />
                  {googleValidatedCompany && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary" />
                  )}
                </div>
                {googleValidatedCompany && (
                  <p className="text-sm text-primary flex items-center gap-1">
                    {t('auth.company')}: {googleValidatedCompany.name}
                  </p>
                )}
                {googleRegistrationCode.length === 6 && !googleValidatedCompany && (
                  <p className="text-sm text-destructive">{t('auth.invalidCode')}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('auth.contactAdmin')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="googleCompanyName">Selskapsnavn *</Label>
                <Input 
                  id="googleCompanyName" 
                  type="text" 
                  placeholder="Mitt Droneselskap AS" 
                  value={googleNewCompanyName} 
                  onChange={e => setGoogleNewCompanyName(e.target.value)} 
                />
                <Label htmlFor="googleOrgNr">Organisasjonsnummer (valgfritt)</Label>
                <Input 
                  id="googleOrgNr" 
                  type="text" 
                  placeholder="123 456 789" 
                  value={googleNewCompanyOrgNr} 
                  onChange={e => setGoogleNewCompanyOrgNr(e.target.value)} 
                />
                <p className="text-xs text-muted-foreground">
                  Du blir administrator for det nye selskapet. 5 dager gratis prøveperiode.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCancelGoogleRegistration} 
                disabled={loading}
                className="flex-1"
              >
                {t('actions.cancel')}
              </Button>
              <Button 
                type="button" 
                onClick={handleGoogleRegistrationSubmit} 
                disabled={loading || !googleFullName.trim() || (googleRegMode === 'code' && !googleValidatedCompany) || (googleRegMode === 'new' && !googleNewCompanyName.trim())}
                className="flex-1"
              >
                {loading ? t('common.processing') : googleRegMode === 'new' ? 'Opprett selskap og konto' : t('auth.signUp')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>




      <MfaChallengeDialog
        open={showMfaChallenge}
        onVerified={() => {
          setShowMfaChallenge(false);
          toast.success(t('auth.loginSuccess'));
          redirectToApp('/');
        }}
        onCancel={() => {
          setShowMfaChallenge(false);
        }}
      />
    </div>
  );
};

export default Auth;
