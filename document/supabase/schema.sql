--
-- PostgreSQL database dump
--

\restrict CBwZnQIDqf1cDRMz5EPSUI29sl3CfsH9WIpothOBX527Y9RxvcuRIQlCFslKksQ

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

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

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: finance_refresh_rule_suggestions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finance_refresh_rule_suggestions() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  affected_rows integer := 0;
begin
  insert into public.finance_rule_suggestions (
    user_id,
    name,
    pattern,
    category_id,
    direction,
    evidence_count,
    status,
    updated_at
  )
  select
    corrections.user_id,
    initcap(lower(trim(transactions.merchant))) as name,
    lower(trim(transactions.merchant)) as pattern,
    parsed.category_id,
    transactions.direction,
    count(*)::integer as evidence_count,
    'pending',
    now()
  from public.finance_corrections corrections
  join public.finance_transactions transactions
    on transactions.id = corrections.transaction_id
   and transactions.user_id = corrections.user_id
  cross join lateral (
    select case
      when (corrections.corrected_value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (corrections.corrected_value #>> '{}')::uuid
      else null
    end as category_id
  ) parsed
  join public.finance_categories categories
    on categories.id = parsed.category_id
   and categories.user_id = corrections.user_id
  where corrections.field_name = 'category_id'
    and corrections.corrected_value is not null
    and parsed.category_id is not null
    and transactions.merchant is not null
    and length(trim(transactions.merchant)) >= 3
    and transactions.direction in ('expense', 'income')
  group by corrections.user_id, lower(trim(transactions.merchant)), parsed.category_id, transactions.direction
  having count(*) >= 3
  on conflict (user_id, pattern, category_id, direction) do update
  set evidence_count = excluded.evidence_count,
      updated_at = now()
  where public.finance_rule_suggestions.status = 'pending';

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$_$;


--
-- Name: update_tickets_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tickets_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: BRIDGE_role_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BRIDGE_role_modules" (
    role_id uuid NOT NULL,
    module_id uuid NOT NULL
);


--
-- Name: BRIDGE_user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BRIDGE_user_roles" (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);


--
-- Name: DIM_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DIM_modules" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    modules text NOT NULL,
    name text NOT NULL,
    status text,
    path text NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    is_managed boolean DEFAULT true NOT NULL,
    is_always_allowed boolean DEFAULT false NOT NULL,
    icon text,
    description text,
    enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT dim_modules_safe_path CHECK (((path ~~ '/%'::text) AND (path !~~ '//%'::text) AND (POSITION(('://'::text) IN (path)) = 0)))
);


--
-- Name: DIM_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DIM_roles" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role text NOT NULL,
    name text NOT NULL
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    key_hash text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone
);


--
-- Name: app_user_module_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_user_module_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    module_id uuid NOT NULL,
    effect text NOT NULL,
    CONSTRAINT app_user_module_overrides_effect_check CHECK ((effect = ANY (ARRAY['allow'::text, 'deny'::text])))
);


--
-- Name: daily_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source text NOT NULL,
    content jsonb NOT NULL,
    effective_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT daily_logs_source_check CHECK ((source = ANY (ARRAY['agent'::text, 'human'::text])))
);


