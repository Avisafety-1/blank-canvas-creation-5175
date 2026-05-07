import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExpiringCompetency {
  id: string;
  navn: string;
  type: string;
  utloper_dato: string;
  daysUntilExpiry: number;
  profile_id: string;
  varsel_dager?: number | null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Checking for expiring competencies...');

    // Get all competencies with expiry dates
    const { data: competencies, error: compError } = await supabase
      .from('personnel_competencies')
      .select('id, navn, type, utloper_dato, profile_id, varsel_dager')
      .not('utloper_dato', 'is', null);

    if (compError) {
      console.error('Error fetching competencies:', compError);
      throw compError;
    }

    if (!competencies || competencies.length === 0) {
      console.log('No competencies with expiry dates found');
      return new Response(
        JSON.stringify({ success: true, checked: 0, notified: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all users with their notification preferences
    const { data: preferences, error: prefError } = await supabase
      .from('notification_preferences')
      .select('user_id, push_competency_expiry, inspection_reminder_days')
      .eq('push_enabled', true)
      .eq('push_competency_expiry', true);

    if (prefError) {
      console.error('Error fetching preferences:', prefError);
      throw prefError;
    }

    if (!preferences || preferences.length === 0) {
      console.log('No users with push competency expiry enabled');
      return new Response(
        JSON.stringify({ success: true, checked: competencies.length, notified: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a map of user preferences
    const userPrefsMap = new Map(preferences.map(p => [p.user_id, p]));

    const now = new Date();
    const usersToNotify: Map<string, ExpiringCompetency[]> = new Map();

    // Check each competency
    for (const comp of competencies) {
      const expiryDate = new Date(comp.utloper_dato);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Get user's preference
      const userPrefs = userPrefsMap.get(comp.profile_id);
      if (!userPrefs) continue;

      const reminderDays = (comp as any).varsel_dager ?? userPrefs.inspection_reminder_days ?? 14;

      // Check if within reminder window and not expired more than a week ago
      if (daysUntilExpiry <= reminderDays && daysUntilExpiry >= -7) {
        const expiringComp: ExpiringCompetency = {
          ...comp,
          daysUntilExpiry
        };

        if (!usersToNotify.has(comp.profile_id)) {
          usersToNotify.set(comp.profile_id, []);
        }
        usersToNotify.get(comp.profile_id)!.push(expiringComp);
      }
    }

    console.log(`Found ${usersToNotify.size} user(s) with expiring competencies`);

    let notificationsSent = 0;

    // Send push notifications to each user
    for (const [userId, expiringComps] of usersToNotify) {
      // Get user profile for name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();

      const competencyList = expiringComps.map(c => {
        if (c.daysUntilExpiry < 0) {
          return `${c.navn} (utløpt for ${Math.abs(c.daysUntilExpiry)} dager siden)`;
        } else if (c.daysUntilExpiry === 0) {
          return `${c.navn} (utløper i dag)`;
        } else {
          return `${c.navn} (${c.daysUntilExpiry} dager)`;
        }
      });

      const body = expiringComps.length === 1
        ? `Din kompetanse "${expiringComps[0].navn}" ${expiringComps[0].daysUntilExpiry <= 0 ? 'har utløpt' : `utløper om ${expiringComps[0].daysUntilExpiry} dager`}`
        : `Du har ${expiringComps.length} kompetanser som snart utløper: ${competencyList.slice(0, 3).join(', ')}${expiringComps.length > 3 ? '...' : ''}`;

      // Call send-push-notification function
      const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userId,
          title: 'Kompetanse utløper snart',
          body,
          url: '/', // Opens profile dialog
          tag: 'competency-expiry',
          data: { type: 'competency-expiry', competencies: expiringComps.map(c => c.id) }
        }
      });

      if (pushError) {
        console.error(`Error sending push to user ${userId}:`, pushError);
      } else {
        notificationsSent++;
        console.log(`Push sent to user ${userId} for ${expiringComps.length} expiring competencies`);
      }
    }

    console.log(`Competency check complete. Checked: ${competencies.length}, Notified: ${notificationsSent}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        checked: competencies.length, 
        notified: notificationsSent 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in check-competency-expiry:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
