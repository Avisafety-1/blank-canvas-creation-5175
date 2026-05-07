CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'operativ_leder',
    'pilot',
    'tekniker',
    'lesetilgang',
    'superadmin'
);


--
-- Name: get_user_company_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_company_id(_user_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT company_id FROM public.profiles WHERE id = _user_id
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'company_id')::uuid, '11111111-1111-1111-1111-111111111111')
  );
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user_notification_preferences(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user_notification_preferences() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.notification_preferences (
    user_id,
    email_new_incident,
    email_new_mission,
    email_followup_assigned,
    email_new_user_pending,
    email_document_expiry
  )
  VALUES (
    NEW.id,
    false,
    false,
    true,
    false,
    false
  );
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: is_superadmin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_superadmin(_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'superadmin'
  )
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    IF (to_jsonb(NEW) ? 'updated_at') THEN
        NEW.updated_at = now();
    END IF;
    RETURN NEW;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    type text NOT NULL,
    description text,
    event_date date NOT NULL,
    event_time time without time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    company_id uuid NOT NULL
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    navn text NOT NULL,
    org_nummer text,
    adresse text,
    kontakt_epost text,
    kontakt_telefon text,
    aktiv boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    navn text NOT NULL,
    kontaktperson text,
    telefon text,
    epost text,
    adresse text,
    merknader text,
    aktiv boolean DEFAULT true NOT NULL,
    user_id uuid NOT NULL,
    opprettet_dato timestamp with time zone DEFAULT now() NOT NULL,
    oppdatert_dato timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    tittel text NOT NULL,
    kategori text NOT NULL,
    versjon text DEFAULT '1.0'::text,
    gyldig_til timestamp with time zone,
    "varsel_dager_for_utløp" integer DEFAULT 30,
    fil_url text,
    fil_navn text,
    fil_storrelse integer,
    opprettet_av text,
    opprettet_dato timestamp with time zone DEFAULT now(),
    oppdatert_dato timestamp with time zone DEFAULT now(),
    beskrivelse text,
    nettside_url text,
    company_id uuid NOT NULL
);


--
-- Name: drone_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drone_equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    drone_id uuid NOT NULL,
    equipment_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: drones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    modell text NOT NULL,
    registrering text NOT NULL,
    status text DEFAULT 'Grønn'::text NOT NULL,
    flyvetimer integer DEFAULT 0 NOT NULL,
    tilgjengelig boolean DEFAULT true NOT NULL,
    sist_inspeksjon timestamp with time zone,
    neste_inspeksjon timestamp with time zone,
    merknader text,
    opprettet_dato timestamp with time zone DEFAULT now() NOT NULL,
    oppdatert_dato timestamp with time zone DEFAULT now() NOT NULL,
    aktiv boolean DEFAULT true NOT NULL,
    company_id uuid NOT NULL,
    CONSTRAINT drones_status_check CHECK ((status = ANY (ARRAY['Grønn'::text, 'Gul'::text, 'Rød'::text])))
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    template_type text NOT NULL,
    subject text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    navn text NOT NULL,
    type text NOT NULL,
    serienummer text NOT NULL,
    neste_vedlikehold timestamp with time zone,
    sist_vedlikeholdt timestamp with time zone,
    status text DEFAULT 'Grønn'::text NOT NULL,
    tilgjengelig boolean DEFAULT true NOT NULL,
    merknader text,
    aktiv boolean DEFAULT true NOT NULL,
    user_id uuid NOT NULL,
    opprettet_dato timestamp with time zone DEFAULT now() NOT NULL,
    oppdatert_dato timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL
);


--
-- Name: incident_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    incident_id uuid NOT NULL,
    user_id uuid NOT NULL,
    comment_text text NOT NULL,
    created_by_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comment_text_not_empty CHECK ((char_length(comment_text) > 0))
);