--
-- Name: film_cameras; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.film_cameras (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    brand text,
    model text,
    purchase_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: film_drive_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.film_drive_connections (
    user_id uuid NOT NULL,
    access_token_encrypted text NOT NULL,
    refresh_token_encrypted text,
    expires_at timestamp with time zone,
    scope text,
    token_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: film_maintenance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.film_maintenance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    camera_id uuid NOT NULL,
    service_date date,
    service_type text,
    provider_name text,
    maintenance_cost numeric(10,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: film_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.film_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    film_roll_id uuid NOT NULL,
    drive_file_id text NOT NULL,
    name text NOT NULL,
    mime_type text NOT NULL,
    web_view_link text,
    thumbnail_link text,
    width integer,
    height integer,
    is_favorite boolean DEFAULT false NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: film_rolls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.film_rolls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    camera_id uuid,
    film_name text NOT NULL,
    brand text NOT NULL,
    format text NOT NULL,
    iso integer NOT NULL,
    status text DEFAULT 'UNUSED'::text NOT NULL,
    purchase_price numeric(10,2) DEFAULT 0 NOT NULL,
    location_name text,
    frames_taken integer DEFAULT 0 NOT NULL,
    successful_photos integer DEFAULT 0 NOT NULL,
    notes text,
    drive_folder_id text,
    cover_photo_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lab_name text,
    processing_cost numeric(10,2) DEFAULT 0 NOT NULL,
    scanning_cost numeric(10,2) DEFAULT 0 NOT NULL,
    shipping_cost numeric(10,2) DEFAULT 0 NOT NULL,
    processing_date date,
    film_type text DEFAULT 'NEGATIVE'::text NOT NULL,
    process_type text,
    cover_image_url text,
    cover_image_path text,
    CONSTRAINT film_rolls_film_type_check CHECK ((film_type = ANY (ARRAY['NEGATIVE'::text, 'REVERSAL'::text, 'BW_NEGATIVE'::text]))),
    CONSTRAINT film_rolls_format_check CHECK ((format = ANY (ARRAY['35mm'::text, '120'::text, 'Large Format'::text]))),
    CONSTRAINT film_rolls_frames_taken_check CHECK ((frames_taken >= 0)),
    CONSTRAINT film_rolls_iso_check CHECK ((iso > 0)),
    CONSTRAINT film_rolls_process_type_check CHECK (((process_type IS NULL) OR (process_type = ANY (ARRAY['C41'::text, 'E6'::text, 'BW'::text, 'ECN2'::text])))),
    CONSTRAINT film_rolls_processing_cost_check CHECK ((processing_cost >= (0)::numeric)),
    CONSTRAINT film_rolls_scanning_cost_check CHECK ((scanning_cost >= (0)::numeric)),
    CONSTRAINT film_rolls_shipping_cost_check CHECK ((shipping_cost >= (0)::numeric)),
    CONSTRAINT film_rolls_status_check CHECK ((status = ANY (ARRAY['UNUSED'::text, 'SHOOTING'::text, 'PROCESSING'::text, 'PROCESSED'::text]))),
    CONSTRAINT film_rolls_successful_photos_check CHECK ((successful_photos >= 0))
);


--
-- Name: finance_candidate_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_candidate_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    intake_item_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence numeric(5,4),
    matched_rule_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_candidate_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'duplicate'::text])))
);


--
-- Name: finance_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    color text,
    icon text,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_categories_type_check CHECK ((type = ANY (ARRAY['expense'::text, 'income'::text])))
);


--
-- Name: finance_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_corrections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    transaction_id uuid,
    intake_item_id uuid,
    field_name text NOT NULL,
    previous_value jsonb,
    corrected_value jsonb,
    context_excerpt text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finance_intake_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_intake_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    image_hash text,
    ocr_text text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_intake_items_source_check CHECK ((source = ANY (ARRAY['screenshot'::text, 'notification'::text]))),
    CONSTRAINT finance_intake_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'review'::text, 'completed'::text, 'duplicate'::text, 'failed'::text, 'rejected'::text])))
);


--
-- Name: finance_processing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_processing_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    intake_item_id uuid NOT NULL,
    event_type text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finance_rule_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_rule_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    pattern text NOT NULL,
    category_id uuid NOT NULL,
    direction text NOT NULL,
    evidence_count integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_rule_suggestions_direction_check CHECK ((direction = ANY (ARRAY['expense'::text, 'income'::text]))),
    CONSTRAINT finance_rule_suggestions_evidence_count_check CHECK ((evidence_count >= 1)),
    CONSTRAINT finance_rule_suggestions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);


