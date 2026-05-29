
CREATE TABLE public.webhook_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL DEFAULT 'pagarme',
  event_type text,
  pagarme_order_id text,
  pagarme_charge_id text,
  venda_id uuid,
  http_status integer,
  auth_ok boolean,
  ip text,
  headers jsonb,
  payload jsonb,
  response jsonb,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs (created_at DESC);
CREATE INDEX idx_webhook_logs_event_type ON public.webhook_logs (event_type);
CREATE INDEX idx_webhook_logs_order ON public.webhook_logs (pagarme_order_id);

GRANT SELECT ON public.webhook_logs TO authenticated;
GRANT ALL ON public.webhook_logs TO service_role;

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_logs_super_admin_select"
ON public.webhook_logs
FOR SELECT
TO authenticated
USING (public.is_super_admin());
