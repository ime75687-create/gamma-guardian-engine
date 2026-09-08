CREATE TABLE public.ime_symbols (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ime_symbols TO authenticated;
GRANT ALL ON public.ime_symbols TO service_role;
ALTER TABLE public.ime_symbols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own symbols" ON public.ime_symbols FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ime_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  entry NUMERIC,
  stop NUMERIC,
  target NUMERIC,
  risk TEXT,
  analysis JSONB NOT NULL,
  raw_data JSONB,
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ime_decisions TO authenticated;
GRANT ALL ON public.ime_decisions TO service_role;
ALTER TABLE public.ime_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own decisions" ON public.ime_decisions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.ime_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  telegram_chat_id TEXT,
  alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  alert_actions TEXT[] NOT NULL DEFAULT ARRAY['AGGRESSIVE_ENTRY','CONSERVATIVE_ENTRY'],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ime_settings TO authenticated;
GRANT ALL ON public.ime_settings TO service_role;
ALTER TABLE public.ime_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own settings" ON public.ime_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);