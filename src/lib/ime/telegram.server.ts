import type { ImeResult } from "./types";

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

export interface InlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

function keys() {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const TELEGRAM_API_KEY = process.env["TELEGRAM_API_KEY"];
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return null;
  return { LOVABLE_API_KEY, TELEGRAM_API_KEY };
}

export async function telegramCall(
  method: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const k = keys();
  if (!k) return { ok: false, error: "Telegram connection is not linked to this project yet." };
  try {
    const res = await fetch(`${GATEWAY}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${k.LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": k.TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
      result?: unknown;
    };
    if (!res.ok || json.ok === false) {
      const err = json.description ?? JSON.stringify(json);
      console.error(`Telegram ${method} failed [${res.status}]: ${err}`);
      return { ok: false, error: `Telegram error [${res.status}]: ${err}` };
    }
    return { ok: true, result: json.result };
  } catch (e) {
    console.error(`Telegram ${method} error:`, e);
    return { ok: false, error: String(e) };
  }
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  keyboard?: InlineKeyboard
) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

export function formatDecision(result: ImeResult, full: boolean): string {
  const d = result.decision;
  const actionLabel: Record<string, string> = {
    AGGRESSIVE_ENTRY: "🚀 دخول قوي",
    CONSERVATIVE_ENTRY: "✅ دخول متحفظ",
    WATCH: "👀 مراقبة",
    AVOID: "⛔ تجنّب",
  };
  const riskLabel: Record<string, string> = { HIGH: "مرتفعة", NORMAL: "عادية", LOW: "منخفضة" };
  const lines = [
    `<b>${result.symbol}</b> — ${actionLabel[d.action] ?? d.action}`,
    `المخاطرة: ${riskLabel[d.risk] ?? d.risk}`,
  ];
  if (d.entry !== undefined) lines.push(`دخول: <code>${d.entry}</code>`);
  if (d.stop !== undefined) lines.push(`وقف: <code>${d.stop}</code>`);
  if (d.target !== undefined) lines.push(`هدف: <code>${d.target}</code>`);
  if (full) {
    const a = result.analysis;
    lines.push(
      "",
      `النظام: ${a.marketMaker.market_regime === "NEGATIVE_GAMMA" ? "جاما سالبة" : "جاما موجبة"} | الاتجاه: ${
        a.marketMaker.trend === "BULLISH" ? "صاعد" : a.marketMaker.trend === "BEARISH" ? "هابط" : "محايد"
      }`,
      `الزخم: ${a.movement.momentum_state} | التذبذب: ${a.movement.volatility_state}`,
      `السلوك: ${a.behavior.behavior_state === "STABLE" ? "مستقر" : "غير مستقر"} | السيولة: ${a.liquidity.state}`,
      "",
      d.reason
    );
  }
  return lines.join("\n");
}

export async function sendTelegramAlert(
  chatId: string,
  result: ImeResult
): Promise<{ ok: boolean; error?: string }> {
  const res = await sendTelegramMessage(chatId, formatDecision(result, true));
  return res.ok ? { ok: true } : { ok: false, error: res.error ?? "unknown" };
}
