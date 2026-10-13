CREATE OR REPLACE FUNCTION public.crm_player_segment_facts(p_board_id text)
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
  ever_received_incentive boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH settings AS (
    SELECT * FROM public.crm_get_economic_settings(p_board_id)
  ),
  players AS (
    SELECT
      cp.player_id,
      cp.name,
      cp.nickname,
      coalesce(cp.accumulated_rake, 0)::numeric AS accumulated_rake
    FROM public.campaign_players cp
    WHERE cp.board_id = p_board_id
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
    WHERE pp.board_id = p_board_id
    ORDER BY pp.player_id, pp.period_end DESC NULLS LAST
  ),
  rake AS (
    SELECT
      pp.player_id,
      coalesce(sum(pp.weekly_rake) FILTER (WHERE pp.period_end >= (current_date - 7)), 0)::numeric AS rake_7d,
      coalesce(sum(pp.weekly_rake) FILTER (WHERE pp.period_end >= (current_date - 30)), 0)::numeric AS rake_30d,
      coalesce(sum(pp.weekly_rake) FILTER (WHERE pp.period_end >= (current_date - 60)), 0)::numeric AS rake_60d,
      coalesce(sum(pp.weekly_rake) FILTER (WHERE pp.period_end >= (current_date - 90)), 0)::numeric AS rake_90d,
      max(pp.period_end)::date AS last_rake_at
    FROM public.campaign_player_periods pp
    WHERE pp.board_id = p_board_id
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
    WHERE t.board_id = p_board_id
      AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, s.mkt_gt_player_id)
    GROUP BY t.receiver_player_id
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
    coalesce(i.incentive_count, 0) > 0
  FROM players p
  CROSS JOIN settings s
  LEFT JOIN camps c ON c.player_id = p.player_id
  LEFT JOIN agents a ON a.player_id = p.player_id
  LEFT JOIN rake r ON r.player_id = p.player_id
  LEFT JOIN tx_inc i ON i.player_id = p.player_id;
$$;

REVOKE ALL ON FUNCTION public.crm_player_segment_facts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_player_segment_facts(text) TO authenticated;

-- Avalia uma condição numérica/boolean/texto contra um fato
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

  -- boolean fields
  IF v_field IN ('has_campaign', 'ever_received_incentive') THEN
    v_bool := coalesce((v_raw)#>>'{}', 'false')::boolean;
    IF v_op IN ('eq', 'is', '=') THEN
      RETURN v_bool = coalesce((p_condition->'value')#>>'{}', 'false')::boolean;
    ELSIF v_op IN ('neq', 'is_not', '!=') THEN
      RETURN v_bool <> coalesce((p_condition->'value')#>>'{}', 'false')::boolean;
    END IF;
    RETURN false;
  END IF;

  -- array contains (campaign_ids)
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

  -- text fields
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

  -- numeric (incl. days_since_last_rake; NULL fails comparisons)
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

CREATE OR REPLACE FUNCTION public.crm_player_matches_segment(
  p_facts jsonb,
  p_definition jsonb
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_group jsonb;
  v_cond jsonb;
  v_group_ok boolean;
  v_cond_ok boolean;
  v_group_logic text := lower(coalesce(p_definition->>'groupLogic', 'or'));
  v_any_group boolean := false;
  v_groups jsonb := coalesce(p_definition->'groups', '[]'::jsonb);
BEGIN
  IF jsonb_array_length(v_groups) = 0 THEN
    RETURN false;
  END IF;

  FOR v_group IN SELECT * FROM jsonb_array_elements(v_groups)
  LOOP
    v_group_ok := CASE WHEN lower(coalesce(v_group->>'logic', 'and')) = 'or' THEN false ELSE true END;
    IF coalesce(jsonb_array_length(v_group->'conditions'), 0) = 0 THEN
      v_group_ok := false;
    ELSE
      FOR v_cond IN SELECT * FROM jsonb_array_elements(v_group->'conditions')
      LOOP
        v_cond_ok := public.crm_eval_segment_condition(p_facts, v_cond);
        IF lower(coalesce(v_group->>'logic', 'and')) = 'or' THEN
          v_group_ok := v_group_ok OR v_cond_ok;
        ELSE
          v_group_ok := v_group_ok AND v_cond_ok;
        END IF;
      END LOOP;
    END IF;
    v_any_group := v_any_group OR v_group_ok;
    IF v_group_logic = 'and' AND NOT v_group_ok THEN
      RETURN false;
    END IF;
    IF v_group_logic = 'or' AND v_group_ok THEN
      RETURN true;
    END IF;
  END LOOP;

  IF v_group_logic = 'and' THEN
    RETURN true;
  END IF;
  RETURN v_any_group;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_player_matches_segment(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_player_matches_segment(jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_preview_segment(
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