--
-- Name: incidents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incidents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    tittel text NOT NULL,
    beskrivelse text,
    hendelsestidspunkt timestamp with time zone NOT NULL,
    alvorlighetsgrad text NOT NULL,
    status text DEFAULT 'Åpen'::text NOT NULL,
    kategori text,
    lokasjon text,
    rapportert_av text,
    opprettet_dato timestamp with time zone DEFAULT now(),
    oppdatert_dato timestamp with time zone DEFAULT now(),
    mission_id uuid,
    oppfolgingsansvarlig_id uuid,
    company_id uuid NOT NULL,
    CONSTRAINT incidents_alvorlighetsgrad_check CHECK ((alvorlighetsgrad = ANY (ARRAY['Lav'::text, 'Middels'::text, 'Høy'::text, 'Kritisk'::text]))),
    CONSTRAINT incidents_status_check CHECK ((status = ANY (ARRAY['Åpen'::text, 'Under behandling'::text, 'Ferdigbehandlet'::text, 'Lukket'::text])))
);


--
-- Name: mission_drones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mission_drones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mission_id uuid NOT NULL,
    drone_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: mission_equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mission_equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mission_id uuid NOT NULL,
    equipment_id uuid NOT NULL
);


--
-- Name: mission_personnel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mission_personnel (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mission_id uuid NOT NULL,
    profile_id uuid NOT NULL
);


--
-- Name: mission_sora; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mission_sora (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mission_id uuid NOT NULL,
    environment text,
    conops_summary text,
    igrc integer,
    ground_mitigations text,
    fgrc integer,
    arc_initial text,
    airspace_mitigations text,
    arc_residual text,
    sail text,
    residual_risk_level text,
    residual_risk_comment text,
    operational_limits text,
    sora_status text DEFAULT 'Ikke startet'::text NOT NULL,
    prepared_by uuid,
    prepared_at timestamp with time zone,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    CONSTRAINT mission_sora_fgrc_check CHECK (((fgrc >= 1) AND (fgrc <= 7))),
    CONSTRAINT mission_sora_igrc_check CHECK (((igrc >= 1) AND (igrc <= 7)))
);


--
-- Name: missions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.missions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tittel text NOT NULL,
    lokasjon text NOT NULL,
    beskrivelse text,
    tidspunkt timestamp with time zone NOT NULL,
    slutt_tidspunkt timestamp with time zone,
    status text DEFAULT 'Planlagt'::text NOT NULL,
    "risk_nivå" text DEFAULT 'Lav'::text NOT NULL,
    merknader text,
    user_id uuid NOT NULL,
    opprettet_dato timestamp with time zone DEFAULT now() NOT NULL,
    oppdatert_dato timestamp with time zone DEFAULT now() NOT NULL,
    customer_id uuid,
    latitude double precision,
    longitude double precision,
    company_id uuid NOT NULL
);


