-- Diagnóstico: presença da conta MKT GT (1092502) nos dados de TX já importados.
-- Não altera regras econômicas de Campanhas nem inventa mapeamento de remetente.

CREATE OR REPLACE FUNCTION public.crm_diagnose_mkt_gt_presence(p_board_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH s AS (
    SELECT mkt_gt_player_id FROM public.crm_get_economic_settings(p_board_id)
  )
  SELECT jsonb_build_object(
    'boardId', p_board_id,
    'mktGtPlayerId', (SELECT mkt_gt_player_id FROM s),
    'inMaster', EXISTS (
      SELECT 1 FROM public.campaign_players p, s
      WHERE p.board_id = p_board_id AND p.player_id = s.mkt_gt_player_id
    ),
    'asReceiver', (
      SELECT count(*)::int FROM public.campaign_transactions t, s
      WHERE t.board_id = p_board_id AND t.receiver_player_id = s.mkt_gt_player_id
    ),
    'asAgent', (
      SELECT count(*)::int FROM public.campaign_transactions t, s
      WHERE t.board_id = p_board_id AND t.agent_id = s.mkt_gt_player_id
    ),
    'asSender', (
      SELECT count(*)::int FROM public.campaign_transactions t, s
      WHERE t.board_id = p_board_id AND t.sender_player_id = s.mkt_gt_player_id
    ),
    'rawTextHits', (
      SELECT count(*)::int FROM public.campaign_transactions t, s
      WHERE t.board_id = p_board_id AND t.raw::text LIKE '%' || s.mkt_gt_player_id || '%'
    ),
    'bonusCount', (
      SELECT count(*)::int FROM public.campaign_transactions t
      WHERE t.board_id = p_board_id AND t.is_bonus
    ),
    'bonusSum', (
      SELECT coalesce(sum(abs(t.amount)), 0)
      FROM public.campaign_transactions t
      WHERE t.board_id = p_board_id AND t.is_bonus
    ),
    'txWithSenderNonNull', (
      SELECT count(*)::int FROM public.campaign_transactions t
      WHERE t.board_id = p_board_id AND t.sender_player_id IS NOT NULL
    ),
    'recognizedHeaderKeys', (
      SELECT coalesce(jsonb_agg(DISTINCT key ORDER BY key), '[]'::jsonb)
      FROM public.campaign_transaction_imports i,
           LATERAL jsonb_object_keys(i.summary->'recognizedHeaders') AS key
      WHERE i.board_id = p_board_id AND i.summary ? 'recognizedHeaders'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.crm_diagnose_mkt_gt_presence(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_diagnose_mkt_gt_presence(text) TO authenticated;
