-- Hotfix: reaplica incentiveHistory com isBonus + detection (RPC 360 estava sem esses campos em producao).

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
        AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, v_mkt)
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
            'isBonus', t.is_bonus,
            'detection', CASE
              WHEN public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt) AND coalesce(t.is_bonus, false) THEN 'mkt_gt_bonus'
              WHEN public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt) THEN 'mkt_gt'
              WHEN coalesce(t.is_bonus, false) THEN 'bonus'
              ELSE 'unknown'
            END,
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
        AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, v_mkt)
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

REVOKE ALL ON FUNCTION public.crm_get_player_360(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_get_player_360(text, text) TO authenticated;
