-- Etapa 2: commit TX com sender_player_id + backfill de classificação MKT GT

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
  v_backfill jsonb;
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
    receiver_player_id, receiver_nickname, sender_player_id,
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

  -- Classificação automática Ativação/Pendente para novos envios MKT GT
  -- Metadata preservada por external_transaction_id (replace não duplica).
  v_backfill := public.crm_backfill_incentive_classifications(v_board_id);

  RETURN jsonb_build_object(
    'import_id', v_import_id,
    'replaced_deleted_rows', v_deleted,
    'incentiveBackfill', v_backfill
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_campaign_transactions(jsonb, jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_campaign_transactions(jsonb, jsonb, text[]) TO authenticated;
