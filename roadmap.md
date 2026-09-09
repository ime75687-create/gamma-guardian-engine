# IME – Integrated Market Engine: Build Roadmap

- [x] DB schema: ime_symbols (watchlist), ime_decisions (history), ime_settings (Telegram chat id, alert prefs)
- [x] Auth: email/password + Google sign-in
- [x] IME engine: 5 deterministic engines (src/lib/ime/engine.ts)
- [x] Market data fetcher: MenthorQ-compatible via MENTHORQ_API_KEY secret; deterministic simulated fallback
- [x] Dashboard: watchlist, run analysis, decision cards, history, manual JSON analysis
- [x] Telegram alerts on AGGRESSIVE_ENTRY / CONSERVATIVE_ENTRY (connector linked)
- [x] Head metadata + verification

Open items (waiting on user):
- Sign up/sign in once in the preview to activate your account
- Add your Telegram chat ID in the Alerts panel (message your bot first, get chat id)
- Optional: provide a MenthorQ (or similar) API key to switch from simulated to live data
- [x] Finnhub integration: FINNHUB_API_KEY saved; live quote + RSI feed the engine (fallback order: MenthorQ → Finnhub → simulated). Engine now runs on Finnhub alone: CONSERVATIVE_ENTRY allowed without gamma data (reason notes the gap); AGGRESSIVE_ENTRY still requires gamma regime (MenthorQ)
