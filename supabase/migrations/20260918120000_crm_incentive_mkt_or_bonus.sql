-- Etapa 2 fechamento: Incentivo Enviado = MKT GT (sender) OR Bônus, com dedupe por TX.
-- Não altera sender_player_id artificialmente. Não usa Agent ID.

-- Sempre boolean true/false (nunca NULL) para OR/FILTER seguros.
CREATE OR REPLACE FUNCTION public.crm_is_mkt_gt_transfer(
  p_sender_player_id text,
  p_mkt_gt_player_id text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT (
    nullif(trim(coalesce(p_sender_player_id, '')), '')
      = nullif(trim(coalesce(p_mkt_gt_player_id, '')), '')
    AND nullif(trim(coalesce(p_mkt_gt_player_id, '')), '') IS NOT NULL
  ) IS TRUE;
$$;

CREATE OR REPLACE FUNCTION public.crm_is_incentive_transaction(
  p_sender_player_id text,
  p_is_bonus boolean,
  p_mkt_gt_player_id text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT
    public.crm_is_mkt_gt_transfer(p_sender_player_id, p_mkt_gt_player_id)
    OR coalesce(p_is_bonus, false);
$$;

REVOKE ALL ON FUNCTION public.crm_is_incentive_transaction(text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_is_incentive_transaction(text, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: universo = incentivo (MKT GT OR Bônus); 1ª cronológica = ativacao
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_backfill_incentive_classifications(p_board_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.crm_backfill_incentive_classifications(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_backfill_incentive_classifications(text) TO authenticated;
