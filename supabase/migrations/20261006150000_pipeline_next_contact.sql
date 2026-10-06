ALTER TABLE public.crm_pipeline_entries
  ADD COLUMN IF NOT EXISTS next_contact_at date;
