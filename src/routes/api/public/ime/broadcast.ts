import { createFileRoute } from "@tanstack/react-router";
import { broadcastAlerts, botSupabase, updateOpenTrades } from "@/lib/ime/bot.server";

async function authorized(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  const cronSecret = process.env["LOVABLE_CRON_SECRET"];
  const provided =
    request.headers.get("x-cron-secret") ?? url.searchParams.get("secret") ?? "";
  if (cronSecret && provided && provided === cronSecret) return true;

  const token = request.headers.get("x-cron-token") ?? "";
  if (!token) return false;
  const { data } = await botSupabase()
    .from("ime_cron_tokens")
    .select("token")
    .eq("id", 1)
    .maybeSingle();
  const expected = (data as { token?: string } | null)?.token;
  return Boolean(expected) && token === expected;
}

export const Route = createFileRoute("/api/public/ime/broadcast")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authorized(request))) return new Response("Unauthorized", { status: 401 });
        const trades = await updateOpenTrades();
        const result = await broadcastAlerts();
        return Response.json({ ok: true, ...result, trades });
      },
    },
  },
});
