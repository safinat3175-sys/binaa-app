import { db } from "@/db";
import { notificationLogs } from "@/db/schema";

/* ──────────────────────────────────────────────────────────────────
   STRICT BOT POLICY
   The bot is ONLY:
     1. an OTP sender (to the chat that proved ownership of a phone), and
     2. a targeted notification dispatcher (admin "Approve" → private
        message to the matched worker / contractor chat_id).
   It never lists users, phones, or projects. See /api/telegram/webhook.
   ────────────────────────────────────────────────────────────────── */

export function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}
export function isTelegramConfigured(): boolean {
  return !!getBotToken();
}
export function getWebhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
}

type TgApiResult<T> = { ok: boolean; result?: T; description?: string };

async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<TgApiResult<T>> {
  const token = getBotToken();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN not set" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as TgApiResult<T>;
  } catch (e) {
    return { ok: false, description: e instanceof Error ? e.message : "network error" };
  }
}

/* ── Bot identity (cached) ─────────────────────────────────────── */
let cachedUsername: string | null = null;
export async function getBotUsername(): Promise<string | null> {
  const envName = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  if (envName) return envName;
  if (cachedUsername) return cachedUsername;
  if (!isTelegramConfigured()) return null;
  const r = await tg<{ username: string }>("getMe", {});
  if (r.ok && r.result?.username) cachedUsername = r.result.username;
  return cachedUsername;
}

export async function buildDeepLink(token: string): Promise<string | null> {
  const u = await getBotUsername();
  return u ? `https://t.me/${u}?start=${token}` : null;
}

/* ── Sending ───────────────────────────────────────────────────── */
export interface SendResult {
  ok: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<SendResult> {
  if (!isTelegramConfigured()) return { ok: true, simulated: true };
  const r = await tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId.trim(),
    text,
    parse_mode: "HTML",
    ...extra,
  });
  if (!r.ok) return { ok: false, error: r.description ?? "Telegram error" };
  return { ok: true, messageId: String(r.result?.message_id ?? "") };
}

/** Reply keyboard that asks Telegram to share the user's OWN contact. */
export const requestContactKeyboard = {
  reply_markup: {
    keyboard: [[{ text: "📱 مشاركة رقمي لتأكيد الحساب", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};
export const removeKeyboard = { reply_markup: { remove_keyboard: true } };

/* ── Webhook management (admin only, called from /api/telegram/setup) ── */
export async function setWebhook(url: string, secret: string) {
  return tg("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
}
export async function getWebhookInfo() {
  return tg<Record<string, unknown>>("getWebhookInfo", {});
}

/* ── Message templates ─────────────────────────────────────────── */
export function buildOtpMessage(code: string): string {
  return (
    `🔐 <b>Binaa: ${code}</b>\n\n` +
    `رمز الدخول إلى منصة بناء. صالح لمدة 5 دقائق.\n` +
    `لا تشارك هذا الرمز مع أي شخص — فريق بناء لن يطلبه منك أبداً.`
  );
}

export function buildWorkerMatchMessage(opts: {
  workerName: string;
  contractorName: string;
  contractorPhone: string;
  projectTitle: string;
  wilaya: string;
  dailyWage: number;
}): string {
  return (
    `✅ <b>تمت الموافقة على طلبك</b>\n\n` +
    `🏗️ المشروع: ${opts.projectTitle}\n` +
    `📍 الولاية: ${opts.wilaya}\n` +
    `💰 الأجر اليومي: ${opts.dailyWage} دج\n\n` +
    `📞 <b>هاتف المقاول (${opts.contractorName}):</b> <code>${opts.contractorPhone}</code>\n\n` +
    `اتصل بالمقاول للاتفاق على التفاصيل. — بناء | Binaa`
  );
}

export function buildContractorMatchMessage(opts: {
  contractorName: string;
  workerName: string;
  workerPhone: string;
  workerSpecialty: string;
  projectTitle: string;
}): string {
  return (
    `✅ <b>تمت مطابقة عامل لمشروعك</b>\n\n` +
    `🏗️ المشروع: ${opts.projectTitle}\n` +
    `👷 العامل: ${opts.workerName}\n` +
    `🛠️ التخصص: ${opts.workerSpecialty}\n\n` +
    `📞 <b>هاتف العامل:</b> <code>${opts.workerPhone}</code>\n\n` +
    `اتصل بالعامل للاتفاق. — بناء | Binaa`
  );
}

/* ── Audit log (never stores OTP codes or phone numbers in plaintext) ── */
export async function logNotification(row: {
  applicationId?: string | null;
  recipientRole: string;
  recipientTelegramId: string;
  message: string;
  status: string;
  telegramMessageId?: string | null;
  error?: string | null;
}) {
  await db.insert(notificationLogs).values({
    applicationId: row.applicationId ?? null,
    recipientRole: row.recipientRole,
    recipientTelegramId: row.recipientTelegramId,
    message: row.message,
    status: row.status,
    telegramMessageId: row.telegramMessageId ?? null,
    error: row.error ?? null,
  });
}
