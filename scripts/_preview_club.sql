CREATE OR REPLACE FUNCTION public.crm_preview_segment(
  p_board_id text,
  p_definition jsonb,
  p_sample_limit int,
  p_club text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_sample jsonb := '[]'::jsonb;
  r record;
  v_facts jsonb;
  v_club text := CASE
    WHEN p_club IS NULL OR btrim(p_club) = '' OR p_club = 'all' THEN NULL
    WHEN p_club IN ('sx_club', 'xtreme_pro') THEN p_club
    ELSE NULL
  END;
BEGIN
  FOR r IN
    SELECT * FROM public.crm_player_segment_facts(p_board_id)
  LOOP
    IF v_club IS NOT NULL AND NOT (
      EXISTS (
        SELECT 1 FROM public.campaign_player_periods pp
        WHERE pp.board_id = p_board_id AND pp.player_id = r.player_id AND pp.club_code = v_club
      )
      OR EXISTS (
        SELECT 1 FROM public.campaign_transactions t
        WHERE t.board_id = p_board_id AND t.receiver_player_id = r.player_id AND t.club_code = v_club
      )
    ) THEN
      CONTINUE;
    END IF;
    v_facts := to_jsonb(r);
    IF public.crm_player_matches_segment(v_facts, p_definition) THEN
      v_count := v_count + 1;
      IF jsonb_array_length(v_sample) < greatest(coalesce(p_sample_limit, 20), 1) THEN
        v_sample := v_sample || jsonb_build_array(jsonb_build_object(
          'playerId', r.player_id,
          'name', r.name,
          'nickname', r.nickname,
          'incentiveAvailable', r.incentive_available,
          'accumulatedRake', r.accumulated_rake
        ));
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('count', v_count, 'sample', v_sample);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_preview_segment(text, jsonb, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_preview_segment(text, jsonb, int, text) TO authenticated;
