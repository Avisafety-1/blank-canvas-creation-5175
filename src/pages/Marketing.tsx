import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { MarketingSidebar, type MarketingSection } from "@/components/marketing/MarketingSidebar";
import { MarketingOverview } from "@/components/marketing/MarketingOverview";
import { MarketingIdeas } from "@/components/marketing/MarketingIdeas";
import { MarketingDrafts } from "@/components/marketing/MarketingDrafts";
import { MarketingVisuals } from "@/components/marketing/MarketingVisuals";
import { MarketingSettings } from "@/components/marketing/MarketingSettings";
import { MarketingNewsletter } from "@/components/marketing/MarketingNewsletter";

const Marketing = () => {
  const { isSuperAdmin, loading, user } = useAuth();
  const [section, setSection] = useState<MarketingSection>("overview");

  if (loading) return null;
  if (!user || !isSuperAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <div className="flex flex-1 flex-col md:flex-row">
        <MarketingSidebar active={section} onChange={setSection} />
        <main className="flex-1 p-3 sm:p-4 md:p-6 w-full">
          {section === "overview" && <MarketingOverview />}
          {section === "ideas" && <MarketingIdeas onNavigate={setSection} />}
          {section === "drafts" && <MarketingDrafts />}
          {section === "visuals" && <MarketingVisuals />}
          {section === "newsletter" && <MarketingNewsletter />}
          {section === "settings" && <MarketingSettings />}
        </main>
      </div>
    </div>
  );
};

export default Marketing;
