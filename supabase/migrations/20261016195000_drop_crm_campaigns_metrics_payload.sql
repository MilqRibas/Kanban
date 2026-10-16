-- jsonb_agg monolítico (~4.6s) pior que REST paralelo; função removida.
DROP FUNCTION IF EXISTS public.crm_campaigns_metrics_payload(text);