--
-- Name: finance_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    match_type text NOT NULL,
    pattern text NOT NULL,
    category_id uuid,
    direction text,
    priority integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_id uuid,
    CONSTRAINT finance_rules_direction_check CHECK ((direction = ANY (ARRAY['expense'::text, 'income'::text, 'transfer'::text]))),
    CONSTRAINT finance_rules_match_type_check CHECK ((match_type = ANY (ARRAY['exact_phrase'::text, 'merchant_alias'::text, 'keyword'::text, 'account_hint'::text]))),
    CONSTRAINT finance_rules_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'learning'::text])))
);


--
-- Name: finance_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: finance_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category_id uuid,
    intake_item_id uuid,
    direction text NOT NULL,
    amount numeric(14,2) NOT NULL,
    merchant text,
    transaction_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    source text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source_id uuid NOT NULL,
    CONSTRAINT finance_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT finance_transactions_direction_check CHECK ((direction = ANY (ARRAY['expense'::text, 'income'::text, 'transfer'::text]))),
    CONSTRAINT finance_transactions_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'screenshot'::text]))),
    CONSTRAINT finance_transactions_status_check CHECK ((status = ANY (ARRAY['confirmed'::text, 'review'::text, 'duplicate'::text, 'rejected'::text])))
);


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text NOT NULL,
    description text,
    prd_content text,
    github_url text,
    priority text DEFAULT 'medium'::text,
    tags text[],
    completed boolean DEFAULT false,
    archived boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deploy_url text
);


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    notes text,
    status text DEFAULT 'todo'::text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    source text DEFAULT 'self'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT tickets_source_check CHECK ((source = ANY (ARRAY['self'::text, 'user_tester'::text]))),
    CONSTRAINT tickets_status_check CHECK ((status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'to_review'::text, 'done'::text, 'closed'::text])))
);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: DIM_modules app_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DIM_modules"
    ADD CONSTRAINT app_modules_pkey PRIMARY KEY (id);


--
-- Name: DIM_modules app_modules_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DIM_modules"
    ADD CONSTRAINT app_modules_slug_key UNIQUE (modules);


--
-- Name: BRIDGE_role_modules app_role_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BRIDGE_role_modules"
    ADD CONSTRAINT app_role_modules_pkey PRIMARY KEY (role_id, module_id);


--
-- Name: DIM_roles app_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DIM_roles"
    ADD CONSTRAINT app_roles_pkey PRIMARY KEY (id);


--
-- Name: DIM_roles app_roles_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DIM_roles"
    ADD CONSTRAINT app_roles_slug_key UNIQUE (role);


--
-- Name: app_user_module_overrides app_user_module_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user_module_overrides
    ADD CONSTRAINT app_user_module_overrides_pkey PRIMARY KEY (id);


--
-- Name: app_user_module_overrides app_user_module_overrides_user_id_module_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user_module_overrides
    ADD CONSTRAINT app_user_module_overrides_user_id_module_id_key UNIQUE (user_id, module_id);


--
-- Name: BRIDGE_user_roles app_user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BRIDGE_user_roles"
    ADD CONSTRAINT app_user_roles_pkey PRIMARY KEY (user_id);


--
-- Name: daily_logs daily_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_logs
    ADD CONSTRAINT daily_logs_pkey PRIMARY KEY (id);


--
-- Name: film_cameras film_cameras_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_cameras
    ADD CONSTRAINT film_cameras_pkey PRIMARY KEY (id);


--
-- Name: film_drive_connections film_drive_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_drive_connections
    ADD CONSTRAINT film_drive_connections_pkey PRIMARY KEY (user_id);


--
-- Name: film_maintenance_records film_maintenance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_maintenance_records
    ADD CONSTRAINT film_maintenance_records_pkey PRIMARY KEY (id);


--
-- Name: film_photos film_photos_film_roll_id_drive_file_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_photos
    ADD CONSTRAINT film_photos_film_roll_id_drive_file_id_key UNIQUE (film_roll_id, drive_file_id);


