import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEmailConfig, sanitizeSubject, formatSenderAddress } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/resend-email.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    const { data: longFlights, error: flightsError } = await supabase
      .from('active_flights')
      .select('id, profile_id, company_id, start_time, pilot_name, drone_id')
      .lt('start_time', threeHoursAgo)
      .is('long_flight_notified_at', null);

    if (flightsError) {
      console.error('Error fetching long flights:', flightsError);
      throw flightsError;
    }

    if (!longFlights || longFlights.length === 0) {
      console.log('No long-running flights found');
      return new Response(
        JSON.stringify({ success: true, notified: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${longFlights.length} flight(s) running over 3 hours`);

    let notifiedCount = 0;

    for (const flight of longFlights) {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(flight.profile_id);
        if (!user?.email) {
          console.warn(`No email for user ${flight.profile_id}, skipping`);
          continue;
        }

        const pilotName = flight.pilot_name || user.email;
        const startTime = new Date(flight.start_time);
        const durationHours = Math.round((Date.now() - startTime.getTime()) / (1000 * 60 * 60) * 10) / 10;
        const startFormatted = startTime.toLocaleString('nb-NO', {
          day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        });

        // 1. Send push notification
        try {
          await supabase.functions.invoke('send-push-notification', {
            body: {
              userId: flight.profile_id,
              title: 'Aktiv flytur pågår',
              body: `Du har en flytur som har vart over ${durationHours} timer. Har du glemt å avslutte?`,
              tag: 'long-flight-reminder',
              url: '/',
            },
          });
          console.log(`Push sent to ${flight.profile_id}`);
        } catch (pushErr) {
          console.error(`Push failed for ${flight.profile_id}:`, pushErr);
        }

        // 2. Send email via Resend
        try {
          const emailConfig = await getEmailConfig(flight.company_id);
          const fromName = emailConfig.fromName || 'AviSafe';
          const senderAddress = formatSenderAddress(fromName, emailConfig.fromEmail);

          const LOGO_URL = 'https://app.avisafe.no/avisafe-logo-text.png';
          const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align:center;padding:20px 20px 10px 20px;">
    <img src="${LOGO_URL}" alt="AviSafe" width="180" style="display:inline-block;max-width:180px;height:auto;border:0;" />
  </div>
  <div style="background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0; font-size: 20px;">⚠️ Påminnelse: Aktiv flytur</h1>
  </div>
  <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Hei ${pilotName},</p>
    <p>Du har en pågående flytur som ble startet <strong>${startFormatted}</strong> og har nå vart i over <strong>${durationHours} timer</strong>.</p>
    <p><strong>Har du glemt å avslutte den?</strong></p>
    <p>Logg inn i AviSafe for å avslutte flyturen hvis den er fullført.</p>
    <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">Denne e-posten ble sendt automatisk fordi en aktiv flytur har pågått i over 3 timer.</p>
  </div>
</body>
</html>`;

          await sendEmail({ from: senderAddress, to: user.email, subject: sanitizeSubject('Påminnelse: Du har en aktiv flytur'), html: htmlContent });
          console.log(`Email sent to ${user.email}`);
        } catch (emailErr) {
          console.error(`Email failed for ${flight.profile_id}:`, emailErr);
        }

        // 3. Mark as notified
        await supabase
          .from('active_flights')
          .update({ long_flight_notified_at: new Date().toISOString() })
          .eq('id', flight.id);

        notifiedCount++;
      } catch (flightErr) {
        console.error(`Error processing flight ${flight.id}:`, flightErr);
      }
    }

    console.log(`Notified ${notifiedCount}/${longFlights.length} pilots`);

    return new Response(
      JSON.stringify({ success: true, notified: notifiedCount, total: longFlights.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in check-long-flights:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
