import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  addSymbol,
  analyzeManual,
  getHistory,
  getSettings,
  getWatchlist,
  removeSymbol,
  runAnalysis,
  saveSettings,
} from "@/lib/ime/functions";
import type { ImeResult } from "@/lib/ime/types";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "IME – Integrated Market Engine" },
      {
        name: "description",
        content:
          "IME runs five analysis engines over options and market-maker data to produce AGGRESSIVE_ENTRY, CONSERVATIVE_ENTRY, WATCH or AVOID decisions, with Telegram alerts.",
      },
      { property: "og:title", content: "IME – Integrated Market Engine" },
      {
        property: "og:description",
        content: "Deterministic gamma, delta, momentum and liquidity analysis with structured trade decisions and Telegram alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ACTION_STYLES: Record<string, string> = {
  AGGRESSIVE_ENTRY: "bg-bearish/15 text-bearish border-bearish/40",
  CONSERVATIVE_ENTRY: "bg-primary/15 text-primary border-primary/40",
  WATCH: "bg-watch/15 text-watch border-watch/40",
  AVOID: "bg-muted text-muted-foreground border-border",
};

function Badge({ label, tone }: { label: string; tone?: string | undefined }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${tone ?? "bg-secondary text-secondary-foreground border-border"}`}>
      {label}
    </span>
  );
}

function DecisionCard({ r }: { r: ImeResult }) {
  const d = r.decision;
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-lg font-bold">{r.symbol}</span>
        <span className={`rounded-md border px-2 py-1 font-mono text-xs font-bold ${ACTION_STYLES[d.action]}`}>
          {d.action}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{d.reason}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
        <div className="rounded bg-secondary p-2">
          <div className="text-[10px] text-muted-foreground">ENTRY</div>
          {d.entry ?? "—"}
        </div>
        <div className="rounded bg-secondary p-2">
          <div className="text-[10px] text-muted-foreground">STOP</div>
          <span className="text-bearish">{d.stop ?? "—"}</span>
        </div>
        <div className="rounded bg-secondary p-2">
          <div className="text-[10px] text-muted-foreground">TARGET</div>
          <span className="text-primary">{d.target ?? "—"}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge label={r.analysis.marketMaker.market_regime} />
        <Badge
          label={r.analysis.marketMaker.trend}
          tone={r.analysis.marketMaker.trend === "BULLISH" ? "bg-primary/15 text-primary border-primary/40" : r.analysis.marketMaker.trend === "BEARISH" ? "bg-bearish/15 text-bearish border-bearish/40" : undefined}
        />
        <Badge label={`FLIP ${r.analysis.marketMaker.flip_state}`} />
        <Badge label={`MOM ${r.analysis.movement.momentum_state}`} />
        <Badge label={`VOL ${r.analysis.movement.volatility_state}`} />
        <Badge
          label={r.analysis.liquidity.state}
          tone={r.analysis.liquidity.state === "INFLOW" ? "bg-primary/15 text-primary border-primary/40" : r.analysis.liquidity.state === "OUTFLOW" ? "bg-bearish/15 text-bearish border-bearish/40" : undefined}
        />
        <Badge
          label={r.analysis.behavior.behavior_state}
          tone={r.analysis.behavior.behavior_state === "UNSTABLE" ? "bg-bearish/15 text-bearish border-bearish/40" : undefined}
        />
        <Badge label={`RISK ${d.risk}`} />
      </div>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sessionReady, setSessionReady] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [results, setResults] = useState<ImeResult[]>([]);
  const [running, setRunning] = useState(false);
  const [manualJson, setManualJson] = useState("");
  const [manualResult, setManualResult] = useState<ImeResult | null>(null);
  const [chatId, setChatId] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [showManual, setShowManual] = useState(false);

  const runAnalysisFn = useServerFn(runAnalysis);
  const addSymbolFn = useServerFn(addSymbol);
  const removeSymbolFn = useServerFn(removeSymbol);
  const saveSettingsFn = useServerFn(saveSettings);
  const analyzeManualFn = useServerFn(analyzeManual);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/auth" });
      else setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/auth" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const watchlistQuery = useQuery({
    queryKey: ["watchlist"],
    queryFn: () => getWatchlist(),
    enabled: sessionReady,
  });
  const historyQuery = useQuery({
    queryKey: ["history"],
    queryFn: () => getHistory(),
    enabled: sessionReady,
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
    enabled: sessionReady,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setChatId(settingsQuery.data.telegram_chat_id ?? "");
      setAlertsEnabled(settingsQuery.data.alerts_enabled);
    }
  }, [settingsQuery.data]);

  if (!sessionReady) {
    return (
      <div className="grid-bg flex min-h-screen items-center justify-center">
        <div className="terminal-glow font-mono text-primary">IME loading…</div>
      </div>
    );
  }

  const runAll = async () => {
    setRunning(true);
    try {
      const res = await runAnalysisFn({ data: {} });
      setResults(res.results);
      queryClient.invalidateQueries({ queryKey: ["history"] });
      if (res.alerts.length) res.alerts.forEach((a) => toast.warning(a));
      if (res.results.length === 0) toast.info("Add symbols to your watchlist first.");
      else toast.success(`Analyzed ${res.results.length} symbol(s) via ${res.source} data.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;
    try {
      await addSymbolFn({ data: { symbol: newSymbol } });
      setNewSymbol("");
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add symbol");
    }
  };

  const runManual = async () => {
    try {
      const parsed = JSON.parse(manualJson);
      const res = await analyzeManualFn({ data: { stockData: parsed } });
      setManualResult(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid stockData JSON");
    }
  };

  const saveAlertSettings = async () => {
    try {
      await saveSettingsFn({ data: { telegram_chat_id: chatId || null, alerts_enabled: alertsEnabled } });
      toast.success("Alert settings saved.");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings");
    }
  };

  const watchlist = watchlistQuery.data ?? [];
  const history = historyQuery.data ?? [];

  return (
    <div className="grid-bg min-h-screen">
      <header className="border-b bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <span className="terminal-glow font-mono text-xl font-bold text-primary">IME</span>
            <span className="ml-2 text-sm text-muted-foreground">Integrated Market Engine</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runAll}
              disabled={running}
              className="rounded-lg bg-primary px-4 py-2 font-mono text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {running ? "SCANNING…" : "▶ RUN ANALYSIS"}
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded-lg border px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-6">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 font-mono text-xs font-bold tracking-wider text-muted-foreground">WATCHLIST</h2>
            <form onSubmit={add} className="mb-3 flex gap-2">
              <input
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                placeholder="META"
                className="w-full rounded-lg border bg-background px-3 py-1.5 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-ring"
              />
              <button className="rounded-lg bg-secondary px-3 text-sm font-semibold hover:bg-accent">+</button>
            </form>
            <ul className="space-y-1">
              {watchlist.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg bg-secondary px-3 py-1.5 font-mono text-sm">
                  {s.symbol}
                  <button
                    onClick={async () => {
                      await removeSymbolFn({ data: { id: s.id } });
                      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
                    }}
                    className="text-muted-foreground hover:text-bearish"
                  >
                    ×
                  </button>
                </li>
              ))}
              {watchlist.length === 0 && (
                <li className="text-xs text-muted-foreground">No symbols yet — add one above.</li>
              )}
            </ul>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 font-mono text-xs font-bold tracking-wider text-muted-foreground">TELEGRAM ALERTS</h2>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={alertsEnabled} onChange={(e) => setAlertsEnabled(e.target.checked)} />
              Send entry signals
            </label>
            <input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="Telegram chat ID"
              className="mb-2 w-full rounded-lg border bg-background px-3 py-1.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button onClick={saveAlertSettings} className="w-full rounded-lg bg-secondary py-1.5 text-sm font-medium hover:bg-accent">
              Save
            </button>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Alerts fire on AGGRESSIVE_ENTRY and CONSERVATIVE_ENTRY decisions.
            </p>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <button onClick={() => setShowManual(!showManual)} className="w-full text-left font-mono text-xs font-bold tracking-wider text-muted-foreground">
              MANUAL STOCKDATA {showManual ? "▾" : "▸"}
            </button>
            {showManual && (
              <div className="mt-3">
                <textarea
                  value={manualJson}
                  onChange={(e) => setManualJson(e.target.value)}
                  rows={8}
                  placeholder='{"symbol":"META","price":412.2,...}'
                  className="w-full rounded-lg border bg-background p-2 font-mono text-[11px] outline-none focus:ring-2 focus:ring-ring"
                />
                <button onClick={runManual} className="mt-2 w-full rounded-lg bg-secondary py-1.5 text-sm font-medium hover:bg-accent">
                  Analyze JSON
                </button>
              </div>
            )}
          </section>
        </aside>

        <section className="space-y-6">
          {manualResult && (
            <div>
              <h2 className="mb-2 font-mono text-xs font-bold tracking-wider text-muted-foreground">MANUAL RESULT</h2>
              <DecisionCard r={manualResult} />
            </div>
          )}

          <div>
            <h2 className="mb-2 font-mono text-xs font-bold tracking-wider text-muted-foreground">
              LATEST SCAN {results.length > 0 && `(${results.length})`}
            </h2>
            {results.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Add symbols and press RUN ANALYSIS. Until a market-data API key is configured,
                IME uses deterministic simulated data.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {results.map((r) => (
                  <DecisionCard key={r.symbol} r={r} />
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-2 font-mono text-xs font-bold tracking-wider text-muted-foreground">DECISION HISTORY</h2>
            <div className="overflow-hidden rounded-xl border bg-card">
              <table className="w-full text-left text-xs">
                <thead className="bg-secondary font-mono text-[10px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">TIME</th>
                    <th className="px-3 py-2">SYMBOL</th>
                    <th className="px-3 py-2">ACTION</th>
                    <th className="px-3 py-2">E / S / T</th>
                    <th className="px-3 py-2">RISK</th>
                    <th className="px-3 py-2">ALERT</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {history.map((h) => (
                    <tr key={h.id} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(h.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-bold">{h.symbol}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${ACTION_STYLES[h.action]}`}>
                          {h.action}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {h.entry ?? "—"} / {h.stop ?? "—"} / {h.target ?? "—"}
                      </td>
                      <td className="px-3 py-2">{h.risk}</td>
                      <td className="px-3 py-2">{h.alert_sent ? "✓" : "—"}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        No decisions recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