--
-- Name: news; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tittel text NOT NULL,
    innhold text NOT NULL,
    publisert timestamp with time zone DEFAULT now() NOT NULL,
    forfatter text NOT NULL,
    synlighet text DEFAULT 'Alle'::text NOT NULL,
    pin_on_top boolean DEFAULT false NOT NULL,
    opprettet_dato timestamp with time zone DEFAULT now() NOT NULL,
    oppdatert_dato timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_new_incident boolean DEFAULT false NOT NULL,
    email_new_mission boolean DEFAULT false NOT NULL,
    email_document_expiry boolean DEFAULT false NOT NULL,
    email_new_user_pending boolean DEFAULT false NOT NULL,
    email_followup_assigned boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: personnel_competencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.personnel_competencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    type text NOT NULL,
    navn text NOT NULL,
    beskrivelse text,
    utstedt_dato date,
    utloper_dato date,
    opprettet_dato timestamp with time zone DEFAULT now() NOT NULL,
    oppdatert_dato timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT personnel_competencies_type_check CHECK ((type = ANY (ARRAY['Kurs'::text, 'Sertifikat'::text, 'Lisens'::text, 'Utdanning'::text, 'Godkjenning'::text, 'Kompetanse'::text, 'Annet'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    approved boolean DEFAULT false,
    approved_at timestamp with time zone,
    approved_by uuid,
    company_id uuid NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: companies companies_navn_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_navn_key UNIQUE (navn);


--
-- Name: companies companies_org_nummer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_org_nummer_key UNIQUE (org_nummer);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: drone_equipment drone_equipment_drone_id_equipment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drone_equipment
    ADD CONSTRAINT drone_equipment_drone_id_equipment_id_key UNIQUE (drone_id, equipment_id);


--
-- Name: drone_equipment drone_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drone_equipment
    ADD CONSTRAINT drone_equipment_pkey PRIMARY KEY (id);


--
-- Name: drones drones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drones
    ADD CONSTRAINT drones_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_company_id_template_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_company_id_template_type_key UNIQUE (company_id, template_type);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: equipment equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_pkey PRIMARY KEY (id);


--
-- Name: incident_comments incident_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_comments
    ADD CONSTRAINT incident_comments_pkey PRIMARY KEY (id);


--
-- Name: incidents incidents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_pkey PRIMARY KEY (id);


--
-- Name: mission_drones mission_drones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_drones
    ADD CONSTRAINT mission_drones_pkey PRIMARY KEY (id);


--
-- Name: mission_equipment mission_equipment_mission_id_equipment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_equipment
    ADD CONSTRAINT mission_equipment_mission_id_equipment_id_key UNIQUE (mission_id, equipment_id);


--
-- Name: mission_equipment mission_equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_equipment
    ADD CONSTRAINT mission_equipment_pkey PRIMARY KEY (id);


--
-- Name: mission_personnel mission_personnel_mission_id_profile_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_personnel
    ADD CONSTRAINT mission_personnel_mission_id_profile_id_key UNIQUE (mission_id, profile_id);


--
-- Name: mission_personnel mission_personnel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_personnel
    ADD CONSTRAINT mission_personnel_pkey PRIMARY KEY (id);


--
-- Name: mission_sora mission_sora_mission_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_sora
    ADD CONSTRAINT mission_sora_mission_id_key UNIQUE (mission_id);


--
-- Name: mission_sora mission_sora_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_sora
    ADD CONSTRAINT mission_sora_pkey PRIMARY KEY (id);


--
-- Name: missions missions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_pkey PRIMARY KEY (id);


--
-- Name: news news_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news
    ADD CONSTRAINT news_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_key UNIQUE (user_id);


--
-- Name: personnel_competencies personnel_competencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel_competencies
    ADD CONSTRAINT personnel_competencies_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_calendar_events_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_company_id ON public.calendar_events USING btree (company_id);


--
-- Name: idx_customers_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_company_id ON public.customers USING btree (company_id);


--
-- Name: idx_documents_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_company_id ON public.documents USING btree (company_id);


--
-- Name: idx_drone_equipment_drone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drone_equipment_drone_id ON public.drone_equipment USING btree (drone_id);


--
-- Name: idx_drone_equipment_equipment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drone_equipment_equipment_id ON public.drone_equipment USING btree (equipment_id);


--
-- Name: idx_drones_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drones_company_id ON public.drones USING btree (company_id);


--
-- Name: idx_equipment_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipment_company_id ON public.equipment USING btree (company_id);


--
-- Name: idx_incident_comments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incident_comments_created_at ON public.incident_comments USING btree (created_at DESC);


--
-- Name: idx_incident_comments_incident_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incident_comments_incident_id ON public.incident_comments USING btree (incident_id);


--
-- Name: idx_incidents_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidents_company_id ON public.incidents USING btree (company_id);


--
-- Name: idx_incidents_mission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incidents_mission_id ON public.incidents USING btree (mission_id);


--
-- Name: idx_mission_drones_drone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mission_drones_drone_id ON public.mission_drones USING btree (drone_id);


--
-- Name: idx_mission_drones_mission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mission_drones_mission_id ON public.mission_drones USING btree (mission_id);


--
-- Name: idx_mission_sora_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mission_sora_company_id ON public.mission_sora USING btree (company_id);


--
-- Name: idx_mission_sora_mission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mission_sora_mission_id ON public.mission_sora USING btree (mission_id);


--
-- Name: idx_mission_sora_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mission_sora_status ON public.mission_sora USING btree (sora_status);


--
-- Name: idx_missions_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_missions_company_id ON public.missions USING btree (company_id);


--
-- Name: idx_missions_coordinates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_missions_coordinates ON public.missions USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));


--
-- Name: idx_news_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_company_id ON public.news USING btree (company_id);


--
-- Name: idx_profiles_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_company_id ON public.profiles USING btree (company_id);


--
-- Name: calendar_events update_calendar_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customers update_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: documents update_documents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: drones update_drones_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_drones_updated_at BEFORE UPDATE ON public.drones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_templates update_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: equipment update_equipment_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: mission_sora update_mission_sora_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_mission_sora_updated_at BEFORE UPDATE ON public.mission_sora FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: missions update_missions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_missions_updated_at BEFORE UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: news update_news_oppdatert_dato; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_news_oppdatert_dato BEFORE UPDATE ON public.news FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: notification_preferences update_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: personnel_competencies update_personnel_competencies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_personnel_competencies_updated_at BEFORE UPDATE ON public.personnel_competencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: calendar_events calendar_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: calendar_events calendar_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: customers customers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: documents documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: documents documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: drone_equipment drone_equipment_drone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drone_equipment
    ADD CONSTRAINT drone_equipment_drone_id_fkey FOREIGN KEY (drone_id) REFERENCES public.drones(id) ON DELETE CASCADE;


--
-- Name: drone_equipment drone_equipment_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drone_equipment
    ADD CONSTRAINT drone_equipment_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: drones drones_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drones
    ADD CONSTRAINT drones_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: email_templates email_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: equipment equipment_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: incident_comments incident_comments_incident_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_comments
    ADD CONSTRAINT incident_comments_incident_id_fkey FOREIGN KEY (incident_id) REFERENCES public.incidents(id) ON DELETE CASCADE;


--
-- Name: incident_comments incident_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_comments
    ADD CONSTRAINT incident_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: incidents incidents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: incidents incidents_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE SET NULL;


--
-- Name: incidents incidents_oppfolgingsansvarlig_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_oppfolgingsansvarlig_id_fkey FOREIGN KEY (oppfolgingsansvarlig_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: incidents incidents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incidents
    ADD CONSTRAINT incidents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mission_drones mission_drones_drone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_drones
    ADD CONSTRAINT mission_drones_drone_id_fkey FOREIGN KEY (drone_id) REFERENCES public.drones(id) ON DELETE CASCADE;


--
-- Name: mission_drones mission_drones_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_drones
    ADD CONSTRAINT mission_drones_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;


--
-- Name: mission_equipment mission_equipment_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_equipment
    ADD CONSTRAINT mission_equipment_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: mission_equipment mission_equipment_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_equipment
    ADD CONSTRAINT mission_equipment_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;


--
-- Name: mission_personnel mission_personnel_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_personnel
    ADD CONSTRAINT mission_personnel_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;


--
-- Name: mission_personnel mission_personnel_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_personnel
    ADD CONSTRAINT mission_personnel_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: mission_sora mission_sora_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_sora
    ADD CONSTRAINT mission_sora_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- Name: mission_sora mission_sora_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_sora
    ADD CONSTRAINT mission_sora_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: mission_sora mission_sora_mission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_sora
    ADD CONSTRAINT mission_sora_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE;


--
-- Name: mission_sora mission_sora_prepared_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mission_sora
    ADD CONSTRAINT mission_sora_prepared_by_fkey FOREIGN KEY (prepared_by) REFERENCES auth.users(id);


--
-- Name: missions missions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: missions missions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.missions
    ADD CONSTRAINT missions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: news news_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news
    ADD CONSTRAINT news_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: personnel_competencies personnel_competencies_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personnel_competencies
    ADD CONSTRAINT personnel_competencies_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id);


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: personnel_competencies Admins and operativ_leder can create all competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and operativ_leder can create all competencies" ON public.personnel_competencies FOR INSERT WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)));


--
-- Name: personnel_competencies Admins and operativ_leder can update all competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins and operativ_leder can update all competencies" ON public.personnel_competencies FOR UPDATE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)));


--
-- Name: profiles Admins can approve users in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can approve users in own company" ON public.profiles FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: personnel_competencies Admins can delete all competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete all competencies" ON public.personnel_competencies FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: calendar_events Admins can delete calendar events in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete calendar events in own company" ON public.calendar_events FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: customers Admins can delete customers in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete customers in own company" ON public.customers FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: documents Admins can delete documents in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete documents in own company" ON public.documents FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: drones Admins can delete drones in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete drones in own company" ON public.drones FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: equipment Admins can delete equipment in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete equipment in own company" ON public.equipment FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: incidents Admins can delete incidents in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete incidents in own company" ON public.incidents FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: mission_sora Admins can delete mission_sora in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete mission_sora in own company" ON public.mission_sora FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: missions Admins can delete missions in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete missions in own company" ON public.missions FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: news Admins can delete news in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete news in own company" ON public.news FOR DELETE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: user_roles Admins can delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: profiles Admins can delete users in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete users in own company" ON public.profiles FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: user_roles Admins can insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: drone_equipment Admins can manage all drone equipment in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all drone equipment in own company" ON public.drone_equipment USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.drones
  WHERE ((drones.id = drone_equipment.drone_id) AND (drones.company_id = public.get_user_company_id(auth.uid())))))));


