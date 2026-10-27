import { requireAdmin } from "@/lib/auth";
import { getBotUsername, getWebhookInfo, getWebhookSecret, isTelegramConfigured, setWebhook } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** ADMIN — registers the webhook with Telegram using the shared secret header. */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isTelegramConfigured()) return Response.json({ error: "TELEGRAM_BOT_TOKEN غير مضبوط" }, { status: 400 });
  const secret = getWebhookSecret();
  if (!secret || secret.length < 16)
    return Response.json({ error: "اضبط TELEGRAM_WEBHOOK_SECRET (16 حرفاً على الأقل) قبل تفعيل الـ webhook" }, { status: 400 });

  let base = "";
  try {
    const body = (await req.json().catch(() => ({}))) as { url?: string };
    base = String(body.url ?? "").trim();
  } catch {
    /* ignore */
  }
  if (!base) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    base = `${proto}://${host}`;
  }
  if (!/^https:\/\//.test(base)) return Response.json({ error: "Telegram يتطلب HTTPS" }, { status: 400 });

  const url = `${base.replace(/\/$/, "")}/api/telegram/webhook`;
  const r = await setWebhook(url, secret);
  return Response.json({ ok: r.ok, url, description: r.description ?? null, bot: await getBotUsername() });
}

/** ADMIN — current webhook state. */
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const info = isTelegramConfigured() ? await getWebhookInfo() : null;
  return Response.json({
    configured: isTelegramConfigured(),
    secretSet: !!getWebhookSecret(),
    bot: await getBotUsername(),
    webhook: info?.result ?? null,
  });
}
