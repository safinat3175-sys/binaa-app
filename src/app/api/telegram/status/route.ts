import { isTelegramConfigured } from "@/lib/telegram";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const publicCheck = url.searchParams.get("public") === "1";
  if (!publicCheck) {
    const auth = await requireAdmin(req);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const configured = isTelegramConfigured();
  let botInfo: Record<string, unknown> | null = null;
  if (configured) {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN!;
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await res.json();
      if (data.ok) botInfo = { username: data.result.username, name: data.result.first_name };
    } catch {
      botInfo = null;
    }
  }
  return Response.json({
    configured,
    mode: configured ? "live" : "simulated",
    bot: botInfo,
    webhookUrl: "/api/telegram/webhook",
    instructions: configured
      ? "Bot is live. Approvals will send real Telegram messages."
      : "TELEGRAM_BOT_TOKEN not set — approvals are logged as 'simulated'. Set the env var to go live (see Admin → Telegram).",
  });
}
