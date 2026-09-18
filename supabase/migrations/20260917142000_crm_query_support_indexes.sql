-- Índices de suporte às consultas CRM (idempotentes).
-- Analisados contra índices existentes: evita redundância com
-- campaign_player_periods_player_idx / campaign_tx_player_period_idx / PK de players.

CREATE INDEX IF NOT EXISTS campaign_tx_player_occurred_idx
  ON public.campaign_transactions (board_id, receiver_player_id, occurred_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS campaign_report_imports_board_status_period_idx
  ON public.campaign_report_imports (board_id, status, period_end DESC);

CREATE INDEX IF NOT EXISTS campaign_transaction_imports_board_status_period_idx
  ON public.campaign_transaction_imports (board_id, status, period_end DESC);
