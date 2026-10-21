-- Identidade operacional (Agentes de Ativação / extensão SX B2C Assistant).
-- NÃO altera rake, incentivos nem funde registros financeiros.
-- Aplicar no remoto somente com autorização explícita.

CREATE TABLE IF NOT EXISTS public.crm_operational_identities (
  id text PRIMARY KEY,
  board_id text NOT NULL,
  reference_name text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_operational_identities_board_idx
  ON public.crm_operational_identities (board_id);

CREATE TABLE IF NOT EXISTS public.crm_identity_phones (
  id text PRIMARY KEY,
  board_id text NOT NULL,
  identity_id text NOT NULL
    REFERENCES public.crm_operational_identities (id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  phone_raw text,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('whatsapp_web', 'manual', 'import')),
  confirmation_status text NOT NULL DEFAULT 'pending'
    CHECK (confirmation_status IN ('pending', 'confirmed', 'revoked')),
  confirmed_by uuid REFERENCES auth.users (id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, identity_id, phone_e164)
);

CREATE INDEX IF NOT EXISTS crm_identity_phones_phone_idx
  ON public.crm_identity_phones (board_id, phone_e164);

CREATE TABLE IF NOT EXISTS public.crm_identity_player_ids (
  id text PRIMARY KEY,
  board_id text NOT NULL,
  identity_id text NOT NULL
    REFERENCES public.crm_operational_identities (id) ON DELETE CASCADE,
  player_id text NOT NULL,
  link_status text NOT NULL DEFAULT 'confirmed'
    CHECK (link_status IN ('confirmed', 'pending', 'revoked')),
  confirmed_by uuid REFERENCES auth.users (id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Player ID global: um vínculo ativo por board
  UNIQUE (board_id, player_id)
);

CREATE INDEX IF NOT EXISTS crm_identity_player_ids_identity_idx
  ON public.crm_identity_player_ids (board_id, identity_id);

CREATE TABLE IF NOT EXISTS public.crm_identity_audit (
  id text PRIMARY KEY,
  board_id text NOT NULL,
  identity_id text,
  actor_id uuid REFERENCES auth.users (id),
  operation text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  reason text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_identity_audit_identity_idx
  ON public.crm_identity_audit (board_id, identity_id, occurred_at DESC);

ALTER TABLE public.crm_operational_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_identity_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_identity_player_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_identity_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_operational_identities_auth ON public.crm_operational_identities;
CREATE POLICY crm_operational_identities_auth ON public.crm_operational_identities
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS crm_identity_phones_auth ON public.crm_identity_phones;
CREATE POLICY crm_identity_phones_auth ON public.crm_identity_phones
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS crm_identity_player_ids_auth ON public.crm_identity_player_ids;
CREATE POLICY crm_identity_player_ids_auth ON public.crm_identity_player_ids
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS crm_identity_audit_auth ON public.crm_identity_audit;
CREATE POLICY crm_identity_audit_auth ON public.crm_identity_audit
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.crm_player_id_exists(p_board_id text, p_player_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.campaign_players
    WHERE board_id = p_board_id AND player_id = p_player_id
    UNION ALL
    SELECT 1 FROM public.campaign_player_periods
    WHERE board_id = p_board_id AND player_id = p_player_id
    UNION ALL
    SELECT 1 FROM public.campaign_transactions
    WHERE board_id = p_board_id AND receiver_player_id = p_player_id
    UNION ALL
    SELECT 1 FROM public.campaign_table_details
    WHERE board_id = p_board_id AND player_id = p_player_id
    UNION ALL
    SELECT 1 FROM public.campaign_cohort_players
    WHERE board_id = p_board_id AND player_id = p_player_id
  );
$function$;

REVOKE ALL ON FUNCTION public.crm_player_id_exists(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_player_id_exists(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_activation_lookup(
  p_board_id text,
  p_player_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_exists boolean;
  v_360 jsonb;
  v_identity_id text;
  v_phones jsonb;
  v_linked jsonb;
  v_clubs jsonb;
BEGIN
  v_exists := public.crm_player_id_exists(p_board_id, p_player_id);
  IF NOT v_exists THEN
    RETURN jsonb_build_object(
      'found', false,
      'playerId', p_player_id,
      'message', 'Player ID não encontrado na base de dados.'
    );
  END IF;

  v_360 := public.crm_get_player_360(p_board_id, p_player_id);

  SELECT ip.identity_id INTO v_identity_id
  FROM public.crm_identity_player_ids ip
  WHERE ip.board_id = p_board_id
    AND ip.player_id = p_player_id
    AND ip.link_status = 'confirmed'
  LIMIT 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'phoneE164', ph.phone_e164,
    'phoneRaw', ph.phone_raw,
    'status', ph.confirmation_status,
    'source', ph.source,
    'confirmedAt', ph.confirmed_at
  ) ORDER BY ph.confirmed_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_phones
  FROM public.crm_identity_phones ph
  WHERE ph.board_id = p_board_id
    AND ph.identity_id = v_identity_id
    AND ph.confirmation_status <> 'revoked';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'playerId', ip.player_id,
    'status', ip.link_status,
    'confirmedAt', ip.confirmed_at
  ) ORDER BY ip.confirmed_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_linked
  FROM public.crm_identity_player_ids ip
  WHERE ip.board_id = p_board_id
    AND ip.identity_id = v_identity_id
    AND ip.link_status = 'confirmed';

  SELECT coalesce(jsonb_agg(DISTINCT x.club_code), '[]'::jsonb)
  INTO v_clubs
  FROM (
    SELECT pp.club_code
    FROM public.campaign_player_periods pp
    WHERE pp.board_id = p_board_id AND pp.player_id = p_player_id AND pp.club_code IS NOT NULL
    UNION
    SELECT t.club_code
    FROM public.campaign_transactions t
    WHERE t.board_id = p_board_id AND t.receiver_player_id = p_player_id AND t.club_code IS NOT NULL
  ) x;

  RETURN jsonb_build_object(
    'found', true,
    'playerId', p_player_id,
    'player360', v_360,
    'clubs', v_clubs,
    'identityId', v_identity_id,
    'phones', coalesce(v_phones, '[]'::jsonb),
    'linkedPlayerIds', coalesce(v_linked, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_activation_lookup(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_activation_lookup(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_confirm_identity_phone(
  p_board_id text,
  p_player_id text,
  p_phone_e164 text,
  p_phone_raw text DEFAULT NULL,
  p_source text DEFAULT 'manual',
  p_contact_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_identity_id text;
  v_phone_id text;
  v_conflict_identity text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sessão autenticada obrigatória.';
  END IF;
  IF p_phone_e164 IS NULL OR btrim(p_phone_e164) = '' THEN
    RAISE EXCEPTION 'Telefone obrigatório.';
  END IF;
  IF NOT public.crm_player_id_exists(p_board_id, p_player_id) THEN
    RAISE EXCEPTION 'Player ID não encontrado na base de dados.';
  END IF;

  SELECT ip.identity_id INTO v_identity_id
  FROM public.crm_identity_player_ids ip
  WHERE ip.board_id = p_board_id AND ip.player_id = p_player_id AND ip.link_status = 'confirmed'
  LIMIT 1;

  IF v_identity_id IS NULL THEN
    v_identity_id := 'oid-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    INSERT INTO public.crm_operational_identities (id, board_id, reference_name, created_by)
    VALUES (v_identity_id, p_board_id, nullif(btrim(coalesce(p_contact_name, '')), ''), v_actor);

    INSERT INTO public.crm_identity_player_ids (
      id, board_id, identity_id, player_id, link_status, confirmed_by, confirmed_at
    ) VALUES (
      'ipl-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      p_board_id, v_identity_id, p_player_id, 'confirmed', v_actor, now()
    );
  END IF;

  SELECT ph.identity_id INTO v_conflict_identity
  FROM public.crm_identity_phones ph
  WHERE ph.board_id = p_board_id
    AND ph.phone_e164 = p_phone_e164
    AND ph.confirmation_status = 'confirmed'
    AND ph.identity_id <> v_identity_id
  LIMIT 1;

  IF v_conflict_identity IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'conflict', true,
      'message', 'Telefone já confirmado em outra identidade. Revisão autorizada necessária.',
      'conflictIdentityId', v_conflict_identity
    );
  END IF;

  v_phone_id := 'iph-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  INSERT INTO public.crm_identity_phones (
    id, board_id, identity_id, phone_e164, phone_raw, source,
    confirmation_status, confirmed_by, confirmed_at
  ) VALUES (
    v_phone_id, p_board_id, v_identity_id, p_phone_e164, p_phone_raw,
    CASE WHEN p_source IN ('whatsapp_web', 'manual', 'import') THEN p_source ELSE 'manual' END,
    'confirmed', v_actor, now()
  )
  ON CONFLICT (board_id, identity_id, phone_e164) DO UPDATE
  SET confirmation_status = 'confirmed',
      confirmed_by = v_actor,
      confirmed_at = now(),
      phone_raw = coalesce(EXCLUDED.phone_raw, public.crm_identity_phones.phone_raw),
      source = EXCLUDED.source;

  INSERT INTO public.crm_identity_audit (
    id, board_id, identity_id, actor_id, operation, after_state
  ) VALUES (
    'aud-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    p_board_id, v_identity_id, v_actor, 'confirm_phone',
    jsonb_build_object('phoneE164', p_phone_e164, 'playerId', p_player_id, 'source', p_source)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'identityId', v_identity_id,
    'phoneE164', p_phone_e164
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_confirm_identity_phone(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_confirm_identity_phone(text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_associate_player_ids(
  p_board_id text,
  p_primary_player_id text,
  p_associate_player_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_identity_id text;
  v_other_identity text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Sessão autenticada obrigatória.';
  END IF;
  IF p_primary_player_id = p_associate_player_id THEN
    RAISE EXCEPTION 'Os Player IDs devem ser diferentes.';
  END IF;
  IF NOT public.crm_player_id_exists(p_board_id, p_primary_player_id) THEN
    RAISE EXCEPTION 'Player ID não encontrado na base de dados.';
  END IF;
  IF NOT public.crm_player_id_exists(p_board_id, p_associate_player_id) THEN
    RAISE EXCEPTION 'Player ID não encontrado na base de dados.';
  END IF;

  SELECT ip.identity_id INTO v_identity_id
  FROM public.crm_identity_player_ids ip
  WHERE ip.board_id = p_board_id
    AND ip.player_id = p_primary_player_id
    AND ip.link_status = 'confirmed'
  LIMIT 1;

  IF v_identity_id IS NULL THEN
    v_identity_id := 'oid-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    INSERT INTO public.crm_operational_identities (id, board_id, created_by)
    VALUES (v_identity_id, p_board_id, v_actor);
    INSERT INTO public.crm_identity_player_ids (
      id, board_id, identity_id, player_id, link_status, confirmed_by, confirmed_at
    ) VALUES (
      'ipl-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
      p_board_id, v_identity_id, p_primary_player_id, 'confirmed', v_actor, now()
    );
  END IF;

  SELECT ip.identity_id INTO v_other_identity
  FROM public.crm_identity_player_ids ip
  WHERE ip.board_id = p_board_id
    AND ip.player_id = p_associate_player_id
    AND ip.link_status = 'confirmed'
  LIMIT 1;

  IF v_other_identity IS NOT NULL AND v_other_identity = v_identity_id THEN
    RETURN jsonb_build_object('ok', true, 'alreadyLinked', true, 'identityId', v_identity_id);
  END IF;

  IF v_other_identity IS NOT NULL AND v_other_identity <> v_identity_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'conflict', true,
      'message', 'Player ID já vinculado a outra identidade. Revisão autorizada necessária.',
      'conflictIdentityId', v_other_identity
    );
  END IF;

  INSERT INTO public.crm_identity_player_ids (
    id, board_id, identity_id, player_id, link_status, confirmed_by, confirmed_at
  ) VALUES (
    'ipl-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    p_board_id, v_identity_id, p_associate_player_id, 'confirmed', v_actor, now()
  );

  INSERT INTO public.crm_identity_audit (
    id, board_id, identity_id, actor_id, operation, after_state
  ) VALUES (
    'aud-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    p_board_id, v_identity_id, v_actor, 'associate_player_id',
    jsonb_build_object(
      'primaryPlayerId', p_primary_player_id,
      'associatePlayerId', p_associate_player_id
    )
  );

  RETURN jsonb_build_object('ok', true, 'identityId', v_identity_id, 'alreadyLinked', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_associate_player_ids(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_associate_player_ids(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_get_operational_identity(
  p_board_id text,
  p_player_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_identity_id text;
  v_ref text;
  v_status text;
  v_phones jsonb;
  v_players jsonb;
  v_audit jsonb;
BEGIN
  SELECT ip.identity_id, oi.reference_name, oi.status
  INTO v_identity_id, v_ref, v_status
  FROM public.crm_identity_player_ids ip
  JOIN public.crm_operational_identities oi ON oi.id = ip.identity_id
  WHERE ip.board_id = p_board_id
    AND ip.player_id = p_player_id
    AND ip.link_status = 'confirmed'
  LIMIT 1;

  IF v_identity_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'playerId', p_player_id);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', ph.id,
    'phoneE164', ph.phone_e164,
    'phoneRaw', ph.phone_raw,
    'source', ph.source,
    'status', ph.confirmation_status,
    'confirmedAt', ph.confirmed_at,
    'confirmedBy', ph.confirmed_by
  ) ORDER BY ph.created_at), '[]'::jsonb)
  INTO v_phones
  FROM public.crm_identity_phones ph
  WHERE ph.identity_id = v_identity_id AND ph.confirmation_status <> 'revoked';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'playerId', ip.player_id,
    'status', ip.link_status,
    'confirmedAt', ip.confirmed_at,
    'confirmedBy', ip.confirmed_by
  ) ORDER BY ip.created_at), '[]'::jsonb)
  INTO v_players
  FROM public.crm_identity_player_ids ip
  WHERE ip.identity_id = v_identity_id AND ip.link_status = 'confirmed';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'operation', a.operation,
    'occurredAt', a.occurred_at,
    'actorId', a.actor_id,
    'after', a.after_state
  ) ORDER BY a.occurred_at DESC), '[]'::jsonb)
  INTO v_audit
  FROM (
    SELECT * FROM public.crm_identity_audit
    WHERE identity_id = v_identity_id
    ORDER BY occurred_at DESC
    LIMIT 20
  ) a;

  RETURN jsonb_build_object(
    'found', true,
    'identityId', v_identity_id,
    'referenceName', v_ref,
    'status', v_status,
    'phones', v_phones,
    'playerIds', v_players,
    'audit', v_audit
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_get_operational_identity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_get_operational_identity(text, text) TO authenticated;
