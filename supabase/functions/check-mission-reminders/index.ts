import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Checking for upcoming missions...');

    const now = new Date();
    
    // Get missions that start within the next 48 hours (we'll filter by user preference later)
    const maxLookahead = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    
    const { data: missions, error: missionError } = await supabase
      .from('missions')
      .select(`
        id,
        tittel,
        lokasjon,
        tidspunkt,
        status,
        company_id,
        mission_personnel(profile_id)
      `)
      .in('status', ['Planlagt', 'Tildelt'])
      .gte('tidspunkt', now.toISOString())
      .lte('tidspunkt', maxLookahead.toISOString());

    if (missionError) {
      console.error('Error fetching missions:', missionError);
      throw missionError;
    }

    if (!missions || missions.length === 0) {
      console.log('No upcoming missions found');
      return new Response(
        JSON.stringify({ success: true, checked: 0, notified: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${missions.length} upcoming mission(s)`);

    // Get all users with push mission reminders enabled
    const { data: preferences, error: prefError } = await supabase
      .from('notification_preferences')
      .select('user_id, push_mission_reminder, mission_reminder_hours')
      .eq('push_enabled', true)
      .eq('push_mission_reminder', true);

    if (prefError) {
      console.error('Error fetching preferences:', prefError);
      throw prefError;
    }

    if (!preferences || preferences.length === 0) {
      console.log('No users with push mission reminders enabled');
      return new Response(
        JSON.stringify({ success: true, checked: missions.length, notified: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a map of user preferences
    const userPrefsMap = new Map(preferences.map(p => [p.user_id, p]));

    let notificationsSent = 0;

    // Process each mission
    for (const mission of missions) {
      const missionTime = new Date(mission.tidspunkt);
      const hoursUntilMission = (missionTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Get personnel assigned to this mission
      const personnelIds = mission.mission_personnel?.map((p: any) => p.profile_id) || [];
      
      if (personnelIds.length === 0) {
        continue;
      }

      // Check each assigned person
      for (const personId of personnelIds) {
        const userPrefs = userPrefsMap.get(personId);
        if (!userPrefs) continue;

        const reminderHours = userPrefs.mission_reminder_hours || 24;

        // Check if we're within the reminder window
        // We want to notify when hoursUntilMission is close to reminderHours (within 30 min window)
        const reminderWindowStart = reminderHours - 0.5;
        const reminderWindowEnd = reminderHours + 0.5;

        if (hoursUntilMission >= reminderWindowStart && hoursUntilMission <= reminderWindowEnd) {
          // Format time nicely
          const timeString = missionTime.toLocaleTimeString('no-NO', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Europe/Oslo'
          });
          const dateString = missionTime.toLocaleDateString('no-NO', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: 'Europe/Oslo'
          });

          const body = hoursUntilMission < 1
            ? `Oppdrag "${mission.tittel}" starter snart kl. ${timeString}`
            : hoursUntilMission < 24
              ? `Oppdrag "${mission.tittel}" starter i dag kl. ${timeString} (${mission.lokasjon})`
              : `Oppdrag "${mission.tittel}" starter ${dateString} kl. ${timeString}`;

          // Send push notification
          const { error: pushError } = await supabase.functions.invoke('send-push-notification', {
            body: {
              userId: personId,
              title: 'Oppdragspåminnelse',
              body,
              url: `/oppdrag?id=${mission.id}`,
              tag: `mission-reminder-${mission.id}`,
              data: { type: 'mission-reminder', missionId: mission.id }
            }
          });

          if (pushError) {
            console.error(`Error sending push to user ${personId}:`, pushError);
          } else {
            notificationsSent++;
            console.log(`Push sent to user ${personId} for mission ${mission.id}`);
          }
        }
      }
    }

    console.log(`Mission reminder check complete. Checked: ${missions.length}, Notified: ${notificationsSent}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        checked: missions.length, 
        notified: notificationsSent 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in check-mission-reminders:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
