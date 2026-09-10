CREATE TABLE IF NOT EXISTS public.ime_cron_tokens (
  id int PRIMARY KEY DEFAULT 1,
  token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ime_cron_tokens TO service_role;
ALTER TABLE public.ime_cron_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No client access to cron tokens" ON public.ime_cron_tokens FOR ALL TO authenticated USING (false) WITH CHECK (false);
INSERT INTO public.ime_cron_tokens (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "No client access to bot users" ON public.ime_bot_users FOR ALL TO authenticated USING (false) WITH CHECK (false);

SELECT cron.unschedule('ime-auto-alerts') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ime-auto-alerts');

SELECT cron.schedule(
  'ime-auto-alerts',
  '*/30 13-20 * * 1-5',
  $$
  select net.http_post(
    url := 'https://project--a456cd29-53bb-4519-b739-eda9319a9308-dev.lovable.app/api/public/ime/broadcast',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select token from public.ime_cron_tokens where id = 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
