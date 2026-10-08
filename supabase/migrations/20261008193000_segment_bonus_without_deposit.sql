-- Condição de segmentação: recebeu bônus concluído e não tem depósito válido.
-- NULL = histórico de depósitos não cobre a atividade do jogador (não entra em Sim nem em Não).
-- No SX, transações sem club_code são o histórico anterior à coluna de clube.

DROP FUNCTION IF EXISTS public.crm_preview_segment(text, jsonb, integer);
DROP FUNCTION IF EXISTS public.crm_preview_segment(text, jsonb, integer, text);
DROP FUNCTION IF EXISTS public.crm_list_segment_players(text, jsonb);
DROP FUNCTION IF EXISTS public.crm_player_segment_facts(text);
DROP FUNCTION IF EXISTS public.crm_player_segment_facts(text, text);

CREATE OR REPLACE FUNCTION public.crm_eval_segment_condition(
  p_facts jsonb,
  p_condition jsonb
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_field text := p_condition->>'field';
  v_op text := lower(coalesce(p_condition->>'op', ''));
  v_raw jsonb := p_facts -> v_field;
  v_num numeric;
  v_num2 numeric;
  v_text text;
  v_bool boolean;
  v_arr text[];
BEGIN
  IF v_field IS NULL OR v_op = '' THEN
    RETURN false;
  END IF;

  IF v_field IN ('has_campaign', 'ever_received_incentive', 'bonus_without_deposit') THEN
    -- Sem histórico suficiente: não casa com Sim nem com Não.
    IF v_field = 'bonus_without_deposit' AND (v_raw IS NULL OR v_raw = 'null'::jsonb) THEN
      RETURN false;
    END IF;
    v_bool := coalesce((v_raw)#>>'{}', 'false')::boolean;
    IF v_op IN ('eq', 'is', '=') THEN
      RETURN v_bool = coalesce((p_condition->'value')#>>'{}', 'false')::boolean;
    ELSIF v_op IN ('neq', 'is_not', '!=') THEN
      RETURN v_bool <> coalesce((p_condition->'value')#>>'{}', 'false')::boolean;
    END IF;
    RETURN false;
  END IF;

  IF v_field = 'campaign_ids' THEN
    SELECT array_agg(x) INTO v_arr
    FROM jsonb_array_elements_text(coalesce(v_raw, '[]'::jsonb)) AS t(x);
    v_text := coalesce(p_condition->>'value', '');
    IF v_op IN ('contains', 'in', 'eq', 'is') THEN
      RETURN v_text = ANY(coalesce(v_arr, ARRAY[]::text[]));
    ELSIF v_op IN ('not_contains', 'not_in', 'neq') THEN
      RETURN NOT (v_text = ANY(coalesce(v_arr, ARRAY[]::text[])));
    END IF;
    RETURN false;
  END IF;

  IF v_field IN ('player_id', 'name', 'nickname', 'agent_id') THEN
    v_text := coalesce(v_raw#>>'{}', '');
    IF v_op IN ('eq', 'is', '=') THEN
      RETURN lower(v_text) = lower(coalesce(p_condition->>'value', ''));
    ELSIF v_op IN ('neq', 'is_not', '!=') THEN
      RETURN lower(v_text) <> lower(coalesce(p_condition->>'value', ''));
    ELSIF v_op = 'contains' THEN
      RETURN position(lower(coalesce(p_condition->>'value', '')) IN lower(v_text)) > 0;
    END IF;
    RETURN false;
  END IF;

  IF v_raw IS NULL OR v_raw = 'null'::jsonb THEN
    RETURN false;
  END IF;
  BEGIN
    v_num := (v_raw#>>'{}')::numeric;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  IF v_op IN ('gt', '>') THEN
    RETURN v_num > (p_condition->>'value')::numeric;
  ELSIF v_op IN ('gte', '>=') THEN
    RETURN v_num >= (p_condition->>'value')::numeric;
  ELSIF v_op IN ('lt', '<') THEN
    RETURN v_num < (p_condition->>'value')::numeric;
  ELSIF v_op IN ('lte', '<=') THEN
    RETURN v_num <= (p_condition->>'value')::numeric;
  ELSIF v_op IN ('eq', '=', 'is') THEN
    RETURN v_num = (p_condition->>'value')::numeric;
  ELSIF v_op = 'between' THEN
    v_num2 := coalesce((p_condition->>'valueTo')::numeric, (p_condition->'value'->>1)::numeric);
    RETURN v_num >= (coalesce(p_condition->>'value', p_condition->'value'->>0))::numeric
       AND v_num <= v_num2;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_eval_segment_condition(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_eval_segment_condition(jsonb, jsonb) TO authenticated;

CREATE FUNCTION public.crm_player_segment_facts(p_board_id text, p_club text)
RETURNS TABLE (
  player_id text,
  name text,
  nickname text,
  agent_id text,
  has_campaign boolean,
  campaign_ids text[],
  accumulated_rake numeric,
  rake_7d numeric,
  rake_30d numeric,
  rake_60d numeric,
  rake_90d numeric,
  days_since_last_rake int,
  last_rake_at date,
  incentive_limit numeric,
  incentive_sent numeric,
  incentive_available numeric,
  incentive_count int,
  last_incentive_at timestamptz,
  ever_received_incentive boolean,
  bonus_without_deposit boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scope AS (
    SELECT CASE
      WHEN p_club IN ('sx_club', 'xtreme_pro') THEN p_club
      ELSE NULL
    END AS club
  ),
  settings AS (
    SELECT * FROM public.crm_get_economic_settings(p_board_id)
  ),
  ids AS (
    SELECT cp.player_id
    FROM public.campaign_players cp
    CROSS JOIN scope s
    WHERE cp.board_id = p_board_id
      AND s.club IS NULL
    UNION
    SELECT pp.player_id
    FROM public.campaign_player_periods pp
    CROSS JOIN scope s
    WHERE pp.board_id = p_board_id
      AND s.club IS NOT NULL
      AND pp.club_code = s.club
    UNION
    SELECT t.receiver_player_id
    FROM public.campaign_transactions t
    CROSS JOIN scope s
    WHERE t.board_id = p_board_id
      AND s.club IS NOT NULL
      AND t.club_code = s.club
      AND t.receiver_player_id IS NOT NULL
      AND t.receiver_player_id <> ''
  ),
  period_rake AS (
    SELECT pp.player_id, sum(public.rake_consolidated(pp.weekly_rake, pp.spin_fee))::numeric AS period_rake
    FROM public.campaign_player_periods pp
    CROSS JOIN scope s
    WHERE pp.board_id = p_board_id
      AND (s.club IS NULL OR pp.club_code = s.club)
    GROUP BY pp.player_id
  ),
  players AS (
    SELECT
      ids.player_id,
      cp.name,
      cp.nickname,
      CASE
        WHEN s.club IS NULL THEN coalesce(pr.period_rake, cp.accumulated_rake, 0)
        ELSE coalesce(pr.period_rake, 0)
      END::numeric AS accumulated_rake
    FROM ids
    CROSS JOIN scope s
    LEFT JOIN public.campaign_players cp
      ON cp.board_id = p_board_id AND cp.player_id = ids.player_id
    LEFT JOIN period_rake pr ON pr.player_id = ids.player_id
  ),
  camps AS (
    SELECT
      ccp.player_id,
      array_agg(DISTINCT ccp.campaign_id) FILTER (WHERE ccp.campaign_id IS NOT NULL) AS campaign_ids,
      bool_or(ccp.campaign_id IS NOT NULL) AS has_campaign
    FROM public.campaign_cohort_players ccp
    WHERE ccp.board_id = p_board_id
    GROUP BY ccp.player_id
  ),
  agents AS (
    SELECT DISTINCT ON (pp.player_id)
      pp.player_id,
      pp.agent_id
    FROM public.campaign_player_periods pp
    CROSS JOIN scope s
    WHERE pp.board_id = p_board_id
      AND (s.club IS NULL OR pp.club_code = s.club)
    ORDER BY pp.player_id, pp.period_end DESC NULLS LAST
  ),
  rake AS (
    SELECT
      pp.player_id,
      coalesce(sum(public.rake_consolidated(pp.weekly_rake, pp.spin_fee)) FILTER (WHERE pp.period_end >= (current_date - 7)), 0)::numeric AS rake_7d,
      coalesce(sum(public.rake_consolidated(pp.weekly_rake, pp.spin_fee)) FILTER (WHERE pp.period_end >= (current_date - 30)), 0)::numeric AS rake_30d,
      coalesce(sum(public.rake_consolidated(pp.weekly_rake, pp.spin_fee)) FILTER (WHERE pp.period_end >= (current_date - 60)), 0)::numeric AS rake_60d,
      coalesce(sum(public.rake_consolidated(pp.weekly_rake, pp.spin_fee)) FILTER (WHERE pp.period_end >= (current_date - 90)), 0)::numeric AS rake_90d,
      max(pp.period_end)::date AS last_rake_at
    FROM public.campaign_player_periods pp
    CROSS JOIN scope s
    WHERE pp.board_id = p_board_id
      AND (s.club IS NULL OR pp.club_code = s.club)
    GROUP BY pp.player_id
  ),
  tx_inc AS (
    SELECT
      t.receiver_player_id AS player_id,
      count(*)::int AS incentive_count,
      coalesce(sum(abs(t.amount)), 0)::numeric AS incentive_sent,
      max(t.occurred_at) AS last_incentive_at
    FROM public.campaign_transactions t
    CROSS JOIN settings s
    CROSS JOIN scope sc
    WHERE t.board_id = p_board_id
      AND (sc.club IS NULL OR t.club_code = sc.club)
      AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, s.mkt_gt_player_id)
    GROUP BY t.receiver_player_id
  ),
  tx_money AS (
    SELECT
      t.receiver_player_id AS player_id,
      bool_or(
        t.is_bonus IS TRUE
        AND t.order_status ILIKE 'conclu%'
        AND (t.system_status IS NULL OR t.system_status ILIKE 'conclu%')
      ) AS received_bonus,
      bool_or(t.is_deposit IS TRUE) AS has_deposit
    FROM public.campaign_transactions t
    CROSS JOIN scope sc
    WHERE t.board_id = p_board_id
      AND t.receiver_player_id IS NOT NULL
      AND t.receiver_player_id <> ''
      AND (
        sc.club IS NULL
        OR (sc.club = 'xtreme_pro' AND t.club_code = 'xtreme_pro')
        OR (sc.club = 'sx_club' AND (t.club_code = 'sx_club' OR t.club_code IS NULL))
      )
    GROUP BY t.receiver_player_id
  ),
  history_bounds AS (
    SELECT
      (SELECT min(occurred_at)::date
         FROM public.campaign_transactions
        WHERE board_id = p_board_id AND club_code = 'xtreme_pro') AS xt_from,
      (SELECT min(occurred_at)::date
         FROM public.campaign_transactions
        WHERE board_id = p_board_id
          AND (club_code = 'sx_club' OR club_code IS NULL)) AS sx_from
  ),
  player_span AS (
    SELECT
      pp.player_id,
      min(pp.period_start) FILTER (WHERE pp.club_code = 'xtreme_pro') AS xt_first,
      min(pp.period_start) FILTER (WHERE pp.club_code = 'sx_club' OR pp.club_code IS NULL) AS sx_first
    FROM public.campaign_player_periods pp
    WHERE pp.board_id = p_board_id
    GROUP BY pp.player_id
  )
  SELECT
    p.player_id,
    p.name,
    p.nickname,
    a.agent_id,
    coalesce(c.has_campaign, false),
    coalesce(c.campaign_ids, ARRAY[]::text[]),
    p.accumulated_rake,
    coalesce(r.rake_7d, 0),
    coalesce(r.rake_30d, 0),
    coalesce(r.rake_60d, 0),
    coalesce(r.rake_90d, 0),
    CASE WHEN r.last_rake_at IS NULL THEN NULL ELSE (current_date - r.last_rake_at) END,
    r.last_rake_at,
    (p.accumulated_rake * (1 - s.league_fee_rate) * s.incentive_limit_rate),
    coalesce(i.incentive_sent, 0),
    (p.accumulated_rake * (1 - s.league_fee_rate) * s.incentive_limit_rate) - coalesce(i.incentive_sent, 0),
    coalesce(i.incentive_count, 0),
    i.last_incentive_at,
    coalesce(i.incentive_count, 0) > 0,
    CASE
      WHEN coalesce(m.received_bonus, false) IS NOT TRUE THEN false
      WHEN coalesce(m.has_deposit, false) THEN false
      WHEN NOT (
        CASE
          WHEN sc.club = 'xtreme_pro' THEN
            hb.xt_from IS NOT NULL
            AND (ps.xt_first IS NULL OR ps.xt_first >= hb.xt_from - 7)
          WHEN sc.club = 'sx_club' THEN
            hb.sx_from IS NOT NULL
            AND (ps.sx_first IS NULL OR ps.sx_first >= hb.sx_from - 7)
          ELSE
            hb.xt_from IS NOT NULL
            AND hb.sx_from IS NOT NULL
            AND (ps.xt_first IS NULL OR ps.xt_first >= hb.xt_from - 7)
            AND (ps.sx_first IS NULL OR ps.sx_first >= hb.sx_from - 7)
        END
      ) THEN NULL
      ELSE true
    END
  FROM players p
  CROSS JOIN settings s
  CROSS JOIN scope sc
  CROSS JOIN history_bounds hb
  LEFT JOIN camps c ON c.player_id = p.player_id
  LEFT JOIN agents a ON a.player_id = p.player_id
  LEFT JOIN rake r ON r.player_id = p.player_id
  LEFT JOIN tx_inc i ON i.player_id = p.player_id
  LEFT JOIN tx_money m ON m.player_id = p.player_id
  LEFT JOIN player_span ps ON ps.player_id = p.player_id;
$$;

REVOKE ALL ON FUNCTION public.crm_player_segment_facts(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_player_segment_facts(text, text) TO authenticated;

CREATE FUNCTION public.crm_player_segment_facts(p_board_id text)
RETURNS TABLE (
  player_id text,
  name text,
  nickname text,
  agent_id text,
  has_campaign boolean,
  campaign_ids text[],
  accumulated_rake numeric,
  rake_7d numeric,
  rake_30d numeric,
  rake_60d numeric,
  rake_90d numeric,
  days_since_last_rake int,
  last_rake_at date,
  incentive_limit numeric,
  incentive_sent numeric,
  incentive_available numeric,
  incentive_count int,
  last_incentive_at timestamptz,
  ever_received_incentive boolean,
  bonus_without_deposit boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM public.crm_player_segment_facts(p_board_id, NULL::text);
$$;

REVOKE ALL ON FUNCTION public.crm_player_segment_facts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_player_segment_facts(text) TO authenticated;

CREATE FUNCTION public.crm_preview_segment(
  p_board_id text,
  p_definition jsonb,
  p_sample_limit int DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_sample jsonb := '[]'::jsonb;
  r record;
  v_facts jsonb;
BEGIN
  FOR r IN
    SELECT * FROM public.crm_player_segment_facts(p_board_id)
  LOOP
    v_facts := to_jsonb(r);
    IF public.crm_player_matches_segment(v_facts, p_definition) THEN
      v_count := v_count + 1;
      IF jsonb_array_length(v_sample) < greatest(coalesce(p_sample_limit, 20), 1) THEN
        v_sample := v_sample || jsonb_build_array(jsonb_build_object(
          'playerId', r.player_id,
          'name', r.name,
          'nickname', r.nickname,
          'incentiveAvailable', r.incentive_available,
          'accumulatedRake', r.accumulated_rake
        ));
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'count', v_count,
    'sample', v_sample
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_preview_segment(text, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_preview_segment(text, jsonb, int) TO authenticated;

CREATE FUNCTION public.crm_preview_segment(
  p_board_id text,
  p_definition jsonb,
  p_sample_limit int,
  p_club text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_sample jsonb := '[]'::jsonb;
  r record;
  v_facts jsonb;
  v_mode text;
  v_econ text;
  v_sx text[];
  v_xt text[];
  v_has_sx boolean;
  v_has_xt boolean;
BEGIN
  v_mode := CASE
    WHEN p_club IS NULL OR btrim(p_club) = '' OR p_club = 'all' THEN 'all'
    WHEN p_club IN ('sx_club', 'xtreme_pro', 'sx_only', 'xtreme_only', 'both') THEN p_club
    ELSE 'all'
  END;
  v_econ := CASE
    WHEN v_mode IN ('sx_club', 'xtreme_pro') THEN v_mode
    ELSE NULL
  END;

  IF v_mode IN ('sx_only', 'xtreme_only', 'both') THEN
    SELECT coalesce(array_agg(DISTINCT player_id), ARRAY[]::text[])
    INTO v_sx
    FROM (
      SELECT pp.player_id
      FROM public.campaign_player_periods pp
      WHERE pp.board_id = p_board_id AND pp.club_code = 'sx_club'
      UNION
      SELECT t.receiver_player_id
      FROM public.campaign_transactions t
      WHERE t.board_id = p_board_id
        AND t.club_code = 'sx_club'
        AND t.receiver_player_id IS NOT NULL
        AND t.receiver_player_id <> ''
    ) s;

    SELECT coalesce(array_agg(DISTINCT player_id), ARRAY[]::text[])
    INTO v_xt
    FROM (
      SELECT pp.player_id
      FROM public.campaign_player_periods pp
      WHERE pp.board_id = p_board_id AND pp.club_code = 'xtreme_pro'
      UNION
      SELECT t.receiver_player_id
      FROM public.campaign_transactions t
      WHERE t.board_id = p_board_id
        AND t.club_code = 'xtreme_pro'
        AND t.receiver_player_id IS NOT NULL
        AND t.receiver_player_id <> ''
    ) s;
  END IF;

  FOR r IN
    SELECT * FROM public.crm_player_segment_facts(p_board_id, v_econ)
  LOOP
    IF v_mode IN ('sx_only', 'xtreme_only', 'both') THEN
      v_has_sx := r.player_id = ANY (v_sx);
      v_has_xt := r.player_id = ANY (v_xt);
      IF v_mode = 'sx_only' AND NOT (v_has_sx AND NOT v_has_xt) THEN
        CONTINUE;
      END IF;
      IF v_mode = 'xtreme_only' AND NOT (v_has_xt AND NOT v_has_sx) THEN
        CONTINUE;
      END IF;
      IF v_mode = 'both' AND NOT (v_has_sx AND v_has_xt) THEN
        CONTINUE;
      END IF;
    END IF;
    v_facts := to_jsonb(r);
    IF public.crm_player_matches_segment(v_facts, p_definition) THEN
      v_count := v_count + 1;
      IF jsonb_array_length(v_sample) < greatest(coalesce(p_sample_limit, 20), 1) THEN
        v_sample := v_sample || jsonb_build_array(jsonb_build_object(
          'playerId', r.player_id,
          'name', r.name,
          'nickname', r.nickname,
          'incentiveAvailable', r.incentive_available,
          'accumulatedRake', r.accumulated_rake
        ));
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('count', v_count, 'sample', v_sample);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_preview_segment(text, jsonb, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_preview_segment(text, jsonb, int, text) TO authenticated;

CREATE FUNCTION public.crm_list_segment_players(
  p_board_id text,
  p_definition jsonb
) RETURNS TABLE (
  player_id text,
  name text,
  nickname text,
  incentive_available numeric,
  accumulated_rake numeric,
  rake_30d numeric,
  days_since_last_rake integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  r record;
  v_facts jsonb;
BEGIN
  FOR r IN
    SELECT * FROM public.crm_player_segment_facts(p_board_id)
  LOOP
    v_facts := to_jsonb(r);
    IF public.crm_player_matches_segment(v_facts, p_definition) THEN
      player_id := r.player_id;
      name := r.name;
      nickname := r.nickname;
      incentive_available := r.incentive_available;
      accumulated_rake := r.accumulated_rake;
      rake_30d := r.rake_30d;
      days_since_last_rake := r.days_since_last_rake;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_list_segment_players(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_list_segment_players(text, jsonb) TO authenticated;
