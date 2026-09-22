-- Persistência do case Xtreme/SX via RPC (retorno explícito + grants claros).
-- Tabela crm_club_cases e RLS authenticated já existem.

CREATE OR REPLACE FUNCTION public.crm_upsert_club_case(
  p_board_id text,
  p_club_code text,
  p_investment numeric,
  p_activation_cost numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.crm_club_cases%ROWTYPE;
BEGIN
  IF p_board_id IS NULL OR btrim(p_board_id) = '' THEN
    RAISE EXCEPTION 'board_id obrigatório';
  END IF;
  IF p_club_code IS NULL OR p_club_code NOT IN ('sx_club', 'xtreme_pro') THEN
    RAISE EXCEPTION 'club_code inválido';
  END IF;
  IF p_investment IS NULL OR p_investment < 0 THEN
    RAISE EXCEPTION 'investment inválido';
  END IF;
  IF p_activation_cost IS NULL OR p_activation_cost < 0 THEN
    RAISE EXCEPTION 'activation_cost inválido';
  END IF;

  INSERT INTO public.crm_club_cases (
    board_id, club_code, investment, activation_cost, notes, updated_at
  ) VALUES (
    p_board_id, p_club_code, p_investment, p_activation_cost, p_notes, now()
  )
  ON CONFLICT (board_id, club_code) DO UPDATE SET
    investment = EXCLUDED.investment,
    activation_cost = EXCLUDED.activation_cost,
    notes = EXCLUDED.notes,
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'boardId', v_row.board_id,
    'clubCode', v_row.club_code,
    'investment', v_row.investment,
    'activationCost', v_row.activation_cost,
    'notes', v_row.notes,
    'updatedAt', v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_upsert_club_case(text, text, numeric, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_upsert_club_case(text, text, numeric, numeric, text) TO authenticated;