--
-- Name: film_photos film_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_photos
    ADD CONSTRAINT film_photos_pkey PRIMARY KEY (id);


--
-- Name: film_rolls film_rolls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_rolls
    ADD CONSTRAINT film_rolls_pkey PRIMARY KEY (id);


--
-- Name: finance_candidate_transactions finance_candidate_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_candidate_transactions
    ADD CONSTRAINT finance_candidate_transactions_pkey PRIMARY KEY (id);


--
-- Name: finance_categories finance_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_pkey PRIMARY KEY (id);


--
-- Name: finance_categories finance_categories_user_id_type_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_user_id_type_name_key UNIQUE (user_id, type, name);


--
-- Name: finance_corrections finance_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_corrections
    ADD CONSTRAINT finance_corrections_pkey PRIMARY KEY (id);


--
-- Name: finance_intake_items finance_intake_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_intake_items
    ADD CONSTRAINT finance_intake_items_pkey PRIMARY KEY (id);


--
-- Name: finance_processing_events finance_processing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_processing_events
    ADD CONSTRAINT finance_processing_events_pkey PRIMARY KEY (id);


--
-- Name: finance_rule_suggestions finance_rule_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_rule_suggestions
    ADD CONSTRAINT finance_rule_suggestions_pkey PRIMARY KEY (id);


--
-- Name: finance_rule_suggestions finance_rule_suggestions_user_id_pattern_category_id_direct_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_rule_suggestions
    ADD CONSTRAINT finance_rule_suggestions_user_id_pattern_category_id_direct_key UNIQUE (user_id, pattern, category_id, direction);


--
-- Name: finance_rules finance_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_rules
    ADD CONSTRAINT finance_rules_pkey PRIMARY KEY (id);


--
-- Name: finance_sources finance_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_sources
    ADD CONSTRAINT finance_sources_pkey PRIMARY KEY (id);


--
-- Name: finance_transactions finance_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: daily_logs_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_logs_user_created_idx ON public.daily_logs USING btree (user_id, created_at DESC);


--
-- Name: daily_logs_user_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX daily_logs_user_date_idx ON public.daily_logs USING btree (user_id, effective_date);


--
-- Name: film_cameras_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX film_cameras_user_id_idx ON public.film_cameras USING btree (user_id);


--
-- Name: film_maintenance_records_camera_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX film_maintenance_records_camera_id_idx ON public.film_maintenance_records USING btree (camera_id);


--
-- Name: film_maintenance_records_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX film_maintenance_records_user_id_idx ON public.film_maintenance_records USING btree (user_id);


--
-- Name: film_photos_roll_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX film_photos_roll_id_idx ON public.film_photos USING btree (film_roll_id);


--
-- Name: film_rolls_camera_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX film_rolls_camera_id_idx ON public.film_rolls USING btree (camera_id);


--
-- Name: film_rolls_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX film_rolls_user_id_idx ON public.film_rolls USING btree (user_id);


--
-- Name: finance_categories_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_categories_user_id_idx ON public.finance_categories USING btree (user_id);


--
-- Name: finance_corrections_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_corrections_user_id_idx ON public.finance_corrections USING btree (user_id, created_at DESC);


--
-- Name: finance_intake_items_image_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_intake_items_image_hash_idx ON public.finance_intake_items USING btree (user_id, image_hash);


--
-- Name: finance_intake_items_unique_image_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX finance_intake_items_unique_image_idx ON public.finance_intake_items USING btree (user_id, image_hash) WHERE (image_hash IS NOT NULL);


--
-- Name: finance_intake_items_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_intake_items_user_status_idx ON public.finance_intake_items USING btree (user_id, status);


--
-- Name: finance_processing_events_intake_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_processing_events_intake_idx ON public.finance_processing_events USING btree (intake_item_id, created_at);


--
-- Name: finance_sources_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_sources_user_id_idx ON public.finance_sources USING btree (user_id);


--
-- Name: finance_sources_user_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX finance_sources_user_name_idx ON public.finance_sources USING btree (user_id, lower(name));


