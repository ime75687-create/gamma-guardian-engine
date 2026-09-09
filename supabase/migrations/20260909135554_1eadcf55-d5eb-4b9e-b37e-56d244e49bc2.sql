CREATE TABLE public.ime_bot_users (
  chat_id TEXT PRIMARY KEY,
  first_name TEXT,
  username TEXT,
  analysis_type TEXT NOT NULL DEFAULT 'QUICK',
  focus TEXT NOT NULL DEFAULT 'ALL',
  subscribed BOOLEAN NOT NULL DEFAULT true,
  state TEXT,
  symbols TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.ime_bot_users TO service_role;

ALTER TABLE public.ime_bot_users ENABLE ROW LEVEL SECURITY;