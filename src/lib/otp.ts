import { createHash, randomBytes, randomInt } from "crypto";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildOtpMessage, isTelegramConfigured, logNotification, sendTelegramMessage } from "./telegram";

export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const OTP_RESEND_COOLDOWN_MS = 45 * 1000; // 45 seconds
export const OTP_MAX_ATTEMPTS = 5;
export const LINK_TTL_MS = 15 * 60 * 1000; // deep-link token validity

/** Accepts 05xxxxxxxx, +213 6 xx xx xx xx, 00213..., 213... → 0xxxxxxxxx */
export function normalizeDzPhone(raw: string): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00213")) d = d.slice(5);
  else if (d.startsWith("213")) d = d.slice(3);
  if (d.length === 9 && /^[567]/.test(d)) d = "0" + d;
  return /^0[567]\d{8}$/.test(d) ? d : null;
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(userId: string, code: string): string {
  const pepper = process.env.OTP_PEPPER ?? "binaa-otp";
  return createHash("sha256").update(`${userId}:${code}:${pepper}`).digest("hex");
}

export function newLinkToken(): string {
  return randomBytes(20).toString("hex"); // 40 chars — fits Telegram's 64-char start payload
}

/** Stores a fresh hashed OTP on the user and returns the plaintext code (to send). */
export async function issueOtp(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await db
    .update(users)
    .set({ otpCode: hashOtp(userId, code), otpExpiry: expiresAt, otpAttempts: 0, otpSentAt: new Date() })
    .where(eq(users.id, userId));
  return { code, expiresAt };
}

/**
 * Sends the OTP to the user's linked chat_id ONLY.
 * Returns "sent" | "simulated" | "failed" | "unlinked".
 */
export async function deliverOtp(user: Pick<User, "id" | "telegramId">, code: string) {
  if (!user.telegramId) return { status: "unlinked" as const };
  const text = buildOtpMessage(code);
  const r = await sendTelegramMessage(user.telegramId, text);
  const status = r.ok ? (r.simulated ? "simulated" : "sent") : "failed";
  await logNotification({
    recipientRole: "otp",
    recipientTelegramId: user.telegramId,
    message: "🔐 OTP ••••••  (code redacted)",
    status,
    telegramMessageId: r.messageId ?? null,
    error: r.error ?? null,
  });
  if (r.ok) {
    await db.update(users).set({ otpDeliveredAt: new Date() }).where(eq(users.id, user.id));
  }
  return { status, error: r.error };
}

export function hasPendingOtp(u: Pick<User, "otpCode" | "otpExpiry">): boolean {
  return !!u.otpCode && !!u.otpExpiry && u.otpExpiry.getTime() > Date.now();
}

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: "expired" | "locked" | "mismatch" | "none"; attemptsLeft?: number };

export async function verifyOtp(user: User, code: string): Promise<VerifyOutcome> {
  if (!user.otpCode || !user.otpExpiry) return { ok: false, reason: "none" };
  if (user.otpExpiry.getTime() < Date.now()) {
    await clearOtp(user.id);
    return { ok: false, reason: "expired" };
  }
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    await clearOtp(user.id);
    return { ok: false, reason: "locked" };
  }
  const expected = user.otpCode;
  const given = hashOtp(user.id, code.replace(/\D/g, ""));
  if (expected.length !== given.length || !timingSafeEq(expected, given)) {
    const attempts = user.otpAttempts + 1;
    await db.update(users).set({ otpAttempts: attempts }).where(eq(users.id, user.id));
    return { ok: false, reason: "mismatch", attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - attempts) };
  }
  await db
    .update(users)
    .set({
      otpCode: null,
      otpExpiry: null,
      otpAttempts: 0,
      isVerified: true,
      telegramLinkToken: null,
      telegramLinkExpiry: null,
    })
    .where(eq(users.id, user.id));
  return { ok: true };
}

async function clearOtp(userId: string) {
  await db.update(users).set({ otpCode: null, otpExpiry: null, otpAttempts: 0 }).where(eq(users.id, userId));
}

function timingSafeEq(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Echo the OTP back to the browser ONLY in local development without a bot.
 * In production this is always off unless you explicitly set OTP_DEV_ECHO=1
 * (never do that on a public deployment).
 */
export const otpDevEchoEnabled = () =>
  !isTelegramConfigured() && (process.env.NODE_ENV !== "production" || process.env.OTP_DEV_ECHO === "1");
