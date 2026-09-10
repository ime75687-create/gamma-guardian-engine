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
- [x] Gamma/Delta simulation from Finnhub: deterministic scores from daily range + RSI (gamma = range%*0.8 + (RSI-50)/200; delta = price vs prev close). Finnhub data can now yield AGGRESSIVE_ENTRY (gamma>0.35 & delta>2% & bullish) and CONSERVATIVE_ENTRY; reasons flag "simulated — no real options data". Real MenthorQ gamma still takes priority when available
- [x] Symbol universe added (src/lib/ime/universe.ts): TECH / INDEX / ENERGY / FINANCE lists
- [x] Telegram bot: interactive webhook (/api/public/telegram/webhook) with per-user analysis type (QUICK/FULL) and focus, stored in ime_bot_users; commands /start /market /news /help; inline menus in Arabic
- [x] Market news via Finnhub (general + per-symbol)
- [x] Broadcast endpoint /api/public/ime/broadcast (x-cron-secret) sends entry signals to subscribed bot users
- [x] Finnhub free-plan fallback: RSI endpoint is 403, momentum + liquidity now derived deterministically from the quote (day-range position + % change)
- [ ] Optional: schedule the broadcast endpoint (pg_cron) for automatic periodic alerts

## Trade horizon + options (done)
- [x] Telegram users pick horizon: DAY / WEEK / MONTH (ime_bot_users.horizon)
- [x] Deterministic option contract suggestion (type, strike, expiry, premium est, contract stop/target) in src/lib/ime/options.ts
- [x] Auto-push entry signals every 30 min, Mon-Fri 13-20 UTC via pg_cron -> /api/public/ime/broadcast (x-cron-token from ime_cron_tokens)
- [x] Per-day dedup of alerts in ime_bot_alerts
