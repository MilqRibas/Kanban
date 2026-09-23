-- Não gravar mais o JSON bruto da planilha em campaign_transactions.raw
-- (~67 MB duplicando colunas já tipadas). Limpa o histórico e força NULL nos inserts.

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
    NULL,
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
    raw = NULL;

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

UPDATE public.campaign_transactions
SET raw = NULL
WHERE raw IS NOT NULL;
