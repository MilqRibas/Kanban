-- Etapa 2: motor de incentivos CRM (MKT GT + limite + disponível)
-- Não altera regras econômicas de Campanhas.
-- Divergência documentada: XLSX atual não possui coluna Sender;
-- adicionamos sender_player_id para identificação canônica por Player ID 1092502.

-- ---------------------------------------------------------------------------
-- 1) Coluna sender (nullable) — identidade de quem envia chips
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaign_transactions
  ADD COLUMN IF NOT EXISTS sender_player_id text;

CREATE INDEX IF NOT EXISTS campaign_tx_sender_receiver_idx
  ON public.campaign_transactions (board_id, sender_player_id, receiver_player_id);

-- ---------------------------------------------------------------------------
-- 2) Config econômica por board (fonte única no banco)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_economic_settings (
  board_id text PRIMARY KEY,
  mkt_gt_player_id text NOT NULL DEFAULT '1092502',
  league_fee_rate numeric NOT NULL DEFAULT 0.18
    CHECK (league_fee_rate >= 0 AND league_fee_rate < 1),
  incentive_limit_rate numeric NOT NULL DEFAULT 0.25
    CHECK (incentive_limit_rate >= 0 AND incentive_limit_rate <= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_economic_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_economic_settings_authenticated ON public.crm_economic_settings;
CREATE POLICY crm_economic_settings_authenticated
  ON public.crm_economic_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO public.crm_economic_settings (board_id, mkt_gt_player_id, league_fee_rate, incentive_limit_rate)
VALUES ('board-1', '1092502', 0.18, 0.25)
ON CONFLICT (board_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Metadata CRM (não duplica valor/sender/receiver/timestamp)
-- Chave estável: external_transaction_id (sobrevive replace/reimport)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_incentive_metadata (
  board_id text NOT NULL,
  external_transaction_id text NOT NULL,
  classification text NOT NULL
    CHECK (classification IN ('ativacao', 'relacionamento', 'acao', 'pendente')),
  product text,
  purpose text,
  notes text,
  auto_classified boolean NOT NULL DEFAULT false,
  classified_by text,
  classified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, external_transaction_id)
);

CREATE INDEX IF NOT EXISTS crm_incentive_metadata_class_idx
  ON public.crm_incentive_metadata (board_id, classification);

ALTER TABLE public.crm_incentive_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_incentive_metadata_authenticated ON public.crm_incentive_metadata;
CREATE POLICY crm_incentive_metadata_authenticated
  ON public.crm_incentive_metadata
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4) Auditoria de classificação
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_incentive_classification_audit (
  id bigserial PRIMARY KEY,
  board_id text NOT NULL,
  external_transaction_id text NOT NULL,
  field_name text NOT NULL DEFAULT 'classification',
  old_value text,
  new_value text,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_incentive_audit_tx_idx
  ON public.crm_incentive_classification_audit (board_id, external_transaction_id, changed_at DESC);

ALTER TABLE public.crm_incentive_classification_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_incentive_audit_authenticated ON public.crm_incentive_classification_audit;
CREATE POLICY crm_incentive_audit_authenticated
  ON public.crm_incentive_classification_audit
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5) Helpers econômicos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crm_get_economic_settings(p_board_id text)
RETURNS TABLE (
  mkt_gt_player_id text,
  league_fee_rate numeric,
  incentive_limit_rate numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    coalesce(s.mkt_gt_player_id, '1092502'),
    coalesce(s.league_fee_rate, 0.18),
    coalesce(s.incentive_limit_rate, 0.25)
  FROM (SELECT p_board_id AS board_id) b
  LEFT JOIN public.crm_economic_settings s ON s.board_id = b.board_id;
$$;

CREATE OR REPLACE FUNCTION public.crm_compute_incentive_economics(
  p_rake_bruto numeric,
  p_incentivo_enviado numeric,
  p_league_fee_rate numeric DEFAULT 0.18,
  p_incentive_limit_rate numeric DEFAULT 0.25
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH n AS (
    SELECT
      greatest(coalesce(p_rake_bruto, 0), 0)::numeric AS rake_bruto,
      greatest(coalesce(p_incentivo_enviado, 0), 0)::numeric AS enviado,
      coalesce(p_league_fee_rate, 0.18)::numeric AS league,
      coalesce(p_incentive_limit_rate, 0.25)::numeric AS lim_rate
  )
  SELECT jsonb_build_object(
    'rakeBrutoHistorico', n.rake_bruto,
    'taxaLiga', round(n.rake_bruto * n.league, 6),
    'rakeLiquidoHistorico', round(n.rake_bruto - (n.rake_bruto * n.league), 6),
    'percentualLimite', n.lim_rate,
    'limiteIncentivo', round((n.rake_bruto - (n.rake_bruto * n.league)) * n.lim_rate, 6),
    'incentivoEnviado', n.enviado,
    'incentivoDisponivel', round(
      ((n.rake_bruto - (n.rake_bruto * n.league)) * n.lim_rate) - n.enviado,
      6
    )
  )
  FROM n;
$$;

-- Transferência MKT GT válida: sender_player_id = conta oficial (nunca nickname)
CREATE OR REPLACE FUNCTION public.crm_is_mkt_gt_transfer(
  p_sender_player_id text,
  p_mkt_gt_player_id text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT (
    nullif(trim(coalesce(p_sender_player_id, '')), '')
      = nullif(trim(coalesce(p_mkt_gt_player_id, '')), '')
    AND nullif(trim(coalesce(p_mkt_gt_player_id, '')), '') IS NOT NULL
  ) IS TRUE;
$$;

REVOKE ALL ON FUNCTION public.crm_get_economic_settings(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_get_economic_settings(text) TO authenticated;
REVOKE ALL ON FUNCTION public.crm_compute_incentive_economics(numeric, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_compute_incentive_economics(numeric, numeric, numeric, numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.crm_is_mkt_gt_transfer(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_is_mkt_gt_transfer(text, text) TO authenticated;
