import { requireAdmin } from "@/lib/auth";
import { logNotification, sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// ADMIN — generic secure send endpoint (phones never go through public routes)
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
  const text = String(body.text ?? "").trim().slice(0, 4000);
  const applicationId = body.applicationId ? String(body.applicationId) : null;
  const role = String(body.role ?? "manual");
  if (!chatId || !text) return Response.json({ error: "chatId and text required" }, { status: 400 });

  const r = await sendTelegramMessage(chatId, text);
  await logNotification({
    applicationId,
    recipientRole: role,
    recipientTelegramId: chatId,
    message: text,
    status: r.ok ? (r.simulated ? "simulated" : "sent") : "failed",
    telegramMessageId: r.messageId ?? null,
    error: r.error ?? null,
  });
  return Response.json({ ok: r.ok, simulated: r.simulated ?? false, error: r.error ?? null });
}
