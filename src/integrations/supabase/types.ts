export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      active_flights: {
        Row: {
          company_id: string
          created_at: string
          drone_id: string | null
          dronetag_device_id: string | null
          id: string
          long_flight_notified_at: string | null
          mission_id: string | null
          pilot_name: string | null
          profile_id: string
          publish_mode: string | null
          route_data: Json | null
          safesky_published: boolean | null
          start_lat: number | null
          start_lng: number | null
          start_time: string
        }
        Insert: {
          company_id: string
          created_at?: string
          drone_id?: string | null
          dronetag_device_id?: string | null
          id?: string
          long_flight_notified_at?: string | null
          mission_id?: string | null
          pilot_name?: string | null
          profile_id: string
          publish_mode?: string | null
          route_data?: Json | null
          safesky_published?: boolean | null
          start_lat?: number | null
          start_lng?: number | null
          start_time?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          drone_id?: string | null
          dronetag_device_id?: string | null
          id?: string
          long_flight_notified_at?: string | null
          mission_id?: string | null
          pilot_name?: string | null
          profile_id?: string
          publish_mode?: string | null
          route_data?: Json | null
          safesky_published?: boolean | null
          start_lat?: number | null
          start_lng?: number | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_flights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_flights_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_flights_dronetag_device_id_fkey"
            columns: ["dronetag_device_id"]
            isOneToOne: false
            referencedRelation: "dronetag_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_flights_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_flights_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_risk_assessment_jobs: {
        Row: {
          company_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          mission_id: string | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          mission_id?: string | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          mission_id?: string | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      aip_restriction_zones: {
        Row: {
          external_id: string | null
          geometry: unknown
          id: string
          is_official: boolean
          lower_limit: string | null
          name: string | null
          openaip_id: string | null
          properties: Json | null
          remarks: string | null
          source: string | null
          synced_at: string | null
          upper_limit: string | null
          zone_id: string
          zone_type: string
        }
        Insert: {
          external_id?: string | null
          geometry?: unknown
          id?: string
          is_official?: boolean
          lower_limit?: string | null
          name?: string | null
          openaip_id?: string | null
          properties?: Json | null
          remarks?: string | null
          source?: string | null
          synced_at?: string | null
          upper_limit?: string | null
          zone_id: string
          zone_type: string
        }
        Update: {
          external_id?: string | null
          geometry?: unknown
          id?: string
          is_official?: boolean
          lower_limit?: string | null
          name?: string | null
          openaip_id?: string | null
          properties?: Json | null
          remarks?: string | null
          source?: string | null
          synced_at?: string | null
          upper_limit?: string | null
          zone_id?: string
          zone_type?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      bulk_email_campaigns: {
        Row: {
          company_id: string | null
          emails_sent: number
          failed_emails: string[]
          html_content: string
          id: string
          recipient_type: string
          sent_at: string
          sent_by: string | null
          sent_to_emails: string[]
          subject: string
        }
        Insert: {
          company_id?: string | null
          emails_sent?: number
          failed_emails?: string[]
          html_content: string
          id?: string
          recipient_type: string
          sent_at?: string
          sent_by?: string | null
          sent_to_emails?: string[]
          subject: string
        }
        Update: {
          company_id?: string | null
          emails_sent?: number
          failed_emails?: string[]
          html_content?: string
          id?: string
          recipient_type?: string
          sent_at?: string
          sent_by?: string | null
          sent_to_emails?: string[]
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_email_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          event_date: string
          event_time: string | null
          id: string
          title: string
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          event_date: string
          event_time?: string | null
          id?: string
          title: string
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          event_date?: string
          event_time?: string | null
          id?: string
          title?: string
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_subscriptions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          last_accessed_at: string | null
          token: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          last_accessed_at?: string | null
          token: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          last_accessed_at?: string | null
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog_entries: {
        Row: {
          completed_at: string | null
          created_at: string | null
          description: string | null
          id: string
          priority: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      changelog_maintenance: {
        Row: {
          active: boolean
          id: string
          message: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          id?: string
          message?: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          id?: string
          message?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      changelog_systems: {
        Row: {
          description: string | null
          id: string
          name: string
          sort_order: number
          status: string
          updated_at: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          status?: string
          updated_at?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          adresse: string | null
          adresse_lat: number | null
          adresse_lon: number | null
          aktiv: boolean
          all_users_can_acknowledge_maintenance: boolean
          ardupilot_enabled: boolean
          before_takeoff_checklist_id: string | null
          before_takeoff_checklist_ids: string[] | null
          billing_user_id: string | null
          created_at: string
          departments_enabled: boolean
          deviation_report_enabled: boolean
          dji_auto_sync_enabled: boolean
          dji_flightlog_enabled: boolean
          dji_sync_from_date: string | null
          dronelog_api_key: string | null
          dronetag_enabled: boolean
          eccairs_enabled: boolean | null
          flighthub2_base_url: string | null
          flighthub2_token: string | null
          hide_reporter_identity: boolean
          id: string
          incident_reports_visible_to_all_companies: boolean
          kontakt_epost: string | null
          kontakt_telefon: string | null
          navn: string
          org_nummer: string | null
          parent_company_id: string | null
          prevent_self_approval: boolean
          propagate_airspace_warnings: boolean
          propagate_all_users_can_acknowledge_maintenance: boolean
          propagate_deviation_report: boolean
          propagate_fh2_credentials: boolean
          propagate_flight_alerts: boolean
          propagate_hide_reporter: boolean
          propagate_mission_approval: boolean
          propagate_mission_roles: boolean
          propagate_prevent_self_approval: boolean
          propagate_sora_approval: boolean
          propagate_sora_buffer_mode: boolean
          propagate_sora_config: boolean
          propagate_sora_required: boolean
          registration_code: string
          require_mission_approval: boolean
          require_sora_on_missions: boolean
          require_sora_steps: number
          safesky_callsign_prefix: string | null
          safesky_callsign_propagate: boolean
          safesky_callsign_variable: string
          selskapstype: string | null
          show_all_airspace_warnings: boolean
          stripe_exempt: boolean
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          adresse_lat?: number | null
          adresse_lon?: number | null
          aktiv?: boolean
          all_users_can_acknowledge_maintenance?: boolean
          ardupilot_enabled?: boolean
          before_takeoff_checklist_id?: string | null
          before_takeoff_checklist_ids?: string[] | null
          billing_user_id?: string | null
          created_at?: string
          departments_enabled?: boolean
          deviation_report_enabled?: boolean
          dji_auto_sync_enabled?: boolean
          dji_flightlog_enabled?: boolean
          dji_sync_from_date?: string | null
          dronelog_api_key?: string | null
          dronetag_enabled?: boolean
          eccairs_enabled?: boolean | null
          flighthub2_base_url?: string | null
          flighthub2_token?: string | null
          hide_reporter_identity?: boolean
          id?: string
          incident_reports_visible_to_all_companies?: boolean
          kontakt_epost?: string | null
          kontakt_telefon?: string | null
          navn: string
          org_nummer?: string | null
          parent_company_id?: string | null
          prevent_self_approval?: boolean
          propagate_airspace_warnings?: boolean
          propagate_all_users_can_acknowledge_maintenance?: boolean
          propagate_deviation_report?: boolean
          propagate_fh2_credentials?: boolean
          propagate_flight_alerts?: boolean
          propagate_hide_reporter?: boolean
          propagate_mission_approval?: boolean
          propagate_mission_roles?: boolean
          propagate_prevent_self_approval?: boolean
          propagate_sora_approval?: boolean
          propagate_sora_buffer_mode?: boolean
          propagate_sora_config?: boolean
          propagate_sora_required?: boolean
          registration_code: string
          require_mission_approval?: boolean
          require_sora_on_missions?: boolean
          require_sora_steps?: number
          safesky_callsign_prefix?: string | null
          safesky_callsign_propagate?: boolean
          safesky_callsign_variable?: string
          selskapstype?: string | null
          show_all_airspace_warnings?: boolean
          stripe_exempt?: boolean
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          adresse_lat?: number | null
          adresse_lon?: number | null
          aktiv?: boolean
          all_users_can_acknowledge_maintenance?: boolean
          ardupilot_enabled?: boolean
          before_takeoff_checklist_id?: string | null
          before_takeoff_checklist_ids?: string[] | null
          billing_user_id?: string | null
          created_at?: string
          departments_enabled?: boolean
          deviation_report_enabled?: boolean
          dji_auto_sync_enabled?: boolean
          dji_flightlog_enabled?: boolean
          dji_sync_from_date?: string | null
          dronelog_api_key?: string | null
          dronetag_enabled?: boolean
          eccairs_enabled?: boolean | null
          flighthub2_base_url?: string | null
          flighthub2_token?: string | null
          hide_reporter_identity?: boolean
          id?: string
          incident_reports_visible_to_all_companies?: boolean
          kontakt_epost?: string | null
          kontakt_telefon?: string | null
          navn?: string
          org_nummer?: string | null
          parent_company_id?: string | null
          prevent_self_approval?: boolean
          propagate_airspace_warnings?: boolean
          propagate_all_users_can_acknowledge_maintenance?: boolean
          propagate_deviation_report?: boolean
          propagate_fh2_credentials?: boolean
          propagate_flight_alerts?: boolean
          propagate_hide_reporter?: boolean
          propagate_mission_approval?: boolean
          propagate_mission_roles?: boolean
          propagate_prevent_self_approval?: boolean
          propagate_sora_approval?: boolean
          propagate_sora_buffer_mode?: boolean
          propagate_sora_config?: boolean
          propagate_sora_required?: boolean
          registration_code?: string
          require_mission_approval?: boolean
          require_sora_on_missions?: boolean
          require_sora_steps?: number
          safesky_callsign_prefix?: string | null
          safesky_callsign_propagate?: boolean
          safesky_callsign_variable?: string
          selskapstype?: string | null
          show_all_airspace_warnings?: boolean
          stripe_exempt?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_before_takeoff_checklist_id_fkey"
            columns: ["before_takeoff_checklist_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_fh2_credentials: {
        Row: {
          company_id: string
          created_at: string
          token_encrypted: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          token_encrypted: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          token_encrypted?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_fh2_credentials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_flight_alert_recipients: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          profile_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          profile_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_flight_alert_recipients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_flight_alerts: {
        Row: {
          alert_type: string
          company_id: string
          created_at: string | null
          enabled: boolean | null
          id: string
          threshold_value: number | null
        }
        Insert: {
          alert_type: string
          company_id: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          threshold_value?: number | null
        }
        Update: {
          alert_type?: string
          company_id?: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          threshold_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "company_flight_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_mission_roles: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_mission_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_sora_config: {
        Row: {
          allow_bvlos: boolean
          allow_night_flight: boolean
          company_id: string
          created_at: string
          default_buffer_mode: string
          default_flight_altitude_m: number
          default_flight_geography_m: number
          id: string
          linked_document_ids: string[]
          max_flight_altitude_m: number
          max_pilot_inactivity_days: number | null
          max_population_density_per_km2: number | null
          max_temp_c: number | null
          max_visibility_km: number
          max_wind_gust_ms: number
          max_wind_speed_ms: number
          min_temp_c: number | null
          operative_restrictions: string | null
          policy_notes: string | null
          require_backup_battery: boolean
          require_civil_twilight: boolean
          require_observer: boolean
          sora_approval_threshold: number
          sora_based_approval: boolean
          sora_hardstop_requires_approval: boolean
          updated_at: string
        }
        Insert: {
          allow_bvlos?: boolean
          allow_night_flight?: boolean
          company_id: string
          created_at?: string
          default_buffer_mode?: string
          default_flight_altitude_m?: number
          default_flight_geography_m?: number
          id?: string
          linked_document_ids?: string[]
          max_flight_altitude_m?: number
          max_pilot_inactivity_days?: number | null
          max_population_density_per_km2?: number | null
          max_temp_c?: number | null
          max_visibility_km?: number
          max_wind_gust_ms?: number
          max_wind_speed_ms?: number
          min_temp_c?: number | null
          operative_restrictions?: string | null
          policy_notes?: string | null
          require_backup_battery?: boolean
          require_civil_twilight?: boolean
          require_observer?: boolean
          sora_approval_threshold?: number
          sora_based_approval?: boolean
          sora_hardstop_requires_approval?: boolean
          updated_at?: string
        }
        Update: {
          allow_bvlos?: boolean
          allow_night_flight?: boolean
          company_id?: string
          created_at?: string
          default_buffer_mode?: string
          default_flight_altitude_m?: number
          default_flight_geography_m?: number
          id?: string
          linked_document_ids?: string[]
          max_flight_altitude_m?: number
          max_pilot_inactivity_days?: number | null
          max_population_density_per_km2?: number | null
          max_temp_c?: number | null
          max_visibility_km?: number
          max_wind_gust_ms?: number
          max_wind_speed_ms?: number
          min_temp_c?: number | null
          operative_restrictions?: string | null
          policy_notes?: string | null
          require_backup_battery?: boolean
          require_civil_twilight?: boolean
          require_observer?: boolean
          sora_approval_threshold?: number
          sora_based_approval?: boolean
          sora_hardstop_requires_approval?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_sora_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_subscriptions: {
        Row: {
          addons: string[]
          billing_user_id: string | null
          cancel_at_period_end: boolean
          company_id: string
          created_at: string
          current_period_end: string | null
          id: string
          is_trial: boolean
          plan: string
          seat_count: number
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          addons?: string[]
          billing_user_id?: string | null
          cancel_at_period_end?: boolean
          company_id: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          is_trial?: boolean
          plan?: string
          seat_count?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          addons?: string[]
          billing_user_id?: string | null
          cancel_at_period_end?: boolean
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          is_trial?: boolean
          plan?: string
          seat_count?: number
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          adresse: string | null
          aktiv: boolean
          company_id: string
          epost: string | null
          id: string
          intern_poc_id: string | null
          kontaktperson: string | null
          merknader: string | null
          navn: string
          oppdatert_dato: string
          opprettet_dato: string
          telefon: string | null
          user_id: string | null
        }
        Insert: {
          adresse?: string | null
          aktiv?: boolean
          company_id: string
          epost?: string | null
          id?: string
          intern_poc_id?: string | null
          kontaktperson?: string | null
          merknader?: string | null
          navn: string
          oppdatert_dato?: string
          opprettet_dato?: string
          telefon?: string | null
          user_id?: string | null
        }
        Update: {
          adresse?: string | null
          aktiv?: boolean
          company_id?: string
          epost?: string | null
          id?: string
          intern_poc_id?: string | null
          kontaktperson?: string | null
          merknader?: string | null
          navn?: string
          oppdatert_dato?: string
          opprettet_dato?: string
          telefon?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_intern_poc_id_fkey"
            columns: ["intern_poc_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deviation_report_categories: {
        Row: {
          company_id: string
          created_at: string
          id: string
          label: string
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          label: string
          parent_id?: string | null
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          label?: string
          parent_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "deviation_report_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deviation_report_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "deviation_report_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      dji_credentials: {
        Row: {
          auto_sync_enabled: boolean | null
          created_at: string | null
          dji_account_id: string | null
          dji_email: string
          dji_password_encrypted: string
          id: string
          last_sync_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          auto_sync_enabled?: boolean | null
          created_at?: string | null
          dji_account_id?: string | null
          dji_email: string
          dji_password_encrypted: string
          id?: string
          last_sync_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          auto_sync_enabled?: boolean | null
          created_at?: string | null
          dji_account_id?: string | null
          dji_email?: string
          dji_password_encrypted?: string
          id?: string
          last_sync_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      document_folder_items: {
        Row: {
          added_at: string | null
          document_id: string
          folder_id: string
          id: string
          tab_id: string | null
        }
        Insert: {
          added_at?: string | null
          document_id: string
          folder_id: string
          id?: string
          tab_id?: string | null
        }
        Update: {
          added_at?: string | null
          document_id?: string
          folder_id?: string
          id?: string
          tab_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_folder_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folder_items_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "document_folder_tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folder_tabs: {
        Row: {
          created_at: string
          folder_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          folder_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          folder_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_folder_tabs_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folders: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          visible_to_children: boolean
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          visible_to_children?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          visible_to_children?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          beskrivelse: string | null
          company_id: string
          fil_navn: string | null
          fil_storrelse: number | null
          fil_url: string | null
          global_visibility: boolean | null
          gyldig_til: string | null
          id: string
          kategori: string
          nettside_url: string | null
          oppdatert_dato: string | null
          opprettet_av: string | null
          opprettet_dato: string | null
          tittel: string
          user_id: string | null
          varsel_dager_for_utløp: number | null
          versjon: string | null
          visible_to_children: boolean | null
        }
        Insert: {
          beskrivelse?: string | null
          company_id: string
          fil_navn?: string | null
          fil_storrelse?: number | null
          fil_url?: string | null
          global_visibility?: boolean | null
          gyldig_til?: string | null
          id?: string
          kategori: string
          nettside_url?: string | null
          oppdatert_dato?: string | null
          opprettet_av?: string | null
          opprettet_dato?: string | null
          tittel: string
          user_id?: string | null
          varsel_dager_for_utløp?: number | null
          versjon?: string | null
          visible_to_children?: boolean | null
        }
        Update: {
          beskrivelse?: string | null
          company_id?: string
          fil_navn?: string | null
          fil_storrelse?: number | null
          fil_url?: string | null
          global_visibility?: boolean | null
          gyldig_til?: string | null
          id?: string
          kategori?: string
          nettside_url?: string | null
          oppdatert_dato?: string | null
          opprettet_av?: string | null
          opprettet_dato?: string | null
          tittel?: string
          user_id?: string | null
          varsel_dager_for_utløp?: number | null
          versjon?: string | null
          visible_to_children?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_accessories: {
        Row: {
          company_id: string
          created_at: string | null
          drone_id: string
          id: string
          navn: string
          neste_vedlikehold: string | null
          sist_vedlikehold: string | null
          updated_at: string | null
          user_id: string | null
          varsel_dager: number | null
          vedlikeholdsintervall_dager: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          drone_id: string
          id?: string
          navn: string
          neste_vedlikehold?: string | null
          sist_vedlikehold?: string | null
          updated_at?: string | null
          user_id?: string | null
          varsel_dager?: number | null
          vedlikeholdsintervall_dager?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          drone_id?: string
          id?: string
          navn?: string
          neste_vedlikehold?: string | null
          sist_vedlikehold?: string | null
          updated_at?: string | null
          user_id?: string | null
          varsel_dager?: number | null
          vedlikeholdsintervall_dager?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drone_accessories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_accessories_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_department_visibility: {
        Row: {
          company_id: string
          created_at: string
          drone_id: string
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          drone_id: string
          id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          drone_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drone_department_visibility_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_department_visibility_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_documents: {
        Row: {
          company_id: string
          created_at: string | null
          document_id: string
          drone_id: string
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          document_id: string
          drone_id: string
          id?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          document_id?: string
          drone_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drone_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_documents_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_equipment: {
        Row: {
          created_at: string | null
          drone_id: string
          equipment_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          drone_id: string
          equipment_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          drone_id?: string
          equipment_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drone_equipment_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_equipment_history: {
        Row: {
          action: string
          company_id: string
          created_at: string | null
          drone_id: string
          id: string
          item_id: string | null
          item_name: string
          item_type: string
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string | null
          drone_id: string
          id?: string
          item_id?: string | null
          item_name: string
          item_type: string
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string | null
          drone_id?: string
          id?: string
          item_id?: string | null
          item_name?: string
          item_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drone_equipment_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_equipment_history_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_inspections: {
        Row: {
          company_id: string
          created_at: string | null
          drone_id: string
          id: string
          inspection_date: string
          inspection_type: string | null
          notes: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          drone_id: string
          id?: string
          inspection_date: string
          inspection_type?: string | null
          notes?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          drone_id?: string
          id?: string
          inspection_date?: string
          inspection_type?: string | null
          notes?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drone_inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_inspections_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_log_entries: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          drone_id: string
          entry_date: string
          entry_type: string | null
          id: string
          image_url: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          drone_id: string
          entry_date: string
          entry_type?: string | null
          id?: string
          image_url?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          drone_id?: string
          entry_date?: string
          entry_type?: string | null
          id?: string
          image_url?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drone_log_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_log_entries_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_models: {
        Row: {
          category: string | null
          characteristic_dimension_m: number | null
          comment: string | null
          created_at: string | null
          endurance_min: number | null
          eu_class: string
          id: string
          max_speed_mps: number | null
          max_wind_mps: number | null
          name: string
          payload_kg: number
          sensor_type: string | null
          standard_takeoff_weight_kg: number | null
          weight_kg: number
          weight_without_payload_kg: number | null
        }
        Insert: {
          category?: string | null
          characteristic_dimension_m?: number | null
          comment?: string | null
          created_at?: string | null
          endurance_min?: number | null
          eu_class: string
          id?: string
          max_speed_mps?: number | null
          max_wind_mps?: number | null
          name: string
          payload_kg?: number
          sensor_type?: string | null
          standard_takeoff_weight_kg?: number | null
          weight_kg: number
          weight_without_payload_kg?: number | null
        }
        Update: {
          category?: string | null
          characteristic_dimension_m?: number | null
          comment?: string | null
          created_at?: string | null
          endurance_min?: number | null
          eu_class?: string
          id?: string
          max_speed_mps?: number | null
          max_wind_mps?: number | null
          name?: string
          payload_kg?: number
          sensor_type?: string | null
          standard_takeoff_weight_kg?: number | null
          weight_kg?: number
          weight_without_payload_kg?: number | null
        }
        Relationships: []
      }
      drone_personnel: {
        Row: {
          created_at: string | null
          drone_id: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string | null
          drone_id: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string | null
          drone_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drone_personnel_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drone_personnel_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drone_telemetry: {
        Row: {
          alt: number | null
          created_at: string | null
          drone_id: string | null
          id: string
          lat: number | null
          lon: number | null
          raw: Json | null
        }
        Insert: {
          alt?: number | null
          created_at?: string | null
          drone_id?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          raw?: Json | null
        }
        Update: {
          alt?: number | null
          created_at?: string | null
          drone_id?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          raw?: Json | null
        }
        Relationships: []
      }
      drones: {
        Row: {
          aktiv: boolean
          company_id: string
          flyvetimer: number
          hours_at_last_inspection: number | null
          id: string
          inspection_interval_days: number | null
          inspection_interval_hours: number | null
          inspection_interval_missions: number | null
          inspection_start_date: string | null
          internal_serial: string | null
          kjøpsdato: string | null
          klasse: string | null
          maintenance_notification_sent: boolean | null
          merknader: string | null
          missions_at_last_inspection: number | null
          modell: string
          neste_inspeksjon: string | null
          operations_checklist_id: string | null
          operations_checklist_ids: string[] | null
          oppdatert_dato: string
          opprettet_dato: string
          payload: number | null
          post_flight_checklist_id: string | null
          registration_number: string | null
          serienummer: string
          sist_inspeksjon: string | null
          sjekkliste_id: string | null
          status: string
          technical_responsible_id: string | null
          tilgjengelig: boolean
          user_id: string | null
          varsel_dager: number | null
          varsel_oppdrag: number | null
          varsel_timer: number | null
          vekt: number | null
        }
        Insert: {
          aktiv?: boolean
          company_id: string
          flyvetimer?: number
          hours_at_last_inspection?: number | null
          id?: string
          inspection_interval_days?: number | null
          inspection_interval_hours?: number | null
          inspection_interval_missions?: number | null
          inspection_start_date?: string | null
          internal_serial?: string | null
          kjøpsdato?: string | null
          klasse?: string | null
          maintenance_notification_sent?: boolean | null
          merknader?: string | null
          missions_at_last_inspection?: number | null
          modell: string
          neste_inspeksjon?: string | null
          operations_checklist_id?: string | null
          operations_checklist_ids?: string[] | null
          oppdatert_dato?: string
          opprettet_dato?: string
          payload?: number | null
          post_flight_checklist_id?: string | null
          registration_number?: string | null
          serienummer: string
          sist_inspeksjon?: string | null
          sjekkliste_id?: string | null
          status?: string
          technical_responsible_id?: string | null
          tilgjengelig?: boolean
          user_id?: string | null
          varsel_dager?: number | null
          varsel_oppdrag?: number | null
          varsel_timer?: number | null
          vekt?: number | null
        }
        Update: {
          aktiv?: boolean
          company_id?: string
          flyvetimer?: number
          hours_at_last_inspection?: number | null
          id?: string
          inspection_interval_days?: number | null
          inspection_interval_hours?: number | null
          inspection_interval_missions?: number | null
          inspection_start_date?: string | null
          internal_serial?: string | null
          kjøpsdato?: string | null
          klasse?: string | null
          maintenance_notification_sent?: boolean | null
          merknader?: string | null
          missions_at_last_inspection?: number | null
          modell?: string
          neste_inspeksjon?: string | null
          operations_checklist_id?: string | null
          operations_checklist_ids?: string[] | null
          oppdatert_dato?: string
          opprettet_dato?: string
          payload?: number | null
          post_flight_checklist_id?: string | null
          registration_number?: string | null
          serienummer?: string
          sist_inspeksjon?: string | null
          sjekkliste_id?: string | null
          status?: string
          technical_responsible_id?: string | null
          tilgjengelig?: boolean
          user_id?: string | null
          varsel_dager?: number | null
          varsel_oppdrag?: number | null
          varsel_timer?: number | null
          vekt?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "drones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drones_operations_checklist_id_fkey"
            columns: ["operations_checklist_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drones_post_flight_checklist_id_fkey"
            columns: ["post_flight_checklist_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drones_sjekkliste_id_fkey"
            columns: ["sjekkliste_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drones_technical_responsible_id_fkey"
            columns: ["technical_responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dronetag_devices: {
        Row: {
          callsign: string | null
          company_id: string | null
          created_at: string
          description: string | null
          device_id: string
          drone_id: string | null
          id: string
          kjopsdato: string | null
          name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          callsign?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          device_id: string
          drone_id?: string | null
          id?: string
          kjopsdato?: string | null
          name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          callsign?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          device_id?: string
          drone_id?: string | null
          id?: string
          kjopsdato?: string | null
          name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dronetag_devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dronetag_devices_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      dronetag_positions: {
        Row: {
          alt_agl: number | null
          alt_msl: number | null
          battery: number | null
          company_id: string | null
          created_at: string
          device_id: string
          heading: number | null
          id: string
          lat: number | null
          lng: number | null
          speed: number | null
          status: Json | null
          timestamp: string
          vert_speed: number | null
        }
        Insert: {
          alt_agl?: number | null
          alt_msl?: number | null
          battery?: number | null
          company_id?: string | null
          created_at?: string
          device_id: string
          heading?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          speed?: number | null
          status?: Json | null
          timestamp: string
          vert_speed?: number | null
        }
        Update: {
          alt_agl?: number | null
          alt_msl?: number | null
          battery?: number | null
          company_id?: string | null
          created_at?: string
          device_id?: string
          heading?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          speed?: number | null
          status?: Json | null
          timestamp?: string
          vert_speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dronetag_positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dronetag_positions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "dronetag_devices"
            referencedColumns: ["device_id"]
          },
        ]
      }
      eccairs_exports: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          e2_id: string | null
          e2_version: string | null
          environment: string
          id: string
          incident_id: string
          last_attempt_at: string | null
          last_error: string | null
          payload: Json | null
          response: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          e2_id?: string | null
          e2_version?: string | null
          environment?: string
          id?: string
          incident_id: string
          last_attempt_at?: string | null
          last_error?: string | null
          payload?: Json | null
          response?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          e2_id?: string | null
          e2_version?: string | null
          environment?: string
          id?: string
          incident_id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          payload?: Json | null
          response?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eccairs_exports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eccairs_exports_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      eccairs_integrations: {
        Row: {
          company_id: string
          created_at: string
          e2_base_url: string | null
          e2_client_id: string | null
          e2_client_secret_encrypted: string | null
          e2_scope: string | null
          enabled: boolean
          environment: string
          id: string
          reporting_entity_id: number | null
          responsible_entity_id: number | null
          responsible_entity_value_id: string | null
          taxonomy_version_id: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          e2_base_url?: string | null
          e2_client_id?: string | null
          e2_client_secret_encrypted?: string | null
          e2_scope?: string | null
          enabled?: boolean
          environment?: string
          id?: string
          reporting_entity_id?: number | null
          responsible_entity_id?: number | null
          responsible_entity_value_id?: string | null
          taxonomy_version_id?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          e2_base_url?: string | null
          e2_client_id?: string | null
          e2_client_secret_encrypted?: string | null
          e2_scope?: string | null
          enabled?: boolean
          environment?: string
          id?: string
          reporting_entity_id?: number | null
          responsible_entity_id?: number | null
          responsible_entity_value_id?: string | null
          taxonomy_version_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eccairs_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean | null
          from_email: string | null
          from_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_template_attachments: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          template_id: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          template_id: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_template_attachments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_template_attachments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          subject: string
          template_type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          id?: string
          subject: string
          template_type: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          subject?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          aktiv: boolean
          battery_cycles: number | null
          battery_full_capacity_mah: number | null
          battery_health_pct: number | null
          battery_max_cell_deviation_v: number | null
          company_id: string
          flyvetimer: number
          hours_at_last_maintenance: number | null
          id: string
          inspection_interval_hours: number | null
          inspection_interval_missions: number | null
          internal_serial: string | null
          merknader: string | null
          missions_at_last_maintenance: number | null
          navn: string
          neste_vedlikehold: string | null
          oppdatert_dato: string
          opprettet_dato: string
          serienummer: string
          sist_vedlikeholdt: string | null
          sjekkliste_id: string | null
          status: string
          tilgjengelig: boolean
          type: string
          user_id: string | null
          varsel_dager: number | null
          varsel_oppdrag: number | null
          varsel_timer: number | null
          vedlikehold_startdato: string | null
          vedlikeholdsintervall_dager: number | null
          vekt: number | null
        }
        Insert: {
          aktiv?: boolean
          battery_cycles?: number | null
          battery_full_capacity_mah?: number | null
          battery_health_pct?: number | null
          battery_max_cell_deviation_v?: number | null
          company_id: string
          flyvetimer?: number
          hours_at_last_maintenance?: number | null
          id?: string
          inspection_interval_hours?: number | null
          inspection_interval_missions?: number | null
          internal_serial?: string | null
          merknader?: string | null
          missions_at_last_maintenance?: number | null
          navn: string
          neste_vedlikehold?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          serienummer: string
          sist_vedlikeholdt?: string | null
          sjekkliste_id?: string | null
          status?: string
          tilgjengelig?: boolean
          type: string
          user_id?: string | null
          varsel_dager?: number | null
          varsel_oppdrag?: number | null
          varsel_timer?: number | null
          vedlikehold_startdato?: string | null
          vedlikeholdsintervall_dager?: number | null
          vekt?: number | null
        }
        Update: {
          aktiv?: boolean
          battery_cycles?: number | null
          battery_full_capacity_mah?: number | null
          battery_health_pct?: number | null
          battery_max_cell_deviation_v?: number | null
          company_id?: string
          flyvetimer?: number
          hours_at_last_maintenance?: number | null
          id?: string
          inspection_interval_hours?: number | null
          inspection_interval_missions?: number | null
          internal_serial?: string | null
          merknader?: string | null
          missions_at_last_maintenance?: number | null
          navn?: string
          neste_vedlikehold?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          serienummer?: string
          sist_vedlikeholdt?: string | null
          sjekkliste_id?: string | null
          status?: string
          tilgjengelig?: boolean
          type?: string
          user_id?: string | null
          varsel_dager?: number | null
          varsel_oppdrag?: number | null
          varsel_timer?: number | null
          vedlikehold_startdato?: string | null
          vedlikeholdsintervall_dager?: number | null
          vekt?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_sjekkliste_id_fkey"
            columns: ["sjekkliste_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_department_visibility: {
        Row: {
          company_id: string
          created_at: string
          equipment_id: string
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          equipment_id: string
          id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          equipment_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_department_visibility_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_department_visibility_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_log_entries: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          entry_date: string
          entry_type: string | null
          equipment_id: string
          id: string
          image_url: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          entry_date: string
          entry_type?: string | null
          equipment_id: string
          id?: string
          image_url?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          entry_date?: string
          entry_type?: string | null
          equipment_id?: string
          id?: string
          image_url?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_log_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_log_entries_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_events: {
        Row: {
          company_id: string
          created_at: string | null
          flight_log_id: string
          id: string
          message: string | null
          raw_field: string | null
          raw_value: string | null
          t_offset_ms: number | null
          type: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          flight_log_id: string
          id?: string
          message?: string | null
          raw_field?: string | null
          raw_value?: string | null
          t_offset_ms?: number | null
          type: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          flight_log_id?: string
          id?: string
          message?: string | null
          raw_field?: string | null
          raw_value?: string | null
          t_offset_ms?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_events_flight_log_id_fkey"
            columns: ["flight_log_id"]
            isOneToOne: false
            referencedRelation: "flight_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_log_equipment: {
        Row: {
          equipment_id: string
          flight_log_id: string
          id: string
        }
        Insert: {
          equipment_id: string
          flight_log_id: string
          id?: string
        }
        Update: {
          equipment_id?: string
          flight_log_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_log_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_log_equipment_flight_log_id_fkey"
            columns: ["flight_log_id"]
            isOneToOne: false
            referencedRelation: "flight_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_log_personnel: {
        Row: {
          flight_log_id: string
          id: string
          profile_id: string
        }
        Insert: {
          flight_log_id: string
          id?: string
          profile_id: string
        }
        Update: {
          flight_log_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_log_personnel_flight_log_id_fkey"
            columns: ["flight_log_id"]
            isOneToOne: false
            referencedRelation: "flight_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_log_personnel_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_logs: {
        Row: {
          aircraft_serial: string | null
          battery_cell_deviation_max_v: number | null
          battery_cycles: number | null
          battery_full_capacity_mah: number | null
          battery_health_pct: number | null
          battery_sn: string | null
          battery_temp_max_c: number | null
          battery_temp_min_c: number | null
          battery_voltage_min_v: number | null
          company_id: string
          completed_checklists: string[] | null
          created_at: string | null
          departure_location: string
          drone_id: string | null
          drone_model: string | null
          dronelog_sha256: string | null
          dronelog_warnings: Json | null
          dronetag_device_id: string | null
          end_time_utc: string | null
          flight_date: string
          flight_duration_minutes: number
          flight_track: Json | null
          gps_sat_max: number | null
          gps_sat_min: number | null
          id: string
          landing_location: string
          max_distance_m: number | null
          max_height_m: number | null
          max_horiz_speed_ms: number | null
          max_vert_speed_ms: number | null
          mission_id: string | null
          movements: number
          notes: string | null
          operation_type: string
          rth_triggered: boolean | null
          safesky_mode: string | null
          source: string | null
          start_time_utc: string | null
          total_distance_m: number | null
          user_id: string | null
        }
        Insert: {
          aircraft_serial?: string | null
          battery_cell_deviation_max_v?: number | null
          battery_cycles?: number | null
          battery_full_capacity_mah?: number | null
          battery_health_pct?: number | null
          battery_sn?: string | null
          battery_temp_max_c?: number | null
          battery_temp_min_c?: number | null
          battery_voltage_min_v?: number | null
          company_id: string
          completed_checklists?: string[] | null
          created_at?: string | null
          departure_location: string
          drone_id?: string | null
          drone_model?: string | null
          dronelog_sha256?: string | null
          dronelog_warnings?: Json | null
          dronetag_device_id?: string | null
          end_time_utc?: string | null
          flight_date?: string
          flight_duration_minutes: number
          flight_track?: Json | null
          gps_sat_max?: number | null
          gps_sat_min?: number | null
          id?: string
          landing_location: string
          max_distance_m?: number | null
          max_height_m?: number | null
          max_horiz_speed_ms?: number | null
          max_vert_speed_ms?: number | null
          mission_id?: string | null
          movements?: number
          notes?: string | null
          operation_type?: string
          rth_triggered?: boolean | null
          safesky_mode?: string | null
          source?: string | null
          start_time_utc?: string | null
          total_distance_m?: number | null
          user_id?: string | null
        }
        Update: {
          aircraft_serial?: string | null
          battery_cell_deviation_max_v?: number | null
          battery_cycles?: number | null
          battery_full_capacity_mah?: number | null
          battery_health_pct?: number | null
          battery_sn?: string | null
          battery_temp_max_c?: number | null
          battery_temp_min_c?: number | null
          battery_voltage_min_v?: number | null
          company_id?: string
          completed_checklists?: string[] | null
          created_at?: string | null
          departure_location?: string
          drone_id?: string | null
          drone_model?: string | null
          dronelog_sha256?: string | null
          dronelog_warnings?: Json | null
          dronetag_device_id?: string | null
          end_time_utc?: string | null
          flight_date?: string
          flight_duration_minutes?: number
          flight_track?: Json | null
          gps_sat_max?: number | null
          gps_sat_min?: number | null
          id?: string
          landing_location?: string
          max_distance_m?: number | null
          max_height_m?: number | null
          max_horiz_speed_ms?: number | null
          max_vert_speed_ms?: number | null
          mission_id?: string | null
          movements?: number
          notes?: string | null
          operation_type?: string
          rth_triggered?: boolean | null
          safesky_mode?: string | null
          source?: string | null
          start_time_utc?: string | null
          total_distance_m?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_logs_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_logs_dronetag_device_id_fkey"
            columns: ["dronetag_device_id"]
            isOneToOne: false
            referencedRelation: "dronetag_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_logs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_cause_types: {
        Row: {
          aktiv: boolean
          beskrivelse: string | null
          created_at: string | null
          id: string
          navn: string
          rekkefolge: number
        }
        Insert: {
          aktiv?: boolean
          beskrivelse?: string | null
          created_at?: string | null
          id?: string
          navn: string
          rekkefolge?: number
        }
        Update: {
          aktiv?: boolean
          beskrivelse?: string | null
          created_at?: string | null
          id?: string
          navn?: string
          rekkefolge?: number
        }
        Relationships: []
      }
      incident_comments: {
        Row: {
          comment_text: string
          created_at: string
          created_by_name: string
          id: string
          incident_id: string
          user_id: string | null
        }
        Insert: {
          comment_text: string
          created_at?: string
          created_by_name: string
          id?: string
          incident_id: string
          user_id?: string | null
        }
        Update: {
          comment_text?: string
          created_at?: string
          created_by_name?: string
          id?: string
          incident_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_comments_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_contributing_causes: {
        Row: {
          aktiv: boolean
          beskrivelse: string | null
          created_at: string | null
          id: string
          navn: string
          rekkefolge: number
        }
        Insert: {
          aktiv?: boolean
          beskrivelse?: string | null
          created_at?: string | null
          id?: string
          navn: string
          rekkefolge?: number
        }
        Update: {
          aktiv?: boolean
          beskrivelse?: string | null
          created_at?: string | null
          id?: string
          navn?: string
          rekkefolge?: number
        }
        Relationships: []
      }
      incident_eccairs_attributes: {
        Row: {
          attribute_code: number
          created_at: string
          entity_path: string | null
          format: string | null
          id: string
          incident_id: string
          payload_json: Json | null
          source: string | null
          taxonomy_code: string | null
          text_value: string | null
          updated_at: string
          value_id: string | null
        }
        Insert: {
          attribute_code: number
          created_at?: string
          entity_path?: string | null
          format?: string | null
          id?: string
          incident_id: string
          payload_json?: Json | null
          source?: string | null
          taxonomy_code?: string | null
          text_value?: string | null
          updated_at?: string
          value_id?: string | null
        }
        Update: {
          attribute_code?: number
          created_at?: string
          entity_path?: string | null
          format?: string | null
          id?: string
          incident_id?: string
          payload_json?: Json | null
          source?: string | null
          taxonomy_code?: string | null
          text_value?: string | null
          updated_at?: string
          value_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_eccairs_attributes_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_eccairs_mappings: {
        Row: {
          aircraft_category: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          event_types: string[] | null
          headline: string | null
          id: string
          incident_id: string
          latitude: number | null
          location_name: string | null
          longitude: number | null
          narrative: string | null
          occurrence_class: string | null
          phase_of_flight: string | null
          updated_at: string | null
        }
        Insert: {
          aircraft_category?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          event_types?: string[] | null
          headline?: string | null
          id?: string
          incident_id: string
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          narrative?: string | null
          occurrence_class?: string | null
          phase_of_flight?: string | null
          updated_at?: string | null
        }
        Update: {
          aircraft_category?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          event_types?: string[] | null
          headline?: string | null
          id?: string
          incident_id?: string
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          narrative?: string | null
          occurrence_class?: string | null
          phase_of_flight?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_eccairs_mappings_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: true
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          alvorlighetsgrad: string
          beskrivelse: string | null
          bilde_url: string | null
          company_id: string
          drone_id: string | null
          equipment_ids: string[] | null
          hendelsestidspunkt: string
          hovedaarsak: string | null
          id: string
          incident_number: string | null
          kategori: string | null
          lokasjon: string | null
          medvirkende_aarsak: string | null
          mission_id: string | null
          oppdatert_dato: string | null
          oppfolgingsansvarlig_id: string | null
          opprettet_dato: string | null
          pilot_id: string | null
          rapportert_av: string | null
          reported_anonymously: boolean
          status: string
          tittel: string
          user_id: string | null
        }
        Insert: {
          alvorlighetsgrad: string
          beskrivelse?: string | null
          bilde_url?: string | null
          company_id: string
          drone_id?: string | null
          equipment_ids?: string[] | null
          hendelsestidspunkt: string
          hovedaarsak?: string | null
          id?: string
          incident_number?: string | null
          kategori?: string | null
          lokasjon?: string | null
          medvirkende_aarsak?: string | null
          mission_id?: string | null
          oppdatert_dato?: string | null
          oppfolgingsansvarlig_id?: string | null
          opprettet_dato?: string | null
          pilot_id?: string | null
          rapportert_av?: string | null
          reported_anonymously?: boolean
          status?: string
          tittel: string
          user_id?: string | null
        }
        Update: {
          alvorlighetsgrad?: string
          beskrivelse?: string | null
          bilde_url?: string | null
          company_id?: string
          drone_id?: string | null
          equipment_ids?: string[] | null
          hendelsestidspunkt?: string
          hovedaarsak?: string | null
          id?: string
          incident_number?: string | null
          kategori?: string | null
          lokasjon?: string | null
          medvirkende_aarsak?: string | null
          mission_id?: string | null
          oppdatert_dato?: string | null
          oppfolgingsansvarlig_id?: string | null
          opprettet_dato?: string | null
          pilot_id?: string | null
          rapportert_av?: string | null
          reported_anonymously?: boolean
          status?: string
          tittel?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_oppfolgingsansvarlig_id_fkey"
            columns: ["oppfolgingsansvarlig_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_tokens: {
        Row: {
          access_token_encrypted: string
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          member_urn: string
          refresh_token_encrypted: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          member_urn: string
          refresh_token_encrypted?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          member_urn?: string
          refresh_token_encrypted?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "linkedin_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_chunks: {
        Row: {
          chunk_index: number
          chunk_text: string
          created_at: string
          embedding: string | null
          id: string
          manual_id: string
          section_heading: string | null
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          chunk_text: string
          created_at?: string
          embedding?: string | null
          id?: string
          manual_id: string
          section_heading?: string | null
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          created_at?: string
          embedding?: string | null
          id?: string
          manual_id?: string
          section_heading?: string | null
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_chunks_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      manuals: {
        Row: {
          company_id: string
          created_at: string
          file_size: number | null
          file_url: string
          id: string
          page_count: number | null
          title: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          file_size?: number | null
          file_url: string
          id?: string
          page_count?: number | null
          title: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_size?: number | null
          file_url?: string
          id?: string
          page_count?: number | null
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manuals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      map_viewer_heartbeats: {
        Row: {
          created_at: string
          id: string
          last_seen: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen?: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_seen?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      marketing_content_ideas: {
        Row: {
          ai_generated: boolean | null
          category: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          category?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          category?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_content_ideas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_drafts: {
        Row: {
          ai_generated: boolean | null
          company_id: string
          content: string | null
          created_at: string | null
          created_by: string | null
          id: string
          idea_id: string | null
          metadata: Json | null
          platform: string | null
          published_at: string | null
          scheduled_at: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          company_id: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          idea_id?: string | null
          metadata?: Json | null
          platform?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          company_id?: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          idea_id?: string | null
          metadata?: Json | null
          platform?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_drafts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_drafts_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "marketing_content_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_media: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          draft_id: string | null
          file_url: string
          id: string
          image_format: string | null
          layout_template: string | null
          media_type: string
          metadata: Json | null
          source_type: string
          subtitle: string | null
          title: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          draft_id?: string | null
          file_url: string
          id?: string
          image_format?: string | null
          layout_template?: string | null
          media_type?: string
          metadata?: Json | null
          source_type?: string
          subtitle?: string | null
          title?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          draft_id?: string | null
          file_url?: string
          id?: string
          image_format?: string | null
          layout_template?: string | null
          media_type?: string
          metadata?: Json | null
          source_type?: string
          subtitle?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_media_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_media_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "marketing_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_deviation_reports: {
        Row: {
          category_ids: string[]
          category_path: string[]
          comment: string | null
          company_id: string
          created_at: string
          flight_log_id: string | null
          flight_phase: string | null
          id: string
          mission_id: string
          reported_by: string | null
        }
        Insert: {
          category_ids?: string[]
          category_path?: string[]
          comment?: string | null
          company_id: string
          created_at?: string
          flight_log_id?: string | null
          flight_phase?: string | null
          id?: string
          mission_id: string
          reported_by?: string | null
        }
        Update: {
          category_ids?: string[]
          category_path?: string[]
          comment?: string | null
          company_id?: string
          created_at?: string
          flight_log_id?: string | null
          flight_phase?: string | null
          id?: string
          mission_id?: string
          reported_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_deviation_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_deviation_reports_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_deviation_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_documents: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          mission_id: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          mission_id: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          mission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_documents_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_drones: {
        Row: {
          created_at: string | null
          drone_id: string
          id: string
          mission_id: string
        }
        Insert: {
          created_at?: string | null
          drone_id: string
          id?: string
          mission_id: string
        }
        Update: {
          created_at?: string | null
          drone_id?: string
          id?: string
          mission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_drones_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_drones_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_equipment: {
        Row: {
          equipment_id: string
          id: string
          mission_id: string
        }
        Insert: {
          equipment_id: string
          id?: string
          mission_id: string
        }
        Update: {
          equipment_id?: string
          id?: string
          mission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_equipment_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_personnel: {
        Row: {
          id: string
          mission_id: string
          profile_id: string
          role_id: string | null
        }
        Insert: {
          id?: string
          mission_id: string
          profile_id: string
          role_id?: string | null
        }
        Update: {
          id?: string
          mission_id?: string
          profile_id?: string
          role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_personnel_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_personnel_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_personnel_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_mission_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_risk_assessments: {
        Row: {
          ai_analysis: Json
          airspace_score: number | null
          airspace_warnings: Json | null
          company_id: string
          created_at: string
          equipment_score: number | null
          id: string
          mission_complexity_score: number | null
          mission_id: string
          overall_score: number | null
          pilot_comments: Json | null
          pilot_experience_score: number | null
          pilot_id: string | null
          pilot_inputs: Json | null
          recommendation: string
          sora_output: Json | null
          weather_data: Json | null
          weather_score: number | null
        }
        Insert: {
          ai_analysis: Json
          airspace_score?: number | null
          airspace_warnings?: Json | null
          company_id: string
          created_at?: string
          equipment_score?: number | null
          id?: string
          mission_complexity_score?: number | null
          mission_id: string
          overall_score?: number | null
          pilot_comments?: Json | null
          pilot_experience_score?: number | null
          pilot_id?: string | null
          pilot_inputs?: Json | null
          recommendation: string
          sora_output?: Json | null
          weather_data?: Json | null
          weather_score?: number | null
        }
        Update: {
          ai_analysis?: Json
          airspace_score?: number | null
          airspace_warnings?: Json | null
          company_id?: string
          created_at?: string
          equipment_score?: number | null
          id?: string
          mission_complexity_score?: number | null
          mission_id?: string
          overall_score?: number | null
          pilot_comments?: Json | null
          pilot_experience_score?: number | null
          pilot_id?: string | null
          pilot_inputs?: Json | null
          recommendation?: string
          sora_output?: Json | null
          weather_data?: Json | null
          weather_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_risk_assessments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_risk_assessments_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_risk_assessments_pilot_id_fkey"
            columns: ["pilot_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_sora: {
        Row: {
          airspace_mitigations: string | null
          approved_at: string | null
          approved_by: string | null
          arc_initial: string | null
          arc_residual: string | null
          company_id: string
          conops_summary: string | null
          created_at: string
          environment: string | null
          fgrc: number | null
          ground_mitigations: string | null
          id: string
          igrc: number | null
          mission_id: string
          operational_limits: string | null
          prepared_at: string | null
          prepared_by: string | null
          residual_risk_comment: string | null
          residual_risk_level: string | null
          sail: string | null
          sora_status: string
          updated_at: string
        }
        Insert: {
          airspace_mitigations?: string | null
          approved_at?: string | null
          approved_by?: string | null
          arc_initial?: string | null
          arc_residual?: string | null
          company_id: string
          conops_summary?: string | null
          created_at?: string
          environment?: string | null
          fgrc?: number | null
          ground_mitigations?: string | null
          id?: string
          igrc?: number | null
          mission_id: string
          operational_limits?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          residual_risk_comment?: string | null
          residual_risk_level?: string | null
          sail?: string | null
          sora_status?: string
          updated_at?: string
        }
        Update: {
          airspace_mitigations?: string | null
          approved_at?: string | null
          approved_by?: string | null
          arc_initial?: string | null
          arc_residual?: string | null
          company_id?: string
          conops_summary?: string | null
          created_at?: string
          environment?: string | null
          fgrc?: number | null
          ground_mitigations?: string | null
          id?: string
          igrc?: number | null
          mission_id?: string
          operational_limits?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          residual_risk_comment?: string | null
          residual_risk_level?: string | null
          sail?: string | null
          sora_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_sora_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_sora_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_sora_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_sora_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          approval_comment: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          approver_comments: Json
          beskrivelse: string | null
          checklist_completed_ids: string[]
          checklist_ids: string[]
          company_id: string
          customer_id: string | null
          id: string
          latitude: number | null
          lokasjon: string
          longitude: number | null
          merknader: string | null
          ninox_approved: boolean | null
          notam_area_name: string | null
          notam_center_lat_wgs84: number | null
          notam_center_lon_wgs84: number | null
          notam_end_utc: string | null
          notam_max_agl_ft: number | null
          notam_operation_type: string | null
          notam_radius_nm: number | null
          notam_realtime_contact_name: string | null
          notam_realtime_contact_phone: string | null
          notam_schedule_days: string[] | null
          notam_schedule_type: string | null
          notam_schedule_windows: Json | null
          notam_start_utc: string | null
          notam_submitted_at: string | null
          notam_submitter_company: string | null
          notam_submitter_name: string | null
          notam_text: string | null
          oppdatert_dato: string
          opprettet_dato: string
          risk_nivå: string
          route: Json | null
          slutt_tidspunkt: string | null
          status: string
          submitted_for_approval_at: string | null
          tidspunkt: string
          tittel: string
          user_id: string | null
          weather_data_snapshot: Json | null
        }
        Insert: {
          approval_comment?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          approver_comments?: Json
          beskrivelse?: string | null
          checklist_completed_ids?: string[]
          checklist_ids?: string[]
          company_id: string
          customer_id?: string | null
          id?: string
          latitude?: number | null
          lokasjon: string
          longitude?: number | null
          merknader?: string | null
          ninox_approved?: boolean | null
          notam_area_name?: string | null
          notam_center_lat_wgs84?: number | null
          notam_center_lon_wgs84?: number | null
          notam_end_utc?: string | null
          notam_max_agl_ft?: number | null
          notam_operation_type?: string | null
          notam_radius_nm?: number | null
          notam_realtime_contact_name?: string | null
          notam_realtime_contact_phone?: string | null
          notam_schedule_days?: string[] | null
          notam_schedule_type?: string | null
          notam_schedule_windows?: Json | null
          notam_start_utc?: string | null
          notam_submitted_at?: string | null
          notam_submitter_company?: string | null
          notam_submitter_name?: string | null
          notam_text?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          risk_nivå?: string
          route?: Json | null
          slutt_tidspunkt?: string | null
          status?: string
          submitted_for_approval_at?: string | null
          tidspunkt: string
          tittel: string
          user_id?: string | null
          weather_data_snapshot?: Json | null
        }
        Update: {
          approval_comment?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          approver_comments?: Json
          beskrivelse?: string | null
          checklist_completed_ids?: string[]
          checklist_ids?: string[]
          company_id?: string
          customer_id?: string | null
          id?: string
          latitude?: number | null
          lokasjon?: string
          longitude?: number | null
          merknader?: string | null
          ninox_approved?: boolean | null
          notam_area_name?: string | null
          notam_center_lat_wgs84?: number | null
          notam_center_lon_wgs84?: number | null
          notam_end_utc?: string | null
          notam_max_agl_ft?: number | null
          notam_operation_type?: string | null
          notam_radius_nm?: number | null
          notam_realtime_contact_name?: string | null
          notam_realtime_contact_phone?: string | null
          notam_schedule_days?: string[] | null
          notam_schedule_type?: string | null
          notam_schedule_windows?: Json | null
          notam_start_utc?: string | null
          notam_submitted_at?: string | null
          notam_submitter_company?: string | null
          notam_submitter_name?: string | null
          notam_text?: string | null
          oppdatert_dato?: string
          opprettet_dato?: string
          risk_nivå?: string
          route?: Json | null
          slutt_tidspunkt?: string | null
          status?: string
          submitted_for_approval_at?: string | null
          tidspunkt?: string
          tittel?: string
          user_id?: string | null
          weather_data_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "missions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_alerts: {
        Row: {
          alert_type: string
          details: Json | null
          id: string
          sent_at: string
          severity: string
          subject: string
        }
        Insert: {
          alert_type: string
          details?: Json | null
          id?: string
          sent_at?: string
          severity?: string
          subject: string
        }
        Update: {
          alert_type?: string
          details?: Json | null
          id?: string
          sent_at?: string
          severity?: string
          subject?: string
        }
        Relationships: []
      }
      monitoring_config: {
        Row: {
          auth_failures_per_10m: number
          db_errors_per_10m: number
          edge_5xx_per_10m: number
          edge_p95_ms: number
          enabled: boolean
          errors_per_ip_per_10m: number
          id: number
          latency_p95_alert_enabled: boolean
          rate_limit_per_10m: number
          recipient_emails: string[]
          request_volume_per_10m: number
          request_volume_spike_factor: number
          updated_at: string
        }
        Insert: {
          auth_failures_per_10m?: number
          db_errors_per_10m?: number
          edge_5xx_per_10m?: number
          edge_p95_ms?: number
          enabled?: boolean
          errors_per_ip_per_10m?: number
          id?: number
          latency_p95_alert_enabled?: boolean
          rate_limit_per_10m?: number
          recipient_emails?: string[]
          request_volume_per_10m?: number
          request_volume_spike_factor?: number
          updated_at?: string
        }
        Update: {
          auth_failures_per_10m?: number
          db_errors_per_10m?: number
          edge_5xx_per_10m?: number
          edge_p95_ms?: number
          enabled?: boolean
          errors_per_ip_per_10m?: number
          id?: number
          latency_p95_alert_enabled?: boolean
          rate_limit_per_10m?: number
          recipient_emails?: string[]
          request_volume_per_10m?: number
          request_volume_spike_factor?: number
          updated_at?: string
        }
        Relationships: []
      }
      naturvern_zones: {
        Row: {
          description: string | null
          external_id: string | null
          geometry: unknown
          id: string
          name: string | null
          properties: Json | null
          synced_at: string | null
          updated_at: string | null
          verneform: string | null
        }
        Insert: {
          description?: string | null
          external_id?: string | null
          geometry?: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
          verneform?: string | null
        }
        Update: {
          description?: string | null
          external_id?: string | null
          geometry?: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
          verneform?: string | null
        }
        Relationships: []
      }
      news: {
        Row: {
          company_id: string
          forfatter: string
          id: string
          innhold: string
          oppdatert_dato: string
          opprettet_dato: string
          pin_on_top: boolean
          publisert: string
          synlighet: string
          tittel: string
          user_id: string | null
          visible_to_children: boolean | null
        }
        Insert: {
          company_id: string
          forfatter: string
          id?: string
          innhold: string
          oppdatert_dato?: string
          opprettet_dato?: string
          pin_on_top?: boolean
          publisert?: string
          synlighet?: string
          tittel: string
          user_id?: string | null
          visible_to_children?: boolean | null
        }
        Update: {
          company_id?: string
          forfatter?: string
          id?: string
          innhold?: string
          oppdatert_dato?: string
          opprettet_dato?: string
          pin_on_top?: boolean
          publisert?: string
          synlighet?: string
          tittel?: string
          user_id?: string | null
          visible_to_children?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "news_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_broadcasts: {
        Row: {
          created_at: string | null
          created_by: string | null
          html_content: string
          id: string
          resend_broadcast_id: string | null
          sent_at: string | null
          status: string | null
          subject: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          html_content: string
          id?: string
          resend_broadcast_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          html_content?: string
          id?: string
          resend_broadcast_id?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
        }
        Relationships: []
      }
      newsletter_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          html_content: string
          id: string
          name: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          html_content: string
          id?: string
          name: string
          subject?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          html_content?: string
          id?: string
          name?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      notam_rss_feeds: {
        Row: {
          created_at: string
          enabled: boolean
          feed_url: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feed_url: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feed_url?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      notams: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          country_code: string | null
          created_at: string
          effective_end: string | null
          effective_end_interpretation: string | null
          effective_start: string | null
          fetched_at: string
          geometry: unknown
          geometry_geojson: Json | null
          id: string
          location: string | null
          maximum_fl: number | null
          minimum_fl: number | null
          notam_id: string
          notam_text: string | null
          notam_type: string | null
          number: number
          properties: Json | null
          purpose: string | null
          qcode: string | null
          scope: string | null
          series: string | null
          traffic: string | null
          year: number
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          country_code?: string | null
          created_at?: string
          effective_end?: string | null
          effective_end_interpretation?: string | null
          effective_start?: string | null
          fetched_at?: string
          geometry?: unknown
          geometry_geojson?: Json | null
          id?: string
          location?: string | null
          maximum_fl?: number | null
          minimum_fl?: number | null
          notam_id: string
          notam_text?: string | null
          notam_type?: string | null
          number: number
          properties?: Json | null
          purpose?: string | null
          qcode?: string | null
          scope?: string | null
          series?: string | null
          traffic?: string | null
          year: number
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          country_code?: string | null
          created_at?: string
          effective_end?: string | null
          effective_end_interpretation?: string | null
          effective_start?: string | null
          fetched_at?: string
          geometry?: unknown
          geometry_geojson?: Json | null
          id?: string
          location?: string | null
          maximum_fl?: number | null
          minimum_fl?: number | null
          notam_id?: string
          notam_text?: string | null
          notam_type?: string | null
          number?: number
          properties?: Json | null
          purpose?: string | null
          qcode?: string | null
          scope?: string | null
          series?: string | null
          traffic?: string | null
          year?: number
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_child_document_expiry: boolean
          email_child_incidents: boolean
          email_child_maintenance_reminder: boolean
          email_child_missions: boolean
          email_child_new_user_pending: boolean
          email_document_expiry: boolean
          email_followup_assigned: boolean
          email_inspection_reminder: boolean
          email_mission_approval: boolean
          email_new_incident: boolean
          email_new_mission: boolean
          email_new_user_pending: boolean
          id: string
          inspection_reminder_days: number
          mission_reminder_hours: number | null
          push_competency_expiry: boolean | null
          push_document_expiry: boolean | null
          push_enabled: boolean | null
          push_maintenance_reminder: boolean | null
          push_mission_reminder: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_child_document_expiry?: boolean
          email_child_incidents?: boolean
          email_child_maintenance_reminder?: boolean
          email_child_missions?: boolean
          email_child_new_user_pending?: boolean
          email_document_expiry?: boolean
          email_followup_assigned?: boolean
          email_inspection_reminder?: boolean
          email_mission_approval?: boolean
          email_new_incident?: boolean
          email_new_mission?: boolean
          email_new_user_pending?: boolean
          id?: string
          inspection_reminder_days?: number
          mission_reminder_hours?: number | null
          push_competency_expiry?: boolean | null
          push_document_expiry?: boolean | null
          push_enabled?: boolean | null
          push_maintenance_reminder?: boolean | null
          push_mission_reminder?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_child_document_expiry?: boolean
          email_child_incidents?: boolean
          email_child_maintenance_reminder?: boolean
          email_child_missions?: boolean
          email_child_new_user_pending?: boolean
          email_document_expiry?: boolean
          email_followup_assigned?: boolean
          email_inspection_reminder?: boolean
          email_mission_approval?: boolean
          email_new_incident?: boolean
          email_new_mission?: boolean
          email_new_user_pending?: boolean
          id?: string
          inspection_reminder_days?: number
          mission_reminder_hours?: number | null
          push_competency_expiry?: boolean | null
          push_document_expiry?: boolean | null
          push_enabled?: boolean | null
          push_maintenance_reminder?: boolean | null
          push_mission_reminder?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nsm_restriction_zones: {
        Row: {
          created_at: string | null
          description: string | null
          external_id: string | null
          geometry: unknown
          id: string
          name: string | null
          properties: Json | null
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry?: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      openaip_obstacles: {
        Row: {
          elevation: number | null
          geometry: unknown
          height_agl: number | null
          id: string
          name: string | null
          openaip_id: string
          properties: Json | null
          synced_at: string | null
          type: string | null
        }
        Insert: {
          elevation?: number | null
          geometry?: unknown
          height_agl?: number | null
          id?: string
          name?: string | null
          openaip_id: string
          properties?: Json | null
          synced_at?: string | null
          type?: string | null
        }
        Update: {
          elevation?: number | null
          geometry?: unknown
          height_agl?: number | null
          id?: string
          name?: string | null
          openaip_id?: string
          properties?: Json | null
          synced_at?: string | null
          type?: string | null
        }
        Relationships: []
      }
      passkeys: {
        Row: {
          counter: number | null
          created_at: string | null
          credential_id: string
          device_name: string | null
          id: string
          public_key: string
          transports: string[] | null
          user_id: string
        }
        Insert: {
          counter?: number | null
          created_at?: string | null
          credential_id: string
          device_name?: string | null
          id?: string
          public_key: string
          transports?: string[] | null
          user_id: string
        }
        Update: {
          counter?: number | null
          created_at?: string | null
          credential_id?: string
          device_name?: string | null
          id?: string
          public_key?: string
          transports?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      pending_dji_logs: {
        Row: {
          aircraft_name: string | null
          aircraft_sn: string | null
          company_id: string
          created_at: string
          dji_log_id: string
          duration_seconds: number | null
          error_code: string | null
          error_message: string | null
          flight_date: string | null
          id: string
          last_error_at: string | null
          matched_battery_id: string | null
          matched_drone_id: string | null
          max_height_m: number | null
          parsed_result: Json | null
          processed_flight_log_id: string | null
          retry_count: number
          sn_mismatch_suggestion: Json | null
          source_file_type: string | null
          status: string
          total_distance_m: number | null
          user_id: string
        }
        Insert: {
          aircraft_name?: string | null
          aircraft_sn?: string | null
          company_id: string
          created_at?: string
          dji_log_id: string
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          flight_date?: string | null
          id?: string
          last_error_at?: string | null
          matched_battery_id?: string | null
          matched_drone_id?: string | null
          max_height_m?: number | null
          parsed_result?: Json | null
          processed_flight_log_id?: string | null
          retry_count?: number
          sn_mismatch_suggestion?: Json | null
          source_file_type?: string | null
          status?: string
          total_distance_m?: number | null
          user_id: string
        }
        Update: {
          aircraft_name?: string | null
          aircraft_sn?: string | null
          company_id?: string
          created_at?: string
          dji_log_id?: string
          duration_seconds?: number | null
          error_code?: string | null
          error_message?: string | null
          flight_date?: string | null
          id?: string
          last_error_at?: string | null
          matched_battery_id?: string | null
          matched_drone_id?: string | null
          max_height_m?: number | null
          parsed_result?: Json | null
          processed_flight_log_id?: string | null
          retry_count?: number
          sn_mismatch_suggestion?: Json | null
          source_file_type?: string | null
          status?: string
          total_distance_m?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_dji_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_dji_logs_matched_battery_id_fkey"
            columns: ["matched_battery_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_dji_logs_matched_drone_id_fkey"
            columns: ["matched_drone_id"]
            isOneToOne: false
            referencedRelation: "drones"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_competencies: {
        Row: {
          beskrivelse: string | null
          fil_url: string | null
          id: string
          navn: string
          oppdatert_dato: string
          opprettet_dato: string
          påvirker_status: boolean
          profile_id: string
          type: string
          utloper_dato: string | null
          utstedt_dato: string | null
          varsel_dager: number
        }
        Insert: {
          beskrivelse?: string | null
          fil_url?: string | null
          id?: string
          navn: string
          oppdatert_dato?: string
          opprettet_dato?: string
          påvirker_status?: boolean
          profile_id: string
          type: string
          utloper_dato?: string | null
          utstedt_dato?: string | null
          varsel_dager?: number
        }
        Update: {
          beskrivelse?: string | null
          fil_url?: string | null
          id?: string
          navn?: string
          oppdatert_dato?: string
          opprettet_dato?: string
          påvirker_status?: boolean
          profile_id?: string
          type?: string
          utloper_dato?: string | null
          utstedt_dato?: string | null
          varsel_dager?: number
        }
        Relationships: [
          {
            foreignKeyName: "personnel_competencies_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel_log_entries: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          entry_date: string
          entry_type: string | null
          id: string
          image_url: string | null
          profile_id: string
          title: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          entry_date: string
          entry_type?: string | null
          id?: string
          image_url?: string | null
          profile_id: string
          title: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          entry_date?: string
          entry_type?: string | null
          id?: string
          image_url?: string | null
          profile_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personnel_log_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personnel_log_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          adresse: string | null
          approval_company_ids: string[] | null
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          can_access_eccairs: boolean
          can_approve_missions: boolean
          can_be_incident_responsible: boolean
          company_id: string
          created_at: string | null
          email: string | null
          flyvetimer: number | null
          full_name: string | null
          id: string
          incident_responsible_company_ids: string[] | null
          is_technical_responsible: boolean | null
          nødkontakt_navn: string | null
          nødkontakt_telefon: string | null
          signature_url: string | null
          telefon: string | null
          tittel: string | null
          training_module_access: string[]
          uas_operator_number: string | null
          under_training: boolean
          updated_at: string | null
          weekly_report_unsubscribed: boolean
        }
        Insert: {
          adresse?: string | null
          approval_company_ids?: string[] | null
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          can_access_eccairs?: boolean
          can_approve_missions?: boolean
          can_be_incident_responsible?: boolean
          company_id: string
          created_at?: string | null
          email?: string | null
          flyvetimer?: number | null
          full_name?: string | null
          id: string
          incident_responsible_company_ids?: string[] | null
          is_technical_responsible?: boolean | null
          nødkontakt_navn?: string | null
          nødkontakt_telefon?: string | null
          signature_url?: string | null
          telefon?: string | null
          tittel?: string | null
          training_module_access?: string[]
          uas_operator_number?: string | null
          under_training?: boolean
          updated_at?: string | null
          weekly_report_unsubscribed?: boolean
        }
        Update: {
          adresse?: string | null
          approval_company_ids?: string[] | null
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          can_access_eccairs?: boolean
          can_approve_missions?: boolean
          can_be_incident_responsible?: boolean
          company_id?: string
          created_at?: string | null
          email?: string | null
          flyvetimer?: number | null
          full_name?: string | null
          id?: string
          incident_responsible_company_ids?: string[] | null
          is_technical_responsible?: boolean | null
          nødkontakt_navn?: string | null
          nødkontakt_telefon?: string | null
          signature_url?: string | null
          telefon?: string | null
          tittel?: string | null
          training_module_access?: string[]
          uas_operator_number?: string | null
          under_training?: boolean
          updated_at?: string | null
          weekly_report_unsubscribed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          company_id: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          company_id: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          company_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_calculator_scenarios: {
        Row: {
          company_id: string | null
          id: string
          scenarios: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id?: string | null
          id?: string
          scenarios?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string | null
          id?: string
          scenarios?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_calculator_scenarios_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rpas_5km_zones: {
        Row: {
          created_at: string | null
          description: string | null
          external_id: string | null
          geometry: unknown
          id: string
          name: string | null
          properties: Json | null
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry?: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rpas_ctr_tiz: {
        Row: {
          created_at: string | null
          description: string | null
          external_id: string | null
          geometry: unknown
          id: string
          name: string | null
          properties: Json | null
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          external_id?: string | null
          geometry?: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      safesky_beacons: {
        Row: {
          altitude: number | null
          beacon_type: string | null
          callsign: string | null
          course: number | null
          ground_speed: number | null
          id: string
          latitude: number
          longitude: number
          updated_at: string | null
          vertical_speed: number | null
        }
        Insert: {
          altitude?: number | null
          beacon_type?: string | null
          callsign?: string | null
          course?: number | null
          ground_speed?: number | null
          id: string
          latitude: number
          longitude: number
          updated_at?: string | null
          vertical_speed?: number | null
        }
        Update: {
          altitude?: number | null
          beacon_type?: string | null
          callsign?: string | null
          course?: number | null
          ground_speed?: number | null
          id?: string
          latitude?: number
          longitude?: number
          updated_at?: string | null
          vertical_speed?: number | null
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      terrain_elevation_cache: {
        Row: {
          created_at: string | null
          elevation: number
          lat_lng_key: string
        }
        Insert: {
          created_at?: string | null
          elevation: number
          lat_lng_key: string
        }
        Update: {
          created_at?: string | null
          elevation?: number
          lat_lng_key?: string
        }
        Relationships: []
      }
      training_assignments: {
        Row: {
          assigned_at: string
          company_id: string
          competency_id: string | null
          completed_at: string | null
          course_id: string
          id: string
          passed: boolean | null
          profile_id: string
          saved_answers: Json | null
          score: number | null
        }
        Insert: {
          assigned_at?: string
          company_id: string
          competency_id?: string | null
          completed_at?: string | null
          course_id: string
          id?: string
          passed?: boolean | null
          profile_id: string
          saved_answers?: Json | null
          score?: number | null
        }
        Update: {
          assigned_at?: string
          company_id?: string
          competency_id?: string | null
          completed_at?: string | null
          course_id?: string
          id?: string
          passed?: boolean | null
          profile_id?: string
          saved_answers?: Json | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_assignments_competency_id_fkey"
            columns: ["competency_id"]
            isOneToOne: false
            referencedRelation: "personnel_competencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_course_folders: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          visible_to_children: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          visible_to_children?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          visible_to_children?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "training_course_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      training_courses: {
        Row: {
          available_to_all: boolean
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          display_mode: string
          folder_id: string | null
          fullscreen: boolean
          global_visibility: boolean
          id: string
          passing_score: number
          pptx_file_url: string | null
          shared_with_parent: boolean
          source_manual_id: string | null
          status: string
          title: string
          unlocks_modules: string[]
          updated_at: string
          validity_months: number | null
          visible_to_children: boolean
        }
        Insert: {
          available_to_all?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_mode?: string
          folder_id?: string | null
          fullscreen?: boolean
          global_visibility?: boolean
          id?: string
          passing_score?: number
          pptx_file_url?: string | null
          shared_with_parent?: boolean
          source_manual_id?: string | null
          status?: string
          title: string
          unlocks_modules?: string[]
          updated_at?: string
          validity_months?: number | null
          visible_to_children?: boolean
        }
        Update: {
          available_to_all?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_mode?: string
          folder_id?: string | null
          fullscreen?: boolean
          global_visibility?: boolean
          id?: string
          passing_score?: number
          pptx_file_url?: string | null
          shared_with_parent?: boolean
          source_manual_id?: string | null
          status?: string
          title?: string
          unlocks_modules?: string[]
          updated_at?: string
          validity_months?: number | null
          visible_to_children?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "training_courses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_courses_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "training_course_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_courses_source_manual_id_fkey"
            columns: ["source_manual_id"]
            isOneToOne: false
            referencedRelation: "manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      training_question_options: {
        Row: {
          id: string
          is_correct: boolean
          option_text: string
          question_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          is_correct?: boolean
          option_text: string
          question_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          is_correct?: boolean
          option_text?: string
          question_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "training_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_questions: {
        Row: {
          content_json: Json | null
          course_id: string
          created_at: string
          id: string
          image_url: string | null
          question_text: string
          slide_type: string
          sort_order: number
          video_end_seconds: number | null
          video_required_complete: boolean
          video_start_seconds: number | null
          video_url: string | null
        }
        Insert: {
          content_json?: Json | null
          course_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          question_text: string
          slide_type?: string
          sort_order?: number
          video_end_seconds?: number | null
          video_required_complete?: boolean
          video_start_seconds?: number | null
          video_url?: string | null
        }
        Update: {
          content_json?: Json | null
          course_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          question_text?: string
          slide_type?: string
          sort_order?: number
          video_end_seconds?: number | null
          video_required_complete?: boolean
          video_start_seconds?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_questions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_companies: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vern_restriction_zones: {
        Row: {
          description: string | null
          external_id: string | null
          geometry: unknown
          id: string
          name: string | null
          properties: Json | null
          restriction_type: string | null
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          description?: string | null
          external_id?: string | null
          geometry?: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          restriction_type?: string | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          description?: string | null
          external_id?: string | null
          geometry?: unknown
          id?: string
          name?: string | null
          properties?: Json | null
          restriction_type?: string | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      weekly_report_sends: {
        Row: {
          company_id: string
          error_message: string | null
          id: string
          iso_week: number
          iso_year: number
          recipient_email: string
          recipient_user_id: string
          scope_label: string
          sent_at: string
          status: string
        }
        Insert: {
          company_id: string
          error_message?: string | null
          id?: string
          iso_week: number
          iso_year: number
          recipient_email: string
          recipient_user_id: string
          scope_label: string
          sent_at?: string
          status?: string
        }
        Update: {
          company_id?: string
          error_message?: string | null
          id?: string
          iso_week?: number
          iso_year?: number
          recipient_email?: string
          recipient_user_id?: string
          scope_label?: string
          sent_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      eccairs_integrations_safe: {
        Row: {
          company_id: string | null
          created_at: string | null
          e2_base_url: string | null
          e2_client_id: string | null
          e2_client_secret: string | null
          e2_scope: string | null
          enabled: boolean | null
          environment: string | null
          id: string | null
          reporting_entity_id: number | null
          responsible_entity_id: number | null
          responsible_entity_value_id: string | null
          taxonomy_version_id: number | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          e2_base_url?: string | null
          e2_client_id?: string | null
          e2_client_secret?: never
          e2_scope?: string | null
          enabled?: boolean | null
          environment?: string | null
          id?: string | null
          reporting_entity_id?: number | null
          responsible_entity_id?: number | null
          responsible_entity_value_id?: string | null
          taxonomy_version_id?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          e2_base_url?: string | null
          e2_client_id?: string | null
          e2_client_secret?: never
          e2_scope?: string | null
          enabled?: boolean | null
          environment?: string | null
          id?: string | null
          reporting_entity_id?: number | null
          responsible_entity_id?: number | null
          responsible_entity_value_id?: string | null
          taxonomy_version_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eccairs_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings_safe: {
        Row: {
          company_id: string | null
          created_at: string | null
          enabled: boolean | null
          from_email: string | null
          from_name: string | null
          id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      add_drone_flight_hours: {
        Args: { p_drone_id: string; p_minutes: number }
        Returns: undefined
      }
      add_equipment_flight_hours: {
        Args: { p_equipment_id: string; p_minutes: number }
        Returns: undefined
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      bulk_upsert_geojson_features: {
        Args: { p_features: Json; p_table_name: string }
        Returns: Json
      }
      bulk_upsert_naturvern_zones: { Args: { p_features: Json }; Returns: Json }
      bulk_upsert_vern_restrictions: {
        Args: { p_features: Json }
        Returns: Json
      }
      can_read_folder: { Args: { _folder_id: string }; Returns: boolean }
      can_user_access_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      check_mission_airspace: {
        Args: { p_lat: number; p_lng: number; p_route?: Json }
        Returns: {
          min_distance: number
          route_inside: boolean
          severity: string
          z_id: string
          z_name: string
          z_type: string
        }[]
      }
      check_mission_zone_conflicts: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: {
          distance_meters: number
          is_inside: boolean
          zone_id: string
          zone_name: string
          zone_type: string
        }[]
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_ai_risk_eta_ms: { Args: never; Returns: number }
      get_company_by_registration_code: {
        Args: { p_code: string }
        Returns: {
          company_id: string
          company_name: string
        }[]
      }
      get_eccairs_credentials: {
        Args: { p_company_id: string; p_environment?: string }
        Returns: {
          e2_base_url: string
          e2_client_id: string
          e2_client_secret: string
          e2_scope: string
        }[]
      }
      get_effective_deviation_categories: {
        Args: { _company_id: string }
        Returns: {
          company_id: string
          created_at: string
          id: string
          label: string
          parent_id: string | null
          sort_order: number
        }[]
        SetofOptions: {
          from: "*"
          to: "deviation_report_categories"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_effective_flight_alert_config: {
        Args: { _company_id: string }
        Returns: Json
      }
      get_effective_parent_company_id: {
        Args: { _company_id: string }
        Returns: string
      }
      get_effective_sora_approval_config: {
        Args: { _company_id: string }
        Returns: Json
      }
      get_fh2_token: {
        Args: { p_company_id: string; p_key: string }
        Returns: string
      }
      get_incident_responsible_users: {
        Args: { target_company_id: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_linkedin_token: {
        Args: { p_company_id: string; p_encryption_key: string }
        Returns: {
          access_token: string
          expires_at: string
          member_urn: string
          refresh_token: string
        }[]
      }
      get_mission_approvers: {
        Args: { target_company_id: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_naturvern_in_bounds: {
        Args: {
          max_lat: number
          max_lng: number
          min_lat: number
          min_lng: number
        }
        Returns: {
          external_id: string
          geometry: Json
          name: string
          properties: Json
          verneform: string
        }[]
      }
      get_parent_company_id: { Args: { _company_id: string }; Returns: string }
      get_platform_statistics: {
        Args: { p_exclude_company_id?: string }
        Returns: Json
      }
      get_user_accessible_companies: {
        Args: { _user_id: string }
        Returns: {
          company_id: string
          company_name: string
          is_parent: boolean
        }[]
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_incident_visible_company_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_user_readable_company_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_visible_company_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_vern_restrictions_in_bounds: {
        Args: {
          max_lat: number
          max_lng: number
          min_lat: number
          min_lng: number
        }
        Returns: {
          external_id: string
          geometry: Json
          name: string
          properties: Json
          restriction_type: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      has_effective_deviation_categories: {
        Args: { _company_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      match_manual_chunks: {
        Args: {
          p_manual_id: string
          p_match_count?: number
          p_query_embedding: string
        }
        Returns: {
          chunk_index: number
          chunk_text: string
          id: string
          section_heading: string
          similarity: number
        }[]
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      save_fh2_token: {
        Args: { p_company_id: string; p_key: string; p_token: string }
        Returns: undefined
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_eccairs_credentials: {
        Args: {
          p_company_id: string
          p_e2_base_url?: string
          p_e2_client_id: string
          p_e2_client_secret: string
          p_e2_scope?: string
          p_environment: string
        }
        Returns: undefined
      }
      update_email_settings: {
        Args: {
          p_company_id: string
          p_enabled: boolean
          p_from_email: string
          p_from_name: string
        }
        Returns: undefined
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upsert_geojson_feature: {
        Args: {
          p_description: string
          p_external_id: string
          p_geometry_geojson: string
          p_name: string
          p_properties: Json
          p_table_name: string
        }
        Returns: string
      }
      upsert_linkedin_token: {
        Args: {
          p_access_token: string
          p_company_id: string
          p_encryption_key: string
          p_expires_at: string
          p_member_urn: string
          p_refresh_token: string
        }
        Returns: undefined
      }
      upsert_naturvern_zone: {
        Args: {
          p_external_id: string
          p_geometry_geojson: string
          p_name: string
          p_properties: Json
          p_verneform: string
        }
        Returns: string
      }
      upsert_openaip_airspace: {
        Args: {
          p_geometry_geojson: string
          p_lower_limit?: string
          p_name: string
          p_openaip_id: string
          p_properties?: string
          p_remarks?: string
          p_upper_limit?: string
          p_zone_id: string
          p_zone_type: string
        }
        Returns: undefined
      }
      upsert_vern_restriction: {
        Args: {
          p_external_id: string
          p_geometry_geojson: string
          p_name: string
          p_properties: Json
          p_restriction_type: string
        }
        Returns: string
      }
      validate_training_module_keys: {
        Args: { _modules: string[] }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "operativ_leder"
        | "pilot"
        | "tekniker"
        | "lesetilgang"
        | "superadmin"
        | "operatør"
        | "saksbehandler"
        | "bruker"
        | "administrator"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "operativ_leder",
        "pilot",
        "tekniker",
        "lesetilgang",
        "superadmin",
        "operatør",
        "saksbehandler",
        "bruker",
        "administrator",
      ],
    },
  },
} as const
