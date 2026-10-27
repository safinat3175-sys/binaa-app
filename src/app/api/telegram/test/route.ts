import { requireAdmin } from "@/lib/auth";
import { logNotification, sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// ADMIN — send a test message to a Telegram chat id
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const chatId = String(body.chatId ?? "").trim();
  if (!chatId) return Response.json({ error: "chatId required" }, { status: 400 });

  const text =
    `🔧 <b>اختبار بوت جسر البناء</b>\n\n` +
    `إذا وصلك هذا فالبوت يعمل بنجاح ✅\n` +
    `— Jisr El Bina test at ${new Date().toLocaleString("fr-DZ")}`;
  const r = await sendTelegramMessage(chatId, text);
  await logNotification({
    recipientRole: "admin-test",
    recipientTelegramId: chatId,
    message: text,
    status: r.ok ? (r.simulated ? "simulated" : "sent") : "failed",
    telegramMessageId: r.messageId ?? null,
    error: r.error ?? null,
  });
  return Response.json({ ok: r.ok, simulated: r.simulated ?? false, error: r.error ?? null });
}
