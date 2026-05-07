import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting auto-complete missions check...');

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const oneDayAgoISO = oneDayAgo.toISOString();

    console.log(`Checking for missions with tidspunkt before: ${oneDayAgoISO}`);

    const { data: missionsToComplete, error: fetchError } = await supabase
      .from('missions')
      .select('id, tittel, tidspunkt, status, latitude, longitude')
      .not('status', 'in', '("Fullført","Avlyst")')
      .lt('tidspunkt', oneDayAgoISO);

    if (fetchError) {
      console.error('Error fetching missions:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${missionsToComplete?.length || 0} missions to auto-complete`);

    if (!missionsToComplete || missionsToComplete.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No missions to auto-complete',
          checked: 0,
          completed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auto-completed missions are by definition >24h old, so weather would be inaccurate.
    // Mark as unavailable instead of fetching current weather.
    let completedCount = 0;
    for (const mission of missionsToComplete) {
      const updatePayload: Record<string, any> = {
        status: 'Fullført',
        oppdatert_dato: new Date().toISOString(),
        weather_data_snapshot: {
          captured_at: new Date().toISOString(),
          unavailable: true,
          reason: 'historical',
          source: 'auto_complete',
        },
      };

      const { error: updateError } = await supabase
        .from('missions')
        .update(updatePayload)
        .eq('id', mission.id);

      if (updateError) {
        console.error(`Error updating mission ${mission.id}:`, updateError);
      } else {
        completedCount++;
        console.log(`  - ${mission.tittel} (${mission.id}) - status changed from ${mission.status} to Fullført (weather unavailable - historical)`);
      }
    }

    console.log(`Successfully auto-completed ${completedCount} missions`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Auto-completed ${completedCount} missions`,
        checked: missionsToComplete.length,
        completed: completedCount,
        missions: missionsToComplete.map(m => ({
          id: m.id,
          tittel: m.tittel,
          previous_status: m.status,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in auto-complete-missions function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
