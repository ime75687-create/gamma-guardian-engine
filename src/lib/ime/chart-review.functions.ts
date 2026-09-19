import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  /** data:image/...;base64,... of the uploaded chart screenshot */
  image: z.string().startsWith("data:image/").max(8_000_000),
  symbol: z.string().max(16).optional(),
  context: z.string().max(4000).optional(),
});

const SYSTEM = `You are the risk desk of IME, a trading decision engine.
A trader gives you a chart screenshot plus written market context.
Return a concise risk review in Arabic with these sections, using plain text headings:
1) ما يظهر في الشارت (levels, structure, trend, volume clues you can actually see)
2) مخاطر السكالب (دقائق) — at least 3 concrete risks with the price levels that invalidate the idea
3) مخاطر المضاربة اليومية — at least 3 concrete risks, include gap/news/session risk
4) مستويات حرجة — support/resistance/stop zones read off the chart
5) الخلاصة — one line: is the setup worth risking, and what must happen first
Rules: never invent data you cannot see or that was not given. Say "غير واضح من الشارت" when unsure.
Never promise profit. Keep it under 300 words. This is analysis, not financial advice.`;

export const reviewChart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this project yet.");

    const userText = [
      data.symbol ? `الرمز: ${data.symbol}` : null,
      data.context ? `سياق السوق من المتداول: ${data.context}` : null,
      "حلّل مخاطر السكالب والمضاربة اليومية على هذا الشارت.",
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        instructions: SYSTEM,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: userText },
              { type: "input_image", image_url: data.image },
            ],
          },
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("طلبات كثيرة على المحرك، جرّب بعد دقيقة.");
      if (res.status === 402)
        throw new Error("رصيد الذكاء الاصطناعي انتهى — أضف رصيداً للمساحة لمتابعة التحليل.");
      console.error("chart review gateway error", res.status, detail.slice(0, 500));
      throw new Error("تعذّر تحليل الشارت حالياً.");
    }

    // Reasoning models must stream; accumulate the text server-side.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let reasoning = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload) as { type?: string; delta?: string };
            if (evt.type === "response.output_text.delta" && evt.delta) text += evt.delta;
            else if (evt.type === "response.reasoning_summary_text.delta" && evt.delta)
              reasoning += evt.delta;
          } catch {
            /* ignore partial frames */
          }
        }
      }
    }

    const summary = text.trim() || reasoning.trim();
    if (!summary) throw new Error("ما وصلنا تحليل من المحرك، جرّب مرة ثانية.");
    return { summary };
  });
