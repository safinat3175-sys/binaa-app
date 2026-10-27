import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  LINK_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
  deliverOtp,
  issueOtp,
  newLinkToken,
  normalizeDzPhone,
  otpDevEchoEnabled,
} from "@/lib/otp";
import { buildDeepLink, getBotUsername, isTelegramConfigured } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * Step 1 — "Login / Send Code".
 * Body: { name, role: "worker"|"contractor", phone }
 * Creates the account if new, issues a 6-digit OTP (hashed, 5-min expiry),
 * and either sends it to the already-linked Telegram chat or returns a
 * one-time deep link so the bot can link the chat and deliver the code.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 120);
  const roleIn = String(body.role ?? "worker").toLowerCase();
  const phone = normalizeDzPhone(String(body.phone ?? ""));

  if (!phone) return Response.json({ error: "أدخل رقماً جزائرياً صحيحاً (05 / 06 / 07 + 8 أرقام)" }, { status: 400 });
  if (!["worker", "contractor"].includes(roleIn)) return Response.json({ error: "اختر الدور" }, { status: 400 });

  const existing = (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0];
  if (existing?.role === "admin") {
    return Response.json({ error: "حساب الإدارة يسجّل الدخول من /admin" }, { status: 403 });
  }
  if (!existing && name.length < 2) {
    return Response.json({ error: "الاسم مطلوب (حرفان على الأقل)" }, { status: 400 });
  }

  let user = existing;
  if (!user) {
    user = (
      await db
        .insert(users)
        .values({ name, phone, role: roleIn, isVerified: false })
        .returning()
    )[0];
  } else if (existing.otpSentAt && Date.now() - existing.otpSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const retryAfter = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - existing.otpSentAt.getTime())) / 1000);
    return Response.json({ error: `انتظر ${retryAfter} ثانية قبل إعادة الإرسال`, retryAfter }, { status: 429 });
  }

  // Fresh OTP + fresh deep-link token (acts as opaque requestId for polling)
  const { code, expiresAt } = await issueOtp(user.id);
  const linkToken = newLinkToken();
  await db
    .update(users)
    .set({
      telegramLinkToken: linkToken,
      telegramLinkExpiry: new Date(Date.now() + LINK_TTL_MS),
      otpDeliveredAt: null,
      // keep the first-registered name; only fill if it was blank
      ...(user.name.trim().length < 2 && name ? { name } : {}),
    })
    .where(eq(users.id, user.id));

  let delivered: "sent" | "simulated" | "failed" | "pending_link" = "pending_link";
  let deliveryError: string | undefined;
  if (user.telegramId) {
    const r = await deliverOtp(user, code);
    if (r.status === "sent" || r.status === "simulated") delivered = r.status;
    else if (r.status === "failed") {
      delivered = "failed";
      deliveryError = r.error;
    }
  }

  const [deepLink, botUsername] = await Promise.all([buildDeepLink(linkToken), getBotUsername()]);

  return Response.json({
    ok: true,
    requestId: linkToken,
    role: user.role,
    name: user.name,
    telegramLinked: !!user.telegramId,
    delivered,
    deliveryError: deliveryError ?? null,
    deepLink,
    botUsername,
    expiresAt,
    telegramConfigured: isTelegramConfigured(),
    // DEV ONLY: when no bot token is configured there is no way to receive
    // the code, so it is echoed back. Setting TELEGRAM_BOT_TOKEN disables this.
    ...(otpDevEchoEnabled() ? { devCode: code } : {}),
  });
}
