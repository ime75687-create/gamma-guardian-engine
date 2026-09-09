import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { handleTelegramUpdate } from "@/lib/ime/bot.server";

function deriveSecret(apiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${apiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const TELEGRAM_API_KEY = process.env["TELEGRAM_API_KEY"];
        if (!TELEGRAM_API_KEY) return new Response("Not configured", { status: 500 });

        const expected = deriveSecret(TELEGRAM_API_KEY);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

        const update = (await request.json()) as Record<string, unknown>;
        try {
          await handleTelegramUpdate(update);
        } catch (e) {
          console.error("Telegram update handling failed:", e);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
