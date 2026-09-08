import type { ImeResult } from "./types";

export async function sendTelegramAlert(
  chatId: string,
  result: ImeResult
): Promise<{ ok: boolean; error?: string }> {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const TELEGRAM_API_KEY = process.env["TELEGRAM_API_KEY"];
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    return { ok: false, error: "Telegram connection is not linked to this project yet." };
  }

  const d = result.decision;
  const lines = [
    `<b>IME Signal: ${result.symbol}</b>`,
    ``,
    `<b>Action:</b> ${d.action}`,
    `<b>Risk:</b> ${d.risk}`,
  ];
  if (d.entry !== undefined) lines.push(`<b>Entry:</b> ${d.entry}`);
  if (d.stop !== undefined) lines.push(`<b>Stop:</b> ${d.stop}`);
  if (d.target !== undefined) lines.push(`<b>Target:</b> ${d.target}`);
  lines.push(``, `<b>Regime:</b> ${result.analysis.marketMaker.market_regime} (${result.analysis.marketMaker.trend})`);
  lines.push(`<b>Momentum:</b> ${result.analysis.movement.momentum_state} | <b>Vol:</b> ${result.analysis.movement.volatility_state}`);
  lines.push(``, d.reason);

  try {
    const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "HTML",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      const err = body.description ?? JSON.stringify(body);
      console.error(`Telegram sendMessage failed [${res.status}]: ${err}`);
      return { ok: false, error: `Telegram error [${res.status}]: ${err}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("Telegram sendMessage error:", e);
    return { ok: false, error: String(e) };
  }
}