--
-- Name: mission_drones Admins can manage all mission drones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all mission drones" ON public.mission_drones TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: mission_equipment Admins can manage all mission equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all mission equipment" ON public.mission_equipment USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: mission_personnel Admins can manage all mission personnel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all mission personnel" ON public.mission_personnel USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_templates Admins can manage email templates in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage email templates in own company" ON public.email_templates USING ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: calendar_events Admins can update calendar events in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update calendar events in own company" ON public.calendar_events FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: customers Admins can update customers in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update customers in own company" ON public.customers FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: documents Admins can update documents in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update documents in own company" ON public.documents FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: drones Admins can update drones in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update drones in own company" ON public.drones FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: equipment Admins can update equipment in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update equipment in own company" ON public.equipment FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: incidents Admins can update incidents in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update incidents in own company" ON public.incidents FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: mission_sora Admins can update mission_sora in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update mission_sora in own company" ON public.mission_sora FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: missions Admins can update missions in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update missions in own company" ON public.missions FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: news Admins can update news in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update news in own company" ON public.news FOR UPDATE TO authenticated USING (((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'operativ_leder'::public.app_role)) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: user_roles Admins can update roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can view all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: mission_drones All authenticated users can view mission drones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "All authenticated users can view mission drones" ON public.mission_drones FOR SELECT TO authenticated USING ((auth.role() = 'authenticated'::text));


