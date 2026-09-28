-- Conflito de import de transações passa a ser por clube.
-- Histórico: um clube só nas linhas daquele import vira club_code do lote.

ALTER TABLE public.campaign_transaction_imports
  ADD COLUMN IF NOT EXISTS club_code text;

ALTER TABLE public.campaign_transaction_imports
  DROP CONSTRAINT IF EXISTS campaign_transaction_imports_club_code_check;

ALTER TABLE public.campaign_transaction_imports
  ADD CONSTRAINT campaign_transaction_imports_club_code_check
  CHECK (club_code IS NULL OR club_code IN ('sx_club', 'xtreme_pro'));

UPDATE public.campaign_transaction_imports i
SET club_code = sub.club
FROM (
  SELECT import_id, min(club_code) AS club
  FROM public.campaign_transactions
  WHERE club_code IS NOT NULL AND club_code <> ''
  GROUP BY import_id
  HAVING count(DISTINCT club_code) = 1
) sub
WHERE i.id = sub.import_id
  AND i.club_code IS NULL;

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
    replaced_import_id, created_at, club_code
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
    COALESCE((p_import->>'created_at')::timestamptz, now()),
    NULLIF(p_import->>'club_code', '')
  );

  RETURN jsonb_build_object(
    'import_id', v_import_id,
    'replaced_deleted_rows', v_deleted,
    'status', 'processing'
  );
END;
$function$;
