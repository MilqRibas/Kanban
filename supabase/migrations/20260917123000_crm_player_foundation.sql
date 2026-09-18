-- CRM Etapa 1: fundação de listagem global de jogadores + Player 360º
-- Não altera regras de Campanhas. Reutiliza fatos existentes (periods/TX/cohort).
-- security invoker: respeita RLS das tabelas base.

-- ---------------------------------------------------------------------------
-- Freshness: última data confirmada de imports de rake / transações
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_data_freshness(p_board_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'boardId', p_board_id,
    'rakeUpdatedThrough', (
      SELECT max(period_end)::text
      FROM public.campaign_report_imports
      WHERE board_id = p_board_id
        AND status = 'completed'
    ),
    'transactionsUpdatedThrough', (
      SELECT greatest(
        (SELECT max(period_end) FROM public.campaign_transaction_imports
          WHERE board_id = p_board_id AND status = 'completed'),
        (SELECT max((occurred_at AT TIME ZONE 'UTC')::date)
          FROM public.campaign_transactions
          WHERE board_id = p_board_id AND occurred_at IS NOT NULL)
      )::text
    )
  );
$$;

REVOKE ALL ON FUNCTION public.crm_data_freshness(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_data_freshness(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Listagem paginada server-side da base geral de Player IDs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_list_players(
  p_board_id text,
  p_search text DEFAULT NULL,
  p_campaign_filter text DEFAULT 'all', -- all | with_campaign | without_campaign
  p_sort text DEFAULT 'last_activity_desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
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
  v_total integer := 0;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF p_board_id IS NULL OR p_board_id = '' THEN
    RAISE EXCEPTION 'board_id required';
  END IF;

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
      (coalesce(ch.campaign_count, 0) > 0) AS has_campaign
    FROM player_ids ids
    LEFT JOIN master m ON m.player_id = ids.player_id
    LEFT JOIN rake r ON r.player_id = ids.player_id
    LEFT JOIN latest_period lp ON lp.player_id = ids.player_id
    LEFT JOIN latest_tx lt ON lt.player_id = ids.player_id
    LEFT JOIN cohorts ch ON ch.player_id = ids.player_id
    LEFT JOIN agents a ON a.agent_id = coalesce(lp.agent_id, lt.agent_id)
  ),
  filtered AS (
    SELECT *
    FROM base
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
            END
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

REVOKE ALL ON FUNCTION public.crm_list_players(text, text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_list_players(text, text, text, text, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Player 360º: consolidação sob demanda (sem table_details brutos)
-- ---------------------------------------------------------------------------
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
BEGIN
  IF p_board_id IS NULL OR p_board_id = '' OR v_player IS NULL THEN
    RAISE EXCEPTION 'board_id and player_id required';
  END IF;

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
        'freshness', public.crm_data_freshness(p_board_id)
      )
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_get_player_360(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_get_player_360(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- TX commit: também garante presença no master campaign_players (sem zerar rake)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_campaign_transactions(
  p_import jsonb,
  p_transactions jsonb,
  p_replace_import_ids text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_import_id text;
  v_deleted int := 0;
  v_board_id text;
BEGIN
  v_import_id := p_import->>'id';
  v_board_id := p_import->>'board_id';
  IF v_import_id IS NULL OR v_import_id = '' THEN
    RAISE EXCEPTION 'import id required';
  END IF;
  IF v_board_id IS NULL OR v_board_id = '' THEN
    RAISE EXCEPTION 'board_id required';
  END IF;

  IF p_replace_import_ids IS NOT NULL AND array_length(p_replace_import_ids, 1) > 0 THEN
    DELETE FROM public.campaign_transactions
    WHERE import_id = ANY (p_replace_import_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    UPDATE public.campaign_transaction_imports
      SET status = 'replaced'
    WHERE id = ANY (p_replace_import_ids);
  END IF;

  INSERT INTO public.campaign_transaction_imports (
    id, board_id, original_filename, period_start, period_end,
    imported_at, imported_by, status, transactions_count, deposits_count,
    bonuses_count, agents_count, players_count, warnings, summary,
    replaced_import_id, created_at
  ) VALUES (
    v_import_id,
    v_board_id,
    COALESCE(p_import->>'original_filename', ''),
    (p_import->>'period_start')::date,
    (p_import->>'period_end')::date,
    COALESCE((p_import->>'imported_at')::timestamptz, now()),
    p_import->>'imported_by',
    COALESCE(p_import->>'status', 'completed'),
    COALESCE((p_import->>'transactions_count')::int, 0),
    COALESCE((p_import->>'deposits_count')::int, 0),
    COALESCE((p_import->>'bonuses_count')::int, 0),
    COALESCE((p_import->>'agents_count')::int, 0),
    COALESCE((p_import->>'players_count')::int, 0),
    p_import->'warnings',
    p_import->'summary',
    p_import->>'replaced_import_id',
    COALESCE((p_import->>'created_at')::timestamptz, now())
  );

  INSERT INTO public.campaign_transactions (
    id, board_id, import_id, external_transaction_id,
    receiver_player_id, receiver_nickname, agent_id, agent_nickname,
    occurred_at, period_start, period_end, origin, transaction_type,
    amount, chips_send_out, chips_claimback, system_status, order_status,
    is_deposit, is_bonus, raw, created_at
  )
  SELECT
    t->>'id',
    t->>'board_id',
    t->>'import_id',
    t->>'external_transaction_id',
    t->>'receiver_player_id',
    t->>'receiver_nickname',
    NULLIF(t->>'agent_id', ''),
    t->>'agent_nickname',
    NULLIF(t->>'occurred_at', '')::timestamptz,
    (t->>'period_start')::date,
    (t->>'period_end')::date,
    t->>'origin',
    t->>'transaction_type',
    COALESCE((t->>'amount')::numeric, 0),
    NULLIF(t->>'chips_send_out', '')::numeric,
    NULLIF(t->>'chips_claimback', '')::numeric,
    t->>'system_status',
    t->>'order_status',
    COALESCE((t->>'is_deposit')::boolean, false),
    COALESCE((t->>'is_bonus')::boolean, false),
    t->'raw',
    COALESCE((t->>'created_at')::timestamptz, now())
  FROM jsonb_array_elements(COALESCE(p_transactions, '[]'::jsonb)) AS t
  ON CONFLICT (board_id, external_transaction_id) DO UPDATE SET
    import_id = EXCLUDED.import_id,
    receiver_player_id = EXCLUDED.receiver_player_id,
    receiver_nickname = EXCLUDED.receiver_nickname,
    agent_id = EXCLUDED.agent_id,
    agent_nickname = EXCLUDED.agent_nickname,
    occurred_at = EXCLUDED.occurred_at,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    origin = EXCLUDED.origin,
    transaction_type = EXCLUDED.transaction_type,
    amount = EXCLUDED.amount,
    chips_send_out = EXCLUDED.chips_send_out,
    chips_claimback = EXCLUDED.chips_claimback,
    system_status = EXCLUDED.system_status,
    order_status = EXCLUDED.order_status,
    is_deposit = EXCLUDED.is_deposit,
    is_bonus = EXCLUDED.is_bonus,
    raw = EXCLUDED.raw;

  -- Garante Player ID no master CRM sem alterar rake acumulado existente
  INSERT INTO public.campaign_players (
    board_id, player_id, name, nickname,
    first_seen_start, last_seen_start, periods_count, accumulated_rake,
    created_at, updated_at
  )
  SELECT
    v_board_id,
    x.player_id,
    coalesce(x.nickname, ''),
    coalesce(x.nickname, ''),
    x.first_seen,
    x.last_seen,
    0,
    0,
    now(),
    now()
  FROM (
    SELECT
      receiver_player_id AS player_id,
      nullif(trim(max(receiver_nickname)), '') AS nickname,
      min(period_start) AS first_seen,
      max(period_start) AS last_seen
    FROM public.campaign_transactions
    WHERE board_id = v_board_id
      AND import_id = v_import_id
      AND receiver_player_id IS NOT NULL
      AND receiver_player_id <> ''
    GROUP BY receiver_player_id
  ) x
  ON CONFLICT (board_id, player_id) DO UPDATE SET
    nickname = CASE
      WHEN coalesce(nullif(trim(EXCLUDED.nickname), ''), '') <> ''
        THEN EXCLUDED.nickname
      ELSE public.campaign_players.nickname
    END,
    name = CASE
      WHEN coalesce(nullif(trim(public.campaign_players.name), ''), '') = ''
        AND coalesce(nullif(trim(EXCLUDED.name), ''), '') <> ''
        THEN EXCLUDED.name
      ELSE public.campaign_players.name
    END,
    last_seen_start = GREATEST(
      public.campaign_players.last_seen_start,
      EXCLUDED.last_seen_start
    ),
    first_seen_start = LEAST(
      public.campaign_players.first_seen_start,
      EXCLUDED.first_seen_start
    ),
    updated_at = now();

  RETURN jsonb_build_object(
    'import_id', v_import_id,
    'replaced_deleted_rows', v_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_campaign_transactions(jsonb, jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_campaign_transactions(jsonb, jsonb, text[]) TO authenticated;