--
-- Name: mission_equipment All authenticated users can view mission equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "All authenticated users can view mission equipment" ON public.mission_equipment FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: mission_personnel All authenticated users can view mission personnel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "All authenticated users can view mission personnel" ON public.mission_personnel FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: personnel_competencies All authenticated users can view personnel competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "All authenticated users can view personnel competencies" ON public.personnel_competencies FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: companies Anonymous users can view active companies for signup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anonymous users can view active companies for signup" ON public.companies FOR SELECT TO authenticated, anon USING ((aktiv = true));


--
-- Name: calendar_events Approved users can create calendar events in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can create calendar events in own company" ON public.calendar_events FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: incident_comments Approved users can create comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can create comments" ON public.incident_comments FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: customers Approved users can create customers in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can create customers in own company" ON public.customers FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: documents Approved users can create documents in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can create documents in own company" ON public.documents FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: drone_equipment Approved users can create drone equipment in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can create drone equipment in own company" ON public.drone_equipment FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.drones
  WHERE ((drones.id = drone_equipment.drone_id) AND (drones.company_id = public.get_user_company_id(auth.uid())) AND (drones.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: drones Approved users can create drones in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can create drones in own company" ON public.drones FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: equipment Approved users can create equipment in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can create equipment in own company" ON public.equipment FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: incidents Approved users can create incidents in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can create incidents in own company" ON public.incidents FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: mission_sora Approved users can create mission_sora in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can create mission_sora in own company" ON public.mission_sora FOR INSERT TO authenticated WITH CHECK (((auth.uid() = prepared_by) AND (company_id = public.get_user_company_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: missions Approved users can create missions in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can create missions in own company" ON public.missions FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: news Approved users can create news in own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can create news in own company" ON public.news FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: profiles Superadmins can approve all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can approve all users" ON public.profiles FOR UPDATE TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: documents Superadmins can delete all documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can delete all documents" ON public.documents FOR DELETE TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: incidents Superadmins can delete all incidents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can delete all incidents" ON public.incidents FOR DELETE TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: missions Superadmins can delete all missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can delete all missions" ON public.missions FOR DELETE TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: profiles Superadmins can delete all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can delete all users" ON public.profiles FOR DELETE TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: companies Superadmins can delete companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can delete companies" ON public.companies FOR DELETE TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: companies Superadmins can insert companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can insert companies" ON public.companies FOR INSERT TO authenticated WITH CHECK (public.is_superadmin(auth.uid()));


--
-- Name: email_templates Superadmins can manage all email templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can manage all email templates" ON public.email_templates USING (public.is_superadmin(auth.uid()));


--
-- Name: documents Superadmins can update all documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can update all documents" ON public.documents FOR UPDATE TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: incidents Superadmins can update all incidents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can update all incidents" ON public.incidents FOR UPDATE TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: missions Superadmins can update all missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can update all missions" ON public.missions FOR UPDATE TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: companies Superadmins can update companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can update companies" ON public.companies FOR UPDATE TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: calendar_events Superadmins can view all calendar events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can view all calendar events" ON public.calendar_events FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: companies Superadmins can view all companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can view all companies" ON public.companies FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: customers Superadmins can view all customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can view all customers" ON public.customers FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: documents Superadmins can view all documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can view all documents" ON public.documents FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: drones Superadmins can view all drones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can view all drones" ON public.drones FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: equipment Superadmins can view all equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can view all equipment" ON public.equipment FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: incidents Superadmins can view all incidents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can view all incidents" ON public.incidents FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: mission_sora Superadmins can view all mission_sora; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can view all mission_sora" ON public.mission_sora FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: missions Superadmins can view all missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can view all missions" ON public.missions FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: news Superadmins can view all news; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can view all news" ON public.news FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: profiles Superadmins can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Superadmins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_superadmin(auth.uid()));


--
-- Name: personnel_competencies Users can create own competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own competencies" ON public.personnel_competencies FOR INSERT WITH CHECK (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.approved = true))))));


--
-- Name: calendar_events Users can delete own calendar events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own calendar events" ON public.calendar_events FOR DELETE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: personnel_competencies Users can delete own competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own competencies" ON public.personnel_competencies FOR DELETE USING ((profile_id = auth.uid()));


--
-- Name: customers Users can delete own customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own customers" ON public.customers FOR DELETE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: documents Users can delete own documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own documents" ON public.documents FOR DELETE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: drone_equipment Users can delete own drone equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own drone equipment" ON public.drone_equipment FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.drones
  WHERE ((drones.id = drone_equipment.drone_id) AND (drones.user_id = auth.uid()) AND (drones.company_id = public.get_user_company_id(auth.uid()))))));


--
-- Name: drones Users can delete own drones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own drones" ON public.drones FOR DELETE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: equipment Users can delete own equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own equipment" ON public.equipment FOR DELETE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: incidents Users can delete own incidents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own incidents" ON public.incidents FOR DELETE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: missions Users can delete own missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own missions" ON public.missions FOR DELETE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: news Users can delete own news; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own news" ON public.news FOR DELETE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: notification_preferences Users can insert own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own notification preferences" ON public.notification_preferences FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: mission_drones Users can manage mission drones for their missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage mission drones for their missions" ON public.mission_drones TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.missions
  WHERE ((missions.id = mission_drones.mission_id) AND (missions.user_id = auth.uid())))));


