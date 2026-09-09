import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyzeStock } from "./engine";
import { getStockData } from "./market-data.server";
import { sendTelegramAlert } from "./telegram.server";
import type { StockData } from "./types";

export const getWatchlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ime_symbols")
      .select("id, symbol, active, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addSymbol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { symbol: string }) =>
    z.object({ symbol: z.string().min(1).max(12) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const symbol = data.symbol.trim().toUpperCase();
    const { error } = await context.supabase
      .from("ime_symbols")
      .upsert({ user_id: context.userId, symbol, active: true }, { onConflict: "user_id,symbol" });
    if (error) throw new Error(error.message);
    return { symbol };
  });

export const removeSymbol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ime_symbols").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ime_settings")
      .select("telegram_chat_id, alerts_enabled, alert_actions")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { telegram_chat_id: null, alerts_enabled: true, alert_actions: ["AGGRESSIVE_ENTRY", "CONSERVATIVE_ENTRY"] };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { telegram_chat_id: string | null; alerts_enabled: boolean }) =>
    z
      .object({ telegram_chat_id: z.string().nullable(), alerts_enabled: z.boolean() })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("ime_settings").upsert(
      {
        user_id: context.userId,
        telegram_chat_id: data.telegram_chat_id?.trim() || null,
        alerts_enabled: data.alerts_enabled,
      },
      { onConflict: "user_id" }
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { symbols?: string[] }) =>
    z.object({ symbols: z.array(z.string()).optional() }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    let symbols = data.symbols?.map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols?.length) {
      const { data: rows, error } = await context.supabase
        .from("ime_symbols")
        .select("symbol")
        .eq("active", true);
      if (error) throw new Error(error.message);
      symbols = (rows ?? []).map((r: { symbol: string }) => r.symbol);
    }
    if (!symbols.length) return { results: [], source: "none", alerts: [] as string[] };

    const { data: settings } = await context.supabase
      .from("ime_settings")
      .select("telegram_chat_id, alerts_enabled, alert_actions")
      .eq("user_id", context.userId)
      .maybeSingle();

    const alertNotes: string[] = [];
    let source = "simulated";
    const results = [];

    for (const symbol of symbols) {
      const { data: stockData, source: src } = await getStockData(symbol);
      source = src;
      const result = analyzeStock(stockData);

      let alertSent = false;
      if (
        settings?.alerts_enabled &&
        settings.telegram_chat_id &&
        (settings.alert_actions ?? []).includes(result.decision.action)
      ) {
        const alert = await sendTelegramAlert(settings.telegram_chat_id, result);
        alertSent = alert.ok;
        if (!alert.ok) alertNotes.push(`${symbol}: ${alert.error}`);
      }

      const { error: insertError } = await context.supabase.from("ime_decisions").insert({
        user_id: context.userId,
        symbol: result.symbol,
        action: result.decision.action,
        reason: result.decision.reason,
        entry: result.decision.entry ?? null,
        stop: result.decision.stop ?? null,
        target: result.decision.target ?? null,
        risk: result.decision.risk,
        analysis: result.analysis,
        raw_data: JSON.parse(JSON.stringify(stockData)),
        alert_sent: alertSent,
      });
      if (insertError) throw new Error(insertError.message);
      results.push(result);
    }

    return { results, source, alerts: alertNotes };
  });

export const analyzeManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stockData: StockData }) => {
    const parsed = z.object({ stockData: z.record(z.string(), z.unknown()) }).parse(input);
    return parsed as unknown as { stockData: StockData };
  })
  .handler(async ({ data }) => {
    return analyzeStock(data.stockData);
  });

export const getHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ime_decisions")
      .select("id, symbol, action, reason, entry, stop, target, risk, alert_sent, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
