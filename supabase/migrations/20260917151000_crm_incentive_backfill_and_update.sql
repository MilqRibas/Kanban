-- Etapa 2: backfill classificação + RPCs list/360/update com incentivos

-- ---------------------------------------------------------------------------
-- Backfill idempotente de metadata MKT GT
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
BEGIN
  SELECT mkt_gt_player_id INTO v_mkt
  FROM public.crm_get_economic_settings(p_board_id);

  WITH mkt AS (
    SELECT
      t.external_transaction_id,
      t.receiver_player_id,
      t.amount,
      coalesce(t.occurred_at, t.period_start::timestamptz) AS sort_at,
      t.external_transaction_id AS ext_id
    FROM public.campaign_transactions t
    WHERE t.board_id = p_board_id
      AND public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt)
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
        ORDER BY sort_at ASC NULLS LAST, ext_id ASC
      ) AS rn
    FROM mkt
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

  SELECT count(*), coalesce(sum(abs(amount)), 0), count(DISTINCT receiver_player_id)
  INTO v_total_tx, v_total_amount, v_unique_players
  FROM public.campaign_transactions t
  WHERE t.board_id = p_board_id
    AND public.crm_is_mkt_gt_transfer(t.sender_player_id, v_mkt)
    AND t.receiver_player_id IS NOT NULL
    AND t.receiver_player_id <> ''
    AND t.receiver_player_id <> v_mkt;

  RETURN jsonb_build_object(
    'boardId', p_board_id,
    'mktGtPlayerId', v_mkt,
    'insertedMetadata', v_inserted,
    'ativacoesInseridas', v_ativacoes,
    'pendentesInseridos', v_pendentes,
    'totalMktGtTransfers', v_total_tx,
    'totalMktGtAmount', v_total_amount,
    'uniqueReceivers', v_unique_players,
    'ativacoesTotais', (
      SELECT count(*) FROM public.crm_incentive_metadata
      WHERE board_id = p_board_id AND classification = 'ativacao'
    ),
    'pendentesTotais', (
      SELECT count(*) FROM public.crm_incentive_metadata
      WHERE board_id = p_board_id AND classification = 'pendente'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_backfill_incentive_classifications(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_backfill_incentive_classifications(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Atualizar classificação manual + auditoria
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_update_incentive_classification(
  p_board_id text,
  p_external_transaction_id text,
  p_classification text,
  p_product text DEFAULT NULL,
  p_purpose text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_changed_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_old text;
  v_row public.crm_incentive_metadata%ROWTYPE;
BEGIN
  IF p_classification IS NULL OR p_classification NOT IN ('ativacao', 'relacionamento', 'acao', 'pendente') THEN
    RAISE EXCEPTION 'classification invalid';
  END IF;

  SELECT classification INTO v_old
  FROM public.crm_incentive_metadata
  WHERE board_id = p_board_id AND external_transaction_id = p_external_transaction_id;

  INSERT INTO public.crm_incentive_metadata (
    board_id, external_transaction_id, classification, product, purpose, notes,
    auto_classified, classified_by, classified_at, created_at, updated_at
  ) VALUES (
    p_board_id, p_external_transaction_id, p_classification, p_product, p_purpose, p_notes,
    false, p_changed_by, now(), now(), now()
  )
  ON CONFLICT (board_id, external_transaction_id) DO UPDATE SET
    classification = EXCLUDED.classification,
    product = COALESCE(EXCLUDED.product, public.crm_incentive_metadata.product),
    purpose = COALESCE(EXCLUDED.purpose, public.crm_incentive_metadata.purpose),
    notes = COALESCE(EXCLUDED.notes, public.crm_incentive_metadata.notes),
    auto_classified = false,
    classified_by = EXCLUDED.classified_by,
    classified_at = now(),
    updated_at = now()
  RETURNING * INTO v_row;

  IF v_old IS DISTINCT FROM p_classification THEN
    INSERT INTO public.crm_incentive_classification_audit (
      board_id, external_transaction_id, field_name, old_value, new_value, changed_by, changed_at
    ) VALUES (
      p_board_id, p_external_transaction_id, 'classification', v_old, p_classification, p_changed_by, now()
    );
  END IF;

  RETURN jsonb_build_object(
    'externalTransactionId', v_row.external_transaction_id,
    'classification', v_row.classification,
    'product', v_row.product,
    'purpose', v_row.purpose,
    'notes', v_row.notes,
    'classifiedBy', v_row.classified_by,
    'classifiedAt', v_row.classified_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_update_incentive_classification(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_update_incentive_classification(text, text, text, text, text, text, text) TO authenticated;
