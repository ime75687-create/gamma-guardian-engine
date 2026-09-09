import { createFileRoute } from "@tanstack/react-router";
import { broadcastAlerts } from "@/lib/ime/bot.server";

export const Route = createFileRoute("/api/public/ime/broadcast")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        const provided =
          request.headers.get("x-cron-secret") ??
          new URL(request.url).searchParams.get("secret") ??
          "";
        if (!secret || provided !== secret) return new Response("Unauthorized", { status: 401 });
        const result = await broadcastAlerts();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