--
-- Name: mission_equipment Users can manage mission equipment for their missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage mission equipment for their missions" ON public.mission_equipment USING ((EXISTS ( SELECT 1
   FROM public.missions
  WHERE ((missions.id = mission_equipment.mission_id) AND (missions.user_id = auth.uid())))));


--
-- Name: mission_personnel Users can manage mission personnel for their missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage mission personnel for their missions" ON public.mission_personnel USING ((EXISTS ( SELECT 1
   FROM public.missions
  WHERE ((missions.id = mission_personnel.mission_id) AND (missions.user_id = auth.uid())))));


--
-- Name: calendar_events Users can update own calendar events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own calendar events" ON public.calendar_events FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: personnel_competencies Users can update own competencies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own competencies" ON public.personnel_competencies FOR UPDATE USING ((profile_id = auth.uid()));


--
-- Name: customers Users can update own customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own customers" ON public.customers FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: documents Users can update own documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own documents" ON public.documents FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: drones Users can update own drones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own drones" ON public.drones FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: equipment Users can update own equipment; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own equipment" ON public.equipment FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: incidents Users can update own incidents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own incidents" ON public.incidents FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: mission_sora Users can update own mission_sora; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own mission_sora" ON public.mission_sora FOR UPDATE TO authenticated USING (((auth.uid() = prepared_by) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: missions Users can update own missions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own missions" ON public.missions FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: news Users can update own news; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own news" ON public.news FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (company_id = public.get_user_company_id(auth.uid()))));