--
-- Name: finance_transactions_category_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_transactions_category_id_idx ON public.finance_transactions USING btree (category_id);


--
-- Name: finance_transactions_source_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_transactions_source_id_idx ON public.finance_transactions USING btree (source_id);


--
-- Name: finance_transactions_user_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX finance_transactions_user_date_idx ON public.finance_transactions USING btree (user_id, transaction_date DESC);


--
-- Name: tickets tickets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_tickets_updated_at();


--
-- Name: api_keys api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: BRIDGE_role_modules app_role_modules_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BRIDGE_role_modules"
    ADD CONSTRAINT app_role_modules_module_id_fkey FOREIGN KEY (module_id) REFERENCES public."DIM_modules"(id) ON DELETE CASCADE;


--
-- Name: BRIDGE_role_modules app_role_modules_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BRIDGE_role_modules"
    ADD CONSTRAINT app_role_modules_role_id_fkey FOREIGN KEY (role_id) REFERENCES public."DIM_roles"(id) ON DELETE CASCADE;


--
-- Name: app_user_module_overrides app_user_module_overrides_module_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user_module_overrides
    ADD CONSTRAINT app_user_module_overrides_module_id_fkey FOREIGN KEY (module_id) REFERENCES public."DIM_modules"(id) ON DELETE CASCADE;


--
-- Name: app_user_module_overrides app_user_module_overrides_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user_module_overrides
    ADD CONSTRAINT app_user_module_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: BRIDGE_user_roles app_user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BRIDGE_user_roles"
    ADD CONSTRAINT app_user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public."DIM_roles"(id) ON DELETE CASCADE;


--
-- Name: BRIDGE_user_roles app_user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BRIDGE_user_roles"
    ADD CONSTRAINT app_user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: film_cameras film_cameras_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_cameras
    ADD CONSTRAINT film_cameras_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: film_drive_connections film_drive_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_drive_connections
    ADD CONSTRAINT film_drive_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: film_maintenance_records film_maintenance_records_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_maintenance_records
    ADD CONSTRAINT film_maintenance_records_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.film_cameras(id) ON DELETE CASCADE;


--
-- Name: film_maintenance_records film_maintenance_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_maintenance_records
    ADD CONSTRAINT film_maintenance_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: film_photos film_photos_film_roll_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_photos
    ADD CONSTRAINT film_photos_film_roll_id_fkey FOREIGN KEY (film_roll_id) REFERENCES public.film_rolls(id) ON DELETE CASCADE;


--
-- Name: film_photos film_photos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_photos
    ADD CONSTRAINT film_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: film_rolls film_rolls_camera_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_rolls
    ADD CONSTRAINT film_rolls_camera_id_fkey FOREIGN KEY (camera_id) REFERENCES public.film_cameras(id) ON DELETE SET NULL;


--
-- Name: film_rolls film_rolls_cover_photo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_rolls
    ADD CONSTRAINT film_rolls_cover_photo_id_fkey FOREIGN KEY (cover_photo_id) REFERENCES public.film_photos(id) ON DELETE SET NULL;


--
-- Name: film_rolls film_rolls_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.film_rolls
    ADD CONSTRAINT film_rolls_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_candidate_transactions finance_candidate_transactions_intake_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_candidate_transactions
    ADD CONSTRAINT finance_candidate_transactions_intake_item_id_fkey FOREIGN KEY (intake_item_id) REFERENCES public.finance_intake_items(id) ON DELETE CASCADE;


--
-- Name: finance_candidate_transactions finance_candidate_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_candidate_transactions
    ADD CONSTRAINT finance_candidate_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_categories finance_categories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_corrections finance_corrections_intake_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_corrections
    ADD CONSTRAINT finance_corrections_intake_item_id_fkey FOREIGN KEY (intake_item_id) REFERENCES public.finance_intake_items(id) ON DELETE SET NULL;


