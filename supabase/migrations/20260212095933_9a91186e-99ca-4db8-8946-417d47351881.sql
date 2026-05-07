
-- SQL function for platform statistics aggregation
-- This replaces fetching all rows and counting in JS

CREATE OR REPLACE FUNCTION public.get_platform_statistics(p_exclude_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_months text[];
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_now timestamptz := now();
  v_year int;
  v_mon int;
  v_month_label text;
  
  -- KPIs
  v_active_companies int;
  v_approved_users int;
  v_total_flights int;
  v_total_flight_minutes numeric;
  v_total_flight_hours numeric;
  v_total_incidents int;
  v_total_drones int;
  v_total_missions int;
  
  -- Extra metrics
  v_safesky_flights int;
  v_checklist_flights int;
  v_safesky_rate numeric;
  v_checklist_rate numeric;
  v_avg_flight_minutes numeric;
  v_incident_frequency numeric;
  
  -- Trend arrays
  v_flights_per_month jsonb := '[]'::jsonb;
  v_flight_hours_per_month jsonb := '[]'::jsonb;
  v_incidents_per_month jsonb := '[]'::jsonb;
  v_users_per_month jsonb := '[]'::jsonb;
  
  -- Distribution arrays
  v_incidents_by_severity jsonb;
  v_missions_by_status jsonb;
  
  -- Ranking arrays
  v_top_companies_hours jsonb;
  v_top_companies_missions jsonb;
BEGIN
  -- ---- KPIs ----
  SELECT count(*) INTO v_active_companies
  FROM companies
  WHERE aktiv = true
    AND (p_exclude_company_id IS NULL OR id != p_exclude_company_id);

  SELECT count(*) INTO v_approved_users
  FROM profiles
  WHERE approved = true
    AND (p_exclude_company_id IS NULL OR company_id != p_exclude_company_id);

  SELECT count(*),
         coalesce(sum(flight_duration_minutes), 0),
         count(*) FILTER (WHERE safesky_mode IS NOT NULL AND safesky_mode != 'none'),
         count(*) FILTER (WHERE completed_checklists IS NOT NULL AND array_length(completed_checklists, 1) > 0)
  INTO v_total_flights, v_total_flight_minutes, v_safesky_flights, v_checklist_flights
  FROM flight_logs
  WHERE (p_exclude_company_id IS NULL OR company_id != p_exclude_company_id);

  v_total_flight_hours := round((v_total_flight_minutes / 60.0)::numeric, 1);

  SELECT count(*) INTO v_total_incidents
  FROM incidents
  WHERE (p_exclude_company_id IS NULL OR company_id != p_exclude_company_id);

  SELECT count(*) INTO v_total_drones
  FROM drones
  WHERE (p_exclude_company_id IS NULL OR company_id != p_exclude_company_id);

  SELECT count(*) INTO v_total_missions
  FROM missions
  WHERE (p_exclude_company_id IS NULL OR company_id != p_exclude_company_id);

  -- Extra metrics
  v_safesky_rate := CASE WHEN v_total_flights > 0 
    THEN round((v_safesky_flights::numeric / v_total_flights * 100)::numeric, 1) ELSE 0 END;
  v_checklist_rate := CASE WHEN v_total_flights > 0 
    THEN round((v_checklist_flights::numeric / v_total_flights * 100)::numeric, 1) ELSE 0 END;
  v_avg_flight_minutes := CASE WHEN v_total_flights > 0 
    THEN round((v_total_flight_minutes / v_total_flights)::numeric, 0) ELSE 0 END;
  v_incident_frequency := CASE WHEN v_total_flight_hours > 0 
    THEN round((v_total_incidents::numeric / v_total_flight_hours * 100)::numeric, 2) ELSE 0 END;

  -- ---- Monthly trends (last 12 months) ----
  FOR i IN REVERSE 11..0 LOOP
    v_month_start := date_trunc('month', v_now - (i || ' months')::interval);
    v_month_end := (v_month_start + interval '1 month') - interval '1 second';
    v_year := extract(year FROM v_month_start)::int;
    v_mon := extract(month FROM v_month_start)::int;
    v_month_label := v_year || '-' || lpad(v_mon::text, 2, '0');

    -- Flights per month
    v_flights_per_month := v_flights_per_month || jsonb_build_object(
      'month', v_month_label,
      'count', (SELECT count(*) FROM flight_logs 
                WHERE flight_date >= v_month_start::date AND flight_date < (v_month_start + interval '1 month')::date
                AND (p_exclude_company_id IS NULL OR company_id != p_exclude_company_id))
    );

    -- Flight hours per month
    v_flight_hours_per_month := v_flight_hours_per_month || jsonb_build_object(
      'month', v_month_label,
      'hours', (SELECT round(coalesce(sum(flight_duration_minutes), 0) / 60.0, 1) FROM flight_logs 
                WHERE flight_date >= v_month_start::date AND flight_date < (v_month_start + interval '1 month')::date
                AND (p_exclude_company_id IS NULL OR company_id != p_exclude_company_id))
    );

    -- Incidents per month
    v_incidents_per_month := v_incidents_per_month || jsonb_build_object(
      'month', v_month_label,
      'count', (SELECT count(*) FROM incidents 
                WHERE hendelsestidspunkt >= v_month_start AND hendelsestidspunkt < v_month_start + interval '1 month'
                AND (p_exclude_company_id IS NULL OR company_id != p_exclude_company_id))
    );

    -- Users per month
    v_users_per_month := v_users_per_month || jsonb_build_object(
      'month', v_month_label,
      'count', (SELECT count(*) FROM profiles 
                WHERE created_at >= v_month_start AND created_at < v_month_start + interval '1 month'
                AND (p_exclude_company_id IS NULL OR company_id != p_exclude_company_id))
    );
  END LOOP;

  -- ---- Incidents by severity ----
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', alvorlighetsgrad, 'value', cnt)), '[]'::jsonb)
  INTO v_incidents_by_severity
  FROM (
    SELECT alvorlighetsgrad, count(*) as cnt
    FROM incidents
    WHERE (p_exclude_company_id IS NULL OR company_id != p_exclude_company_id)
    GROUP BY alvorlighetsgrad
  ) sub;

  -- ---- Missions by status ----
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', status, 'value', cnt)), '[]'::jsonb)
  INTO v_missions_by_status
  FROM (
    SELECT status, count(*) as cnt
    FROM missions
    WHERE (p_exclude_company_id IS NULL OR company_id != p_exclude_company_id)
    GROUP BY status
  ) sub;

  -- ---- Top 10 companies by flight hours ----
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', company_name, 'hours', flight_hours) ORDER BY flight_hours DESC), '[]'::jsonb)
  INTO v_top_companies_hours
  FROM (
    SELECT c.navn as company_name, 
           round(sum(fl.flight_duration_minutes) / 60.0, 1) as flight_hours
    FROM flight_logs fl
    JOIN companies c ON c.id = fl.company_id
    WHERE (p_exclude_company_id IS NULL OR fl.company_id != p_exclude_company_id)
    GROUP BY c.navn
    ORDER BY flight_hours DESC
    LIMIT 10
  ) sub;

  -- ---- Top 10 companies by missions ----
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', company_name, 'count', mission_count) ORDER BY mission_count DESC), '[]'::jsonb)
  INTO v_top_companies_missions
  FROM (
    SELECT c.navn as company_name, count(*) as mission_count
    FROM missions m
    JOIN companies c ON c.id = m.company_id
    WHERE (p_exclude_company_id IS NULL OR m.company_id != p_exclude_company_id)
    GROUP BY c.navn
    ORDER BY mission_count DESC
    LIMIT 10
  ) sub;

  -- ---- Build result ----
  result := jsonb_build_object(
    'kpis', jsonb_build_object(
      'activeCompanies', v_active_companies,
      'approvedUsers', v_approved_users,
      'totalFlights', v_total_flights,
      'totalFlightHours', v_total_flight_hours,
      'totalIncidents', v_total_incidents,
      'totalDrones', v_total_drones,
      'totalMissions', v_total_missions
    ),
    'trends', jsonb_build_object(
      'flightsPerMonth', v_flights_per_month,
      'flightHoursPerMonth', v_flight_hours_per_month,
      'incidentsPerMonth', v_incidents_per_month,
      'usersPerMonth', v_users_per_month
    ),
    'distributions', jsonb_build_object(
      'incidentsBySeverity', v_incidents_by_severity,
      'missionsByStatus', v_missions_by_status
    ),
    'rankings', jsonb_build_object(
      'topCompaniesByHours', v_top_companies_hours,
      'topCompaniesByMissions', v_top_companies_missions
    ),
    'metrics', jsonb_build_object(
      'safeskyRate', v_safesky_rate,
      'checklistRate', v_checklist_rate,
      'avgFlightMinutes', v_avg_flight_minutes,
      'incidentFrequency', v_incident_frequency
    )
  );

  RETURN result;
END;
$$;
