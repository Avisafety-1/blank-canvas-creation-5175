import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface CalendarSubscription {
  id: string;
  token: string;
  created_at: string;
  last_accessed_at: string | null;
}

export function useCalendarSubscription() {
  const { user, companyId } = useAuth();
  const [subscription, setSubscription] = useState<CalendarSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const feedUrl = subscription
    ? `https://pmucsvrypogtttrajqxq.supabase.co/functions/v1/calendar-feed?token=${subscription.token}`
    : null;

  useEffect(() => {
    if (user) {
      fetchSubscription();
    } else {
      setSubscription(null);
      setLoading(false);
    }
  }, [user]);

  const fetchSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from("calendar_subscriptions")
        .select("id, token, created_at, last_accessed_at")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (error) throw error;
      setSubscription(data);
    } catch (error) {
      console.error("Error fetching subscription:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateSubscription = async () => {
    if (!user || !companyId) {
      toast.error("Du må være logget inn for å generere abonnementslenke");
      return;
    }

    setGenerating(true);
    try {
      // Generate a secure 64-character token
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

      const { data, error } = await supabase
        .from("calendar_subscriptions")
        .insert({
          user_id: user.id,
          company_id: companyId,
          token,
        })
        .select("id, token, created_at, last_accessed_at")
        .single();

      if (error) throw error;

      setSubscription(data);
      toast.success("Abonnementslenke generert!");
    } catch (error) {
      console.error("Error generating subscription:", error);
      toast.error("Kunne ikke generere abonnementslenke");
    } finally {
      setGenerating(false);
    }
  };

  const deleteSubscription = async () => {
    if (!subscription) return;

    try {
      const { error } = await supabase
        .from("calendar_subscriptions")
        .delete()
        .eq("id", subscription.id);

      if (error) throw error;

      setSubscription(null);
      toast.success("Abonnementslenke slettet");
    } catch (error) {
      console.error("Error deleting subscription:", error);
      toast.error("Kunne ikke slette abonnementslenke");
    }
  };

  const regenerateSubscription = async () => {
    if (subscription) {
      await deleteSubscription();
    }
    await generateSubscription();
  };

  const copyToClipboard = async () => {
    if (!feedUrl) return;

    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success("Lenke kopiert til utklippstavle");
    } catch {
      toast.error("Kunne ikke kopiere lenke");
    }
  };

  return {
    subscription,
    feedUrl,
    loading,
    generating,
    generateSubscription,
    deleteSubscription,
    regenerateSubscription,
    copyToClipboard,
  };
}
