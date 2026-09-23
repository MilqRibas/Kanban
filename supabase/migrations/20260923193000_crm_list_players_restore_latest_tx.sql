-- Restaura last activity / agent via latest_tx (paridade com BI anterior),
-- mantendo as otimizações: sem table_details, incentivos só bônus/MKT, timeout 30s.

CREATE OR REPLACE FUNCTION public.crm_list_players(
  p_board_id text,
  p_search text DEFAULT NULL,
  p_campaign_filter text DEFAULT 'all',
  p_sort text DEFAULT 'last_activity_desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_incentive_available_filter text DEFAULT 'all',
  p_incentive_received_filter text DEFAULT 'all',
  p_club text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_mkt text;
  v_league numeric;
  v_limit_rate numeric;
  v_total integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_club text := CASE
    WHEN p_club IS NULL OR btrim(p_club) = '' OR p_club = 'all' THEN NULL
    WHEN p_club IN ('sx_club', 'xtreme_pro') THEN p_club
    ELSE NULL
  END;
BEGIN
  IF p_board_id IS NULL OR p_board_id = '' THEN
    RAISE EXCEPTION 'board_id required';
  END IF;

  SELECT s.mkt_gt_player_id, s.league_fee_rate, s.incentive_limit_rate
  INTO v_mkt, v_league, v_limit_rate
  FROM public.crm_get_economic_settings(p_board_id) AS s;

  WITH rake AS (
    SELECT
      player_id,
      coalesce(sum(weekly_rake), 0)::numeric AS accumulated_rake,
      max(period_start) AS last_rake_period_start,
      max(period_end) AS last_rake_period_end
    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
      AND (v_club IS NULL OR club_code = v_club OR (v_club = 'sx_club' AND club_code IS NULL))
    GROUP BY player_id
  ),
  latest_period AS (
    SELECT DISTINCT ON (player_id)
      player_id,
      agent_id,
      nullif(trim(player_name), '') AS player_name,
      nullif(trim(nickname), '') AS nickname,
      period_start
    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
      AND (v_club IS NULL OR club_code = v_club OR (v_club = 'sx_club' AND club_code IS NULL))
    ORDER BY player_id, period_start DESC, period_end DESC
  ),
  latest_tx AS (
    SELECT DISTINCT ON (receiver_player_id)
      receiver_player_id AS player_id,
      agent_id,
      nullif(trim(receiver_nickname), '') AS nickname,
      coalesce((occurred_at AT TIME ZONE 'UTC')::date, period_start) AS activity_date
    FROM public.campaign_transactions
    WHERE board_id = p_board_id
      AND receiver_player_id IS NOT NULL
      AND receiver_player_id <> ''
      AND (v_club IS NULL OR club_code = v_club OR (v_club = 'sx_club' AND club_code IS NULL))
    ORDER BY receiver_player_id, occurred_at DESC NULLS LAST, period_start DESC
  ),
  master AS (
    SELECT
      player_id,
      nullif(trim(name), '') AS name,
      nullif(trim(nickname), '') AS nickname,
      accumulated_rake,
      last_seen_start
    FROM public.campaign_players
    WHERE board_id = p_board_id
  ),
  cohorts AS (
    SELECT
      cp.player_id,
      jsonb_agg(
        jsonb_build_object(
          'campaignId', cp.campaign_id,
          'campaignName', c.name,
          'agentId', c.agent_id,
          'acquiredAt', cp.acquired_at::text
        )
      ) AS campaigns,
      count(*)::int AS campaign_count
    FROM public.campaign_cohort_players cp
    LEFT JOIN public.campaigns c
      ON c.id = cp.campaign_id AND c.board_id = cp.board_id
    WHERE cp.board_id = p_board_id
    GROUP BY cp.player_id
  ),
  agents AS (
    SELECT agent_id, name
    FROM public.campaign_agents
    WHERE board_id = p_board_id
  ),
  mkt_incentives AS (
    SELECT
      t.receiver_player_id AS player_id,
      coalesce(sum(abs(t.amount)), 0)::numeric AS incentivo_enviado,
      true AS has_mkt_gt_incentive,
      bool_or(
        coalesce(m.classification, 'pendente') = 'pendente'
      ) AS has_pending_classification,
      max(coalesce((t.occurred_at AT TIME ZONE 'UTC')::date, t.period_start)) AS last_incentive_date,
      max(nullif(trim(t.receiver_nickname), '')) AS nickname
    FROM public.campaign_transactions t
    LEFT JOIN public.crm_incentive_metadata m
      ON m.board_id = t.board_id
     AND m.external_transaction_id = t.external_transaction_id
    WHERE t.board_id = p_board_id
      AND t.receiver_player_id IS NOT NULL
      AND t.receiver_player_id <> ''
      AND (v_mkt IS NULL OR t.receiver_player_id <> v_mkt)
      AND (
        coalesce(t.is_bonus, false)
        OR (v_mkt IS NOT NULL AND t.sender_player_id = v_mkt)
      )
      AND (v_club IS NULL OR t.club_code = v_club OR (v_club = 'sx_club' AND t.club_code IS NULL))
    GROUP BY t.receiver_player_id
  ),
  player_ids AS (
    SELECT player_id FROM master
    UNION
    SELECT player_id FROM rake
    UNION
    SELECT player_id FROM mkt_incentives
  ),
  base AS (
    SELECT
      ids.player_id,
      coalesce(m.name, lp.player_name) AS name,
      coalesce(m.nickname, lp.nickname, lt.nickname, mi.nickname) AS nickname,
      coalesce(lp.agent_id, lt.agent_id) AS current_agent_id,
      a.name AS current_agent_name,
      CASE
        WHEN v_club IS NULL THEN coalesce(r.accumulated_rake, m.accumulated_rake, 0)
        ELSE coalesce(r.accumulated_rake, 0)
      END::numeric AS accumulated_rake,
      r.last_rake_period_start,
      r.last_rake_period_end,
      greatest(
        r.last_rake_period_end,
        r.last_rake_period_start,
        CASE WHEN v_club IS NULL THEN m.last_seen_start END,
        lt.activity_date,
        mi.last_incentive_date
      ) AS last_activity_date,
      coalesce(ch.campaign_count, 0) AS campaign_count,
      coalesce(ch.campaigns, '[]'::jsonb) AS campaigns,
      (coalesce(ch.campaign_count, 0) > 0) AS has_campaign,
      coalesce(mi.incentivo_enviado, 0)::numeric AS incentivo_enviado,
      coalesce(mi.has_mkt_gt_incentive, false) AS has_mkt_gt_incentive,
      coalesce(mi.has_pending_classification, false) AS has_pending_classification
    FROM player_ids ids
    LEFT JOIN master m ON m.player_id = ids.player_id
    LEFT JOIN rake r ON r.player_id = ids.player_id
    LEFT JOIN latest_period lp ON lp.player_id = ids.player_id
    LEFT JOIN latest_tx lt ON lt.player_id = ids.player_id
    LEFT JOIN cohorts ch ON ch.player_id = ids.player_id
    LEFT JOIN agents a ON a.agent_id = coalesce(lp.agent_id, lt.agent_id)
    LEFT JOIN mkt_incentives mi ON mi.player_id = ids.player_id
  ),
  with_econ AS (
    SELECT
      b.*,
      public.crm_compute_incentive_economics(
        b.accumulated_rake,
        b.incentivo_enviado,
        v_league,
        v_limit_rate
      ) AS economics
    FROM base b
  ),
  enriched AS (
    SELECT
      w.*,
      (w.economics->>'limiteIncentivo')::numeric AS limite_incentivo,
      (w.economics->>'incentivoEnviado')::numeric AS incentivo_enviado_econ,
      (w.economics->>'incentivoDisponivel')::numeric AS incentivo_disponivel
    FROM with_econ w
  ),
  filtered AS (
    SELECT *
    FROM enriched
    WHERE (
      v_club IS NULL
      OR last_rake_period_start IS NOT NULL
      OR coalesce(incentivo_enviado, 0) <> 0
    )
    AND (
      v_search IS NULL
      OR player_id ILIKE '%' || v_search || '%'
      OR coalesce(name, '') ILIKE '%' || v_search || '%'
      OR coalesce(nickname, '') ILIKE '%' || v_search || '%'
      OR coalesce(current_agent_id, '') ILIKE '%' || v_search || '%'
      OR coalesce(current_agent_name, '') ILIKE '%' || v_search || '%'
    )
    AND (
      p_campaign_filter IS NULL
      OR p_campaign_filter = 'all'
      OR (p_campaign_filter = 'with_campaign' AND has_campaign)
      OR (p_campaign_filter = 'without_campaign' AND NOT has_campaign)
    )
    AND (
      p_incentive_available_filter IS NULL
      OR p_incentive_available_filter = 'all'
      OR (p_incentive_available_filter = 'positive' AND incentivo_disponivel > 0)
      OR (p_incentive_available_filter = 'zero' AND incentivo_disponivel = 0)
      OR (p_incentive_available_filter = 'negative' AND incentivo_disponivel < 0)
    )
    AND (
      p_incentive_received_filter IS NULL
      OR p_incentive_received_filter = 'all'
      OR (p_incentive_received_filter = 'received' AND has_mkt_gt_incentive)
      OR (p_incentive_received_filter = 'never' AND NOT has_mkt_gt_incentive)
      OR (p_incentive_received_filter = 'pending_classification' AND has_pending_classification)
    )
  ),
  counted AS (
    SELECT count(*)::int AS total FROM filtered
  ),
  sorted AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN p_sort = 'rake_desc' THEN accumulated_rake END DESC NULLS LAST,
      CASE WHEN p_sort = 'rake_asc' THEN accumulated_rake END ASC NULLS LAST,
      CASE WHEN p_sort = 'player_id_asc' THEN player_id END ASC,
      CASE WHEN p_sort = 'player_id_desc' THEN player_id END DESC,
      CASE WHEN p_sort = 'last_activity_asc' THEN last_activity_date END ASC NULLS LAST,
      CASE WHEN p_sort = 'limite_desc' THEN limite_incentivo END DESC NULLS LAST,
      CASE WHEN p_sort = 'limite_asc' THEN limite_incentivo END ASC NULLS LAST,
      CASE WHEN p_sort = 'disponivel_desc' THEN incentivo_disponivel END DESC NULLS LAST,
      CASE WHEN p_sort = 'disponivel_asc' THEN incentivo_disponivel END ASC NULLS LAST,
      CASE WHEN p_sort = 'enviado_desc' THEN incentivo_enviado_econ END DESC NULLS LAST,
      CASE WHEN p_sort = 'enviado_asc' THEN incentivo_enviado_econ END ASC NULLS LAST,
      CASE
        WHEN p_sort IS NULL OR p_sort = 'last_activity_desc'
        THEN last_activity_date
      END DESC NULLS LAST,
      player_id ASC
    LIMIT v_limit
    OFFSET v_offset
  )
  SELECT
    (SELECT total FROM counted),
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'playerId', s.player_id,
            'name', s.name,
            'nickname', s.nickname,
            'currentAgentId', s.current_agent_id,
            'currentAgentName', s.current_agent_name,
            'accumulatedRake', s.accumulated_rake,
            'lastRakePeriodStart', s.last_rake_period_start::text,
            'lastRakePeriodEnd', s.last_rake_period_end::text,
            'lastActivityDate', s.last_activity_date::text,
            'hasCampaign', s.has_campaign,
            'campaignCount', s.campaign_count,
            'campaigns', s.campaigns,
            'originLabel', CASE
              WHEN s.has_campaign THEN coalesce(
                (s.campaigns -> 0 ->> 'campaignName'),
                'Campanha'
              )
              ELSE 'Base Geral'
            END,
            'limiteIncentivo', s.limite_incentivo,
            'incentivoEnviado', s.incentivo_enviado_econ,
            'incentivoDisponivel', s.incentivo_disponivel,
            'hasMktGtIncentive', s.has_mkt_gt_incentive,
            'hasPendingClassification', s.has_pending_classification
          )
        )
        FROM sorted s
      ),
      '[]'::jsonb
    )
  INTO v_total, v_rows;

  RETURN jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rows', v_rows
  );
END;
$$;
