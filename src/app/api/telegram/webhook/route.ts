import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { deliverOtp, hasPendingOtp, issueOtp, normalizeDzPhone } from "@/lib/otp";
import {
  getWebhookSecret,
  isTelegramConfigured,
  removeKeyboard,
  requestContactKeyboard,
  sendTelegramMessage,
} from "@/lib/telegram";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────
   SECURE TELEGRAM WEBHOOK — STRICT PRIVACY POLICY

   ✔ Spoof-proof: every request must carry the
     `X-Telegram-Bot-Api-Secret-Token` header equal to
     TELEGRAM_WEBHOOK_SECRET (set via setWebhook). Fails CLOSED if the
     secret is not configured.
   ✔ The bot ONLY does two things here:
       a) links a chat_id to an account after Telegram proves ownership
          (deep-link token issued by the website, or a `request_contact`
          share whose contact.user_id === sender id), and
       b) sends the 6-digit OTP to THAT chat only.
   ✘ No /list, /workers, /projects, /register, phone-typing, or any
     command that reads or reveals other users' data.
   ✘ No admin commands (admin actions live behind the web portal login).
   ────────────────────────────────────────────────────────────────── */

type TgUpdate = {
  message?: {
    message_id: number;
    chat?: { id: number; type?: string };
    from?: { id: number; is_bot?: boolean };
    text?: string;
    contact?: { phone_number: string; user_id?: number; first_name?: string };
  };
};

const MSG = {
  start:
    "👷 <b>أهلاً بك في بناء | Binaa</b>\n\n" +
    "هذا البوت يرسل <b>رمز التحقق</b> و<b>إشعارات المطابقة</b> فقط.\n" +
    "لتأكيد رقمك اضغط الزر أدناه.",
  linked: "✅ تم ربط حسابك بهذا التيليغرام.",
  noPending: "ارجع إلى الموقع واضغط «دخول / إرسال الرمز» ليصلك الرمز هنا.",
  notFound: "لم نجد حساباً بهذا الرقم. سجّل أولاً في الموقع ثم أعد المحاولة.",
  mismatch: "الرقم لا يطابق أي حساب على الموقع.",
  notYours: "⚠️ يمكنك مشاركة رقمك أنت فقط.",
  linkExpired: "انتهت صلاحية الرابط. ارجع إلى الموقع واضغط «إرسال الرمز» مجدداً.",
  help:
    "الأوامر المتاحة:\n/start — ربط حسابك واستلام الرمز\n/help — المساعدة\n\n" +
    "لا يعرض هذا البوت أي بيانات أو أرقام. الهواتف تُرسل فقط بعد موافقة الإدارة على مطابقة.",
  fallback: "هذا البوت مخصص لرموز التحقق والإشعارات فقط. أرسل /start للمتابعة.",
};

export async function POST(req: Request) {
  // 1) Authenticate the webhook call — fail closed.
  const secret = getWebhookSecret();
  if (!secret) {
    return Response.json({ error: "Webhook disabled: TELEGRAM_WEBHOOK_SECRET not set" }, { status: 503 });
  }
  const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (given.length !== secret.length || !safeEq(given, secret)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isTelegramConfigured()) return Response.json({ ok: true });

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return Response.json({ ok: true });
  }

  const msg = update.message;
  const chatId = msg?.chat?.id;
  const fromId = msg?.from?.id;
  // Only private chats from humans.
  if (!msg || !chatId || !fromId || msg.from?.is_bot || (msg.chat?.type && msg.chat.type !== "private")) {
    return Response.json({ ok: true });
  }
  const chat = String(chatId);
  const text = (msg.text ?? "").trim();

  /* ── A) Contact shared via request_contact button ─────────────── */
  if (msg.contact) {
    // Telegram sets contact.user_id when the shared contact is a Telegram user.
    // Require it to be the sender → cannot forward someone else's contact.
    if (msg.contact.user_id !== fromId) {
      await sendTelegramMessage(chat, MSG.notYours, requestContactKeyboard);
      return Response.json({ ok: true });
    }
    const phone = normalizeDzPhone(msg.contact.phone_number);
    const user = phone ? (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0] : undefined;
    if (!user || user.role === "admin") {
      await sendTelegramMessage(chat, MSG.notFound, removeKeyboard);
      return Response.json({ ok: true });
    }
    await linkAndSendOtp(user.id, chat);
    return Response.json({ ok: true });
  }

  /* ── B) /start [deep-link token] ──────────────────────────────── */
  if (text.startsWith("/start")) {
    const payload = text.slice(6).trim();
    if (/^[a-f0-9]{40}$/.test(payload)) {
      const user = (
        await db
          .select()
          .from(users)
          .where(and(eq(users.telegramLinkToken, payload), gt(users.telegramLinkExpiry, new Date())))
          .limit(1)
      )[0];
      if (!user) {
        await sendTelegramMessage(chat, MSG.linkExpired, requestContactKeyboard);
        return Response.json({ ok: true });
      }
      await linkAndSendOtp(user.id, chat);
      return Response.json({ ok: true });
    }
    await sendTelegramMessage(chat, MSG.start, requestContactKeyboard);
    return Response.json({ ok: true });
  }

  if (text.startsWith("/help")) {
    await sendTelegramMessage(chat, MSG.help);
    return Response.json({ ok: true });
  }

  // Anything else (including typed phone numbers) → no action, no data.
  await sendTelegramMessage(chat, MSG.fallback, requestContactKeyboard);
  return Response.json({ ok: true });
}

/** Bind chat_id to the account, then (re)issue and send a fresh OTP if one is pending. */
async function linkAndSendOtp(userId: string, chat: string) {
  await db.update(users).set({ telegramId: chat }).where(eq(users.id, userId));
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) return;

  if (hasPendingOtp(user)) {
    // The original code is only stored hashed → issue a new one and deliver it.
    const { code } = await issueOtp(user.id);
    await sendTelegramMessage(chat, MSG.linked, removeKeyboard);
    await deliverOtp({ id: user.id, telegramId: chat }, code);
  } else {
    await sendTelegramMessage(chat, `${MSG.linked}\n${MSG.noPending}`, removeKeyboard);
  }
}

function safeEq(a: string, b: string): boolean {
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// GET exposes nothing but liveness.
export async function GET() {
  return Response.json({ ok: true, secured: !!getWebhookSecret() });
}
