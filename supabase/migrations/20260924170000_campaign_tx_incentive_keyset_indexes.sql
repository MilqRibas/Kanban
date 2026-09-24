-- Busca de ativação (bônus OU remetente MKT) pagina por id.
-- O índice de flags (is_deposit OR is_bonus) não serve para keyset só de bônus,
-- e o de sender não inclui id.

CREATE INDEX IF NOT EXISTS campaign_tx_bonus_id_idx
  ON public.campaign_transactions (board_id, id)
  WHERE is_bonus IS TRUE;

CREATE INDEX IF NOT EXISTS campaign_tx_sender_id_idx
  ON public.campaign_transactions (board_id, sender_player_id, id);
