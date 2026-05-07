import { LogOut, Settings, Menu, Globe, Download, BarChart3, Activity, Megaphone } from "lucide-react";
import avisafeLogo from "@/assets/avisafe-logo-text.png";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileDialog } from "@/components/ProfileDialog";
import { PendingApprovalsBadge } from "@/components/PendingApprovalsBadge";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { TrainingModuleKey } from "@/config/trainingModules";

interface Company {
  id: string;
  navn: string;
}

export const Header = () => {
  const navigate = useNavigate();
  const { signOut, companyName, isSuperAdmin, isAdmin, companyId, accessibleCompanies, switchCompany, hasTrainingModuleAccess } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const { t, i18n } = useTranslation();

  // Superadmins: fetch ALL companies for full switcher
  // Non-superadmins with multi-company access: use accessibleCompanies from AuthContext
  useEffect(() => {
    if (isSuperAdmin) {
      fetchCompanies();
    }
  }, [isSuperAdmin]);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, navn")
        .order("navn", { ascending: true });

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
    }
  };

  // Determine which company list to show in the switcher
  const switcherCompanies = isSuperAdmin
    ? companies.map(c => ({ id: c.id, navn: c.navn, isParent: false }))
    : accessibleCompanies.length > 1
      ? accessibleCompanies.map(c => ({ id: c.id, navn: c.name, isParent: c.isParent }))
      : [];

  const handleCompanySwitch = async (newCompanyId: string) => {
    try {
      // All paths (superadmin + regular) use atomic switchCompany
      // which validates access, updates profile, refreshes token + all auth state
      await switchCompany(newCompanyId);
      const companyMatch = isSuperAdmin
        ? companies.find(c => c.id === newCompanyId)
        : accessibleCompanies.find(c => c.id === newCompanyId);
      const displayName = companyMatch ? ('navn' in companyMatch ? companyMatch.navn : companyMatch.name) : newCompanyId;
      toast.success(t('header.switchedTo', { company: displayName }));
    } catch (error) {
      console.error("Error switching company:", error);
      toast.error(t('header.couldNotSwitch'));
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success(t('header.loggedOut'));
    navigate("/auth");
  };

  const toggleLanguage = () => {
    const currentLang = i18n.language?.startsWith('en') ? 'en' : 'no';
    const newLang = currentLang === 'no' ? 'en' : 'no';
    i18n.changeLanguage(newLang);
  };

  const displayLang = i18n.language?.startsWith('en') ? 'NO' : 'EN';
  const canShowModule = (moduleKey: TrainingModuleKey) => hasTrainingModuleAccess(moduleKey);

  return (
    <header className="bg-card/95 border-b border-glass sticky top-0 pt-[env(safe-area-inset-top)] z-[1100] w-full">
      <div className="w-full px-3 sm:px-4 pt-1 sm:pt-2 pb-2 sm:pb-3">
        <div className="flex items-center justify-between gap-1 sm:gap-2 min-w-0">
          <Button 
            variant="ghost" 
            className="flex items-center hover:bg-transparent p-0 flex-shrink-0"
            onClick={() => navigate("/")}
          >
            <img 
              src={avisafeLogo} 
              alt="AviSafe" 
              className="h-8 sm:h-10 lg:h-12 w-auto max-w-[42vw] sm:max-w-none dark:invert"
            />
          </Button>
          
          {/* Mobile company selector and menu */}
          <div className="flex items-center justify-end gap-0.5 lg:hidden flex-1 min-w-0 flex-wrap overflow-visible">
            {switcherCompanies.length > 0 && (
              <CompanySwitcher
                companies={switcherCompanies}
                currentCompanyId={companyId}
                onSwitch={handleCompanySwitch}
                compact
              />
            )}
            
            {/* Mobile Navigation - Hamburger Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 min-w-7 p-0">
                  <Menu className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card/95 border-glass z-[1150]">
                {canShowModule('missions') && <DropdownMenuItem onClick={() => navigate("/oppdrag")}>{t('nav.missions')}</DropdownMenuItem>}
                {canShowModule('map') && <DropdownMenuItem onClick={() => navigate("/kart")}>{t('nav.map')}</DropdownMenuItem>}
                {canShowModule('documents') && <DropdownMenuItem onClick={() => navigate("/dokumenter")}>{t('nav.documents')}</DropdownMenuItem>}
                {canShowModule('calendar') && <DropdownMenuItem onClick={() => navigate("/kalender")}>{t('nav.calendar')}</DropdownMenuItem>}
                {canShowModule('incidents') && <DropdownMenuItem onClick={() => navigate("/hendelser")}>{t('nav.incidents')}</DropdownMenuItem>}
                {canShowModule('status') && <DropdownMenuItem onClick={() => navigate("/status")}>{t('nav.status')}</DropdownMenuItem>}
                {canShowModule('resources') && <DropdownMenuItem onClick={() => navigate("/ressurser")}>{t('nav.resources')}</DropdownMenuItem>}
                {isSuperAdmin && companyName?.toLowerCase() === 'avisafe' && (
                  <DropdownMenuItem onClick={() => navigate("/statistikk")}>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Plattformstatistikk
                  </DropdownMenuItem>
                )}
                {isSuperAdmin && companyName?.toLowerCase() === 'avisafe' && (
                  <DropdownMenuItem onClick={() => navigate("/marketing")}>
                    <Megaphone className="w-4 h-4 mr-2" />
                    Marketing
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => navigate("/changelog")}>
                  <Activity className="w-4 h-4 mr-2" />
                  Driftstatus
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/installer")}>
                   <Download className="w-4 h-4 mr-2" />
                   {t('nav.installApp', 'Installer app')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Language toggle - Mobile */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="h-7 w-7 min-w-7 p-0"
              title={displayLang === 'EN' ? 'Switch to English' : 'Bytt til norsk'}
            >
              <Globe className="w-3.5 h-3.5" />
            </Button>
            
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin")}
                className="gap-1 relative h-7 w-7 min-w-7 p-0 md:h-8 md:w-8"
                title={t('nav.admin')}
              >
                <Settings className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <PendingApprovalsBadge isAdmin={isAdmin} />
              </Button>
            )}
            <ProfileDialog />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              title={t('actions.signOut')}
              className="h-7 w-7 min-w-7 p-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
          
          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1 flex-shrink">
            {canShowModule('missions') && <Button variant="ghost" size="sm" onClick={() => navigate("/oppdrag")}>{t('nav.missions')}</Button>}
            {canShowModule('map') && <Button variant="ghost" size="sm" onClick={() => navigate("/kart")}>{t('nav.map')}</Button>}
            {canShowModule('documents') && <Button variant="ghost" size="sm" onClick={() => navigate("/dokumenter")}>{t('nav.documents')}</Button>}
            {canShowModule('calendar') && <Button variant="ghost" size="sm" onClick={() => navigate("/kalender")}>{t('nav.calendar')}</Button>}
            {canShowModule('incidents') && <Button variant="ghost" size="sm" onClick={() => navigate("/hendelser")}>{t('nav.incidents')}</Button>}
            {canShowModule('status') && <Button variant="ghost" size="sm" onClick={() => navigate("/status")}>{t('nav.status')}</Button>}
            {canShowModule('resources') && <Button variant="ghost" size="sm" onClick={() => navigate("/ressurser")}>{t('nav.resources')}</Button>}
            <Button variant="ghost" size="sm" onClick={() => navigate("/changelog")} title="Driftstatus">
              <Activity className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/installer")} title={t('nav.installApp', 'Installer app')}>
              <Download className="w-4 h-4" />
            </Button>
            {isSuperAdmin && companyName?.toLowerCase() === 'avisafe' && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/statistikk")} title="Plattformstatistikk">
                <BarChart3 className="w-4 h-4" />
              </Button>
            )}
            {isSuperAdmin && companyName?.toLowerCase() === 'avisafe' && (
              <Button variant="ghost" size="sm" onClick={() => navigate("/marketing")} title="Marketing">
                <Megaphone className="w-4 h-4" />
              </Button>
            )}
          </nav>
          
          <nav className="hidden lg:flex items-center gap-1 sm:gap-2 lg:gap-4 flex-shrink-0">
            {switcherCompanies.length > 0 && (
              <CompanySwitcher
                companies={switcherCompanies}
                currentCompanyId={companyId}
                onSwitch={handleCompanySwitch}
              />
            )}
            
            {/* Language toggle - Desktop */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="gap-1"
              title={displayLang === 'EN' ? 'Switch to English' : 'Bytt til norsk'}
            >
              <Globe className="w-4 h-4" />
              <span className="text-xs font-medium">{displayLang}</span>
            </Button>
            
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin")}
                className="relative h-8 w-8 p-0"
                title={t('nav.admin')}
              >
                <Settings className="w-4 h-4" />
                <PendingApprovalsBadge isAdmin={isAdmin} />
              </Button>
            )}
            <ProfileDialog />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              title={t('actions.signOut')}
              className="h-8 w-8 p-0"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </nav>
        </div>
      </div>
    </header>
  );
};
