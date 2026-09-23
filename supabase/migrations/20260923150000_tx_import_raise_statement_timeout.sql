-- Import TX grande estoura o statement_timeout=8s do role authenticated.
-- Sobe o timeout nas RPCs de lote e tira o backfill de incentivo do finalize
-- (caminho crítico), para o import completar mesmo no Free Nano.

CREATE OR REPLACE FUNCTION public.begin_campaign_transaction_import(
  p_import jsonb,
  p_replace_import_ids text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
SET statement_timeout TO '300s'
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
SET statement_timeout TO '300s'
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

-- Finalize sem backfill de incentivo (feito à parte, best-effort).
CREATE OR REPLACE FUNCTION public.finalize_campaign_transaction_import(
  p_board_id text,
  p_import_id text,
  p_status text DEFAULT 'completed'
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
SET statement_timeout TO '300s'
AS $function$
DECLARE
  v_players int := 0;
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

    GET DIAGNOSTICS v_players = ROW_COUNT;
  END IF;

  UPDATE public.campaign_transaction_imports
  SET status = p_status,
      summary = coalesce(summary, '{}'::jsonb)
        || jsonb_build_object(
          'finalizedAt', now(),
          'playersUpserted', v_players
        )
  WHERE id = p_import_id
    AND board_id = p_board_id;

  RETURN jsonb_build_object(
    'import_id', p_import_id,
    'status', p_status,
    'playersUpserted', v_players
  );
END;
$function$;

-- Backfill pesado: timeout próprio (chamado fora do finalize).
CREATE OR REPLACE FUNCTION public.crm_backfill_incentive_classifications(p_board_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
SET statement_timeout TO '300s'
AS $function$
DECLARE
  v_mkt text;
  v_inserted int := 0;
  v_ativacoes int := 0;
  v_pendentes int := 0;
  v_total_tx int := 0;
  v_total_amount numeric := 0;
  v_unique_players int := 0;
  v_only_mkt int := 0;
  v_only_bonus int := 0;
  v_both int := 0;
BEGIN
  SELECT mkt_gt_player_id INTO v_mkt
  FROM public.crm_get_economic_settings(p_board_id);

  WITH incentive AS (
    SELECT
      t.external_transaction_id,
      t.receiver_player_id,
      t.amount,
      coalesce(t.occurred_at, t.period_start::timestamptz) AS sort_at,
      public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt) AS is_mkt,
      coalesce(t.is_bonus, false) AS is_bonus
    FROM public.campaign_transactions t
    WHERE t.board_id = p_board_id
      AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, v_mkt)
      AND t.receiver_player_id IS NOT NULL
      AND t.receiver_player_id <> ''
      AND t.receiver_player_id <> v_mkt
  ),
  ranked AS (
    SELECT
      external_transaction_id,
      receiver_player_id,
      amount,
      row_number() OVER (
        PARTITION BY receiver_player_id
        ORDER BY sort_at ASC NULLS LAST, external_transaction_id ASC
      ) AS rn
    FROM incentive
  ),
  upserted AS (
    INSERT INTO public.crm_incentive_metadata (
      board_id, external_transaction_id, classification,
      auto_classified, classified_at, created_at, updated_at
    )
    SELECT
      p_board_id,
      r.external_transaction_id,
      CASE WHEN r.rn = 1 THEN 'ativacao' ELSE 'pendente' END,
      true,
      now(),
      now(),
      now()
    FROM ranked r
    ON CONFLICT (board_id, external_transaction_id) DO NOTHING
    RETURNING classification
  )
  SELECT
    (SELECT count(*) FROM upserted),
    (SELECT count(*) FROM upserted WHERE classification = 'ativacao'),
    (SELECT count(*) FROM upserted WHERE classification = 'pendente')
  INTO v_inserted, v_ativacoes, v_pendentes;

  SELECT
    count(*),
    coalesce(sum(abs(amount)), 0),
    count(DISTINCT receiver_player_id)
  INTO v_total_tx, v_total_amount, v_unique_players
  FROM public.campaign_transactions t
  WHERE t.board_id = p_board_id
    AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, v_mkt)
    AND t.receiver_player_id IS NOT NULL
    AND t.receiver_player_id <> ''
    AND t.receiver_player_id <> v_mkt;

  SELECT
    count(*) FILTER (
      WHERE public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt)
        AND NOT coalesce(t.is_bonus, false)
    ),
    count(*) FILTER (
      WHERE NOT public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt)
        AND coalesce(t.is_bonus, false)
    ),
    count(*) FILTER (
      WHERE public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt)
        AND coalesce(t.is_bonus, false)
    )
  INTO v_only_mkt, v_only_bonus, v_both
  FROM public.campaign_transactions t
  WHERE t.board_id = p_board_id
    AND public.crm_is_incentive_transaction(t.sender_player_id, t.is_bonus, v_mkt)
    AND t.receiver_player_id IS NOT NULL
    AND t.receiver_player_id <> ''
    AND t.receiver_player_id <> v_mkt;

  RETURN jsonb_build_object(
    'boardId', p_board_id,
    'mktGtPlayerId', v_mkt,
    'insertedMetadata', v_inserted,
    'ativacoesInseridas', v_ativacoes,
    'pendentesInseridos', v_pendentes,
    'totalIncentiveTransfers', v_total_tx,
    'totalIncentiveAmount', v_total_amount,
    'totalMktGtTransfers', v_total_tx,
    'totalMktGtAmount', v_total_amount,
    'uniqueReceivers', v_unique_players,
    'onlyMktGt', v_only_mkt,
    'onlyBonus', v_only_bonus,
    'mktGtAndBonus', v_both,
    'ativacoesTotais', (
      SELECT count(*) FROM public.crm_incentive_metadata
      WHERE board_id = p_board_id AND classification = 'ativacao'
    ),
    'pendentesTotais', (
      SELECT count(*) FROM public.crm_incentive_metadata
      WHERE board_id = p_board_id AND classification = 'pendente'
    ),
    'relacionamentoTotais', (
      SELECT count(*) FROM public.crm_incentive_metadata
      WHERE board_id = p_board_id AND classification = 'relacionamento'
    ),
    'acaoTotais', (
      SELECT count(*) FROM public.crm_incentive_metadata
      WHERE board_id = p_board_id AND classification = 'acao'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_campaign_transaction_import(jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_campaign_transaction_import(jsonb, text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.append_campaign_transactions(text, text, jsonb, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_campaign_transactions(text, text, jsonb, int, int) TO authenticated;

REVOKE ALL ON FUNCTION public.finalize_campaign_transaction_import(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_campaign_transaction_import(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.crm_backfill_incentive_classifications(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_backfill_incentive_classifications(text) TO authenticated;
