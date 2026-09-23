-- Import de transações em lotes (mesmo import_id lógico).
-- begin → append* → finalize | fail

CREATE OR REPLACE FUNCTION public.begin_campaign_transaction_import(
  p_import jsonb,
  p_replace_import_ids text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_import_id text;
  v_board_id text;
  v_deleted int := 0;
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
    'processing',
    COALESCE((p_import->>'transactions_count')::int, 0),
    COALESCE((p_import->>'deposits_count')::int, 0),
    COALESCE((p_import->>'bonuses_count')::int, 0),
    COALESCE((p_import->>'agents_count')::int, 0),
    COALESCE((p_import->>'players_count')::int, 0),
    p_import->'warnings',
    COALESCE(p_import->'summary', '{}'::jsonb) || jsonb_build_object('batchesCompleted', 0),
    p_import->>'replaced_import_id',
    COALESCE((p_import->>'created_at')::timestamptz, now())
  );

  RETURN jsonb_build_object(
    'import_id', v_import_id,
    'replaced_deleted_rows', v_deleted,
    'status', 'processing'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_campaign_transactions(
  p_board_id text,
  p_import_id text,
  p_transactions jsonb,
  p_batch_index int DEFAULT 1,
  p_batch_total int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
BEGIN
  IF p_board_id IS NULL OR p_board_id = '' THEN
    RAISE EXCEPTION 'board_id required';
  END IF;
  IF p_import_id IS NULL OR p_import_id = '' THEN
    RAISE EXCEPTION 'import_id required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_transaction_imports
    WHERE id = p_import_id AND board_id = p_board_id AND status = 'processing'
  ) THEN
    RAISE EXCEPTION 'import % não está em processing', p_import_id;
  END IF;

  INSERT INTO public.campaign_transactions (
    id, board_id, import_id, external_transaction_id,
    receiver_player_id, receiver_nickname, sender_player_id, sender_nickname,
    club_code, club_name, sx_type,
    agent_id, agent_nickname,
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
    NULLIF(t->>'sender_player_id', ''),
    NULLIF(t->>'sender_nickname', ''),
    NULLIF(t->>'club_code', ''),
    NULLIF(t->>'club_name', ''),
    NULLIF(t->>'sx_type', ''),
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
    sender_player_id = COALESCE(EXCLUDED.sender_player_id, public.campaign_transactions.sender_player_id),
    sender_nickname = COALESCE(EXCLUDED.sender_nickname, public.campaign_transactions.sender_nickname),
    club_code = COALESCE(EXCLUDED.club_code, public.campaign_transactions.club_code),
    club_name = COALESCE(EXCLUDED.club_name, public.campaign_transactions.club_name),
    sx_type = COALESCE(EXCLUDED.sx_type, public.campaign_transactions.sx_type),
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

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.campaign_transaction_imports
  SET summary = coalesce(summary, '{}'::jsonb)
    || jsonb_build_object(
      'batchesCompleted', p_batch_index,
      'batchesTotal', p_batch_total,
      'lastBatchRows', v_count
    )
  WHERE id = p_import_id;

  RETURN jsonb_build_object(
    'import_id', p_import_id,
    'batch_index', p_batch_index,
    'batch_total', p_batch_total,
    'rows', v_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_campaign_transaction_import(
  p_board_id text,
  p_import_id text,
  p_status text DEFAULT 'completed'
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_backfill jsonb := '{}'::jsonb;
BEGIN
  IF p_status NOT IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'status inválido';
  END IF;

  IF p_status = 'completed' THEN
    INSERT INTO public.campaign_players (
      board_id, player_id, name, nickname,
      first_seen_start, last_seen_start, periods_count, accumulated_rake,
      created_at, updated_at
    )
    SELECT
      p_board_id,
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
      WHERE board_id = p_board_id
        AND import_id = p_import_id
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

    v_backfill := public.crm_backfill_incentive_classifications(p_board_id);
  END IF;

  UPDATE public.campaign_transaction_imports
  SET status = p_status,
      summary = coalesce(summary, '{}'::jsonb)
        || jsonb_build_object('finalizedAt', now())
  WHERE id = p_import_id
    AND board_id = p_board_id;

  RETURN jsonb_build_object(
    'import_id', p_import_id,
    'status', p_status,
    'incentiveBackfill', v_backfill
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_campaign_transaction_import(jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_campaign_transaction_import(jsonb, text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.append_campaign_transactions(text, text, jsonb, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_campaign_transactions(text, text, jsonb, int, int) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_campaign_transaction_import(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_campaign_transaction_import(text, text, text) TO authenticated;

-- Ativação Xtreme = incentivo enviado do motor (mesma regra OR).
CREATE OR REPLACE FUNCTION public.crm_xtreme_case_summary(p_board_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH settings AS (
    SELECT coalesce(
      (SELECT mkt_gt_player_id FROM public.crm_economic_settings WHERE board_id = p_board_id),
      '1092502'
    ) AS mkt
  ),
  periods AS (
    SELECT agent_id, player_id, weekly_rake
    FROM public.campaign_player_periods
    WHERE board_id = p_board_id
      AND club_code = 'xtreme_pro'
  ),
  dep AS (
    SELECT
      coalesce(agent_id, '') AS agent_id,
      coalesce(sum(abs(amount)), 0)::numeric AS deposits
    FROM public.campaign_transactions
    WHERE board_id = p_board_id
      AND club_code = 'xtreme_pro'
      AND is_deposit
    GROUP BY coalesce(agent_id, '')
  ),
  incentives AS (
    SELECT coalesce(sum(abs(t.amount)), 0)::numeric AS incentive_sent
    FROM public.campaign_transactions t
    CROSS JOIN settings s
    WHERE t.board_id = p_board_id
      AND t.club_code = 'xtreme_pro'
      AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, s.mkt)
      AND t.receiver_player_id IS NOT NULL
      AND t.receiver_player_id <> ''
      AND t.receiver_player_id <> s.mkt
  ),
  agencies AS (
    SELECT
      p.agent_id,
      coalesce(a.name, p.agent_id) AS agent_name,
      coalesce(sum(p.weekly_rake), 0)::numeric AS weekly_rake,
      count(DISTINCT p.player_id)::int AS players,
      count(DISTINCT p.player_id) FILTER (WHERE p.weekly_rake > 0)::int AS active_players,
      coalesce(d.deposits, 0)::numeric AS deposits
    FROM periods p
    LEFT JOIN public.campaign_agents a
      ON a.board_id = p_board_id AND a.agent_id = p.agent_id
    LEFT JOIN dep d ON d.agent_id = p.agent_id
    GROUP BY p.agent_id, a.name, d.deposits
  ),
  totals AS (
    SELECT
      coalesce((SELECT sum(weekly_rake) FROM periods), 0)::numeric AS rake_bruto,
      (SELECT count(DISTINCT player_id)::int FROM periods) AS players,
      (
        SELECT count(DISTINCT player_id)::int
        FROM (
          SELECT player_id FROM periods GROUP BY player_id HAVING sum(weekly_rake) > 0
        ) active
      ) AS active_players,
      coalesce((SELECT sum(deposits) FROM dep), 0)::numeric AS deposits,
      coalesce((SELECT incentive_sent FROM incentives), 0)::numeric AS incentive_sent,
      (
        EXISTS (SELECT 1 FROM periods)
        OR EXISTS (
          SELECT 1 FROM public.campaign_transactions
          WHERE board_id = p_board_id AND club_code = 'xtreme_pro'
        )
      ) AS has_activity
  )
  SELECT jsonb_build_object(
    'hasActivity', t.has_activity,
    'rakeBruto', t.rake_bruto,
    'players', coalesce(t.players, 0),
    'activePlayers', coalesce(t.active_players, 0),
    'deposits', t.deposits,
    'incentiveSent', t.incentive_sent,
    'activation', t.incentive_sent,
    'agencies', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'agentId', ag.agent_id,
          'agentName', ag.agent_name,
          'weeklyRake', ag.weekly_rake,
          'players', ag.players,
          'activePlayers', ag.active_players,
          'deposits', ag.deposits
        )
        ORDER BY ag.agent_name
      )
      FROM agencies ag
    ), '[]'::jsonb)
  )
  FROM totals t;
$$;

REVOKE ALL ON FUNCTION public.crm_xtreme_case_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_xtreme_case_summary(text) TO authenticated;
