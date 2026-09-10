ALTER TABLE public.ime_bot_users ADD COLUMN IF NOT EXISTS horizon text NOT NULL DEFAULT 'DAY';

CREATE TABLE IF NOT EXISTS public.ime_bot_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  symbol text NOT NULL,
  action text NOT NULL,
  horizon text NOT NULL,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, symbol, action, horizon, day)
);

GRANT ALL ON public.ime_bot_alerts TO service_role;
ALTER TABLE public.ime_bot_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct access to bot alerts" ON public.ime_bot_alerts FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
