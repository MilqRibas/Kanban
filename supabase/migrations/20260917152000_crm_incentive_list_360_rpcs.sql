-- Etapa 2: RPCs de listagem e Player 360º com economia de incentivos (MKT GT).
-- Substitui crm_list_players (nova assinatura) e estende crm_get_player_360.
-- Depende de: crm_get_economic_settings, crm_compute_incentive_economics,
-- crm_is_mkt_gt_transfer, crm_incentive_metadata.

-- Assinatura antiga (6 args) não é substituída por CREATE OR REPLACE com 8 args.
DROP FUNCTION IF EXISTS public.crm_list_players(text, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.crm_list_players(
  p_board_id text,
  p_search text DEFAULT NULL,
  p_campaign_filter text DEFAULT 'all',
  p_sort text DEFAULT 'last_activity_desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_incentive_available_filter text DEFAULT 'all',
  p_incentive_received_filter text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
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
BEGIN
  IF p_board_id IS NULL OR p_board_id = '' THEN
    RAISE EXCEPTION 'board_id required';
  END IF;

  SELECT s.mkt_gt_player_id, s.league_fee_rate, s.incentive_limit_rate
  INTO v_mkt, v_league, v_limit_rate
  FROM public.crm_get_economic_settings(p_board_id) AS s;

  WITH player_ids AS (
    SELECT player_id
    FROM public.campaign_players
    WHERE board_id = p_board_id
    UNION
    SELECT player_id
    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
    UNION
    SELECT receiver_player_id AS player_id
    FROM public.campaign_transactions
    WHERE board_id = p_board_id
      AND receiver_player_id IS NOT NULL
      AND receiver_player_id <> ''
    UNION
    SELECT player_id
    FROM public.campaign_table_details
    WHERE board_id = p_board_id
    UNION
    SELECT player_id
    FROM public.campaign_cohort_players
    WHERE board_id = p_board_id
  ),
  rake AS (
    SELECT
      player_id,
      coalesce(sum(weekly_rake), 0)::numeric AS accumulated_rake,
      max(period_start) AS last_rake_period_start,
      max(period_end) AS last_rake_period_end
    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
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
        DISTINCT jsonb_build_object(
          'campaignId', cp.campaign_id,
          'campaignName', c.name,
          'agentId', c.agent_id,
          'acquiredAt', cp.acquired_at::text
        )
      ) FILTER (WHERE cp.campaign_id IS NOT NULL) AS campaigns,
      count(DISTINCT cp.campaign_id)::int AS campaign_count
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
      ) AS has_pending_classification
    FROM public.campaign_transactions t
    LEFT JOIN public.crm_incentive_metadata m
      ON m.board_id = t.board_id
     AND m.external_transaction_id = t.external_transaction_id
    WHERE t.board_id = p_board_id
      AND public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt)
      AND t.receiver_player_id IS NOT NULL
      AND t.receiver_player_id <> ''
      AND t.receiver_player_id <> v_mkt
    GROUP BY t.receiver_player_id
  ),
  base AS (
    SELECT
      ids.player_id,
      coalesce(m.name, lp.player_name) AS name,
      coalesce(m.nickname, lp.nickname, lt.nickname) AS nickname,
      coalesce(lp.agent_id, lt.agent_id) AS current_agent_id,
      a.name AS current_agent_name,
      coalesce(r.accumulated_rake, m.accumulated_rake, 0)::numeric AS accumulated_rake,
      r.last_rake_period_start,
      r.last_rake_period_end,
      greatest(
        r.last_rake_period_end,
        r.last_rake_period_start,
        m.last_seen_start,
        lt.activity_date
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
      CASE WHEN p_sort = 'disponivel_desc' THEN incentivo_disponivel END DESC NULLS LAST,
      CASE WHEN p_sort = 'disponivel_asc' THEN incentivo_disponivel END ASC NULLS LAST,
      CASE WHEN p_sort = 'enviado_desc' THEN incentivo_enviado_econ END DESC NULLS LAST,
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

CREATE OR REPLACE FUNCTION public.crm_get_player_360(
  p_board_id text,
  p_player_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_player text := nullif(trim(COALESCE(p_player_id, '')), '');
  v_mkt text;
  v_league numeric;
  v_limit_rate numeric;
BEGIN
  IF p_board_id IS NULL OR p_board_id = '' OR v_player IS NULL THEN
    RAISE EXCEPTION 'board_id and player_id required';
  END IF;

  SELECT s.mkt_gt_player_id, s.league_fee_rate, s.incentive_limit_rate
  INTO v_mkt, v_league, v_limit_rate
  FROM public.crm_get_economic_settings(p_board_id) AS s;

  RETURN (
    WITH master AS (
      SELECT *
      FROM public.campaign_players
      WHERE board_id = p_board_id AND player_id = v_player
    ),
    periods AS (
      SELECT *
      FROM public.campaign_player_periods
      WHERE board_id = p_board_id AND player_id = v_player
      ORDER BY period_start ASC
    ),
    rake_summary AS (
      SELECT
        coalesce(sum(weekly_rake), 0)::numeric AS accumulated_rake,
        count(*)::int AS periods_count,
        min(period_start) AS first_period_start,
        max(period_start) AS last_period_start,
        max(period_end) AS last_period_end
      FROM periods
    ),
    weekly AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'periodStart', period_start::text,
            'periodEnd', period_end::text,
            'agentId', agent_id,
            'weeklyRake', weekly_rake,
            'hands', hands,
            'gains', gains
          )
          ORDER BY period_start
        ),
        '[]'::jsonb
      ) AS series
      FROM periods
    ),
    latest_period AS (
      SELECT agent_id, player_name, nickname, period_start, period_end
      FROM periods
      ORDER BY period_start DESC
      LIMIT 1
    ),
    game_profile AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'gameType', game_type,
            'rake', rake,
            'hands', hands,
            'rows', rows_count
          )
          ORDER BY rake DESC
        ),
        '[]'::jsonb
      ) AS slices
      FROM (
        SELECT
          coalesce(nullif(trim(game_type), ''), 'OUTRO') AS game_type,
          sum(rake)::numeric AS rake,
          sum(hands)::int AS hands,
          count(*)::int AS rows_count
        FROM public.campaign_table_details
        WHERE board_id = p_board_id AND player_id = v_player
        GROUP BY 1
      ) g
    ),
    tx_summary AS (
      SELECT
        count(*) FILTER (WHERE is_deposit)::int AS deposit_count,
        count(*) FILTER (WHERE is_bonus)::int AS bonus_count,
        coalesce(sum(abs(amount)) FILTER (WHERE is_deposit), 0)::numeric AS deposited_volume,
        coalesce(sum(abs(amount)) FILTER (WHERE is_bonus), 0)::numeric AS bonus_volume
      FROM public.campaign_transactions
      WHERE board_id = p_board_id AND receiver_player_id = v_player
    ),
    recent_tx AS (
      SELECT coalesce(
        jsonb_agg(row_data ORDER BY sort_at DESC),
        '[]'::jsonb
      ) AS rows
      FROM (
        SELECT
          jsonb_build_object(
            'id', id,
            'externalTransactionId', external_transaction_id,
            'occurredAt', occurred_at,
            'periodStart', period_start::text,
            'periodEnd', period_end::text,
            'agentId', agent_id,
            'amount', amount,
            'isDeposit', is_deposit,
            'isBonus', is_bonus,
            'origin', origin,
            'transactionType', transaction_type
          ) AS row_data,
          coalesce(occurred_at, period_start::timestamptz) AS sort_at
        FROM public.campaign_transactions
        WHERE board_id = p_board_id AND receiver_player_id = v_player
        ORDER BY coalesce(occurred_at, period_start::timestamptz) DESC NULLS LAST
        LIMIT 50
      ) t
    ),
    campaigns AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'campaignId', cp.campaign_id,
            'campaignName', c.name,
            'agentId', c.agent_id,
            'agency', c.agency,
            'acquiredAt', cp.acquired_at::text,
            'sourceAgentId', cp.source_agent_id,
            'currentAgentId', cp.current_agent_id,
            'firstSeenWeek', cp.first_seen_week::text,
            'lastSeenWeek', cp.last_seen_week::text
          )
          ORDER BY cp.acquired_at
        ),
        '[]'::jsonb
      ) AS rows
      FROM public.campaign_cohort_players cp
      LEFT JOIN public.campaigns c
        ON c.id = cp.campaign_id AND c.board_id = cp.board_id
      WHERE cp.board_id = p_board_id AND cp.player_id = v_player
    ),
    tx_identity AS (
      SELECT
        nullif(trim(receiver_nickname), '') AS nickname,
        agent_id
      FROM public.campaign_transactions
      WHERE board_id = p_board_id AND receiver_player_id = v_player
      ORDER BY occurred_at DESC NULLS LAST
      LIMIT 1
    ),
    mkt_enviado AS (
      SELECT coalesce(sum(abs(t.amount)), 0)::numeric AS incentivo_enviado
      FROM public.campaign_transactions t
      WHERE t.board_id = p_board_id
        AND t.receiver_player_id = v_player
        AND public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt)
    ),
    incentives AS (
      SELECT public.crm_compute_incentive_economics(
        coalesce((SELECT accumulated_rake FROM rake_summary), 0),
        (SELECT incentivo_enviado FROM mkt_enviado),
        v_league,
        v_limit_rate
      ) AS economics
    ),
    incentive_history AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object(
            'amount', t.amount,
            'occurredAt', t.occurred_at,
            'externalTransactionId', t.external_transaction_id,
            'senderPlayerId', t.sender_player_id,
            'agentId', t.agent_id,
            'classification', m.classification,
            'product', m.product,
            'purpose', m.purpose,
            'notes', m.notes,
            'classifiedBy', m.classified_by,
            'classifiedAt', m.classified_at
          )
          ORDER BY t.occurred_at ASC NULLS LAST, t.external_transaction_id ASC
        ),
        '[]'::jsonb
      ) AS rows
      FROM public.campaign_transactions t
      LEFT JOIN public.crm_incentive_metadata m
        ON m.board_id = t.board_id
       AND m.external_transaction_id = t.external_transaction_id
      WHERE t.board_id = p_board_id
        AND t.receiver_player_id = v_player
        AND public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt)
    ),
    exists_check AS (
      SELECT (
        EXISTS (SELECT 1 FROM master)
        OR EXISTS (SELECT 1 FROM periods)
        OR EXISTS (
          SELECT 1 FROM public.campaign_transactions
          WHERE board_id = p_board_id AND receiver_player_id = v_player
        )
        OR EXISTS (
          SELECT 1 FROM public.campaign_table_details
          WHERE board_id = p_board_id AND player_id = v_player
        )
        OR EXISTS (
          SELECT 1 FROM public.campaign_cohort_players
          WHERE board_id = p_board_id AND player_id = v_player
        )
      ) AS player_exists
    )
    SELECT CASE
      WHEN NOT (SELECT player_exists FROM exists_check) THEN NULL
      ELSE jsonb_build_object(
        'playerId', v_player,
        'boardId', p_board_id,
        'name', coalesce((SELECT name FROM master), (SELECT player_name FROM latest_period)),
        'nickname', coalesce(
          (SELECT nickname FROM master),
          (SELECT nickname FROM latest_period),
          (SELECT nickname FROM tx_identity)
        ),
        'currentAgentId', coalesce(
          (SELECT agent_id FROM latest_period),
          (SELECT agent_id FROM tx_identity)
        ),
        'currentAgentName', (
          SELECT name FROM public.campaign_agents
          WHERE board_id = p_board_id
            AND agent_id = coalesce(
              (SELECT agent_id FROM latest_period),
              (SELECT agent_id FROM tx_identity)
            )
          LIMIT 1
        ),
        'rake', (SELECT jsonb_build_object(
          'accumulatedRake', accumulated_rake,
          'periodsCount', periods_count,
          'firstPeriodStart', first_period_start::text,
          'lastPeriodStart', last_period_start::text,
          'lastPeriodEnd', last_period_end::text
        ) FROM rake_summary),
        'weeklyRake', (SELECT series FROM weekly),
        'gameProfile', (SELECT slices FROM game_profile),
        'transactions', (SELECT jsonb_build_object(
          'depositCount', deposit_count,
          'bonusCount', bonus_count,
          'depositedVolume', deposited_volume,
          'bonusVolume', bonus_volume,
          'recent', (SELECT rows FROM recent_tx)
        ) FROM tx_summary),
        'campaigns', (SELECT rows FROM campaigns),
        'hasCampaign', (SELECT jsonb_array_length(rows) > 0 FROM campaigns),
        'incentives', (SELECT economics FROM incentives),
        'incentiveHistory', (SELECT rows FROM incentive_history),
        'freshness', public.crm_data_freshness(p_board_id)
      )
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_list_players(text, text, text, text, integer, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_list_players(text, text, text, text, integer, integer, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.crm_get_player_360(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_get_player_360(text, text) TO authenticated;
