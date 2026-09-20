ALTER TABLE public.ime_bot_users
  ADD COLUMN IF NOT EXISTS muted_until timestamptz,
  ADD COLUMN IF NOT EXISTS min_confidence integer NOT NULL DEFAULT 62;

CREATE TABLE public.ime_bot_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  symbol text NOT NULL,
  action text NOT NULL,
  horizon text NOT NULL DEFAULT 'DAY',
  option_idea jsonb,
  entry numeric,
  stop numeric,
  target numeric,
  status text NOT NULL DEFAULT 'SENT',
  last_price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ime_bot_trades TO authenticated;
GRANT ALL ON public.ime_bot_trades TO service_role;

ALTER TABLE public.ime_bot_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to bot trades"
  ON public.ime_bot_trades
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ime_bot_trades_open_idx ON public.ime_bot_trades (status, chat_id);