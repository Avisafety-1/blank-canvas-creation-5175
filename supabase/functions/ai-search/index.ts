import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, userId } = await req.json();
    
    if (!query || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing query or userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', userId)
      .single();

    if (!profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const companyId = profile.company_id;

    // Search across all relevant tables in parallel
    const [
      missions, incidents, documents, equipment, drones,
      competencies, sora, personnel, customers, news,
      flightLogs, calendarEvents
    ]: any[] = await Promise.all<any>([
      // Missions - includes merknader
      supabase
        .from('missions')
        .select('id, tittel, beskrivelse, lokasjon, status, tidspunkt')
        .eq('company_id', companyId)
        .or(`tittel.ilike.%${query}%,beskrivelse.ilike.%${query}%,lokasjon.ilike.%${query}%,merknader.ilike.%${query}%`)
        .limit(5),
      // Incidents - includes lokasjon, rapportert_av
      supabase
        .from('incidents')
        .select('id, tittel, beskrivelse, kategori, alvorlighetsgrad, status, lokasjon, rapportert_av')
        .eq('company_id', companyId)
        .or(`tittel.ilike.%${query}%,beskrivelse.ilike.%${query}%,lokasjon.ilike.%${query}%,rapportert_av.ilike.%${query}%`)
        .limit(5),
      // Documents - includes kategori
      supabase
        .from('documents')
        .select('id, tittel, beskrivelse, kategori')
        .eq('company_id', companyId)
        .or(`tittel.ilike.%${query}%,beskrivelse.ilike.%${query}%,kategori.ilike.%${query}%`)
        .limit(5),
      // Equipment - includes merknader, type
      supabase
        .from('equipment')
        .select('id, navn, type, serienummer, status')
        .eq('company_id', companyId)
        .or(`navn.ilike.%${query}%,serienummer.ilike.%${query}%,merknader.ilike.%${query}%,type.ilike.%${query}%`)
        .limit(5),
      // Drones - includes merknader
      supabase
        .from('drones')
        .select('id, modell, serienummer, status')
        .eq('company_id', companyId)
        .or(`modell.ilike.%${query}%,serienummer.ilike.%${query}%,merknader.ilike.%${query}%`)
        .limit(5),
      // Competencies
      supabase
        .from('personnel_competencies')
        .select('id, navn, type, beskrivelse, profile_id, profiles!inner(company_id)')
        .eq('profiles.company_id', companyId)
        .or(`navn.ilike.%${query}%,type.ilike.%${query}%,beskrivelse.ilike.%${query}%`)
        .limit(5),
      // SORA - direct text search
      supabase
        .from('mission_sora')
        .select('id, mission_id, sora_status, conops_summary')
        .eq('company_id', companyId)
        .or(`conops_summary.ilike.%${query}%,operational_limits.ilike.%${query}%`)
        .limit(5),
      // Personnel
      supabase
        .from('profiles')
        .select('id, full_name, email, tittel')
        .eq('company_id', companyId)
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,tittel.ilike.%${query}%`)
        .limit(5),
      // Customers
      supabase
        .from('customers')
        .select('id, navn, kontaktperson, epost, adresse')
        .eq('company_id', companyId)
        .or(`navn.ilike.%${query}%,kontaktperson.ilike.%${query}%,epost.ilike.%${query}%,adresse.ilike.%${query}%`)
        .limit(5),
      // News
      supabase
        .from('news')
        .select('id, tittel, innhold, publisert, forfatter')
        .eq('company_id', companyId)
        .or(`tittel.ilike.%${query}%,innhold.ilike.%${query}%`)
        .limit(5),
      // Flight Logs
      supabase
        .from('flight_logs')
        .select('id, departure_location, landing_location, notes, flight_date, flight_duration_minutes')
        .eq('company_id', companyId)
        .or(`departure_location.ilike.%${query}%,landing_location.ilike.%${query}%,notes.ilike.%${query}%`)
        .limit(5),
      // Calendar Events
      supabase
        .from('calendar_events')
        .select('id, title, description, event_date, event_time, type')
        .eq('company_id', companyId)
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(5),
    ]);

    // Gather matching personnel and customer IDs for relational lookups
    const personnelIds = (personnel.data || []).map((p: any) => p.id);
    const customerIds = (customers.data || []).map((c: any) => c.id);

    let allMissions: any[] = missions.data || [];
    let allIncidents: any[] = incidents.data || [];
    let allSora: any[] = sora.data || [];

    // Relational lookups when personnel or customers matched
    if (personnelIds.length > 0 || customerIds.length > 0) {
      const relQueries: any[] = [];

      // Find missions linked to matching personnel
      if (personnelIds.length > 0) {
        relQueries.push(
          supabase
            .from('mission_personnel')
            .select('mission_id')
            .in('profile_id', personnelIds)
        );
        // Find incidents where matching personnel is oppfolgingsansvarlig or user_id
        relQueries.push(
          supabase
            .from('incidents')
            .select('id, tittel, beskrivelse, kategori, alvorlighetsgrad, status, lokasjon, rapportert_av')
            .eq('company_id', companyId)
            .in('oppfolgingsansvarlig_id', personnelIds)
            .limit(10)
        );
        relQueries.push(
          supabase
            .from('incidents')
            .select('id, tittel, beskrivelse, kategori, alvorlighetsgrad, status, lokasjon, rapportert_av')
            .eq('company_id', companyId)
            .in('user_id', personnelIds)
            .limit(10)
        );
      }

      // Find missions linked to matching customers
      if (customerIds.length > 0) {
        relQueries.push(
          supabase
            .from('missions')
            .select('id, tittel, beskrivelse, lokasjon, status, tidspunkt')
            .eq('company_id', companyId)
            .in('customer_id', customerIds)
            .limit(10)
        );
      }

      const relResults = await Promise.all(relQueries);
      let idx = 0;

      if (personnelIds.length > 0) {
        // Mission personnel -> missions
        const missionPersonnelRows = relResults[idx]?.data || [];
        idx++;
        const missionIds = [...new Set(missionPersonnelRows.map((r: any) => r.mission_id))];
        const existingMissionIds = new Set(allMissions.map(m => m.id));
        const newMissionIds = missionIds.filter(id => !existingMissionIds.has(id));
        if (newMissionIds.length > 0) {
          const { data: linkedMissions } = await supabase
            .from('missions')
            .select('id, tittel, beskrivelse, lokasjon, status, tidspunkt')
            .eq('company_id', companyId)
            .in('id', newMissionIds)
            .limit(10);
          if (linkedMissions) allMissions = [...allMissions, ...linkedMissions];
        }

        // Incidents by oppfolgingsansvarlig_id
        const incByOppfolging = relResults[idx]?.data || [];
        idx++;
        // Incidents by user_id
        const incByUser = relResults[idx]?.data || [];
        idx++;

        const existingIncidentIds = new Set(allIncidents.map(i => i.id));
        for (const inc of [...incByOppfolging, ...incByUser]) {
          if (!existingIncidentIds.has(inc.id)) {
            allIncidents.push(inc);
            existingIncidentIds.add(inc.id);
          }
        }
      }

      if (customerIds.length > 0) {
        // Customer -> missions
        const customerMissions = relResults[idx]?.data || [];
        idx++;
        const existingMissionIds = new Set(allMissions.map(m => m.id));
        for (const m of customerMissions) {
          if (!existingMissionIds.has(m.id)) {
            allMissions.push(m);
            existingMissionIds.add(m.id);
          }
        }
      }

      // SORA: find SORA analyses for all matched missions
      const allMissionIds = allMissions.map(m => m.id);
      if (allMissionIds.length > 0) {
        const existingSoraIds = new Set(allSora.map(s => s.id));
        const { data: linkedSora } = await supabase
          .from('mission_sora')
          .select('id, mission_id, sora_status, conops_summary')
          .eq('company_id', companyId)
          .in('mission_id', allMissionIds)
          .limit(10);
        if (linkedSora) {
          for (const s of linkedSora) {
            if (!existingSoraIds.has(s.id)) {
              allSora.push(s);
              existingSoraIds.add(s.id);
            }
          }
        }
      }
    }

    // Build AI summary
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const resultsContext = `
Søkeresultater for "${query}":

Oppdrag (${allMissions.length}): ${allMissions.map(m => m.tittel).join(', ') || 'Ingen'}
Hendelser (${allIncidents.length}): ${allIncidents.map(i => i.tittel).join(', ') || 'Ingen'}
Dokumenter (${documents.data?.length || 0}): ${documents.data?.map((d: any) => d.tittel).join(', ') || 'Ingen'}
Utstyr (${equipment.data?.length || 0}): ${equipment.data?.map((e: any) => e.navn).join(', ') || 'Ingen'}
Droner (${drones.data?.length || 0}): ${drones.data?.map((d: any) => d.modell).join(', ') || 'Ingen'}
Kompetanse (${competencies.data?.length || 0}): ${competencies.data?.map((c: any) => c.navn).join(', ') || 'Ingen'}
SORA-analyser (${allSora.length}): ${allSora.map((s: any) => s.conops_summary || s.sora_status).join(', ') || 'Ingen'}
Personell (${personnel.data?.length || 0}): ${personnel.data?.map((p: any) => p.full_name).join(', ') || 'Ingen'}
Kunder (${customers.data?.length || 0}): ${customers.data?.map((c: any) => c.navn).join(', ') || 'Ingen'}
Nyheter (${news.data?.length || 0}): ${news.data?.map((n: any) => n.tittel).join(', ') || 'Ingen'}
Flylogger (${flightLogs.data?.length || 0}): ${flightLogs.data?.map((f: any) => `${f.departure_location} → ${f.landing_location}`).join(', ') || 'Ingen'}
Kalender (${calendarEvents.data?.length || 0}): ${calendarEvents.data?.map((c: any) => c.title).join(', ') || 'Ingen'}
`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Du er en assistent som hjelper til med å oppsummere søkeresultater. Svar kort og konsist på norsk.'
          },
          {
            role: 'user',
            content: `Lag en kort oppsummering (maks 2 setninger) av disse søkeresultatene:\n\n${resultsContext}`
          }
        ],
      }),
    });

    let aiSummary = '';
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      aiSummary = aiData.choices[0]?.message?.content || '';
    }

    return new Response(
      JSON.stringify({
        summary: aiSummary,
        results: {
          missions: allMissions,
          incidents: allIncidents,
          documents: documents.data || [],
          equipment: equipment.data || [],
          drones: drones.data || [],
          competencies: competencies.data || [],
          sora: allSora,
          personnel: personnel.data || [],
          customers: customers.data || [],
          news: news.data || [],
          flightLogs: flightLogs.data || [],
          calendarEvents: calendarEvents.data || [],
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-search:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
