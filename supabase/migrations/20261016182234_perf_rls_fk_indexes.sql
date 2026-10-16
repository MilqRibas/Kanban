-- Performance: RLS initplan em profiles + FKs sem índice (advisor Supabase).

-- auth.uid() reavaliado por linha → (select auth.uid()) uma vez por query
DROP POLICY IF EXISTS "profiles insert own" ON public.profiles;
CREATE POLICY "profiles insert own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
CREATE POLICY "profiles update own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- FKs sem covering index (deletes/joins mais baratos)
CREATE INDEX IF NOT EXISTS card_labels_label_id_idx
  ON public.card_labels (label_id);

CREATE INDEX IF NOT EXISTS card_members_member_id_idx
  ON public.card_members (member_id);

CREATE INDEX IF NOT EXISTS columns_board_id_idx
  ON public.columns (board_id);

CREATE INDEX IF NOT EXISTS comments_author_id_idx
  ON public.comments (author_id);

CREATE INDEX IF NOT EXISTS community_contents_section_id_idx
  ON public.community_contents (section_id);

CREATE INDEX IF NOT EXISTS crm_pipeline_entries_stage_id_idx
  ON public.crm_pipeline_entries (stage_id);

CREATE INDEX IF NOT EXISTS hub_sections_board_id_idx
  ON public.hub_sections (board_id);

CREATE INDEX IF NOT EXISTS labels_board_id_idx
  ON public.labels (board_id);

CREATE INDEX IF NOT EXISTS notes_author_id_idx
  ON public.notes (author_id);

CREATE INDEX IF NOT EXISTS notifications_actor_member_id_idx
  ON public.notifications (actor_member_id);

CREATE INDEX IF NOT EXISTS notifications_board_id_idx
  ON public.notifications (board_id);

CREATE INDEX IF NOT EXISTS notifications_card_id_idx
  ON public.notifications (card_id);

CREATE INDEX IF NOT EXISTS profiles_member_id_idx
  ON public.profiles (member_id);