--
-- Name: finance_corrections finance_corrections_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_corrections
    ADD CONSTRAINT finance_corrections_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.finance_transactions(id) ON DELETE SET NULL;


--
-- Name: finance_corrections finance_corrections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_corrections
    ADD CONSTRAINT finance_corrections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_intake_items finance_intake_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_intake_items
    ADD CONSTRAINT finance_intake_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_processing_events finance_processing_events_intake_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_processing_events
    ADD CONSTRAINT finance_processing_events_intake_item_id_fkey FOREIGN KEY (intake_item_id) REFERENCES public.finance_intake_items(id) ON DELETE CASCADE;


--
-- Name: finance_processing_events finance_processing_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_processing_events
    ADD CONSTRAINT finance_processing_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_rule_suggestions finance_rule_suggestions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_rule_suggestions
    ADD CONSTRAINT finance_rule_suggestions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.finance_categories(id) ON DELETE CASCADE;


--
-- Name: finance_rule_suggestions finance_rule_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_rule_suggestions
    ADD CONSTRAINT finance_rule_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_rules finance_rules_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_rules
    ADD CONSTRAINT finance_rules_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.finance_categories(id) ON DELETE SET NULL;


--
-- Name: finance_rules finance_rules_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_rules
    ADD CONSTRAINT finance_rules_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.finance_sources(id) ON DELETE SET NULL;


--
-- Name: finance_rules finance_rules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_rules
    ADD CONSTRAINT finance_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_sources finance_sources_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_sources
    ADD CONSTRAINT finance_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: finance_transactions finance_transactions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.finance_categories(id) ON DELETE SET NULL;


--
-- Name: finance_transactions finance_transactions_intake_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_intake_item_id_fkey FOREIGN KEY (intake_item_id) REFERENCES public.finance_intake_items(id) ON DELETE SET NULL;


--
-- Name: finance_transactions finance_transactions_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.finance_sources(id) ON DELETE RESTRICT;


--
-- Name: finance_transactions finance_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notes notes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: BRIDGE_role_modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."BRIDGE_role_modules" ENABLE ROW LEVEL SECURITY;

--
-- Name: BRIDGE_user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."BRIDGE_user_roles" ENABLE ROW LEVEL SECURITY;

--
-- Name: DIM_modules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DIM_modules" ENABLE ROW LEVEL SECURITY;

--
-- Name: DIM_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DIM_roles" ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_sources Users can delete own finance sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own finance sources" ON public.finance_sources FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: daily_logs Users can delete own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own logs" ON public.daily_logs FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: projects Users can delete own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: tickets Users can delete own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own tickets" ON public.tickets FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: finance_sources Users can insert own finance sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own finance sources" ON public.finance_sources FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: daily_logs Users can insert own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own logs" ON public.daily_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: projects Users can insert own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: tickets Users can insert own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own tickets" ON public.tickets FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: finance_sources Users can update own finance sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own finance sources" ON public.finance_sources FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: daily_logs Users can update own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own logs" ON public.daily_logs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: projects Users can update own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: tickets Users can update own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own tickets" ON public.tickets FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: finance_sources Users can view own finance sources; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own finance sources" ON public.finance_sources FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: daily_logs Users can view own logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own logs" ON public.daily_logs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: projects Users can view own projects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: tickets Users can view own tickets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tickets" ON public.tickets FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: app_user_module_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_user_module_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: film_cameras; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.film_cameras ENABLE ROW LEVEL SECURITY;

--
-- Name: film_drive_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.film_drive_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: film_maintenance_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.film_maintenance_records ENABLE ROW LEVEL SECURITY;

--
-- Name: film_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.film_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: film_rolls; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.film_rolls ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_candidate_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_candidate_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_corrections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_corrections ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_intake_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_intake_items ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_processing_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_processing_events ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_rule_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_rule_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict CBwZnQIDqf1cDRMz5EPSUI29sl3CfsH9WIpothOBX527Y9RxvcuRIQlCFslKksQ