--
-- Name: notification_preferences Users can update own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notification preferences" ON public.notification_preferences FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


--
-- Name: calendar_events Users can view calendar events from own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view calendar events from own company" ON public.calendar_events FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: incident_comments Users can view comments from own company incidents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view comments from own company incidents" ON public.incident_comments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.incidents
  WHERE ((incidents.id = incident_comments.incident_id) AND (incidents.company_id = public.get_user_company_id(auth.uid()))))));


--
-- Name: customers Users can view customers from own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view customers from own company" ON public.customers FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: documents Users can view documents from own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view documents from own company" ON public.documents FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: drone_equipment Users can view drone equipment from own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view drone equipment from own company" ON public.drone_equipment FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.drones
  WHERE ((drones.id = drone_equipment.drone_id) AND (drones.company_id = public.get_user_company_id(auth.uid()))))));


--
-- Name: drones Users can view drones from own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view drones from own company" ON public.drones FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: equipment Users can view equipment from own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view equipment from own company" ON public.equipment FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: incidents Users can view incidents from own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view incidents from own company" ON public.incidents FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: mission_sora Users can view mission_sora from own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view mission_sora from own company" ON public.mission_sora FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: missions Users can view missions from own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view missions from own company" ON public.missions FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: news Users can view news from own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view news from own company" ON public.news FOR SELECT TO authenticated USING ((company_id = public.get_user_company_id(auth.uid())));


--
-- Name: notification_preferences Users can view own notification preferences; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own notification preferences" ON public.notification_preferences FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view profiles from own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view profiles from own company" ON public.profiles FOR SELECT TO authenticated USING (((company_id = public.get_user_company_id(auth.uid())) OR (auth.uid() = id)));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: drone_equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drone_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: drones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.drones ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: incident_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incident_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: incidents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

--
-- Name: mission_drones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mission_drones ENABLE ROW LEVEL SECURITY;

--
-- Name: mission_equipment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mission_equipment ENABLE ROW LEVEL SECURITY;

--
-- Name: mission_personnel; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mission_personnel ENABLE ROW LEVEL SECURITY;

--
-- Name: mission_sora; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mission_sora ENABLE ROW LEVEL SECURITY;

--
-- Name: missions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

--
-- Name: news; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_competencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.personnel_competencies ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


